import { spawn } from "child_process";
import fs from "fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "enrich-album-test-"));
const albumOfTheDayDir = path.join(tmpDir, "album-of-the-day");
const albumPath = path.join(albumOfTheDayDir, "2025-06-11.json");
const scriptPath = path.join(__dirname, "enrich-album.js");

test("enrich-album.js enriches album data", async () => {
  const album = {
    date: "2025-06-11",
    row: "1173",
    artist: "Pink Floyd",
    title: "The Dark Side of the Moon",
    year: "1973",
    curatedLists: [
      "1001-albums-you-must-hear-before-you-die-all-editions",
      "rolling-stone-the-500-greatest-albums-of-all-time-all-editions",
    ],
  };

  fs.mkdirSync(albumOfTheDayDir, { recursive: true });
  fs.writeFileSync(albumPath, JSON.stringify(album, null, 2));

  await new Promise((resolve, reject) => {
    const proc = spawn("node", [scriptPath, albumPath], {
      stdio: "inherit",
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error("Script failed"));
      }
    });
  });

  const enriched = JSON.parse(fs.readFileSync(albumPath, "utf8"));

  assert.equal(enriched.artist, "Pink Floyd");
  assert.equal(enriched.title, "The Dark Side of the Moon");
  assert.ok(Array.isArray(enriched.genres), "Should have genres array");
  assert.ok("description" in enriched, "Should have description field");
  assert.ok(
    typeof enriched.coverArt === "string" || enriched.coverArt === null,
    "Should have coverArt string or null",
  );
  assert.ok(enriched.mbid, "Should have mbid");
  assert.ok(enriched.externalLinks, "Should have externalLinks object");
  assert.ok(
    typeof enriched.externalLinks.wikidata === "string" ||
      enriched.externalLinks.wikidata === null,
    "Should have wikidata link or null",
  );
  assert.ok(
    typeof enriched.externalLinks.wikipedia === "string" ||
      enriched.externalLinks.wikipedia === null,
    "Should have wikipedia link or null",
  );
  assert.ok(
    typeof enriched.externalLinks.discogs === "string" ||
      enriched.externalLinks.discogs === null,
    "Should have discogs link or null",
  );
  assert.ok(
    typeof enriched.externalLinks.rateyourmusic === "string" ||
      enriched.externalLinks.rateyourmusic === null,
    "Should have rateyourmusic link or null",
  );
  assert.ok(enriched.streamingLinks, "Should have streamingLinks");
  assert.ok(
    typeof enriched.streamingLinks.spotify === "string",
    "Should have Spotify link",
  );
  assert.ok(
    typeof enriched.streamingLinks.appleMusic === "string",
    "Should have Apple Music link",
  );
  assert.ok(
    typeof enriched.streamingLinks.youtubeMusic === "string",
    "Should have YouTube Music link",
  );
  assert.ok(
    typeof enriched.streamingLinks.youtube === "string",
    "Should have YouTube link",
  );
  assert.ok(
    typeof enriched.streamingLinks.tidal === "string",
    "Should have Tidal link",
  );
  assert.ok(
    typeof enriched.streamingLinks.deezer === "string",
    "Should have Deezer link",
  );
  assert.ok(
    typeof enriched.streamingLinks.amazonMusic === "string",
    "Should have Amazon Music link",
  );
});
