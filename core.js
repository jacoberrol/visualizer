// Core logic for the Now Playing visualizer.
// Handles WebSocket connection to Music Assistant, state management,
// progress tracking, and DOM updates. Model-agnostic.

if (typeof MA_TOKEN === 'undefined') {
  document.body.innerHTML = '<pre style="color:#ff2244;padding:40px;">ERROR: config.js not found or missing MA_TOKEN.\nCopy config.example.js to config.js and fill in your values.</pre>';
  throw new Error('config.js not loaded');
}

// Public namespace for model JS to hook into
var NP = window.NP = {
  hooks: {
    onTrackChange: [],
    onStateChange: [],
    onProgress: [],
  },
  state: {
    isPlaying: false,
    title: '',
    artist: '',
    album: '',
    artUrl: '',
    position: 0,
    duration: 0,
    source: '',
    playerName: '',
    shuffleEnabled: false,
    repeatEnabled: false,
    playbackState: 'idle',
  }
};

function runHooks(name, data) {
  var hooks = NP.hooks[name] || [];
  for (var i = 0; i < hooks.length; i++) {
    try { hooks[i](data); } catch(e) { console.error('Hook error:', e); }
  }
}

var MA_BASE = typeof MA_HOST !== 'undefined' ? MA_HOST : HA_HOST.replace(':8123', ':8095');
var debugEl = document.getElementById('debug-info');
if (debugEl) debugEl.textContent = 'TARGET: ws://' + MA_BASE + '/ws';

var ws = null;
var reconnectTimer = null;
var progressInterval = null;
var currentPos = 0;
var currentDuration = 0;
var posLastUpdated = 0;
var isPlaying = false;
var activePlayerId = null;
var msgCounter = 0;

// Build visualizer bars
var viz = document.getElementById('visualizer');
var BAR_COUNT = 32;
for (var i = 0; i < BAR_COUNT; i++) {
  var b = document.createElement('div');
  b.className = 'bar';
  var maxH = Math.floor(Math.random() * 34) + 6;
  b.style.setProperty('--max-h', maxH + 'px');
  b.style.animationDuration = (Math.random() * 0.5 + 0.2) + 's';
  b.style.animationDelay = (Math.random() * 0.3) + 's';
  viz.appendChild(b);
}

function setVisualizerPlaying(playing) {
  viz.querySelectorAll('.bar').forEach(function(b) {
    b.style.animationPlayState = playing ? 'running' : 'paused';
  });
}

// Clock
function updateClock() {
  var now = new Date();
  document.getElementById('clock').textContent = now.toTimeString().slice(0, 8);
}
setInterval(updateClock, 1000);
updateClock();

