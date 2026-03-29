// Copy this file to config.js and fill in your values.
// config.js is git-ignored. Must exist alongside nowplaying.html
// both locally (for dev) and on the HA device at /config/www/.

// Music Assistant API connection
const MA_HOST = 'homeassistant.local:8095';       // MA hostname:port
const MA_TOKEN = 'YOUR_MUSIC_ASSISTANT_TOKEN';     // MA long-lived access token

// Optional: HA connection (only needed if MA_HOST is not set)
// const HA_HOST = 'homeassistant.local:8123';
// const HA_TOKEN = 'YOUR_HA_TOKEN';
