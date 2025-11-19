/**
 * New Soundboard Overlay - Client JavaScript
 */

class SoundboardOverlay {
  constructor() {
    this.ws = null;
    this.audioPlayer = document.getElementById('audio-player');
    this.widgetsContainer = document.getElementById('sound-widgets');
    this.activeWidgets = new Map();
    this.init();
  }
  
  init() {
    this.setupWebSocket();
    this.setupAudioPlayer();
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
        client: 'overlay'
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
  
  setupAudioPlayer() {
    this.audioPlayer.addEventListener('ended', () => {
      console.log('[Audio] Playback ended');
      this.sendPlayEndMessage();
    });
    
    this.audioPlayer.addEventListener('error', (e) => {
      console.error('[Audio] Playback error:', e);
      this.sendPlayEndMessage();
    });
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
      
      case 'play-start':
        this.handlePlayStart(message.meta);
        break;
      
      case 'play-end':
        this.handlePlayEnd(message.meta);
        break;
    }
  }
  
  handlePlayStart(meta) {
    console.log('[Play] Start:', meta);
    
    const { jobId, sourceType, embedFallback } = meta;
    
    // Show widget
    this.showWidget(meta);
    
    if (embedFallback) {
      // Use iframe fallback
      this.playWithIframe(meta);
    } else {
      // Use HTML5 audio
      this.playWithAudio(meta);
    }
  }
  
  handlePlayEnd(meta) {
    console.log('[Play] End:', meta);
    
    const { jobId } = meta;
    
    // Hide widget
    this.hideWidget(jobId);
  }
  
  playWithAudio(meta) {
    const { url, volume = 100, fadeIn = 0 } = meta;
    
    if (!url) {
      console.error('[Play] No URL provided');
      return;
    }
    
    this.audioPlayer.src = url;
    this.audioPlayer.volume = volume / 100;
    
    // Apply fade-in if specified
    if (fadeIn > 0) {
      this.audioPlayer.volume = 0;
      const fadeStep = (volume / 100) / (fadeIn / 100);
      const fadeInterval = setInterval(() => {
        if (this.audioPlayer.volume < volume / 100) {
          this.audioPlayer.volume = Math.min(this.audioPlayer.volume + fadeStep, volume / 100);
        } else {
          clearInterval(fadeInterval);
        }
      }, 100);
    }
    
    this.audioPlayer.play().catch(err => {
      console.error('[Play] Failed to play:', err);
      this.sendPlayEndMessage();
    });
  }
  
  playWithIframe(meta) {
    const { instantUrl, instantsId, name } = meta;
    
    if (!instantUrl) {
      console.error('[Play] No instant URL provided for iframe fallback');
      return;
    }
    
    // Create iframe container
    const container = document.createElement('div');
    container.className = 'fallback-iframe';
    container.id = `iframe-${meta.jobId}`;
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'fallback-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
      this.closeFallbackIframe(meta.jobId);
    });
    container.appendChild(closeBtn);
    
    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.src = instantUrl;
    iframe.sandbox = 'allow-scripts allow-same-origin';
    iframe.referrerPolicy = 'no-referrer';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    container.appendChild(iframe);
    
    document.body.appendChild(container);
    
    // Show with animation
    setTimeout(() => {
      container.classList.add('show');
    }, 10);
    
    // Auto-close after 30 seconds
    setTimeout(() => {
      this.closeFallbackIframe(meta.jobId);
    }, 30000);
  }
  
  closeFallbackIframe(jobId) {
    const iframe = document.getElementById(`iframe-${jobId}`);
    if (iframe) {
      iframe.classList.remove('show');
      setTimeout(() => {
        iframe.remove();
      }, 300);
    }
    
    this.sendPlayEndMessage(jobId);
  }
  
  showWidget(meta) {
    const { jobId, name, filename, userId } = meta;
    
    const widget = document.createElement('div');
    widget.className = 'sound-widget';
    widget.id = `widget-${jobId}`;
    
    const icon = document.createElement('div');
    icon.className = 'sound-icon';
    icon.textContent = '🎵';
    widget.appendChild(icon);
    
    const title = document.createElement('div');
    title.className = 'sound-title';
    title.textContent = name || filename || 'Unknown Sound';
    widget.appendChild(title);
    
    if (userId) {
      const user = document.createElement('div');
      user.className = 'sound-user';
      user.textContent = `Triggered by: ${userId}`;
      widget.appendChild(user);
    }
    
    const progress = document.createElement('div');
    progress.className = 'sound-progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'sound-progress-bar';
    progress.appendChild(progressBar);
    widget.appendChild(progress);
    
    this.widgetsContainer.appendChild(widget);
    this.activeWidgets.set(jobId, widget);
    
    // Show with animation
    setTimeout(() => {
      widget.classList.add('show');
    }, 10);
    
    // Animate progress bar
    this.animateProgress(jobId, meta.duration || 5000);
    
    // Auto-hide after duration
    setTimeout(() => {
      this.hideWidget(jobId);
    }, (meta.duration || 5000) + 1000);
  }
  
  animateProgress(jobId, duration) {
    const widget = this.activeWidgets.get(jobId);
    if (!widget) return;
    
    const progressBar = widget.querySelector('.sound-progress-bar');
    if (!progressBar) return;
    
    let elapsed = 0;
    const interval = 100;
    
    const timer = setInterval(() => {
      elapsed += interval;
      const progress = Math.min((elapsed / duration) * 100, 100);
      progressBar.style.width = `${progress}%`;
      
      if (elapsed >= duration) {
        clearInterval(timer);
      }
    }, interval);
  }
  
  hideWidget(jobId) {
    const widget = this.activeWidgets.get(jobId);
    if (widget) {
      widget.classList.remove('show');
      setTimeout(() => {
        widget.remove();
        this.activeWidgets.delete(jobId);
      }, 300);
    }
  }
  
  sendPlayEndMessage(jobId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'play-end',
        jobId: jobId
      }));
    }
  }
}

// Initialize overlay when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SoundboardOverlay();
  });
} else {
  new SoundboardOverlay();
}
