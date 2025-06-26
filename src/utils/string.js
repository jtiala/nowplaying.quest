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
