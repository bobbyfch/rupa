# Rupa

Rupa is an independent, source-aware visual library for finding artwork, comparing editions, and keeping useful references together.

## What it does

- Search Apple Music, Books, TV, Podcasts, and App Store artwork.
- Browse Studio Ghibli and Makoto Shinkai film art with links to official source pages.
- Find indexed game covers, logos, title screens, and gameplay images by title and platform.
- Prepare still images for download with crop, size, format, and 2× interpolation controls.
- Save references locally, organize them into folders, and export a personal archive.

## Run locally

Requirements: Node.js 22 or later.

    npm install
    npm run dev

Optional worker features use VITE_API_URL (see .env.example). Do not put secrets in client-side Vite variables.

## Build and checks

    npm run typecheck
    npm test
    npm run build

## Artwork and sources

Rupa links to source pages and keeps upstream image references where possible. Image availability and reuse terms are set by each publisher, archive, or contributor. A non-profit purpose does not grant reuse rights. Studio Ghibli’s still gallery describes its own terms on the official page; the Shinkai Works collection links to official film pages. Game index metadata comes from the linked repositories and is reference-only.

Rupa does not claim ownership of third-party artwork. Check the source and its license before downloading, publishing, or reusing an image. Some artwork may be unavailable when an upstream host blocks hotlinking or browser access.

## Data handling

Saved items and profile preferences are stored in the browser’s local database. Optional sync requires the separately configured worker and database. Exported archive files are created on demand.

## License

This repository does not include a separate license for the application code. Third-party artwork and datasets remain subject to their own terms.
