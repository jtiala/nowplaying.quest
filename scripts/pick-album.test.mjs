import { spawn } from "child_process";
import fs from "fs";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, "pick-album.js");

let tmpDir,
  albumsCsv,
  historyCsv,
  curatedListsDir,
  albumOfTheDayDir,
  albumJsonPath;

function setupTestPaths(date) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pick-album-test-"));
  albumsCsv = path.join(tmpDir, "albums.csv");
  historyCsv = path.join(tmpDir, "history.csv");
  curatedListsDir = path.join(tmpDir, "curated-lists");
  albumOfTheDayDir = path.join(tmpDir, "album-of-the-day");
  albumJsonPath = path.join(albumOfTheDayDir, `${date}.json`);
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

function resetTestData({ albums, history, curatedLists }) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(albumsCsv, albums);
  fs.writeFileSync(historyCsv, history);

  if (curatedLists) {
    fs.mkdirSync(curatedListsDir, { recursive: true });

    for (const [slug, content] of Object.entries(curatedLists)) {
      fs.writeFileSync(path.join(curatedListsDir, `${slug}.csv`), content);
    }
  }
}

test("picks a random unused album and appends to history, finds curated lists, and updates album-of-the-day/[date].json", async () => {
  const date = "2025-06-12";
  setupTestPaths(date);
  resetTestData({
    albums: 'artist,title,year\n"A","A",2000\n"B","B",2001\n',
    history: "date,row,artist,title,year\n",
    curatedLists: {
      list1: 'artist,title,year\n"A","A",2000\n',
      list2: 'artist,title,year\n"B","B",2001\n',
    },
  });

  await new Promise((resolve, reject) => {
    const proc = spawn("node", [scriptPath, date], {
      stdio: "inherit",
      env: { ...process.env, DATA_DIR: tmpDir },
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error("Script failed"));
      }
    });
  });

  const historyRows = fs.readFileSync(historyCsv, "utf8").trim().split("\n");
  assert.strictEqual(historyRows.length, 2); // header + 1
  const album = JSON.parse(fs.readFileSync(albumJsonPath, "utf8"));
  assert.ok(["A", "B"].includes(album.artist));

  if (album.artist === "A") {
    assert.deepStrictEqual(album.curatedLists, ["list1"]);
  } else {
    assert.deepStrictEqual(album.curatedLists, ["list2"]);
  }
});

test("rotates history when all albums are used and resets history.csv", async () => {
  const date = "2025-06-13";
  setupTestPaths(date);
  resetTestData({
    albums: 'artist,title,year\n"A","A",2000\n"B","B",2001\n',
    history:
      'date,row,artist,title,year\n2025-06-10,2,"A","A",2000\n2025-06-10,3,"B","B",2001\n',
    curatedLists: {},
  });

  await new Promise((resolve, reject) => {
    const proc = spawn("node", [scriptPath, date], {
      stdio: "inherit",
      env: { ...process.env, DATA_DIR: tmpDir },
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error("Script failed"));
      }
    });
  });

  // history.csv should have header + 1 new entry
  const lines = fs.readFileSync(historyCsv, "utf8").trim().split("\n");
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0], "date,row,artist,title,year");
  // history.1.csv should exist and have both rows
  const rotated = path.join(tmpDir, "history.1.csv");
  assert.ok(fs.existsSync(rotated));
  const rotatedLines = fs.readFileSync(rotated, "utf8").trim().split("\n");
  assert.strictEqual(rotatedLines.length, 3);
  assert.strictEqual(rotatedLines[0], "date,row,artist,title,year");
});

test("throws if albums.csv is empty", async () => {
  setupTestPaths();
  resetTestData({
    albums: "artist,title,year\n",
    history: "date,row,artist,title,year\n",
    curatedLists: {},
  });

  await assert.rejects(async () => {
    await new Promise((resolve, reject) => {
      const proc = spawn("node", [scriptPath], {
        stdio: "inherit",
        env: { ...process.env, DATA_DIR: tmpDir },
      });

      proc.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error("Script failed"));
        }
      });
    });
  });
});
