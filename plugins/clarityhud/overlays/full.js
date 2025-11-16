/**
 * ClarityHUD - Full Overlay
 */

// ==================== STATE MANAGEMENT ====================
const STATE = {
  settings: {},
  events: {
    chat: [],
    follow: [],
    share: [],
    gift: [],
    sub: [],
    treasure: [],
    join: []
  },
  layoutEngine: null,
  animationRegistry: null,
  animationRenderer: null,
  socket: null,
  container: null,
  isInitialized: false
};

// Event type configuration
const EVENT_TYPES = {
  chat: { icon: '💬', label: 'Chat', colorClass: 'event-chat' },
  follow: { icon: '❤️', label: 'Followed', colorClass: 'event-follow' },
  share: { icon: '🔄', label: 'Shared', colorClass: 'event-share' },
  gift: { icon: '🎁', label: 'Gift', colorClass: 'event-gift' },
  sub: { icon: '⭐', label: 'Subscribed', colorClass: 'event-sub' },
  treasure: { icon: '💎', label: 'Treasure', colorClass: 'event-treasure' },
  join: { icon: '👋', label: 'Joined', colorClass: 'event-join' }
};

// ==================== INITIALIZATION ====================
async function init() {
  console.log('Initializing ClarityHUD Full Overlay...');

  STATE.container = document.getElementById('overlay-container');

  // Initialize animation system
  STATE.animationRegistry = new AnimationRegistry();
  STATE.animationRenderer = new AnimationRenderer(STATE.animationRegistry);

  // Load settings
  await loadSettings();

  // Initialize layout engine
  STATE.layoutEngine = new LayoutEngine(STATE.container, STATE.settings);

  // Connect to socket
  connectSocket();

  // Apply initial render
  render();

  STATE.isInitialized = true;
  console.log('ClarityHUD Full Overlay initialized successfully');
}

