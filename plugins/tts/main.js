const path = require('path');
const TikTokEngine = require('./engines/tiktok-engine');
const GoogleEngine = require('./engines/google-engine');
const CacheManager = require('./utils/cache-manager');
const LanguageDetector = require('./utils/language-detector');
const ProfanityFilter = require('./utils/profanity-filter');
const PermissionManager = require('./utils/permission-manager');
const QueueManager = require('./utils/queue-manager');

/**
 * TTS Plugin - Main Class
 * Enterprise-grade Text-to-Speech system with multi-engine support
 */
class TTSPlugin {
    constructor(api) {
        this.api = api;
        this.logger = api.logger;

        // Load configuration
        this.config = this._loadConfig();

        // Initialize engines
        this.engines = {
            tiktok: new TikTokEngine(this.logger),
            google: null // Initialized if API key is available
        };

        // Initialize Google engine if API key is configured
        if (this.config.googleApiKey) {
            this.engines.google = new GoogleEngine(this.config.googleApiKey, this.logger);
            this.logger.info('TTS: Google Cloud TTS engine initialized');
        }

        // Initialize utilities
        const cacheDir = path.join(this.api.getPluginDir(), 'cache');
        this.cache = new CacheManager(cacheDir, this.api.getDatabase(), this.config.cacheTTL, this.logger);
        this.languageDetector = new LanguageDetector(this.logger);
        this.profanityFilter = new ProfanityFilter(this.logger);
        this.permissionManager = new PermissionManager(this.api.getDatabase(), this.logger);
        this.queueManager = new QueueManager(this.config, this.logger);

        // Set profanity filter mode
        this.profanityFilter.setMode(this.config.profanityFilter);
        this.profanityFilter.setReplacement('asterisk');

        this.logger.info('TTS Plugin initialized successfully');
    }

