# Visualizer

A "Now Playing" dashboard for Home Assistant, designed to run as a local web panel on an HA Green.

## Deployment

- **Automated**: Push to `main` triggers GitHub Actions which SCPs `nowplaying.html` to the HA Green via Tailscale + SSH
- **Manual**: Copy `nowplaying.html` to the HA Green's `config/www/` folder
- Access via `http://<ha-host>:8123/local/nowplaying.html?entity=media_player.xxx`
- No build step — single HTML file with inline CSS and JS

## Configuration

Config lives in `config.js` (git-ignored), loaded via `<script src="config.js">` before the main script:
- `HA_HOST` — hostname:port of the HA instance
- `HA_TOKEN` — long-lived access token
- `DEFAULT_ENTITY` — fallback media_player entity when no `?entity=` URL param

`config.example.js` is the committed template. Copy it to `config.js` and fill in values — both locally for dev and on the HA device at `/config/www/`.

## GitHub Actions (`.github/workflows/deploy.yml`)

On push to `main` or manual dispatch:
1. Connects to Tailscale via OAuth client
2. SCPs `nowplaying.html` to `/config/www/` on the HA Green via SSH

Required GitHub Secrets: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, `HA_SSH_HOST`, `HA_SSH_PORT`, `HA_SSH_KEY`

## Architecture

- `nowplaying.html` — all markup, styles, and logic inline
- `config.js` — runtime config, git-ignored, lives on device
- Connects to HA via **WebSocket API** (`ws://<host>/api/websocket`)
- Authenticates with a long-lived access token
- Subscribes to `state_changed` events filtered to the target `media_player` entity
- Fetches initial state via `get_states` on connect, then stays live via event stream
- Progress bar ticks locally every 1s while playing, resyncs on each state event
- Auto-reconnects on WebSocket disconnect (5s delay)

## UI

- CRT/terminal aesthetic: scanlines, vignette, green-on-black, monospace fonts (Share Tech Mono, VT323)
- Blurred album art background, corner-bracketed art frame
- Animated equalizer-style visualizer bars (cosmetic, not audio-driven)
- Shows: track title, artist, album, progress, shuffle/repeat state, source, entity ID
- Idle/standby screen when player is not active
- Connection status indicator in top bar

## Key conventions

- Keep it as a single HTML file — no external JS/CSS dependencies beyond Google Fonts and `config.js`
- All state comes from HA WebSocket; no REST API calls
- URL param `?entity=` selects the media player entity
- Secrets never committed — only `config.example.js` is in the repo
