#!/usr/bin/env node
/**
 * download-cover-art.js
 *
 * Downloads and optimizes the cover art for a given album JSON file.
 * Saves the image as WebP (640x640px, max 200 KB) in the same directory as the JSON file, with the same basename.
 *
 * Usage:
 *   node download-cover-art.js <path-to-album-json>
 */
import fs from "fs";
import https from "https";
import path from "path";
import sharp from "sharp";

const albumPath = process.argv[2];
if (!albumPath) {
  console.error("Usage: node download-cover-art.js <path-to-album-json>");
  process.exit(1);
}

const album = JSON.parse(fs.readFileSync(albumPath, "utf8"));
const coverUrl = album.coverArt;

if (!coverUrl) {
  console.error("No coverArt field in album JSON.");
  process.exit(0);
}

const outDir = path.dirname(albumPath);
const outBase = path.basename(albumPath, ".json") + ".webp";
const outPath = path.join(outDir, outBase);

function downloadImage(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    let redirects = 0;

    function request(u) {
      https
        .get(u, (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirects < maxRedirects
          ) {
            redirects++;
            request(
              res.headers.location.startsWith("http")
                ? res.headers.location
                : new URL(res.headers.location, u).toString(),
            );
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Failed to download image: ${res.statusCode}`));
            return;
          }

          const data = [];

          res.on("data", (chunk) => data.push(chunk));
          res.on("end", () => resolve(Buffer.concat(data)));
        })
        .on("error", reject);
    }
    request(url);
  });
}

async function main() {
  try {
    const imgBuffer = await downloadImage(coverUrl);

    // Optimize to 640x640px, WebP, max 200 KB
    let webpBuffer = await sharp(imgBuffer)
      .resize(640, 640, { fit: "inside" })
      .webp({ quality: 80 })
      .toBuffer();

    // If still too large, reduce quality
    let quality = 80;
    while (webpBuffer.length > 200 * 1024 && quality > 40) {
      quality -= 10;
      webpBuffer = await sharp(imgBuffer)
        .resize(640, 640, { fit: "inside" })
        .webp({ quality })
        .toBuffer();
    }

    fs.writeFileSync(outPath, webpBuffer);

    console.log(
      `Saved optimized cover art: ${outPath} (${webpBuffer.length} bytes, quality ${quality})`,
    );

    process.exit(0);
  } catch (err) {
    console.error("Error downloading or optimizing cover art:", err);
    process.exit(0);
  }
}

main();
