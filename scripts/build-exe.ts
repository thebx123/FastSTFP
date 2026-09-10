import esbuild from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import rcedit from "rcedit";

async function build() {
  console.log("\n[Build] Starting FastSTFP Windows Executable Build Pipeline...\n");

  const rootDir = process.cwd();
  const releaseDir = path.join(rootDir, "release");
  const distDir = path.join(rootDir, "dist");
  const assetsDir = path.join(rootDir, "assets");
  const iconPath = path.join(assetsDir, "icon.ico");
  const exePath = path.join(releaseDir, "FastSTFP.exe");

  fs.mkdirSync(releaseDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });

  // 1. Bundle TypeScript to single CommonJS bundle
  console.log("[1/4] Bundling TypeScript with esbuild...");
  await esbuild.build({
    entryPoints: ["Index.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: "dist/bundle.cjs",
    external: ["cpu-features"],
    loader: {
      ".node": "empty",
    },
    sourcemap: false,
    minify: false,
  });
  console.log("      Bundle created: dist/bundle.cjs");

  // 2. Prepare Icon & Base Node Binary for pkg
  console.log("[2/4] Preparing custom Cyber Logo Icon and base binary...");

  // Ensure latest icon.ico is freshly generated with rounded corners and zoomed graphics
  const makeIcoScript = path.join(rootDir, "scripts", "make-ico.ps1");
  if (fs.existsSync(makeIcoScript)) {
    try {
      execSync(`powershell -ExecutionPolicy Bypass -File "${makeIcoScript}"`, { stdio: "pipe" });
      console.log("      High-resolution rounded/zoomed icon generated successfully!");
    } catch (err: any) {
      console.warn("      Warning: Could not regenerate icon:", err?.message || err);
    }
  }

  const userProfile = process.env.USERPROFILE || process.env.HOME || "";
  const cacheDir = path.join(userProfile, ".pkg-cache", "v3.5");
  const fetchedPath = path.join(cacheDir, "fetched-v20.20.2-win-x64");
  const builtPath = path.join(cacheDir, "built-v20.20.2-win-x64");

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // If fetched binary doesn't exist yet, download it once
  if (!fs.existsSync(fetchedPath)) {
    console.log("      Fetching base Node 20 binary...");
    execSync("npx @yao-pkg/pkg-fetch -n node20 -p win -a x64", { stdio: "inherit" });
  }

  // Always start from a clean fetched base binary to prevent corrupted PE headers
  if (fs.existsSync(fetchedPath)) {
    fs.copyFileSync(fetchedPath, builtPath);
  }

  if (fs.existsSync(builtPath) && fs.existsSync(iconPath)) {
    try {
      await rcedit(builtPath, {
        icon: iconPath,
        "version-string": {
          ProductName: "FastSTFP",
          FileDescription: "FastSTFP - High-Performance SFTP Transfer System",
          CompanyName: "FastSTFP",
          LegalCopyright: "2026 FastSTFP",
        },
        "file-version": "1.0.0.0",
        "product-version": "1.0.0.0",
      });
      console.log("      Icon and metadata embedded into base binary successfully!");
    } catch (err: any) {
      console.warn("      Warning: Could not stamp icon on base binary:", err?.message || err);
    }
  }

  // 3. Package into standalone binary with pkg
  console.log("[3/4] Compiling standalone Windows .exe with pkg (Node 20)...");
  execSync(
    `npx @yao-pkg/pkg dist/bundle.cjs --targets node20-win-x64 --output release/FastSTFP.exe -b`,
    { stdio: "inherit" }
  );

  // 4. Prepare release folder with manage.json and upload directory
  console.log("[4/4] Preparing release folder...");
  const releaseManagePath = path.join(releaseDir, "manage.json");
  const releaseUploadDir = path.join(releaseDir, "upload");

  if (!fs.existsSync(releaseUploadDir)) {
    fs.mkdirSync(releaseUploadDir, { recursive: true });
  }

  const manageTemplate = {
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

  if (!fs.existsSync(releaseManagePath)) {
    fs.writeFileSync(
      releaseManagePath,
      JSON.stringify(manageTemplate, null, 2),
      "utf-8"
    );
  }
  fs.writeFileSync(
    path.join(releaseDir, "manage.example.json"),
    JSON.stringify(manageTemplate, null, 2),
    "utf-8"
  );

  // 5. Compute SHA-256 Hash of the final FastSTFP.exe
  const exeBuffer = fs.readFileSync(exePath);
  const sha256 = crypto.createHash("sha256").update(exeBuffer).digest("hex");

  console.log("\n=======================================================");
  console.log("  FastSTFP Standalone Executable Build Succeeded!  ");
  console.log("=======================================================");
  console.log(`  Executable: release/FastSTFP.exe (${(exeBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`  SHA-256:    ${sha256}`);
  console.log(`  Config:     release/manage.json`);
  console.log("=======================================================\n");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
