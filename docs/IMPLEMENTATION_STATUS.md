# Implementation status

Updated 2026-10-23. This page records the product implementation in the current source tree. Passing tests do not establish that third-party hosts are online or grant reuse rights.

## Product surfaces

| Surface | Status | Implementation |
| --- | --- | --- |
| Tools and game artwork | Implemented | One offline-first search for works, editions, artwork, games, anime, and reference catalogs; filters stay in-page. |
| Apple catalogs and charts | Implemented | Storefront-aware search and cached chart snapshots; search results link to Apple. |
| Apple Music videos | Implemented with boundary | Validated Apple-hosted embed route; playback depends on Apple and the browser/storefront. Capture gallery accepts a user-selected local video file only. |
| Download & Export | Implemented | One image panel offers best/preview size, Original/PNG/JPEG/WebP, crop preparation, and Apple Motion MP4/WebM/GIF where supported. |
| Saved collection | Implemented | Browser-local favorites and folders; optional select-and-ZIP batch export has per-file and total size caps. |
| Game artwork index | Implemented | 17 console indexes; covers plus Libretro logos, gameplay screenshots, and title screens; xlenore serial/3D box art remains available. |
| Game edition matching | Implemented in verified scope | Explicit aliases/families connect FFX PS2 and PS Vita HD Remaster; Vita App ID `PCSE00293` is curated because the upstream list omits it. Other name/region/serial matches remain source-index dependent. |
| Studio Ghibli collection | Implemented | Separate timeline, poster, and still galleries. Remote source images are not bundled. |
| Makoto Shinkai collection | Implemented | Separate nine-film/short timeline, official film-works and rights links, and a direct Anime / Japan search action. No studio artwork is copied. |
| Console picker | Implemented | Lightweight CSS/SVG miniatures with tap-to-rotate buttons; no WebGL models or extra runtime dependency. |

## Source and rights boundaries

- Open-license artwork is mirrored only when file-level evidence supports it. Catalog rows and game promotional images are reference-only unless a specific item says otherwise.
- Apple video details use Apple's hosted embed. Browser UAT confirmed an Apple-hosted 30-second preview played and its timer advanced; full MusicKit playback can require sign-in. Capturing from that cross-origin player is not supported, and Apple's preview terms restrict saving/caching preview video. Local capture saves browser-local JPEG stills from a video file the user supplies.
- Game logos/screenshots/title screens come from Libretro's named thumbnail folders. Character art, publisher promotional art, console icons, and wallpapers are not claimed as indexed by this source; external discovery links remain separate.
- Batch export is capped at 25 items, 15 MB per source file, and 40 MB of exported files. Remote CORS or source failures are reported as skipped items.
- Single and batch exports convert in the browser. A browser or source may reject decoding or a selected output format; such failures are reported rather than mislabeled.

## Commands

```powershell
npm test
npm run typecheck
npm run verify:ghibli
npm run build
npm run ingest:games -- psvita
npm run ingest:catalog
npm run coverage
```

For current automated and browser validation, read [QA_REPORT.md](QA_REPORT.md). Keep deployment separate from product validation and use the configured release process.
