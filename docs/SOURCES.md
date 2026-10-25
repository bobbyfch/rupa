# Sources and data paths

Updated 2026-10-25. Rupa records where a result came from and whether its image is mirrored, indexed at the source, or link-only. Public access is not a license.

## Product sources

| Source | Use | Storage and boundary |
| --- | --- | --- |
| Apple Search / Lookup | Music, Music Videos, Books, Audiobooks, Podcasts, Apps, Movies, TV | No API key. Storefront-aware catalog search. Images stay on Apple's CDN and link to the Apple record. |
| Apple RSS feeds | Charts for supported Apple catalog categories | Small chart snapshots are refreshed by the existing scheduled workflow; artwork remains remote. |
| Apple app chart + Lookup API | Top free/paid app screenshots | App rank order comes from Apple’s charts; up to two iPhone screenshots per app are fetched on demand and stay on Apple’s CDN. |
| ListenBrainz sitewide release-group statistics | Music albums ranked by community listening over weekly, monthly, and yearly windows | Public API; chart order comes from ListenBrainz, while cover previews resolve through MusicBrainz release IDs and the Cover Art Archive. |
| Open Library Search and Trending APIs | Book search and daily, weekly, or monthly trending; fallback for Manga volume titles that are explicitly numbered in the catalog | Search is called only when a MangaDex volume list is unavailable. Matching numbered works become volume cards; missing volumes are possible, so numbering and completeness are described as catalog-derived. Cover images point directly to `covers.openlibrary.org`; Rupa does not crawl that image service. |
| LibriVox catalog API | Recently catalogued audiobooks and title search | Public catalog API called by the Rupa Worker; results are cached for 15 minutes, cover art stays on its source host, and titles without a cover are omitted from the artwork grid. |
| AniList GraphQL | Anime trending, popularity, and upcoming charts | Public catalog API; posters and metadata remain linked to AniList. |
| MangaDex | Manga/web-comic search, series records, and numbered cover editions | Public catalogue API; numbered cover rows are loaded in bounded pages and stay on MangaDex. If the catalogue or its volume rows are unavailable, the detail view tries matching numbered Open Library cover works, then Jikan's explicitly unnumbered related-image gallery. |
| Jikan / MyAnimeList | Anime and manga search; fallback manga picture gallery | Search and picture requests stay in the Worker. Jikan's picture endpoint does not label separate print volumes; fallback art is explicitly titled “Related cover artwork.” Jikan's chart endpoint timed out during validation, so AniList supplies anime and manga charts. |
| Cinemeta | Film and series posters plus basic metadata | Public Stremio metadata catalog; Rupa uses catalog search and artwork metadata only, never stream records. |
| TVmaze schedule API | US broadcast episodes airing today or tomorrow, plus global/local streaming schedules for today and tomorrow | Public schedule feeds, not popularity rankings; each result links to its TVmaze show page. |
| F-Droid app search | Searchable open-source Android app listings and icons | Search only; this endpoint does not provide a general popularity chart. Requests go through the Rupa Worker to avoid browser cross-origin blocking; app pages and icons remain on F-Droid and its mirrors. |
| Apple Music hosted embed | Music video playback | Embed URL is derived only from a validated Apple Music video link. A real 30-second preview passed browser UAT; playback is controlled by Apple and full MusicKit can require sign-in. Rupa cannot read its cross-origin frames. |
| Apple Music Motion lookup (`m8tec/apple-music-animated-artworks`) | Album motion artwork | Community-maintained URL lookup; browser export records a local file and may re-encode it. |
| Libretro thumbnail repositories | 16 console metadata indexes and image folders | Static indexes store a game name plus available boxart/logo/screenshot/title-screen flags. The image stays upstream; Libretro named folders are not a rights license. |
| xlenore PS1/PS2 repositories and Redump DAT metadata | Serial-based regional covers and 3D box art | Source links and title/serial references are retained. Images are not mirrored. |
| VitaHEX-Games `hexflow-covers` | PS Vita App ID index and cover files | 101 indexed rows, including curated FFX/X-2 HD Remaster App ID `PCSE00293`; image stays upstream. The curated addition is kept in `scripts/ingest/games.mjs` so refreshes preserve it. |
| Studio Ghibli official works pages | Film timeline, official key visuals, and still links | Separate collection page. Remote images are not bundled; source notice is documented under rights. |
| Makoto Shinkai Works official film and exhibition pages | Film art, short films, and exhibition photographs | Remote image references link back to the official film or exhibition pages; images are not bundled. |
| CoMix Wave Films / Shinkai Works | Official Makoto Shinkai film-work references | Nine-title timeline links to the official film-works and rights pages; each title can be searched in Anime / Japan. No film artwork is copied from the official site. |
| Wikidata and LibriVox metadata indexes | Offline work/title lookup for collections without a local source | Metadata only; image or audio rights are not inferred from a catalog row. |
| Cleveland Museum, The Met, Wikimedia Commons, Smithsonian, Wellcome, NASA, Standard Ebooks | Small open-license/public-domain mirror and linked references | Mirrored files require per-file rights evidence. The generated ledger and [Attributions](ATTRIBUTIONS.md) identify each shipped file. |

