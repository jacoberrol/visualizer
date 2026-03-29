// CRT model: data-stream ticker and color sub-themes (amber, blue, red, white)

(function() {
  // Data stream ticker
  var streamMsgs = [
    'MUSIC ASSISTANT CONNECTED',
    'AUDIO BUFFER: NOMINAL',
    'METADATA SYNC: OK',
    'STREAM INTEGRITY: 100%',
    'LATENCY: <12MS',
  ];
  var streamIdx = 0;
  setInterval(function() {
    var el = document.getElementById('data-stream');
    if (el) el.textContent = streamMsgs[streamIdx % streamMsgs.length];
    streamIdx++;
  }, 3000);

  // Color sub-themes via ?color= param
  var palettes = {
    green: {},
    amber: {
      '--accent': '#ffb000',
      '--accent-dim': '#ffb00044',
      '--secondary': '#ffe0a0',
      '--warning': '#ff6600',
      '--bg': '#0a0600',
      '--text-primary': '#fff5e0',
      '--panel': 'rgba(255, 176, 0, 0.04)',
      '--border': 'rgba(255, 176, 0, 0.15)',
      '--glow-color': 'rgba(255, 176, 0, 0.3)',
      '--pill-bg': 'rgba(255, 176, 0, 0.08)',
      '--pill-glow': 'rgba(255, 176, 0, 0.15)',
      '--progress-bg': 'rgba(255, 176, 0, 0.1)',
    },
    blue: {
      '--accent': '#4488ff',
      '--accent-dim': '#4488ff44',
      '--secondary': '#88bbff',
      '--warning': '#ffaa00',
      '--error': '#ff4466',
      '--bg': '#020408',
      '--text-primary': '#e8f0ff',
      '--panel': 'rgba(68, 136, 255, 0.04)',
      '--border': 'rgba(68, 136, 255, 0.15)',
      '--glow-color': 'rgba(68, 136, 255, 0.3)',
      '--pill-bg': 'rgba(68, 136, 255, 0.08)',
      '--pill-glow': 'rgba(68, 136, 255, 0.15)',
      '--progress-bg': 'rgba(68, 136, 255, 0.1)',
    },
    red: {
      '--accent': '#ff2255',
      '--accent-dim': '#ff225544',
      '--secondary': '#ff8899',
      '--warning': '#ffaa00',
      '--error': '#ff0033',
      '--bg': '#0a0204',
      '--text-primary': '#ffe8ee',
      '--panel': 'rgba(255, 34, 85, 0.04)',
      '--border': 'rgba(255, 34, 85, 0.15)',
      '--glow-color': 'rgba(255, 34, 85, 0.3)',
      '--pill-bg': 'rgba(255, 34, 85, 0.08)',
      '--pill-glow': 'rgba(255, 34, 85, 0.15)',
      '--progress-bg': 'rgba(255, 34, 85, 0.1)',
    },
    white: {
      '--accent': '#333333',
      '--accent-dim': '#33333344',
      '--secondary': '#666666',
      '--warning': '#cc8800',
      '--error': '#cc2244',
      '--bg': '#f5f5f5',
      '--text-primary': '#111111',
      '--panel': 'rgba(0, 0, 0, 0.03)',
      '--border': 'rgba(0, 0, 0, 0.12)',
      '--overlay': 'rgba(255, 255, 255, 0.7)',
      '--scanline': 'transparent',
      '--vignette': 'transparent',
      '--glow-color': 'rgba(0, 0, 0, 0.05)',
      '--pill-bg': 'rgba(0, 0, 0, 0.05)',
      '--pill-glow': 'rgba(0, 0, 0, 0.08)',
      '--progress-bg': 'rgba(0, 0, 0, 0.08)',
      '--art-filter': 'none',
      '--bg-blur': 'blur(60px) brightness(0.85) saturate(1.2)',
    },
  };

  var params = new URLSearchParams(window.location.search);
  var color = params.get('color') || 'green';
  var palette = palettes[color];
  if (palette) {
    var root = document.documentElement;
    Object.keys(palette).forEach(function(prop) {
      root.style.setProperty(prop, palette[prop]);
    });
  }
})();
