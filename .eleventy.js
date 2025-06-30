import fs from "fs";
import path from "path";
import prettier from "prettier";
import {
  generateAlbumHashtags,
  generateCaption,
  generatePlatformHashtags,
} from "./src/utils/content.js";
import { formatDate } from "./src/utils/date.js";
import { escapeHtml } from "./src/utils/string.js";

const outdir = "_site";

function copyImages() {
  const srcDir = "data/album-of-the-day";

  if (fs.existsSync(srcDir)) {
    for (const file of fs.readdirSync(srcDir)) {
      if (file.endsWith(".webp")) {
        const date = path.basename(file, ".webp");
        const destDir = path.join(outdir, date);

        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(
          path.join(srcDir, file),
          path.join(destDir, "cover-art.webp"),
        );
      }

      if (file.endsWith("-og.png")) {
        const date = path.basename(file, "-og.png");
        const destDir = path.join(outdir, date);

        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, "og.png"));
      }
    }
  }
}

export default function (eleventyConfig) {
  eleventyConfig.on("beforeBuild", () => {
    if (fs.existsSync(outdir)) {
      fs.rmSync(outdir, { recursive: true, force: true });
    }

    copyImages();
  });

  eleventyConfig.on("beforeWatch", () => {
    copyImages();
  });

  eleventyConfig.addTransform("prettier", function (content) {
    if ((this.page.outputPath || "").endsWith(".html")) {
      return prettier.format(content, {
        bracketSameLine: true,
        printWidth: 512,
        parser: "html",
        tabWidth: 2,
      });
    }

    return content;
  });

  eleventyConfig.addFilter("format_date", formatDate);
  eleventyConfig.addFilter("escape_html", escapeHtml);
  eleventyConfig.addFilter(
    "generate_caption",
    function (album, dateStr, url, platform) {
      const hashtags = [
        ...generatePlatformHashtags(platform),
        ...generateAlbumHashtags(album),
      ];

      const listenStr =
        platform === "instagram"
          ? "Listen now — Link in bio."
          : `Listen now: ${url}`;

      const isShortEnough = (s) => {
        if (platform === "x") {
          return s.length <= 280;
        }

        return true;
      };

      return generateCaption({
        album,
        dateStr,
        listenStr,
        hashtags,
        isShortEnough,
      });
    },
  );

  eleventyConfig.addPassthroughCopy({ "src/assets/*": "." });
  eleventyConfig.addPassthroughCopy({ "src/styles/*": "." });

  eleventyConfig.addWatchTarget("data/album-of-the-day");
  eleventyConfig.ignores.add("src/_*/**");
  eleventyConfig.ignores.add("src/_*");

  return {
    dir: {
      input: "src",
      output: outdir,
      data: "_data",
    },
  };
}
