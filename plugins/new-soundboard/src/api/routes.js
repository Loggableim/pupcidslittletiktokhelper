/**
 * API Routes for New Soundboard Plugin
 * 
 * This module defines all API endpoints for the new soundboard:
 * - POST /api/new-soundboard/preview - Preview a sound
 * - POST /api/new-soundboard/play - Play a sound
 * - GET /api/new-soundboard/list - List all sounds
 * - POST /api/new-soundboard/upload - Upload a sound file
 * - GET /api/new-soundboard/meta - Get sound metadata
 * - POST /api/new-soundboard/meta - Update sound metadata
 * - GET /api/new-soundboard/metrics - Get metrics
 */

const multer = require('multer');
const path = require('path');
const {
  isValidSourceType,
  isValidAudioMimeType,
  isValidAudioExtension,
  hasRequiredFields,
  sanitizeMetadata,
  sanitizeFilename
} = require('../utils/validators');

class ApiRoutes {
  constructor(plugin) {
    this.plugin = plugin;
    this.logger = plugin.logger;
    
    // Configure multer for file uploads
    this.multerUpload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: plugin.config.maxFileSize || 10 * 1024 * 1024 // 10MB default
      },
      fileFilter: (req, file, cb) => {
        if (isValidAudioMimeType(file.mimetype) && isValidAudioExtension(file.originalname)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid audio file type'));
        }
      }
    });
  }
  
  /**
   * Register all routes
   * @param {Object} router - Express router
   */
  register(router) {
    // Preview endpoint
    router.post('/api/new-soundboard/preview', this._authMiddleware.bind(this), this.preview.bind(this));
    
    // Play endpoint
    router.post('/api/new-soundboard/play', this._authMiddleware.bind(this), this.play.bind(this));
    
    // List sounds
    router.get('/api/new-soundboard/list', this._authMiddleware.bind(this), this.list.bind(this));
    
    // Upload sound
    router.post('/api/new-soundboard/upload', this._authMiddleware.bind(this), this.multerUpload.single('file'), this.uploadSound.bind(this));
    
    // Get metadata
    router.get('/api/new-soundboard/meta/:soundId', this._authMiddleware.bind(this), this.getMeta.bind(this));
    
    // Update metadata
    router.post('/api/new-soundboard/meta/:soundId', this._authMiddleware.bind(this), this.updateMeta.bind(this));
    
    // Metrics
    router.get('/api/new-soundboard/metrics', this._authMiddleware.bind(this), this.metrics.bind(this));
    
    // Serve local sounds
    router.use('/plugins/new-soundboard/sounds', this._authMiddleware.bind(this), this._serveSound.bind(this));
    
    this.logger.info('[ApiRoutes] All routes registered');
  }
  
  /**
   * Authentication middleware
   */
  _authMiddleware(req, res, next) {
    const apiKey = req.headers['x-sb-key'];
    
    // Never use query parameter for API key - security risk
    if (!apiKey) {
      // Check if global auth is configured
      if (this.plugin.config.requireAuth) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return next();
    }
    
    if (apiKey !== this.plugin.config.apiKey) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
    
    next();
  }
  
  /**
   * POST /api/new-soundboard/preview
   * Preview a sound without adding to play queue
   */
  async preview(req, res) {
    try {
      const { sourceType, id, filename, url } = req.body;
      
      // Validate source type
      if (!isValidSourceType(sourceType)) {
        return res.status(400).json({ error: 'Invalid source type' });
      }
      
      this.logger.info(`[API] Preview request: sourceType=${sourceType}`);
      
      let result;
      
      switch (sourceType) {
        case 'myinstants':
          result = await this._previewMyInstants(id);
          break;
        
        case 'local':
          result = await this._previewLocal(filename);
          break;
        
        case 'url':
          result = await this._previewUrl(url);
          break;
        
        default:
          return res.status(400).json({ error: 'Unsupported source type' });
      }
      
      // Broadcast preview message to admin/dashboard clients
      this.plugin.wsWrapper.broadcast(['admin', 'dashboard'], {
        type: 'preview',
        payload: result
      });
      
      res.json({ success: true, data: result });
    } catch (error) {
      this.logger.error('[API] Preview failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * Preview MyInstants sound
   */
  async _previewMyInstants(id) {
    if (!id) {
      throw new Error('MyInstants ID required');
    }
    
    const instant = await this.plugin.myinstantsAdapter.getInstantById(id);
    const audioUrl = await this.plugin.myinstantsAdapter.resolveAudioUrl(instant);
    
    if (audioUrl) {
      // Direct URL available
      return {
        sourceType: 'myinstants',
        instantsId: id,
        name: instant.name,
        url: audioUrl,
        embedFallback: false,
        licenseStatus: instant.licenseStatus
      };
    } else {
      // Use iframe fallback
      return {
        sourceType: 'myinstants',
        instantsId: id,
        name: instant.name,
        instantUrl: instant.url,
        embedFallback: true,
        licenseStatus: instant.licenseStatus
      };
    }
  }
  
  /**
   * Preview local sound
   */
  async _previewLocal(filename) {
    if (!filename) {
      throw new Error('Filename required');
    }
    
    const fileInfo = await this.plugin.localStorage.getFileInfo(filename);
    
    return {
      sourceType: 'local',
      filename: filename,
      url: `/plugins/new-soundboard/sounds/${filename}`,
      size: fileInfo.size,
      metadata: fileInfo.metadata,
      embedFallback: false
    };
  }
  
  /**
   * Preview external URL
   */
  async _previewUrl(url) {
    if (!url) {
      throw new Error('URL required');
    }
    
    // Validate against whitelist
    const { isAllowedHost } = require('../utils/validators');
    const allowedHosts = this.plugin.config.allowedHosts || [];
    
    if (allowedHosts.length > 0 && !isAllowedHost(url, allowedHosts)) {
      throw new Error('Host not in whitelist');
    }
    
    // Check accessibility
    const { checkUrlAccessibility } = require('../utils/fetch-utils');
    const check = await checkUrlAccessibility(url, {
      logger: this.logger
    });
    
    if (!check.accessible) {
      throw new Error('URL not accessible');
    }
    
    return {
      sourceType: 'url',
      url: url,
      contentType: check.contentType,
      embedFallback: false
    };
  }
  
  /**
   * POST /api/new-soundboard/play
   * Queue a sound for playback
   */
  async play(req, res) {
    try {
      const { sourceType, id, filename, url, userId, priority = 0, volume = 100, fadeIn = 0, fadeOut = 0 } = req.body;
      
      // Validate source type
      if (!isValidSourceType(sourceType)) {
        return res.status(400).json({ error: 'Invalid source type' });
      }
      
      this.logger.info(`[API] Play request: sourceType=${sourceType}, userId=${userId}`);
      
      // Get user info for permission check
      const user = userId ? await this._getUserInfo(userId) : null;
      
      // Get sound metadata
      let soundMeta = {};
      if (sourceType === 'local' && filename) {
        const fileInfo = await this.plugin.localStorage.getFileInfo(filename);
        soundMeta = fileInfo.metadata || {};
      }
      
      // Check permissions
      const soundId = id || filename || url;
      const permCheck = this.plugin.permissions.checkPermission(user, soundId, soundMeta);
      
      if (!permCheck.allowed) {
        // Send permission denied notification
        if (userId) {
          this.plugin.wsWrapper.sendToUser(userId, {
            type: 'permission-denied',
            reason: permCheck.reason
          });
        }
        
        return res.status(403).json({ error: permCheck.reason });
      }
      
      // Prepare job data
      const jobData = {
        sourceType,
        id,
        filename,
        url,
        userId,
        priority,
        volume,
        fadeIn,
        fadeOut
      };
      
      // Add to queue
      const jobId = await this.plugin.queueManager.add(jobData);
      
      // Record usage
      if (userId) {
        this.plugin.permissions.recordUsage(userId, soundId);
      }
      
      // Get preview data to send with play-start
      let previewData;
      switch (sourceType) {
        case 'myinstants':
          previewData = await this._previewMyInstants(id);
          break;
        case 'local':
          previewData = await this._previewLocal(filename);
          break;
        case 'url':
          previewData = await this._previewUrl(url);
          break;
      }
      
      // Broadcast play-start to overlay clients
      this.plugin.wsWrapper.broadcast(['overlay', 'dashboard'], {
        type: 'play-start',
        meta: {
          jobId,
          ...previewData,
          volume,
          fadeIn,
          fadeOut,
          userId
        }
      });
      
      res.json({ success: true, jobId });
    } catch (error) {
      this.logger.error('[API] Play failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * GET /api/new-soundboard/list
   * List all available sounds
   */
  async list(req, res) {
    try {
      const localSounds = await this.plugin.localStorage.listFiles();
      
      res.json({
        success: true,
        sounds: localSounds.map(sound => ({
          sourceType: 'local',
          filename: sound.filename,
          size: sound.size,
          metadata: sound.metadata,
          createdAt: sound.createdAt
        }))
      });
    } catch (error) {
      this.logger.error('[API] List failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * POST /api/new-soundboard/upload
   * Upload a new sound file
   */
  async uploadSound(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }
      
      const metadata = sanitizeMetadata(req.body);
      
      const fileInfo = await this.plugin.localStorage.saveFile(
        req.file.buffer,
        req.file.originalname,
        {
          mimeType: req.file.mimetype,
          metadata: metadata
        }
      );
      
      this.logger.info(`[API] File uploaded: ${fileInfo.filename}`);
      
      res.json({ success: true, file: fileInfo });
    } catch (error) {
      this.logger.error('[API] Upload failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * GET /api/new-soundboard/meta/:soundId
   * Get sound metadata
   */
  async getMeta(req, res) {
    try {
      const { soundId } = req.params;
      
      const fileInfo = await this.plugin.localStorage.getFileInfo(soundId);
      
      res.json({ success: true, metadata: fileInfo.metadata });
    } catch (error) {
      this.logger.error('[API] Get meta failed:', error);
      res.status(404).json({ error: 'Sound not found' });
    }
  }
  
  /**
   * POST /api/new-soundboard/meta/:soundId
   * Update sound metadata
   */
  async updateMeta(req, res) {
    try {
      const { soundId } = req.params;
      const metadata = sanitizeMetadata(req.body);
      
      await this.plugin.localStorage.updateMetadata(soundId, metadata);
      
      this.logger.info(`[API] Metadata updated: ${soundId}`);
      
      res.json({ success: true });
    } catch (error) {
      this.logger.error('[API] Update meta failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * GET /api/new-soundboard/metrics
   * Get system metrics
   */
  async metrics(req, res) {
    try {
      const queueStats = this.plugin.queueManager.getStats();
      const storageStats = await this.plugin.localStorage.getStats();
      const wsStats = this.plugin.wsWrapper.getStats();
      const myinstantsStats = this.plugin.myinstantsAdapter.getStats();
      
      res.json({
        success: true,
        metrics: {
          queue: queueStats,
          storage: storageStats,
          websocket: wsStats,
          myinstants: myinstantsStats
        }
      });
    } catch (error) {
      this.logger.error('[API] Metrics failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * Serve sound files
   */
  async _serveSound(req, res, next) {
    try {
      const filename = path.basename(req.path);
      const buffer = await this.plugin.localStorage.readFile(filename);
      
      // Set appropriate headers
      res.set('Content-Type', 'audio/mpeg');
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch (error) {
      this.logger.error('[API] Serve sound failed:', error);
      res.status(404).json({ error: 'Sound not found' });
    }
  }
  
  /**
   * Get user info (placeholder - integrate with actual user system)
   */
  async _getUserInfo(userId) {
    // This should integrate with the actual TikTok user system
    // For now, return a basic structure
    return {
      id: userId,
      isFollower: false,
      isSuperfan: false,
      isSubscriber: false,
      teamMemberLevel: 0,
      isTopGifter: false,
      coins: 0
    };
  }
}

module.exports = ApiRoutes;
