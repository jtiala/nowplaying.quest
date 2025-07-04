#!/usr/bin/env node
/**
 * enrich-album.js
 *
 * Enriches an album JSON file with additional data from free APIs:
 * - MusicBrainz: genres, external links (Wikidata, Wikipedia, RateYourMusic, Discogs)
 * - Cover Art Archive: cover image
 * - Wikipedia: description/summary
 * - Spotify: streaming link for Spotify
 * - Odesli: streaming links for various platforms
 *
 * Usage:
 *   node enrich-album.js <path-to-album-json>
 *
 * Arguments:
 *   <path-to-album-json>   Path to the album JSON file to enrich (required)
 */

import fs from "fs";
import { token_sort_ratio } from "fuzzball";
import { normalizeString } from "../src/utils/string.js";

const userAgent = "nowplaying.quest/1.0 (github.com/jtiala/nowplaying.quest)";
const albumPath = process.argv[2];
const fetchTimeout = 5000;
const fetchRetries = 3;

if (!albumPath) {
  console.error("Usage: node enrich-album.js <path-to-album-json>");
  process.exit(1);
}

function readAlbum() {
  if (!fs.existsSync(albumPath)) {
    throw new Error(`${albumPath} not found`);
  }

  return JSON.parse(fs.readFileSync(albumPath, "utf8"));
}

function getArtistVariants(artist) {
  // Split on ' and ', ' / ', '/', ' & ', '&'
  const split = artist.split(/\s+and\s+|\s*\/\s*|\s*&\s*/).filter(Boolean);

  return [...new Set([artist, ...split].map((s) => normalizeString(s)))];
}

function getTitleVariants(str) {
  const noParen = str.replace(/\s*\([^)]*\)\s*$/, "");
  const noColon = str.includes(":") ? str.slice(0, str.lastIndexOf(":")) : str;
  const noDash = str.includes("-") ? str.slice(0, str.lastIndexOf("-")) : str;

  return [
    ...new Set([str, noParen, noColon, noDash].map((s) => normalizeString(s))),
  ];
}

function findBestAlbumMatch(
  artistVariants,
  titleVariants,
  candidates,
  threshold = 80,
) {
  if (!candidates || !candidates.length) {
    return undefined;
  }

  let best = null;
  let bestScore = 0;

  for (const c of candidates) {
    const cArtistVariants = getArtistVariants(c.artist);
    const artistScores = cArtistVariants.reduce((acc, cArtistVariant) => {
      return [
        ...acc,
        ...artistVariants.map((artistVariant) =>
          token_sort_ratio(cArtistVariant, artistVariant),
        ),
      ];
    }, []);
    const maxArtistScore = Math.max(...artistScores);
    const cTitleVariants = getTitleVariants(c.title);
    const titleScores = cTitleVariants.reduce((acc, cTitleVariant) => {
      return [
        ...acc,
        ...titleVariants.map((titleVariant) =>
          token_sort_ratio(cTitleVariant, titleVariant),
        ),
      ];
    }, []);

    const maxTitleScore = Math.max(...titleScores);
    const combinedScore = (maxArtistScore + maxTitleScore) / 2;

    console.log(
      `[Matcher] Candidate with score ${combinedScore}: ${c.title} by ${c.artist}. Artist score: ${maxArtistScore}, title score: ${maxTitleScore}.`,
    );

    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      best = c;
    }
  }

  if (best && bestScore >= threshold) {
    return best;
  }

  return undefined;
}

