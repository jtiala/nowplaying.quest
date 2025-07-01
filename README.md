# ![Now Playing Quest](./branding/combination-mark-horizontal-bg.png)

Check out today's album at [nowplaying.quest](https://nowplaying.quest)!

## Running locally

1. Make a copy of the example `.env` file and configure the environment variables. Only `SITE_URL` is required for the site to function, the rest are for the album scripts described below.

   ```console
   cp .env.example .env
   ```

2. Install dependencies

   ```console
   npm i
   ```

3. Start the hot-reloading local web server

   ```console
   npm run dev
   ```

4. The site should now be available at [localhost:8080](http://localhost:8080/)

## Album scripts

### Picking the album of the day

To pick a new album for a given date:

```console
DATE=2025-07-01 npm run pick-album
# or
node scripts/pick-album.js 2025-07-01
```

This writes a new JSON file to `data/album-of-the-day/YYYY-MM-DD.json` and updates `data/history.csv`.

### Enriching the album of the day

To enrich the picked album with metadata and streaming links:

```console
DATE=2025-07-01 npm run enrich-album
# or
node scripts/enrich-album.js data/album-of-the-day/2025-07-01.json
```

This updates the JSON file in `data/album-of-the-day/` with additional fields (cover art, genres, streaming links, etc).

### Downloading and optimizing cover art

To download and optimize the cover art for a given album:

```console
DATE=2025-07-01 npm run download-cover-art
# or
node scripts/download-cover-art.js data/album-of-the-day/2025-07-01.json
```

This saves a WebP image (480x480px, max 200 KB) alongside the JSON file in `data/album-of-the-day/`.

### Generating Open Graph image

To generate a Open Graph image for a given album JSON:

```console
DATE=2025-07-01 npm run generate-og-image
# or
node scripts/generate-og-image.js data/album-of-the-day/2025-07-01.json
```

This saves a PNG image (600x315px) alongside the JSON file in `data/album-of-the-day/`.

### Running all scripts at once

```console
DATE=2025-07-01 npm run automate-album
```

### Manually choosing an album

To manually choose an album for a day, add it to `data/history.csv` and run the automation normally.

### Testing scripts

To run all script tests:

```console
npm test
```

This will run the picker, enrichment, and cover art script tests. Tests are run automatically in CI for every change to the scripts.