// ==================== SETTINGS ====================
async function loadSettings() {
  try {
    const response = await fetch('/api/clarityhud/settings/full');
    const data = await response.json();

    if (data.success && data.settings) {
      STATE.settings = data.settings;
      applySettings();
    } else {
      // Use defaults
      STATE.settings = getDefaultSettings();
      applySettings();
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    STATE.settings = getDefaultSettings();
    applySettings();
  }
}

function getDefaultSettings() {
  return {
    // Event toggles
    showChat: true,
    showFollows: true,
    showShares: true,
    showGifts: true,
    showSubs: true,
    showTreasureChests: true,
    showJoins: true,

    // Layout
    layoutMode: 'singleStream',
    feedDirection: 'top',
    maxLines: 50,

    // Styling
    fontSize: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    textColor: '#ffffff',

    // Animations
    animationIn: 'fade',
    animationOut: 'fade',
    animationSpeed: 'medium',

    // Accessibility
    nightMode: true,
    dayMode: false,
    highContrastMode: false,
    colorblindSafeMode: false,
    visionImpairedMode: false,
    reduceMotion: false,
    dyslexiaFont: false,
    accessibilityPreset: 'none'
  };
}

function applySettings() {
  const s = STATE.settings;
  const root = document.documentElement;
  const body = document.body;

  // Apply accessibility preset first
  if (s.accessibilityPreset && s.accessibilityPreset !== 'none') {
    applyAccessibilityPreset(s.accessibilityPreset);
  } else {
    // Apply individual accessibility settings
    body.classList.toggle('night-mode', s.nightMode);
    body.classList.toggle('day-mode', s.dayMode);
    body.classList.toggle('high-contrast', s.highContrastMode);
    body.classList.toggle('colorblind-safe', s.colorblindSafeMode);
    body.classList.toggle('vision-impaired', s.visionImpairedMode);
    body.classList.toggle('reduce-motion', s.reduceMotion);
    body.classList.toggle('dyslexia-font', s.dyslexiaFont);
  }

  // Apply style settings
  if (s.fontSize) {
    root.style.setProperty('--font-size', `${s.fontSize}px`);
  }
  if (s.backgroundColor) {
    root.style.setProperty('--bg-color', s.backgroundColor);
  }
  if (s.textColor) {
    root.style.setProperty('--text-color', s.textColor);
  }

  console.log('Settings applied:', s);
}

function applyAccessibilityPreset(preset) {
  const body = document.body;

  // Clear all accessibility classes
  body.classList.remove('night-mode', 'day-mode', 'high-contrast',
                       'colorblind-safe', 'vision-impaired', 'reduce-motion', 'dyslexia-font');

  switch (preset) {
    case 'vr-optimized':
      body.classList.add('night-mode', 'vision-impaired');
      STATE.settings.fontSize = 24;
      break;
    case 'low-vision':
      body.classList.add('high-contrast', 'vision-impaired', 'dyslexia-font');
      STATE.settings.fontSize = 28;
      break;
    case 'colorblind':
      body.classList.add('colorblind-safe', 'night-mode');
      break;
    case 'motion-sensitive':
      body.classList.add('reduce-motion', 'night-mode');
      STATE.settings.animationIn = 'none';
      STATE.settings.animationOut = 'none';
      break;
    case 'dyslexia':
      body.classList.add('dyslexia-font', 'night-mode');
      STATE.settings.fontSize = 20;
      break;
  }
}

// ==================== SOCKET CONNECTION ====================
function connectSocket() {
  STATE.socket = io();

  STATE.socket.on('connect', () => {
    console.log('Connected to server');
  });

  STATE.socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });

  // Listen for settings updates
  STATE.socket.on('clarityhud.settings.full', (newSettings) => {
    console.log('Received settings update:', newSettings);
    STATE.settings = newSettings;
    applySettings();
    if (STATE.layoutEngine) {
      STATE.layoutEngine.updateSettings(STATE.settings);
    }
    render();
  });

  // Listen for event updates
  STATE.socket.on('clarityhud.update.chat', (data) => {
    if (STATE.settings.showChat) {
      addEvent('chat', data);
    }
  });

  STATE.socket.on('clarityhud.update.follow', (data) => {
    if (STATE.settings.showFollows) {
      addEvent('follow', data);
    }
  });

  STATE.socket.on('clarityhud.update.share', (data) => {
    if (STATE.settings.showShares) {
      addEvent('share', data);
    }
  });

  STATE.socket.on('clarityhud.update.gift', (data) => {
    if (STATE.settings.showGifts) {
      addEvent('gift', data);
    }
  });

  STATE.socket.on('clarityhud.update.subscribe', (data) => {
    if (STATE.settings.showSubs) {
      addEvent('sub', data);
    }
  });

  STATE.socket.on('clarityhud.update.treasure', (data) => {
    if (STATE.settings.showTreasureChests) {
      addEvent('treasure', data);
    }
  });

  STATE.socket.on('clarityhud.update.join', (data) => {
    if (STATE.settings.showJoins) {
      addEvent('join', data);
    }
  });
}

// ==================== EVENT MANAGEMENT ====================
function addEvent(type, data) {
  const event = {
    type,
    data,
    timestamp: Date.now(),
    id: `${type}_${Date.now()}_${Math.random()}`
  };

  STATE.events[type].unshift(event);

  // Enforce max lines per type
  const maxLines = STATE.settings.maxLines || 50;
  if (STATE.events[type].length > maxLines) {
    STATE.events[type] = STATE.events[type].slice(0, maxLines);
  }

  // Trigger render
  renderEvent(event);
}

// ==================== RENDERING ====================
function render() {
  const mode = STATE.settings.layoutMode || 'singleStream';

  // Clear container
  STATE.container.innerHTML = '';
  STATE.container.className = `layout-${mode}`;

  if (STATE.settings.feedDirection === 'top') {
    STATE.container.classList.add('feed-direction-top');
  }

  if (mode === 'singleStream') {
    renderSingleStream();
  } else if (mode === 'structured') {
    renderStructured();
  } else if (mode === 'adaptive') {
    renderAdaptive();
  }
}

