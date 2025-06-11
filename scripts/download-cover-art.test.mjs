import { spawn } from "child_process";
import fs from "fs";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import os from "os";
import path from "path";

const scriptPath = path.resolve("scripts/download-cover-art.js");
const coverArt =
  "https://coverartarchive.org/release/f95a4d58-aeaa-4e5c-b198-5e2145020d61/25342309824.jpg";

let tmpDir, albumJsonPath, expectedWebp;

function setupTest() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-art-test-"));
  albumJsonPath = path.join(tmpDir, "2025-06-12.json");
  expectedWebp = path.join(tmpDir, "2025-06-12.webp");
  const album = {
    artist: "Talk Talk",
    title: "Spirit of Eden",
    year: "1988",
    coverArt,
  };
  fs.writeFileSync(albumJsonPath, JSON.stringify(album, null, 2));
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  tmpDir = undefined;
});

test("download-cover-art.js downloads and optimizes cover art", async () => {
  setupTest();

  await new Promise((resolve, reject) => {
    const proc = spawn("node", [scriptPath, albumJsonPath], {
      stdio: "inherit",
    });

    proc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Script failed")),
    );
  });
  assert.ok(fs.existsSync(expectedWebp), "WebP file should exist");
  const stats = fs.statSync(expectedWebp);
  assert.ok(
    stats.size < 210 * 1024,
    `WebP file should be <210KB, got ${stats.size}`,
  );
});
