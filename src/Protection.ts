import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { logger, formatHighlight } from "./Logger.js";

export interface BinaryProtectionInfo {
  execPath: string;
  execName: string;
  execHash: string | null;
  execSize: number;
}

let cachedInfo: BinaryProtectionInfo | null = null;

/**
 * Retrieves information and the SHA-256 hash of the running FastSTFP process/executable.
 */
export function getSelfProtectionInfo(): BinaryProtectionInfo {
  if (cachedInfo) return cachedInfo;

  const execPath = process.execPath;
  const execName = path.basename(execPath).toLowerCase();
  let execHash: string | null = null;
  let execSize = 0;

  try {
    if (fs.existsSync(execPath)) {
      const stats = fs.statSync(execPath);
      execSize = stats.size;
      const buf = fs.readFileSync(execPath);
      execHash = crypto.createHash("sha256").update(buf).digest("hex");
    }
  } catch {
    // Fail-safe
  }

  cachedInfo = {
    execPath,
    execName,
    execHash,
    execSize,
  };

  return cachedInfo;
}

/**
 * Computes SHA-256 hash of a file safely.
 */
export function getFileSha256(filePath: string): string | null {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Determines whether a file is the FastSTFP executable itself,
 * either by binary SHA-256 hash verification or by executable name.
 */
export function isFastSTFPExecutable(filePath: string, fileSize?: number): boolean {
  const info = getSelfProtectionInfo();
  const lowerName = path.basename(filePath).toLowerCase();

  // 1. Direct name match
  if (lowerName === "faststfp.exe" || lowerName === "faststfp") {
    return true;
  }

  // 2. Exact match with running process path
  try {
    if (path.resolve(filePath).toLowerCase() === path.resolve(info.execPath).toLowerCase()) {
      return true;
    }
  } catch {}

  // 3. Binary SHA-256 hash verification:
  // If the file is an .exe or has the exact same size as the running executable
  if (info.execHash && (lowerName.endsWith(".exe") || fileSize === info.execSize)) {
    const fileHash = getFileSha256(filePath);
    if (fileHash && fileHash === info.execHash) {
      return true;
    }
  }

  return false;
}
