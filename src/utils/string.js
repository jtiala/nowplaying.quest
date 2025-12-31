export function splitStringToRows(str, maxRows = 3, maxLen = 24) {
  if (!str || typeof str !== "string" || str.trim() === "") {
    return [];
  }

  const words = str.split(" ");
  const rows = [];
  let current = "";
  let wordIdx = 0;

  while (wordIdx < words.length && rows.length < maxRows) {
    let word = words[wordIdx];

    while (word.length > maxLen) {
      if (current.length > 0) {
        rows.push(current);
        current = "";
        if (rows.length === maxRows) {
          break;
        }
      }

      rows.push(word.slice(0, maxLen));
      word = word.slice(maxLen);

      if (rows.length === maxRows) {
        break;
      }
    }

    if (rows.length === maxRows) {
      break;
    }

    if (current.length > 0 && (current + " " + word).length > maxLen) {
      rows.push(current);
      current = "";

      if (rows.length === maxRows) {
        break;
      }
    }

    current = current.length > 0 ? current + " " + word : word;
    wordIdx++;
  }

  if (rows.length < maxRows && current.length > 0) {
    rows.push(current);
  }

  if (wordIdx < words.length) {
    let last = rows[maxRows - 1];

    rows[maxRows - 1] = last.slice(0, maxLen - 1) + "…";
  }

  return rows;
}

export function normalizeString(
  str,
  lowercase = true,
  stripAllSpecialChars = false,
) {
  if (!str || typeof str !== "string" || str.trim() === "") {
    return "";
  }

  const casing = lowercase ? str.toLowerCase() : str;
  const replaces = casing
    .replace(/[`‘’‚‛‹›′]/g, "'")
    .replace(/[“”„‟«»″]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[…]/g, "...")
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/[⁄∕]/g, "/")
    .replace(/[＼﹨]/g, "\\")
    .replace(/[♯]/g, "#")
    .replace(/[＆﹠]/g, "&");
  const normalized = replaces.normalize("NFD");
  const stripped = stripAllSpecialChars
    ? normalized.replace(
        /[^a-z0-9\u00c0-\u024f\u0370-\u03ff\u1f00-\u1fff ]+/gi,
        "",
      )
    : normalized.replace(
        /[^a-z0-9\u00c0-\u024f\u0370-\u03ff\u1f00-\u1fff.,'\-&#*=\/$ ]+/gi,
        "",
      );

  return stripped.replace(/\s+/g, " ").trim();
}

export function escapeHtml(str) {
  if (!str || typeof str !== "string" || str.trim() === "") {
    return "";
  }

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function urlEncode(str) {
  if (!str || typeof str !== "string" || str.trim() === "") {
    return "";
  }

  try {
    return new URL(str).toString();
  } catch (e) {
    return "";
  }
}
