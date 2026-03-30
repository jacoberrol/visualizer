import { describe, it, expect, vi } from 'vitest';
import { fmt, proxyArtUrl, extractTrackData, computeElapsed, pickActivePlayer, parseLRC } from '../../lib.js';
import {
  MA_BASE, playerPlaying, playerPaused, playerIdle, playerUnavailable,
  queuePlaying, queueIdle, sampleLRC,
} from '../fixtures/data.js';

describe('fmt', () => {
  it('formats zero seconds', () => {
    expect(fmt(0)).toBe('0:00');
  });

  it('formats seconds under a minute', () => {
    expect(fmt(5)).toBe('0:05');
    expect(fmt(30)).toBe('0:30');
    expect(fmt(59)).toBe('0:59');
  });

  it('formats minutes and seconds', () => {
    expect(fmt(60)).toBe('1:00');
    expect(fmt(65)).toBe('1:05');
    expect(fmt(125)).toBe('2:05');
    expect(fmt(600)).toBe('10:00');
  });

  it('floors fractional seconds', () => {
    expect(fmt(65.7)).toBe('1:05');
    expect(fmt(59.99)).toBe('0:59');
  });

  it('handles null/undefined', () => {
    expect(fmt(null)).toBe('0:00');
    expect(fmt(undefined)).toBe('0:00');
  });

  it('pads single-digit seconds', () => {
    expect(fmt(61)).toBe('1:01');
    expect(fmt(3601)).toBe('60:01');
  });
});

describe('proxyArtUrl', () => {
  it('returns empty string for falsy input', () => {
    expect(proxyArtUrl('', MA_BASE)).toBe('');
    expect(proxyArtUrl(null, MA_BASE)).toBe('');
    expect(proxyArtUrl(undefined, MA_BASE)).toBe('');
  });

  it('proxies a URL through MA imageproxy', () => {
    const url = 'http://jellyfin.local:8096/Items/abc/Images/Primary';
    const result = proxyArtUrl(url, MA_BASE);
    expect(result).toBe(`http://${MA_BASE}/imageproxy?path=${encodeURIComponent(url)}&size=500`);
  });

  it('encodes special characters in the URL', () => {
    const url = 'http://host/path?key=value&other=123';
    const result = proxyArtUrl(url, MA_BASE);
    expect(result).toContain(encodeURIComponent(url));
  });
});

describe('extractTrackData', () => {
  it('extracts from active queue with rich metadata', () => {
    const media = playerPlaying.current_media;
    const track = extractTrackData(media, queuePlaying, MA_BASE);

    expect(track.title).toBe('Bohemian Rhapsody');
    expect(track.artist).toBe('Queen');
    expect(track.album).toBe('A Night at the Opera');
    expect(track.duration).toBe(355);
    expect(track.artUrl).toContain('imageproxy');
    expect(track.source).toBe('Spotify');
  });

  it('falls back to player media when queue is idle/stale', () => {
    const media = playerPlaying.current_media;
    const track = extractTrackData(media, queueIdle, MA_BASE);

    // Queue is idle, so should use media data
    expect(track.title).toBe('Bohemian Rhapsody');
    expect(track.artist).toBe('Queen');
  });

  it('falls back to player media when queue is null', () => {
    const media = playerPlaying.current_media;
    const track = extractTrackData(media, null, MA_BASE);

    expect(track.title).toBe('Bohemian Rhapsody');
    expect(track.artist).toBe('Queen');
    expect(track.album).toBe('A Night at the Opera');
  });

  it('returns dashes for missing data', () => {
    const track = extractTrackData(null, null, MA_BASE);
    expect(track.title).toBe('—');
    expect(track.artist).toBe('—');
    expect(track.album).toBe('—');
    expect(track.duration).toBe(0);
    expect(track.source).toBe('—');
  });

  it('joins multiple artists', () => {
    const queue = {
      ...queuePlaying,
      current_item: {
        ...queuePlaying.current_item,
        media_item: {
          ...queuePlaying.current_item.media_item,
          artists: [{ name: 'Freddie' }, { name: 'Brian' }],
        },
      },
    };
    const track = extractTrackData(playerPlaying.current_media, queue, MA_BASE);
    expect(track.artist).toBe('Freddie, Brian');
  });
});

describe('computeElapsed', () => {
  it('returns elapsed_time when paused', () => {
    const result = computeElapsed(playerPaused, false);
    expect(result).toBe(100);
  });

  it('returns elapsed_time when not playing', () => {
    const result = computeElapsed(playerPlaying, false);
    expect(result).toBe(playerPlaying.elapsed_time);
  });

  it('adds time drift when playing', () => {
    const result = computeElapsed(playerPlaying, true);
    // elapsed_time + (now - last_updated), last_updated was ~2s ago
    expect(result).toBeGreaterThan(playerPlaying.elapsed_time);
    expect(result).toBeLessThan(playerPlaying.elapsed_time + 10);
  });

  it('handles zero elapsed_time', () => {
    const player = { elapsed_time: 0, elapsed_time_last_updated: 0 };
    expect(computeElapsed(player, false)).toBe(0);
  });

  it('handles missing fields', () => {
    expect(computeElapsed({}, false)).toBe(0);
  });
});

describe('pickActivePlayer', () => {
  it('prefers playing over paused', () => {
    const result = pickActivePlayer([playerPaused, playerPlaying]);
    expect(result.player_id).toBe(playerPlaying.player_id);
  });

  it('picks paused when nothing is playing', () => {
    const result = pickActivePlayer([playerIdle, playerPaused]);
    expect(result.player_id).toBe(playerPaused.player_id);
  });

  it('returns null when all idle', () => {
    const result = pickActivePlayer([playerIdle]);
    expect(result).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(pickActivePlayer([])).toBeNull();
  });

  it('skips unavailable players', () => {
    const result = pickActivePlayer([playerUnavailable, playerIdle]);
    expect(result).toBeNull();
  });

  it('picks available playing over unavailable playing', () => {
    const unavailablePlaying = { ...playerPlaying, available: false };
    const result = pickActivePlayer([unavailablePlaying, playerPaused]);
    expect(result.player_id).toBe(playerPaused.player_id);
  });
});

describe('parseLRC', () => {
  it('parses valid LRC lines', () => {
    const lines = parseLRC(sampleLRC);
    expect(lines).toHaveLength(5);
    expect(lines[0]).toEqual({ time: 0.15, text: 'Is this the real life? Is this just fantasy?' });
    expect(lines[1].time).toBeCloseTo(7.13);
    expect(lines[4].time).toBeCloseTo(30.75);
  });

  it('calculates minutes correctly', () => {
    const lines = parseLRC('[01:30.00] Test line');
    expect(lines[0].time).toBe(90);
  });

  it('skips invalid lines', () => {
    const lrc = `[00:10.00] Valid line
Not a timestamp
[invalid] Also not valid
[00:20.00] Another valid line`;
    const lines = parseLRC(lrc);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('Valid line');
    expect(lines[1].text).toBe('Another valid line');
  });

  it('handles empty input', () => {
    expect(parseLRC('')).toEqual([]);
  });

  it('handles lines with empty text', () => {
    const lines = parseLRC('[00:05.00] ');
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('');
  });
});
