// ========== WebSocket & State ==========
const socket = io();

// Socket.IO Connection Logging
socket.on('connect', () => {
  console.log('✅ [Soundboard] Socket.IO connected');
});

socket.on('disconnect', () => {
  console.warn('⚠️ [Soundboard] Socket.IO disconnected');
});

socket.on('connect_error', (error) => {
  console.error('❌ [Soundboard] Socket.IO connection error:', error);
});

let catalog = [];
let assignments = {};
let pickerTarget = null;

// ========== NEW: Advanced Features ==========
// API Cache
const apiCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Favoriten (LocalStorage)
let favorites = JSON.parse(localStorage.getItem('soundFavorites') || '[]');

// Undo/Redo History
let history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

// Auto-Save
let hasUnsavedChanges = false;
let autoSaveInterval = null;

// Debounce Timer
let searchDebounceTimer = null;

// Pagination
let currentSearchPage = 1;
let currentSearchQuery = '';

// ========== Connection & Status ==========
socket.on('tiktok:status', (data) => {
  const connected = data.status === 'connected';
  setStatus(connected);

  // Update username field when connection status changes
  if (data.username) {
    document.getElementById('tiktok_user').value = data.username;
  }

  if (connected && data.username) {
    showToast(`Verbunden mit @${data.username}`);
  }
});

socket.on('gift_catalog:updated', (data) => {
  showToast(`Gift-Katalog aktualisiert: ${data.count} Einträge`);
  loadCatalog();
});

socket.on('soundboard:play', (data) => {
  console.log('🔊 [Soundboard] Received soundboard:play event:', data);
  pushLog(`🔊 Event empfangen: ${data.label || data.url}`);
  playSound(data.url, data.volume, data.label);
});

function setStatus(ok) {
  document.getElementById('statusDot').classList.toggle('bg-emerald-500', ok);
  document.getElementById('statusDot').classList.toggle('bg-red-500', !ok);
  document.getElementById('statusText').textContent = ok ? 'online' : 'offline';
}

// ========== Logging ==========
const logEl = document.getElementById('log');
function pushLog(line) {
  const atBottom = Math.abs(logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight) < 5;
  logEl.textContent += line + "\n";
  if (atBottom) logEl.scrollTop = logEl.scrollHeight;
}

// ========== Toast Notifications ==========
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
  pushLog(message);
}

// ========== Audio Proxy Helper ==========
/**
 * Convert MyInstants URLs to use the server proxy with caching
 * @param {string} url - Original audio URL
 * @returns {string} Proxied URL or original if not MyInstants
 */
function getProxiedUrl(url) {
  if (!url) return url;
  
  // Check if URL is from MyInstants
  const isMyInstants = url.includes('myinstants.com');
  
  if (isMyInstants) {
    // Use server proxy endpoint
    return `/api/myinstants/proxy-audio?url=${encodeURIComponent(url)}`;
  }
  
  // Return original URL for other sources
  return url;
}

// ========== Audio Playback ==========
let audioQueue = [];
let activeAudio = [];

// Use the global AudioUnlockManager from audio-unlock.js
// Get AudioContext from the manager to avoid duplicate contexts
function getAudioContext() {
  if (window.audioUnlockManager) {
    return window.audioUnlockManager.getAudioContext();
  }
  return null;
}

// Check if audio is unlocked using the global manager
function isAudioUnlocked() {
  // First check the global unlock manager
  if (window.audioUnlockManager && window.audioUnlockManager.isUnlocked()) {
    return true;
  }
  // Fallback to global flag
  return window.audioUnlocked || false;
}

// Trigger audio unlock using the global manager
function unlockAudio() {
  if (isAudioUnlocked()) {
    console.log('✅ [Soundboard] Audio already unlocked');
    return;
  }
  
  pushLog('🔓 Versuche Audio freizuschalten...');
  console.log('🔓 [Soundboard] Requesting audio unlock via AudioUnlockManager...');
  
  // Use the global unlock manager
  if (window.audioUnlockManager) {
    window.audioUnlockManager.unlock().then(() => {
      pushLog('✅ Audio-Unlock erfolgreich');
      showToast('✅ Audio freigeschaltet');
      console.log('✅ [Soundboard] Audio unlocked successfully');
    }).catch(error => {
      console.warn('⚠️ [Soundboard] Audio unlock failed:', error);
      pushLog(`⚠️ Audio-Unlock Fehler: ${error.message}`);
      // Show the manual unlock button
      if (window.audioUnlockManager) {
        window.audioUnlockManager.showUnlockButton();
      }
    });
  } else {
    console.error('❌ [Soundboard] AudioUnlockManager not available');
    pushLog('❌ AudioUnlockManager nicht verfügbar');
  }
}

