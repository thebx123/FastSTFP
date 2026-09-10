import fs from "node:fs";
import path from "node:path";
import { logger, exitApp } from "./Logger.js";

export interface ManageConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  privateKeyPath?: string;
  passphrase?: string;
  localDir: string;
  serverDir: string;
  concurrency: number;
  ignore?: Record<string, boolean> | string[];
  ignoreList: string[];
}

export const DEFAULT_CONFIG_TEMPLATE = {
  host: "YOUR_SERVER_IP",
  port: 22,
  username: "root",
  password: "YOUR_PASSWORD",
  privateKeyPath: "",
  localDir: "./upload",
  serverDir: "/var/www/my-site",
  concurrency: 4,
  ignore: {
    node_modules: true,
    ".git": true,
    dist: false,
    "package-lock.json": true,
    "README.md": false,
  },
};

/**
 * Attempts to salvage credentials from a corrupted/malformed JSON string via regex.
 */
function tryRecoverFromCorruptedJson(raw: string): Partial<ManageConfig> {
  const recovered: any = {};
  const hostMatch = raw.match(/"host"\s*:\s*"([^"]+)"/i);
  if (hostMatch) recovered.host = hostMatch[1];

  const userMatch = raw.match(/"username"\s*:\s*"([^"]+)"/i);
  if (userMatch) recovered.username = userMatch[1];

  const passMatch = raw.match(/"password"\s*:\s*"([^"]+)"/i);
  if (passMatch) recovered.password = passMatch[1];

  const portMatch = raw.match(/"port"\s*:\s*(\d+)/i);
  if (portMatch) recovered.port = parseInt(portMatch[1], 10);

  const keyPathMatch = raw.match(/"privateKeyPath"\s*:\s*"([^"]+)"/i);
  if (keyPathMatch) recovered.privateKeyPath = keyPathMatch[1];

  const localDirMatch = raw.match(/"localDir"\s*:\s*"([^"]+)"/i);
  if (localDirMatch) recovered.localDir = localDirMatch[1];

  const serverDirMatch = raw.match(/"serverDir"\s*:\s*"([^"]+)"/i);
  if (serverDirMatch) recovered.serverDir = serverDirMatch[1];

  const concurrencyMatch = raw.match(/"concurrency"\s*:\s*(\d+)/i);
  if (concurrencyMatch) recovered.concurrency = parseInt(concurrencyMatch[1], 10);

  return recovered;
}

