#!/usr/bin/env node
/**
 * share.js
 *
 * Shares an album to Bluesky and Reddit. Adds the most popular song of the album to a Spotify playlist.
 *
 * Usage:
 *   node share.js <path-to-album-json>
 */
import { AtpAgent, RichText } from "@atproto/api";
import fs from "fs";
import path from "path";
import {
  generateAlbumHashtags,
  generateCaption,
  generatePlatformHashtags,
} from "../src/utils/content.js";
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

async function getCoverArtPath(date) {
  const dataDir = path.resolve(__dirname, "../data/album-of-the-day");
  const brandingDir = path.resolve(__dirname, "../branding");
  const coverArt = path.join(dataDir, `${date}.webp`);
  const defaultCover = path.join(brandingDir, "default-cover-art.webp");

  if (await fileExists(coverArt)) {
    return coverArt;
  }

  return defaultCover;
}

async function shareToBluesky(album, dateStr, albumUrl, coverArtPath) {
  const handle = process.env.BLUESKY_HANDLE;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;

  if (!handle || !appPassword) {
    console.log("[Bluesky] Credentials not set, skipping post.");
    return;
  }

  const agent = new AtpAgent({ service: "https://bsky.social" });

  try {
    await agent.login({ identifier: handle, password: appPassword });

    const hashtags = [
      ...generatePlatformHashtags("bluesky"),
      ...generateAlbumHashtags(album),
    ];

    const isShortEnough = (text) => {
      const rt = new RichText({ text });
      return rt.graphemeLength <= 300;
    };

    let text = generateCaption({
      album,
      dateStr,
      listenStr: `Listen now: ${albumUrl}`,
      hashtags,
      isShortEnough,
    });

    let rt = new RichText({ text });
    await rt.detectFacets(agent);

    let embed = undefined;

    if (coverArtPath) {
      try {
        const imgBuffer = fs.readFileSync(coverArtPath);
        const mimeType = coverArtPath.endsWith(".webp")
          ? "image/webp"
          : "image/png";

        const blobRes = await agent.uploadBlob(imgBuffer, {
          encoding: mimeType,
        });

        if (blobRes && blobRes.data && blobRes.data.blob) {
          embed = {
            $type: "app.bsky.embed.images",
            images: [
              {
                image: blobRes.data.blob,
                alt: "Album cover art",
              },
            ],
          };
        }
      } catch (err) {
        console.error("[Bluesky] Failed to upload image:", err);
      }
    }

    await agent.post({
      text,
      facets: rt.facets,
      langs: ["en-US"],
      ...(embed ? { embed } : {}),
    });

    console.log("[Bluesky] Posted:", text);
  } catch (err) {
    console.error("[Bluesky] Failed to post:", err);
  }
}

async function shareToReddit(album, dateStr, albumUrl) {
  if (albumUrl.includes("localhost")) {
    console.log("[Reddit] URL is localhost, skipping post.");
    return;
  }

  const {
    REDDIT_CLIENT_ID: clientId,
    REDDIT_CLIENT_SECRET: clientSecret,
    REDDIT_USERNAME: username,
    REDDIT_PASSWORD: password,
    REDDIT_SUBREDDIT: subreddit,
    REDDIT_FLAIR_ID: flairId,
    REDDIT_USER_AGENT:
      userAgent = "nowplaying.quest:v1.0 (by /u/NowPlayingQuest)",
  } = process.env;

  if (!clientId || !clientSecret || !username || !password || !subreddit) {
    console.log("[Reddit] Credentials or subreddit not set, skipping post.");

    return;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent,
    },
    body: new URLSearchParams({
      grant_type: "password",
      username,
      password,
    }),
  });

  if (!tokenRes.ok) {
    console.error(
      "[Reddit] Failed to get access token:",
      await tokenRes.text(),
    );

    return;
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  const title = generateCaption({
    album,
    dateStr,
  });

  const postRes = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent,
    },
    body: new URLSearchParams({
      sr: subreddit,
      kind: "link",
      title,
      url: albumUrl,
      flair_id: flairId,
      resubmit: "true",
      api_type: "json",
    }),
  });

  const postData = await postRes.json();

  if (!postRes.ok || postData.json?.errors?.length) {
    console.error("[Reddit] Failed to submit post:", postData);

    return;
  }

  const postUrl = postData.json.data.url;
  console.log(`[Reddit] Posted: ${postUrl}`);
}

async function getSpotifyAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn(
      "[Spotify] Credentials not set, skipping direct Spotify lookup.",
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
    throw new Error("[Spotify] Client credentials or refresh token missing");
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
    throw new Error("[Spotify] Failed to refresh user access token");
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
    console.log("[Spotify] Playlist ID missing, skipping playlist add.");
    return;
  }

  if (
    !album.streamingLinks ||
    !album.streamingLinks.spotify ||
    album.streamingLinks.spotify.includes("/search/")
  ) {
    console.log("[Spotify] No direct album link, skipping playlist add.");
    return;
  }

  const albumId = await getSpotifyAlbumId(album.streamingLinks.spotify);

  if (!albumId) {
    console.log("[Spotify] Could not extract album ID.");
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
    console.log("[Spotify] Failed to fetch album tracks.");
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
    console.log("[Spotify] Failed to fetch track info.");
    return;
  }

  const tracksInfo = await tracksInfoRes.json();
  const mostPopular = tracksInfo.tracks.reduce(
    (max, t) => (t.popularity > (max?.popularity || 0) ? t : max),
    null,
  );

  if (!mostPopular) {
    console.log("[Spotify] No tracks found to add to playlist.");
    return;
  }

  let userToken;
  try {
    userToken = await getSpotifyUserAccessTokenWithRefresh();
  } catch (err) {
    console.log("[Spotify] Failed to get user access token:", err);
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
    console.log(
      `[Spotify] Added most popular track to playlist: ${mostPopular.name}`,
    );
  } else {
    console.log(
      "[Spotify] Failed to add track to playlist:",
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

    const coverArtPath = await getCoverArtPath(date);

    const baseUrl = process.env.SITE_URL;
    const albumUrl = `${baseUrl.replace(/\/$/, "")}/${date}/`;
    const dateStr = formatDate(date);

    await shareToBluesky(album, dateStr, albumUrl, coverArtPath);
    await shareToReddit(album, dateStr, albumUrl);
    await addMostPopularSongToSpotifyPlaylist(album);

    process.exit(0);
  } catch (err) {
    console.error("Error sharing the album:", err);
    process.exit(1);
  }
}

main();