// Play sound using Web Audio API (fallback method)
async function playWithWebAudio(url, vol, label) {
  pushLog(`🎵 Versuche Web Audio API für: ${label}`);
  console.log('🎵 [Soundboard] Trying Web Audio API for:', url);
  
  try {
    const ctx = getAudioContext();
    if (!ctx) {
      throw new Error('Web Audio API nicht verfügbar');
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    pushLog(`📥 Audio-Daten laden... (${url})`);
    const arrayBuffer = await response.arrayBuffer();
    
    pushLog(`🔧 Dekodiere Audio...`);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    
    // Add gain node for volume control
    const gainNode = ctx.createGain();
    const volumeValue = typeof vol === 'number' ? vol : 1;
    gainNode.gain.value = Math.max(0, Math.min(1, volumeValue));
    
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    source.onended = () => {
      pushLog(`⏹️ Web Audio beendet: ${label}`);
      console.log('⏹️ [Soundboard] Web Audio ended:', label);
    };

    source.start(0);
    pushLog(`▶️ Web Audio Wiedergabe: ${label}`);
    console.log('✅ [Soundboard] Web Audio playing:', label);
    showToast(`▶️ ${label} (Web Audio)`);
    
    return { stop: () => source.stop(), source };
  } catch (error) {
    console.error('❌ [Soundboard] Web Audio error:', error);
    pushLog(`❌ Web Audio Fehler: ${error.message}`);
    throw error;
  }
}

function playSound(url, vol, label) {
  pushLog(`🎮 PLAY Versuch ▶ ${label || 'Unbenannt'} | ${url}`);
  console.log('🎮 [Soundboard] Play attempt:', { url, vol, label });
  
  // ========== NEW: Use proxy for MyInstants URLs ==========
  const proxyUrl = getProxiedUrl(url);
  if (proxyUrl !== url) {
    pushLog(`🔄 Using audio proxy for MyInstants URL`);
    console.log('🔄 [Soundboard] Using proxy:', proxyUrl);
  }
  
  // Check if audio is unlocked before attempting playback
  if (!isAudioUnlocked()) {
    console.warn('⚠️ [Soundboard] Audio not yet unlocked, triggering unlock...');
    pushLog('⚠️ Audio noch nicht freigeschaltet');
    unlockAudio();
    // Don't return - continue with playback attempt which will trigger unlock
  }
  
  const mode = document.getElementById('play_mode')?.value || 'overlap';
  const maxLen = Number(document.getElementById('queue_length')?.value || 10);

  if (mode === 'sequential') {
    audioQueue.push({ url: proxyUrl, vol: Number(vol), label });
    while (audioQueue.length > maxLen) audioQueue.shift();
    processQueue();
  } else {
    // Overlap mode
    const duplicateActive = activeAudio.some(a => a.src === proxyUrl && !a.paused);
    if (duplicateActive) {
      pushLog(`⚠️ Sound bereits aktiv, in Queue: ${label}`);
      audioQueue.push({ url: proxyUrl, vol: Number(vol), label });
      while (audioQueue.length > maxLen) audioQueue.shift();
      processQueue();
      return;
    }

    // Create audio element and add to DOM
    const a = document.createElement('audio');
    a.src = proxyUrl; // Use proxied URL
    // DO NOT set crossOrigin - it prevents playback from many sources including MyInstants
    // Only set it if we explicitly need it for audio analysis (e.g., Web Audio API)
    // a.crossOrigin = 'anonymous'; // REMOVED: Causes CORS issues with MyInstants

    // Fix volume bug: use nullish coalescing instead of logical OR
    const volumeValue = typeof vol === 'number' ? vol : 1;
    a.volume = Math.max(0, Math.min(1, volumeValue)); // Clamp between 0 and 1
    
    pushLog(`🔊 Lautstärke gesetzt: ${(volumeValue * 100).toFixed(0)}%`);
    console.log('🔊 [Soundboard] Volume set:', volumeValue);

    // Add to DOM pool for reliable playback
    let pool = document.getElementById('soundboard-audio-pool');
    if (!pool) {
      console.warn('⚠️ [Soundboard] Audio pool not found, creating it...');
      pushLog('⚠️ Audio-Pool erstellt');
      pool = document.createElement('div');
      pool.id = 'soundboard-audio-pool';
      pool.style.display = 'none';
      document.body.appendChild(pool);
    }
    pool.appendChild(a);

    // Add detailed event listeners for debugging
    a.addEventListener('loadstart', () => {
      pushLog(`📡 Lade Audio: ${label}`);
      console.log('📡 [Soundboard] Loading started:', proxyUrl);
    });
    
    a.addEventListener('loadedmetadata', () => {
      pushLog(`📋 Metadaten geladen - Dauer: ${a.duration.toFixed(2)}s`);
      console.log('📋 [Soundboard] Metadata loaded - Duration:', a.duration);
    });
    
    a.addEventListener('canplay', () => {
      pushLog(`✅ Audio bereit zur Wiedergabe`);
      console.log('✅ [Soundboard] Can play');
    });
    
    a.addEventListener('playing', () => {
      pushLog(`▶️ Wiedergabe gestartet: ${label}`);
      console.log('▶️ [Soundboard] Playing:', label);
    });
    
    a.addEventListener('pause', () => {
      pushLog(`⏸️ Pause: ${label}`);
      console.log('⏸️ [Soundboard] Paused:', label);
    });


    // Enhanced error handling with fallback
    a.play().then(() => {
      console.log('✅ [Soundboard] Audio play() resolved:', label);
      showToast(`▶️ ${label}`);
    }).catch(async (e) => {
      console.error('❌ [Soundboard] Playback error:', {
        name: e.name,
        message: e.message,
        url: url,
        label: label
      });
      
      if (e.name === 'NotAllowedError') {
        pushLog('⚠️ Autoplay blockiert. Versuche Unlock...');
        showToast('⚠️ Autoplay blockiert - Versuche Freischaltung');
        unlockAudio();
        // Try again after unlock
        setTimeout(() => {
          console.log('🔄 [Soundboard] Retrying after unlock...');
          a.play().catch(retryError => {
            console.error('❌ [Soundboard] Retry failed:', retryError);
            pushLog(`❌ Retry fehlgeschlagen: ${retryError.message}`);
          });
        }, 500);
      } else if (e.name === 'NotSupportedError') {
        pushLog('❌ Format nicht unterstützt, versuche Web Audio API...');
        showToast('⚠️ Fallback zu Web Audio API');
        
        // Fallback to Web Audio API
        try {
          const webAudioPlayer = await playWithWebAudio(url, vol, label);
          activeAudio.push(webAudioPlayer);
        } catch (webAudioError) {
          pushLog(`❌ Alle Methoden fehlgeschlagen: ${webAudioError.message}`);
          showToast('❌ Audio-Wiedergabe fehlgeschlagen');
        }
      } else if (e.name === 'AbortError') {
        pushLog('⚠️ Audio-Wiedergabe abgebrochen');
      } else {
        pushLog(`❌ Play Error: ${e.name} - ${e.message}`);
        console.error('❌ [Soundboard] Playback error details:', e);
      }
      a.remove(); // Clean up on error
    });

    activeAudio.push(a);

    a.onended = () => {
      pushLog(`⏹️ Beendet: ${label}`);
      console.log('⏹️ [Soundboard] Ended:', label);
      activeAudio = activeAudio.filter(aud => aud !== a);
      a.remove(); // Remove from DOM
      processQueue();
    };

    a.onerror = (e) => {
      console.error('❌ [Soundboard] Audio load error:', {
        url: a.src,
        readyState: a.readyState,
        networkState: a.networkState,
        error: a.error,
        errorCode: a.error?.code,
        errorMessage: a.error?.message
      });
      
      // Provide more specific error messages
      let errorMsg = 'Unbekannter Fehler';
      if (a.error) {
        switch (a.error.code) {
          case 1: // MEDIA_ERR_ABORTED
            errorMsg = 'Wiedergabe abgebrochen';
            break;
          case 2: // MEDIA_ERR_NETWORK
            errorMsg = 'Netzwerkfehler beim Laden';
            break;
          case 3: // MEDIA_ERR_DECODE
            errorMsg = 'Audio-Dekodierungsfehler';
            break;
          case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
            errorMsg = 'Audio-Format nicht unterstützt oder URL ungültig';
            break;
          default:
            errorMsg = a.error.message || 'Unbekannter Fehler';
        }
      }
      
      pushLog(`❌ Audio-Ladefehler (Code ${a.error?.code}): ${errorMsg}`);
      pushLog(`🔍 Debug - URL: ${url}`);
      pushLog(`🔍 Debug - ReadyState: ${a.readyState}, NetworkState: ${a.networkState}`);
      console.log(`🔍 [Soundboard Debug] URL: ${url}, Label: ${label}, ReadyState: ${a.readyState}, NetworkState: ${a.networkState}`);
      
      showToast(`❌ Audio-Fehler: ${errorMsg}`);
      
      activeAudio = activeAudio.filter(aud => aud !== a);
      a.remove(); // Clean up
      processQueue();
    };

    while (activeAudio.length > maxLen) {
      const old = activeAudio.shift();
      if (old) {
        old.pause();
        old.remove(); // Clean up old audio
      }
    }
  }
}

// Audio unlock is now handled by the global AudioUnlockManager in audio-unlock.js
// Listen for the audio-unlocked event to sync state
window.addEventListener('audio-unlocked', (event) => {
  console.log('✅ [Soundboard] Received audio-unlocked event');
  pushLog('✅ Audio global freigeschaltet');
  showToast('✅ Audio bereit');
});

let isProcessingQueue = false;
async function processQueue() {
  if (isProcessingQueue || audioQueue.length === 0) return;
  isProcessingQueue = true;
  const item = audioQueue.shift();
  
  pushLog(`🎬 Queue: Spiele ${item.label || 'Unbenannt'} (${audioQueue.length} verbleibend)`);
  console.log('🎬 [Soundboard Queue] Processing:', item);

  // Create audio element and add to DOM
  const a = document.createElement('audio');
  a.src = item.url;
  // DO NOT set crossOrigin - it prevents playback from many sources including MyInstants
  // Only set it if we explicitly need it for audio analysis (e.g., Web Audio API)
  // a.crossOrigin = 'anonymous'; // REMOVED: Causes CORS issues with MyInstants

  // Fix volume bug
  const volumeValue = typeof item.vol === 'number' ? item.vol : 1;
  a.volume = Math.max(0, Math.min(1, volumeValue));

  // Add to DOM pool
  let pool = document.getElementById('soundboard-audio-pool');
  if (!pool) {
    console.warn('⚠️ [Soundboard Queue] Audio pool not found, creating it...');
    pushLog('⚠️ Queue: Audio-Pool erstellt');
    pool = document.createElement('div');
    pool.id = 'soundboard-audio-pool';
    pool.style.display = 'none';
    document.body.appendChild(pool);
  }
  pool.appendChild(a);
  
  // Add event listeners for queue playback
  a.addEventListener('loadstart', () => {
    pushLog(`📡 Queue: Lade ${item.label}`);
  });
  
  a.addEventListener('canplay', () => {
    pushLog(`✅ Queue: ${item.label} bereit`);
  });

  a.onended = () => {
    pushLog(`⏹️ Queue: ${item.label} beendet`);
    console.log('⏹️ [Soundboard Queue] Ended:', item.label);
    isProcessingQueue = false;
    a.remove(); // Clean up
    processQueue();
  };

  a.onerror = (e) => {
    console.error('❌ [Soundboard Queue] Audio load error:', {
      url: a.src,
      readyState: a.readyState,
      networkState: a.networkState,
      error: a.error,
      errorCode: a.error?.code,
      errorMessage: a.error?.message
    });
    
    // Provide more specific error messages
    let errorMsg = 'Unbekannter Fehler';
    if (a.error) {
      switch (a.error.code) {
        case 1: // MEDIA_ERR_ABORTED
          errorMsg = 'Wiedergabe abgebrochen';
          break;
        case 2: // MEDIA_ERR_NETWORK
          errorMsg = 'Netzwerkfehler beim Laden';
          break;
        case 3: // MEDIA_ERR_DECODE
          errorMsg = 'Audio-Dekodierungsfehler';
          break;
        case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
          errorMsg = 'Audio-Format nicht unterstützt oder URL ungültig';
          break;
        default:
          errorMsg = a.error.message || 'Unbekannter Fehler';
      }
    }
    
    pushLog(`❌ Queue Fehler (Code ${a.error?.code}): ${errorMsg}`);
    pushLog(`🔍 Queue Debug - URL: ${item.url}`);
    console.log(`🔍 [Soundboard Queue Debug] URL: ${item.url}, Label: ${item.label}`);
    showToast(`❌ Queue Error: ${errorMsg}`);
    isProcessingQueue = false;
    a.remove(); // Clean up
    processQueue();
  };

  try {
    await a.play();
    pushLog(`▶️ Queue: ${item.label} wird abgespielt`);
    console.log('✅ [Soundboard Queue] Audio playing:', item.label);
  } catch (e) {
    console.error('❌ [Soundboard Queue] Playback error:', {
      name: e.name,
      message: e.message,
      url: item.url,
      label: item.label
    });
    
    if (e.name === 'NotAllowedError') {
      pushLog('⚠️ Queue: Autoplay blockiert');
      showToast('⚠️ Autoplay blockiert (Queue)');
    } else if (e.name === 'NotSupportedError') {
      pushLog('❌ Queue: Format nicht unterstützt');
      showToast('❌ Format nicht unterstützt (Queue)');
    } else if (e.name === 'AbortError') {
      pushLog('⚠️ Queue: Wiedergabe abgebrochen');
    } else {
      pushLog(`❌ Queue Play Error: ${e.message}`);
      console.error('❌ [Soundboard Queue] Playback error details:', e);
    }
    isProcessingQueue = false;
    a.remove(); // Clean up
    processQueue();
  }
}

// ========== API Calls ==========
async function apiCall(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return await res.json();
}

document.getElementById('btnConnect').onclick = async () => {
  const username = document.getElementById('tiktok_user').value.trim();
  if (!username) return showToast('Bitte TikTok-Username eingeben');
  const result = await apiCall('/api/connect', 'POST', { username });
  if (result.success) {
    showToast('Verbinde...');
  } else {
    showToast('Fehler: ' + result.error);
  }
};

document.getElementById('btnDisconnect').onclick = async () => {
  await apiCall('/api/disconnect', 'POST');
  showToast('Verbindung getrennt');
};

document.getElementById('btnUpdateGifts').onclick = async () => {
  document.getElementById('giftStatus').textContent = 'Aktualisiere…';
  const result = await apiCall('/api/gift-catalog/update', 'POST');
  document.getElementById('giftStatus').textContent = result.message || (result.ok ? 'OK' : 'Fehler');
  if (result.ok) loadCatalog();
};

document.getElementById('btnTest').onclick = () => {
  const url = document.getElementById('test_url').value.trim();
  if (url) playSound(url, 1.0, 'Test');
};

// ========== Gift Catalog & Assignments ==========
async function loadCatalog() {
  const result = await apiCall('/api/gift-catalog');
  if (result.success) {
    catalog = result.catalog;
    document.getElementById('giftStatus').textContent = `${catalog.length} Gifts verfügbar`;

    // Lade gespeicherte Gift-Sounds
    const soundsResult = await apiCall('/api/soundboard/gifts');
    if (soundsResult) {
      soundsResult.forEach(s => {
        assignments[s.giftId] = {
          mp3_url: s.mp3Url || '',
          label: s.label || '',
          volume: s.volume ?? 1.0,
          animation_url: s.animationUrl || '',
          animation_type: s.animationType || 'none'
        };
      });
    }

    renderGiftList();
  }
}

function renderGiftList() {
  const q = document.getElementById('giftSearch').value.toLowerCase().trim();
  const dir = document.getElementById('giftSort').value;

  let list = catalog.slice().sort((a, b) => {
    const av = a.diamond_count ?? (dir === 'asc' ? Infinity : -Infinity);
    const bv = b.diamond_count ?? (dir === 'asc' ? Infinity : -Infinity);
    return dir === 'asc' ? av - bv : bv - av;
  });

  if (q) {
    list = list.filter(g =>
      String(g.id).includes(q) ||
      (g.name||'').toLowerCase().includes(q)
    );
  }

  document.getElementById('giftList').innerHTML = list.map(giftRowTemplate).join('');

  // Attach event listeners
  list.forEach(g => {
    const mp3Input = document.getElementById(`mp3_${g.id}`);
    const volInput = document.getElementById(`vol_${g.id}`);
    const animUrlInput = document.getElementById(`anim_url_${g.id}`);
    const checkbox = document.querySelector(`.gift-checkbox[data-gift-id="${g.id}"]`);
    
    if (mp3Input) mp3Input.oninput = (e) => updateAssignment(g.id, 'mp3_url', e.target.value.trim());
    if (volInput) volInput.oninput = (e) => updateAssignment(g.id, 'volume', Number(e.target.value));
    if (animUrlInput) animUrlInput.oninput = (e) => updateAssignment(g.id, 'animation_url', e.target.value.trim());
    if (checkbox) checkbox.onchange = () => updateBulkSelection();
  });
}

function giftRowTemplate(g) {
  const assigned = assignments[g.id] || {};
  const vol = assigned.volume ?? 1.0;
  const animType = assigned.animation_type || 'none';
  const animUrl = assigned.animation_url || '';
  const safeName = (g.name || '').replace(/"/g,'&quot;');
  const rowClass = `gift-row flex flex-col gap-2 border border-slate-800 rounded-xl p-3${assigned.mp3_url ? ' assigned' : ''}`;

  return `<div class="${rowClass}" data-gift-id="${g.id}">
    <div class="flex items-center gap-3">
      <input type="checkbox" class="gift-checkbox w-4 h-4 rounded cursor-pointer" data-gift-id="${g.id}" />
      ${g.image_url
        ? `<img src="${g.image_url}" alt="${safeName}" class="w-12 h-12 rounded-lg object-cover bg-black/30" onerror="this.outerHTML='<div class=\\'w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center text-xl\\'>🎁</div>'"/>`
        : `<div class="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center text-xl">🎁</div>`
      }
      <div class="flex-1 min-w-0">
        <div class="font-medium text-sm">${safeName}</div>
        <div class="text-xs text-slate-400">ID: ${g.id} · 💎 ${g.diamond_count ?? '—'}</div>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <input id="mp3_${g.id}" value="${assigned.mp3_url || ''}" placeholder="MP3-URL"
             class="flex-1 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
             data-gift-id="${g.id}" />
      <input id="vol_${g.id}" type="range" min="0" max="1" step="0.05" value="${vol}"
             class="w-24 flex-shrink-0" title="Lautstärke" />
      <button class="rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1.5"
              data-action="preview-gift" data-gift-id="${g.id}">▶</button>
      <button class="rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-1.5"
              data-action="open-picker" data-target="gift:${g.id}">Picker</button>
      <button class="rounded-lg bg-rose-700/80 hover:bg-rose-600 px-3 py-1.5"
              data-action="clear-gift" data-gift-id="${g.id}">✕</button>
    </div>
    <div class="flex items-center gap-2 border-t border-slate-700/50 pt-2">
      <span class="text-xs text-slate-400 flex-shrink-0">🎬 Animation:</span>
      <select id="anim_type_${g.id}" class="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-sm flex-shrink-0" data-change-action="update-anim-type" data-gift-id="${g.id}">
        <option value="none" ${animType === 'none' ? 'selected' : ''}>Keine</option>
        <option value="image" ${animType === 'image' ? 'selected' : ''}>Bild</option>
        <option value="gif" ${animType === 'gif' ? 'selected' : ''}>GIF</option>
        <option value="video" ${animType === 'video' ? 'selected' : ''}>Video</option>
      </select>
      <input id="anim_url_${g.id}" value="${animUrl}" placeholder="Animation-URL (optional)"
             class="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-sm"
             data-gift-id="${g.id}" />
    </div>
  </div>`;
}

function updateAssignment(id, key, value) {
  const g = catalog.find(x => x.id === id);
  if (!assignments[id]) assignments[id] = { label: g?.name || '' };
  assignments[id][key] = value;

  // Update visual state
  const row = document.querySelector(`.gift-row[data-gift-id='${id}']`);
  if (row) {
    row.classList.toggle('assigned', !!assignments[id].mp3_url);
  }

  // Save to history for undo/redo
  saveStateToHistory();
  hasUnsavedChanges = true;
}

async function clearGift(id) {
  // Clear UI
  document.getElementById(`mp3_${id}`).value = '';
  document.getElementById(`vol_${id}`).value = 1;
  document.getElementById(`anim_url_${id}`).value = '';
  document.getElementById(`anim_type_${id}`).value = 'none';
  
  // Delete from database via API
  try {
    await apiCall(`/api/soundboard/gifts/${id}`, 'DELETE');
    console.log(`✅ Gift sound deleted from database: ${id}`);
  } catch (error) {
    console.error(`❌ Error deleting gift sound from database:`, error);
    showToast(`⚠️ Fehler beim Löschen aus der Datenbank: ${error.message}`);
  }
  
  // Update local state
  updateAssignment(id, 'mp3_url', '');
  updateAssignment(id, 'volume', 1.0);
  updateAssignment(id, 'animation_url', '');
  updateAssignment(id, 'animation_type', 'none');
  
  showToast(`🗑️ Gift-Sound gelöscht: ${id}`);
  hasUnsavedChanges = false; // Already saved to database
}

function previewGift(id) {
  const urlInput = document.getElementById(`mp3_${id}`);
  const volInput = document.getElementById(`vol_${id}`);
  
  if (!urlInput || !volInput) {
    console.error(`❌ Gift elements not found for ID: ${id}`);
    showToast(`⚠️ Gift-Elemente nicht gefunden`);
    return;
  }
  
  const url = urlInput.value.trim();
  const vol = volInput.value;
  
  if (url) {
    console.log(`🎵 Previewing gift sound: Gift #${id}, URL: ${url}, Volume: ${vol}`);
    playSound(url, vol, `Gift #${id} Preview`);
  } else {
    console.warn(`⚠️ No URL set for gift #${id}`);
    showToast(`⚠️ Kein Sound-URL für Gift #${id} gesetzt`);
  }
}

function previewSound(urlId, volId, label) {
  const url = document.getElementById(urlId).value.trim();
  const vol = document.getElementById(volId)?.value || 1.0;
  if (url) playSound(url, vol, label + ' Preview');
}

document.getElementById('giftSearch').oninput = renderGiftList;
document.getElementById('giftSort').onchange = renderGiftList;

// ========== Picker Dialog ==========
function openPicker(targetId) {
  pickerTarget = targetId;
  document.getElementById('picker').classList.remove('hidden');
  document.getElementById('picker').classList.add('flex');
  document.getElementById('miUrl').value = '';
  switchTab('browse');

  // Auto-load trending sounds if not already loaded
  const trendingEl = document.getElementById('trendingResults');
  if (!trendingEl.children.length || trendingEl.textContent.includes('Keine')) {
    // Will be loaded when user switches to trending tab
  }
}

function closePicker() {
  document.getElementById('picker').classList.add('hidden');
  document.getElementById('picker').classList.remove('flex');
}

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
  // Escape: Close picker
  if (e.key === 'Escape') {
    const picker = document.getElementById('picker');
    if (!picker.classList.contains('hidden')) {
      closePicker();
    }
  }

  // Ctrl+S: Save
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    document.getElementById('btnSaveAll').click();
    showToast('💾 Speichern mit Strg+S');
  }

  // Ctrl+E: Export
  if (e.ctrlKey && e.key === 'e') {
    e.preventDefault();
    document.getElementById('btnExport').click();
  }

  // Ctrl+Z: Undo
  if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  }

  // Ctrl+Y or Ctrl+Shift+Z: Redo
  if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
    e.preventDefault();
    redo();
  }
});

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.setAttribute('aria-selected','false'));
  document.querySelectorAll('[id^="tab-"]').forEach(p => p.classList.add('hidden'));

  const btn = document.querySelector(`.tab-btn[data-action="switch-tab"][data-tab="${tab}"]`);
  if (btn) btn.setAttribute('aria-selected','true');

  const panel = document.getElementById('tab-' + tab);
  if (panel) {
    panel.classList.remove('hidden');
    panel.classList.add('flex');
  }

  // Auto-load content when switching to certain tabs
  if (tab === 'trending') {
    const trendingEl = document.getElementById('trendingResults');
    if (!trendingEl.children.length || trendingEl.innerHTML.includes('Keine')) {
      document.getElementById('btnLoadTrending').click();
    }
  }
  if (tab === 'random') {
    const randomEl = document.getElementById('randomResults');
    if (!randomEl.children.length || randomEl.innerHTML.includes('Keine')) {
      document.getElementById('btnLoadRandom').click();
    }
  }
}

