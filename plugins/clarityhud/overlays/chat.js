/**
 * ClarityHUD - Chat Overlay
 */

// State management
let settings = {
  fontSize: '48px',
  lineHeight: 1.6,
  letterSpacing: '0.5px',
  maxMessages: 10,
  showTimestamps: false,
  textAlign: 'left',
  animationType: 'slide',
  animationSpeed: 'medium',
  reduceMotion: false,
  dayNightMode: 'night',
  highContrastMode: false,
  colorblindSafeMode: false,
  visionImpairedMode: false,
  dyslexiaFont: false
};

let messages = [];
let socket = null;
let animationRegistry = null;
let animationRenderer = null;
let accessibilityManager = null;

// DOM elements
const messagesContainer = document.getElementById('messages');

// Initialize animation system
animationRegistry = new AnimationRegistry();
animationRenderer = new AnimationRenderer(animationRegistry);

// Initialize accessibility manager
accessibilityManager = new AccessibilityManager();

// Connect to socket
socket = io();

socket.on('connect', () => {
  console.log('Connected to server');
  init();
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

// Listen for chat updates
socket.on('clarityhud.update.chat', (chatData) => {
  console.log('Received chat update:', chatData);
  addMessage(chatData);
});

// Listen for settings updates
socket.on('clarityhud.settings.chat', (newSettings) => {
  console.log('Received settings update:', newSettings);
  applySettings(newSettings);
});

// Initialize overlay
async function init() {
  try {
    // Load settings
    const settingsResponse = await fetch('/api/clarityhud/settings/chat');
    const settingsData = await settingsResponse.json();

    if (settingsData.success && settingsData.settings) {
      applySettings(settingsData.settings);
    }

    console.log('Chat overlay initialized');
  } catch (error) {
    console.error('Error initializing overlay:', error);
  }
}

// Apply settings
function applySettings(newSettings) {
  settings = { ...settings, ...newSettings };

  // Apply CSS custom properties
  const root = document.documentElement;

  if (settings.fontSize) {
    root.style.setProperty('--chat-font-size', settings.fontSize);
  }

  if (settings.lineHeight) {
    root.style.setProperty('--chat-line-height', settings.lineHeight);
  }

  if (settings.letterSpacing) {
    root.style.setProperty('--chat-letter-spacing', settings.letterSpacing);
  }

  if (settings.textAlign) {
    root.style.setProperty('--chat-alignment', settings.textAlign);
    document.body.classList.toggle('align-center', settings.textAlign === 'center');
  }

  if (settings.backgroundColor) {
    root.style.setProperty('--chat-bg-color', settings.backgroundColor);
  }

  if (settings.textColor) {
    root.style.setProperty('--chat-text-color', settings.textColor);
  }

  if (settings.userNameColor) {
    root.style.setProperty('--chat-username-color', settings.userNameColor);
  }

  if (settings.textOutline) {
    root.style.setProperty('--chat-text-outline', settings.textOutline);
  }

  if (settings.padding) {
    root.style.setProperty('--chat-padding', settings.padding);
  }

  if (settings.messageSpacing) {
    root.style.setProperty('--chat-message-spacing', settings.messageSpacing);
  }

  // Apply accessibility settings
  accessibilityManager.applySettings(settings);

  // Update reduce motion in animation renderer
  if (animationRenderer) {
    animationRenderer.setReducedMotion(settings.reduceMotion || false);
  }

  // Update body classes
  document.body.classList.toggle('high-contrast', settings.highContrastMode);
  document.body.classList.toggle('colorblind-safe', settings.colorblindSafeMode);
  document.body.classList.toggle('vision-impaired', settings.visionImpairedMode);
  document.body.classList.toggle('reduce-motion', settings.reduceMotion);

  // Trim messages if max changed
  trimMessages();
}

// Add a message to the display
function addMessage(chatData) {
  // Handle both old format (uniqueId, comment) and new format (user.uniqueId, message)
  const username = chatData.uniqueId || chatData.user?.uniqueId || chatData.user?.nickname || 'Anonymous';
  const text = chatData.comment || chatData.message || '';

  if (!text) {
    console.warn('Invalid chat data - no message:', chatData);
    return;
  }

  // Create message object
  const messageObj = {
    id: Date.now() + Math.random(),
    username: username,
    text: text,
    timestamp: new Date()
  };

  // Add to messages array
  messages.push(messageObj);

  // Trim to max messages
  trimMessages();

  // Render message
  renderMessage(messageObj);
}

// Render a message element
function renderMessage(messageObj) {
  // Create message element
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';
  messageEl.dataset.id = messageObj.id;

  // Create username span
  const usernameEl = document.createElement('span');
  usernameEl.className = 'chat-username';
  usernameEl.textContent = messageObj.username + ':';

  // Create text span
  const textEl = document.createElement('span');
  textEl.className = 'chat-text';
  textEl.textContent = messageObj.text;

  // Append username and text
  messageEl.appendChild(usernameEl);
  messageEl.appendChild(textEl);

  // Add timestamp if enabled
  if (settings.showTimestamps) {
    const timestampEl = document.createElement('span');
    timestampEl.className = 'chat-timestamp';
    timestampEl.textContent = formatTimestamp(messageObj.timestamp);
    messageEl.appendChild(timestampEl);
  }

  // Add to container
  messagesContainer.appendChild(messageEl);

  // Animate in
  requestAnimationFrame(() => {
    animationRenderer.animateIn(
      messageEl,
      settings.animationType || 'slide',
      settings.animationSpeed || 'medium'
    ).then(() => {
      messageEl.classList.add('visible');
    });
  });
}

// Trim messages to max limit
function trimMessages() {
  const maxMessages = settings.maxMessages || 10;

  // Remove excess messages from array
  while (messages.length > maxMessages) {
    const removedMessage = messages.shift();

    // Remove from DOM
    const messageEl = messagesContainer.querySelector(`[data-id="${removedMessage.id}"]`);
    if (messageEl) {
      // Animate out then remove
      animationRenderer.animateOut(
        messageEl,
        settings.animationType || 'slide',
        settings.animationSpeed || 'medium'
      ).then(() => {
        if (messageEl.parentNode) {
          messageEl.parentNode.removeChild(messageEl);
        }
      });
    }
  }

  // Also clean up any extra DOM elements (safety check)
  const messageElements = messagesContainer.querySelectorAll('.chat-message');
  if (messageElements.length > maxMessages) {
    for (let i = 0; i < messageElements.length - maxMessages; i++) {
      if (messageElements[i].parentNode) {
        messageElements[i].parentNode.removeChild(messageElements[i]);
      }
    }
  }
}

// Format timestamp
function formatTimestamp(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// Detect system preference for reduced motion
if (window.matchMedia) {
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motionQuery.matches && !settings.reduceMotion) {
    settings.reduceMotion = true;
    animationRenderer.setReduceMotion(true);
    document.body.classList.add('reduce-motion');
  }

  // Listen for changes
  motionQuery.addEventListener('change', (e) => {
    if (!settings.reduceMotion) {
      const shouldReduce = e.matches;
      animationRenderer.setReduceMotion(shouldReduce);
      document.body.classList.toggle('reduce-motion', shouldReduce);
    }
  });
}
