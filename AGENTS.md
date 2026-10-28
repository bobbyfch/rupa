# Repository workflow

- `main` is the sole routine working and production branch. Work directly on `main`; do not create feature, Codex, AI, preview, or temporary branches or pull requests unless the owner explicitly requests them.
- GitHub stores code. Cloudflare Workers Builds deploys the web app automatically after each `main` push; do not use GitHub Pages, GitHub Actions deploys, or a second deployment runner.
- Worker name: `rupa-site`; production domain: `rupa.limaraya.com`. Verify the existing Cloudflare Worker before creating a new project.
- Cloudflare build command: `npm run build`; deploy command: `npx wrangler deploy`; Node.js 24.
- For local confidence run `npm ci && npm run build`. Avoid `wrangler deploy` locally during routine work, since that bypasses the connected build and duplicates deployments.
- Do not add CI workflows, new deploy providers, secrets, or branches without approval.
