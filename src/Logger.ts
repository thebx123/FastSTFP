export type LogCategory =
  | "SFTP"
  | "Transfer"
  | "Config"
  | "System";

// ANSI Codes
export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";

export const CATEGORY_COLORS: Record<LogCategory, string> = {
  SFTP:     "\x1b[38;2;0;210;211m",   // Modern Aqua / Cyan (#00d2d3)
  Transfer: "\x1b[38;2;9;132;227m",   // Royal Ocean Blue (#0984e3)
  Config:   "\x1b[38;2;162;155;254m", // Soft Lavender / Violet (#a29bfe)
  System:   "\x1b[38;2;178;190;195m", // Slate Silver (#b2bec3)
};

export const LEVEL_COLORS = {
  info:    "\x1b[38;2;116;185;255m", // Sky Blue (#74b9ff)
  success: "\x1b[38;2;0;184;148m",   // Emerald Green (#00b894)
  warn:    "\x1b[38;2;243;156;18m",  // Amber Gold (#f39c12)
  error:   "\x1b[38;2;214;48;49m",   // Crimson Red (#d63031)
};

export const WHITE = "\x1b[38;2;255;255;255m";
export const PING_COLOR = "\x1b[38;2;254;202;87m";         // Vibrant Warm Gold (#feca57)
export const VALUE_COLOR = "\x1b[38;2;129;236;236m";        // Electric Ice Cyan (#81ecec)
export const VALUE_HIGHLIGHT_COLOR = "\x1b[1;38;2;129;236;236m"; // Electric Cyan Bold

export function formatPing(elapsedMs: number, bracketColor: string = LEVEL_COLORS.success): string {
  return `${bracketColor}(${RESET}${PING_COLOR}${elapsedMs}ms${RESET}${bracketColor})${RESET}`;
}

export const formatHighlight = {
  number: (val: string | number, baseColor = LEVEL_COLORS.success): string =>
    `${VALUE_HIGHLIGHT_COLOR}${val}\x1b[22m${baseColor}`,
  token: (val: string, baseColor = LEVEL_COLORS.success): string =>
    `${VALUE_HIGHLIGHT_COLOR}${val}\x1b[22m${baseColor}`,
};

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2);
  return `${val} ${units[i]}`;
}

function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function formatPrefix(category: LogCategory, level: "info" | "success" | "warn" | "error"): string {
  const clearLine = process.stdout.isTTY ? "\r\x1b[K" : "";
  const timeStr = `${clearLine}${DIM}[${getTimestamp()}]${RESET}`;
  const catColor = CATEGORY_COLORS[category] || "\x1b[37m";
  const catStr = `${BOLD}${catColor}[${category}]${RESET}`;

  let badge = "";
  if (level === "success") {
    badge = ` ${BOLD}${LEVEL_COLORS.success}[✓]${RESET}`;
  } else if (level === "error") {
    badge = ` ${BOLD}${LEVEL_COLORS.error}[✗]${RESET}`;
  } else if (level === "warn") {
    badge = ` ${BOLD}${LEVEL_COLORS.warn}[!]${RESET}`;
  } else {
    badge = ` ${BOLD}${LEVEL_COLORS.info}[i]${RESET}`;
  }

  return `${timeStr} ${catStr}${badge}`;
}

function safeStringify(item: any): string {
  if (item === null || item === undefined) return String(item);
  if (item instanceof Error) {
    return item.stack || item.message || String(item);
  }
  if (typeof item === "object") {
    try {
      return JSON.stringify(item, null, 2);
    } catch {
      return String(item);
    }
  }
  return String(item);
}

interface ActiveSpinnerState {
  category: LogCategory;
  description: string;
  catColor: string;
  frameIdx: number;
  interval: NodeJS.Timeout;
  startTime: number;
  stopped: boolean;
}

