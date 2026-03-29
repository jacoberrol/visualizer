// Teenage Engineering model: clean status display

(function() {
  var el = document.getElementById('data-stream');
  if (el) el.textContent = '';

  // Show clean status updates
  NP.hooks.onTrackChange.push(function(state) {
    if (el) {
      el.textContent = state.isPlaying ? 'NOW PLAYING' : state.playbackState.toUpperCase();
    }
  });
})();