export async function loadConfig(configPath: string = "manage.json"): Promise<ManageConfig> {
  const exeDir = path.dirname(process.execPath);
  const cwdDir = process.cwd();
  const candidateDirs = [cwdDir, exeDir];

  let resolvedPath: string | null = null;

  for (const dir of candidateDirs) {
    const p1 = path.resolve(dir, configPath);
    if (fs.existsSync(p1)) {
      resolvedPath = p1;
      break;
    }
    const p2 = path.resolve(dir, "Manage.json");
    if (fs.existsSync(p2)) {
      resolvedPath = p2;
      break;
    }
  }

  // 1. Auto-create manage.json if missing ("ساخته بشه در صورتی که نبود")
  if (!resolvedPath) {
    const targetDir = fs.existsSync(exeDir) ? exeDir : cwdDir;
    resolvedPath = path.resolve(targetDir, configPath);

    try {
      fs.writeFileSync(
        resolvedPath,
        JSON.stringify(DEFAULT_CONFIG_TEMPLATE, null, 2),
        "utf-8"
      );
      logger.success("Config", `Created fresh manage.json configuration file at: "${resolvedPath}"`);
    } catch {
      logger.error("Config", `Failed to create manage.json at: "${resolvedPath}"`);
      return await exitApp(1);
    }

    // Auto-create the default upload folder next to manage.json
    const defaultUpload = path.resolve(path.dirname(resolvedPath), DEFAULT_CONFIG_TEMPLATE.localDir);
    if (!fs.existsSync(defaultUpload)) {
      try {
        fs.mkdirSync(defaultUpload, { recursive: true });
        logger.info("Config", `Created default local upload folder: "${defaultUpload}"`);
      } catch {}
    }

    logger.warn("Config", "Please edit manage.json with your VPS IP address and password, then run FastSTFP again.");
    return await exitApp(1);
  }

  const configDir = path.dirname(resolvedPath);

  // 2. Read and examine raw content
  let raw = "";
  try {
    raw = fs.readFileSync(resolvedPath, "utf-8");
  } catch (err: any) {
    logger.error("Config", `Failed to read configuration file (${resolvedPath})`, err);
    return await exitApp(1);
  }

  // Strip UTF-8 BOM if present
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }

  let parsed: any = {};
  let wasRepaired = false;

  if (!raw.trim()) {
    parsed = { ...DEFAULT_CONFIG_TEMPLATE };
    wasRepaired = true;
    logger.warn("Config", "manage.json was empty. Restored default template.");
  } else {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Syntax error in JSON! Auto-repair by extracting whatever credentials exist and restoring structure
      const backupPath = `${resolvedPath}.corrupted.bak`;
      try {
        fs.writeFileSync(backupPath, raw, "utf-8");
      } catch {}

      const recovered = tryRecoverFromCorruptedJson(raw);
      parsed = {
        ...DEFAULT_CONFIG_TEMPLATE,
        ...recovered,
        ignore: { ...DEFAULT_CONFIG_TEMPLATE.ignore },
      };
      wasRepaired = true;
      logger.warn(
        "Config",
        `Syntax error detected in manage.json. Auto-repaired format (backed up corrupted file to "${path.basename(backupPath)}").`
      );
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    parsed = { ...DEFAULT_CONFIG_TEMPLATE };
    wasRepaired = true;
  }

  // 3. Examine fields and auto-repair invalid/missing values ("بررسی کنه اگر درست نبود درست کند")

  // Check & repair host
  if (typeof parsed.host !== "string" || !parsed.host.trim()) {
    parsed.host = DEFAULT_CONFIG_TEMPLATE.host;
    wasRepaired = true;
  }

  // Check & repair port
  if (typeof parsed.port === "string") {
    const num = parseInt(parsed.port, 10);
    parsed.port = !isNaN(num) && num > 0 && num <= 65535 ? num : 22;
    wasRepaired = true;
  } else if (typeof parsed.port !== "number" || parsed.port <= 0 || parsed.port > 65535) {
    parsed.port = 22;
    wasRepaired = true;
  }

  // Check & repair username
  if (typeof parsed.username !== "string" || !parsed.username.trim()) {
    parsed.username = "root";
    wasRepaired = true;
  }

  // Check & repair password and privateKeyPath
  if (parsed.password === undefined && parsed.privateKeyPath === undefined && parsed.privateKey === undefined) {
    parsed.password = DEFAULT_CONFIG_TEMPLATE.password;
    parsed.privateKeyPath = "";
    wasRepaired = true;
  }
  if (parsed.privateKeyPath === undefined) {
    parsed.privateKeyPath = "";
    wasRepaired = true;
  }

  // Check & repair localDir
  if (typeof parsed.localDir !== "string" || !parsed.localDir.trim()) {
    parsed.localDir = "./upload";
    wasRepaired = true;
  }

  // Check & repair serverDir (auto-fix Windows backslashes and missing leading slash)
  if (typeof parsed.serverDir !== "string" || !parsed.serverDir.trim()) {
    parsed.serverDir = "/var/www/my-site";
    wasRepaired = true;
  } else {
    const fixedServerDir = parsed.serverDir.replace(/\\/g, "/");
    const normalized = fixedServerDir.startsWith("/") ? fixedServerDir : `/${fixedServerDir}`;
    if (normalized !== parsed.serverDir) {
      parsed.serverDir = normalized;
      wasRepaired = true;
    }
  }

  // Check & repair concurrency
  if (typeof parsed.concurrency === "string") {
    const num = parseInt(parsed.concurrency, 10);
    parsed.concurrency = !isNaN(num) && num > 0 ? num : 4;
    wasRepaired = true;
  } else if (typeof parsed.concurrency !== "number" || parsed.concurrency <= 0) {
    parsed.concurrency = 4;
    wasRepaired = true;
  }

  // Check & repair ignore rules
  if (!parsed.ignore || typeof parsed.ignore !== "object") {
    parsed.ignore = { ...DEFAULT_CONFIG_TEMPLATE.ignore };
    wasRepaired = true;
  } else if (!Array.isArray(parsed.ignore)) {
    for (const [key, val] of Object.entries(DEFAULT_CONFIG_TEMPLATE.ignore)) {
      if (parsed.ignore[key] === undefined) {
        parsed.ignore[key] = val;
        wasRepaired = true;
      }
    }
  }

  // If any repairs were made, save the repaired manage.json back to disk
  if (wasRepaired) {
    try {
      fs.writeFileSync(resolvedPath, JSON.stringify(parsed, null, 2), "utf-8");
      logger.info("Config", "Auto-repaired manage.json: missing fields and formatting issues were automatically corrected.");
    } catch (err: any) {
      logger.warn("Config", `Failed to save repaired manage.json: ${err?.message || err}`);
    }
  }

  // 4. Ensure localDir folder exists on disk
  let resolvedLocalDir = path.resolve(configDir, parsed.localDir);
  if (!fs.existsSync(resolvedLocalDir)) {
    const cwdLocalDir = path.resolve(process.cwd(), parsed.localDir);
    if (fs.existsSync(cwdLocalDir)) {
      resolvedLocalDir = cwdLocalDir;
    }
  }

  if (!fs.existsSync(resolvedLocalDir)) {
    try {
      fs.mkdirSync(resolvedLocalDir, { recursive: true });
      logger.info("Config", `Auto-created missing local upload directory: "${resolvedLocalDir}"`);
    } catch {
      logger.error("Config", `Local directory does not exist: "${resolvedLocalDir}"`);
      return await exitApp(1);
    }
  }

  const stat = fs.statSync(resolvedLocalDir);
  if (!stat.isDirectory()) {
    logger.error("Config", `Specified localDir is a file, not a directory: "${resolvedLocalDir}"`);
    return await exitApp(1);
  }

  // Handle SSH Private Key if path is given
  let privateKeyContent = parsed.privateKey;
  if (parsed.privateKeyPath) {
    let keyPath = path.resolve(configDir, parsed.privateKeyPath);
    if (!fs.existsSync(keyPath)) {
      const cwdKeyPath = path.resolve(process.cwd(), parsed.privateKeyPath);
      if (fs.existsSync(cwdKeyPath)) {
        keyPath = cwdKeyPath;
      }
    }
    if (!fs.existsSync(keyPath)) {
      logger.error("Config", `SSH private key file not found: "${keyPath}"`);
      return await exitApp(1);
    }
    privateKeyContent = fs.readFileSync(keyPath, "utf-8");
  }

  // 5. Validate that host and authentication are not placeholders
  const isPlaceholderHost =
    parsed.host === "YOUR_SERVER_IP" ||
    parsed.host === "192.168.1.100" ||
    parsed.host === "example.com";

  const isPlaceholderPassword =
    parsed.password === "YOUR_PASSWORD" ||
    parsed.password === "your_vps_password";

  if (isPlaceholderHost) {
    logger.error("Config", `Invalid 'host' in manage.json ("${parsed.host}"). Please enter your VPS IP address or domain.`);
    return await exitApp(1);
  }

  if (!parsed.password && !parsed.privateKey && !parsed.privateKeyPath) {
    logger.error("Config", "No authentication provided. Please specify 'password' or 'privateKeyPath' in manage.json.");
    return await exitApp(1);
  }

  if (isPlaceholderPassword && !parsed.privateKey && !parsed.privateKeyPath) {
    logger.error("Config", `Default placeholder password detected in manage.json. Please enter your real VPS password.`);
    return await exitApp(1);
  }

  // Normalize serverDir to POSIX
  let normalizedServerDir = parsed.serverDir.replace(/\\/g, "/");
  if (!normalizedServerDir.startsWith("/")) {
    normalizedServerDir = `/${normalizedServerDir}`;
  }
  if (normalizedServerDir.endsWith("/") && normalizedServerDir.length > 1) {
    normalizedServerDir = normalizedServerDir.slice(0, -1);
  }

  // Process ignore list / toggles
  const activeIgnores = new Set<string>();
  activeIgnores.add("faststfp");
  activeIgnores.add("manage.json");

  if (parsed.ignore) {
    if (Array.isArray(parsed.ignore)) {
      for (const item of parsed.ignore) {
        if (typeof item === "string" && item.trim()) {
          activeIgnores.add(item.trim());
        }
      }
    } else if (typeof parsed.ignore === "object") {
      for (const [key, enabled] of Object.entries(parsed.ignore)) {
        if (enabled === true) {
          activeIgnores.add(key.trim());
        }
      }
    }
  }

  const config: ManageConfig = {
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
    password: parsed.password,
    privateKey: privateKeyContent,
    privateKeyPath: parsed.privateKeyPath,
    passphrase: parsed.passphrase,
    localDir: resolvedLocalDir,
    serverDir: normalizedServerDir,
    concurrency: parsed.concurrency,
    ignore: parsed.ignore,
    ignoreList: Array.from(activeIgnores),
  };

  return config;
}
