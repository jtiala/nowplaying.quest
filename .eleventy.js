import fs from "fs";
import path from "path";
import prettier from "prettier";

const outdir = "_site";

function copyCoverArt() {
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
    }
  }
}

export default function (eleventyConfig) {
  eleventyConfig.on("beforeBuild", () => {
    if (fs.existsSync(outdir)) {
      fs.rmSync(outdir, { recursive: true, force: true });
    }

    copyCoverArt();
  });

  eleventyConfig.on("beforeWatch", () => {
    copyCoverArt();
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

  eleventyConfig.addFilter("format_date", function (dateStr) {
    if (!dateStr) {
      return "";
    }

    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const [year, month, day] = dateStr.split("-");
    const monthName = months[parseInt(month) - 1];
    const dayNum = parseInt(day, 10);

    return `${monthName} ${dayNum}, ${year}`;
  });

  eleventyConfig.addPassthroughCopy({ "src/assets/*": "." });

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