## Game art that is indexed today

The game UI exposes four Libretro types: `Named_Boxarts`, `Named_Logos`, `Named_Snaps` (gameplay/screenshots), and `Named_Titles` (title screens). xlenore contributes default and 3D box covers for serial-matched PlayStation 1/2 results. VitaHEX contributes PS Vita covers. SteamGridDB supplies on-demand PC grids, heroes, logos, and icons through its documented API; it requires the Worker secret `STEAMGRIDDB_API_KEY`. Image URLs remain upstream and all these results are reference-only unless the upstream record says otherwise.

LaunchBox remains an outbound discovery link. Rupa queries SteamGridDB's API rather than scraping its web pages, and does not import its image files. IGDB, MobyGames, and other keyed databases are not required for core game search. No broad, keyless source with verified redistribution rights was found for publisher character art, promotional packs, console icons, or wallpapers; those asset kinds are not claimed as a complete indexed set.

## Patterns researched for source adapters

Stremio divides discovery into catalog/search results and a separate detail record keyed by the selected item's stable ID; media streams and subtitles are separate resources. Rupa applies the useful catalog-to-detail split across its categories: chart or search results carry a provider ID, and opening one resolves that exact record in the category detail view. Rupa consumes artwork and metadata only; it does not add Stremio stream or subtitle sources. See the [Stremio protocol](https://stremio.github.io/stremio-addon-sdk/protocol.html) and [resource model](https://stremio.github.io/stremio-addon-sdk/api/).