let activeSpinner: ActiveSpinnerState | null = null;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function renderSpinner(s: ActiveSpinnerState): void {
  const frame = SPINNER_FRAMES[s.frameIdx];
  const timeStr = `${DIM}[${getTimestamp()}]${RESET}`;
  const catStr = `${BOLD}${s.catColor}[${s.category}]${RESET}`;
  const spinStr = `${BOLD}\x1b[36m${frame}${RESET}`;
  process.stdout.write(`\r\x1b[K${timeStr} ${catStr} ${spinStr} ${s.description}...`);
}

export function clearActiveSpinner(): void {
  if (activeSpinner && !activeSpinner.stopped && process.stdout.isTTY) {
    process.stdout.write("\r\x1b[K");
  }
}

export function resumeActiveSpinner(): void {
  if (activeSpinner && !activeSpinner.stopped && process.stdout.isTTY) {
    renderSpinner(activeSpinner);
  }
}

/**
 * Converts low-level network, filesystem, and SSH errors into clean, simple English messages.
 */
export function simplifyError(err: any): string {
  if (!err) return "An unexpected error occurred.";
  const msg = (err.message || err.toString() || "").toLowerCase();

  // DNS / Host not found
  if (msg.includes("enotfound") || msg.includes("getaddrinfo")) {
    return "Host not found. Please verify the 'host' address in manage.json.";
  }

  // Connection refused
  if (msg.includes("econnrefused")) {
    return "Connection refused. Check that SSH service is running on the specified port.";
  }

  // Timeout
  if (
    msg.includes("timed out") ||
    msg.includes("etimedout") ||
    msg.includes("readytimeout") ||
    msg.includes("operation timed out")
  ) {
    return "Connection timed out. Server is unreachable or firewall is blocking the port.";
  }

  // Authentication failed
  if (
    msg.includes("all configured authentication methods failed") ||
    msg.includes("authentication failed") ||
    msg.includes("auth failed")
  ) {
    return "Authentication failed. Incorrect username, password, or SSH key.";
  }

  // Host unreachable / network error
  if (msg.includes("ehostunreach") || msg.includes("enetunreach")) {
    return "Host unreachable. Check your network connection or server IP.";
  }

  // Connection reset
  if (msg.includes("econnreset") || msg.includes("connection reset")) {
    return "Connection was reset by the remote server.";
  }

  // SSH Key Passphrase
  if (msg.includes("passphrase") || msg.includes("encrypted")) {
    return "Encrypted private key detected. Please provide 'passphrase' in manage.json.";
  }

  // Permission denied
  if (msg.includes("permission denied") || msg.includes("eacces")) {
    return "Permission denied on remote server. Check directory write permissions.";
  }

  // Disk full / No space
  if (msg.includes("enospc") || msg.includes("disk full")) {
    return "Remote disk space is full.";
  }

  // File not found
  if (msg.includes("enoent") || msg.includes("no such file")) {
    return "File or folder not found.";
  }

  // Clean first line of generic message
  const rawMsg = err.message || String(err);
  const firstLine = rawMsg.split("\n")[0].trim();
  return firstLine.replace(/^(error:\s*)+/i, "").replace(/^getConnection:\s*/i, "");
}

