# Rupa

**A visual archive for the things we love.**

Rupa is a contemporary image discovery catalogue for film, music, books, games, apps, and illustrated stories. Search by category, browse charts and curated collections, then follow each image back to its source.

[Open Rupa](https://bobbyfch.github.io/rupa/) · [Sources and providers](docs/SOURCES.md) · [Attribution](docs/ATTRIBUTIONS.md) · [Rights notes](docs/RIGHTS_AND_ATTRIBUTION.md)

## Explore

- **Categories** — search Apple catalogs and connected services for music, music videos, film, television, books, audiobooks, podcasts, apps, anime, manga, comics, games, and more.
- **Charts and discovery** — open current Apple and public-provider charts where available, or use category-specific trend and latest feeds.
- **Games** — find a title across classic and modern consoles, then browse editions, covers, gameplay images, wallpapers, logos, icons, and publisher art on one detail page.
- **Curated collections** — explore Studio Ghibli and Makoto Shinkai film timelines, posters, and sourced stills.
- **Your archive** — save image references, organize them in local profiles, compare artwork, and export a personal backup.

Search availability depends on the upstream catalog and its region. A source can return no matches while another has the same title; use **All sources** when a source-specific search is empty. Rupa links to source-hosted images and keeps credit and context close to each result. Some explicitly documented open-license assets are bundled for offline browsing; see the rights notes before reusing any image.

## Data and image sources

Rupa combines live catalog APIs, public metadata indexes, and curated collection manifests. It does not host or provide media streams. Most third-party image previews load from their source; explicitly documented open-license images are bundled for offline browsing. Favorites and profiles stay in the browser unless the optional encrypted sync service is configured.

| Area | Example sources | Details |
| --- | --- | --- |
| Apple catalogs | Apple Music, Books, Podcasts, App Store, iTunes | Search and chart feeds vary by category and storefront. |
| Film, television, and anime | Cinemeta, Wikidata, Wikimedia Commons, AniList, Jikan | Metadata and artwork availability differ by title. |
| Manga and comics | MangaDex, Open Library, AniList, Jikan, public metadata catalogs | Series detail groups available editions and numbered volume covers when a provider exposes them. |
| Games | Steam, Wikidata, Wikimedia Commons, console indexes, publisher pages | The detail page merges records and keeps the original source links. |
| Curated films | Studio Ghibli and Makoto Shinkai official archives and credited pages | Each collection lists its source and context. |

See [docs/SOURCES.md](docs/SOURCES.md), [docs/ATTRIBUTIONS.md](docs/ATTRIBUTIONS.md), and [docs/RIGHTS_AND_ATTRIBUTION.md](docs/RIGHTS_AND_ATTRIBUTION.md) for provider coverage and image-use notes.

## Run locally

**Requirements:** Node.js 22 or later.

```sh
npm install
npm run dev
```

The optional Cloudflare Worker adds same-origin image processing, expanded provider search, and encrypted cross-device sync. Set `VITE_API_URL` to its base URL to use it. Keep provider secrets in Worker environment variables; never expose secrets in client-side `VITE_*` variables.

SteamGridDB game artwork search uses the v2 API through the Worker. Add the key as a Worker secret with `cd worker && npx wrangler secret put STEAMGRIDDB_API_KEY`. For local Worker development, add the same variable to `worker/.dev.vars`; that file is git-ignored. SteamGridDB previews remain remote references and do not grant reuse rights.

## Useful commands

```sh
npm run typecheck
npm test
npm run build
npm run refresh:apple-trends
npm run refresh:game-trends
```

The site is published to GitHub Pages by [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). Feed refreshes run through their own workflows; local refresh commands are available for maintainers.

## Built with

React, TypeScript, Vite, Dexie/IndexedDB, and an optional Cloudflare Worker.