document.getElementById('btnResolve').onclick = async () => {
  const url = document.getElementById('miUrl').value.trim();
  if (!url) return;

  showToast('Löse URL auf...');
  const result = await apiCall('/api/myinstants/resolve?url=' + encodeURIComponent(url));

  if (result.success && result.mp3) {
    document.getElementById('miUrl').value = result.mp3;
    showToast('MP3-URL extrahiert!');
  } else {
    showToast('Fehler: ' + (result.error || 'Unbekannt'));
  }
};

document.getElementById('btnUse').onclick = () => {
  assignToTarget(document.getElementById('miUrl').value.trim());
  closePicker();
};

// ========== Utility Functions ==========

// API Caching
async function cachedApiCall(url, bypassCache = false) {
  if (!bypassCache) {
    const cached = apiCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('📦 Cache hit:', url);
      return cached.data;
    }
  }

  const data = await apiCall(url);
  apiCache.set(url, { data, timestamp: Date.now() });
  return data;
}

// Sound Preview Validation
async function validateMP3(url) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const timeout = setTimeout(() => {
      audio.src = '';
      resolve(false);
    }, 5000); // 5s timeout

    audio.onloadedmetadata = () => {
      clearTimeout(timeout);
      audio.src = '';
      resolve(true);
    };

    audio.onerror = () => {
      clearTimeout(timeout);
      audio.src = '';
      resolve(false);
    };

    audio.src = url;
  });
}