async function searchMusicBrainz(artist, title, year) {
  const artistVariants = getArtistVariants(artist);
  const titleVariants = getTitleVariants(title);

  const queries = [];

  for (const artist of artistVariants) {
    for (const title of titleVariants) {
      queries.push(
        `releasegroup:"${title}" AND artist:"${artist}" AND firstreleasedate:${year} AND primarytype:album`,
      );
      queries.push(
        `releasegroup:"${title}" AND artist:"${artist}" AND primarytype:album`,
      );
      queries.push(
        `artist:"${artist}" AND firstreleasedate:${year} AND primarytype:album`,
      );
      queries.push(`artist:"${artist}" AND primarytype:album`);
    }
  }

  for (const q of queries) {
    await new Promise((resolve) => setTimeout(resolve, fetchTimeout));

    let attempt = 0;
    let success = false;
    let data = null;

    while (attempt < fetchRetries && !success) {
      try {
        const url = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(
          q,
        )}&fmt=json&limit=10`;
        const res = await fetch(url, {
          headers: {
            "User-Agent": userAgent,
          },
        });

        if (!res.ok) {
          attempt++;

          if (attempt < fetchRetries) {
            console.warn(
              `[MusicBrainz] Query failed, retrying (attempt ${attempt}): '${q}'`,
            );

            await new Promise((resolve) => setTimeout(resolve, fetchTimeout));

            continue;
          }

          continue;
        }

        data = await res.json();
        success = true;
      } catch (e) {
        attempt++;

        if (attempt < fetchRetries) {
          console.warn(
            `[MusicBrainz] Query failed, retrying (attempt ${attempt}): '${q}'`,
            e,
          );

          await new Promise((resolve) => setTimeout(resolve, fetchTimeout));

          continue;
        } else {
          console.error(
            `[MusicBrainz] Error fetching data for query '${q}':`,
            e,
          );

          continue;
        }
      }
    }

    if (!success || !data) {
      continue;
    }

    console.log(
      `[MusicBrainz] Searching with query: '${q}', got ${data["release-groups"]?.length || 0} results.`,
    );

    if (!data["release-groups"] || !data["release-groups"].length) {
      continue;
    }

    const exact = data["release-groups"].find((r) => {
      if (
        !r["artist-credit"] ||
        r["artist-credit"].length === 0 ||
        typeof r["artist-credit"][0].name !== "string" ||
        !r.title ||
        !r["first-release-date"]
      ) {
        return false;
      }

      return (
        artistVariants.includes(normalizeString(r["artist-credit"][0].name)) &&
        titleVariants.includes(normalizeString(r.title)) &&
        r["first-release-date"].startsWith(year.toString())
      );
    });

    if (exact) {
      console.log(
        `[MusicBrainz] Found exact result: ${exact.title} by ${exact["artist-credit"][0].name} with query: '${q}'.`,
      );

      return {
        artist: exact["artist-credit"][0].name,
        title: exact.title,
        id: exact.id,
      };
    }

    const closest = findBestAlbumMatch(
      artistVariants,
      titleVariants,
      data["release-groups"].map((a) => ({
        artist:
          !a["artist-credit"] ||
          a["artist-credit"].length === 0 ||
          typeof a["artist-credit"][0].name !== "string"
            ? ""
            : a["artist-credit"][0].name,
        title: a.title,
        id: a.id,
      })),
    );

    if (closest) {
      console.log(
        `[MusicBrainz] Found close match: ${closest.title} by ${closest.artist} with query: '${q}'.`,
      );

      return closest;
    }
  }

  console.log("[MusicBrainz] Couldn't find the album.");

  return null;
}

async function getMusicBrainzDetails(mbid) {
  await new Promise((resolve) => setTimeout(resolve, fetchTimeout));
  const url = `https://musicbrainz.org/ws/2/release-group/${mbid}?inc=genres+tags+url-rels&fmt=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent },
  });

  if (!res.ok) {
    return null;
  }

  return await res.json();
}

async function getCoverArt(mbid) {
  const url = `https://coverartarchive.org/release-group/${mbid}`;
  let attempt = 0;
  let success = false;
  let res = null;

  while (attempt < fetchRetries && !success) {
    try {
      res = await fetch(url, {
        headers: { "User-Agent": userAgent },
      });

      if (!res.ok) {
        attempt++;

        if (attempt < fetchRetries) {
          console.warn(
            `[CoverArtArchive] Query failed, retrying (attempt ${attempt}): '${url}'`,
          );

          await new Promise((resolve) => setTimeout(resolve, fetchTimeout));

          continue;
        }

        continue;
      }
      success = true;
    } catch (e) {
      attempt++;

      if (attempt < fetchRetries) {
        console.warn(
          `[CoverArtArchive] Query failed, retrying (attempt ${attempt}): '${url}'`,
          e,
        );

        await new Promise((resolve) => setTimeout(resolve, fetchTimeout));

        continue;
      } else {
        console.error(
          `[CoverArtArchive] Error fetching data for url '${url}':`,
          e,
        );
        continue;
      }
    }
  }

  if (!success || !res) {
    return null;
  }

  const data = await res.json();

  if (data.images && data.images.length) {
    const front = data.images.find((img) => img.front) || data.images[0];

    return front.image;
  }

  return null;
}

