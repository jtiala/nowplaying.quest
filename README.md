# ![Now Playing Quest](./branding/combination-mark-horizontal-bg.png)

Check out today's album at [nowplaying.quest](https://nowplaying.quest)!

## Running locally

1. Install dependencies

```console
npm i
```

2. Start the hot-reloading local web server

```console
npm run dev
```

3. The site should now be available at [localhost:8080](http://localhost:8080/)

## Album scripts

### Picking the album of the day

To pick a new album for a given date and update the history:

```console
npm run pick-album
# or manually:
node scripts/pick-album.js 2025-06-12
```

This writes a new JSON file to `data/album-of-the-day/YYYY-MM-DD.json`.

### Enriching the album of the day

Some enrichment features require API credentials. For full functionality, set the following environment variables:

- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`: Required for Spotify album lookups and cross-platform streaming links. You can set these in your shell or in a `.env` file (if using a tool like `direnv`).

To enrich the picked album with metadata and streaming links:

```console
npm run enrich-album
# or manually:
node scripts/enrich-album.js data/album-of-the-day/2025-06-12.json
```

This updates the JSON file in `data/album-of-the-day/` with additional fields (cover art, genres, streaming links, etc).

### Downloading and optimizing cover art

To download and optimize the cover art for a given album JSON:

```console
npm run download-cover-art
# or manually:
node scripts/download-cover-art.js data/album-of-the-day/2025-06-12.json
```

This saves a WebP image (640x640px, max 200 KB) alongside the JSON file.

### Running all scripts at once

```console
npm run new-album
```

### Testing scripts

To run all script tests:

```console
npm test
```

This will run the picker, enrichment, and cover art script tests. Tests are run automatically in CI for every change to the scripts.
