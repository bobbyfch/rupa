# Rupa source map

Updated 2026-10-23. This page records the implemented behavior and source limits. An image loading in a browser does not grant reuse rights.

## Product model

Rupa is a visual library for finding artwork, comparing editions, and keeping references with their sources. Home shows the available tools and curated collections. Tools contains the work finder, Apple catalog search, and game artwork finder. Ghibli and Makoto Shinkai have their own collection pages.

## Search and browsing

- Offline indexes provide title, alias, serial, platform, edition, and source metadata.
- Game artwork results use a responsive image grid. Selecting a title opens an edition and asset page.
- The selector groups platforms by console family and includes PlayStation 4/5, Nintendo Switch, Xbox One, Xbox Series X/S, and PC.
- Modern game searches use Wikidata and Wikimedia Commons; results are limited to entities and images with source records.
- Saved items and folders use browser-local IndexedDB. Optional profile backup/sync uses the separately configured worker.

## Artwork sources

### Apple

Apple catalog results and chart feeds link to their catalog pages. Apple Music preview playback stays hosted by Apple. Direct album images try alternate supplied sizes before showing a missing-image state.

### Games

17 legacy platform indexes contain reference metadata for covers, logos, screenshots, title screens, and some regional/3D box editions. Modern platform results query Wikidata and Wikimedia Commons. SteamGridDB and LaunchBox remain outbound links and are not scraped into Rupa.

### Collections

The Ghibli page presents official stills and selected poster references with links to the source pages. The Makoto Shinkai page lists nine film and short-film works with links to the official film pages. These are source references; image hosts and rights holders determine whether any file can be downloaded, shared, or reused. Rupa does not store the Shinkai files in the repository.

### Open-license mirror

Only files with per-file open-license or public-domain evidence are bundled. See [Attributions](ATTRIBUTIONS.md), [Coverage](COVERAGE.md), and the rights ledger in the data directory.

## Image preparation

The image editor lets users choose crop, target size, interpolation, and output format before creating a file. A browser can prepare and download or share a wallpaper image; it cannot directly change the operating system wallpaper. Cross-origin hosts can block browser image processing. When this happens, users can open the source image, download it, and load it into the editor.

## Local checks

    npm run typecheck
    npm test
    npm run verify:ghibli
    npm run build

See [Sources](SOURCES.md), [Rights and attribution](RIGHTS_AND_ATTRIBUTION.md), and [QA report](QA_REPORT.md) for specific source details and validation notes.