function renderSingleStream() {
  const feedContainer = document.createElement('div');
  feedContainer.className = 'feed-container';
  STATE.container.appendChild(feedContainer);

  // Combine all events into single feed
  const allEvents = [];
  for (const type in STATE.events) {
    if (STATE.settings[`show${capitalize(type === 'sub' ? 'subs' : type === 'treasure' ? 'treasureChests' : type + 's')}`]) {
      allEvents.push(...STATE.events[type]);
    }
  }

  // Sort by timestamp (newest first or last based on feedDirection)
  allEvents.sort((a, b) => {
    return STATE.settings.feedDirection === 'top' ?
      b.timestamp - a.timestamp :
      a.timestamp - b.timestamp;
  });

  // Render events
  allEvents.slice(0, STATE.settings.maxLines || 50).forEach(event => {
    const element = createEventElement(event, 'singleStream');
    feedContainer.appendChild(element);
    animateElement(element, 'in', true);
  });
}

function renderStructured() {
  const eventTypes = ['chat', 'follow', 'share', 'gift', 'sub', 'treasure', 'join'];

  eventTypes.forEach(type => {
    const settingKey = `show${capitalize(type === 'sub' ? 'subs' : type === 'treasure' ? 'treasureChests' : type + 's')}`;
    if (!STATE.settings[settingKey]) return;

    const block = document.createElement('div');
    block.className = 'event-block';

    const header = document.createElement('div');
    header.className = `block-header ${EVENT_TYPES[type].colorClass}`;
    header.textContent = `${EVENT_TYPES[type].icon} ${EVENT_TYPES[type].label}`;
    block.appendChild(header);

    const content = document.createElement('div');
    content.className = 'block-content';
    content.dataset.type = type;
    block.appendChild(content);

    // Add events
    STATE.events[type].forEach(event => {
      const element = createEventElement(event, 'structured');
      content.appendChild(element);
      animateElement(element, 'in', true);
    });

    STATE.container.appendChild(block);
  });
}

function renderAdaptive() {
  const eventTypes = ['chat', 'follow', 'share', 'gift', 'sub', 'treasure', 'join'];
  const activeTypes = eventTypes.filter(type => {
    const settingKey = `show${capitalize(type === 'sub' ? 'subs' : type === 'treasure' ? 'treasureChests' : type + 's')}`;
    return STATE.settings[settingKey] && STATE.events[type].length > 0;
  });

  // Determine flex class based on number of active types
  let flexClass = 'flex-1';
  if (activeTypes.length === 2) {
    flexClass = 'flex-2';
  } else if (activeTypes.length >= 3) {
    flexClass = 'flex-3';
  }

  activeTypes.forEach(type => {
    const block = document.createElement('div');
    block.className = `event-block ${flexClass}`;

    const header = document.createElement('div');
    header.className = `block-header ${EVENT_TYPES[type].colorClass}`;
    header.textContent = `${EVENT_TYPES[type].icon} ${EVENT_TYPES[type].label}`;
    block.appendChild(header);

    const content = document.createElement('div');
    content.className = 'block-content';
    content.dataset.type = type;
    block.appendChild(content);

    // Add events
    const maxEventsPerBlock = Math.floor((STATE.settings.maxLines || 50) / Math.max(activeTypes.length, 1));
    STATE.events[type].slice(0, maxEventsPerBlock).forEach(event => {
      const element = createEventElement(event, 'adaptive');
      content.appendChild(element);
      animateElement(element, 'in', true);
    });

    STATE.container.appendChild(block);
  });
}

function renderEvent(event) {
  const mode = STATE.settings.layoutMode || 'singleStream';

  if (mode === 'singleStream') {
    // Add to feed
    const feedContainer = STATE.container.querySelector('.feed-container');
    if (feedContainer) {
      const element = createEventElement(event, mode);

      if (STATE.settings.feedDirection === 'top') {
        feedContainer.insertBefore(element, feedContainer.firstChild);
      } else {
        feedContainer.appendChild(element);
      }

      animateElement(element, 'in');

      // Remove old events if exceeding max
      const allItems = feedContainer.querySelectorAll('.event-item');
      if (allItems.length > (STATE.settings.maxLines || 50)) {
        const toRemove = allItems[STATE.settings.feedDirection === 'top' ? allItems.length - 1 : 0];
        animateElement(toRemove, 'out').then(() => {
          toRemove.remove();
        });
      }
    }
  } else {
    // Find the appropriate block
    const blockContent = STATE.container.querySelector(`.block-content[data-type="${event.type}"]`);
    if (blockContent) {
      const element = createEventElement(event, mode);
      blockContent.insertBefore(element, blockContent.firstChild);
      animateElement(element, 'in');

      // Remove old events if exceeding max
      const items = blockContent.querySelectorAll('.event-item');
      const maxPerBlock = mode === 'adaptive' ?
        Math.floor((STATE.settings.maxLines || 50) / Math.max(getActiveTypeCount(), 1)) :
        (STATE.settings.maxLines || 50);

      if (items.length > maxPerBlock) {
        const toRemove = items[items.length - 1];
        animateElement(toRemove, 'out').then(() => {
          toRemove.remove();
        });
      }
    }
  }
}

