# 🦸 Times Table Hero

A fun, colorful web app that teaches kids the times tables up to **12**. It's built
as a **PWA** (Progressive Web App), so it installs onto an iPhone's home screen and
runs full-screen and offline — just like a real app — with **no App Store, no Mac,
and no Xcode required**.

![Home screen](docs/home.png)

## What's inside

- **📚 Learn** — tap a number to see its whole times table, 1–12.
- **🎈 Practice** — relaxed flashcards. Pick which tables to work on, flip to reveal
  the answer, no scoring or pressure.
- **⭐️ Quiz** — multiple-choice questions with instant feedback, a progress bar, and
  stars earned for good scores. Choose the tables and how many questions (5 / 10 / 20).
- **🏆 My Stars** — tracks your best score and stars on each table. Saved on the
  device, works offline.
- Gentle sound effects & haptics (with a mute button), encouraging messages, and
  confetti for great scores.

## Put it on your iPhone (2 steps)

### 1. Turn on free hosting (GitHub Pages) — one time
1. On GitHub, open this repo → **Settings** → **Pages** (left sidebar).
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Set **Branch** to `main` (or whichever branch has the code) and folder to **`/ (root)`**, then **Save**.
4. Wait ~1 minute. GitHub shows a live URL like
   `https://<your-username>.github.io/times-table-hero/`.

### 2. Add it to the home screen
1. Open that URL in **Safari** on the iPhone.
2. Tap the **Share** button (□↑) → **Add to Home Screen** → **Add**.
3. Done! Tap the new **Table Hero** icon. It opens full-screen and works even with no
   internet.

> Tip: the app remembers stars per-device. It works great offline once opened.

## Run it on your computer (optional)

Any static file server works — no build step. For example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

> Service workers (offline mode) need `http://localhost` or an HTTPS URL — opening the
> file directly with `file://` will show the app but skip offline caching. GitHub Pages
> is HTTPS, so it works fully there.

## Project layout

```
index.html              # all screens (markup)
css/styles.css          # styling (light + dark, iPhone safe-areas)
js/app.js               # all game logic, no dependencies
manifest.webmanifest    # PWA metadata (name, icons, colors)
service-worker.js       # offline caching
icons/                  # app icons (generated)
make_icons.py           # regenerates the icons (needs Pillow)
smoke.js                # headless browser test of the core flows
```

## Tweaking it

- **Change the top number** (e.g. up to 15): edit `var MAX = 12;` near the top of
  `js/app.js`.
- **Change star thresholds**: see `starsFor(pct)` in `js/app.js`.
- **Regenerate icons** after editing colors: `pip install Pillow && python3 make_icons.py`.
- If you change any file, bump `var CACHE = "tth-v1";` in `service-worker.js` so phones
  pick up the new version.

Made with 💜 for a future math whiz.