async function getWikipediaSummary(wikipediaTitle) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    wikipediaTitle,
  )}`;
  let attempt = 0;
  let success = false;
  let res = null;

  while (attempt < fetchRetries && !success) {
    try {
      res = await fetch(url, {
        headers: { "User-Agent": userAgent },
      });

      if (!res.ok) {
        attempt++;

        if (attempt < fetchRetries) {
          console.warn(
            `[Wikipedia] Query failed, retrying (attempt ${attempt}) '${wikipediaTitle}'`,
          );

          await new Promise((resolve) => setTimeout(resolve, fetchTimeout));

          continue;
        }
        continue;
      }
      success = true;
    } catch (e) {
      attempt++;

      if (attempt < fetchRetries) {
        console.warn(
          `[Wikipedia] Query failed, retrying (attempt ${attempt}): '${wikipediaTitle}'`,
          e,
        );

        await new Promise((resolve) => setTimeout(resolve, fetchTimeout));

        continue;
      } else {
        console.error(
          `[Wikipedia] Error fetching summary for '${wikipediaTitle}':`,
          e,
        );

        continue;
      }
    }
  }

  if (!success || !res) {
    return null;
  }

  const data = await res.json();

  return data.extract || null;
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

async function getSpotifyAlbumLink(artist, title, year) {
  const accessToken = await getSpotifyAccessToken();

  const artistVariants = getArtistVariants(artist);
  const titleVariants = getTitleVariants(title);

  const queries = [];

  for (const artist of artistVariants) {
    for (const title of titleVariants) {
      queries.push(`artist:${artist} album:${title} year:${year}`);
      queries.push(`artist:${artist} album:${title}`);
      queries.push(`album:${title} year:${year}`);
      queries.push(`artist:${artist} year:${year}`);
    }
  }

  for (const q of queries) {
    await new Promise((resolve) => setTimeout(resolve, fetchTimeout));

    let attempt = 0;
    let success = false;
    let searchData = null;

    while (attempt < fetchRetries && !success) {
      try {
        const searchRes = await fetch(
          `https://api.spotify.com/v1/search?type=album&limit=10&q=${encodeURIComponent(q)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (!searchRes.ok) {
          attempt++;

          if (attempt < fetchRetries) {
            console.warn(
              `[Spotify] Query failed, retrying (attempt ${attempt}): '${q}'`,
            );

            await new Promise((resolve) => setTimeout(resolve, fetchTimeout));

            continue;
          }

          continue;
        }

        searchData = await searchRes.json();
        success = true;
      } catch (e) {
        attempt++;

        if (attempt < fetchRetries) {
          console.warn(
            `[Spotify] Query failed, retrying (attempt ${attempt}): '${q}'`,
            e,
          );

          await new Promise((resolve) => setTimeout(resolve, fetchTimeout));

          continue;
        } else {
          console.error(`[Spotify] Error fetching data for query '${q}':`, e);
          continue;
        }
      }
    }

    if (!success || !searchData) {
      continue;
    }

    console.log(
      `[Spotify] Searching with query: '${q}', got ${searchData.albums?.items?.length || 0} results.`,
    );

    if (
      searchData.albums &&
      searchData.albums.items &&
      searchData.albums.items.length
    ) {
      const exact = searchData.albums.items.find((a) => {
        const albumArtist =
          a.artists && a.artists[0] ? a.artists[0].name : undefined;

        if (typeof albumArtist !== "string" || typeof a.name !== "string") {
          return false;
        }

        const nArtist = normalizeString(albumArtist);
        const nTitle = normalizeString(a.name);

        return (
          artistVariants.includes(nArtist) && titleVariants.includes(nTitle)
        );
      });

      if (exact) {
        console.log(
          `[Spotify] Found exact result: ${exact.name} by ${exact.artists[0].name} with query: '${q}'.`,
        );

        return `https://open.spotify.com/album/${exact.id}`;
      }

      const closest = findBestAlbumMatch(
        artistVariants,
        titleVariants,
        searchData.albums.items.map((a) => ({
          artist:
            !a.artists ||
            a.artists.length === 0 ||
            typeof a.artists[0].name !== "string"
              ? ""
              : a.artists[0].name,
          title: a.name,
          id: a.id,
        })),
      );

      if (closest) {
        console.log(
          `[Spotify] Found close match: ${closest.title} by ${closest.artist} with query: '${q}'.`,
        );

        return `https://open.spotify.com/album/${closest.id}`;
      }
    }
  }

  console.log("[Spotify] Couldn't find the album.");

  return null;
}

async function getOdesliLinks(url) {
  if (!url) {
    return null;
  }

  try {
    const res = await fetch(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`,
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data.linksByPlatform || null;
  } catch (e) {
    return null;
  }
}

async function getWikidataEntity(wikidataId) {
  try {
    const wdRes = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`,
      {
        headers: { "User-Agent": userAgent },
      },
    );

    if (wdRes.ok) {
      const wdData = await wdRes.json();
      const entity = wdData.entities[wikidataId];

      if (entity && entity.sitelinks && entity.sitelinks.enwiki) {
        return entity;
      }
    }
  } catch (e) {
    return null;
  }
}

