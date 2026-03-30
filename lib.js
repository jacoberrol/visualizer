// Pure helper functions for the Now Playing visualizer.
// Used by core.js at runtime (via <script> tag) and by tests (via import).

(function (exports) {
  /**
   * Format seconds to M:SS display string.
   */
  exports.fmt = (s) => {
    s = Math.floor(s || 0);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  /**
   * Build a proxied album art URL through Music Assistant's imageproxy.
   * Returns empty string if no URL provided.
   */
  exports.proxyArtUrl = (url, maBase) =>
    url ? `http://${maBase}/imageproxy?path=${encodeURIComponent(url)}&size=500` : '';

  /**
   * Extract track metadata from MA player/queue data.
   * Prefers queue metadata when the queue is actively playing.
   * Falls back to player.current_media for Spotify Connect etc.
   */
  exports.extractTrackData = (media, queue, maBase) => {
    const queueIsActive = queue?.state === 'playing';
    const queueItem = queueIsActive ? queue?.current_item : null;
    const trackInfo = queueItem?.media_item;

    const title    = trackInfo?.name ?? queueItem?.name ?? media?.title ?? '—';
    const artists  = trackInfo?.artists;
    const artist   = artists?.length ? artists.map(a => a.name).join(', ') : (media?.artist ?? '—');
    const album    = trackInfo?.album?.name ?? media?.album ?? '—';
    const artUrl   = exports.proxyArtUrl(queueItem?.image?.path ?? media?.image_url ?? '', maBase);
    const duration = queueItem?.duration ?? media?.duration ?? 0;
    const source   = media?.source_id ?? media?.uri ?? '—';

    return { title, artist, album, artUrl, duration, source };
  };

  /**
   * Compute current elapsed playback position, accounting for time drift.
   */
  exports.computeElapsed = (player, isPlaying) => {
    const elapsed = player.elapsed_time ?? 0;
    const lastUpdated = player.elapsed_time_last_updated ?? 0;
    if (isPlaying && lastUpdated > 0) {
      return elapsed + (Date.now() / 1000 - lastUpdated);
    }
    return elapsed;
  };

  /**
   * Pick the best active player: prefer playing, then paused, then null.
   */
  exports.pickActivePlayer = (players) =>
    players.find(p => p.available && p.playback_state === 'playing') ??
    players.find(p => p.available && p.playback_state === 'paused') ??
    null;

  /**
   * Parse LRC (synced lyrics) format into an array of { time, text } objects.
   * Lines without valid timestamps are skipped.
   */
  exports.parseLRC = (lrc) => {
    const lines = [];
    for (const line of lrc.split('\n')) {
      const match = line.match(/^\[(\d+):(\d+\.\d+)\]\s?(.*)/);
      if (match) {
        const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
        lines.push({ time, text: match[3] });
      }
    }
    return lines;
  };

  // Browser: assign to window.NPLib
  // Node/test: module.exports
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.NPLib = {}));