// Duplicate Detection
function detectDuplicates(url) {
  const duplicates = Object.entries(assignments).filter(([id, data]) =>
    data.mp3_url === url
  );

  if (duplicates.length > 0) {
    const giftNames = duplicates.map(([id]) => {
      const gift = catalog.find(g => g.id == id);
      return gift ? gift.name : `Gift ${id}`;
    }).join(', ');
    return `⚠️ Dieser Sound ist bereits zugeordnet zu: ${giftNames}`;
  }
  return null;
}

// Debounce Function
function debounce(func, delay) {
  return function(...args) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => func.apply(this, args), delay);
  };
}

// Save State for Undo/Redo
function saveStateToHistory() {
  // Remove future states if we're not at the end
  history.splice(historyIndex + 1);

  // Add current state
  history.push(JSON.parse(JSON.stringify(assignments)));
  historyIndex++;

  // Limit history size
  if (history.length > MAX_HISTORY) {
    history.shift();
    historyIndex--;
  }

  console.log(`📜 State saved (${historyIndex + 1}/${history.length})`);
}

// Undo
function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    assignments = JSON.parse(JSON.stringify(history[historyIndex]));
    renderGiftList();
    showToast(`↩️ Rückgängig (${historyIndex + 1}/${history.length})`);
    hasUnsavedChanges = true;
  } else {
    showToast('⚠️ Nichts zum Rückgängig machen');
  }
}

// Redo
function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    assignments = JSON.parse(JSON.stringify(history[historyIndex]));
    renderGiftList();
    showToast(`↪️ Wiederherstellen (${historyIndex + 1}/${history.length})`);
    hasUnsavedChanges = true;
  } else {
    showToast('⚠️ Nichts zum Wiederherstellen');
  }
}

// Favoriten Management
function addToFavorites(sound) {
  if (!favorites.find(f => f.url === sound.url)) {
    favorites.push(sound);
    localStorage.setItem('soundFavorites', JSON.stringify(favorites));
    showToast(`⭐ Zu Favoriten hinzugefügt: ${sound.name}`);
  } else {
    showToast('ℹ️ Bereits in Favoriten');
  }
}

function removeFromFavorites(url) {
  favorites = favorites.filter(f => f.url !== url);
  localStorage.setItem('soundFavorites', JSON.stringify(favorites));
  showToast('🗑️ Aus Favoriten entfernt');
}

// Auto-Save
function startAutoSave() {
  if (autoSaveInterval) clearInterval(autoSaveInterval);

  autoSaveInterval = setInterval(() => {
    if (hasUnsavedChanges) {
      autoSave();
    }
  }, 30000); // Every 30 seconds

  console.log('💾 Auto-Save aktiviert (alle 30s)');
}

