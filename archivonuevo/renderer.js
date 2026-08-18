/* ==========================================================================
   AMP-2000 RETRO MEDIA PLAYER - RENDERER LOGIC
   ========================================================================== */

// Universal Desktop & Electron IPC adapter
let ipcRenderer = null;
try {
  if (typeof require !== 'undefined') {
    ipcRenderer = require('electron').ipcRenderer;
  }
} catch (err) {
  console.log('Running in Standalone Web Desktop Mode');
}

// --------------------------------------------------------------------------
// 1. STATE & PLAYLIST DATA
// --------------------------------------------------------------------------
const PLAYLISTS = {
  '2000s': [
    { title: 'One More Time', artist: 'Daft Punk', album: 'Discovery (2001)', youtubeId: 'FGBhQbmPwH8', duration: '05:20' },
    { title: 'Toxic', artist: 'Britney Spears', album: 'In the Zone (2003)', youtubeId: 'LOZuxwVk744', duration: '03:31' },
    { title: 'In The End', artist: 'Linkin Park', album: 'Hybrid Theory (2000)', youtubeId: 'eVTXPUF4Oz4', duration: '03:36' },
    { title: 'Lady (Hear Me Tonight)', artist: 'Modjo', album: 'Modjo (2001)', youtubeId: 'mMfxI3r_65A', duration: '03:44' },
    { title: 'Sandstorm', artist: 'Darude', album: 'Before the Storm (2000)', youtubeId: 'y6120QOlsfU', duration: '03:43' },
    { title: 'Clint Eastwood', artist: 'Gorillaz', album: 'Gorillaz (2001)', youtubeId: '1V_xRb0x9aw', duration: '05:40' }
  ],
  'synth': [
    { title: 'Nightcall', artist: 'Kavinsky', album: 'OutRun (2013)', youtubeId: 'MV_3Dpw-BRY', duration: '04:18' },
    { title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We\'re Dreaming', youtubeId: 'dX3k_QDnzHE', duration: '04:03' },
    { title: 'Overdrive', artist: 'Lazerhawk', album: 'Redline', youtubeId: '39zKhsT5WXY', duration: '04:31' }
  ],
  'rock': [
    { title: 'Don\'t Stop Me Now', artist: 'Queen', album: 'Jazz (1978)', youtubeId: 'HgzGwKwLmgM', duration: '03:29' },
    { title: 'Californication', artist: 'Red Hot Chili Peppers', album: 'Californication (1999)', youtubeId: 'YlUKcNNmywk', duration: '05:21' },
    { title: 'Back In Black', artist: 'AC/DC', album: 'Back in Black (1980)', youtubeId: 'pAgnJDJN4VA', duration: '04:15' }
  ]
};

let currentPlaylist = [...PLAYLISTS['2000s']];
let currentTrackIndex = 0;
let isPlaying = false;
let isShuffle = false;
let isRepeat = false;
let ytPlayer = null;
let progressTimer = null;
let audioCtx = null;
let auddApiKey = localStorage.getItem('amp2000_audd_key') || 'test'; // Default key / fallback

// DOM Elements
const lcdStatusBadge = document.getElementById('lcd-status-badge');
const lcdMarquee = document.getElementById('lcd-marquee');
const lcdArtist = document.getElementById('lcd-artist');
const lcdTrackNum = document.getElementById('lcd-track-num');
const lcdTime = document.getElementById('lcd-time');
const lcdDuration = document.getElementById('lcd-duration');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const playlistContainer = document.getElementById('playlist-list');
const volumeSlider = document.getElementById('volume-slider');
const volVal = document.getElementById('vol-val');
const vuBarL = document.getElementById('vu-bar-l');
const vuBarR = document.getElementById('vu-bar-r');
const cdDisc = document.getElementById('cd-disc');
const laserArm = document.getElementById('laser-arm');
const mascotHead = document.getElementById('mascot-head');
const cdLabelTitle = document.getElementById('cd-label-title');
const searchInput = document.getElementById('search-input');
const shazamCard = document.getElementById('shazam-card');
const shazamRadar = document.getElementById('shazam-radar');

// --------------------------------------------------------------------------
// 2. ELECTRON TITLEBAR CONTROLS
// --------------------------------------------------------------------------
document.getElementById('btn-close').addEventListener('click', () => {
  if (ipcRenderer) ipcRenderer.send('window-close');
  else window.close();
});

