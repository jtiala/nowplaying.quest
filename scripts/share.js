#!/usr/bin/env node
/**
 * share.js
 *
 * Shares an album to Instagram, Bluesky, and Reddit. Adds the most popular song of the album to a Spotify playlist.
 *
 * Usage:
 *   node share.js <path-to-album-json>
 */
import fs from "fs";
import path from "path";
import { formatDate } from "../src/utils/date.js";

const albumPath = process.argv[2];
if (!albumPath) {
  console.error("Usage: node share.js <path-to-album-json>");
  process.exit(1);
}
const album = JSON.parse(fs.readFileSync(albumPath, "utf8"));

const __dirname = path.dirname(new URL(import.meta.url).pathname);

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureAlbumPageIsLive(date) {
  const baseUrl = process.env.SITE_URL;
  const url = `${baseUrl.replace(/\/$/, "")}/${date}/`;
  const maxRetries = 10;
  const delayMs = 60 * 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { method: "GET" });

      if (res.ok) {
        console.log("The album page is live.");

        return true;
      }
    } catch (err) {
      console.log(`Attempt ${attempt}: Error fetching ${url}:`, err);
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

async function getInstagramImagePath(date) {
  const dataDir = path.resolve(__dirname, "../data/album-of-the-day");
  const brandingDir = path.resolve(__dirname, "../branding");
  const coverArt = path.join(dataDir, `${date}.webp`);
  const defaultCover = path.join(brandingDir, "default-cover-art.webp");

  if (await fileExists(coverArt)) {
    return coverArt;
  }

  return defaultCover;
}

async function shareToInstagram(imagePath, caption) {
  // TODO: Implement Instagram sharing via API or service
  console.log(
    `[Instagram] Would post image: ${imagePath} with caption: ${caption}`,
  );
}

async function shareToBluesky(text) {
  // TODO: Implement Bluesky sharing
  console.log(`[Bluesky] Would post: ${text}`);
}

async function shareToReddit(title, text) {
  // TODO: Implement Reddit sharing
  console.log(`[Reddit] Would post: ${title}\n${text}`);
}

async function getSpotifyAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn(
      "Spotify credentials not set, skipping direct Spotify lookup.",
    );

    return null;
  }

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(clientId + ":" + clientSecret).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });

  if (!tokenRes.ok) {
    return null;
  }

  const tokenData = await tokenRes.json();

  return tokenData.access_token;
}

async function getSpotifyUserAccessTokenWithRefresh() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Spotify client credentials or refresh token missing");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(clientId + ":" + clientSecret).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh Spotify user access token");
  }

  const data = await res.json();

  return data.access_token;
}

async function getSpotifyAlbumId(url) {
  const match = url.match(/\/album\/([a-zA-Z0-9]+)/);

  return match ? match[1] : null;
}

async function addMostPopularSongToSpotifyPlaylist(album) {
  const playlistId = process.env.SPOTIFY_PLAYLIST_ID;

  if (!playlistId) {
    console.log("Spotify playlist ID missing, skipping playlist add.");
    return;
  }

  if (
    !album.streamingLinks ||
    !album.streamingLinks.spotify ||
    album.streamingLinks.spotify.includes("/search/")
  ) {
    console.log("No direct Spotify album link, skipping playlist add.");
    return;
  }

  const albumId = await getSpotifyAlbumId(album.streamingLinks.spotify);

  if (!albumId) {
    console.log("Could not extract Spotify album ID.");
    return;
  }

  const accessToken = await getSpotifyAccessToken();
  const tracksRes = await fetch(
    `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!tracksRes.ok) {
    console.log("Failed to fetch album tracks from Spotify.");
    return;
  }

  const tracksData = await tracksRes.json();
  const trackIds = tracksData.items.map((t) => t.id);
  const tracksInfoRes = await fetch(
    `https://api.spotify.com/v1/tracks?ids=${trackIds.slice(0, 50).join(",")}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!tracksInfoRes.ok) {
    console.log("Failed to fetch track info from Spotify.");
    return;
  }

  const tracksInfo = await tracksInfoRes.json();
  const mostPopular = tracksInfo.tracks.reduce(
    (max, t) => (t.popularity > (max?.popularity || 0) ? t : max),
    null,
  );

  if (!mostPopular) {
    console.log("No tracks found to add to playlist.");
    return;
  }

  let userToken;
  try {
    userToken = await getSpotifyUserAccessTokenWithRefresh();
  } catch (err) {
    console.log("Failed to get user access token:", err);
    return;
  }

  const addRes = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: [mostPopular.uri] }),
    },
  );

  if (addRes.ok) {
    console.log(`Added most popular track to playlist: ${mostPopular.name}`);
  } else {
    console.log(
      "Failed to add track to playlist:",
      addRes.status,
      addRes.statusText,
    );
  }
}

async function main() {
  try {
    const date = path.basename(albumPath, ".json");

    if (!(await ensureAlbumPageIsLive(date))) {
      throw new Error("Album page not live.");
    }

    const instagramImage = await getInstagramImagePath(date);

    if (!instagramImage) {
      throw new Error(`Instagram image not found for date: ${date}`);
    }

    const baseUrl = process.env.SITE_URL;
    const albumUrl = `${baseUrl.replace(/\/$/, "")}/${date}/`;
    const dateStr = formatDate(date);
    const caption = `${album.title} by ${album.artist} (${album.year}) | Daily album for ${dateStr}`;

    await shareToInstagram(instagramImage, `${caption}\n\n${albumUrl}`);
    await shareToBluesky(`${caption}\n\n${albumUrl}`);
    await shareToReddit(caption, albumUrl);
    await addMostPopularSongToSpotifyPlaylist(album);

    process.exit(0);
  } catch (err) {
    console.error("Error sharing the album:", err);
    process.exit(1);
  }
}

main();