async function autoSave() {
  try {
    // Save settings
    const settings = {
      soundboard_enabled: 'true',
      soundboard_play_mode: document.getElementById('play_mode').value,
      soundboard_max_queue_length: document.getElementById('queue_length').value,
      soundboard_follow_sound: document.getElementById('follow_sound').value.trim(),
      soundboard_follow_volume: document.getElementById('follow_volume').value,
      soundboard_subscribe_sound: document.getElementById('subscribe_sound').value.trim(),
      soundboard_subscribe_volume: document.getElementById('subscribe_volume').value,
      soundboard_share_sound: document.getElementById('share_sound').value.trim(),
      soundboard_share_volume: document.getElementById('share_volume').value,
      soundboard_like_sound: document.getElementById('like_sound').value.trim(),
      soundboard_like_volume: document.getElementById('like_volume').value,
      soundboard_like_threshold: document.getElementById('like_threshold').value,
      soundboard_like_window_seconds: document.getElementById('like_window_seconds').value,
      soundboard_default_gift_sound: document.getElementById('default_gift_sound').value.trim(),
      soundboard_gift_volume: document.getElementById('default_gift_volume').value
    };

    await apiCall('/api/settings', 'POST', settings);

    // Save gift assignments
    const gifts = Object.entries(assignments)
      .filter(([id, data]) => data.mp3_url)
      .map(([id, data]) => ({
        giftId: Number(id),
        label: data.label || `Gift ${id}`,
        mp3Url: data.mp3_url,
        volume: data.volume ?? 1.0,
        animationUrl: data.animation_url || null,
        animationType: data.animation_type || 'none'
      }));

    for (const gift of gifts) {
      await apiCall('/api/soundboard/gifts', 'POST', gift);
    }

    hasUnsavedChanges = false;
    console.log(`💾 Auto-Save erfolgreich (${gifts.length} Gifts)`);
  } catch (error) {
    console.error('❌ Auto-Save fehlgeschlagen:', error);
  }
}

// Unsaved Changes Warning
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = 'Du hast ungespeicherte Änderungen!';
  }
});

// ========== MyInstants API Functions ==========

function showLoadingSkeleton(targetElement, count = 5) {
  targetElement.innerHTML = Array(count).fill(0).map(() => `
    <div class="animate-pulse border border-slate-700 rounded-xl p-3">
      <div class="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
      <div class="h-3 bg-slate-700 rounded w-1/2 mb-2"></div>
      <div class="h-3 bg-slate-700 rounded w-2/3"></div>
    </div>
  `).join('');
}

function renderSoundResults(items, targetElement, showPagination = false) {
  if (!items || items.length === 0) {
    targetElement.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-slate-400">
        <div class="text-4xl mb-2">🔍</div>
        <div class="text-sm">Keine Ergebnisse gefunden</div>
      </div>
    `;
    return;
  }

  const resultsHTML = items.map(item => {
    // For URLs: only escape quotes to prevent breaking out of attributes
    // For display text: escape HTML entities to prevent XSS
    const escapeForAttribute = (str) => String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const escapeForDisplay = (str) => String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    
    // URLs should NOT have & escaped (breaks query parameters), only quotes
    const mp3 = escapeForAttribute(item.url || '');
    const title = escapeForDisplay(item.name || 'Unbenannt');
    const description = escapeForDisplay(item.description || '');
    const itemTags = (item.tags || []).slice(0, 4);
    const isFavorite = favorites.some(f => f.url === item.url);

    // Generate clickable tag pills
    const tagPills = itemTags.map(tag => {
      const safeTag = escapeForDisplay(tag);
      return `<button class="inline-block px-2 py-0.5 rounded-full bg-slate-700 hover:bg-sky-600 text-xs transition-colors"
                      data-action="filter-category" data-category="${safeTag}" title="Nach '${safeTag}' filtern">${safeTag}</button>`;
    }).join(' ');

    return `<div class="flex flex-col gap-2 border border-slate-700 rounded-xl p-3 hover:border-sky-500 transition-colors">
      <div class="flex items-start gap-2">
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm mb-1 truncate" title="${title}">${title}</div>
          ${description ? `<div class="text-xs text-slate-400 mb-1 line-clamp-2">${description}</div>` : ''}
          ${tagPills ? `<div class="text-xs flex gap-1 flex-wrap mt-1">${tagPills}</div>` : ''}
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button class="rounded-lg ${isFavorite ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-slate-600 hover:bg-slate-500'} px-2 py-1 text-sm"
                  data-action="${isFavorite ? 'remove-favorite' : 'add-favorite'}"
                  data-url="${mp3}"
                  data-name="${title}"
                  data-description="${description}"
                  data-tags="${escapeForAttribute(JSON.stringify(itemTags))}"
                  title="${isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">⭐</button>
          <button class="rounded-lg bg-amber-600 hover:bg-amber-500 px-2 py-1 text-sm"
                  data-action="play-sound" data-url="${mp3}" data-title="${title}" title="Vorschau">▶</button>
          <button class="rounded-lg bg-sky-600 hover:bg-sky-500 px-2 py-1 text-sm"
                  data-action="assign-sound" data-url="${mp3}" title="Sound zuweisen">Wählen</button>
        </div>
      </div>
    </div>`;
  }).join('');

  targetElement.innerHTML = resultsHTML;

  // Add "Load More" button if pagination is enabled
  if (showPagination && items.length >= 20) {
    targetElement.innerHTML += `
      <div class="flex justify-center pt-4">
        <button id="btnLoadMore" class="rounded-xl bg-slate-700 hover:bg-slate-600 px-6 py-3 font-medium">
          Mehr laden
        </button>
      </div>
    `;
  }
}

// Render Favorites
function renderFavorites() {
  const favoritesEl = document.getElementById('favoritesResults');
  if (!favoritesEl) return;

  if (favorites.length === 0) {
    favoritesEl.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-slate-400">
        <div class="text-4xl mb-2">⭐</div>
        <div class="text-sm">Keine Favoriten gespeichert</div>
        <div class="text-xs mt-2">Klicke auf ⭐ um Sounds als Favoriten zu markieren</div>
      </div>
    `;
    return;
  }

  renderSoundResults(favorites, favoritesEl, false);
}

