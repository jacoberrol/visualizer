# Now Playing Visualizer

A CRT/terminal-styled "Now Playing" dashboard for Home Assistant. Displays currently-playing media info from any `media_player` entity (Sonos, etc.) with a retro green-on-black aesthetic.

![screenshot placeholder]

## Features

- Real-time track info via Home Assistant WebSocket API
- Album art with blurred background
- Progress bar, shuffle/repeat indicators
- Animated visualizer bars
- Idle/standby screen when nothing is playing
- Auto-reconnect on connection loss

## Quick Start

1. Copy `config.example.js` to `config.js` and fill in your values
2. Open `nowplaying.html` in a browser

Pass `?entity=media_player.your_entity` in the URL to select a specific player. Falls back to `DEFAULT_ENTITY` from `config.js`.

## Deployment

The dashboard is a single HTML file that lives in Home Assistant's `config/www/` folder, accessible at:

```
http://<ha-host>:8123/local/nowplaying.html?entity=media_player.living_room
```

### Automated (GitOps)

Merging to `main` triggers a GitHub Actions workflow that SCPs `nowplaying.html` to the HA Green via Tailscale + SSH. See [GitOps Setup](#gitops-setup) below.

### Manual

Copy `nowplaying.html` to your HA Green's `/config/www/` folder via SSH or the File Editor add-on.

## Configuration

Runtime config lives in `config.js` (git-ignored). Copy the template:

```bash
cp config.example.js config.js
```

Then edit `config.js`:

```javascript
const HA_HOST = 'homeassistant.local:8123';    // HA hostname:port
const HA_TOKEN = 'YOUR_LONG_LIVED_ACCESS_TOKEN'; // HA Profile > Security
const DEFAULT_ENTITY = 'media_player.living_room'; // fallback entity
```

This file must exist both locally (for development) and on the HA device at `/config/www/config.js`.

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
const HA_HOST = 'homeassistant.local:8123';
const HA_TOKEN = 'your-real-token-here';
const DEFAULT_ENTITY = 'media_player.living_room';
EOF
```

This file is never overwritten by deployments — only `nowplaying.html` is deployed.

### 6. Deploy

Push to `main` or trigger manually from **Actions > Deploy to Home Assistant > Run workflow**.

## Security Notes

- `config.js` is git-ignored and never committed — secrets stay on the device
- If you previously had secrets committed in git history, rotate your HA long-lived access token (Profile > Security > Long-Lived Access Tokens)
- The SSH deploy key should only be used for this deployment workflow
