#!/usr/bin/env node
/**
 * generate-og-image.js
 *
 * Generates an Open Graph image for a given album JSON file.
 * Saves the image as PNG (600x315px) in the same directory as the JSON file, with the same basename but with `-og` suffix.
 *
 * Usage:
 *   node generate-og-image.js <path-to-album-json>
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { formatDate } from "../src/utils/date.js";
import { splitStringToRows } from "../src/utils/string.js";

const albumPath = process.argv[2];
if (!albumPath) {
  console.error("Usage: node generate-og-image.js <path-to-album-json>");
  process.exit(1);
}
const album = JSON.parse(fs.readFileSync(albumPath, "utf8"));

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.dirname(albumPath);
const outBase = path.basename(albumPath, ".json") + "-og.png";
const outPath = path.join(outDir, outBase);

const logoPath = path.resolve(
  __dirname,
  "../branding/combination-mark-horizontal.png",
);
let coverPath = undefined;
const coverArt = path.join(outDir, path.basename(albumPath, ".json") + ".webp");
if (fs.existsSync(coverArt)) {
  coverPath = coverArt;
} else {
  coverPath = path.resolve(__dirname, "../branding/default-cover-art.webp");
}

async function main() {
  try {
    const width = 600;
    const height = 315;
    const bgColor = "#001d3d";
    const margin = 24;
    const coverSize = height - margin * 2;
    const detailsLeft = margin + coverSize + margin;
    const detailsWidth = width - detailsLeft - margin;

    const logoResized = await sharp(logoPath)
      .resize({ width: detailsWidth, fit: "contain" })
      .toBuffer();
    const logoMeta = await sharp(logoResized).metadata();
    const logoHeight = logoMeta.height || 0;

    const coverBuffer = await sharp(coverPath)
      .resize(coverSize, coverSize, { fit: "cover" })
      .toBuffer();

    let composite = [
      {
        input: coverBuffer,
        top: margin,
        left: margin,
      },
      {
        input: logoResized,
        top: margin,
        left: detailsLeft,
      },
    ];

    const dateStr = formatDate(path.basename(albumPath, ".json"));

    const titleRows = splitStringToRows(album.title, 3, 24);
    const artist = splitStringToRows(album.artist, 1, 28);
    const year = album.year;

    const textHeight = height - margin * 2.5 - logoHeight; // 205
    const textTop = logoHeight + margin + margin / 2;

    const rowYs = [68, 94, 120];
    let titleRowYs;

    if (titleRows.length === 1) {
      titleRowYs = [rowYs[1]];
    } else if (titleRows.length === 2) {
      titleRowYs = [rowYs[0] + 15, rowYs[2] - 15];
    } else {
      titleRowYs = rowYs;
    }

    const textSvg = `<svg width="${detailsWidth}" height="${textHeight}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .date { font-family: 'Playfair', serif; font-size: 18px; fill: #fff; font-weight: 300; font-style: italic; text-anchor: middle; }
        .title { font-family: 'Playfair Display', serif; font-size: 22px; fill: #ffc300; font-weight: 900; text-anchor: middle; }
        .artist { font-family: 'Playfair Display', serif; font-size: 20px; fill: #ffd60a; font-weight: 600; text-anchor: middle; }
      </style>
      <text x="${detailsWidth / 2}" y="28" class="date">Daily album for ${dateStr}</text>
      ${titleRows.map((row, i) => `<text x="${detailsWidth / 2}" y="${titleRowYs[i]}" class="title">${row}</text>`).join("")}
      <text x="${detailsWidth / 2}" y="158" class="artist">by</text>
      <text x="${detailsWidth / 2}" y="181" class="artist">${artist}</text>
      <text x="${detailsWidth / 2}" y="202" class="artist">(${year})</text>
    </svg>`;
    const textBuffer = Buffer.from(textSvg);
    composite.push({
      input: textBuffer,
      top: textTop,
      left: detailsLeft,
    });

    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: bgColor,
      },
    })
      .composite(composite)
      .webp({ quality: 90 })
      .toFile(outPath);

    console.log(`OG image generated: ${outPath}`);
    process.exit(0);
  } catch (err) {
    console.error("Error generating OG image:", err);
    process.exit(0);
  }
}

main();