async function performSearch(query, page = 1) {
  if (!query) {
    document.getElementById('searchResults').innerHTML = '';
    return;
  }

  const resultsEl = document.getElementById('searchResults');

  // Only show skeleton on first page
  if (page === 1) {
    showLoadingSkeleton(resultsEl, 6);
  }

  try {
    const url = `/api/myinstants/search?query=${encodeURIComponent(query)}&page=${page}&limit=20`;
    const result = await cachedApiCall(url);

    if (result.success) {
      if (page === 1) {
        renderSoundResults(result.results, resultsEl, true);
        currentSearchQuery = query;
        currentSearchPage = 1;
      } else {
        // Append results for pagination
        const existingHTML = resultsEl.innerHTML;
        // Remove old "Load More" button
        resultsEl.innerHTML = existingHTML.replace(/<div class="flex justify-center.*?<\/div>\s*$/s, '');
        renderSoundResults(result.results, resultsEl, true);
      }

      // Setup "Load More" button
      const loadMoreBtn = document.getElementById('btnLoadMore');
      if (loadMoreBtn) {
        loadMoreBtn.onclick = () => {
          currentSearchPage++;
          performSearch(currentSearchQuery, currentSearchPage);
        };
      }

      if (result.results.length > 0 && page === 1) {
        showToast(`✅ ${result.results.length} Sounds gefunden`);
      }
    } else {
      resultsEl.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 text-rose-400">
          <div class="text-4xl mb-2">⚠️</div>
          <div class="text-sm">Fehler: ${result.error || 'Unbekannt'}</div>
        </div>
      `;
      if (page === 1) showToast('❌ Suche fehlgeschlagen');
    }
  } catch (error) {
    resultsEl.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-rose-400">
        <div class="text-4xl mb-2">💥</div>
        <div class="text-sm">Netzwerkfehler: ${error.message}</div>
      </div>
    `;
    if (page === 1) showToast('❌ Verbindungsfehler');
  }
}

// Debounced live search
const debouncedSearch = debounce((query) => {
  performSearch(query, 1);
}, 500);

document.getElementById('searchQuery').oninput = (e) => {
  const query = e.target.value.trim();
  if (query.length >= 2) {
    debouncedSearch(query);
  } else if (query.length === 0) {
    document.getElementById('searchResults').innerHTML = '';
  }
};

// Manual search button
document.getElementById('btnSearch').onclick = () => {
  const query = document.getElementById('searchQuery').value.trim();
  if (!query) return showToast('⚠️ Bitte Suchbegriff eingeben');
  performSearch(query, 1);
};

// Enter key for manual search
document.getElementById('searchQuery').onkeypress = (e) => {
  if (e.key === 'Enter') {
    const query = e.target.value.trim();
    if (query) performSearch(query, 1);
  }
};

// Clear cache button
document.getElementById('btnClearCache').onclick = () => {
  apiCache.clear();
  showToast('🗑️ Cache geleert');
};

// Filter by category/tag
function filterByCategory(category) {
  // Switch to search tab if not already there
  switchTab('search');

  // Set search query to the category
  document.getElementById('searchQuery').value = category;

  // Perform search
  performSearch(category, 1);

  showToast(`🏷️ Suche nach: ${category}`);
}

// Clear favorites button
document.getElementById('btnClearFavorites').onclick = () => {
  if (confirm('Alle Favoriten löschen?')) {
    favorites = [];
    localStorage.setItem('soundFavorites', JSON.stringify(favorites));
    renderFavorites();
    showToast('🗑️ Alle Favoriten gelöscht');
  }
};

document.getElementById('btnLoadTrending').onclick = async () => {
  const resultsEl = document.getElementById('trendingResults');
  showLoadingSkeleton(resultsEl, 8);

  try {
    const result = await apiCall('/api/myinstants/trending?limit=30');

    if (result.success) {
      renderSoundResults(result.results, resultsEl);
      showToast(`🔥 ${result.results.length} Trending Sounds geladen`);
    } else {
      resultsEl.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 text-rose-400">
          <div class="text-4xl mb-2">⚠️</div>
          <div class="text-sm">Fehler: ${result.error || 'Unbekannt'}</div>
        </div>
      `;
      showToast('❌ Trending Sounds konnten nicht geladen werden');
    }
  } catch (error) {
    resultsEl.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-rose-400">
        <div class="text-4xl mb-2">💥</div>
        <div class="text-sm">Verbindungsfehler</div>
      </div>
    `;
    showToast('❌ Verbindungsfehler');
  }
};

document.getElementById('btnLoadRandom').onclick = async () => {
  const resultsEl = document.getElementById('randomResults');
  showLoadingSkeleton(resultsEl, 8);

  try {
    const result = await apiCall('/api/myinstants/random?limit=30');

    if (result.success) {
      renderSoundResults(result.results, resultsEl);
      showToast(`🎲 ${result.results.length} zufällige Sounds geladen`);
    } else {
      resultsEl.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 text-rose-400">
          <div class="text-4xl mb-2">⚠️</div>
          <div class="text-sm">Fehler: ${result.error || 'Unbekannt'}</div>
        </div>
      `;
      showToast('❌ Zufällige Sounds konnten nicht geladen werden');
    }
  } catch (error) {
    resultsEl.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-rose-400">
        <div class="text-4xl mb-2">💥</div>
        <div class="text-sm">Verbindungsfehler</div>
      </div>
    `;
    showToast('❌ Verbindungsfehler');
  }
};

async function assignToTarget(url) {
  if (!pickerTarget || !url) return;

  const cleanUrl = (url.match(/https?:\/\/[^\s"'<>]+?\.mp3[^\s"'<>]*/i) || [url])[0];

  // Validate MP3
  showToast('🔍 Validiere Sound...');
  const isValid = await validateMP3(cleanUrl);

  if (!isValid) {
    if (!confirm('⚠️ Sound konnte nicht geladen werden. Trotzdem zuweisen?')) {
      return;
    }
  }

  // Handle bulk assignment
  if (pickerTarget === 'bulk:assign' && window.bulkAssignIds) {
    const ids = window.bulkAssignIds;
    ids.forEach(id => {
      document.getElementById(`mp3_${id}`).value = cleanUrl;
      updateAssignment(id, 'mp3_url', cleanUrl);
    });

    showToast(`✅ Sound ${ids.length} Gifts zugewiesen!`);
    hasUnsavedChanges = true;

    // Clear selection
    document.querySelectorAll('.gift-checkbox').forEach(cb => cb.checked = false);
    updateBulkSelection();
    delete window.bulkAssignIds;
    return;
  }

  // Check for duplicates (only for single gift assignments)
  if (pickerTarget.startsWith('gift:')) {
    const duplicate = detectDuplicates(cleanUrl);
    if (duplicate) {
      if (!confirm(duplicate + '\n\nTrotzdem zuweisen?')) {
        return;
      }
    }
  }

  // Assign to single gift
  if (pickerTarget.startsWith('gift:')) {
    const id = Number(pickerTarget.split(':')[1]);
    document.getElementById(`mp3_${id}`).value = cleanUrl;
    updateAssignment(id, 'mp3_url', cleanUrl);
  } else {
    document.getElementById(pickerTarget).value = cleanUrl;
  }

  showToast('✅ Sound zugewiesen!');
  hasUnsavedChanges = true;
}

// ========== Bulk Actions ==========
function updateBulkSelection() {
  const checkboxes = document.querySelectorAll('.gift-checkbox');
  const selectedCheckboxes = Array.from(checkboxes).filter(cb => cb.checked);
  const count = selectedCheckboxes.length;

  // Update count and show/hide toolbar
  document.getElementById('bulkCount').textContent = `${count} ausgewählt`;
  const toolbar = document.getElementById('bulkToolbar');
  if (count > 0) {
    toolbar.classList.remove('hidden');
  } else {
    toolbar.classList.add('hidden');
  }
}

function getSelectedGiftIds() {
  const checkboxes = document.querySelectorAll('.gift-checkbox:checked');
  return Array.from(checkboxes).map(cb => Number(cb.dataset.giftId));
}

document.getElementById('btnBulkSelectAll').onclick = () => {
  document.querySelectorAll('.gift-checkbox').forEach(cb => cb.checked = true);
  updateBulkSelection();
  showToast(`✅ Alle ${document.querySelectorAll('.gift-checkbox').length} Gifts ausgewählt`);
};

document.getElementById('btnBulkSelectNone').onclick = () => {
  document.querySelectorAll('.gift-checkbox').forEach(cb => cb.checked = false);
  updateBulkSelection();
  showToast('🔲 Auswahl aufgehoben');
};

document.getElementById('btnBulkSelectAssigned').onclick = () => {
  document.querySelectorAll('.gift-checkbox').forEach(cb => {
    const giftId = Number(cb.dataset.giftId);
    cb.checked = !!assignments[giftId]?.mp3_url;
  });
  updateBulkSelection();
  const count = document.querySelectorAll('.gift-checkbox:checked').length;
  showToast(`✅ ${count} zugeordnete Gifts ausgewählt`);
};

document.getElementById('btnBulkAssign').onclick = () => {
  const selectedIds = getSelectedGiftIds();
  if (selectedIds.length === 0) {
    return showToast('⚠️ Keine Gifts ausgewählt');
  }

  // Store selected IDs for bulk assignment
  window.bulkAssignIds = selectedIds;
  showToast(`🎵 Wähle Sound für ${selectedIds.length} Gifts...`);

  // Open picker with special target
  pickerTarget = 'bulk:assign';
  document.getElementById('picker').classList.remove('hidden');
  document.getElementById('picker').classList.add('flex');
  switchTab('search');
};

document.getElementById('btnBulkClear').onclick = async () => {
  const selectedIds = getSelectedGiftIds();
  if (selectedIds.length === 0) {
    return showToast('⚠️ Keine Gifts ausgewählt');
  }

  if (!confirm(`Wirklich ${selectedIds.length} Sound-Zuweisungen löschen?`)) {
    return;
  }

  // Delete all selected gifts from database
  for (const id of selectedIds) {
    try {
      await apiCall(`/api/soundboard/gifts/${id}`, 'DELETE');
    } catch (error) {
      console.error(`❌ Error deleting gift sound ${id} from database:`, error);
    }
    
    // Clear UI
    const mp3Input = document.getElementById(`mp3_${id}`);
    const volInput = document.getElementById(`vol_${id}`);
    const animUrlInput = document.getElementById(`anim_url_${id}`);
    const animTypeInput = document.getElementById(`anim_type_${id}`);
    
    if (mp3Input) mp3Input.value = '';
    if (volInput) volInput.value = 1;
    if (animUrlInput) animUrlInput.value = '';
    if (animTypeInput) animTypeInput.value = 'none';
    
    // Update local state
    updateAssignment(id, 'mp3_url', '');
    updateAssignment(id, 'volume', 1.0);
    updateAssignment(id, 'animation_url', '');
    updateAssignment(id, 'animation_type', 'none');
  }

  // Deselect all
  document.querySelectorAll('.gift-checkbox').forEach(cb => cb.checked = false);
  updateBulkSelection();

  showToast(`🗑️ ${selectedIds.length} Zuweisungen gelöscht`);
  hasUnsavedChanges = false; // Already saved to database
};

// ========== Drag & Drop ==========
function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

function handleDrop(event, giftId) {
  event.preventDefault();

  let url = event.dataTransfer.getData('text/plain');

  // Extract MP3 URL if it's a full URL
  const mp3Match = url.match(/https?:\/\/[^\s"'<>]+?\.mp3[^\s"'<>]*/i);
  if (mp3Match) {
    url = mp3Match[0];
  }

  if (url && (url.includes('.mp3') || url.startsWith('http'))) {
    document.getElementById(`mp3_${giftId}`).value = url;
    updateAssignment(giftId, 'mp3_url', url);
    showToast(`✅ Sound per Drag & Drop zugewiesen: Gift ${giftId}`);
    hasUnsavedChanges = true;
  } else {
    showToast('⚠️ Ungültige URL. Nur MP3-URLs werden unterstützt.');
  }
}

// ========== Save Settings ==========
document.getElementById('btnSaveAll').onclick = async () => {
  showToast('Speichere...');

  // Save event sounds settings
  const settings = {
    soundboard_enabled: 'true',
    soundboard_play_mode: document.getElementById('play_mode').value,
    soundboard_max_queue_length: document.getElementById('queue_length').value,
    soundboard_follow_sound: document.getElementById('follow_sound').value.trim(),
    soundboard_follow_volume: document.getElementById('follow_volume').value,
    soundboard_subscribe_sound: document.getElementById('subscribe_sound').value.trim(),
    soundboard_subscribe_volume: document.getElementById('subscribe_volume').value,
    soundboard_share_sound: document.getElementById('share_sound').value.trim(),
    soundboard_share_volume: document.getElementById('share_volume').value,
    soundboard_like_sound: document.getElementById('like_sound').value.trim(),
    soundboard_like_volume: document.getElementById('like_volume').value,
    soundboard_like_threshold: document.getElementById('like_threshold').value,
    soundboard_like_window_seconds: document.getElementById('like_window_seconds').value,
    soundboard_default_gift_sound: document.getElementById('default_gift_sound').value.trim(),
    soundboard_gift_volume: document.getElementById('default_gift_volume').value
  };

  await apiCall('/api/settings', 'POST', settings);

  // Save gift sound assignments
  const gifts = Object.entries(assignments)
    .filter(([id, data]) => data.mp3_url)
    .map(([id, data]) => ({
      giftId: Number(id),
      label: data.label || `Gift ${id}`,
      mp3Url: data.mp3_url,
      volume: data.volume ?? 1.0,
      animationUrl: data.animation_url || null,
      animationType: data.animation_type || 'none'
    }));

  for (const gift of gifts) {
    await apiCall('/api/soundboard/gifts', 'POST', gift);
  }

  showToast(`✅ Gespeichert! (${gifts.length} Gifts)`);
};

// ========== Export / Import / Reset ==========
document.getElementById('btnExport').onclick = async () => {
  const settings = await apiCall('/api/settings');
  const gifts = await apiCall('/api/soundboard/gifts');

  const exportData = {
    settings,
    gifts,
    exportedAt: new Date().toISOString(),
    version: '1.0'
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `soundboard_config_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(link.href);

  showToast('✅ Konfiguration exportiert!');
};

document.getElementById('importFile').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.settings && !data.gifts) {
      showToast('❌ Ungültiges Format');
      return;
    }

    // Import settings
    if (data.settings) {
      await apiCall('/api/settings', 'POST', data.settings);

      // Update UI
      if (data.settings.soundboard_play_mode) {
        document.getElementById('play_mode').value = data.settings.soundboard_play_mode;
      }
      if (data.settings.soundboard_max_queue_length) {
        document.getElementById('queue_length').value = data.settings.soundboard_max_queue_length;
      }
      if (data.settings.soundboard_follow_sound) {
        document.getElementById('follow_sound').value = data.settings.soundboard_follow_sound;
      }
      if (data.settings.soundboard_follow_volume) {
        document.getElementById('follow_volume').value = data.settings.soundboard_follow_volume;
      }
      if (data.settings.soundboard_subscribe_sound) {
        document.getElementById('subscribe_sound').value = data.settings.soundboard_subscribe_sound;
      }
      if (data.settings.soundboard_subscribe_volume) {
        document.getElementById('subscribe_volume').value = data.settings.soundboard_subscribe_volume;
      }
      if (data.settings.soundboard_share_sound) {
        document.getElementById('share_sound').value = data.settings.soundboard_share_sound;
      }
      if (data.settings.soundboard_share_volume) {
        document.getElementById('share_volume').value = data.settings.soundboard_share_volume;
      }
      if (data.settings.soundboard_like_sound) {
        document.getElementById('like_sound').value = data.settings.soundboard_like_sound;
      }
      if (data.settings.soundboard_like_volume) {
        document.getElementById('like_volume').value = data.settings.soundboard_like_volume;
      }
      if (data.settings.soundboard_like_threshold) {
        document.getElementById('like_threshold').value = data.settings.soundboard_like_threshold;
      }
      if (data.settings.soundboard_like_window_seconds) {
        document.getElementById('like_window_seconds').value = data.settings.soundboard_like_window_seconds;
      }
      if (data.settings.soundboard_default_gift_sound) {
        document.getElementById('default_gift_sound').value = data.settings.soundboard_default_gift_sound;
      }
      if (data.settings.soundboard_gift_volume) {
        document.getElementById('default_gift_volume').value = data.settings.soundboard_gift_volume;
      }
    }

    // Import gift sounds
    if (data.gifts && Array.isArray(data.gifts)) {
      for (const gift of data.gifts) {
        await apiCall('/api/soundboard/gifts', 'POST', gift);

        // Update local assignments
        if (gift.giftId) {
          assignments[gift.giftId] = {
            mp3_url: gift.mp3Url || '',
            label: gift.label || '',
            volume: gift.volume ?? 1.0,
            animation_url: gift.animationUrl || '',
            animation_type: gift.animationType || 'none'
          };
        }
      }

      // Refresh gift list
      renderGiftList();
    }

    showToast(`✅ Import erfolgreich! (${data.gifts?.length || 0} Gifts)`);

    // Reset file input
    e.target.value = '';
  } catch (error) {
    console.error('Import error:', error);
    showToast('❌ Import fehlgeschlagen: ' + error.message);
  }
};

document.getElementById('btnReset').onclick = () => {
  if (confirm('Nicht gespeicherte Änderungen verwerfen und neu laden?')) {
    location.reload();
  }
};

// ========== Theme Toggle ==========
document.getElementById('themeToggle').onclick = () => {
  document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
};

if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light-mode');
}

// ========== Load Settings on Start ==========
async function loadSettings() {
  const settings = await apiCall('/api/settings');

  document.getElementById('play_mode').value = settings.soundboard_play_mode || 'overlap';
  document.getElementById('queue_length').value = settings.soundboard_max_queue_length || 10;
  document.getElementById('follow_sound').value = settings.soundboard_follow_sound || '';
  document.getElementById('follow_volume').value = settings.soundboard_follow_volume || 1.0;
  document.getElementById('subscribe_sound').value = settings.soundboard_subscribe_sound || '';
  document.getElementById('subscribe_volume').value = settings.soundboard_subscribe_volume || 1.0;
  document.getElementById('share_sound').value = settings.soundboard_share_sound || '';
  document.getElementById('share_volume').value = settings.soundboard_share_volume || 1.0;
  document.getElementById('like_sound').value = settings.soundboard_like_sound || '';
  document.getElementById('like_volume').value = settings.soundboard_like_volume || 1.0;
  document.getElementById('like_threshold').value = settings.soundboard_like_threshold || 0;
  document.getElementById('like_window_seconds').value = settings.soundboard_like_window_seconds || 10;
  document.getElementById('default_gift_sound').value = settings.soundboard_default_gift_sound || '';
  document.getElementById('default_gift_volume').value = settings.soundboard_gift_volume || 1.0;
}

// ========== Initialize ==========
// Log browser capabilities and initialization
pushLog('🎵 TikTok LIVE Soundboard initialisiert');
pushLog(`🌐 Browser: ${navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : navigator.userAgent.includes('Safari') ? 'Safari' : 'Other'}`);
pushLog(`🔊 HTML5 Audio: ${typeof Audio !== 'undefined' ? 'Verfügbar' : 'Nicht verfügbar'}`);
pushLog(`🎛️ Web Audio API: ${(window.AudioContext || window.webkitAudioContext) ? 'Verfügbar' : 'Nicht verfügbar'}`);

console.log('🎵 [Soundboard] Initializing...');
console.log('🌐 [Soundboard] Browser:', navigator.userAgent);
console.log('🔊 [Soundboard] HTML5 Audio available:', typeof Audio !== 'undefined');
console.log('🎛️ [Soundboard] Web Audio API available:', !!(window.AudioContext || window.webkitAudioContext));

loadSettings();
loadCatalog();
startAutoSave(); // Enable auto-save every 30 seconds

// Check connection status and load username
apiCall('/api/status').then(data => {
  setStatus(data.isConnected);

  // Load current username into input field
  if (data.username) {
    document.getElementById('tiktok_user').value = data.username;
  }

  if (data.isConnected && data.username) {
    showToast(`Bereits verbunden mit @${data.username}`);
  }
});

// ========== Event Delegation for data-action buttons ==========
document.addEventListener('click', async function(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.dataset.action;
  
  switch(action) {
    case 'preview-sound':
      previewSound(button.dataset.soundId, button.dataset.volumeId, button.dataset.label);
      break;
    case 'open-picker':
      openPicker(button.dataset.target);
      break;
    case 'switch-tab':
      switchTab(button.dataset.tab);
      break;
    case 'close-picker':
      closePicker();
      break;
    case 'filter-category':
      filterByCategory(button.dataset.category);
      break;
    case 'preview-gift':
      previewGift(parseInt(button.dataset.giftId));
      break;
    case 'clear-gift':
      await clearGift(parseInt(button.dataset.giftId));
      break;
    case 'play-sound':
      playSound(button.dataset.url, 1.0, button.dataset.title);
      break;
    case 'assign-sound':
      assignToTarget(button.dataset.url);
      closePicker();
      break;
    case 'add-favorite':
      try {
        const tags = button.dataset.tags ? JSON.parse(button.dataset.tags.replace(/&quot;/g, '"')) : [];
        addToFavorites({
          name: button.dataset.name,
          url: button.dataset.url,
          description: button.dataset.description,
          tags: tags
        });
        renderFavorites();
      } catch (e) {
        console.error('Error adding to favorites:', e);
      }
      break;
    case 'remove-favorite':
      removeFromFavorites(button.dataset.url);
      renderFavorites();
      break;
  }
});

// Event delegation for change events
document.addEventListener('change', function(event) {
  const element = event.target.closest('[data-change-action]');
  if (!element) return;
  
  const action = element.dataset.changeAction;
  const giftId = parseInt(element.dataset.giftId);
  
  if (action === 'update-anim-type') {
    updateAssignment(giftId, 'animation_type', element.value);
  }
});

// Event delegation for drag and drop
const giftListContainer = document.getElementById('gift-sounds-list');
if (giftListContainer) {
  giftListContainer.addEventListener('dragover', function(event) {
    const input = event.target.closest('[data-gift-id]');
    if (input) {
      handleDragOver(event);
    }
  });
  
  giftListContainer.addEventListener('drop', function(event) {
    const input = event.target.closest('[data-gift-id]');
    if (input) {
      const giftId = parseInt(input.dataset.giftId);
      handleDrop(event, giftId);
    }
  });
}

// ========== Audio Debug Logging System ==========
function addAudioLog(message, type = 'info') {
  const log = document.getElementById('audio-debug-log');
  if (!log) return;
  
  const verboseLogging = document.getElementById('verbose-logging')?.checked;
  
  // Skip verbose messages if verbose logging is disabled
  if (type === 'verbose' && !verboseLogging) return;
  
  const timestamp = new Date().toLocaleTimeString();
  const icons = {
    info: '📘',
    success: '✅',
    error: '❌',
    warn: '⚠️',
    verbose: '🔍',
    play: '▶️',
    load: '📡',
    cache: '💾'
  };
  
  const colors = {
    info: '#60a5fa',
    success: '#10b981',
    error: '#ef4444',
    warn: '#f59e0b',
    verbose: '#94a3b8',
    play: '#8b5cf6',
    load: '#06b6d4',
    cache: '#a78bfa'
  };
  
  const icon = icons[type] || '•';
  const color = colors[type] || '#cbd5e1';
  
  const logEntry = document.createElement('div');
  logEntry.style.color = color;
  logEntry.style.marginBottom = '4px';
  logEntry.innerHTML = `<span style="color: #64748b;">[${timestamp}]</span> ${icon} ${message}`;
  
  log.appendChild(logEntry);
  log.scrollTop = log.scrollHeight;
  
  // Limit log entries to 100
  while (log.children.length > 100) {
    log.removeChild(log.firstChild);
  }
}

// Override pushLog to also add to audio debug log
const originalPushLog = window.pushLog || function() {};
window.pushLog = function(message) {
  originalPushLog(message);
  
  // Determine type from message content
  let type = 'info';
  if (message.includes('✅') || message.includes('bereit')) type = 'success';
  else if (message.includes('❌') || message.includes('Fehler')) type = 'error';
  else if (message.includes('⚠️') || message.includes('blockiert')) type = 'warn';
  else if (message.includes('▶️') || message.includes('Wiedergabe')) type = 'play';
  else if (message.includes('📡') || message.includes('Lade')) type = 'load';
  else if (message.includes('🔄') || message.includes('proxy')) type = 'cache';
  else if (message.includes('📋') || message.includes('📡')) type = 'verbose';
  
  addAudioLog(message, type);
};

// ========== Audio Status Updates ==========
function updateAudioStatus() {
  // Audio Context Status
  const ctx = getAudioContext();
  const ctxStatus = document.getElementById('audio-context-status');
  if (ctxStatus) {
    if (ctx) {
      ctxStatus.innerHTML = `<span style="color: #10b981;">${ctx.state}</span>`;
    } else {
      ctxStatus.innerHTML = `<span style="color: #ef4444;">Not Available</span>`;
    }
  }
  
  // Autoplay Status
  const autoplayStatus = document.getElementById('autoplay-status');
  if (autoplayStatus) {
    if (isAudioUnlocked()) {
      autoplayStatus.innerHTML = `<span style="color: #10b981;">Enabled</span>`;
    } else {
      autoplayStatus.innerHTML = `<span style="color: #f59e0b;">Locked</span>`;
    }
  }
  
  // Active Sounds Count
  const activeCount = document.getElementById('active-sounds-count');
  if (activeCount) {
    activeCount.textContent = activeAudio.length;
    activeCount.style.color = activeAudio.length > 0 ? '#10b981' : '#94a3b8';
  }
}

// Update status every second
setInterval(updateAudioStatus, 1000);
updateAudioStatus();

// ========== Audio Test Buttons ==========
document.getElementById('enable-audio-btn')?.addEventListener('click', async () => {
  addAudioLog('🔓 Enabling audio permissions...', 'info');
  
  try {
    unlockAudio();
    
    // Also try to create and start AudioContext
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
      addAudioLog('✅ AudioContext resumed successfully', 'success');
    }
    
    // Show test player
    const player = document.getElementById('audio-test-player');
    if (player) {
      player.style.display = 'block';
      addAudioLog('📻 Test audio player shown. Use controls to test playback.', 'info');
    }
    
    addAudioLog('✅ Audio permissions enabled', 'success');
    showToast('✅ Audio Permissions Enabled');
  } catch (error) {
    addAudioLog(`❌ Failed to enable audio: ${error.message}`, 'error');
    showToast('❌ Failed to enable audio permissions');
  }
});

document.getElementById('test-audio-btn')?.addEventListener('click', () => {
  addAudioLog('🧪 Testing audio playback...', 'info');
  
  const testUrl = 'https://www.myinstants.com/media/sounds/wow.mp3';
  addAudioLog(`📡 Test URL: ${testUrl}`, 'verbose');
  
  playSound(testUrl, 1.0, 'Audio Test');
});

document.getElementById('clear-audio-log-btn')?.addEventListener('click', () => {
  const log = document.getElementById('audio-debug-log');
  if (log) {
    log.innerHTML = '<div style="color: #60a5fa;">🎵 Audio log cleared.</div>';
  }
});

// Listen to test audio element events
const testAudio = document.getElementById('test-audio-element');
if (testAudio) {
  testAudio.addEventListener('loadstart', () => {
    addAudioLog('📡 Test audio: Loading started', 'load');
  });
  
  testAudio.addEventListener('loadeddata', () => {
    addAudioLog('✅ Test audio: Data loaded', 'success');
  });
  
  testAudio.addEventListener('canplay', () => {
    addAudioLog('✅ Test audio: Can play', 'success');
  });
  
  testAudio.addEventListener('playing', () => {
    addAudioLog('▶️ Test audio: Playing', 'play');
  });
  
  testAudio.addEventListener('pause', () => {
    addAudioLog('⏸️ Test audio: Paused', 'info');
  });
  
  testAudio.addEventListener('ended', () => {
    addAudioLog('⏹️ Test audio: Ended', 'info');
  });
  
  testAudio.addEventListener('error', (e) => {
    addAudioLog(`❌ Test audio error: ${testAudio.error?.message || 'Unknown error'}`, 'error');
  });
}

// Log initial audio capabilities
addAudioLog('🎵 Audio System Initialized', 'success');
addAudioLog(`🌐 Browser: ${navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Safari'}`, 'info');
addAudioLog(`📱 Platform: ${navigator.platform}`, 'verbose');
addAudioLog(`🔊 HTML5 Audio: ${typeof Audio !== 'undefined' ? 'Available' : 'Not available'}`, 'info');
addAudioLog(`🎛️ Web Audio API: ${(window.AudioContext || window.webkitAudioContext) ? 'Available' : 'Not available'}`, 'info');