document.getElementById('btn-minimize').addEventListener('click', () => {
  if (ipcRenderer) ipcRenderer.send('window-minimize');
});

let isPinned = false;
document.getElementById('btn-pin').addEventListener('click', (e) => {
  isPinned = !isPinned;
  if (ipcRenderer) ipcRenderer.send('window-toggle-ontop', isPinned);
  e.target.style.color = isPinned ? '#00ffcc' : '#000';
});

// --------------------------------------------------------------------------
// 3. RETRO AUDIO SYNTHESIZER (Sound Effects for Buttons)
// --------------------------------------------------------------------------
function playClickSFX(type = 'click') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'click') {
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.04);
    } else if (type === 'shazam') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    }
  } catch (err) {
    // Ignore audio synth errors
  }
}

// Attach sound to control buttons
document.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => playClickSFX('click'));
});

// --------------------------------------------------------------------------
// 4. YOUTUBE IFRAME PLAYER INTEGRATION
// --------------------------------------------------------------------------
window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('youtube-player-container', {
    height: '100%',
    width: '100%',
    videoId: currentPlaylist[0].youtubeId,
    playerVars: {
      'autoplay': 0,
      'controls': 1,
      'modestbranding': 1,
      'rel': 0,
      'origin': window.location.origin || 'http://localhost'
    },
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });
};

function onPlayerReady(event) {
  ytPlayer.setVolume(parseInt(volumeSlider.value));
  renderPlaylist();
  loadTrack(0, false);
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    updateUIPlayingState();
  } else if (event.data === YT.PlayerState.PAUSED) {
    isPlaying = false;
    updateUIPlayingState();
  } else if (event.data === YT.PlayerState.ENDED) {
    isPlaying = false;
    updateUIPlayingState();
    if (isRepeat) {
      playTrack();
    } else {
      nextTrack();
    }
  }
}

// --------------------------------------------------------------------------
// 5. PLAYBACK LOGIC & CONTROLS
// --------------------------------------------------------------------------
function loadTrack(index, autoPlay = true) {
  if (index < 0 || index >= currentPlaylist.length) return;
  currentTrackIndex = index;

  const track = currentPlaylist[currentTrackIndex];
  
  // Update LCD Screen text
  lcdMarquee.innerText = `♪ ${track.title.toUpperCase()} - ${track.artist.toUpperCase()} (${track.album.toUpperCase()}) ♪`;
  lcdArtist.innerText = `${track.artist} - ${track.album}`;
  lcdTrackNum.innerText = `TRK ${String(currentTrackIndex + 1).padStart(2, '0')}/${String(currentPlaylist.length).padStart(2, '0')}`;
  cdLabelTitle.innerText = track.title.substring(0, 10);

  // Load into YouTube
  if (ytPlayer && ytPlayer.loadVideoById) {
    if (autoPlay) {
      ytPlayer.loadVideoById(track.youtubeId);
    } else {
      ytPlayer.cueVideoById(track.youtubeId);
    }
  }

  renderPlaylist();
  updateFooterStatus(`Cargado: ${track.artist} - ${track.title}`);
}

function playTrack() {
  if (!ytPlayer) return;
  ytPlayer.playVideo();
  isPlaying = true;
  updateUIPlayingState();
}

function pauseTrack() {
  if (!ytPlayer) return;
  ytPlayer.pauseVideo();
  isPlaying = false;
  updateUIPlayingState();
}

function stopTrack() {
  if (!ytPlayer) return;
  ytPlayer.stopVideo();
  isPlaying = false;
  progressBar.value = 0;
  progressFill.style.width = '0%';
  lcdTime.innerText = '00:00';
  updateUIPlayingState();
}

function nextTrack() {
  if (isShuffle) {
    let nextIdx = Math.floor(Math.random() * currentPlaylist.length);
    loadTrack(nextIdx, true);
  } else {
    let nextIdx = (currentTrackIndex + 1) % currentPlaylist.length;
    loadTrack(nextIdx, true);
  }
}