async function main() {
  const album = readAlbum();
  const { artist, title, year, curatedLists } = album;

  let mbid = null;
  let genres = [];
  let coverArt = null;
  let description = null;
  let wikidata = null;
  let wikipediaTitle = null;
  let wikipedia = null;
  let rateyourmusic = null;
  let discogs = null;

  const mb = await searchMusicBrainz(artist, title, year);

  if (mb && mb.id) {
    mbid = mb.id;
    const details = await getMusicBrainzDetails(mb.id);

    if (details) {
      if (details.genres && details.genres.length) {
        genres = details.genres.map((g) => g.name);
      } else if (details.tags && details.tags.length) {
        genres = details.tags.map((t) => t.name);
      }

      if (details.relations && details.relations.length) {
        const wikidataRels = details.relations.filter(
          (rel) => rel.type === "wikidata" && rel.url && rel.url.resource,
        );
        let bestWikidata = null;
        let bestWikidataEntity = null;
        let bestScore = -1;

        for (const rel of wikidataRels) {
          const wikidataId = rel.url.resource.split("/").pop();
          const wikidataEntity = await getWikidataEntity(wikidataId);

          if (
            wikidataEntity &&
            wikidataEntity.sitelinks &&
            wikidataEntity.sitelinks.enwiki &&
            wikidataEntity.sitelinks.enwiki.title
          ) {
            const enwikiTitle = wikidataEntity.sitelinks.enwiki.title;

            const score = token_sort_ratio(
              normalizeString(enwikiTitle),
              normalizeString(title),
            );

            if (score > bestScore) {
              bestScore = score;
              bestWikidata = rel.url.resource;
              bestWikidataEntity = wikidataEntity;
            }
          }
        }

        if (bestWikidata && bestWikidataEntity) {
          wikidata = bestWikidata;
          wikipediaTitle = bestWikidataEntity.sitelinks.enwiki.title;
          wikipedia = `https://en.wikipedia.org/wiki/${wikipediaTitle.replace(/ /g, "_")}`;
        }

        for (const rel of details.relations) {
          if (
            rel.url &&
            rel.url.resource &&
            rel.url.resource.match(/rateyourmusic\.com\/release\//)
          ) {
            if (!rateyourmusic) {
              rateyourmusic = rel.url.resource;
            }
          }

          if (rel.type === "discogs" && rel.url && rel.url.resource) {
            if (!discogs) {
              discogs = rel.url.resource;
            }
          }
        }
      }
    }

    coverArt = await getCoverArt(mb.id);
    if (coverArt && coverArt.startsWith("http:")) {
      coverArt = coverArt.replace(/^http:/, "https:");
    }
  }

  if (wikipediaTitle) {
    description = await getWikipediaSummary(wikipediaTitle);
  }

  const spotifyAlbumUrl = await getSpotifyAlbumLink(artist, title, year);

  const odesliLinks = spotifyAlbumUrl
    ? await getOdesliLinks(spotifyAlbumUrl)
    : null;

  const query = encodeURIComponent(
    normalizeString(`${artist} ${title}`, false, true),
  );
  let streamingLinks = {
    spotify: `https://open.spotify.com/search/${query}`,
    appleMusic: `https://music.apple.com/us/search?term=${query}`,
    youtube: `https://www.youtube.com/results?search_query=${query}`,
    youtubeMusic: `https://music.youtube.com/search?q=${query}`,
    amazonMusic: `https://music.amazon.com/search/${query}`,
    tidal: `https://tidal.com/search?q=${query}`,
    deezer: `https://www.deezer.com/search/${query}`,
  };

  if (odesliLinks) {
    if (odesliLinks.spotify && odesliLinks.spotify.url) {
      streamingLinks.spotify = odesliLinks.spotify.url;
    }

    if (odesliLinks.appleMusic && odesliLinks.appleMusic.url) {
      streamingLinks.appleMusic = odesliLinks.appleMusic.url;
    }

    if (odesliLinks.youtube && odesliLinks.youtube.url) {
      streamingLinks.youtube = odesliLinks.youtube.url;
    }

    if (odesliLinks.youtubeMusic && odesliLinks.youtubeMusic.url) {
      streamingLinks.youtubeMusic = odesliLinks.youtubeMusic.url;
    }

    if (odesliLinks.amazonMusic && odesliLinks.amazonMusic.url) {
      streamingLinks.amazonMusic = odesliLinks.amazonMusic.url;
    }

    if (odesliLinks.tidal && odesliLinks.tidal.url) {
      streamingLinks.tidal = odesliLinks.tidal.url;
    }

    if (odesliLinks.deezer && odesliLinks.deezer.url) {
      streamingLinks.deezer = odesliLinks.deezer.url;
    }
  }

  const enrichedAlbum = {
    artist,
    title,
    year,
    curatedLists,
    genres,
    description,
    coverArt,
    mbid,
    externalLinks: {
      wikidata,
      wikipedia,
      discogs,
      rateyourmusic,
    },
    streamingLinks,
  };

  fs.writeFileSync(albumPath, JSON.stringify(enrichedAlbum, null, 2));

  console.log(`Enriched album ${albumPath}:`, enrichedAlbum);
}

main().catch((err) => console.error("Error enriching album:", err));
