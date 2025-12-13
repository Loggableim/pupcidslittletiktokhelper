/**
 * Talking Heads Plugin
 * Animated avatar overlay that reacts to TikTok Live events
 */

class TalkingHeadsPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
  }

  async init() {
    this.api.log('Talking Heads plugin initializing...', 'info');

    // Register admin UI route
    this.api.registerRoute('get', '/plugins/talking-heads/ui', (req, res) => {
      res.sendFile('ui.html', { root: this.api.getPluginDir() });
    });

    // Register overlay route
    this.api.registerRoute('get', '/plugins/talking-heads/overlay', (req, res) => {
      res.sendFile('overlay.html', { root: this.api.getPluginDir() });
    });

    // API endpoint for getting config
    this.api.registerRoute('get', '/api/talking-heads/config', (req, res) => {
      const config = this.getConfig();
      res.json(config);
    });

    // API endpoint for saving config
    this.api.registerRoute('post', '/api/talking-heads/config', (req, res) => {
      try {
        this.setConfig(req.body);
        res.json({ success: true });
      } catch (error) {
        this.api.log(`Failed to save config: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Register socket event for triggering expressions
    this.api.registerSocket('talking-heads:trigger', (data) => {
      this.io.emit('talking-heads:expression', data);
    });

    // Subscribe to TikTok events
    this.api.registerTikTokEvent('gift', (data) => {
      this.handleGift(data);
    });

    this.api.registerTikTokEvent('chat', (data) => {
      this.handleChat(data);
    });

    this.api.registerTikTokEvent('follow', (data) => {
      this.handleFollow(data);
    });

    this.api.registerTikTokEvent('share', (data) => {
      this.handleShare(data);
    });

    this.api.registerTikTokEvent('like', (data) => {
      this.handleLike(data);
    });

    this.api.log('Talking Heads plugin initialized successfully', 'info');
  }

  handleGift(data) {
    const config = this.getConfig();
    if (!config.enabled) return;

    const expression = this.determineExpression('gift', data.giftName, data.diamondCount);
    
    this.io.emit('talking-heads:expression', {
      type: 'gift',
      expression: expression,
      message: `${data.uniqueId} sent ${data.giftName}!`,
      duration: 3000,
      user: data.uniqueId
    });
  }

  handleChat(data) {
    const config = this.getConfig();
    if (!config.enabled || !config.showChat) return;

    this.io.emit('talking-heads:expression', {
      type: 'chat',
      expression: 'talking',
      message: data.comment,
      duration: 2000,
      user: data.uniqueId
    });
  }

  handleFollow(data) {
    const config = this.getConfig();
    if (!config.enabled) return;

    this.io.emit('talking-heads:expression', {
      type: 'follow',
      expression: 'happy',
      message: `${data.uniqueId} followed!`,
      duration: 2000,
      user: data.uniqueId
    });
  }

  handleShare(data) {
    const config = this.getConfig();
    if (!config.enabled) return;

    this.io.emit('talking-heads:expression', {
      type: 'share',
      expression: 'excited',
      message: `${data.uniqueId} shared the stream!`,
      duration: 2000,
      user: data.uniqueId
    });
  }

  handleLike(data) {
    const config = this.getConfig();
    if (!config.enabled || !config.showLikes) return;

    // Only show every Nth like to avoid spam
    const likeThreshold = config.likeThreshold || 10;
    if (data.likeCount % likeThreshold === 0) {
      this.io.emit('talking-heads:expression', {
        type: 'like',
        expression: 'happy',
        message: `${data.likeCount} likes!`,
        duration: 1500,
        user: 'System'
      });
    }
  }

  determineExpression(eventType, giftName = '', value = 0) {
    // Determine expression based on event type and value
    if (eventType === 'gift') {
      if (value >= 1000) return 'ecstatic';
      if (value >= 100) return 'very-happy';
      if (value >= 10) return 'happy';
      return 'smile';
    }

    const expressionMap = {
      'chat': 'talking',
      'follow': 'happy',
      'share': 'excited',
      'like': 'smile'
    };

    return expressionMap[eventType] || 'neutral';
  }

  getConfig() {
    const defaultConfig = {
      enabled: true,
      avatarType: 'default',
      showChat: true,
      showLikes: false,
      likeThreshold: 10,
      position: 'bottom-right',
      size: 'medium',
      expressions: {
        neutral: true,
        happy: true,
        excited: true,
        talking: true,
        smile: true,
        'very-happy': true,
        ecstatic: true
      }
    };

    try {
      const config = this.api.getConfig('talking-heads-config');
      return config || defaultConfig;
    } catch (error) {
      this.api.log(`Failed to load config: ${error.message}`, 'warn');
      return defaultConfig;
    }
  }

  setConfig(config) {
    try {
      this.api.setConfig('talking-heads-config', config);
      this.io.emit('talking-heads:config-updated', config);
    } catch (error) {
      this.api.log(`Failed to save config: ${error.message}`, 'error');
      throw error;
    }
  }

  async destroy() {
    this.api.log('Talking Heads plugin shutting down...', 'info');
    // Cleanup: notify overlay that plugin is being disabled
    this.io.emit('talking-heads:disabled');
  }
}

module.exports = TalkingHeadsPlugin;