// Format seconds
function fmt(s) {
  s = Math.floor(s || 0);
  var m = Math.floor(s / 60);
  var sec = s % 60;
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

// Pick the best player: first playing, else first paused, else null
function pickActivePlayer(players) {
  var playing = players.find(function(p) { return p.available && p.playback_state === 'playing'; });
  if (playing) return playing;
  var paused = players.find(function(p) { return p.available && p.playback_state === 'paused'; });
  if (paused) return paused;
  return null;
}

// Track last known good display data so we can show "last played" when idle
var lastKnownMedia = null;

function updateFromPlayer(player, queue) {
  var media = player.current_media;
  var state = player.playback_state || 'idle';
  var hasQueueTrack = !!(queue && queue.current_item && queue.current_item.media_item);
  var hasMedia = hasQueueTrack || (media && media.title);

  isPlaying = state === 'playing';
  activePlayerId = player.player_id;

  if (hasMedia) {
    lastKnownMedia = { media: media, player: player, queue: queue };
    renderTrackInfo(state, media, player, queue);
  } else if (lastKnownMedia) {
    renderTrackInfo(state, lastKnownMedia.media, player, lastKnownMedia.queue);
  } else {
    document.getElementById('idle-screen').classList.add('visible');
    setVisualizerPlaying(false);
    NP.state.playbackState = 'idle';
    runHooks('onStateChange', NP.state);
  }
}

// Proxy album art through Music Assistant so devices that can't reach
// the media server directly (e.g. Fire TV without Tailscale) still load art.
function proxyArtUrl(url) {
  if (!url) return '';
  return 'http://' + MA_BASE + '/imageproxy?path=' + encodeURIComponent(url) + '&size=500';
}

function renderTrackInfo(state, media, player, queue) {
  // When the player is active but the queue is idle/stale (e.g. Spotify Connect
  // bypasses MA's queue), trust the player's current_media over queue data.
  var queueIsActive = queue && queue.state === 'playing';
  var queueItem = queueIsActive ? queue.current_item : null;
  var trackInfo = queueItem && queueItem.media_item ? queueItem.media_item : null;

  var title = (trackInfo && trackInfo.name) || (queueItem && queueItem.name) || (media && media.title) || '—';
  var artists = trackInfo && trackInfo.artists;
  var artist = (artists && artists.length) ? artists.map(function(a) { return a.name; }).join(', ') : ((media && media.artist) || '—');
  var album = (trackInfo && trackInfo.album && trackInfo.album.name) || (media && media.album) || '—';
  var rawArtUrl = (queueItem && queueItem.image && queueItem.image.path) || (media && media.image_url) || '';
  var artUrl = proxyArtUrl(rawArtUrl);
  var duration = (queueItem && queueItem.duration) || (media && media.duration) || 0;
  var source = (media && media.source_id) || (media && media.uri) || '—';

  isPlaying = state === 'playing';

  // Compute elapsed time
  var elapsed = player.elapsed_time || 0;
  var lastUpdated = player.elapsed_time_last_updated || 0;
  if (isPlaying && lastUpdated > 0) {
    var now = Date.now() / 1000;
    currentPos = elapsed + (now - lastUpdated);
  } else {
    currentPos = elapsed;
  }
  currentDuration = duration;
  posLastUpdated = lastUpdated;

  // Update DOM
  document.getElementById('track-title').textContent = title;
  document.getElementById('track-artist').textContent = artist;
  document.getElementById('track-album').textContent = album;
  document.getElementById('state-text').textContent = state.toUpperCase();
  document.getElementById('entity-id').textContent = 'PLAYER: ' + player.name.toUpperCase();
  var sourceText = source.length > 60 ? source.slice(0, 60) + '…' : source;
  document.getElementById('media-source').textContent = sourceText;

  // Album art
  if (artUrl) {
    document.getElementById('album-art').src = artUrl;
    document.getElementById('art-bg').style.backgroundImage = "url('" + artUrl + "')";
  }

  updateProgress();

  // Shuffle / repeat
  var shuffleOn = !!(queue && queue.shuffle_enabled);
  var repeatOn = !!(queue && queue.repeat_mode && queue.repeat_mode !== 'off');
  document.getElementById('pill-shuffle').classList.toggle('active', shuffleOn);
  document.getElementById('pill-repeat').classList.toggle('active', repeatOn);

  // Visualizer
  setVisualizerPlaying(isPlaying);

  // Hide idle screen
  document.getElementById('idle-screen').classList.remove('visible');

  // State dot color
  var dot = document.getElementById('state-dot');
  dot.style.background = isPlaying ? 'var(--accent)' : 'var(--warning)';
  dot.style.boxShadow = isPlaying ? '0 0 8px var(--accent)' : '0 0 8px var(--warning)';

  // Update public state and fire hooks
  NP.state.isPlaying = isPlaying;
  NP.state.title = title;
  NP.state.artist = artist;
  NP.state.album = album;
  NP.state.artUrl = artUrl;
  NP.state.position = currentPos;
  NP.state.duration = currentDuration;
  NP.state.source = source;
  NP.state.playerName = player.name;
  NP.state.shuffleEnabled = shuffleOn;
  NP.state.repeatEnabled = repeatOn;
  NP.state.playbackState = state;
  runHooks('onTrackChange', NP.state);
}

var lastProgressPct = 0;
function updateProgress() {
  if (currentDuration <= 0) return;
  var pct = Math.min((currentPos / currentDuration) * 100, 100);
  var bar = document.getElementById('progress-bar');
  // Skip transition when progress jumps backwards (track change)
  if (pct < lastProgressPct - 5) {
    bar.style.transition = 'none';
    bar.style.width = pct + '%';
    bar.offsetWidth; // force reflow
    bar.style.transition = '';
  } else {
    bar.style.width = pct + '%';
  }
  lastProgressPct = pct;
  document.getElementById('pos-current').textContent = fmt(currentPos);
  document.getElementById('pos-duration').textContent = fmt(currentDuration);
  NP.state.position = currentPos;
  runHooks('onProgress', NP.state);
}

function startProgressTick() {
  clearInterval(progressInterval);
  progressInterval = setInterval(function() {
    if (isPlaying) {
      currentPos += 1;
      updateProgress();
    }
  }, 1000);
}

function sendCmd(command, args) {
  var id = 'msg-' + (++msgCounter);
  ws.send(JSON.stringify({ message_id: id, command: command, args: args || {} }));
  return id;
}

// Store pending response callbacks
var pending = {};
function sendCmdWithCallback(command, args, callback) {
  var id = 'msg-' + (++msgCounter);
  pending[id] = callback;
  ws.send(JSON.stringify({ message_id: id, command: command, args: args || {} }));
}

// WebSocket connection to Music Assistant
var authenticated = false;
var authMsgId = null;

function connect() {
  if (ws) ws.close();
  authenticated = false;
  authMsgId = null;
  ws = new WebSocket('ws://' + MA_BASE + '/ws');

  ws.onopen = function() {
    document.getElementById('ws-status').textContent = 'WS:CONNECTING';
    document.getElementById('conn-error').classList.remove('visible');
  };

  ws.onmessage = function(evt) {
    var msg = JSON.parse(evt.data);

    if (!msg.message_id && msg.server_version) {
      document.getElementById('ws-status').textContent = 'WS:AUTH';
      authMsgId = sendCmd('auth', { token: MA_TOKEN });
      return;
    }

    if (msg.message_id) {
      if (msg.message_id === authMsgId) {
        if (msg.result && msg.result.authenticated) {
          authenticated = true;
          document.getElementById('ws-status').textContent = 'WS:LIVE';
          fetchActivePlaying();
          startProgressTick();
          startPolling();
        } else {
          document.getElementById('ws-status').textContent = 'WS:AUTH_FAIL';
        }
        return;
      }
      if (pending[msg.message_id]) {
        pending[msg.message_id](msg.result);
        delete pending[msg.message_id];
        return;
      }
    }

    if (msg.event === 'player_updated') handlePlayerUpdate(msg.data);
    if (msg.event === 'queue_updated') handleQueueUpdate(msg.data);
    if (msg.event === 'queue_time_updated') handleTimeUpdate(msg.data);
  };

  ws.onclose = function(e) {
    document.getElementById('ws-status').textContent = 'WS:DOWN (' + e.code + ')';
    document.getElementById('conn-error').classList.add('visible');
    clearInterval(progressInterval);
    clearInterval(pollTimer);
    reconnectTimer = setTimeout(connect, 5000);
  };

  ws.onerror = function() {
    document.getElementById('ws-status').textContent = 'WS:ERR ' + MA_BASE;
    ws.close();
  };
}

var pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(function() {
    if (authenticated && ws && ws.readyState === WebSocket.OPEN) {
      fetchActivePlaying();
    }
  }, 5000);
}

