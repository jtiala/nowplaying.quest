import fs from "fs";
import path from "path";

export default function () {
  const albumDir = path.resolve("./data/album-of-the-day");

  if (!fs.existsSync(albumDir)) {
    return [];
  }

  const includeFuture = process.env.INCLUDE_FUTURE_ALBUMS === "true";

  return fs
    .readdirSync(albumDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const date = path.basename(f, ".json");
      const album = JSON.parse(fs.readFileSync(path.join(albumDir, f), "utf8"));

      return { date, ...album };
    })
    .filter((a) => {
      if (includeFuture) {
        return true;
      }

      return new Date(`${a.date}T00:00:00`) <= new Date();
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
