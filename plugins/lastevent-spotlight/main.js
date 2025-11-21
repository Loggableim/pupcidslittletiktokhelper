/**
 * LastEvent Spotlight Plugin
 *
 * Provides six permanent live overlays showing the last active user for each event type.
 * Supports real-time updates via WebSocket and comprehensive customization settings.
 */

class LastEventSpotlightPlugin {
  constructor(api) {
    this.api = api;
    this.pluginId = 'lastevent-spotlight';

    // Event type mappings
    this.eventTypes = {
      'follower': { event: 'follow', label: 'New Follower' },
      'like': { event: 'like', label: 'New Like' },
      'chatter': { event: 'chat', label: 'New Chat' },
      'share': { event: 'share', label: 'New Share' },
      'gifter': { event: 'gift', label: 'New Gift' },
      'subscriber': { event: 'subscribe', label: 'New Subscriber' },
      'top-gift': { event: 'gift', label: 'Top Gift', special: true },
      'gift-streak': { event: 'gift', label: 'Gift Streak', special: true }
    };

    // Store last user for each type
    this.lastUsers = {
      follower: null,
      like: null,
      chatter: null,
      share: null,
      gifter: null,
      subscriber: null,
      'top-gift': null,
      'gift-streak': null
    };

    // Track top gift and streaks
    this.topGift = null; // Stores the most expensive gift
    this.currentStreak = null; // Current gift streak
    this.longestStreak = null; // Longest gift streak

    this.defaultSettings = this.getDefaultSettings();
  }

  /**
   * Get default settings for an overlay type
   */
  getDefaultSettings() {
    return {
      // Font settings
      fontFamily: 'Exo 2',
      fontSize: '32px',
      fontLineSpacing: '1.2',
      fontLetterSpacing: 'normal',
      fontColor: '#FFFFFF',

      // Username effects
      usernameEffect: 'none', // none, wave, wave-slow, wave-fast, jitter, bounce
      usernameWave: false,
      usernameWaveSpeed: 'medium',
      usernameGlow: false,
      usernameGlowColor: '#00FF00',

      // Border
      enableBorder: true,
      borderColor: '#FFFFFF',

      // Background
      enableBackground: true,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',

      // Profile picture
      showProfilePicture: true,
      profilePictureSize: '80px',

      // Layout
      showUsername: true,
      alignCenter: true,

      // Animations
      inAnimationType: 'fade', // fade, slide, pop, zoom, glow, bounce
      outAnimationType: 'fade',
      animationSpeed: 'medium', // slow, medium, fast
      fadeDuration: '0.5s',

      // Behavior
      refreshIntervalSeconds: 0, // 0 = no auto-refresh
      hideOnNullUser: true,
      preloadImages: true
    };
  }

  /**
   * Initialize plugin
   */
  async init() {
    this.api.log('LastEvent Spotlight plugin loading...');

    // Initialize settings for all types if not exist
    await this.initializeSettings();

    // Load saved last users
    await this.loadLastUsers();

    // Register API routes
    this.registerRoutes();

    // Register event listeners
    this.registerEventListeners();

    this.api.log('LastEvent Spotlight plugin loaded successfully');
  }

  /**
   * Initialize settings for all overlay types
   */
  async initializeSettings() {
    for (const type of Object.keys(this.eventTypes)) {
      const key = `settings:${type}`;
      const existing = await this.api.getConfig(key);

      if (!existing) {
        await this.api.setConfig(key, this.defaultSettings);
        this.api.log(`Initialized default settings for ${type}`);
      }
    }
  }

  /**
   * Load last users from storage
   */
  async loadLastUsers() {
    for (const type of Object.keys(this.eventTypes)) {
      const key = `lastuser:${type}`;
      const user = await this.api.getConfig(key);
      if (user) {
        this.lastUsers[type] = user;
      }
    }
  }

  /**
   * Save last user for a type
   */
  async saveLastUser(type, userData) {
    this.lastUsers[type] = userData;
    const key = `lastuser:${type}`;
    await this.api.setConfig(key, userData);
  }

  /**
   * Register API routes
   */
  registerRoutes() {
    const path = require('path');

    // Serve overlay HTML files
    for (const type of Object.keys(this.eventTypes)) {
      this.api.registerRoute('GET', `/overlay/lastevent/${type}`, (req, res) => {
        const overlayPath = path.join(__dirname, 'overlays', `${type}.html`);
        res.sendFile(overlayPath);
      });
      
      // Serve overlay JS files
      this.api.registerRoute('GET', `/plugins/lastevent-spotlight/overlays/${type}.js`, (req, res) => {
        const jsPath = path.join(__dirname, 'overlays', `${type}.js`);
        res.sendFile(jsPath);
      });
    }

    // Serve plugin UI
    this.api.registerRoute('GET', '/lastevent-spotlight/ui', (req, res) => {
      const uiPath = path.join(__dirname, 'ui', 'main.html');
      res.sendFile(uiPath);
    });
    
    // Serve UI JS
    this.api.registerRoute('GET', '/plugins/lastevent-spotlight/ui/main.js', (req, res) => {
      const jsPath = path.join(__dirname, 'ui', 'main.js');
      res.sendFile(jsPath);
    });

    // Serve library files
    this.api.registerRoute('GET', '/plugins/lastevent-spotlight/lib/animations.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'animations.js');
      res.sendFile(libPath);
    });

