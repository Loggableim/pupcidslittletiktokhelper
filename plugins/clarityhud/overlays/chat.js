/**
 * ClarityHUD - Chat Overlay
 * 
 * Enhanced with:
 * - Transparency support (0-100%)
 * - Full emoji support (TikTok emotes + Unicode)
 * - Badge system (Moderator, Subscriber, Team Level, etc.)
 * - Robust message parsing
 * - Virtual scrolling for performance
 * - Color engine based on team levels
 */

// ==================== STATE MANAGEMENT ====================
const STATE = {
  settings: {
    fontSize: '48px',
    lineHeight: 1.6,
    letterSpacing: '0.5px',
    maxMessages: 10,
    showTimestamps: false,
    textAlign: 'left',
    animationType: 'slide',
    animationSpeed: 'medium',
    reduceMotion: false,
    opacity: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    // New settings
    transparency: 100, // 0-100%
    emojiRenderMode: 'image', // 'image' or 'unicode'
    badgeSize: 'medium',
    teamLevelStyle: 'icon-glow',
    showTeamLevel: true,
    showModerator: true,
    showSubscriber: true,
    showGifter: true,
    showFanClub: true,
    useVirtualScrolling: true,
    usernameColorByTeamLevel: true
  },
  messages: [],
  socket: null,
  animationRegistry: null,
  animationRenderer: null,
  accessibilityManager: null,
  emojiParser: null,
  badgeRenderer: null,
  messageParser: null,
  virtualScroller: null,
  messagesContainer: null
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  STATE.messagesContainer = document.getElementById('messages');
  
  // Initialize systems
  initializeSystems();
  
  // Connect to socket
  connectSocket();
  
  // Detect system preference for reduced motion
  detectSystemPreferences();
});

/**
 * Initialize all subsystems
 */
function initializeSystems() {
  // Animation system
  STATE.animationRegistry = new AnimationRegistry();
  STATE.animationRenderer = new AnimationRenderer(STATE.animationRegistry);
  
  // Accessibility manager
  STATE.accessibilityManager = new AccessibilityManager(document.body);
  
  // Emoji parser
  STATE.emojiParser = new EmojiParser();
  
  // Badge renderer
  STATE.badgeRenderer = new BadgeRenderer(STATE.settings);
  
  // Message parser
  STATE.messageParser = new MessageParser();
  
  console.log('Chat overlay systems initialized');
}

/**
 * Connect to Socket.IO
 */
function connectSocket() {
  STATE.socket = io();
  
  STATE.socket.on('connect', () => {
    console.log('Connected to server');
    init();
  });
  
  STATE.socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
  
  // Listen for chat updates
  STATE.socket.on('clarityhud.update.chat', (chatData) => {
    console.log('Received chat update:', chatData);
    addMessage(chatData);
  });
  
  // Listen for settings updates
  STATE.socket.on('clarityhud.settings.chat', (newSettings) => {
    console.log('Received settings update:', newSettings);
    applySettings(newSettings);
  });
}

/**
 * Detect system preferences
 */
function detectSystemPreferences() {
  if (!window.matchMedia) return;

  // Detect reduced motion preference
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motionQuery.matches && !STATE.settings.reduceMotion) {
    STATE.settings.reduceMotion = true;
    if (STATE.animationRenderer) {
      STATE.animationRenderer.setReduceMotion(true);
    }
    document.body.classList.add('reduce-motion');
  }
  
  // Listen for changes
  motionQuery.addEventListener('change', (e) => {
    if (!STATE.settings.reduceMotion) {
      const shouldReduce = e.matches;
      if (STATE.animationRenderer) {
        STATE.animationRenderer.setReduceMotion(shouldReduce);
      }
      document.body.classList.toggle('reduce-motion', shouldReduce);
    }
  });
}

// ==================== INITIALIZATION ====================
async function init() {
  try {
    // Load settings
    const settingsResponse = await fetch('/api/clarityhud/settings/chat');
    const settingsData = await settingsResponse.json();

    if (settingsData.success && settingsData.settings) {
      applySettings(settingsData.settings);
    }

    // Initialize virtual scrolling if enabled
    if (STATE.settings.useVirtualScrolling) {
      initializeVirtualScrolling();
    }

    console.log('Chat overlay initialized');
  } catch (error) {
    console.error('Error initializing overlay:', error);
  }
}

/**
 * Initialize virtual scrolling
 */
