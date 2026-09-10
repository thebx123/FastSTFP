import SftpClient from "ssh2-sftp-client";
import { loadConfig } from "./src/Config.js";
import { scanDirectory, transferFiles } from "./src/Transfer.js";
import {
  logger,
  runTask,
  formatBytes,
  formatPing,
  formatHighlight,
  RESET,
  BOLD,
  DIM,
  LEVEL_COLORS,
  CATEGORY_COLORS,
  VALUE_COLOR,
  PING_COLOR,
  exitApp,
} from "./src/Logger.js";
import { getSelfProtectionInfo } from "./src/Protection.js";

/**
 * Prints the stylized 24-bit TrueColor ASCII banner for FastSTFP.
 * Strictly complies with zero-emoji standard.
 */
function printBanner(): void {
  const gradient = [
    "\x1b[38;2;0;225;225m",  // Vibrant Cyan
    "\x1b[38;2;0;200;228m",  // Sky Cyan
    "\x1b[38;2;4;170;230m",  // Aqua Blue
    "\x1b[38;2;9;132;227m",  // Royal Ocean Blue
    "\x1b[38;2;12;105;232m", // Deep Ocean
    "\x1b[38;2;15;80;235m",  // Electric Indigo
  ];

  const lines = [
    "███████╗ █████╗ ███████╗████████╗███████╗████████╗███████╗██████╗ ",
    "██╔════╝██╔══██╗██╔════╝╚══██╔══╝██╔════╝╚══██╔══╝██╔════╝██╔══██╗",
    "█████╗  ███████║███████╗   ██║   ███████╗   ██║   █████╗  ██████╔╝",
    "██╔══╝  ██╔══██║╚════██║   ██║   ╚════██║   ██║   ██╔══╝  ██╔═══╝ ",
    "██║     ██║  ██║███████║   ██║   ███████║   ██║   ██║     ██║     ",
    "╚═╝     ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝   ╚═╝   ╚═╝     ╚═╝     ",
  ];

  console.log("");
  for (let i = 0; i < lines.length; i++) {
    console.log(`  ${BOLD}${gradient[i]}${lines[i]}${RESET}`);
  }

  const border = "─".repeat(67);
  console.log(`  ${DIM}${border}${RESET}`);
  console.log(
    `  ${BOLD}\x1b[38;2;0;210;211mFastSTFP${RESET} ${DIM}│${RESET} High-Performance SFTP Sync Engine ${DIM}│${RESET} ${VALUE_COLOR}v1.0.0${RESET}`
  );
  console.log(
    `  ${DIM}Made by Coretify Studio${RESET}`
  );
  console.log(`  ${DIM}${border}${RESET}\n`);
}

/**
 * 5-second countdown with visual updates.
 */
async function startCountdown(seconds: number = 5): Promise<void> {
  const isTTY = Boolean(process.stdout.isTTY);

  for (let remaining = seconds; remaining > 0; remaining--) {
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const now = new Date();
    const timeStr = `${DIM}[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]${RESET}`;
    const catStr = `${BOLD}${CATEGORY_COLORS.System}[System]${RESET}`;
    const badge = ` ${BOLD}${LEVEL_COLORS.info}[i]${RESET}`;
    const countdownSec = `${BOLD}${PING_COLOR}${remaining}s${RESET}`;

    if (isTTY) {
      process.stdout.write(
        `\r\x1b[K${timeStr} ${catStr}${badge} Waiting ${countdownSec} before starting file transfer...`
      );
    } else {
      logger.info("System", `Waiting ${remaining}s before starting transfer...`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (isTTY) {
    process.stdout.write("\r\x1b[K");
  }
  logger.success("System", "Countdown complete. Initiating transfer pipeline.");
}

async function main() {
  // 1. Print FastSTFP Banner
  printBanner();

  // 2. Load and validate manage.json
  const config = await loadConfig("manage.json");

  logger.info(
    "Config",
    `Loaded configuration for target ${formatHighlight.token(config.host + ":" + config.port)} (${config.username})`
  );
  logger.info(
    "Config",
    `Local directory: ${formatHighlight.token(config.localDir)}`
  );
  logger.info(
    "Config",
    `Remote directory: ${formatHighlight.token(config.serverDir)}`
  );

  if (config.ignoreList.length > 0) {
    logger.info(
      "Config",
      `Active exclusion rules: ${formatHighlight.token(config.ignoreList.join(", "))}`
    );
  }

  const selfInfo = getSelfProtectionInfo();
  if (selfInfo.execHash) {
    logger.info(
      "Config",
      `Self-binary protection: SHA-256 (${formatHighlight.token(selfInfo.execHash.slice(0, 16))}...) excluded from transfer.`
    );
  }

  // 3. Scan local files
  const scanResult = await runTask("Transfer", "Scanning local directory", async (done) => {
    const res = scanDirectory(config.localDir, config.ignoreList);
    const ignoredText = res.ignoredCount > 0 ? ` (skipped ${formatHighlight.number(res.ignoredCount)} ignored items)` : "";
    done(
      `Found ${formatHighlight.number(res.files.length)} files in ${formatHighlight.number(res.directories.length)} folders (${formatHighlight.token(formatBytes(res.totalBytes))})${ignoredText}`
    );
    return res;
  });

  if (scanResult.files.length === 0) {
    logger.warn("Transfer", `No files found inside ${config.localDir}. Nothing to transfer.`);
    await exitApp(0);
  }

  // 4. Connect to remote SFTP server
  const sftp = new SftpClient();

  // Clean shutdown handlers
  const cleanup = async () => {
    try {
      await sftp.end();
    } catch {
      // Ignore disconnect errors
    }
  };
  process.on("SIGINT", async () => {
    console.log("");
    logger.warn("System", "Received abort signal (Ctrl+C). Terminating transfer...");
    await cleanup();
    process.exit(130);
  });

  try {
    await runTask("SFTP", `Connecting to ${config.host}:${config.port} as ${config.username}`, async () => {
      const connectOptions: SftpClient.ConnectOptions = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 20000,
      };

      if (config.password) {
        connectOptions.password = config.password;
      }

      if (config.privateKey) {
        connectOptions.privateKey = config.privateKey;
      }

      if (config.passphrase) {
        connectOptions.passphrase = config.passphrase;
      }

      await sftp.connect(connectOptions);
      return `SFTP session established with ${config.host}:${config.port}`;
    });
  } catch {
    await cleanup();
    await exitApp(1);
  }

  // 5. 5-Second Countdown
  await startCountdown(5);

  // 6. Transfer files with live progress bar
  try {
    logger.info(
      "Transfer",
      `Synchronizing ${formatHighlight.number(scanResult.files.length)} files into remote directory ${formatHighlight.token(config.serverDir)}...`
    );

    await transferFiles(sftp, scanResult, config.serverDir, config.concurrency || 4);
  } catch {
    await cleanup();
    await exitApp(1);
  }

  // 7. Graceful close
  await runTask("SFTP", "Closing SFTP session", async () => {
    await cleanup();
    return "SFTP connection closed gracefully";
  });

  console.log("");
  logger.success("System", "All files transferred successfully. FastSTFP finished.");
  await exitApp(0);
}

process.on("uncaughtException", async (err) => {
  logger.error("System", "Uncaught exception", err);
  await exitApp(1);
});

process.on("unhandledRejection", async (reason) => {
  logger.error("System", "Unhandled rejection", reason);
  await exitApp(1);
});

main().catch(async (err) => {
  logger.error("System", "Fatal unhandled exception", err);
  await exitApp(1);
});
