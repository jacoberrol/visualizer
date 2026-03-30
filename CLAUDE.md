# Visualizer

A "Now Playing" dashboard for Home Assistant, designed to run as a local web panel on an HA Green.

## Deployment

- **Automated**: Push to `main` triggers GitHub Actions which SCPs `nowplaying.html`, `core.js`, `package.json`, and `models/` to the HA Green via Tailscale + SSH
- **Manual**: Copy the above files to the HA Green's `config/www/` folder
- Access via `http://<ha-host>:8123/local/nowplaying.html`
- No build step — CI stamps version and SHA into the HTML before deploy

## Configuration

Config lives in `config.js` (git-ignored), loaded via `<script src="config.js">` before core.js:
- `MA_HOST` — hostname:port of the Music Assistant instance
- `MA_TOKEN` — long-lived MA access token

`config.example.js` is the committed template. Copy it to `config.js` and fill in values — both locally for dev and on the HA device at `/config/www/`.

## GitHub Actions

### `deploy.yml`
On push to `main` or manual dispatch:
1. Connects to Tailscale via OAuth client
2. Stamps `__VERSION__` and `__SHA__` into `nowplaying.html`
3. SCPs `nowplaying.html`, `core.js`, `package.json`, and `models/` to `/config/www/` on the HA Green

### `version-check.yml`
On PRs to `main`: fails if `package.json` version wasn't bumped vs `main`.

Required GitHub Secrets: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, `HA_SSH_HOST`, `HA_SSH_PORT`, `HA_SSH_KEY`

## Architecture

### File structure
- `nowplaying.html` — HTML skeleton + model loader (no inline CSS/JS beyond reset)
- `core.js` — all WS, state management, progress, clock, DOM updates (IIFE, only `window.NP` exported)
- `config.js` — runtime config, git-ignored, lives on device
- `package.json` — semver version, used for auto-reload detection
- `models/<name>.css` — complete visual styling for a model (layout, fonts, colors, effects)
- `models/<name>.js` — model-specific behaviors (data-stream ticker, color sub-themes, etc.)

### Models
- **te** (default) — Teenage Engineering inspired: Space Grotesk font, warm orange on dark, clean geometry
- **crt** — green CRT terminal: scanlines, vignette, monospace, with color sub-themes via `?color=` (amber, blue, red, white)

Select with `?theme=te` (default) or `?theme=crt`.

### Data flow
- Connects to **Music Assistant** via WebSocket (`ws://<host>:8095/ws`)
- Authenticates with a long-lived MA access token
- Fetches initial state via `players/all` and `player_queues/all` commands on connect
- Listens for `player_updated`, `queue_updated`, and `queue_time_updated` push events
- **Polling workaround**: Also polls every 5s because MA server v2.8.1 does not push events despite subscribing after auth
- Album art proxied through MA's `/imageproxy?path=<url>&size=500` for devices without Tailscale
- Progress bar ticks locally every 1s, resyncs on each poll or event
- Auto-reconnects on WebSocket disconnect (5s delay)
- **Auto-reload**: polls `package.json` every 30s, reloads page when version changes (triggered by deploy)

### Hook system
`core.js` exposes `window.NP` with hooks so model JS can react to state changes:
- `NP.hooks.onTrackChange` — track metadata updated
- `NP.hooks.onStateChange` — playback state changed
- `NP.hooks.onProgress` — progress tick

## UI

- Multiple visual models selectable via `?theme=` URL param
- Blurred album art background
- Animated equalizer-style visualizer bars (cosmetic, not audio-driven)
- Shows: track title, artist, album, progress, shuffle/repeat state, source, player name
- Idle/standby screen when player is not active
- Connection status indicator in top bar
- Version + commit SHA displayed in top bar

## Key conventions

- HTML is a shared skeleton — all styling lives in model CSS files
- Core JS is model-agnostic — model-specific behavior goes in model JS
- All state comes from Music Assistant WebSocket; no REST API calls (except `/imageproxy` for album art)
- Secrets never committed — only `config.example.js` is in the repo
- Version bump required for every PR (enforced by CI)
- Adding new themes: create `models/<name>.css` + `models/<name>.js`, add `'<name>'` to the `themes` array in the theme selector script in `nowplaying.html`
