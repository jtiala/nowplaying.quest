import fs from "fs";
import path from "path";
import prettier from "prettier";
import { formatDate } from "./src/utils/date.js";

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

  eleventyConfig.addFilter("escapeHtml", (str) => {
    if (!str) {
      return "";
    }

    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  });

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