function initializeVirtualScrolling() {
  if (STATE.virtualScroller) {
    STATE.virtualScroller.destroy();
  }

  const container = document.getElementById('chat-container');
  
  STATE.virtualScroller = new VirtualScroller(container, {
    itemHeight: parseInt(STATE.settings.fontSize) * STATE.settings.lineHeight * 2.5,
    maxItems: STATE.settings.maxMessages * 2, // Keep double for smooth scrolling
    renderCallback: renderMessageElement
  });

  // Replace messages container with virtual scroller
  STATE.messagesContainer.style.display = 'none';
}

// ==================== SETTINGS ====================
function applySettings(newSettings) {
  STATE.settings = { ...STATE.settings, ...newSettings };

  // Apply CSS custom properties
  const root = document.documentElement;

  if (STATE.settings.fontSize) {
    root.style.setProperty('--chat-font-size', STATE.settings.fontSize);
  }

  if (STATE.settings.lineHeight) {
    root.style.setProperty('--chat-line-height', STATE.settings.lineHeight);
  }

  if (STATE.settings.letterSpacing) {
    root.style.setProperty('--chat-letter-spacing', STATE.settings.letterSpacing);
  }

  if (STATE.settings.textAlign) {
    root.style.setProperty('--chat-alignment', STATE.settings.textAlign);
    document.body.classList.toggle('align-center', STATE.settings.textAlign === 'center');
  }

  // Apply transparency (converts 0-100% to 0-1)
  if (typeof STATE.settings.transparency !== 'undefined') {
    const opacity = STATE.settings.transparency / 100;
    root.style.setProperty('--chat-opacity', opacity);
    
    // Also apply to background opacity if backgroundColor is rgba
    if (STATE.settings.backgroundColor) {
      const bgOpacity = opacity;
      root.style.setProperty('--chat-background-opacity', bgOpacity);
    }
  }

  // Legacy opacity support
  if (typeof STATE.settings.opacity !== 'undefined' && typeof STATE.settings.transparency === 'undefined') {
    root.style.setProperty('--chat-opacity', STATE.settings.opacity);
  }

  if (STATE.settings.backgroundColor) {
    root.style.setProperty('--chat-bg-color', STATE.settings.backgroundColor);
  }

  if (STATE.settings.textColor) {
    root.style.setProperty('--chat-text-color', STATE.settings.textColor);
  }

  if (STATE.settings.userNameColor) {
    root.style.setProperty('--chat-username-color', STATE.settings.userNameColor);
  }

  if (STATE.settings.textOutline) {
    root.style.setProperty('--chat-text-outline', STATE.settings.textOutline);
  }

  if (STATE.settings.padding) {
    root.style.setProperty('--chat-padding', STATE.settings.padding);
  }

  if (STATE.settings.messageSpacing) {
    root.style.setProperty('--chat-message-spacing', STATE.settings.messageSpacing);
  }

  // Apply keep-on-top setting (requires parent window support)
  if (typeof STATE.settings.keepOnTop !== 'undefined' && window.parent && window.parent.setAlwaysOnTop) {
    window.parent.setAlwaysOnTop(STATE.settings.keepOnTop);
  }

  // Apply accessibility settings
  if (STATE.accessibilityManager) {
    STATE.accessibilityManager.applySettings(STATE.settings);
  }

  // Update badge renderer settings
  if (STATE.badgeRenderer) {
    STATE.badgeRenderer.updateSettings(STATE.settings);
  }

  // Update reduce motion in animation renderer
  if (STATE.animationRenderer) {
    STATE.animationRenderer.setReducedMotion(STATE.settings.reduceMotion || false);
  }

  // Update body classes
  document.body.classList.toggle('high-contrast', STATE.settings.highContrastMode);
  document.body.classList.toggle('colorblind-safe', STATE.settings.colorblindSafeMode);
  document.body.classList.toggle('vision-impaired', STATE.settings.visionImpairedMode);
  document.body.classList.toggle('reduce-motion', STATE.settings.reduceMotion);

  // Reinitialize virtual scrolling if setting changed
  if (STATE.settings.useVirtualScrolling && !STATE.virtualScroller) {
    initializeVirtualScrolling();
  } else if (!STATE.settings.useVirtualScrolling && STATE.virtualScroller) {
    STATE.virtualScroller.destroy();
    STATE.virtualScroller = null;
    STATE.messagesContainer.style.display = 'flex';
  }

  // Trim messages if max changed
  trimMessages();
}

