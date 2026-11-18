import { createServer } from "node:http";
import {
  createReadStream,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const root = process.cwd();
const distDir = resolve(root, "dist");
const outPdf = resolve(distDir, "cv.pdf");
const publicPdf = resolve(root, "public", "cv.pdf");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.startsWith("/")) {
      if (existsSync(candidate)) return candidate;
    } else {
      const res = spawnSync("which", [candidate], { encoding: "utf8" });
      if (res.status === 0 && res.stdout.trim()) return res.stdout.trim();
    }
  }
  return null;
}

function runChromePdf(chrome, args, timeoutMs = 20000) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(chrome, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectRun(new Error(`Chrome PDF timed out after ${timeoutMs}ms\n${stderr}`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      rejectRun(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && existsSync(outPdf)) {
        resolveRun();
      } else {
        rejectRun(new Error(`Chrome exited with code ${code}\n${stderr}`));
      }
    });
  });
}

const chrome = findChrome();
if (!chrome) {
  console.warn("[generate-cv] Chrome/Chromium not found; skipping PDF generation.");
  process.exit(0);
}

const server = createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  let filePath = join(distDir, urlPath === "/" ? "index.html" : urlPath);
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
    Connection: "close",
  });
  createReadStream(filePath).pipe(res);
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
const userDataDir = mkdtempSync(join(tmpdir(), "ligouras-cv-chrome-"));
rmSync(outPdf, { force: true });

try {
  await runChromePdf(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--no-pdf-header-footer",
    `--user-data-dir=${userDataDir}`,
    `--print-to-pdf=${outPdf}`,
    `http://127.0.0.1:${port}/cv/`,
  ]);

  if (process.argv.includes("--sync-public")) {
    mkdirSync(resolve(root, "public"), { recursive: true });
    copyFileSync(outPdf, publicPdf);
    console.log("Synced public/cv.pdf");
  }
  console.log("Generated dist/cv.pdf");
} finally {
  server.close();
  rmSync(userDataDir, { recursive: true, force: true });
}