    this.api.registerRoute('GET', '/plugins/lastevent-spotlight/lib/text-effects.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'text-effects.js');
      res.sendFile(libPath);
    });

    this.api.registerRoute('GET', '/plugins/lastevent-spotlight/lib/template-renderer.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'template-renderer.js');
      res.sendFile(libPath);
    });

    // Get all settings
    this.api.registerRoute('GET', '/api/lastevent/settings', async (req, res) => {
      try {
        const allSettings = {};
        for (const type of Object.keys(this.eventTypes)) {
          const key = `settings:${type}`;
          allSettings[type] = await this.api.getConfig(key) || this.defaultSettings;
        }
        res.json({ success: true, settings: allSettings });
      } catch (error) {
        this.api.log(`Error getting settings: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get settings for specific type
    this.api.registerRoute('GET', '/api/lastevent/settings/:type', async (req, res) => {
      try {
        const { type } = req.params;
        if (!this.eventTypes[type]) {
          return res.status(404).json({ success: false, error: 'Invalid event type' });
        }

        const key = `settings:${type}`;
        const settings = await this.api.getConfig(key) || this.defaultSettings;
        res.json({ success: true, settings });
      } catch (error) {
        this.api.log(`Error getting settings for ${req.params.type}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update settings for specific type
    this.api.registerRoute('POST', '/api/lastevent/settings/:type', async (req, res) => {
      try {
        const { type } = req.params;
        if (!this.eventTypes[type]) {
          return res.status(404).json({ success: false, error: 'Invalid event type' });
        }

        const newSettings = req.body;
        const key = `settings:${type}`;

        // Merge with defaults to ensure all fields exist
        const mergedSettings = { ...this.defaultSettings, ...newSettings };

        await this.api.setConfig(key, mergedSettings);

        // Broadcast settings update to all overlays
        this.api.emit(`lastevent.settings.${type}`, mergedSettings);

        res.json({ success: true, settings: mergedSettings });
      } catch (error) {
        this.api.log(`Error updating settings for ${req.params.type}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get last user for specific type
    this.api.registerRoute('GET', '/api/lastevent/last/:type', async (req, res) => {
      try {
        const { type } = req.params;
        if (!this.eventTypes[type]) {
          return res.status(404).json({ success: false, error: 'Invalid event type' });
        }

        const userData = this.lastUsers[type];
        res.json({ success: true, type, user: userData });
      } catch (error) {
        this.api.log(`Error getting last user for ${req.params.type}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test endpoint - simulate event for testing
    this.api.registerRoute('POST', '/api/lastevent/test/:type', async (req, res) => {
      try {
        const { type } = req.params;
        if (!this.eventTypes[type]) {
          return res.status(404).json({ success: false, error: 'Invalid event type' });
        }

        // Generate test user data
        const testUser = {
          uniqueId: `testuser_${Date.now()}`,
          nickname: `Test ${this.eventTypes[type].label}`,
          profilePictureUrl: 'https://via.placeholder.com/150/0000FF/FFFFFF?text=Test',
          timestamp: new Date().toISOString(),
          eventType: type,
          label: this.eventTypes[type].label
        };

        await this.saveLastUser(type, testUser);

        // Broadcast update
        this.api.emit(`lastevent.update.${type}`, testUser);

        res.json({ success: true, user: testUser });
      } catch (error) {
        this.api.log(`Error testing ${req.params.type}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.log('API routes registered');
  }

  /**
   * Register TikTok event listeners
   */
  registerEventListeners() {
    // Map TikTok events to overlay types
    const eventMappings = {
      'follow': 'follower',
      'like': 'like',
      'chat': 'chatter',
      'share': 'share',
      'gift': 'gifter',
      'subscribe': 'subscriber'
    };

    for (const [eventName, overlayType] of Object.entries(eventMappings)) {
      this.api.registerTikTokEvent(eventName, async (data) => {
        await this.handleEvent(eventName, overlayType, data);
      });
    }

    // Also handle 'superfan' as subscriber
    this.api.registerTikTokEvent('superfan', async (data) => {
      await this.handleEvent('superfan', 'subscriber', data);
    });

    this.api.log('Event listeners registered');
  }

  /**
   * Handle incoming TikTok event
   */
  async handleEvent(eventName, overlayType, data) {
    try {
      // Extract user data from event
      const userData = this.extractUserData(eventName, overlayType, data);

      if (!userData) {
        this.api.log(`Could not extract user data from ${eventName} event`);
        return;
      }

      // Save as last user for this type
      await this.saveLastUser(overlayType, userData);

      // Broadcast to overlays
      this.api.emit(`lastevent.update.${overlayType}`, userData);

      this.api.log(`Updated last ${overlayType}: ${userData.nickname}`);

      // Handle special gift tracking
      if (eventName === 'gift') {
        await this.handleGiftTracking(userData, data);
      }
    } catch (error) {
      this.api.log(`Error handling ${eventName} event: ${error.message}`);
    }
  }

  /**
   * Handle gift tracking for top-gift and gift-streak
   */
  async handleGiftTracking(userData, giftData) {
    const coins = userData.metadata.coins || 0;
    const giftName = userData.metadata.giftName;
    const giftCount = userData.metadata.giftCount || 1;

    // Track top gift (most expensive)
    if (!this.topGift || coins > (this.topGift.metadata.coins || 0)) {
      this.topGift = {
        ...userData,
        eventType: 'top-gift',
        label: this.eventTypes['top-gift'].label
      };
      await this.saveLastUser('top-gift', this.topGift);
      this.api.emit('lastevent.update.top-gift', this.topGift);
      this.api.log(`New top gift: ${giftName} (${coins} coins) from ${userData.nickname}`);
    }

    // Track gift streaks
    const now = Date.now();
    const streakTimeout = 30000; // 30 seconds timeout for streaks

    // Check if this continues the current streak
    if (this.currentStreak &&
        this.currentStreak.uniqueId === userData.uniqueId &&
        this.currentStreak.giftName === giftName &&
        (now - this.currentStreak.lastTimestamp) < streakTimeout) {
      // Continue current streak
      this.currentStreak.count += giftCount;
      this.currentStreak.totalCoins += coins;
      this.currentStreak.lastTimestamp = now;
    } else {
      // Start new streak
      this.currentStreak = {
        uniqueId: userData.uniqueId,
        nickname: userData.nickname,
        profilePictureUrl: userData.profilePictureUrl,
        giftName: giftName,
        count: giftCount,
        totalCoins: coins,
        startTimestamp: now,
        lastTimestamp: now
      };
    }

    // Check if this is the longest streak
    if (!this.longestStreak || this.currentStreak.count > this.longestStreak.count) {
      this.longestStreak = { ...this.currentStreak };
      
      const streakData = {
        uniqueId: this.longestStreak.uniqueId,
        nickname: this.longestStreak.nickname,
        profilePictureUrl: this.longestStreak.profilePictureUrl,
        timestamp: new Date(this.longestStreak.lastTimestamp).toISOString(),
        eventType: 'gift-streak',
        label: this.eventTypes['gift-streak'].label,
        metadata: {
          giftName: this.longestStreak.giftName,
          giftCount: this.longestStreak.count,
          coins: this.longestStreak.totalCoins
        }
      };

      await this.saveLastUser('gift-streak', streakData);
      this.api.emit('lastevent.update.gift-streak', streakData);
      this.api.log(`New longest streak: ${this.longestStreak.count}x ${giftName} from ${this.longestStreak.nickname}`);
    }
  }

  /**
   * Extract user data from TikTok event
   */
  extractUserData(eventName, overlayType, data) {
    // Handle different event data structures
    let user = null;

    if (data.user) {
      user = data.user;
    } else if (data.uniqueId || data.username) {
      user = data;
    }

    if (!user) {
      return null;
    }

    return {
      uniqueId: user.uniqueId || user.username || user.userId || 'unknown',
      nickname: user.nickname || user.displayName || user.uniqueId || user.username || 'Anonymous',
      profilePictureUrl: user.profilePictureUrl || user.avatarUrl || user.profilePicUrl || user.profilePicture || '',
      timestamp: new Date().toISOString(),
      eventType: overlayType,
      label: this.eventTypes[overlayType].label,
      // Additional event-specific data
      metadata: {
        giftName: data.giftName,
        giftCount: data.repeatCount || data.count || 1,
        message: data.comment || data.message,
        // FIX: Use data.coins (already calculated), only fallback to 0 if not present
        // Don't fallback to diamondCount as it's the raw diamond value, not coins
        coins: data.coins || 0
      }
    };
  }

  /**
   * Cleanup on plugin unload
   */
  async destroy() {
    this.api.log('LastEvent Spotlight plugin unloading...');
  }
}

// Export plugin class
module.exports = LastEventSpotlightPlugin;