// ==================== MESSAGE HANDLING ====================
function addMessage(chatData) {
  // Parse message using robust message parser
  const formattedMessage = STATE.messageParser.createFormattedMessage(chatData);
  
  if (!formattedMessage.text) {
    console.warn('Invalid chat data - no message:', chatData);
    return;
  }

  // Add to messages array
  STATE.messages.push(formattedMessage);

  // Trim to max messages
  trimMessages();

  // Render message
  if (STATE.virtualScroller) {
    // Add to virtual scroller
    STATE.virtualScroller.addItems([formattedMessage], false);
    STATE.virtualScroller.scrollToBottom('smooth');
  } else {
    // Regular rendering
    renderMessage(formattedMessage);
  }
}

/**
 * Render a message element (for both regular and virtual scrolling)
 */
function renderMessageElement(messageData, index) {
  // Create message element
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';
  messageEl.dataset.id = messageData.id;

  // Create header with badges and username
  const headerEl = document.createElement('div');
  headerEl.className = 'chat-message-header';

  // Extract badges
  const badges = STATE.badgeRenderer.extractBadges(messageData.raw);

  // Create badge container
  const badgeContainer = document.createElement('div');
  badgeContainer.className = 'badge-container';
  STATE.badgeRenderer.renderToHTML(badges, badgeContainer);
  headerEl.appendChild(badgeContainer);

  // Create username span
  const usernameEl = document.createElement('span');
  usernameEl.className = 'chat-username';
  usernameEl.textContent = messageData.user.nickname;

  // Apply username color based on team level if enabled
  if (STATE.settings.usernameColorByTeamLevel && badges.teamLevel > 0) {
    const color = STATE.badgeRenderer.getUsernameColor(badges.teamLevel);
    usernameEl.style.color = color;
  }

  headerEl.appendChild(usernameEl);

  // Add colon separator
  const colonEl = document.createElement('span');
  colonEl.textContent = ':';
  colonEl.className = 'chat-username';
  headerEl.appendChild(colonEl);

  messageEl.appendChild(headerEl);

  // Create text container with emojis
  const textEl = document.createElement('div');
  textEl.className = 'chat-text';

  // Parse emojis
  const emojiSegments = STATE.emojiParser.parse(
    messageData.text,
    messageData.emotes,
    STATE.settings.emojiRenderMode
  );

  // Render emoji segments
  STATE.emojiParser.renderToHTML(emojiSegments, textEl);

  messageEl.appendChild(textEl);

  // Add timestamp if enabled
  if (STATE.settings.showTimestamps) {
    const timestampEl = document.createElement('span');
    timestampEl.className = 'chat-timestamp';
    timestampEl.textContent = formatTimestamp(messageData.timestamp);
    messageEl.appendChild(timestampEl);
  }

  return messageEl;
}

/**
 * Render a message (non-virtual scrolling mode)
 */
function renderMessage(messageData) {
  const messageEl = renderMessageElement(messageData);

  // Add to container
  STATE.messagesContainer.appendChild(messageEl);

  // Animate in
  requestAnimationFrame(() => {
    STATE.animationRenderer.animateIn(
      messageEl,
      STATE.settings.animationType || 'slide',
      STATE.settings.animationSpeed || 'medium'
    ).then(() => {
      messageEl.classList.add('visible');
    });
  });

  // Trim old messages
  trimMessagesFromDOM();
}

/**
 * Trim messages to max limit
 */
function trimMessages() {
  const maxMessages = STATE.settings.maxMessages || 10;

  // Remove excess messages from array
  while (STATE.messages.length > maxMessages) {
    STATE.messages.shift();
  }
}

/**
 * Trim messages from DOM (non-virtual mode)
 */
function trimMessagesFromDOM() {
  if (STATE.virtualScroller) return; // Not needed in virtual mode

  const maxMessages = STATE.settings.maxMessages || 10;
  const messageElements = STATE.messagesContainer.querySelectorAll('.chat-message');

  if (messageElements.length > maxMessages) {
    for (let i = 0; i < messageElements.length - maxMessages; i++) {
      const messageEl = messageElements[i];
      
      // Animate out then remove
      STATE.animationRenderer.animateOut(
        messageEl,
        STATE.settings.animationType || 'slide',
        STATE.settings.animationSpeed || 'medium'
      ).then(() => {
        if (messageEl.parentNode) {
          messageEl.parentNode.removeChild(messageEl);
        }
      });
    }
  }
}

/**
 * Format timestamp
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}
