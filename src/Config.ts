import fs from "node:fs";
import path from "node:path";
import { logger } from "./Logger.js";

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

export function loadConfig(configPath: string = "manage.json"): ManageConfig {
  let resolvedPath = path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(resolvedPath)) {
    const altPath = path.resolve(process.cwd(), "Manage.json");
    if (fs.existsSync(altPath)) {
      resolvedPath = altPath;
    }
  }

  if (!fs.existsSync(resolvedPath)) {
    // Generate template manage.json if not present
    const template = {
      host: "192.168.1.100",
      port: 22,
      username: "root",
      password: "your_vps_password",
      privateKeyPath: "",
      localDir: "./files-to-upload",
      serverDir: "/var/www/my-site",
      concurrency: 4,
      ignore: {
        "faststfp": true,
        "manage.json": true,
        "node_modules": true,
        ".git": true,
        "dist": false,
        "package-lock.json": true,
        "README.md": false
      }
    };
    fs.writeFileSync(resolvedPath, JSON.stringify(template, null, 2), "utf-8");
    logger.warn("Config", "manage.json not found. Created a template manage.json for you.");
    logger.warn("Config", "Please edit manage.json with your VPS credentials and run again.");
    process.exit(1);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(resolvedPath, "utf-8");
  } catch (err: any) {
    logger.error("Config", `Failed to read configuration file (${resolvedPath})`, err);
    process.exit(1);
  }

  let parsed: Partial<ManageConfig>;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    logger.error(
      "Config",
      "Syntax error in manage.json. Please verify valid JSON formatting (quotes, commas)."
    );
    process.exit(1);
  }

  // Validate required fields
  if (!parsed.host || typeof parsed.host !== "string" || parsed.host.trim() === "YOUR_SERVER_IP") {
    logger.error(
      "Config",
      "Invalid 'host' in manage.json. Please enter your VPS IP address or domain."
    );
    process.exit(1);
  }

  if (!parsed.username || typeof parsed.username !== "string") {
    logger.error("Config", "Missing 'username' in manage.json (e.g., 'root').");
    process.exit(1);
  }

  if (!parsed.password && !parsed.privateKey && !parsed.privateKeyPath) {
    logger.error(
      "Config",
      "No authentication provided. Please specify 'password' or 'privateKeyPath' in manage.json."
    );
    process.exit(1);
  }

  if (!parsed.localDir || typeof parsed.localDir !== "string") {
    logger.error("Config", "Missing 'localDir' in manage.json (e.g., './upload').");
    process.exit(1);
  }

  if (!parsed.serverDir || typeof parsed.serverDir !== "string") {
    logger.error("Config", "Missing 'serverDir' in manage.json (e.g., '/var/www/html').");
    process.exit(1);
  }

  const resolvedLocalDir = path.resolve(process.cwd(), parsed.localDir);
  if (!fs.existsSync(resolvedLocalDir)) {
    logger.error("Config", `Local directory does not exist: "${resolvedLocalDir}"`);
    process.exit(1);
  }

  const stat = fs.statSync(resolvedLocalDir);
  if (!stat.isDirectory()) {
    logger.error("Config", `Specified localDir is a file, not a directory: "${resolvedLocalDir}"`);
    process.exit(1);
  }

  // Handle SSH Private Key if path is given
  let privateKeyContent = parsed.privateKey;
  if (parsed.privateKeyPath) {
    const keyPath = path.resolve(process.cwd(), parsed.privateKeyPath);
    if (!fs.existsSync(keyPath)) {
      logger.error("Config", `SSH private key file not found: "${keyPath}"`);
      process.exit(1);
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
