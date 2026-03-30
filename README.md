# Now Playing Visualizer

A "Now Playing" dashboard for Home Assistant, powered by Music Assistant. Displays currently-playing media info with multiple visual themes.

![screenshot placeholder]

## Features

- Real-time track info via Music Assistant WebSocket API
- Album art with blurred background
- Progress bar, shuffle/repeat indicators
- Animated visualizer bars
- Multiple visual models: **TE** (Teenage Engineering) and **CRT** (retro terminal)
- Idle/standby screen when nothing is playing
- Auto-reconnect on connection loss
- Auto-reload on deploy (polls for version changes)

## Quick Start

1. Copy `config.example.js` to `config.js` and fill in your values
2. Serve the project via a local HTTP server (e.g. `python3 -m http.server 8080`)
3. Open `http://localhost:8080/nowplaying.html`

### Themes

- `?theme=te` (default) — Teenage Engineering: clean geometric, warm orange, Space Grotesk font
- `?theme=crt` — retro CRT terminal: green on black, scanlines, monospace
- `?theme=crt&color=amber` — CRT with amber palette (also: `blue`, `red`, `white`)

## Deployment

The dashboard lives in Home Assistant's `config/www/` folder, accessible at:

```
http://<ha-host>:8123/local/nowplaying.html
```

### Automated (GitOps)

Merging to `main` triggers a GitHub Actions workflow that:
1. Stamps the version and commit SHA into the HTML
2. SCPs `nowplaying.html`, `core.js`, `package.json`, and `models/` to the HA Green via Tailscale + SSH

A separate CI check on PRs enforces that the `package.json` version was bumped.

See [GitOps Setup](#gitops-setup) below.

### Manual

Copy `nowplaying.html`, `core.js`, `package.json`, and the `models/` directory to your HA Green's `/config/www/` folder via SSH or the File Editor add-on.

## Configuration

Runtime config lives in `config.js` (git-ignored). Copy the template:

```bash
cp config.example.js config.js
```

Then edit `config.js`:

```javascript
const MA_HOST = 'homeassistant.local:8095';       // Music Assistant hostname:port
const MA_TOKEN = 'YOUR_MUSIC_ASSISTANT_TOKEN';     // MA long-lived access token
```

This file must exist both locally (for development) and on the HA device at `/config/www/config.js`.

## Versioning

The project uses semver via `package.json`. Every PR must bump the version:

```bash
npm version patch   # 0.2.0 → 0.2.1
npm version minor   # 0.2.0 → 0.3.0
npm version major   # 0.2.0 → 1.0.0
```

The deployed page polls `package.json` every 30 seconds and auto-reloads when the version changes.

## Adding New Themes

1. Create `models/<name>.css` (full styling: layout, fonts, colors, effects)
2. Create `models/<name>.js` (model-specific behaviors, can be minimal)
3. Use `?theme=<name>` — no changes to core files needed

## GitOps Setup

### Prerequisites

- Home Assistant Green (or any HAOS device) on a Tailscale network
- SSH add-on installed on the HA device (e.g., Advanced SSH & Web Terminal)
- A GitHub repository for this project

### 1. Generate an SSH deploy key

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/ha_deploy_key
```

### 2. Add the public key to the HA SSH add-on

Go to **Settings > Add-ons > your SSH add-on > Configuration** and paste the contents of `~/.ssh/ha_deploy_key.pub` into the `authorized_keys` field. Restart the add-on.

**Important:** Add the key through the add-on's Configuration UI, not directly to `/etc/ssh/authorized_keys` — that file gets cleared on add-on restart.

### 3. Create a Tailscale OAuth client

In the [Tailscale admin console](https://login.tailscale.com/admin):

1. Go to **Access Controls > Tags** and create a `tag:ci` tag (owner: `autogroup:admin`)
2. Go to **Settings > OAuth clients** and create a new client:
   - **Scopes**: `auth_keys` (write)
   - **Tags**: `tag:ci`
3. Save the client ID and secret

### 4. Configure GitHub Secrets

In your repo at **Settings > Secrets and variables > Actions**, add these repository secrets:

| Secret | Value |
|--------|-------|
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
| `TS_OAUTH_SECRET` | Tailscale OAuth client secret |
| `HA_SSH_HOST` | Tailscale MagicDNS hostname or IP (`100.x.x.x`) of the HA device |
| `HA_SSH_PORT` | SSH port (check your SSH add-on config, commonly `22` or `22222`) |
| `HA_SSH_KEY` | Full contents of `~/.ssh/ha_deploy_key` (the private key) |

**Finding your HA device's Tailscale address:** Run `tailscale status` from any device on your tailnet, or check the [Machines page](https://login.tailscale.com/admin/machines) in the admin console. Use the MagicDNS name or `100.x.x.x` IP — not `homeassistant.local` (mDNS doesn't resolve from GitHub runners).

### 5. Create `config.js` on the HA device

SSH into the HA Green and create the config file:

```bash
ssh root@<tailscale-hostname> -p <port>
cat > /config/www/config.js << 'EOF'
const MA_HOST = 'homeassistant.local:8095';
const MA_TOKEN = 'your-ma-token-here';
EOF
```

This file is never overwritten by deployments.

### 6. Deploy

Push to `main` or trigger manually from **Actions > Deploy to Home Assistant > Run workflow**.

## Fire TV Kiosk Setup

For a dedicated "now playing" display on a Fire TV, use [Fully Kiosk Browser](https://www.fully-kiosk.com/) to run the dashboard full-screen without browser chrome.

1. **Enable ADB Debugging** on the Fire TV: Settings → My Fire TV → Developer Options → ADB Debugging → ON
2. **Find the Fire TV's IP**: Settings → My Fire TV → About → Network
3. **Sideload Fully Kiosk Browser**:
   ```bash
   adb connect <fire-tv-ip>
   adb install fullykiosk.apk
   ```
4. **Set the Start URL** in Fully Kiosk's settings:
   ```
   http://<ha-host>:8123/local/nowplaying.html
   ```
5. **Enable Start on Boot** in Fully Kiosk's settings so the dashboard launches automatically when the TV powers on

> **Note:** Fully Kiosk Browser requires Android 8+. Fire TVs from 2017 or earlier (Android 7 / Fire OS 5) may need an older APK version.

## Security Notes

- `config.js` is git-ignored and never committed — secrets stay on the device
- If you previously had secrets committed in git history, rotate your tokens
- The SSH deploy key should only be used for this deployment workflow
