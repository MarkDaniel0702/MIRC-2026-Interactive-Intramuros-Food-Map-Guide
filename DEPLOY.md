# Deploying to GitHub Pages

The site is a React + Vite build with no server code, no database, and no API keys in the
client. `.github/workflows/deploy.yml` builds it and publishes `dist/` to GitHub Pages on
every push to `main` — there is nothing to build by hand.

**Live URL:**

```
https://mirc2026interactivemap.me/
```

(The old `markdaniel0702.github.io/MIRC-2026-Interactive-Intramuros-Food-Map-Guide/` link forwards here — see §6.)

---

## 1. Publish it (one time, ~2 minutes)

1. Push the current `main` branch to GitHub.
2. On GitHub, open the repository → **Settings** (top bar).
3. In the left sidebar, click **Pages**.
4. Under **Build and deployment → Source**, choose **GitHub Actions** (not "Deploy from
   a branch" — that served the old static files directly and no longer applies).
5. Push to `main` (or re-run the workflow from the **Actions** tab) to trigger the first
   build.

The `deploy.yml` workflow runs `npm ci && npm run build`, then publishes `dist/`. Check
the **Actions** tab for progress; the Pages settings page shows the live link once it
completes.

## 2. Re-deploying

Every push to `main` rebuilds and republishes automatically via the Actions workflow.

```bash
git add -A
git commit -m "Update food spots"
git push
```

Watch the **Actions** tab for the build to finish (a minute or two), then hard-refresh
(**Ctrl+Shift+R**) — Pages caches aggressively.

---

## 3. Why the build works at the domain root

- **`vite.config.ts` sets `base` to `/`**, because the site is served from the root of its
  custom domain (§6). Every bundled asset URL is generated against that base. If the custom
  domain is ever removed, the site falls back to the `/MIRC-2026-Interactive-Intramuros-Food-Map-Guide/` project
  subpath and `base` must go back to that — a mismatch here is the classic Vite-on-Pages
  failure mode: a blank page with every asset 404ing.
- **`.nojekyll` lives in `public/`**, so Vite copies it into `dist/` on every build. Without
  it, Pages would run Jekyll over the build output and could silently drop files.
- **`public/data/chat-corpus.json`** is what the Cloudflare Worker reads
  (`worker/wrangler.toml`'s `CORPUS_URL`) — see `CHATBOT.md`. It reads the committed file
  from `raw.githubusercontent.com`, not the site, so only a repo rename changes that URL.

### Geolocation gets *better* after deploying

`navigator.geolocation` needs a **secure context**. It never works from `file://` or plain
`http://` on a LAN address, which is why **Near me** and **My location** cannot be tested
properly on a local server. GitHub Pages serves HTTPS, so both start working the moment
the site is live. This is worth checking first after deploy.

---

## 4. External services (both free, no account, no key)

| Service | Used for | Notes |
|---|---|---|
| [OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/) | the base map | Community-run. Fine for a project site; see below if traffic grows. |
| [FOSSGIS OSRM](https://routing.openstreetmap.de/) `routed-foot` | walking directions | The same routing service openstreetmap.org uses. Sends `Access-Control-Allow-Origin: *`, so it works from a static page. |

Neither needs a key, so **nothing secret is exposed in the client** — there is nothing to
leak and nothing to bill.

**If the site ever gets real traffic**, the OSM tile policy asks heavy users to move to a
paid or self-hosted provider. The swap is a single call in `src/hooks/useLeafletMap.ts`:

```js
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { … })
```

Change the URL template and the attribution string; the navy tinting in
`src/styles.css` (`.leaflet-tile-pane`) is applied on top of whatever tiles arrive, so the
look survives the swap.

**If routing is ever unavailable** the site does not break: `src/lib/routing.ts` falls
back to a straight-line distance, an 80 m/min time estimate, and a link out to
OpenStreetMap directions. Test it by blocking `routing.openstreetmap.de` in devtools and
trying again.

---

## 5. After deploying — a 2-minute check

Open the live URL and confirm:

- [ ] The map loads with tiles and pins (not a blank navy rectangle).
- [ ] All three tabs work: **Eat** 67, **See** 21, **Stay** 2.
- [ ] **Ask Dan** opens and answers a question (confirms the Worker's CORS allowlist
      still matches this deployed origin).
- [ ] Clicking a marker opens a popup with a **Get directions** button.
- [ ] Directions from a preset return a real route with steps and a distance.
- [ ] **My location** now prompts for permission and works (this is the HTTPS-only one).
- [ ] Devtools **Console** is clean and the **Network** tab shows no 404s.
- [ ] It works on a phone — the panel becomes a drag-up sheet.

---

## 6. The custom domain

The site is served at **`mirc2026interactivemap.me`**, a free `.me` domain from the GitHub
Student Developer Pack (Namecheap, registered 2026-09-27, free until 2027-09-27 — renewal
is paid, so check auto-renew in Namecheap).

- **DNS (Namecheap → Advanced DNS):** four `A` records on `@` to `185.199.108.153`,
  `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, and a `CNAME` on `www` to
  `markdaniel0702.github.io`.
- **GitHub:** Settings → Pages → Custom domain holds the domain, with **Enforce HTTPS**
  ticked once the certificate is issued. No `CNAME` file is needed: the Actions deploy
  ignores it.
- **Old links:** GitHub forwards `markdaniel0702.github.io/MIRC-2026-Interactive-Intramuros-Food-Map-Guide/…` to the same
  path on the domain; `public/404.html` strips the old prefix so those links still land.

**If the domain ever changes, update together:** `vite.config.ts`'s `base`, the absolute
URLs in `index.html`, `public/robots.txt`, `public/sitemap.xml` and `public/404.html`, and
`worker/wrangler.toml`'s `ALLOWED_ORIGINS` (then `npx wrangler deploy` in `worker/`). The
Worker's `CORPUS_URL` reads from the repo, not the site, so it does not change.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| 404 at the Pages URL | Settings → Pages → Source must be **GitHub Actions**, not "Deploy from a branch". Check the **Actions** tab for a failed or missing run. |
| Blank page, every asset 404s | `vite.config.ts`'s `base` doesn't match the deployed path — see §3 above. |
| Page loads but the map is empty | Check the Console. Usually a data file failed to load — confirm `data/` was committed and pushed, and that the Actions build succeeded. |
| Old version still showing | Pages caches. Hard-refresh with Ctrl+Shift+R, or wait for the Actions run to finish. |
| **Near me** does nothing | Only works over HTTPS. Confirm the URL is `https://`, and that location permission was not previously denied for the site. |
| **Ask Dan** says it could not reach the assistant | The deployed origin isn't in `worker/wrangler.toml`'s `ALLOWED_ORIGINS` — check it matches exactly (see §6 if using a custom domain). |
| Directions show a dashed straight line | The routing service is unreachable; the site is showing its fallback estimate on purpose. Try again shortly. |
