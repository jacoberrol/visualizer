// Sample Music Assistant data for tests

export const MA_BASE = 'homeassistant.local:8095';

export const playerPlaying = {
  player_id: 'RINCON_123',
  name: 'Living Room',
  available: true,
  playback_state: 'playing',
  current_media: {
    uri: 'spotify:track:abc123',
    media_type: 'track',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    image_url: 'https://i.scdn.co/image/abc123',
    duration: 355,
    source_id: 'Spotify',
  },
  elapsed_time: 42.5,
  elapsed_time_last_updated: Date.now() / 1000 - 2,
};

export const playerPaused = {
  ...playerPlaying,
  playback_state: 'paused',
  elapsed_time: 100,
  elapsed_time_last_updated: 0,
};

export const playerIdle = {
  player_id: 'RINCON_456',
  name: 'Kitchen',
  available: true,
  playback_state: 'idle',
  current_media: null,
  elapsed_time: 0,
  elapsed_time_last_updated: 0,
};

export const playerUnavailable = {
  player_id: 'RINCON_789',
  name: 'Offline Speaker',
  available: false,
  playback_state: 'idle',
  current_media: null,
  elapsed_time: 0,
  elapsed_time_last_updated: 0,
};

export const queuePlaying = {
  queue_id: 'RINCON_123',
  display_name: 'Living Room',
  state: 'playing',
  shuffle_enabled: true,
  repeat_mode: 'all',
  elapsed_time: 42.5,
  current_item: {
    name: 'Bohemian Rhapsody',
    duration: 355,
    image: {
      type: 'thumb',
      path: 'http://jellyfin.local:8096/Items/abc/Images/Primary',
    },
    media_item: {
      name: 'Bohemian Rhapsody',
      artists: [{ name: 'Queen' }],
      album: { name: 'A Night at the Opera' },
    },
  },
};

export const queueIdle = {
  queue_id: 'RINCON_123',
  display_name: 'Living Room',
  state: 'idle',
  elapsed_time: 177,
  current_item: {
    name: 'Old Track',
    media_item: {
      name: 'Old Track',
      artists: [{ name: 'Old Artist' }],
      album: { name: 'Old Album' },
    },
  },
};

export const sampleLRC = `[00:00.15] Is this the real life? Is this just fantasy?
[00:07.13] Caught in a landslide, no escape from reality
[00:14.77] Open your eyes, look up to the skies and see
[00:25.37] I'm just a poor boy, I need no sympathy
[00:30.75] Because I'm easy come, easy go, little high, little low`;
