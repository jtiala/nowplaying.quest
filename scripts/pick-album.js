#!/usr/bin/env node
/**
 * pick-album.js
 *
 * Script to pick a random unused album, rotate history if needed, and update history.csv
 *
 * CSV Format:
 *   albums.csv: artist,title,year (all quoted except year, first row is header)
 *   history.csv: date,row,artist,title,year (date yyyy-mm-dd, row is 1-based row number in albums.csv, first row is header)
 *
 * Usage:
 *   node pick-album.js <date>
 *
 * Arguments:
 *   <date>   Date as yyyy-mm-dd (required)
 */

import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const date = process.argv[2];

if (!date) {
  console.error("Usage: node pick-album.js <date>");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = process.env.DATA_DIR || path.join(__dirname, "../data");
const albumsPath = path.join(dataDir, "albums.csv");
const historyPath = path.join(dataDir, "history.csv");
const historyDir = path.dirname(historyPath);
const curatedListsDir = path.join(historyDir, "curated-lists");
const albumOfTheDayDir = path.join(dataDir, "album-of-the-day");

function readAlbums(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, "utf8");
  const records = parse(content, { columns: false, relaxColumnCount: true });

  return records.slice(1).map((fields, idx) => {
    const [artist, title, year] = fields;

    return {
      row: (idx + 2).toString(), // +2: CSV row number (1-based, including header)
      artist,
      title,
      year,
    };
  });
}

function readHistory(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const rows = lines.slice(1).filter(Boolean);

  return rows.map((line) => {
    const [date, row, artist, title, year] = parse(line, {
      relaxColumnCount: true,
    })[0];

    return { date, row, artist, title, year };
  });
}

function writeHistory(filePath, rows) {
  const header = "date,row,artist,title,year\n";
  const body = rows
    .map((row) => {
      return [
        row.date,
        row.row,
        `"${row.artist.replace(/"/g, '""')}"`,
        `"${row.title.replace(/"/g, '""')}"`,
        row.year,
      ].join(",");
    })
    .join("\n");

  fs.writeFileSync(filePath, header + (body ? body + "\n" : ""));
}

function rotateHistory() {
  let i = 1;
  let rotated;

  do {
    rotated = path.join(historyDir, `history.${i}.csv`);
    i++;
  } while (fs.existsSync(rotated));

  fs.renameSync(historyPath, rotated);
}

function getCuratedListsForAlbum(artist, title, year) {
  let slugs = [];

  if (fs.existsSync(curatedListsDir)) {
    const curatedFiles = fs
      .readdirSync(curatedListsDir)
      .filter((f) => f.endsWith(".csv"));

    for (const file of curatedFiles) {
      const filePath = path.join(curatedListsDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const records = parse(content, {
        columns: false,
        relaxColumnCount: true,
      });

      for (let i = 1; i < records.length; i++) {
        const [a, t, y] = records[i];

        if (a === artist && t === title && y === year) {
          slugs.push(file.replace(/\.csv$/, ""));
          break;
        }
      }
    }
  }

  return slugs;
}

function main() {
  const albums = readAlbums(albumsPath);

  if (albums.length === 0) {
    throw new Error("No albums found in albums.csv");
  }

  const history = readHistory(historyPath);
  const existing = history.find((row) => row.date === date);
  let album;

  if (existing) {
    const curatedLists = getCuratedListsForAlbum(
      existing.artist,
      existing.title,
      existing.year,
    );
    album = {
      date,
      row: existing.row,
      artist: existing.artist,
      title: existing.title,
      year: existing.year,
      curatedLists,
    };

    console.log(`Found existing album for the date:`, album);
  } else {
    const usedRows = new Set(history.map((row) => row.row));
    const unused = albums.filter((row) => !usedRows.has(row.row));

    if (unused.length === 0) {
      rotateHistory();
      writeHistory(historyPath, []);

      console.log("All albums used. Rotated history. Starting over.");

      return main();
    }

    const picked = unused[Math.floor(Math.random() * unused.length)];
    const curatedLists = getCuratedListsForAlbum(
      picked.artist,
      picked.title,
      picked.year,
    );
    album = {
      date,
      row: picked.row,
      artist: picked.artist,
      title: picked.title,
      year: picked.year,
      curatedLists,
    };

    history.push(album);
    writeHistory(historyPath, history);
    console.log(`Picked album (out of ${unused.length} unused):`, album);
  }

  const albumPath = path.join(albumOfTheDayDir, `${date}.json`);

  if (!fs.existsSync(albumOfTheDayDir)) {
    fs.mkdirSync(albumOfTheDayDir, { recursive: true });
  }

  fs.writeFileSync(
    albumPath,
    JSON.stringify(
      {
        artist: album.artist,
        title: album.title,
        year: album.year,
        curatedLists: album.curatedLists,
      },
      null,
      2,
    ),
  );
}

main();
