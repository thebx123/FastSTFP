<div align="center">

<img src="./assets/logo.png" alt="FastSTFP Logo" width="180" height="180" />

# FastSTFP

### High-Performance SFTP Transfer System with TrueColor ANSI Logging & Binary Hash Protection

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-0078D6?style=for-the-badge&logo=windows&logoColor=white)](#)
[![License](https://img.shields.io/badge/License-MIT-00f2fe?style=for-the-badge)](#)

</div>

---

## ⚡ Overview

**FastSTFP** is a modern, blazing-fast, and intelligent CLI tool designed for synchronizing local files and folders to remote Linux servers (VPS) over secure SFTP. Engineered strictly to deploy only the **contents inside the specified local folder**, FastSTFP provides a sleek 24-bit TrueColor terminal experience, real-time transfer telemetry, dynamic progress tracking, and robust self-protection.

```text
  ███████╗ █████╗ ███████╗████████╗███████╗████████╗███████╗██████╗ 
  ██╔════╝██╔══██╗██╔════╝╚══██╔══╝██╔════╝╚══██╔══╝██╔════╝██╔══██╗
  █████╗  ███████║███████╗   ██║   ███████╗   ██║   █████╗  ██████╔╝
  ██╔══╝  ██╔══██║╚════██║   ██║   ╚════██║   ██║   ██╔══╝  ██╔═══╝ 
  ██║     ██║  ██║███████║   ██║   ███████║   ██║   ██║     ██║     
  ╚═╝     ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝   ╚═╝   ╚═╝     ╚═╝     
  ───────────────────────────────────────────────────────────────────
  FastSTFP │ High-Performance SFTP Sync Engine │ v1.0.0
  Made by Coretify Studio
  ───────────────────────────────────────────────────────────────────
```

---

## ✨ Features

- 🎨 **Modern 24-bit TrueColor ANSI Logging**:
  - **Zero-Emoji Policy**: Clean, standardized Unicode bracketed badges (`[✓]`, `[✗]`, `[!]`, `[i]`) across all operating systems.
  - **Interactive Braille Spinner**: Smooth 10-frame spinner (`⠋ ⠙ ⠹ ...`) for long-running operations with graceful non-TTY fallback.
  - **Millisecond Latency Tracking**: Precise network latency and task duration reporting `(142ms)`.
- 📊 **Real-Time Visual Progress Bar**:
  - Dynamic gradient progress bar displaying upload percentage.
  - Real-time transferred bytes vs. total size, dynamic speed calculation (`MB/s`), and active file indicator.
- 🛡️ **Binary SHA-256 Hash Self-Protection**:
  - Automatically identifies the running executable's binary SHA-256 signature.
  - Even if `FastSTFP.exe` is renamed or placed inside the synchronization directory, it is detected and **excluded from VPS upload**.
- ⚙️ **Flexible Ignore & Filter Rules**:
  - Easy boolean toggles in `manage.json` to include or exclude files and folders like `node_modules`, `dist`, `.git`, `package-lock.json`, `README.md`.
- 🚀 **Parallel Concurrency**:
  - Multi-worker concurrent file uploading to saturate network bandwidth and minimize round-trip latency for thousands of small files.
- 🛑 **Clean Terminal Hold on Exit**:
  - Keeps the terminal window open after completion or errors until the user presses Enter or any key, preventing console windows from abruptly closing.
- 📦 **Standalone Executable (`.exe`)**:
  - Automated build pipeline producing a portable single-binary `FastSTFP.exe` with an embedded custom Cyber Neon app icon. Zero dependencies or Node.js runtime required on target machines.

---

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/thebx123/FastSTFP.git
cd FastSTFP
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Configuration (`manage.json`)
Copy the example configuration file:
```bash
cp manage.example.json manage.json
```

Configure your server credentials and paths:
```json
{
  "host": "YOUR_SERVER_IP",
  "port": 22,
  "username": "root",
  "password": "YOUR_PASSWORD",
  "privateKeyPath": "",
  "localDir": "./upload",
  "serverDir": "/var/www/my-site",
  "concurrency": 4,
  "ignore": {
    "node_modules": true,
    ".git": true,
    "dist": false,
    "package-lock.json": true,
    "README.md": false
  }
}
```

### 4. Run FastSTFP
```bash
npm start
```

For live reload during development:
```bash
npm run dev
```

---

## ⚙️ Configuration Reference (`manage.json`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `host` | `string` | IP address or domain name of the remote Linux server / VPS. |
| `port` | `number` | Remote SSH port (default: `22`). |
| `username` | `string` | SSH username (e.g., `root` or `ubuntu`). |
| `password` | `string` | Password for SSH/SFTP authentication (optional if using private key). |
| `privateKeyPath`| `string` | Path to your SSH private key file (e.g., `id_rsa` or `~/.ssh/id_ed25519`). |
| `localDir` | `string` | Path to the local source directory. **Only contents inside this directory are transferred.** |
| `serverDir` | `string` | Destination path on the remote VPS (e.g., `/var/www/html`). |
| `concurrency` | `number` | Number of simultaneous file upload workers (default: `4`). |
| `ignore` | `object` | Key-value pairs where `true` excludes the item and `false` includes it. |

---

## 🛠️ Standalone Windows Build (`.exe`)

Build a standalone, single-file Windows executable with the embedded custom Cyber Neon app icon:

```bash
npm run build:exe
```

The build pipeline automatically creates the **`release/`** directory:
```text
release/
├── FastSTFP.exe    # Standalone executable (no Node.js or npm needed)
└── manage.json     # Ready-to-edit configuration file
```

Simply copy the `release/` folder to any Windows machine, fill in `manage.json`, and run **`FastSTFP.exe`**!

---

## 📂 Project Structure

```text
FastSTFP/
├── assets/
│   ├── icon.ico              # Multi-resolution Windows app icon (16x16 to 256x256)
│   └── logo.png              # High-resolution vector raster logo
├── scripts/
│   ├── build-exe.ts          # Standalone .exe compiler and packaging pipeline
│   └── make-ico.ps1          # PowerShell icon generator script
├── src/
│   ├── Config.ts             # Configuration loader, validator, and path normalizer
│   ├── Logger.ts             # TrueColor ANSI logger, braille spinner, and exit handler
│   ├── Protection.ts         # Binary SHA-256 fingerprint self-protection engine
│   └── Transfer.ts           # Recursive scanner and SFTP engine with progress bar
├── Index.ts                  # Main entry point and orchestration lifecycle
├── manage.example.json       # Template configuration file
├── package.json
└── tsconfig.json
```

---

## 🔒 Security & Privacy

> [!IMPORTANT]
> Your `manage.json` file contains sensitive server credentials and is strictly excluded by `.gitignore`. It will never be committed or pushed to your Git repository.

---

## 📝 License & Credits

This project is licensed under the **MIT License**.

Crafted with precision by **Coretify Studio**.