export const logger = {
  info(category: LogCategory, message: string, ...args: any[]): void {
    try {
      clearActiveSpinner();
      const prefix = formatPrefix(category, "info");
      if (args.length > 0) {
        console.log(`${prefix} ${message}`, ...args);
      } else {
        console.log(`${prefix} ${message}`);
      }
      resumeActiveSpinner();
    } catch {
      console.log(`[${category}] [i] ${message}`);
    }
  },

  success(category: LogCategory, message: string, ...args: any[]): void {
    try {
      clearActiveSpinner();
      const prefix = formatPrefix(category, "success");
      const msgColor = LEVEL_COLORS.success;
      if (args.length > 0) {
        console.log(`${prefix} ${msgColor}${message}${RESET}`, ...args);
      } else {
        console.log(`${prefix} ${msgColor}${message}${RESET}`);
      }
      resumeActiveSpinner();
    } catch {
      console.log(`[${category}] [✓] ${message}`);
    }
  },

  warn(category: LogCategory, message: string, ...args: any[]): void {
    try {
      clearActiveSpinner();
      const prefix = formatPrefix(category, "warn");
      const msgColor = LEVEL_COLORS.warn;
      if (args.length > 0) {
        console.warn(`${prefix} ${msgColor}${message}${RESET}`, ...args);
      } else {
        console.warn(`${prefix} ${msgColor}${message}${RESET}`);
      }
      resumeActiveSpinner();
    } catch {
      console.warn(`[${category}] [!] ${message}`);
    }
  },

  error(category: LogCategory, message: string, error?: any, ...args: any[]): void {
    try {
      clearActiveSpinner();
      const prefix = formatPrefix(category, "error");
      const msgColor = LEVEL_COLORS.error;

      let cleanMessage = message;
      if (error) {
        const errorReason = simplifyError(error);
        if (!cleanMessage.includes(errorReason)) {
          cleanMessage += `: ${errorReason}`;
        }
      }

      // Show full stack trace only if DEBUG env variable is set
      const debugDetail =
        process.env.DEBUG && error?.stack ? `\n${DIM}${error.stack}${RESET}` : "";

      if (args.length > 0) {
        console.error(`${prefix} ${msgColor}${cleanMessage}${RESET}${debugDetail}`, ...args);
      } else {
        console.error(`${prefix} ${msgColor}${cleanMessage}${RESET}${debugDetail}`);
      }
      resumeActiveSpinner();
    } catch {
      console.error(`[${category}] [✗] ${message}`);
    }
  },
};

export function startSpinner(
  category: LogCategory,
  description: string
): (success: boolean, finalMessage?: string) => void {
  const isTTY = Boolean(process.stdout.isTTY);
  const startTime = Date.now();
  const catColor = CATEGORY_COLORS[category] || "\x1b[37m";

  if (!isTTY) {
    logger.info(category, `${description}...`);
    return (success: boolean, finalMessage?: string) => {
      const elapsed = Date.now() - startTime;
      const msg = finalMessage || description;
      const bracketColor = success ? LEVEL_COLORS.success : LEVEL_COLORS.error;
      const pingStr = formatPing(elapsed, bracketColor);
      if (success) {
        logger.success(category, `${msg} ${pingStr}`);
      } else {
        logger.error(category, `${msg} ${pingStr}`);
      }
    };
  }

  clearActiveSpinner();

  const state: ActiveSpinnerState = {
    category,
    description,
    catColor,
    frameIdx: 0,
    interval: null as any,
    startTime,
    stopped: false,
  };

  renderSpinner(state);

  state.interval = setInterval(() => {
    if (state.stopped) return;
    state.frameIdx = (state.frameIdx + 1) % SPINNER_FRAMES.length;
    renderSpinner(state);
  }, 80);

  activeSpinner = state;

  return (success: boolean, finalMessage?: string) => {
    if (state.stopped) return;
    state.stopped = true;
    clearInterval(state.interval);
    if (activeSpinner === state) {
      activeSpinner = null;
    }
    process.stdout.write("\r\x1b[K");
    const elapsed = Date.now() - startTime;
    const msg = finalMessage || description;
    const bracketColor = success ? LEVEL_COLORS.success : LEVEL_COLORS.error;
    const pingStr = formatPing(elapsed, bracketColor);
    if (success) {
      logger.success(category, `${msg} ${pingStr}`);
    } else {
      logger.error(category, `${msg} ${pingStr}`);
    }
  };
}

export async function runTask<T>(
  category: LogCategory,
  description: string,
  task: (done: (msg: string) => void) => Promise<T>
): Promise<T> {
  const stop = startSpinner(category, description);
  let customMsg: string | undefined;
  const setCustomMsg = (msg: string) => {
    customMsg = msg;
  };
  try {
    const result = await task(setCustomMsg);
    const finalMsg = customMsg || (typeof result === "string" ? result : description);
    stop(true, finalMsg);
    return result;
  } catch (err: any) {
    const errMsg = simplifyError(err);
    stop(false, `${description} failed: ${errMsg}`);
    throw err;
  }
}