    /**
     * Plugin initialization
     */
    async init() {
        try {
            // Register API routes
            this._registerRoutes();

            // Register Socket.IO events
            this._registerSocketEvents();

            // Register TikTok events (for chat messages)
            this._registerTikTokEvents();

            // Start queue processing
            this.queueManager.startProcessing(async (item) => {
                await this._playAudio(item);
            });

            this.logger.info('TTS Plugin: All systems ready');

        } catch (error) {
            this.logger.error(`TTS Plugin initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Load configuration from database or defaults
     */
    _loadConfig() {
        const defaultConfig = {
            defaultEngine: 'tiktok',
            defaultVoice: 'en_us_ghostface',
            volume: 80,
            speed: 1.0,
            teamMinLevel: 0,
            rateLimit: 3,
            rateLimitWindow: 60,
            maxQueueSize: 100,
            maxTextLength: 300,
            cacheTTL: 86400,
            profanityFilter: 'moderate',
            duckOtherAudio: false,
            duckVolume: 0.3,
            googleApiKey: null,
            enabledForChat: true,
            autoLanguageDetection: true
        };

        // Try to load from database
        const saved = this.api.getConfig('config');
        if (saved) {
            return { ...defaultConfig, ...saved };
        }

        // Save defaults
        this.api.setConfig('config', defaultConfig);
        return defaultConfig;
    }

    /**
     * Save configuration
     */
    _saveConfig() {
        this.api.setConfig('config', this.config);
    }

    /**
     * Register HTTP API routes
     */
    _registerRoutes() {
        // Get TTS configuration
        this.api.registerRoute('GET', '/api/tts/config', (req, res) => {
            res.json({
                success: true,
                config: {
                    ...this.config,
                    googleApiKey: this.config.googleApiKey ? '***HIDDEN***' : null
                }
            });
        });

        // Update TTS configuration
        this.api.registerRoute('POST', '/api/tts/config', (req, res) => {
            try {
                const updates = req.body;

                // Update config
                Object.keys(updates).forEach(key => {
                    if (updates[key] !== undefined && key in this.config) {
                        this.config[key] = updates[key];
                    }
                });

                // Update Google API key if provided
                if (updates.googleApiKey && updates.googleApiKey !== '***HIDDEN***') {
                    this.config.googleApiKey = updates.googleApiKey;
                    if (!this.engines.google) {
                        this.engines.google = new GoogleEngine(updates.googleApiKey, this.logger);
                        this.logger.info('Google TTS engine initialized via config update');
                    } else {
                        this.engines.google.setApiKey(updates.googleApiKey);
                    }
                }

                // Update profanity filter if changed
                if (updates.profanityFilter) {
                    this.profanityFilter.setMode(updates.profanityFilter);
                }

                this._saveConfig();

                res.json({ success: true, config: this.config });

            } catch (error) {
                this.logger.error(`Failed to update config: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get available voices
        this.api.registerRoute('GET', '/api/tts/voices', (req, res) => {
            const engine = req.query.engine || 'all';

            const voices = {};

            if (engine === 'all' || engine === 'tiktok') {
                voices.tiktok = TikTokEngine.getVoices();
            }

            if ((engine === 'all' || engine === 'google') && this.engines.google) {
                voices.google = GoogleEngine.getVoices();
            }

            res.json({ success: true, voices });
        });

        // Manual TTS trigger
        this.api.registerRoute('POST', '/api/tts/speak', async (req, res) => {
            try {
                const { text, userId, username, voiceId, engine, source = 'manual' } = req.body;

                if (!text || !username) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: text, username'
                    });
                }

                const result = await this.speak({
                    text,
                    userId: userId || username,
                    username,
                    voiceId,
                    engine,
                    source,
                    teamLevel: 999, // Manual triggers bypass team level
                    priority: 50 // High priority
                });

                res.json(result);

            } catch (error) {
                this.logger.error(`Manual TTS speak error: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get queue info
        this.api.registerRoute('GET', '/api/tts/queue', (req, res) => {
            res.json({
                success: true,
                queue: this.queueManager.getInfo(),
                stats: this.queueManager.getStats()
            });
        });

        // Clear queue
        this.api.registerRoute('POST', '/api/tts/queue/clear', (req, res) => {
            const count = this.queueManager.clear();
            res.json({ success: true, cleared: count });
        });

        // Skip current item
        this.api.registerRoute('POST', '/api/tts/queue/skip', (req, res) => {
            const skipped = this.queueManager.skipCurrent();
            res.json({ success: true, skipped });
        });

        // User management routes
        this.api.registerRoute('GET', '/api/tts/users', (req, res) => {
            const filter = req.query.filter || null;
            const users = this.permissionManager.getAllUsers(filter);
            res.json({ success: true, users });
        });

        this.api.registerRoute('POST', '/api/tts/users/:userId/allow', (req, res) => {
            const { userId } = req.params;
            const { username } = req.body;
            const result = this.permissionManager.allowUser(userId, username || userId);
            res.json({ success: result });
        });

        this.api.registerRoute('POST', '/api/tts/users/:userId/deny', (req, res) => {
            const { userId } = req.params;
            const { username } = req.body;
            const result = this.permissionManager.denyUser(userId, username || userId);
            res.json({ success: result });
        });

        this.api.registerRoute('POST', '/api/tts/users/:userId/blacklist', (req, res) => {
            const { userId } = req.params;
            const { username } = req.body;
            const result = this.permissionManager.blacklistUser(userId, username || userId);
            res.json({ success: result });
        });

        this.api.registerRoute('POST', '/api/tts/users/:userId/unblacklist', (req, res) => {
            const { userId } = req.params;
            const result = this.permissionManager.unblacklistUser(userId);
            res.json({ success: result });
        });

        this.api.registerRoute('POST', '/api/tts/users/:userId/voice', (req, res) => {
            const { userId } = req.params;
            const { username, voiceId, engine } = req.body;

            if (!voiceId || !engine) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: voiceId, engine'
                });
            }

            const result = this.permissionManager.assignVoice(
                userId,
                username || userId,
                voiceId,
                engine
            );
            res.json({ success: result });
        });

        this.api.registerRoute('DELETE', '/api/tts/users/:userId/voice', (req, res) => {
            const { userId } = req.params;
            const result = this.permissionManager.removeVoiceAssignment(userId);
            res.json({ success: result });
        });

        this.api.registerRoute('DELETE', '/api/tts/users/:userId', (req, res) => {
            const { userId } = req.params;
            const result = this.permissionManager.deleteUser(userId);
            res.json({ success: result });
        });

        // Cache management
        this.api.registerRoute('GET', '/api/tts/cache/stats', (req, res) => {
            const stats = this.cache.getStats();
            res.json({ success: true, stats });
        });

        this.api.registerRoute('POST', '/api/tts/cache/clear', async (req, res) => {
            const result = await this.cache.clear();
            res.json({ success: result });
        });

        // Permission stats
        this.api.registerRoute('GET', '/api/tts/permissions/stats', (req, res) => {
            const stats = this.permissionManager.getStats();
            res.json({ success: true, stats });
        });

        this.logger.info('TTS Plugin: HTTP routes registered');
    }

    /**
     * Register Socket.IO events
     */
    _registerSocketEvents() {
        // Client requests TTS
        this.api.registerSocket('tts:speak', async (socket, data) => {
            try {
                const result = await this.speak(data);
                socket.emit('tts:speak:response', result);
            } catch (error) {
                socket.emit('tts:error', { error: error.message });
            }
        });

        // Get queue status
        this.api.registerSocket('tts:queue:status', (socket) => {
            socket.emit('tts:queue:status', this.queueManager.getInfo());
        });

        // Clear queue
        this.api.registerSocket('tts:queue:clear', (socket) => {
            const count = this.queueManager.clear();
            socket.emit('tts:queue:cleared', { count });
            this.api.emit('tts:queue:cleared', { count });
        });

        // Skip current
        this.api.registerSocket('tts:queue:skip', (socket) => {
            const skipped = this.queueManager.skipCurrent();
            socket.emit('tts:queue:skipped', { skipped });
            this.api.emit('tts:queue:skipped', { skipped });
        });

        this.logger.info('TTS Plugin: Socket.IO events registered');
    }

    /**
     * Register TikTok events (for automatic chat TTS)
     */
    _registerTikTokEvents() {
        this.api.registerTikTokEvent('chat', async (data) => {
            try {
                // Only process if chat TTS is enabled
                if (!this.config.enabledForChat) {
                    return;
                }

                // Speak chat message
                await this.speak({
                    text: data.comment,
                    userId: data.userId || data.uniqueId,
                    username: data.uniqueId || data.nickname,
                    source: 'chat',
                    teamLevel: data.teamMemberLevel || 0,
                    isSubscriber: data.isSubscriber || false
                });

            } catch (error) {
                this.logger.error(`TTS chat event error: ${error.message}`);
            }
        });

        this.logger.info('TTS Plugin: TikTok events registered');
    }

    /**
     * Main speak method - synthesizes and queues TTS
     * @param {object} params - { text, userId, username, voiceId?, engine?, source?, teamLevel?, ... }
     */
    async speak(params) {
        const {
            text,
            userId,
            username,
            voiceId = null,
            engine = null,
            source = 'unknown',
            teamLevel = 0,
            isSubscriber = false,
            priority = null
        } = params;

        try {
            // Step 1: Check permissions
            const permissionCheck = this.permissionManager.checkPermission(
                userId,
                username,
                teamLevel,
                this.config.teamMinLevel
            );

            if (!permissionCheck.allowed) {
                this.logger.info(`TTS permission denied for ${username}: ${permissionCheck.reason}`);
                return {
                    success: false,
                    error: 'permission_denied',
                    reason: permissionCheck.reason,
                    details: permissionCheck
                };
            }

            // Step 2: Filter profanity
            const profanityResult = this.profanityFilter.filter(text);

            if (this.config.profanityFilter === 'strict' && profanityResult.action === 'drop') {
                this.logger.warn(`TTS dropped due to profanity: ${username} - "${text}"`);
                return {
                    success: false,
                    error: 'profanity_detected',
                    matches: profanityResult.matches
                };
            }

            const filteredText = profanityResult.filtered;

            // Step 3: Validate and truncate text
            if (!filteredText || filteredText.trim().length === 0) {
                return { success: false, error: 'empty_text' };
            }

            let finalText = filteredText.trim();
            if (finalText.length > this.config.maxTextLength) {
                finalText = finalText.substring(0, this.config.maxTextLength) + '...';
                this.logger.warn(`TTS text truncated for ${username}: ${text.length} -> ${this.config.maxTextLength}`);
            }

            // Step 4: Determine voice and engine
            const userSettings = this.permissionManager.getUserSettings(userId);
            let selectedEngine = engine || userSettings?.assigned_engine || this.config.defaultEngine;
            let selectedVoice = voiceId || userSettings?.assigned_voice_id;

            // Auto language detection if no voice assigned
            if (!selectedVoice && this.config.autoLanguageDetection) {
                const engineClass = selectedEngine === 'google' && this.engines.google
                    ? GoogleEngine
                    : TikTokEngine;

                const langResult = this.languageDetector.detectAndGetVoice(finalText, engineClass);
                selectedVoice = langResult.voiceId;

                this.logger.info(`Language detected: ${langResult.languageName} (${langResult.langCode}) for "${finalText.substring(0, 30)}..."`);
            }

            // Final fallback to default voice
            if (!selectedVoice) {
                selectedVoice = this.config.defaultVoice;
            }

            // Validate engine availability
            if (selectedEngine === 'google' && !this.engines.google) {
                this.logger.warn(`Google TTS requested but not available, falling back to TikTok`);
                selectedEngine = 'tiktok';
                selectedVoice = TikTokEngine.getDefaultVoiceForLanguage('en');
            }

            // Step 5: Check cache
            const cacheKey = `${finalText}_${selectedVoice}_${selectedEngine}_${this.config.speed}`;
            const cached = await this.cache.get(finalText, selectedVoice, selectedEngine, this.config.speed);

            let audioData;
            let fromCache = false;

            if (cached) {
                audioData = cached.audioData;
                fromCache = true;
            } else {
                // Step 6: Generate TTS
                const engine = this.engines[selectedEngine];
                if (!engine) {
                    throw new Error(`TTS engine not available: ${selectedEngine}`);
                }

                try {
                    audioData = await engine.synthesize(finalText, selectedVoice, this.config.speed);
                } catch (engineError) {
                    // Fallback to alternative engine
                    this.logger.error(`TTS engine ${selectedEngine} failed: ${engineError.message}, trying fallback`);

                    if (selectedEngine === 'google' && this.engines.tiktok) {
                        audioData = await this.engines.tiktok.synthesize(
                            finalText,
                            TikTokEngine.getDefaultVoiceForLanguage('en')
                        );
                        selectedEngine = 'tiktok';
                    } else {
                        throw engineError;
                    }
                }

                // Step 7: Cache audio
                await this.cache.set(finalText, selectedVoice, selectedEngine, audioData, null, this.config.speed);
            }

            // Step 8: Enqueue for playback
            const queueResult = this.queueManager.enqueue({
                userId,
                username,
                text: finalText,
                voice: selectedVoice,
                engine: selectedEngine,
                audioData,
                volume: this.config.volume * (userSettings?.volume_gain || 1.0),
                speed: this.config.speed,
                source,
                teamLevel,
                isSubscriber,
                priority,
                cached: fromCache
            });

            if (!queueResult.success) {
                return {
                    success: false,
                    error: queueResult.reason,
                    details: queueResult
                };
            }

            // Emit queue update event
            this.api.emit('tts:queued', {
                username,
                text: finalText,
                voice: selectedVoice,
                engine: selectedEngine,
                position: queueResult.position,
                queueSize: queueResult.queueSize,
                cached: fromCache
            });

            return {
                success: true,
                queued: true,
                position: queueResult.position,
                queueSize: queueResult.queueSize,
                estimatedWaitMs: queueResult.estimatedWaitMs,
                voice: selectedVoice,
                engine: selectedEngine,
                cached: fromCache
            };

        } catch (error) {
            this.logger.error(`TTS speak error: ${error.message}`);
            return {
                success: false,
                error: 'synthesis_failed',
                message: error.message
            };
        }
    }

    /**
     * Play audio (called by queue processor)
     */
    async _playAudio(item) {
        try {
            // Emit playback start event
            this.api.emit('tts:playback:started', {
                id: item.id,
                username: item.username,
                text: item.text
            });

            // Send audio to clients for playback
            this.api.emit('tts:play', {
                id: item.id,
                username: item.username,
                text: item.text,
                voice: item.voice,
                engine: item.engine,
                audioData: item.audioData,
                volume: item.volume,
                speed: item.speed,
                duckOther: this.config.duckOtherAudio,
                duckVolume: this.config.duckVolume
            });

            // Estimate playback duration
            const estimatedDuration = Math.ceil(item.text.length / 10 * 500) + 1000;

            // Wait for playback to complete
            await new Promise(resolve => setTimeout(resolve, estimatedDuration));

            // Emit playback end event
            this.api.emit('tts:playback:ended', {
                id: item.id,
                username: item.username
            });

        } catch (error) {
            this.logger.error(`TTS playback error: ${error.message}`);
            this.api.emit('tts:playback:error', {
                id: item.id,
                error: error.message
            });
        }
    }

    /**
     * Plugin cleanup
     */
    async destroy() {
        try {
            this.queueManager.stopProcessing();
            this.cache.destroy();
            this.logger.info('TTS Plugin destroyed');
        } catch (error) {
            this.logger.error(`TTS Plugin destroy error: ${error.message}`);
        }
    }
}

module.exports = TTSPlugin;
