# Deploying to GitHub Pages

The site is plain static files — no build step, no server code, no database, no API keys.
GitHub Pages can host it for free exactly as it sits in the repo.

**Live URL once enabled:**

```
https://markdaniel0702.github.io/MIRC-2026-Interactive-Intramuros-Food-Map-Guide/
```

---

## 1. Publish it (one time, ~2 minutes)

1. Push the current `main` branch to GitHub.
2. On GitHub, open the repository → **Settings** (top bar).
3. In the left sidebar, click **Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Set **Branch** to `main` and the folder to **`/ (root)`**.
6. Click **Save**.

GitHub builds and publishes in about a minute. The Pages settings page then shows the
live link with a green tick. There is no workflow file to write and nothing to configure —
the built-in branch deploy serves the repo root, which is where `index.html` lives.

## 2. Re-deploying

Every push to `main` republishes automatically. There is no separate build or deploy step.

```bash
git add -A
git commit -m "Update food spots"
git push
```

Give it 30–60 seconds, then hard-refresh (**Ctrl+Shift+R**) — Pages caches aggressively.

---

## 3. Why it works unchanged

Verified before deploying, by serving the whole site from a nested folder locally and
loading it at `/MIRC-2026-Interactive-Intramuros-Food-Map-Guide/`:

- **Every asset path is relative** — `styles.css`, `app.js`, `data/food-spots.js`, and so
  on. Nothing starts with `/`, so the site works at a project subpath, not just at a
  domain root. All 53 food spots, 21 sights, 2 mapped hotels, map tiles and directions loaded
  with no console errors and no failed requests.
- **`.nojekyll`** is committed at the repo root. Nothing here would actually trip Jekyll
  today, but the file skips the Jekyll build entirely — slightly faster deploys and no
  chance of a future `_`-prefixed file being silently swallowed.
- **No server-side anything.** All data is in `data/*.js`, loaded as ordinary scripts.

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
paid or self-hosted provider. The swap is a single call in `app.js`:

```js
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { … })
```

Change the URL template and the attribution string; the navy tinting in
`styles.css` (`.leaflet-tile-pane`) is applied on top of whatever tiles arrive, so the
look survives the swap.

**If routing is ever unavailable** the site does not break: `routing.js` falls back to a
straight-line distance, an 80 m/min time estimate, and a link out to OpenStreetMap
directions. This is tested — see `dirs.py` in the test notes, or block
`routing.openstreetmap.de` in devtools and try again.

---

## 5. After deploying — a 2-minute check

Open the live URL and confirm:

- [ ] The map loads with tiles and pins (not a blank navy rectangle).
- [ ] All three tabs work: **Eat** 53, **See** 21, **Stay** 2.
- [ ] Clicking a marker opens a popup with a **Get directions** button.
- [ ] Directions from a preset return a real route with steps and a distance.
- [ ] **My location** now prompts for permission and works (this is the HTTPS-only one).
- [ ] Devtools **Console** is clean and the **Network** tab shows no 404s.
- [ ] It works on a phone — the panel becomes a drag-up sheet.

---

## 6. Optional: a custom domain

Add a file named `CNAME` at the repo root containing just the domain, e.g.
`intramuros.example.org`, then point a `CNAME` DNS record at
`markdaniel0702.github.io`. Tick **Enforce HTTPS** in Settings → Pages once the
certificate is issued. Not required — the `github.io` URL is free and already HTTPS.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| 404 at the Pages URL | Branch or folder wrong in Settings → Pages. Must be `main` + `/ (root)`. |
| Page loads but the map is empty | Check the Console. Usually a data file failed to load — confirm `data/` was committed and pushed. |
| Old version still showing | Pages caches. Hard-refresh with Ctrl+Shift+R, or wait a minute for the deploy to finish. |
| **Near me** does nothing | Only works over HTTPS. Confirm the URL is `https://`, and that location permission was not previously denied for the site. |
| Directions show a dashed straight line | The routing service is unreachable; the site is showing its fallback estimate on purpose. Try again shortly. |
