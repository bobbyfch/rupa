# Sources and data paths

Updated 2026-10-23. Rupa records where a result came from and whether its image is mirrored, indexed at the source, or link-only. Public access is not a license.

## Product sources

| Source | Use | Storage and boundary |
| --- | --- | --- |
| Apple Search / Lookup | Music, Music Videos, Books, Audiobooks, Podcasts, Apps, Movies, TV | No API key. Storefront-aware catalog search. Images stay on Apple's CDN and link to the Apple record. |
| Apple RSS feeds | Charts for supported Apple catalog categories | Small chart snapshots are refreshed by the existing scheduled workflow; artwork remains remote. |
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

The game UI exposes four Libretro types: `Named_Boxarts`, `Named_Logos`, `Named_Snaps` (gameplay/screenshots), and `Named_Titles` (title screens). xlenore contributes default and 3D box covers for serial-matched PlayStation 1/2 results. VitaHEX contributes PS Vita covers. All are reference-only unless the upstream record says otherwise.

SteamGridDB and LaunchBox remain outbound discovery links. Rupa does not scrape their pages or import their images. IGDB, MobyGames, and other keyed databases are not required for core game search. No broad, keyless source with verified redistribution rights was found for publisher character art, promotional packs, console icons, or wallpapers; those asset kinds are not claimed as a complete indexed set.

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
- Apple Music video fields: <https://developer.apple.com/documentation/applemusicapi/musicvideos/attributes-data.dictionary>
- Apple hosted MusicKit embed generator: <https://js-cdn.music.apple.com/musickit/v1/index.html>
- Libretro thumbnails guide: <https://docs.libretro.com/guides/roms-playlists-thumbnails/>
- VitaHEX source: <https://github.com/VitaHEX-Games/hexflow-covers>
- CoMix Wave Films official Shinkai works: <https://www.shinkaiworks.com/film-works>
- CoMix Wave Films rights notice: <https://en.shinkaiworks.com/about>
- Wikimedia file reuse guidance: <https://commons.wikimedia.org/wiki/Commons:First_steps/Reuse/en>
- Ghibli works index: <https://www.ghibli.jp/works/>
- Ghibli still-image notice: <https://www.ghibli.jp/info/013344/>
