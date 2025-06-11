import fs from "fs";
import path from "path";

export default function () {
  const albumDir = path.resolve("./data/album-of-the-day");

  if (!fs.existsSync(albumDir)) {
    return [];
  }

  return fs
    .readdirSync(albumDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const date = path.basename(f, ".json");
      const album = JSON.parse(fs.readFileSync(path.join(albumDir, f), "utf8"));

      return { date, ...album };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
