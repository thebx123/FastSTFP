const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawnSync } = require("child_process");

function getGitToken() {
  const res = spawnSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
  });
  const lines = res.stdout.toString().split("\n");
  for (const line of lines) {
    if (line.startsWith("password=")) {
      return line.slice(9).trim();
    }
  }
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
}

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on("error", reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

function uploadAsset(uploadUrlTemplate, filePath, fileName, token) {
  return new Promise((resolve, reject) => {
    const fileStat = fs.statSync(filePath);
    const uploadUrl = uploadUrlTemplate.replace(/\{(\?.*)?\}$/, `?name=${encodeURIComponent(fileName)}`);
    const urlObj = new URL(uploadUrl);

    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          "User-Agent": "FastSTFP-Release-Uploader",
          "Content-Type": fileName.endsWith(".zip") ? "application/zip" : "application/vnd.microsoft.portable-executable",
          "Content-Length": fileStat.size,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`  Uploaded asset: ${fileName} (${(fileStat.size / (1024 * 1024)).toFixed(2)} MB)`);
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`Failed to upload ${fileName} (HTTP ${res.statusCode}): ${body}`));
          }
        });
      }
    );

    req.on("error", reject);

    const stream = fs.createReadStream(filePath);
    stream.pipe(req);
  });
}

async function main() {
  const token = getGitToken();
  if (!token) {
    console.error("Error: Could not retrieve GitHub token from git credentials.");
    process.exit(1);
  }

  const tag = "v1.0.0";
  const releaseName = "FastSTFP v1.0.0 - Windows Release";
  const releaseBody = `## 🚀 FastSTFP v1.0.0 - High-Performance SFTP Transfer System

### 📦 Release Assets
- **\`FastSTFP.exe\`** (42.1 MB) - Standalone, single-file Windows executable (no Node.js required)
- **\`FastSTFP-v1.0.0-windows-x64.zip\`** (16.8 MB) - Complete portable package with executable, \`manage.json\`, and \`upload/\` directory

---

### ✨ Features
- **Zero-Emoji ANSI 24-bit TrueColor Terminal Output** with smooth Braille spinners and live transfer progress bar
- **Concurrent Chunked Streaming** for ultra-fast multi-threaded uploads
- **Self-Healing Config System**: Automatically generates \`manage.json\` and repairs syntax errors or missing keys
- **Self-Binary Protection**: SHA-256 fingerprinting prevents the executable from uploading itself
- **Custom Cyber Neon App Icon**: Beautiful rounded squircle icon embedded directly into the PE binary
- **Windows Console Pause**: Keeps the console window open on completion or error until a keypress

---

### 💻 Quick Start
1. Download **\`FastSTFP-v1.0.0-windows-x64.zip\`** and extract it.
2. Open \`manage.json\` and enter your VPS credentials (\`host\`, \`username\`, \`password\`).
3. Place files in the \`upload\` folder.
4. Double-click **\`FastSTFP.exe\`** to sync your files!

*Made with ❤️ by Coretify Studio*`;

  console.log(`[1/3] Creating GitHub release for tag ${tag}...`);

  // Check if release already exists
  let release;
  try {
    const existing = await request({
      hostname: "api.github.com",
      path: `/repos/thebx123/FastSTFP/releases/tags/${tag}`,
      method: "GET",
      headers: {
        Authorization: `token ${token}`,
        "User-Agent": "FastSTFP-Release-Uploader",
        Accept: "application/vnd.github.v3+json",
      },
    });
    console.log(`      Found existing release id: ${existing.id}`);
    release = existing;
  } catch {
    // Create new release
    release = await request(
      {
        hostname: "api.github.com",
        path: "/repos/thebx123/FastSTFP/releases",
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          "User-Agent": "FastSTFP-Release-Uploader",
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
      },
      JSON.stringify({
        tag_name: tag,
        name: releaseName,
        body: releaseBody,
        draft: false,
        prerelease: false,
      })
    );
    console.log(`      Created release: ${release.html_url}`);
  }

  console.log(`[2/3] Uploading FastSTFP.exe to release...`);
  await uploadAsset(
    release.upload_url,
    path.join(__dirname, "../release/FastSTFP.exe"),
    "FastSTFP.exe",
    token
  );

  console.log(`[3/3] Uploading FastSTFP-v1.0.0-windows-x64.zip to release...`);
  await uploadAsset(
    release.upload_url,
    path.join(__dirname, "../dist/FastSTFP-v1.0.0-windows-x64.zip"),
    "FastSTFP-v1.0.0-windows-x64.zip",
    token
  );

  console.log("\n=======================================================");
  console.log("  FastSTFP Release Published Successfully!  ");
  console.log("=======================================================");
  console.log(`  Release URL: ${release.html_url}`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("Release failed:", err);
  process.exit(1);
});
