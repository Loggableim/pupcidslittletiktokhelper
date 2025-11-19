/**
 * New Soundboard Plugin - Main Entry Point
 * 
 * This is a modern, security-hardened soundboard plugin with:
 * - MyInstants API integration
 * - Local sound storage
 * - WebSocket-based real-time communication
 * - Permission system with monetization
 * - Priority queue system
 * - Iframe fallback for restricted content
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');

// Import modules
const MyInstantsAdapter = require('./src/storage/remote-adapter-myinstants');
const LocalStorage = require('./src/storage/local-storage');
const WebSocketWrapper = require('./src/utils/websocket-wrapper');
const PermissionsManager = require('./src/utils/permissions');
const QueueManager = require('./src/utils/queue-manager');
const ApiRoutes = require('./src/api/routes');

class NewSoundboardPlugin {
  constructor(api) {
    this.api = api;
    this.logger = api.logger || console;
    this.config = {};
    this.router = express.Router();
    
    // Initialize modules (will be done in init())
    this.myinstantsAdapter = null;
    this.localStorage = null;
    this.wsWrapper = null;
    this.permissions = null;
    this.queueManager = null;
    this.apiRoutes = null;
  }
  
  /**
   * Initialize plugin
   */
  async init() {
    try {
      this.logger.info('[NewSoundboard] Initializing plugin...');
      
      // Load configuration
      await this._loadConfig();
      
      // Initialize modules
      this._initializeModules();
      
      // Set up routes and middleware
      this._setupMiddleware();
      this._setupRoutes();
      
      // Set up WebSocket
      this._setupWebSocket();
      
      // Register routes with plugin API
      this.api.registerRoute('use', '/api/new-soundboard', this.router);
      this.api.registerRoute('use', '/new-soundboard', this.router);
      
      // Register WebSocket handler
      this.api.registerSocket('connection', this._handleSocketConnection.bind(this));
      
      this.logger.info('[NewSoundboard] Plugin initialized successfully');
    } catch (error) {
      this.logger.error('[NewSoundboard] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Load configuration from database
   */
  async _loadConfig() {
    const defaultConfig = {
      // General settings
      enabled: true,
      requireAuth: false,
      apiKey: this._generateApiKey(),
      
      // Storage settings
      soundDir: path.join(__dirname, 'sounds'),
      maxFileSize: 10 * 1024 * 1024, // 10MB
      
      // MyInstants settings
      myinstantsCacheDir: path.join(__dirname, '.cache/myinstants'),
      myinstantsCacheTTL: 24 * 60 * 60 * 1000, // 24 hours
      myinstantsMaxCacheSize: 100 * 1024 * 1024, // 100MB
      
      // Queue settings
      queueConcurrency: 1,
      queueAutoStart: true,
      
      // Rate limiting
      previewRateLimit: {
        windowMs: 60 * 1000, // 1 minute
        max: 10
      },
      playRateLimit: {
        windowMs: 60 * 1000, // 1 minute
        max: 5
      },
      
      // Security
      allowedHosts: [
        'www.myinstants.com',
        'instaud.io',
        '*.cloudfront.net'
      ],
      
      // Permissions
      permissions: {
        enabled: true,
        defaultRoles: ['everyone'],
        rateLimit: {
          enabled: true,
          maxPerHour: 10,
          maxPerDay: 50
        }
      }
    };
    
    try {
      const savedConfig = await this.api.getConfig('config');
      this.config = { ...defaultConfig, ...savedConfig };
    } catch (error) {
      this.config = defaultConfig;
    }
    
    // Save config if it doesn't exist
    await this._saveConfig();
  }
  
  /**
   * Save configuration to database
   */
  async _saveConfig() {
    try {
      await this.api.setConfig('config', this.config);
    } catch (error) {
      this.logger.error('[NewSoundboard] Failed to save config:', error);
    }
  }
  
  /**
   * Initialize all modules
   */
  _initializeModules() {
    // MyInstants adapter
    this.myinstantsAdapter = new MyInstantsAdapter({
      cacheDir: this.config.myinstantsCacheDir,
      cacheTTL: this.config.myinstantsCacheTTL,
      maxCacheSize: this.config.myinstantsMaxCacheSize,
      logger: this.logger
    });
    
    // Local storage
    this.localStorage = new LocalStorage({
      soundDir: this.config.soundDir,
      maxFileSize: this.config.maxFileSize,
      logger: this.logger
    });
    
    // WebSocket wrapper
    this.wsWrapper = new WebSocketWrapper({
      logger: this.logger
    });
    
    // Permissions manager
    this.permissions = new PermissionsManager({
      logger: this.logger
    });
    this.permissions.updateConfig(this.config.permissions);
    
    // Queue manager
    this.queueManager = new QueueManager({
      concurrency: this.config.queueConcurrency,
      autoStart: this.config.queueAutoStart,
      logger: this.logger
    });
    
    // API routes
    this.apiRoutes = new ApiRoutes(this);
    
    this.logger.info('[NewSoundboard] All modules initialized');
  }
  
  /**
   * Set up Express middleware
   */
  _setupMiddleware() {
    // JSON body parser
    this.router.use(express.json());
    this.router.use(express.urlencoded({ extended: true }));
    
    // CORS
    this.router.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sb-key');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      
      next();
    });
    
    // Request logging
    this.router.use((req, res, next) => {
      this.logger.debug(`[NewSoundboard] ${req.method} ${req.path}`);
      next();
    });
    
    // Rate limiting for preview endpoint
    const previewLimiter = rateLimit({
      windowMs: this.config.previewRateLimit.windowMs,
      max: this.config.previewRateLimit.max,
      message: 'Too many preview requests, please try again later',
      standardHeaders: true,
      legacyHeaders: false
    });
    
    // Rate limiting for play endpoint
    const playLimiter = rateLimit({
      windowMs: this.config.playRateLimit.windowMs,
      max: this.config.playRateLimit.max,
      message: 'Too many play requests, please try again later',
      standardHeaders: true,
      legacyHeaders: false
    });
    
    this.router.use('/api/new-soundboard/preview', previewLimiter);
    this.router.use('/api/new-soundboard/play', playLimiter);
  }
  
  /**
   * Set up routes
   */
  _setupRoutes() {
    // Register API routes
    this.apiRoutes.register(this.router);
    
    // Serve UI files
    this.router.use('/new-soundboard/ui', express.static(path.join(__dirname, 'src/ui/public')));
    
    // Serve overlay
    this.router.get('/new-soundboard/overlay', (req, res) => {
      res.sendFile(path.join(__dirname, 'src/ui/public/overlay.html'));
    });
    
    // Serve dashboard
    this.router.get('/new-soundboard/dashboard', (req, res) => {
      res.sendFile(path.join(__dirname, 'src/ui/public/dashboard.html'));
    });
    
    this.logger.info('[NewSoundboard] Routes registered');
  }
  
  /**
   * Set up WebSocket
   */
  _setupWebSocket() {
    // Get Socket.io instance from plugin API
    const io = this.api.getSocketIO();
    
    if (io && io.httpServer) {
      this.wsWrapper.init(io.httpServer);
      this.logger.info('[NewSoundboard] WebSocket initialized');
    } else {
      this.logger.warn('[NewSoundboard] Socket.io not available, WebSocket disabled');
    }
  }
  
  /**
   * Handle Socket.io connection (legacy support)
   */
  _handleSocketConnection(socket) {
    // This is for Socket.io integration if needed
    // The main WebSocket communication is handled by wsWrapper
  }
  
  /**
   * Generate API key
   */
  _generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Get plugin status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      modules: {
        myinstants: this.myinstantsAdapter ? this.myinstantsAdapter.getStats() : null,
        storage: this.localStorage ? 'initialized' : 'not initialized',
        websocket: this.wsWrapper ? this.wsWrapper.getStats() : null,
        queue: this.queueManager ? this.queueManager.getStats() : null
      }
    };
  }
  
  /**
   * Update configuration
   */
  async updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    await this._saveConfig();
    
    // Update module configs
    if (this.permissions) {
      this.permissions.updateConfig(this.config.permissions);
    }
    
    if (this.queueManager) {
      this.queueManager.updateConcurrency(this.config.queueConcurrency);
    }
    
    this.logger.info('[NewSoundboard] Configuration updated');
  }
  
  /**
   * Cleanup and destroy plugin
   */
  async destroy() {
    try {
      this.logger.info('[NewSoundboard] Destroying plugin...');
      
      // Cleanup modules
      if (this.wsWrapper) {
        this.wsWrapper.destroy();
      }
      
      if (this.queueManager) {
        this.queueManager.destroy();
      }
      
      this.logger.info('[NewSoundboard] Plugin destroyed');
    } catch (error) {
      this.logger.error('[NewSoundboard] Destroy failed:', error);
    }
  }
}

module.exports = NewSoundboardPlugin;