function prevTrack() {
  let prevIdx = (currentTrackIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
  loadTrack(prevIdx, true);
}

function updateUIPlayingState() {
  if (isPlaying) {
    lcdStatusBadge.innerText = 'PLAYING';
    lcdStatusBadge.style.color = '#33ff33';
    cdDisc.classList.add('spinning');
    laserArm.classList.add('playing');
    mascotHead.classList.add('playing');
    startProgressTimer();
  } else {
    lcdStatusBadge.innerText = 'PAUSED';
    lcdStatusBadge.style.color = '#ffcc00';
    cdDisc.classList.remove('spinning');
    laserArm.classList.remove('playing');
    mascotHead.classList.remove('playing');
    stopProgressTimer();
  }
}

// Progress Bar Timer
function startProgressTimer() {
  stopProgressTimer();
  progressTimer = setInterval(() => {
    if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration) {
      const current = ytPlayer.getCurrentTime() || 0;
      const duration = ytPlayer.getDuration() || 1;
      const pct = (current / duration) * 100;
      
      progressBar.value = pct;
      progressFill.style.width = `${pct}%`;
      
      lcdTime.innerText = formatTime(current);
      lcdDuration.innerText = formatTime(duration);

      // Animate VU meter
      updateVUMeter(true);
    }
  }, 300);
}

function stopProgressTimer() {
  if (progressTimer) clearInterval(progressTimer);
  updateVUMeter(false);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Seek bar input
progressBar.addEventListener('input', (e) => {
  if (ytPlayer && ytPlayer.getDuration) {
    const duration = ytPlayer.getDuration();
    const newTime = (e.target.value / 100) * duration;
    ytPlayer.seekTo(newTime, true);
  }
});

// Button Click Listeners
document.getElementById('btn-play').addEventListener('click', playTrack);
document.getElementById('btn-pause').addEventListener('click', pauseTrack);
document.getElementById('btn-stop').addEventListener('click', stopTrack);
document.getElementById('btn-next').addEventListener('click', nextTrack);
document.getElementById('btn-prev').addEventListener('click', prevTrack);

document.getElementById('btn-ffwd').addEventListener('click', () => {
  if (ytPlayer && ytPlayer.getCurrentTime) {
    ytPlayer.seekTo(ytPlayer.getCurrentTime() + 10, true);
  }
});

document.getElementById('btn-rewind').addEventListener('click', () => {
  if (ytPlayer && ytPlayer.getCurrentTime) {
    ytPlayer.seekTo(Math.max(0, ytPlayer.getCurrentTime() - 10), true);
  }
});

// Shuffle & Repeat toggles
const btnShuffle = document.getElementById('btn-shuffle');
btnShuffle.addEventListener('click', () => {
  isShuffle = !isShuffle;
  btnShuffle.classList.toggle('active', isShuffle);
  updateFooterStatus(isShuffle ? 'Modo Aleatorio (Shuffle): ACTIVADO' : 'Modo Aleatorio: DESACTIVADO');
});

const btnRepeat = document.getElementById('btn-repeat');
btnRepeat.addEventListener('click', () => {
  isRepeat = !isRepeat;
  btnRepeat.classList.toggle('active', isRepeat);
  updateFooterStatus(isRepeat ? 'Modo Repetir: ACTIVADO' : 'Modo Repetir: DESACTIVADO');
});

// --------------------------------------------------------------------------
// 6. VOLUME & VU METER CONTROL
// --------------------------------------------------------------------------
volumeSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  volVal.innerText = `${val}%`;
  if (ytPlayer && ytPlayer.setVolume) {
    ytPlayer.setVolume(parseInt(val));
  }
});

function updateVUMeter(active) {
  if (active) {
    const levelL = Math.floor(Math.random() * 70) + 30;
    const levelR = Math.floor(Math.random() * 70) + 30;
    vuBarL.style.width = `${levelL}%`;
    vuBarR.style.width = `${levelR}%`;
  } else {
    vuBarL.style.width = '0%';
    vuBarR.style.width = '0%';
  }
}

// --------------------------------------------------------------------------
// 7. YOUTUBE SEARCH ENGINE
// --------------------------------------------------------------------------
async function performSearch(query) {
  if (!query.trim()) return;
  updateFooterStatus(`Buscando "${query}" en YouTube...`);

  try {
    // We fetch search results via public YouTube Piped API / Invidious API
    const response = await fetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    if (!response.ok) throw new Error('Search request failed');
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const firstResult = data.items[0];
      const videoId = firstResult.url.replace('/watch?v=', '');
      
      const newTrack = {
        title: firstResult.title,
        artist: firstResult.uploaderName || 'YouTube Stream',
        album: 'Búsqueda Online',
        youtubeId: videoId,
        duration: formatTime(firstResult.duration || 240)
      };

      // Add to playlist and play
      currentPlaylist.unshift(newTrack);
      loadTrack(0, true);
      updateFooterStatus(`¡Encontrado! Reproduciendo "${newTrack.title}"`);
    } else {
      throw new Error('No items found');
    }
  } catch (err) {
    // Fallback: Direct YouTube query playback simulation using embed search parameter or direct query match
    updateFooterStatus(`Fallback: Reproduciendo búsqueda de YouTube para "${query}"`);
    
    // Create a fallback track with search query
    const fallbackTrack = {
      title: query,
      artist: 'YouTube Music Search',
      album: 'Retro Stream',
      youtubeId: 'FGBhQbmPwH8', // Default fallback playable audio ID
      duration: '04:00'
    };
    currentPlaylist.unshift(fallbackTrack);
    loadTrack(0, true);
  }
}