function fetchActivePlaying() {
  var allPlayers = null;
  var allQueues = null;

  function resolve() {
    if (!allPlayers || !allQueues) return;

    var player = pickActivePlayer(allPlayers);

    if (player) {
      var queue = allQueues.find(function(q) { return q.queue_id === player.player_id; });
      if (queue && queue.current_item && queue.current_item.media_item) {
        updateFromPlayer(player, queue);
        return;
      }
    }

    var queueWithTrack = allQueues.find(function(q) { return q.current_item && q.current_item.media_item; });
    if (queueWithTrack) {
      var matchPlayer = allPlayers.find(function(p) { return p.player_id === queueWithTrack.queue_id; }) ||
        { player_id: queueWithTrack.queue_id, name: queueWithTrack.display_name, playback_state: 'idle', current_media: null, elapsed_time: queueWithTrack.elapsed_time, elapsed_time_last_updated: 0 };
      updateFromPlayer(matchPlayer, queueWithTrack);
      return;
    }

    if (player) {
      updateFromPlayer(player, null);
      return;
    }

    document.getElementById('idle-screen').classList.add('visible');
    setVisualizerPlaying(false);
  }

  sendCmdWithCallback('players/all', {}, function(players) { allPlayers = players; resolve(); });
  sendCmdWithCallback('player_queues/all', {}, function(queues) { allQueues = queues; resolve(); });
}

function handlePlayerUpdate(player) {
  if (!player || !player.available) return;
  if (player.player_id === activePlayerId || player.playback_state === 'playing') {
    fetchActivePlaying();
    return;
  }
  if (activePlayerId && player.player_id !== activePlayerId) return;
  fetchActivePlaying();
}

function handleQueueUpdate(queue) {
  if (!queue) return;
  fetchActivePlaying();
}

function handleTimeUpdate(data) {
  if (!data || !activePlayerId) return;
  if (typeof data.elapsed_time === 'number') {
    currentPos = data.elapsed_time;
    updateProgress();
  }
}

connect();

// Auto-reload when a new version is deployed.
// Polls package.json every 30s and reloads if the version changes.
(function() {
  var currentVersion = null;

  function checkVersion() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'package.json?_=' + Date.now(), true);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var v = JSON.parse(xhr.responseText).version;
          if (currentVersion === null) {
            currentVersion = v;
          } else if (v !== currentVersion) {
            window.location.reload();
          }
        } catch(e) {}
      }
    };
    xhr.send();
  }

  checkVersion();
  setInterval(checkVersion, 30000);
})();
