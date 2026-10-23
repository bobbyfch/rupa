# Rupa product checklist

Updated 2026-10-23. This checklist describes the current source tree and its known limits.

## Product

- [x] Primary navigation: Home, Tools, Collections, Saved, and Profile.
- [x] Home shows the available tools, curated collections, and a moving strip sampled from current catalogs and artwork indexes.
- [x] Search results connect work titles, editions, image assets, source pages, and rights notes.
- [x] Browser-local folders, image inspection, backups, and single or batch export share one archive workflow.
- [x] Brand assets, metadata, README, manifest, and social card use Rupa.

## Game artwork

- [x] Offline indexes cover 17 legacy systems and include covers, logos, gameplay screenshots, title screens, and supported alternate editions.
- [x] PS4, PS5, Switch, Xbox One, Xbox Series X/S, and PC are searchable through Wikidata and Wikimedia Commons when indexed images exist.
- [x] Games appear in an artwork grid and open a separate details page for editions and asset types.
- [x] Console selection is grouped by family and uses source-linked product photographs.
- [~] Modern game art availability depends on Wikidata and Commons statements. SteamGridDB and LaunchBox stay outbound links because their terms do not permit an unapproved website mirror.

## Artwork and rights

- [x] Ghibli and Shinkai have direct collection pages, source links, and specific film titles.
- [x] Ghibli image references link to the official film pages. Shinkai references link to official CoMix Wave Works pages.
- [x] Rupa does not bundle third-party poster or promotional binaries. Source-specific reuse terms still apply.
- [x] Apple preview video remains embedded at Apple; local still capture only accepts a user-selected video file.

## Reliability and layout

- [x] Album results try alternate image URLs before showing an unavailable state.
- [x] Apple and game searches stop loading after a bounded request period and show a progress indicator.
- [x] Artwork placeholders use square, portrait, or landscape ratios that match their media type.
- [x] Main page content keeps consistent side gutters across desktop and mobile widths.

## Validation

- [x] Run typecheck, tests, production build, and browser checks after the rebrand changes.
- [ ] Set the `VITE_API_URL` repository variable to the approved deployed Worker URL for production image proxy downloads and profile sync.
