// Core logic for the Now Playing visualizer.
// Handles WebSocket connection to Music Assistant, state management,
// progress tracking, and DOM updates. Model-agnostic.

if (typeof MA_TOKEN === 'undefined') {
  document.body.innerHTML = '<pre style="color:#ff2244;padding:40px;">ERROR: config.js not found or missing MA_TOKEN.\nCopy config.example.js to config.js and fill in your values.</pre>';
  throw new Error('config.js not loaded');
}

// ── Public API ──────────────────────────────────────────────────────
const NP = window.NP = {
  hooks: { onTrackChange: [], onStateChange: [], onProgress: [] },
  state: {
    isPlaying: false, title: '', artist: '', album: '', artUrl: '',
    position: 0, duration: 0, source: '', playerName: '',
    shuffleEnabled: false, repeatEnabled: false, playbackState: 'idle',
  },
};

// ── IIFE: all internals stay private ────────────────────────────────
(function () {
  const MA_BASE = typeof MA_HOST !== 'undefined' ? MA_HOST : HA_HOST.replace(':8123', ':8095');

  // ── DOM cache ───────────────────────────────────────────────────
  const el = {
    debugInfo:   document.getElementById('debug-info'),
    clock:       document.getElementById('clock'),
    wsStatus:    document.getElementById('ws-status'),
    connError:   document.getElementById('conn-error'),
    idleScreen:  document.getElementById('idle-screen'),
    trackTitle:  document.getElementById('track-title'),
    trackArtist: document.getElementById('track-artist'),
    trackAlbum:  document.getElementById('track-album'),
    stateText:   document.getElementById('state-text'),
    stateDot:    document.getElementById('state-dot'),
    entityId:    document.getElementById('entity-id'),
    mediaSource: document.getElementById('media-source'),
    albumArt:    document.getElementById('album-art'),
    artBg:       document.getElementById('art-bg'),
    progressBar: document.getElementById('progress-bar'),
    posCurrent:  document.getElementById('pos-current'),
    posDuration: document.getElementById('pos-duration'),
    stateIndicator: document.getElementById('state-indicator'),
    btnPrev:     document.getElementById('btn-prev'),
    btnNext:     document.getElementById('btn-next'),
    pillShuffle: document.getElementById('pill-shuffle'),
    pillRepeat:  document.getElementById('pill-repeat'),
    visualizer:  document.getElementById('visualizer'),
  };

  if (el.debugInfo) el.debugInfo.textContent = `TARGET: ws://${MA_BASE}/ws`;

  // ── Utilities ───────────────────────────────────────────────────
  const fmt = (s) => {
    s = Math.floor(s || 0);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const proxyArtUrl = (url) =>
    url ? `http://${MA_BASE}/imageproxy?path=${encodeURIComponent(url)}&size=500` : '';

  const runHooks = (name, data) => {
    for (const fn of NP.hooks[name] ?? []) {
      try { fn(data); } catch (e) { console.error('Hook error:', e); }
    }
  };

  // ── Visualizer ──────────────────────────────────────────────────
  const BAR_COUNT = 32;
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.setProperty('--max-h', `${Math.floor(Math.random() * 34) + 6}px`);
    bar.style.animationDuration = `${(Math.random() * 0.5 + 0.2).toFixed(2)}s`;
    bar.style.animationDelay = `${(Math.random() * 0.3).toFixed(2)}s`;
    el.visualizer.appendChild(bar);
  }

  const setVisualizerPlaying = (playing) => {
    const state = playing ? 'running' : 'paused';
    el.visualizer.querySelectorAll('.bar').forEach(b => { b.style.animationPlayState = state; });
  };

  // ── Clock ───────────────────────────────────────────────────────
  const updateClock = () => { el.clock.textContent = new Date().toTimeString().slice(0, 8); };
  setInterval(updateClock, 1000);
  updateClock();

  // ── Progress ────────────────────────────────────────────────────
  let currentPos = 0;
  let currentDuration = 0;
  let lastProgressPct = 0;
  let progressInterval = null;
  let isPlaying = false;

  const updateProgress = () => {
    if (currentDuration <= 0) return;
    const pct = Math.min((currentPos / currentDuration) * 100, 100);

    // Snap (no transition) when progress jumps backwards (track change)
    if (pct < lastProgressPct - 5) {
      el.progressBar.style.transition = 'none';
      el.progressBar.style.width = `${pct}%`;
      el.progressBar.offsetWidth; // force reflow
      el.progressBar.style.transition = '';
    } else {
      el.progressBar.style.width = `${pct}%`;
    }

    lastProgressPct = pct;
    el.posCurrent.textContent = fmt(currentPos);
    el.posDuration.textContent = fmt(currentDuration);
    NP.state.position = currentPos;
    runHooks('onProgress', NP.state);
  };

  const startProgressTick = () => {
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      if (isPlaying) { currentPos += 1; updateProgress(); }
    }, 1000);
  };

  // ── Track data extraction ───────────────────────────────────────
  const extractTrackData = (media, player, queue) => {
    // Prefer queue metadata when the queue is actively playing.
    // Spotify Connect bypasses MA's queue, leaving it idle/stale.
    const queueIsActive = queue?.state === 'playing';
    const queueItem = queueIsActive ? queue?.current_item : null;
    const trackInfo = queueItem?.media_item;

    const title    = trackInfo?.name ?? queueItem?.name ?? media?.title ?? '—';
    const artists  = trackInfo?.artists;
    const artist   = artists?.length ? artists.map(a => a.name).join(', ') : (media?.artist ?? '—');
    const album    = trackInfo?.album?.name ?? media?.album ?? '—';
    const artUrl   = proxyArtUrl(queueItem?.image?.path ?? media?.image_url ?? '');
    const duration = queueItem?.duration ?? media?.duration ?? 0;
    const source   = media?.source_id ?? media?.uri ?? '—';

    return { title, artist, album, artUrl, duration, source };
  };

  const computeElapsed = (player) => {
    const elapsed = player.elapsed_time ?? 0;
    const lastUpdated = player.elapsed_time_last_updated ?? 0;
    if (isPlaying && lastUpdated > 0) {
      return elapsed + (Date.now() / 1000 - lastUpdated);
    }
    return elapsed;
  };

  // ── DOM rendering ───────────────────────────────────────────────
  const renderTrack = (track, state, player, queue) => {
    el.trackTitle.textContent = track.title;
    el.trackArtist.textContent = track.artist;
    el.trackAlbum.textContent = track.album;
    el.stateText.textContent = state.toUpperCase();
    el.entityId.textContent = `PLAYER: ${player.name.toUpperCase()}`;
    el.mediaSource.textContent = track.source.length > 60
      ? track.source.slice(0, 60) + '…' : track.source;

    if (track.artUrl) {
      el.albumArt.src = track.artUrl;
      el.artBg.style.backgroundImage = `url('${track.artUrl}')`;
    }

    const shuffleOn = !!queue?.shuffle_enabled;
    const repeatOn  = !!(queue?.repeat_mode && queue.repeat_mode !== 'off');
    el.pillShuffle.classList.toggle('active', shuffleOn);
    el.pillRepeat.classList.toggle('active', repeatOn);

    el.stateDot.style.background = isPlaying ? 'var(--accent)' : 'var(--warning)';
    el.stateDot.style.boxShadow  = isPlaying ? '0 0 8px var(--accent)' : '0 0 8px var(--warning)';

    setVisualizerPlaying(isPlaying);
    el.idleScreen.classList.remove('visible');
    updateProgress();

    // Sync public state
    Object.assign(NP.state, {
      isPlaying, playbackState: state,
      title: track.title, artist: track.artist, album: track.album,
      artUrl: track.artUrl, position: currentPos, duration: currentDuration,
      source: track.source, playerName: player.name,
      shuffleEnabled: shuffleOn, repeatEnabled: repeatOn,
    });
    runHooks('onTrackChange', NP.state);
  };

  // ── Player state management ─────────────────────────────────────
  let activePlayerId = null;
  let lastKnownMedia = null;

  const showIdle = () => {
    el.idleScreen.classList.add('visible');
    setVisualizerPlaying(false);
    NP.state.playbackState = 'idle';
    runHooks('onStateChange', NP.state);
  };

  const updateFromPlayer = (player, queue) => {
    const state = player.playback_state ?? 'idle';
    const media = player.current_media;
    const hasMedia = !!queue?.current_item?.media_item || !!(media?.title);

    isPlaying = state === 'playing';
    activePlayerId = player.player_id;

    // Use current data, fall back to last known, or show idle
    const source = hasMedia
      ? (lastKnownMedia = { media, player, queue })
      : lastKnownMedia;
    if (!source) return showIdle();

    const track = extractTrackData(source.media, player, source.queue);
    currentPos = computeElapsed(player);
    currentDuration = track.duration;
    renderTrack(track, state, player, source.queue);
  };

  const pickActivePlayer = (players) =>
    players.find(p => p.available && p.playback_state === 'playing') ??
    players.find(p => p.available && p.playback_state === 'paused') ??
    null;

  // ── WebSocket ───────────────────────────────────────────────────
  let ws = null;
  let authenticated = false;
  let authMsgId = null;
  let msgCounter = 0;
  let reconnectTimer = null;
  const pending = {};

  const send = (command, args) => {
    const id = `msg-${++msgCounter}`;
    ws.send(JSON.stringify({ message_id: id, command, args: args ?? {} }));
    return id;
  };

  const sendWithCallback = (command, args, callback) => {
    const id = `msg-${++msgCounter}`;
    pending[id] = callback;
    ws.send(JSON.stringify({ message_id: id, command, args: args ?? {} }));
  };

  const fetchActivePlaying = () => {
    let allPlayers = null;
    let allQueues = null;

    const resolve = () => {
      if (!allPlayers || !allQueues) return;

      const player = pickActivePlayer(allPlayers);
      if (player) {
        const queue = allQueues.find(q => q.queue_id === player.player_id);
        if (queue?.current_item?.media_item) return updateFromPlayer(player, queue);
      }

      const queueWithTrack = allQueues.find(q => q.current_item?.media_item);
      if (queueWithTrack) {
        const matchPlayer = allPlayers.find(p => p.player_id === queueWithTrack.queue_id) ?? {
          player_id: queueWithTrack.queue_id, name: queueWithTrack.display_name,
          playback_state: 'idle', current_media: null,
          elapsed_time: queueWithTrack.elapsed_time, elapsed_time_last_updated: 0,
        };
        return updateFromPlayer(matchPlayer, queueWithTrack);
      }

      if (player) return updateFromPlayer(player, null);
      showIdle();
    };

    sendWithCallback('players/all', {}, players => { allPlayers = players; resolve(); });
    sendWithCallback('player_queues/all', {}, queues => { allQueues = queues; resolve(); });
  };

  const onPlayerUpdated = (player) => {
    if (!player?.available) return;
    if (player.player_id === activePlayerId || player.playback_state === 'playing') return fetchActivePlaying();
    if (activePlayerId && player.player_id !== activePlayerId) return;
    fetchActivePlaying();
  };

  const onMessage = (evt) => {
    const msg = JSON.parse(evt.data);

    // Server info → authenticate
    if (!msg.message_id && msg.server_version) {
      el.wsStatus.textContent = 'WS:AUTH';
      authMsgId = send('auth', { token: MA_TOKEN });
      return;
    }

    // Response to a command we sent
    if (msg.message_id) {
      if (msg.message_id === authMsgId) {
        if (msg.result?.authenticated) {
          authenticated = true;
          el.wsStatus.textContent = 'WS:LIVE';
          fetchActivePlaying();
          startProgressTick();
          startPolling();
        } else {
          el.wsStatus.textContent = 'WS:AUTH_FAIL';
        }
        return;
      }
      if (pending[msg.message_id]) {
        pending[msg.message_id](msg.result);
        delete pending[msg.message_id];
        return;
      }
    }

    // Push events
    if (msg.event === 'player_updated')     onPlayerUpdated(msg.data);
    if (msg.event === 'queue_updated')       msg.data && fetchActivePlaying();
    if (msg.event === 'queue_time_updated' && msg.data?.elapsed_time != null) {
      currentPos = msg.data.elapsed_time;
      updateProgress();
    }
  };

  const connect = () => {
    if (ws) ws.close();
    authenticated = false;
    authMsgId = null;
    ws = new WebSocket(`ws://${MA_BASE}/ws`);

    ws.onopen = () => {
      el.wsStatus.textContent = 'WS:CONNECTING';
      el.connError.classList.remove('visible');
    };
    ws.onmessage = onMessage;
    ws.onclose = (e) => {
      el.wsStatus.textContent = `WS:DOWN (${e.code})`;
      el.connError.classList.add('visible');
      clearInterval(progressInterval);
      clearInterval(pollTimer);
      reconnectTimer = setTimeout(connect, 5000);
    };
    ws.onerror = () => {
      el.wsStatus.textContent = `WS:ERR ${MA_BASE}`;
      ws.close();
    };
  };

  // ── Polling fallback ────────────────────────────────────────────
  let pollTimer = null;
  const startPolling = () => {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (authenticated && ws?.readyState === WebSocket.OPEN) fetchActivePlaying();
    }, 5000);
  };

  // ── Media controls (remote/keyboard) ─────────────────────────────
  const playerCmd = (command) => {
    // Debug: show what's happening
    if (el.debugInfo) {
      const reason = !activePlayerId ? 'NO PLAYER' :
        !authenticated ? 'NOT AUTHED' :
        ws?.readyState !== WebSocket.OPEN ? 'WS CLOSED' : 'SENDING';
      el.debugInfo.textContent = `CMD: ${command} → ${reason} (pid: ${activePlayerId || 'none'})`;
      el.debugInfo.style.display = 'block';
      el.debugInfo.style.opacity = '0.8';
    }
    if (!activePlayerId || !authenticated || ws?.readyState !== WebSocket.OPEN) return;
    send(command, { player_id: activePlayerId });
  };

  const mediaKeyMap = {
    'MediaPlayPause':     'players/cmd/play_pause',
    ' ':                  'players/cmd/play_pause',
    'MediaTrackNext':     'players/cmd/next',
    'MediaTrackPrevious': 'players/cmd/previous',
    // keyCode fallbacks for Fire TV remote
    179: 'players/cmd/play_pause',   // MediaPlayPause
    176: 'players/cmd/next',         // MediaTrackNext
    177: 'players/cmd/previous',     // MediaTrackPrevious
    85:  'players/cmd/play_pause',   // Play/Pause alt
    87:  'players/cmd/next',         // Next alt
    88:  'players/cmd/previous',     // Previous alt
  };

  document.addEventListener('keydown', (e) => {
    // Debug: show key info temporarily (remove once keys are mapped)
    if (el.debugInfo) {
      el.debugInfo.textContent = `KEY: ${e.key} code: ${e.keyCode} which: ${e.which}`;
      el.debugInfo.style.display = 'block';
      el.debugInfo.style.opacity = '0.8';
    }

    const cmd = mediaKeyMap[e.key] ?? mediaKeyMap[e.keyCode];
    if (cmd) { e.preventDefault(); playerCmd(cmd); }
  });

  // On-screen controls (d-pad navigable)
  const bindControl = (element, command) => {
    if (!element) return;
    element.addEventListener('click', () => {
      if (el.debugInfo) { el.debugInfo.textContent = `CLICK: ${command}`; el.debugInfo.style.display = 'block'; el.debugInfo.style.opacity = '0.8'; }
      playerCmd(command);
    });
    element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (el.debugInfo) { el.debugInfo.textContent = `KEYDOWN: ${e.key} → ${command}`; el.debugInfo.style.display = 'block'; el.debugInfo.style.opacity = '0.8'; }
        playerCmd(command);
      }
    });
  };
  bindControl(el.stateIndicator, 'players/cmd/play_pause');
  bindControl(el.btnPrev, 'players/cmd/previous');
  bindControl(el.btnNext, 'players/cmd/next');

  // ── Auto-reload on deploy ───────────────────────────────────────
  let deployedVersion = null;
  const checkVersion = () => {
    fetch(`package.json?_=${Date.now()}`).then(r => r.json()).then(pkg => {
      if (deployedVersion === null) deployedVersion = pkg.version;
      else if (pkg.version !== deployedVersion) window.location.reload();
    }).catch(() => {});
  };
  checkVersion();
  setInterval(checkVersion, 30000);

  // ── Boot ────────────────────────────────────────────────────────
  connect();
})();
