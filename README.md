# Rupa

Rupa is a browser-based media downloader. Its first active tools are Apple Music artwork and direct media file URLs.

## What works

- Search Apple Music album artwork by album, artist, or Apple Music link, then download the image in its original format or export PNG, JPEG, or WebP.
- Paste an Apple-hosted artwork image URL to download it directly.
- Download a direct HTTPS image, audio, video, or file URL when its host allows browser cross-origin access (CORS). Direct downloads are capped at 100 MB.
- Files are fetched and saved by the browser. Rupa does not host uploaded media or run its own download API.

Apple catalog search uses Apple's public iTunes Search/Lookup endpoint from the browser. It does not scrape Apple Music pages. Apple artwork files are fetched from Apple's image CDN when the user downloads them.

## Platform limits

GitHub Pages hosts static HTML, CSS, and JavaScript only. It can host Rupa's interface and the browser-side Apple/direct-file tools. A YouTube or Instagram page URL is not a direct media URL; extracting those media files needs a separate server-side service. Those platform tools remain unavailable until that service is deployed.

The direct URL tool also depends on the media host's CORS policy. If the host blocks browser access, GitHub Pages cannot proxy around that restriction.

## Development

```sh
npm ci
npm run dev
npm run build
npm run preview
```

The `main` branch deploys to GitHub Pages through `.github/workflows/deploy-pages.yml`.
