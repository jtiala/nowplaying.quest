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
import { extract, token_sort_ratio } from "fuzzball";
import { normalizeString } from "../src/utils/string.js";

const userAgent = "nowplaying.quest/1.0 (github.com/jtiala/nowplaying.quest)";
const albumPath = process.argv[2];

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

function findBestAlbumMatch(query, candidates, threshold = 80) {
  const choices = candidates.map((c) => c.title);

  const best = extract(query, choices, {
    scorer: token_sort_ratio,
    returnObjects: true,
  }).reduce((max, curr) => (curr.score > max.score ? curr : max), { score: 0 });

  if (best.score >= threshold) {
    return candidates.find((c) => c.title === best.choice);
  }

  return undefined;
}

function splitArtistsForMusicBrainz(artist) {
  // Split on ' / ', '/', ' & ', '&' (with or without spaces)
  return artist
    .split(/\s*\/\s*|\s*&\s*/)
    .map(normalizeString)
    .filter(Boolean);
}

async function searchMusicBrainz(artist, title, year) {
  const normalizedArtist = normalizeString(artist);
  const normalizedTitle = normalizeString(title);
  const splitArtists = splitArtistsForMusicBrainz(artist);

  let queries = [
    `releasegroup:"${normalizedTitle}" AND artist:"${normalizedArtist}" AND firstreleasedate:${year} AND primarytype:album`,
    `artist:"${normalizedArtist}" AND firstreleasedate:${year} AND primarytype:album`,
    `artist:"${normalizedArtist}" AND primarytype:album`,
  ];

  for (const split of splitArtists) {
    if (split !== normalizedArtist) {
      queries.push(
        `releasegroup:"${normalizedTitle}" AND artist:"${split}" AND firstreleasedate:${year} AND primarytype:album`,
      );
    }
  }

  for (const q of queries) {
    const url = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(
      q,
    )}&fmt=json&limit=10`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
      },
    });

    if (!res.ok) {
      continue;
    }

    const data = await res.json();

    if (!data["release-groups"] || !data["release-groups"].length) {
      continue;
    }

    const exact = data["release-groups"].find((r) => {
      if (
        !r["artist-credit"] ||
        r["artist-credit"].length === 0 ||
        !r.title ||
        !r["first-release-date"]
      ) {
        return false;
      }

      const normalizedArtistResult = normalizeString(
        r["artist-credit"][0].name,
      );
      const normalizedTitleResult = normalizeString(r.title);

      return (
        normalizedArtistResult === normalizedArtist &&
        normalizedTitleResult === normalizedTitle &&
        r["first-release-date"].startsWith(year.toString())
      );
    });

    if (exact) {
      console.log(
        `Found exact result (${exact.title} by ${exact["artist-credit"][0].name}) in MusicBrainz with query: '${q}'`,
      );

      return exact;
    }

    const closest = findBestAlbumMatch(normalizedTitle, data["release-groups"]);

    if (closest) {
      console.log(
        `Found close match (${closest.title} by ${closest["artist-credit"][0].name}) in MusicBrainz with query: '${q}'`,
      );

      return closest;
    }
  }

  console.log("Couldn't find album in MusicBrainz.");

  return null;
}

async function getMusicBrainzDetails(mbid) {
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
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent },
  });

  if (!res.ok) {
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
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent },
  });

  if (!res.ok) {
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

async function getSpotifyAlbumLink(artist, title, year) {
  const accessToken = await getSpotifyAccessToken();

  const normalizedArtist = normalizeString(artist);
  const normalizedTitle = normalizeString(title);
  const queries = [
    `artist:${normalizedArtist} album:${normalizedTitle} year:${year}`,
    `artist:${normalizedArtist} album:${normalizedTitle}`,
    `album:${normalizedTitle} year:${year}`,
    `artist:${normalizedArtist} year:${year}`,
  ];

  for (const q of queries) {
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?type=album&limit=1&q=${encodeURIComponent(q)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!searchRes.ok) {
      continue;
    }

    const searchData = await searchRes.json();

    if (
      searchData.albums &&
      searchData.albums.items &&
      searchData.albums.items[0]
    ) {
      const album = searchData.albums.items[0];

      if (album && album.id) {
        console.log(
          `Found album (${album.name} by ${album.artists[0].name}) in Spotify with query: '${q}'`,
        );

        return `https://open.spotify.com/album/${album.id}`;
      }
    }
  }

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

  if (mb) {
    mbid = mb.id;

    const details = await getMusicBrainzDetails(mbid);

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

    coverArt = await getCoverArt(mbid);
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
