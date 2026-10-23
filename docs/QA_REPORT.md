# QA report — product refinement (2026-10-23)

This report separates automated checks from live-provider and browser evidence. A passing local build does not prove that Apple, game-image hosts, or a production browser will serve third-party content.

## Automated checks

| Check | Result | Evidence |
| --- | --- | --- |
| `npm test` | PASS | 105 tests, 0 failures. Covers catalog/search, every Shinkai title in Anime/Japan, game edition families, provider boundaries, export mapping, ZIP structure, and prior app behavior. |
| `npm run build` | PASS | TypeScript and Vite production build completed. Main entry is 646.83 kB minified / 202.92 kB gzip. |
| `npm run verify:data` | PASS | 215 mirrored assets checked; 184,919,039 offline bytes; 462 rights-ledger entries. |
| `npm run verify:ghibli` | PASS | 27 films, 1,278 official still references, 27 key visuals, and 20 sourced poster editions. |
| `git diff --check` | PASS | No whitespace errors. Git printed only its configured LF/CRLF normalization warnings. |

Vite warns that the HLS playback chunk is 595.01 kB minified / 185.84 kB gzip. It is a separate dynamic import, requested only when Apple Motion playback/export is used; it does not belong to the initial entry bundle. The initial CSS is 156.53 kB / 29.48 kB gzip.

## Browser UAT

### Search and navigation

- Game search resolves `Final Fantasy X PS2`, the PS Vita `Final Fantasy X/X-2 HD Remaster` (`PCSE00293`), and `FFX-2` as separate related families.
- Cross-console spot checks cover Chrono Trigger (SNES/PS1/DS), Dragon Quest VIII (PS2/3DS), Ocarina of Time (N64/3DS), Twilight Princess (GameCube/Wii), Resident Evil 4 (GameCube/Wii), and Metal Gear Solid 3 editions. Automated tests also check Zelda Link's Awakening, Final Fantasy X, and sequel separation.
- All nine titles on the Shinkai timeline are present in the Anime/Japan metadata index. A fresh-origin browser UAT selected “The Voices of a Distant Star,” followed its Anime/Japan action, and showed the curated work plus the related “Hoshi no Koe” index result.
- Game finder at 393 × 852: PASS. Document width stayed 378 CSS px in a 393 px viewport; the console rail scrolls horizontally by design. Miniature rotation changed from 0° to 45° on tap.
- Shinkai's new page loaded at a narrow mobile browser width (341 CSS px) without document overflow; its timeline scrolls horizontally by design.

### Media and export

- Apple Music Video search returned 16 results for “Blinding Lights”; duplicate catalog rows had been removed. Selecting The Weeknd's video produced the expected Apple-hosted iframe URL in the same inspector as Still frames.
- **Apple preview playback: PASS.** In a fresh browser session, the inspector's Apple-hosted “Blinding Lights” player started after pressing Play; its state changed to Pause and the preview timer advanced to 2 seconds with 28 seconds remaining. Full MusicKit playback may require sign-in.
- Apple frame extraction is intentionally unavailable: the player is cross-origin and Apple's promotional preview terms limit previews to streaming rather than saving/caching. The inspector still gallery captures only a user-selected local file.
- Local still capture: PASS. A temporary synthetic WebM decoded at 320 × 180, produced a saved JPEG frame with matching decoded dimensions, and the gallery displayed the save/delete actions. The test still and source video were deleted after verification.
- Single export: PASS in browser UAT. JPEG conversion produced a downloaded file; the download panel reported its measured dimensions, MIME type, and size. The generated file was removed after inspection.
- Saved batch export: PASS in browser UAT. The downloaded ZIP reopened successfully with one PNG entry and a valid PNG signature. The ZIP and temporary favorite were removed after inspection.
- Selected archive deletion: PASS. After selecting one saved video and removing it, the ZIP count returned to 0, the ZIP control disabled, and the archive became empty.

## Scope limits and deployment gate

- The indexed game catalogs contain 16 Libretro systems plus VitaHEX PS Vita. They do not provide a complete current-gen console catalog. Other promotional art remains an outbound SteamGridDB/LaunchBox discovery link; no source-only image is represented as licensed for redistribution.
- Shinkai page artwork is intentionally not scraped or copied. CoMix Wave Films' portal states its images and text are copyrighted and prohibits unauthorized reproduction, modification, and distribution. Apple movie searches made for the collection did not yield dependable selected-film artwork during the research run.
- Browser UAT passed for the tested Apple preview, local frame capture, archive selection/deletion, exports, Shinkai-to-Anime navigation, and the FFX platform/preview surfaces. This does not guarantee other Apple storefronts, sign-in states, or source availability.
- The `main` push workflow automatically deploys GitHub Pages. This release keeps the current artwork files while replacing the branch history; the recoverable pre-cleanup bundle is kept outside the repo. Local GC reduced the pack from 174.86 MiB / 1,234 objects to 167.85 MiB / 668 objects. GitHub's server-side garbage collection can take time, and the retained 185 MB artwork set remains the main repository-size floor.