Mihon's browsing flow offers source-level Popular/Latest lists, title search, and a series detail screen; global search merges source results, and title aliases/romanization matter. Rupa uses that interaction pattern where providers expose those feeds, while keeping one result identity and one detail route per work. Mihon source extensions can access chapters and pages; Rupa does not adopt those reader/media requests. See [Mihon's source browsing guide](https://mihon.app/docs/guides/getting-started).

CloudStream is also extension-based: the app's own repository describes provider extensions and says the base app does not ship video sources by default. That is useful as a provider-boundary pattern, but many extensions target playback pages rather than artwork APIs. Rupa does not import arbitrary extension code or their playback/source extraction; only documented catalogue metadata and cover URLs are candidates. See the [CloudStream project README](https://github.com/recloudstream/cloudstream) and [official extension repository](https://github.com/recloudstream/extensions).

FMHY is a community-curated link directory, not a common catalog API. Its Reading, Audio, Video, and Gaming pages mix metadata services with readers, downloaders, and streaming sites. Rupa uses FMHY to discover and classify candidates, then integrates documented catalog APIs and source-owned artwork URLs; it does not crawl reader pages or request media, chapters, or page images. The directory lists Open Library and manga databases such as MAL, AniList, MangaBaka, MangaUpdates, and Comic Vine; MusicBrainz and ListenBrainz; film databases such as TMDb; and game databases including IGDB, RAWG, MobyGames, Giant Bomb, and LaunchBox. A listing alone does not establish an API, a feed, or permission to mirror artwork. See [FMHY Reading](https://fmhy.pages.dev/reading), [Audio](https://fmhy.pages.dev/audio), [Movies / TV / Anime](https://fmhy.pages.dev/video), [Gaming Tools](https://fmhy.pages.dev/gaming-tools), [Developer Tools](https://fmhy.pages.dev/developer-tools), and [FMHY About](https://fmhy.fyi/about/).

| Category | Candidate found or confirmed | Readiness for Rupa |
| --- | --- | --- |
| Music / music videos | MusicBrainz + Cover Art Archive, ListenBrainz, Apple; FMHY also indexes MusicBrainz tools and release trackers | MusicBrainz/CAA and ListenBrainz are already wired. Apple remains the music-video source because its API returns artwork and hosted preview fields; YouTube thumbnails require a user-provided URL/ID. |
| Books / audiobooks | Open Library, Standard Ebooks, Gutenberg, public-domain library catalogs, LibriVox | Open Library and LibriVox are live; public-domain books are indexed separately. Open Library is also a fallback for explicitly numbered manga work titles. The official cover guidance says to use `covers.openlibrary.org` image URLs and not crawl the cover service. |
| Film / TV / anime | Cinemeta, TVmaze, AniList, Jikan, Apple; TMDB is another structured catalog | Current sources are wired. TMDB is a viable expansion after a server-side API token is configured; its official docs require API authentication and attribution for non-commercial API use. |
| Manga / webtoons / comics | MangaDex, Open Library, AniList, Jikan/MAL, MangaUpdates, Comic Vine, official publisher catalogs | MangaDex remains primary for explicit volume labels. Open Library can supply numbered works where the catalog title is an exact series-plus-volume form; its catalogue coverage varies. Jikan supplies related images only. Comic Vine requires a site-specific API key; MangaUpdates is a discovery/database link, not a scraper target. |
| Games | Existing Libretro/xlenore/VitaHEX indexes and SteamGridDB API; FMHY lists IGDB, LaunchBox, RAWG, MobyGames, and Giant Bomb | SteamGridDB title search and grids, heroes, logos, and icons are live through the Worker when `STEAMGRIDDB_API_KEY` is configured. LaunchBox remains a link. Existing keyless indexes stay available. |
| Apps | App Store, F-Droid | Both are live. Apple provides app icons plus device screenshots in the same app record, so screenshots remain inside app detail rather than becoming a separate search category. |
| Podcasts / episodes | Apple Podcasts; Podcast Index is a possible metadata catalog | Apple is live. Do not add Podcast Index until its authentication and request limits are configured; episode artwork remains a separate item identity. |
| Art / archives | Cleveland Museum, The Met, Smithsonian, Wellcome, NASA, Wikimedia Commons, Openverse | Existing providers and local rights ledger are the reliable path; each mirrored file still needs its own license evidence. |
| Board games | BoardGameGeek XML API | Strong metadata candidate, but the official API now requires app registration/authorization for nearly all use and public-facing apps must display “Powered by BGG.” Keep it out of the live UI until its app approval, token, and branding are ready. |
| Magazines / physical media | Internet Archive metadata, Discogs, library/archive catalogs | FMHY mostly lists readers and download locations, not a uniform artwork API. Treat these as research candidates; do not scrape reader pages or use undocumented private endpoints. |

These are architectural patterns and provider candidates, not copied Stremio/Mihon/CloudStream code. Stremio's catalog-to-metadata boundary maps most directly to Film, TV, and Anime; Mihon's source/popular/latest/search-to-series-detail boundary maps to Manga and volume artwork. CloudStream's per-provider boundary is a useful way to isolate adapters, but its playback extraction is outside Rupa's artwork scope. The reusable parts—category-specific feeds, stable work IDs, one canonical detail route, provider attribution, and a separate optional asset gallery—also apply to Books, Music, Games, Apps, Podcasts, and Art, even though those categories need their own providers. A source adapter should return a canonical work ID, title/edition metadata, image aspect/kind, provider label, and original source link. Optional feeds such as latest/popular should only appear when a provider actually supplies them.

## Refresh

```powershell
npm run ingest:games
npm run ingest:catalog
npm run coverage
npm run verify:ghibli
```

Review source revisions, size, image hosts, the generated rights ledger, and the full diff after refresh. Never add source binaries merely because an image is reachable.

## References

- Apple Search API and preview terms: <https://performance-partners.apple.com/search-api>
- Stremio catalog, metadata, stream, and subtitle resources: <https://stremio.github.io/stremio-addon-sdk/protocol.html>
- Mihon source browsing and global search flow: <https://mihon.app/docs/guides/getting-started>
- FMHY category directories used for discovery: <https://fmhy.pages.dev/reading> · <https://fmhy.pages.dev/audio> · <https://fmhy.pages.dev/video> · <https://fmhy.pages.dev/gaming-tools> · <https://fmhy.pages.dev/developer-tools>
- FMHY source-directory description: <https://fmhy.fyi/about/>
- CloudStream app and extension repositories: <https://github.com/recloudstream/cloudstream> · <https://github.com/recloudstream/extensions>
- ListenBrainz sitewide chart API: <https://listenbrainz.readthedocs.io/en/latest/users/api/statistics.html>
- Open Library API and low-volume usage guidance: <https://openlibrary.org/developers/api>
- Open Library trending model and search integration: <https://blog.openlibrary.org/2025/08/06/whats-trending-on-open-library/>
- LibriVox API fields and request limits: <https://librivox.org/api/info>
- LibriVox API update and considerate request guidance: <https://librivox.org/2026/09/16/librivox-api-update/>
- AniList API and media fields: <https://anilist.gitbook.io/anilist-apiv2-docs/>
- MangaDex API documentation: <https://api.mangadex.org/docs/>
- Jikan API documentation: <https://docs.api.jikan.moe/>
- TVmaze API, US broadcast schedules, and global/local streaming schedules: <https://www.tvmaze.com/api>
- F-Droid public search and repository API: <https://f-droid.org/en/docs/All_our_APIs/>
- TMDB API authentication (required before wiring its charts): <https://developer.themoviedb.org/docs/getting-started>
- IGDB API authentication and server-side request guidance: <https://api-docs.igdb.com/>
- Comic Vine API key and use terms: <https://comicvine.gamespot.com/api/>
- BoardGameGeek XML API registration, authorization, and public-facing attribution: <https://boardgamegeek.com/using_the_xml_api>
- Open Library Search API and cover IDs: <https://openlibrary.org/dev/docs/api/search>
- Open Library Covers API usage guidance: <https://openlibrary.org/dev/docs/api/covers>
- Apple Music video fields: <https://developer.apple.com/documentation/applemusicapi/musicvideos/attributes-data.dictionary>
- Apple hosted MusicKit embed generator: <https://js-cdn.music.apple.com/musickit/v1/index.html>
- Libretro thumbnails guide: <https://docs.libretro.com/guides/roms-playlists-thumbnails/>
- VitaHEX source: <https://github.com/VitaHEX-Games/hexflow-covers>
- CoMix Wave Films official Shinkai works: <https://www.shinkaiworks.com/film-works>
- CoMix Wave Films rights notice: <https://en.shinkaiworks.com/about>
- Wikimedia file reuse guidance: <https://commons.wikimedia.org/wiki/Commons:First_steps/Reuse/en>
- Ghibli works index: <https://www.ghibli.jp/works/>
- Ghibli still-image notice: <https://www.ghibli.jp/info/013344/>
