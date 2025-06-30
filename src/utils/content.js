export function toHashtag(str, isGenre = false) {
  if (!str) {
    return null;
  }

  if (isGenre) {
    str = str.replace(/r&b/i, "RnB");
  }

  // Replace dashes with spaces
  str = str.replace(/-/g, " ");
  // Replace & the with 'AndThe'
  str = str.replace(/& (the)\b/gi, "AndThe");
  // Remove all non-alphanumeric (except spaces and accented letters)
  str = str.replace(/[^\p{L}\p{N} ]+/gu, "");
  // Remove extra spaces
  str = str.replace(/\s+/g, " ").trim();
  // Split words, capitalize first letter, join
  str = str
    .split(" ")
    .map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1))
    .join("");

  return str ? `#${str}` : null;
}

export function generatePlatformHashtags(platform) {
  const hashtags = [
    "#NowPlayingQuest",
    "#NowPlaying",
    "#AlbumOfTheDay",
    "#Music",
  ];

  if (platform === "bluesky") {
    hashtags.push("#MusicSky");
  }

  return hashtags;
}

export function generateAlbumHashtags(album) {
  const hashtags = [];

  if (album.genres && Array.isArray(album.genres)) {
    for (const genre of album.genres) {
      const tag = toHashtag(genre, true);

      if (tag) {
        hashtags.push(tag);
      }
    }
  }

  hashtags.push(toHashtag(album.artist));
  hashtags.push(toHashtag(album.title));

  return [...new Set(hashtags.filter(Boolean))];
}

export function generateCaption({
  album,
  dateStr,
  listenStr = undefined,
  hashtags = [],
  isShortEnough = (s) => true,
}) {
  let caption = `${album.title} by ${album.artist} (${album.year}) is the daily album for ${dateStr}.`;

  if (listenStr) {
    caption += `\n\n${listenStr}`;
  }

  if (hashtags.length) {
    caption += `\n\n${hashtags.join(" ")}`;
  }

  // Split into tokens, preserving newlines and spaces
  let tokens = caption.match(/([^\s\n]+|\n\n|\n|\s+)/g) || [];

  function joinTokens(arr) {
    // Remove leading/trailing whitespace/newlines
    let s = arr.join("");

    return s.replace(/^(\s|\n)+|(\s|\n)+$/g, "");
  }

  while (!isShortEnough(joinTokens(tokens)) && tokens.length > 1) {
    // Remove last non-separator token and any trailing whitespace/newlines
    let i = tokens.length - 1;

    while (
      i >= 0 &&
      (/^\s*$/.test(tokens[i]) || tokens[i] === "\n" || tokens[i] === "\n\n")
    ) {
      i--;
    }

    if (i >= 0) {
      tokens.splice(i, 1);
    }

    // Remove trailing whitespace/newlines
    while (
      tokens.length > 0 &&
      (/^\s*$/.test(tokens[tokens.length - 1]) ||
        tokens[tokens.length - 1] === "\n" ||
        tokens[tokens.length - 1] === "\n\n")
    ) {
      tokens.pop();
    }
  }

  return joinTokens(tokens);
}
