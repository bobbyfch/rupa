# Rupa

**A visual archive for art, film, music, books, apps, and games.**

Rupa brings the image forward and keeps its source close. The interface takes cues from contemporary museum catalogues: quiet typography, generous margins, tactile glass surfaces, and imagery in its natural shape. It is an independent, non-profit project.

## Explore

- **Artwork catalog** — search across works, editions, and image archives.
- **Apple artwork** — browse Apple charts, sort albums by release date, and search Apple Music, Books, TV, Podcasts, and App Store artwork.
- **Game archive** — browse current Steam top sellers, search 17 classic console indexes and modern PlayStation, Nintendo Switch, Xbox, and PC catalogs, then view editions, covers, screenshots, logos, and icons.
- **Ghibli** — browse the film timeline, regional posters, and official stills.
- **Makoto Shinkai** — browse film posters, still galleries, and exhibition images linked to official film and archive pages.
- **Saved archive** — organize references in local profiles and folders, and export a personal backup.

Image cards link to the catalog, film page, archive, or store that supplies the image. Rupa keeps source labels and URLs with the artwork. Collection image URLs remain upstream where possible; availability can change when a source site changes its files or blocks requests. Saving an image is an explicit action in the export panel.

## Run locally

Requirements: Node.js 22 or later.

```sh
npm install
npm run dev
```

The optional Cloudflare Worker provides same-origin image processing, artist image search, and encrypted cross-device sync. Set `VITE_API_URL` to the Worker URL for those features. The local Vite server includes the image proxy for development. Never put API secrets in client-side `VITE_*` variables.

## Data and sources

Rupa combines project indexes with links to upstream collections. Current examples include Apple RSS charts, Steam's top-seller chart, Libretro game thumbnails, Wikidata and Wikimedia Commons, Studio Ghibli's official works archive, and the Makoto Shinkai Works portal and official film sites. Each collection page links to its source; the Steam chart links to the store listing for every game.

Image files are not added to the Shinkai collection index: the page stores image URLs, film titles, and source links. Users can prepare an image for download or wallpaper from the artwork panel. Wallpaper output is a file to select in the device's wallpaper settings; a browser cannot silently change the desktop background.

Saved items and preferences live in the browser's local database. Sync is optional and requires a configured Worker and database.

## Project commands

```sh
npm run typecheck
npm test
npm run build
npm run refresh:apple-trends
npm run refresh:game-trends
```

The GitHub Pages workflow refreshes the chart snapshots when sources respond, builds the site, and deploys `dist`. The workflow is started manually from GitHub Actions.

## Stack

React, TypeScript, Vite, IndexedDB via Dexie, and a Cloudflare Worker for optional API features.
