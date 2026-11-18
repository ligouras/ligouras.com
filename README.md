# ligouras.com

Personal site and CV for [ligouras.com](https://ligouras.com), built with Astro from a single `PROFILE.md` source of truth and deployed to GitHub Pages.

## Stack

- **Single source of truth:** `PROFILE.md` drives both the homepage (`src/pages/index.astro`) and the printable CV (`src/pages/cv/index.astro` → `dist/cv.pdf`)
- **Astro** static site with OLED dark theme (`#09090b`), `Archivo` + `Space Grotesk` typography, and `#2563eb` accent
- **Build-time GitHub activity:** `src/lib/github-contributions.ts` fetches the 365-day contribution heatmap (without listing repos)
- **CV PDF generation:** `scripts/generate-cv.mjs` prints `/cv/` to `dist/cv.pdf` via headless Chrome/Chromium
- **Unlisted static subpaths:** `hashimoto/`, `job/`, and `CNAME` are copied into `dist/` by `scripts/copy-static.mjs`

## Local development

```bash
npm install
npm run dev
```

To build the site + `dist/cv.pdf` (and optionally refresh `public/cv.pdf` as a fallback):

```bash
npm run build
npm run cv
npm run preview
```

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys `dist/` to GitHub Pages on push to `main` and daily at `06:00 UTC` so the GitHub activity graph stays current.

> In GitHub repo settings, ensure **Settings → Pages → Source** is set to **GitHub Actions**.
>
> Optional: if private contributions are hidden on your public profile, add a `GH_CONTRIBUTIONS_TOKEN` repository secret (`read:user` scope) so the build fetches full counts via GitHub GraphQL.
