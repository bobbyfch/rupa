# Collection coverage

Generated 2026-10-23 from `public/offline/index/manifest.json` and `public/offline/artworks.json`. Run `node scripts/health/write-coverage.mjs` to refresh.

**Mirrored** = the image file ships inside RUPA (open licence, works offline). **Indexed** = title rows searchable offline; images stay at their host. A mirror is never made from a licence label alone.

| Collection | Indexed titles | Mirrored images | Live sources | Note |
|---|---:|---:|---|---|
| Music | 2,200 | 0 | Apple, Deezer, MusicBrainz + CAA | Album covers are publisher artwork; Commons holds a few, some wrongly labelled, so none are mirrored. |
| Music videos | 20 | 0 | Apple Music | Only 20 items have 3 or more Wikidata sitelinks. |
| Books | 1,800 | 109 | Apple Books, Open Library | Mirrored: Standard Ebooks covers (US public domain / CC0). |
| Audiobooks | 21,862 | 0 | Apple Books | LibriVox recordings are public domain, but cover art licences vary, so titles only. |
| Podcasts | 66 | 0 | Apple Podcasts | Small set: few podcasts have 3 or more sitelinks. |
| Podcast episodes | 0 | 0 | Apple Podcasts | No open episode corpus exists; live only. |
| App icons | 403 | 0 | App Store | Wikidata mobile apps; logos are trademarks, so images stay index-only. |
| App screenshots | 0 | 0 | App Store | Screenshots are the publisher's; live only. |
| Art & archives | 0 | 96 | Met, Cleveland, Commons, Openverse | Fully mirrored: CC0 or public-domain files from Cleveland, Met, Commons, Wellcome, Smithsonian and NASA. |
| Movies | 2,500 | 6 | Apple TV / iTunes | Mirrored: public-domain posters whose Commons file name says poster. |
| TV / Series | 1,500 | 0 | Apple TV seasons | Posters are studio artwork; index plus Commons images only. |
| YouTube | 0 | 0 | YouTube thumbnails by link or ID | Works with no Worker and no key. |
| Anime | 22,316 | 0 | Jikan, AniList | Posters belong to rights holders; index plus MAL image links. |
| Manga | 1,400 | 0 | MangaDex, Jikan, AniList | Few free images exist; titles from Wikidata. |
| Webtoons | 139 | 0 | MangaDex (web comics) | Titles from Wikidata. |
| Comics | 756 | 2 | none (offline only) | Mirrored: public-domain US covers whose Commons file name says cover. |
| Games | 91,551 | 0 | Libretro, xlenore, VitaHEX (via Worker) | Box art is publisher artwork and under 1,000 px; index-only. |
| Board games | 653 | 0 | none (offline only) | Titles from Wikidata with Commons photos where free. |
| Magazines | 1,400 | 0 | none (offline only) | Titles from Wikidata with Commons images where free. |
| Blu-ray & physical | 26 | 2 | none (offline only) | Films released by The Criterion Collection; mirrored: public-domain posters. |

Totals: 148,592 indexed titles, 215 mirrored images.
