import fs from "node:fs";
import path from "node:path";
import SftpClient from "ssh2-sftp-client";
import {
  logger,
  formatBytes,
  formatPing,
  formatHighlight,
  RESET,
  BOLD,
  DIM,
  LEVEL_COLORS,
  CATEGORY_COLORS,
  PING_COLOR,
  VALUE_COLOR,
} from "./Logger.js";
import { isFastSTFPExecutable } from "./Protection.js";

export interface FileItem {
  absolutePath: string;
  relativePath: string; // e.g. "assets/img.png"
  size: number;
}

export interface ScanResult {
  files: FileItem[];
  directories: string[]; // relative directory paths
  totalBytes: number;
  ignoredCount: number;
}

/**
 * Determines whether a file or directory should be ignored from transfer.
 */
export function shouldIgnore(name: string, relPath: string, ignorePatterns: string[]): boolean {
  const lowerName = name.toLowerCase();
  const lowerRel = relPath.toLowerCase().replace(/\\/g, "/");

  // Always protect FastSTFP self-files and credentials
  if (
    lowerName === "faststfp" ||
    lowerName === "manage.json" ||
    lowerRel.includes("/faststfp/") ||
    lowerRel.startsWith("faststfp/")
  ) {
    return true;
  }

  for (const pattern of ignorePatterns) {
    const lowerPattern = pattern.toLowerCase().trim();
    if (!lowerPattern) continue;

    // Exact filename or folder name match (e.g. "node_modules", "package-lock.json", "README.md", ".git")
    if (lowerName === lowerPattern) {
      return true;
    }

    // Relative path match
    const cleanRel = lowerPattern.replace(/^\.\//, "");
    if (lowerRel === cleanRel) {
      return true;
    }

    // Path segment match (e.g. "node_modules/...", "folder/node_modules/...")
    if (
      lowerRel.startsWith(cleanRel + "/") ||
      lowerRel.includes("/" + cleanRel + "/")
    ) {
      return true;
    }

    // Wildcard extension match (e.g. "*.log", "*.tmp")
    if (lowerPattern.startsWith("*.")) {
      const ext = lowerPattern.slice(1);
      if (lowerName.endsWith(ext)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Recursively scans a local directory and returns all files and subdirectories,
 * skipping any files or directories specified in ignorePatterns or FastSTFP self-files.
 */
export function scanDirectory(dirPath: string, ignorePatterns: string[] = []): ScanResult {
  const files: FileItem[] = [];
  const directories = new Set<string>();
  let totalBytes = 0;
  let ignoredCount = 0;

  function walk(currentDir: string, relPrefix: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

      if (shouldIgnore(entry.name, relPath, ignorePatterns)) {
        ignoredCount++;
        continue;
      }

      if (entry.isDirectory()) {
        directories.add(relPath);
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        if (isFastSTFPExecutable(fullPath, stats.size)) {
          ignoredCount++;
          continue;
        }
        files.push({
          absolutePath: fullPath,
          relativePath: relPath,
          size: stats.size,
        });
        totalBytes += stats.size;
      }
    }
  }

  walk(dirPath, "");

  return {
    files,
    directories: Array.from(directories).sort((a, b) => a.length - b.length),
    totalBytes,
    ignoredCount,
  };
}

/**
 * Formats a terminal progress bar with 24-bit TrueColor ANSI styling.
 */
function renderProgressBar(
  percentage: number,
  barLength: number = 24
): string {
  const clamped = Math.max(0, Math.min(100, percentage));
  const filledLength = Math.round((clamped / 100) * barLength);
  const emptyLength = barLength - filledLength;

  // Royal blue to vibrant cyan gradient effect
  const filledBar = "\x1b[38;2;0;210;211m" + "█".repeat(filledLength) + RESET;
  const emptyBar = "\x1b[38;2;50;60;70m" + "░".repeat(emptyLength) + RESET;

  return `[${filledBar}${emptyBar}]`;
}

/**
 * Transfers all files in scanResult to remote serverDir over SFTP with live progress.
 */
export async function transferFiles(
  sftp: SftpClient,
  scanResult: ScanResult,
  serverDir: string,
  concurrency: number = 4
): Promise<{ transferredCount: number; totalBytes: number; elapsedMs: number }> {
  const startTime = Date.now();
  const { files, directories, totalBytes } = scanResult;

  if (files.length === 0) {
    logger.warn("Transfer", "No files found inside localDir to transfer.");
    return { transferredCount: 0, totalBytes: 0, elapsedMs: 0 };
  }

  // 1. Ensure remote root directory exists
  try {
    const dirExists = await sftp.exists(serverDir);
    if (!dirExists) {
      await sftp.mkdir(serverDir, true);
    }
  } catch (err: any) {
    logger.error("SFTP", `Cannot access or create remote serverDir: "${serverDir}"`, err);
    throw err;
  }

  // 2. Pre-create all remote subdirectories
  for (const relDir of directories) {
    const remoteSubDir = `${serverDir}/${relDir}`;
    try {
      const exists = await sftp.exists(remoteSubDir);
      if (!exists) {
        await sftp.mkdir(remoteSubDir, true);
      }
    } catch (err: any) {
      // Ignore directory already exists errors
    }
  }

  let completedBytes = 0;
  let completedFiles = 0;
  let activeTransfers: Record<string, number> = {}; // filename -> transferred bytes
  let lastRenderTime = 0;
  let lastTransferredBytes = 0;
  let speedBps = 0;

  const isTTY = Boolean(process.stdout.isTTY);

  function updateProgressLine(currentFile: string = "") {
    const now = Date.now();

    // Calculate dynamic speed every 400ms
    if (now - lastRenderTime > 400) {
      const activeBytesTotal = Object.values(activeTransfers).reduce((a, b) => a + b, 0);
      const currentTotal = completedBytes + activeBytesTotal;
      const deltaBytes = currentTotal - lastTransferredBytes;
      const deltaTime = (now - lastRenderTime) / 1000;
      if (deltaTime > 0) {
        speedBps = Math.max(0, deltaBytes / deltaTime);
      }
      lastTransferredBytes = currentTotal;
      lastRenderTime = now;
    }

    const activeBytesTotal = Object.values(activeTransfers).reduce((a, b) => a + b, 0);
    const overallTransferred = Math.min(totalBytes, completedBytes + activeBytesTotal);
    const percent = totalBytes > 0 ? (overallTransferred / totalBytes) * 100 : 100;
    const bar = renderProgressBar(percent, 22);

    const nowD = new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const timeStr = `${DIM}[${pad(nowD.getHours())}:${pad(nowD.getMinutes())}:${pad(nowD.getSeconds())}]${RESET}`;
    const catStr = `${BOLD}${CATEGORY_COLORS.Transfer}[Transfer]${RESET}`;

    const percentStr = `${BOLD}${LEVEL_COLORS.info}${percent.toFixed(1).padStart(5, " ")}%${RESET}`;
    const sizeStr = `${VALUE_COLOR}${formatBytes(overallTransferred)}${RESET} / ${formatBytes(totalBytes)}`;
    const speedStr = `${PING_COLOR}${formatBytes(speedBps)}/s${RESET}`;
    const countStr = `${DIM}(${completedFiles}/${files.length})${RESET}`;

    // Shorten filename if long
    let shortName = currentFile;
    if (shortName.length > 25) {
      shortName = "..." + shortName.slice(-22);
    }
    const fileLabel = shortName ? ` ${DIM}${shortName}${RESET}` : "";

    if (isTTY) {
      process.stdout.write(
        `\r\x1b[K${timeStr} ${catStr} ${bar} ${percentStr} | ${sizeStr} | ${speedStr} ${countStr}${fileLabel}`
      );
    }
  }

  // File queue runner with concurrency limit
  let queueIndex = 0;

  async function worker(): Promise<void> {
    while (queueIndex < files.length) {
      const currentIndex = queueIndex++;
      const file = files[currentIndex];
      const remotePath = `${serverDir}/${file.relativePath}`;

      activeTransfers[file.relativePath] = 0;
      updateProgressLine(file.relativePath);

      try {
        if (file.size === 0) {
          // Zero-byte files can be created directly
          await sftp.put(Buffer.alloc(0), remotePath);
        } else {
          await sftp.fastPut(file.absolutePath, remotePath, {
            concurrency: 2,
            step: (transferred) => {
              activeTransfers[file.relativePath] = transferred;
              updateProgressLine(file.relativePath);
            },
          });
        }

        delete activeTransfers[file.relativePath];
        completedBytes += file.size;
        completedFiles++;
        updateProgressLine(file.relativePath);
      } catch (err: any) {
        delete activeTransfers[file.relativePath];
        if (isTTY) process.stdout.write("\r\x1b[K");
        logger.error("Transfer", `Failed to upload "${file.relativePath}"`, err);
        throw err;
      }
    }
  }

  // Start concurrent workers
  const workerCount = Math.min(concurrency, files.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  if (isTTY) {
    process.stdout.write("\r\x1b[K");
  }

  const elapsedMs = Date.now() - startTime;
  const avgSpeed = elapsedMs > 0 ? (totalBytes / (elapsedMs / 1000)) : 0;

  logger.success(
    "Transfer",
    `Completed transfer of ${formatHighlight.number(completedFiles)} files (${formatHighlight.token(formatBytes(totalBytes))}) at average ${formatHighlight.token(formatBytes(avgSpeed) + "/s")} ${formatPing(elapsedMs)}`
  );

  return {
    transferredCount: completedFiles,
    totalBytes,
    elapsedMs,
  };
}