function createEventElement(event, layoutMode) {
  const element = document.createElement('div');
  element.className = `event-item ${EVENT_TYPES[event.type].colorClass}`;
  element.dataset.eventId = event.id;

  // Icon
  const icon = document.createElement('span');
  icon.className = 'event-icon';
  icon.textContent = EVENT_TYPES[event.type].icon;
  element.appendChild(icon);

  // Content varies by event type
  if (event.type === 'chat') {
    const username = document.createElement('span');
    username.className = 'event-username';
    username.textContent = event.data.user?.nickname || event.data.username || 'Anonymous';
    element.appendChild(username);

    if (layoutMode === 'singleStream') {
      const type = document.createElement('span');
      type.className = 'event-type';
      type.textContent = `(${EVENT_TYPES[event.type].label})`;
      element.appendChild(type);
    }

    const message = document.createElement('span');
    message.className = 'event-message';
    message.textContent = event.data.message || '';
    element.appendChild(message);
  } else if (event.type === 'gift') {
    const username = document.createElement('span');
    username.className = 'event-username';
    username.textContent = event.data.user?.nickname || event.data.username || 'Anonymous';
    element.appendChild(username);

    if (layoutMode === 'singleStream') {
      const type = document.createElement('span');
      type.className = 'event-type';
      type.textContent = `(${EVENT_TYPES[event.type].label})`;
      element.appendChild(type);
    }

    const giftInfo = document.createElement('span');
    giftInfo.className = 'event-gift-info';
    giftInfo.textContent = event.data.gift?.name || event.data.giftName ?
      `${event.data.gift?.name || event.data.giftName}${event.data.gift?.coins || event.data.coins ? ` (${event.data.gift?.coins || event.data.coins} coins)` : ''}` :
      (event.data.gift?.coins || event.data.coins ? `${event.data.gift?.coins || event.data.coins} coins` : 'sent a gift');
    element.appendChild(giftInfo);
  } else {
    // Standard event (follow, share, sub, treasure, join)
    const username = document.createElement('span');
    username.className = 'event-username';
    username.textContent = event.data.user?.nickname || event.data.username || 'Anonymous';
    element.appendChild(username);

    if (layoutMode === 'singleStream') {
      const type = document.createElement('span');
      type.className = 'event-type';
      type.textContent = `(${EVENT_TYPES[event.type].label})`;
      element.appendChild(type);
    }
  }

  return element;
}

function animateElement(element, direction, skipAnimation = false) {
  if (!element || !STATE.animationRenderer) {
    return Promise.resolve();
  }

  if (skipAnimation || STATE.settings.reduceMotion || STATE.settings.animationIn === 'none') {
    element.style.opacity = '1';
    return Promise.resolve();
  }

  const animationType = direction === 'in' ?
    (STATE.settings.animationIn || 'fade') :
    (STATE.settings.animationOut || 'fade');

  const speed = STATE.settings.animationSpeed || 'medium';

  if (direction === 'in') {
    return STATE.animationRenderer.animateIn(element, animationType, speed);
  } else {
    return STATE.animationRenderer.animateOut(element, animationType, speed);
  }
}

// ==================== UTILITY FUNCTIONS ====================
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getActiveTypeCount() {
  const eventTypes = ['chat', 'follow', 'share', 'gift', 'sub', 'treasure', 'join'];
  return eventTypes.filter(type => {
    const settingKey = `show${capitalize(type === 'sub' ? 'subs' : type === 'treasure' ? 'treasureChests' : type + 's')}`;
    return STATE.settings[settingKey] && STATE.events[type].length > 0;
  }).length;
}

// ==================== INITIALIZE ON LOAD ====================
window.addEventListener('DOMContentLoaded', init);
