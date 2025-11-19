/**
 * New Soundboard Dashboard - Client JavaScript
 */

class SoundboardDashboard {
  constructor() {
    this.ws = null;
    this.apiKey = localStorage.getItem('sb_api_key') || '';
    this.init();
  }
  
  init() {
    this.setupTabs();
    this.setupWebSocket();
    this.setupEventListeners();
    this.loadLocalSounds();
  }
  
  setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        if (tabName === 'queue') {
          this.loadQueue();
        }
      });
    });
  }
  
  setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/new-soundboard`;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('[WS] Connected');
      
      // Send hello message
      this.ws.send(JSON.stringify({
        type: 'hello',
        client: 'dashboard',
        userId: 'admin'
      }));
    };
    
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('[WS] Failed to parse message:', error);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
    
    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      
      // Reconnect after 3 seconds
      setTimeout(() => {
        this.setupWebSocket();
      }, 3000);
    };
  }
  
  handleWebSocketMessage(message) {
    console.log('[WS] Message:', message);
    
    switch (message.type) {
      case 'welcome':
        console.log('[WS] Welcome:', message.message);
        break;
      
      case 'hello-ack':
        console.log('[WS] Registered as:', message.clientType);
        break;
      
      case 'preview':
        this.handlePreview(message.payload);
        break;
      
      case 'play-start':
        this.showAlert('Playing: ' + (message.meta.name || message.meta.filename), 'info');
        this.loadQueue();
        break;
      
      case 'error':
        this.showAlert(message.error, 'error');
        break;
    }
  }
  
  setupEventListeners() {
    // Search
    document.getElementById('search-btn').addEventListener('click', () => {
      this.searchMyInstants();
    });
    
    document.getElementById('search-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.searchMyInstants();
      }
    });
    
    // Upload
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    
    uploadArea.addEventListener('click', () => {
      fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadFile(e.target.files[0]);
      }
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      
      if (e.dataTransfer.files.length > 0) {
        this.uploadFile(e.dataTransfer.files[0]);
      }
    });
  }
  
  async searchMyInstants() {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput.value.trim();
    
    if (!searchTerm) {
      return;
    }
    
    try {
      const response = await fetch(`/api/new-soundboard/search?q=${encodeURIComponent(searchTerm)}`, {
        headers: {
          'x-sb-key': this.apiKey
        }
      });
      
      if (!response.ok) {
        throw new Error('Search failed');
      }
      
      // For now, we'll use the MyInstants adapter directly via the server
      // This is a placeholder - actual implementation would need a search endpoint
      this.showAlert('Search endpoint not yet implemented. Use preview with known IDs.', 'info');
      
    } catch (error) {
      this.showAlert('Search failed: ' + error.message, 'error');
    }
  }
  
  async previewMyInstants(id) {
    try {
      const response = await fetch('/api/new-soundboard/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sb-key': this.apiKey
        },
        body: JSON.stringify({
          sourceType: 'myinstants',
          id: id
        })
      });
      
      if (!response.ok) {
        throw new Error('Preview failed');
      }
      
      const data = await response.json();
      console.log('[Preview] Response:', data);
      
    } catch (error) {
      this.showAlert('Preview failed: ' + error.message, 'error');
    }
  }
  
  handlePreview(payload) {
    const player = document.getElementById('preview-player');
    const content = document.getElementById('preview-content');
    
    player.classList.add('active');
    content.innerHTML = '';
    
    const title = document.createElement('h4');
    title.textContent = payload.name || payload.filename || 'Unknown';
    content.appendChild(title);
    
    if (payload.embedFallback) {
      // Use iframe fallback
      const info = document.createElement('p');
      info.textContent = 'This sound requires iframe embedding due to CORS restrictions.';
      content.appendChild(info);
      
      const iframe = document.createElement('iframe');
      iframe.src = payload.instantUrl;
      iframe.sandbox = 'allow-scripts allow-same-origin';
      iframe.referrerPolicy = 'no-referrer';
      content.appendChild(iframe);
    } else {
      // Use audio element
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = payload.url;
      content.appendChild(audio);
      audio.play().catch(err => {
        console.warn('[Preview] Autoplay blocked:', err);
      });
    }
    
    // Add play button
    const playBtn = document.createElement('button');
    playBtn.textContent = 'Add to Queue';
    playBtn.style.marginTop = '10px';
    playBtn.addEventListener('click', () => {
      this.playSound(payload);
    });
    content.appendChild(playBtn);
  }
  
  async playSound(payload) {
    try {
      const body = {
        sourceType: payload.sourceType,
        userId: 'admin'
      };
      
      if (payload.sourceType === 'myinstants') {
        body.id = payload.instantsId;
      } else if (payload.sourceType === 'local') {
        body.filename = payload.filename;
      } else if (payload.sourceType === 'url') {
        body.url = payload.url;
      }
      
      const response = await fetch('/api/new-soundboard/play', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sb-key': this.apiKey
        },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Play failed');
      }
      
      const data = await response.json();
      this.showAlert('Added to queue: ' + data.jobId, 'success');
      
    } catch (error) {
      this.showAlert('Play failed: ' + error.message, 'error');
    }
  }
  
  async loadLocalSounds() {
    try {
      const response = await fetch('/api/new-soundboard/list', {
        headers: {
          'x-sb-key': this.apiKey
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load sounds');
      }
      
      const data = await response.json();
      this.renderLocalSounds(data.sounds || []);
      
    } catch (error) {
      console.error('[Local] Failed to load sounds:', error);
    }
  }
  
  renderLocalSounds(sounds) {
    const container = document.getElementById('local-sounds');
    container.innerHTML = '';
    
    if (sounds.length === 0) {
      container.innerHTML = '<p>No local sounds found. Upload some files!</p>';
      return;
    }
    
    sounds.forEach(sound => {
      const item = document.createElement('div');
      item.className = 'sound-item';
      
      const info = document.createElement('div');
      info.className = 'sound-info';
      
      const name = document.createElement('div');
      name.className = 'sound-name';
      name.textContent = sound.filename;
      
      const meta = document.createElement('div');
      meta.className = 'sound-meta';
      meta.textContent = `${(sound.size / 1024).toFixed(2)} KB`;
      
      info.appendChild(name);
      info.appendChild(meta);
      
      const actions = document.createElement('div');
      actions.className = 'sound-actions';
      
      const previewBtn = document.createElement('button');
      previewBtn.className = 'btn-small';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', () => {
        this.previewLocal(sound.filename);
      });
      
      const playBtn = document.createElement('button');
      playBtn.className = 'btn-small';
      playBtn.textContent = 'Play';
      playBtn.addEventListener('click', () => {
        this.playSound({ sourceType: 'local', filename: sound.filename });
      });
      
      actions.appendChild(previewBtn);
      actions.appendChild(playBtn);
      
      item.appendChild(info);
      item.appendChild(actions);
      
      container.appendChild(item);
    });
  }
  
  async previewLocal(filename) {
    try {
      const response = await fetch('/api/new-soundboard/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sb-key': this.apiKey
        },
        body: JSON.stringify({
          sourceType: 'local',
          filename: filename
        })
      });
      
      if (!response.ok) {
        throw new Error('Preview failed');
      }
      
    } catch (error) {
      this.showAlert('Preview failed: ' + error.message, 'error');
    }
  }
  
  async uploadFile(file) {
    const progressDiv = document.getElementById('upload-progress');
    progressDiv.style.display = 'block';
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/new-soundboard/upload', {
        method: 'POST',
        headers: {
          'x-sb-key': this.apiKey
        },
        body: formData
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      const data = await response.json();
      this.showAlert('File uploaded: ' + data.file.filename, 'success');
      this.loadLocalSounds();
      
    } catch (error) {
      this.showAlert('Upload failed: ' + error.message, 'error');
    } finally {
      progressDiv.style.display = 'none';
    }
  }
  
  async loadQueue() {
    try {
      const response = await fetch('/api/new-soundboard/metrics', {
        headers: {
          'x-sb-key': this.apiKey
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load queue');
      }
      
      const data = await response.json();
      this.renderQueue(data.metrics.queue);
      
    } catch (error) {
      console.error('[Queue] Failed to load:', error);
    }
  }
  
  renderQueue(queueStats) {
    const container = document.getElementById('queue-list');
    container.innerHTML = '';
    
    const stats = document.createElement('div');
    stats.innerHTML = `
      <p><strong>Queue Size:</strong> ${queueStats.queueSize}</p>
      <p><strong>Active Jobs:</strong> ${queueStats.activeJobs}</p>
      <p><strong>Total Processed:</strong> ${queueStats.totalProcessed}</p>
      <p><strong>Failed:</strong> ${queueStats.totalFailed}</p>
    `;
    container.appendChild(stats);
  }
  
  showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    alert.textContent = message;
    
    document.querySelector('.container').insertBefore(alert, document.querySelector('.tabs'));
    
    setTimeout(() => {
      alert.remove();
    }, 5000);
  }
}

// Initialize dashboard when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SoundboardDashboard();
  });
} else {
  new SoundboardDashboard();
}
