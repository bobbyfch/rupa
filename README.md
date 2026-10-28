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
- YouTube links can show and download thumbnails using YouTube's oEmbed endpoint. This does not extract or download YouTube video files.
- Instagram is listed as a planned tool. Instagram and full YouTube downloads require a compatible media service; a static site cannot bypass platform restrictions or host a server-side extractor.

Rupa has no custom scraping service or Rupa download API. Catalog searches and motion artwork lookups call public third-party endpoints directly from the browser; media files are downloaded to the user's device. The direct URL tool depends on the host's CORS policy.

## Development

```sh
npm ci
npm run dev
npm run build
npm run preview
```

## Production deployment — Cloudflare Workers

GitHub is source control, not a website host or deployment runner. The only production branch is `main`. A push to `main` should trigger a single Cloudflare Workers Build using the checked-in `wrangler.jsonc`; there are no GitHub Pages or GitHub Actions deployment workflows.

Connect **one** Worker named `rupa-site` to this GitHub repository in **Workers & Pages → rupa-site → Settings → Builds**. Do not create a second Worker if that name already exists. Use:

- Production branch: `main`
- Project root: repository root
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Node.js: 24 (see `.node-version`)
- Worker static assets: `dist/` (read from `wrangler.jsonc`; do not specify a Pages output directory)
- Intended custom domain: `rupa.limaraya.com` (requires confirming the domain and Worker in your Cloudflare account)

The repository's old GitHub Pages deployment and PR-only CI workflows have been removed. `npm run build` already executes TypeScript validation before bundling. Confirm the new Workers deployment succeeds before disabling an existing live GitHub Pages site in repository settings; changing repository files alone does not disable GitHub Pages in GitHub's settings.

## Local development

Use `npm ci`, `npm run dev` and `npm run build`. Vite uses `/` as its production base, appropriate for a Cloudflare root domain; `VITE_BASE_PATH` remains available for exceptional subpath deployments.