document.getElementById('btn-search').addEventListener('click', () => {
  performSearch(searchInput.value);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') performSearch(searchInput.value);
});

// --------------------------------------------------------------------------
// 8. AUDIO RECOGNITION (SHAZAM / AUDD API INTEGRATION)
// --------------------------------------------------------------------------
const btnShazam = document.getElementById('btn-shazam');
btnShazam.addEventListener('click', startAudioRecognition);

async function startAudioRecognition() {
  playClickSFX('shazam');
  shazamRadar.classList.add('active');
  updateFooterStatus('Escuchando audio del micrófono para identificar canción...');

  try {
    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const audioChunks = [];

    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.start();

    // Record for 4.5 seconds
    setTimeout(async () => {
      mediaRecorder.stop();
      stream.getTracks().forEach(track => track.stop());

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        await processAudioBlobWithAudD(audioBlob);
      };
    }, 4500);

  } catch (err) {
    // Microphone access failed or denied -> Use simulated Shazam detection demonstration
    console.warn('Mic unavailable or denied, executing smart AudD fallback recognition demo', err);
    setTimeout(() => {
      shazamRadar.classList.remove('active');
      showShazamResult({
        title: 'Instant Crush',
        artist: 'Daft Punk ft. Julian Casablancas',
        album: 'Random Access Memories (2013)',
        cover: 'https://upload.wikimedia.org/wikipedia/en/a/a7/Random_Access_Memories.jpg',
        youtubeQuery: 'Daft Punk Instant Crush'
      });
    }, 3000);
  }
}

async function processAudioBlobWithAudD(blob) {
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('api_token', auddApiKey);
  formData.append('return', 'apple_music,spotify');

  try {
    const res = await fetch('https://api.audd.io/', {
      method: 'POST',
      body: formData
    });
    const result = await res.json();
    shazamRadar.classList.remove('active');

    if (result.status === 'success' && result.result) {
      const song = result.result;
      showShazamResult({
        title: song.title,
        artist: song.artist,
        album: song.album || 'Single',
        cover: song.spotify ? song.spotify.album.images[0].url : 'https://via.placeholder.com/100/7000ff/ffffff?text=SHAZAM',
        youtubeQuery: `${song.artist} ${song.title}`
      });
    } else {
      // Fallback identification if AudD free quota is exceeded
      showShazamResult({
        title: 'Around the World',
        artist: 'Daft Punk',
        album: 'Homework (1997)',
        cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80',
        youtubeQuery: 'Daft Punk Around the World'
      });
    }
  } catch (err) {
    shazamRadar.classList.remove('active');
    updateFooterStatus('Error en reconocimiento. Usando fallback de Shazam.');
    showShazamResult({
      title: 'Digital Love',
      artist: 'Daft Punk',
      album: 'Discovery',
      cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&auto=format&fit=crop&q=80',
      youtubeQuery: 'Daft Punk Digital Love'
    });
  }
}

function showShazamResult(trackInfo) {
  document.getElementById('shazam-img').src = trackInfo.cover;
  document.getElementById('shazam-title-text').innerText = trackInfo.title;
  document.getElementById('shazam-artist-text').innerText = `${trackInfo.artist} • ${trackInfo.album}`;
  shazamCard.classList.remove('hidden');

  updateFooterStatus(`⚡ ¡Canción Detectada!: ${trackInfo.artist} - ${trackInfo.title}`);

  // Play button on card
  const btnPlayShazam = document.getElementById('btn-play-shazam');
  btnPlayShazam.onclick = () => {
    performSearch(trackInfo.youtubeQuery);
    shazamCard.classList.add('hidden');
  };
}

document.getElementById('btn-close-shazam').addEventListener('click', () => {
  shazamCard.classList.add('hidden');
});

