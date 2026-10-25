# Rupa

Rupa is a static, browser-based media and artwork downloader. Apple tools are grouped in one workspace, with category filters for Music, Music Videos, Books, Audiobooks, Podcasts, Apps, Movies, TV, and artwork.

## Apple tools

- Search Apple catalogs across categories, or select a category chip to scope the same search field.
- Browse cover art in a responsive grid. Where Apple exposes motion artwork, the thumbnail plays muted while it is visible; users can pause it. Reduced-motion settings are respected.
- Open an item to download or export artwork in supported formats, resize it, crop it, create wallpapers, and export available motion artwork as GIF, MP4, or WebM.
- Preview Apple's short music-video clip and download that preview file when available. Apple does not provide the full music video through this catalog.
- Open book previews on Apple Books when Apple provides a preview link.
- Download direct HTTPS image, audio, video, or file URLs when the host permits browser cross-origin access (CORS). Direct downloads are capped at 100 MB.

## Other catalogs

- Anime and manga search use AniList and Jikan from the browser.
- YouTube links can show a thumbnail using YouTube's oEmbed endpoint. This does not extract or download YouTube video files.
- Additional platforms such as Instagram require a compatible download service. A static GitHub Pages site cannot bypass platform restrictions or host a server-side extractor.

Rupa has no custom scraping service or Rupa download API. Catalog searches and motion artwork lookups call public third-party endpoints directly from the browser; media files are downloaded to the user's device. The direct URL tool depends on the host's CORS policy.

## Development

```sh
npm ci
npm run dev
npm run build
npm run preview
```

The `main` branch deploys to GitHub Pages through `.github/workflows/deploy-pages.yml`.
