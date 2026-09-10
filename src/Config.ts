import fs from "node:fs";
import path from "node:path";
import { logger, exitApp } from "./Logger.js";

export interface ManageConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  privateKeyPath?: string;
  passphrase?: string;
  localDir: string;
  serverDir: string;
  concurrency?: number;
  ignore?: Record<string, boolean> | string[];
  ignoreList: string[];
}

export async function loadConfig(configPath: string = "manage.json"): Promise<ManageConfig> {
  const candidateDirs = [
    process.cwd(),
    path.dirname(process.execPath),
  ];

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

  if (!resolvedPath) {
    const targetDir = fs.existsSync(path.dirname(process.execPath))
      ? path.dirname(process.execPath)
      : process.cwd();
    resolvedPath = path.resolve(targetDir, configPath);

    // Generate template manage.json if not present
    const template = {
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
    try {
      fs.writeFileSync(resolvedPath, JSON.stringify(template, null, 2), "utf-8");
      logger.warn("Config", `manage.json not found. Created a template manage.json at: ${resolvedPath}`);
    } catch {
      logger.warn("Config", "manage.json not found.");
    }
    logger.warn("Config", "Please edit manage.json with your VPS credentials and run again.");
    return await exitApp(1);
  }

  const configDir = path.dirname(resolvedPath);

  let raw = "";
  try {
    raw = fs.readFileSync(resolvedPath, "utf-8");
  } catch (err: any) {
    logger.error("Config", `Failed to read configuration file (${resolvedPath})`, err);
    return await exitApp(1);
  }

  let parsed: Partial<ManageConfig> = {};
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    logger.error(
      "Config",
      "Syntax error in manage.json. Please verify valid JSON formatting (quotes, commas)."
    );
    return await exitApp(1);
  }

  // Validate required fields
  if (!parsed.host || typeof parsed.host !== "string" || parsed.host.trim() === "YOUR_SERVER_IP" || parsed.host.trim() === "192.168.1.100") {
    logger.error(
      "Config",
      "Invalid 'host' in manage.json. Please enter your VPS IP address or domain."
    );
    return await exitApp(1);
  }

  if (!parsed.username || typeof parsed.username !== "string") {
    logger.error("Config", "Missing 'username' in manage.json (e.g., 'root').");
    return await exitApp(1);
  }

  if (!parsed.password && !parsed.privateKey && !parsed.privateKeyPath) {
    logger.error(
      "Config",
      "No authentication provided. Please specify 'password' or 'privateKeyPath' in manage.json."
    );
    return await exitApp(1);
  }

  if (!parsed.localDir || typeof parsed.localDir !== "string") {
    logger.error("Config", "Missing 'localDir' in manage.json (e.g., './upload').");
    return await exitApp(1);
  }

  if (!parsed.serverDir || typeof parsed.serverDir !== "string") {
    logger.error("Config", "Missing 'serverDir' in manage.json (e.g., '/var/www/html').");
    return await exitApp(1);
  }

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
      logger.info("Config", `Created missing local directory: "${resolvedLocalDir}"`);
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

  // Always protect FastSTFP itself and the credentials file
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
    port: parsed.port || 22,
    username: parsed.username,
    password: parsed.password,
    privateKey: privateKeyContent,
    privateKeyPath: parsed.privateKeyPath,
    passphrase: parsed.passphrase,
    localDir: resolvedLocalDir,
    serverDir: normalizedServerDir,
    concurrency: parsed.concurrency && parsed.concurrency > 0 ? parsed.concurrency : 4,
    ignore: parsed.ignore,
    ignoreList: Array.from(activeIgnores),
  };

  return config;
}
