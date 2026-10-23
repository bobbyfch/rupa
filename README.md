# Rupa

**A chromatic index for visual culture.**

Rupa is an independent image research space shaped by contemporary museum catalogues, pop art, and layered glass. It brings the image forward and keeps its source attached.

## In the archive

- **Game source index** — browse console families, indexed title feeds, modern searches, and the catalogs behind each asset.
- **Apple artwork** — browse charts and search music, books, film, television, podcasts, and App Store images.
- **Game archive** — search a title across console editions, covers, gameplay captures, wallpapers, logos, and icons.
- **Ghibli** — film timeline, poster editions, and stills linked to the official archive.
- **Makoto Shinkai** — film timeline, posters, and official stills, including *Suzume*.
- **Saved archive** — keep image references in local profiles and export a personal backup.

## Image feeds

Rupa displays image previews inside its own pages and keeps each original source link beside the image. Feed records store URLs and metadata; image files are not copied into the repository.

| Feed | What it supplies | Refresh path |
| --- | --- | --- |
| Apple charts | Current chart order and album artwork links | Apple RSS snapshot |
| Steam Store + publisher press pages | Top sellers, store backgrounds, gameplay screenshots, key art, and configured publisher images | `npm run refresh:game-trends` |
| Libretro / xlenore / VitaHEX | 17 classic console title indexes and upstream image references | Offline index refresh |
| Wikidata / Wikimedia Commons | Modern-console metadata, covers, logos, screenshots, icons, title screens, and wallpapers | Live search |
| SteamGridDB / LaunchBox / The Cover Project / Reddit / Imgur | External game-art catalogs and community searches, opened at their original source | Per-title source links |
| Studio Ghibli / Makoto Shinkai | Film pages, poster references, and official stills | Collection JSON manifests |

Steam's app-details endpoint does not send browser CORS headers, so Rupa refreshes it outside the page and publishes a small metadata index containing image URLs only. Configured publisher press pages can add image records to that same index. The CD PROJEKT RED adapter reads its server-rendered media records, prefers clean or English files, keeps thumbnail and original URLs, and leaves each image hosted by the publisher.

To add a Steam game that is not on the current chart, add its Steam App ID to `scripts/data/game-artwork-seeds.json` and run `npm run refresh:game-trends`. Add a `pressCenterUrl` there when that game has a compatible publisher press page. Steam and publisher images then use the same viewer and source links. To add another Shinkai film or asset set, add a film record to `public/collections/shinkai.json` and its poster/stills to `public/collections/shinkai-assets.v2.json`; the timeline and galleries read those files directly.

The **Game source index** is data-driven: platform counts come from the local index manifest, while catalog descriptions and per-title publisher feeds come from `public/data/game-art-sources.json`. Add another compatible publisher page there and to `scripts/data/game-artwork-seeds.json`; the same game viewer will show its previews and source links. SteamGridDB, LaunchBox, Reddit, and Imgur searches open externally; indexed image previews still appear in Rupa with their source attached.

## Run locally

Requirements: Node.js 22 or later.

```sh
npm install
npm run dev
```

The optional Cloudflare Worker provides same-origin image processing, artist image search, and encrypted cross-device sync. Set `VITE_API_URL` to the Worker URL for those features. Never put API secrets in client-side `VITE_*` variables.

## Refresh and build

```sh
npm run refresh:apple-trends
npm run refresh:game-trends
npm run typecheck
npm run build
```

Image availability and upstream catalogue contents can change. Saved references remain in the browser's local database. The GitHub Pages workflow publishes the built site; the scheduled feed workflow refreshes Steam chart and asset references.

## Stack

React, TypeScript, Vite, IndexedDB via Dexie, and a Cloudflare Worker for optional API features.