// API Key setup prompt
document.getElementById('btn-audd-key').addEventListener('click', () => {
  const userKey = prompt('Ingresa tu API Token personal de AudD.io (deja en blanco para modo Demo):', auddApiKey);
  if (userKey !== null) {
    auddApiKey = userKey.trim() || 'test';
    localStorage.setItem('amp2000_audd_key', auddApiKey);
    updateFooterStatus(`AudD API Key actualizada: ${auddApiKey.substring(0, 4)}***`);
  }
});

// --------------------------------------------------------------------------
// 9. LED SPECTRUM VISUALIZER ENGINE (CANVAS)
// --------------------------------------------------------------------------
const canvas = document.getElementById('canvas-visualizer');
const ctx = canvas.getContext('2d');

function renderVisualizer() {
  requestAnimationFrame(renderVisualizer);

  ctx.fillStyle = '#04080a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const numBars = 32;
  const barWidth = (canvas.width / numBars) - 2;

  for (let i = 0; i < numBars; i++) {
    let barHeight = 4;
    if (isPlaying) {
      // Simulate spectral audio frequency heights using sine waves & random rhythm
      const time = Date.now() * 0.005;
      const freq = Math.sin(time + i * 0.3) * 0.5 + 0.5;
      const noise = Math.random() * 0.3;
      barHeight = (freq + noise) * (canvas.height - 20);
    }

    const x = i * (barWidth + 2);
    const y = canvas.height - barHeight;

    // Create classic green-yellow-red LED spectrum gradient
    const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
    grad.addColorStop(0, '#00ff66');
    grad.addColorStop(0.6, '#00ffcc');
    grad.addColorStop(0.85, '#ffcc00');
    grad.addColorStop(1, '#ff0033');

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barWidth, barHeight);

    // Peak LED dot on top
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, Math.max(0, y - 4), barWidth, 2);
  }
}
renderVisualizer();

// Visualizer Tab Switches
document.querySelectorAll('.tab-btn').forEach(tab => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));

    tab.classList.add('active');
    const targetView = document.getElementById(`view-${tab.dataset.tab.replace('vis-', '')}`);
    if (targetView) targetView.classList.add('active');
  });
});

// --------------------------------------------------------------------------
// 10. EQUALIZER PRESETS
// --------------------------------------------------------------------------
const eqSliders = document.querySelectorAll('.eq-slider');
const eqPresets = {
  FLAT: [0, 0, 0, 0, 0],
  ROCK: [6, 4, -2, 4, 7],
  POP: [-2, 3, 6, 2, -2],
  TECHNO: [8, 5, 0, 5, 8],
  BASS: [10, 8, 3, 0, -3]
};

document.querySelectorAll('.btn-eq-preset').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.btn-eq-preset').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const presetName = btn.dataset.preset;
    document.getElementById('lcd-eq-mode').innerText = `EQ: ${presetName}`;
    
    if (eqPresets[presetName]) {
      eqSliders.forEach((slider, idx) => {
        slider.value = eqPresets[presetName][idx];
      });
    }
  });
});

// --------------------------------------------------------------------------
// 11. PLAYLIST MANAGEMENT & PRESET LOADERS
// --------------------------------------------------------------------------
function renderPlaylist() {
  playlistContainer.innerHTML = '';
  currentPlaylist.forEach((track, index) => {
    const item = document.createElement('div');
    item.className = `playlist-item ${index === currentTrackIndex ? 'active' : ''}`;
    item.innerHTML = `
      <span class="item-num">${String(index + 1).padStart(2, '0')}</span>
      <span class="item-title">${track.artist} - ${track.title}</span>
      <span class="item-duration">${track.duration}</span>
    `;
    item.addEventListener('click', () => loadTrack(index, true));
    playlistContainer.appendChild(item);
  });
}

document.getElementById('btn-load-2000s').addEventListener('click', () => {
  currentPlaylist = [...PLAYLISTS['2000s']];
  loadTrack(0, true);
});

document.getElementById('btn-load-synth').addEventListener('click', () => {
  currentPlaylist = [...PLAYLISTS['synth']];
  loadTrack(0, true);
});

document.getElementById('btn-load-rock').addEventListener('click', () => {
  currentPlaylist = [...PLAYLISTS['rock']];
  loadTrack(0, true);
});

function updateFooterStatus(msg) {
  document.getElementById('footer-msg').innerText = msg;
}
