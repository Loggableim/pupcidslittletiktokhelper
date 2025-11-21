const path = require('path');
const TikTokEngine = require('./engines/tiktok-engine');
const GoogleEngine = require('./engines/google-engine');
const SpeechifyEngine = require('./engines/speechify-engine');
const ElevenLabsEngine = require('./engines/elevenlabs-engine');
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

        // Startup timestamp - used to ignore historical chat messages
        this.startupTimestamp = new Date().toISOString();

        // Debug logging system
        this.debugLogs = [];
        this.maxDebugLogs = 500;
        this.debugEnabled = true;

        // Load configuration
        this.config = this._loadConfig();

        // Initialize engines
        this.engines = {
            tiktok: new TikTokEngine(this.logger),
            google: null, // Initialized if API key is available
            speechify: null, // Initialized if API key is available
            elevenlabs: null // Initialized if API key is available
        };

        // Initialize Google engine if API key is configured
        if (this.config.googleApiKey) {
            this.engines.google = new GoogleEngine(this.config.googleApiKey, this.logger);
            this.logger.info('TTS: Google Cloud TTS engine initialized');
            this._logDebug('INIT', 'Google TTS engine initialized', { hasApiKey: true });
        } else {
            this._logDebug('INIT', 'Google TTS engine NOT initialized', { hasApiKey: false });
        }

        // Initialize Speechify engine if API key is configured
        if (this.config.speechifyApiKey) {
            this.engines.speechify = new SpeechifyEngine(
                this.config.speechifyApiKey,
                this.logger,
                this.config
            );
            this.logger.info('TTS: Speechify TTS engine initialized');
            this._logDebug('INIT', 'Speechify TTS engine initialized', { hasApiKey: true });
        } else {
            this._logDebug('INIT', 'Speechify TTS engine NOT initialized', { hasApiKey: false });
        }

        // Initialize ElevenLabs engine if API key is configured
        if (this.config.elevenlabsApiKey) {
            this.engines.elevenlabs = new ElevenLabsEngine(
                this.config.elevenlabsApiKey,
                this.logger,
                this.config
            );
            this.logger.info('TTS: ElevenLabs TTS engine initialized');
            this._logDebug('INIT', 'ElevenLabs TTS engine initialized', { hasApiKey: true });
        } else {
            this._logDebug('INIT', 'ElevenLabs TTS engine NOT initialized', { hasApiKey: false });
        }

        // Initialize utilities
        this.languageDetector = new LanguageDetector(this.logger, {
            confidenceThreshold: this.config.languageConfidenceThreshold,
            fallbackLanguage: this.config.fallbackLanguage,
            minTextLength: this.config.languageMinTextLength
        });
        this.profanityFilter = new ProfanityFilter(this.logger);
        this.permissionManager = new PermissionManager(this.api.getDatabase(), this.logger);
        this.queueManager = new QueueManager(this.config, this.logger);

        // Set profanity filter mode
        this.profanityFilter.setMode(this.config.profanityFilter);
        this.profanityFilter.setReplacement('asterisk');

        this._logDebug('INIT', 'TTS Plugin initialized', {
            defaultEngine: this.config.defaultEngine,
            defaultVoice: this.config.defaultVoice,
            enabledForChat: this.config.enabledForChat,
            autoLanguageDetection: this.config.autoLanguageDetection,
            startupTimestamp: this.startupTimestamp
        });

        this.logger.info('TTS Plugin initialized successfully');
    }

    /**
     * Internal debug logging
     */
    _logDebug(category, message, data = {}) {
        if (!this.debugEnabled) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            category,
            message,
            data
        };

        this.debugLogs.push(logEntry);

        // Keep only last N logs
        if (this.debugLogs.length > this.maxDebugLogs) {
            this.debugLogs.shift();
        }

        // Emit to clients
        this.api.emit('tts:debug', logEntry);

        // Also log to console with category prefix
        this.logger.info(`[TTS:${category}] ${message}`, data);
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
            profanityFilter: 'moderate',
            duckOtherAudio: false,
            duckVolume: 0.3,
            googleApiKey: null,
            speechifyApiKey: null,
            elevenlabsApiKey: null,
            enabledForChat: true,
            autoLanguageDetection: true,
            // New language detection settings
            fallbackLanguage: 'de', // Default fallback language (German)
            languageConfidenceThreshold: 0.90, // 90% confidence required
            languageMinTextLength: 10 // Minimum text length for reliable detection
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
                    googleApiKey: this.config.googleApiKey ? '***HIDDEN***' : null,
                    speechifyApiKey: this.config.speechifyApiKey ? '***REDACTED***' : null,
                    elevenlabsApiKey: this.config.elevenlabsApiKey ? '***REDACTED***' : null
                }
            });
        });

        // Update TTS configuration
        this.api.registerRoute('POST', '/api/tts/config', async (req, res) => {
            try {
                const updates = req.body;

                // Validate defaultVoice is compatible with defaultEngine
                if (updates.defaultVoice && updates.defaultEngine) {
                    let engineVoices = {};

                    try {
                        if (updates.defaultEngine === 'tiktok') {
                            engineVoices = TikTokEngine.getVoices();
                        } else if (updates.defaultEngine === 'google' && this.engines.google) {
                            engineVoices = GoogleEngine.getVoices();
                        } else if (updates.defaultEngine === 'speechify' && this.engines.speechify) {
                            engineVoices = await this.engines.speechify.getVoices();
                        } else if (updates.defaultEngine === 'elevenlabs' && this.engines.elevenlabs) {
                            engineVoices = await this.engines.elevenlabs.getVoices();
                        }
                    } catch (error) {
                        this._logDebug('config', 'Failed to fetch voices for validation', { error: error.message });
                        return res.status(500).json({
                            success: false,
                            error: `Failed to fetch voices: ${error.message}`
                        });
                    }

                    if (!engineVoices[updates.defaultVoice]) {
                        return res.status(400).json({
                            success: false,
                            error: `Voice '${updates.defaultVoice}' is not available for engine '${updates.defaultEngine}'`
                        });
                    }
                }

                // Update config (skip API keys - they have dedicated handling below)
                Object.keys(updates).forEach(key => {
                    if (updates[key] !== undefined && key in this.config && key !== 'googleApiKey' && key !== 'speechifyApiKey' && key !== 'elevenlabsApiKey') {
                        this.config[key] = updates[key];
                    }
                });

                // Update Google API key if provided (and not the placeholder)
                if (updates.googleApiKey && updates.googleApiKey !== '***HIDDEN***') {
                    this.config.googleApiKey = updates.googleApiKey;
                    if (!this.engines.google) {
                        this.engines.google = new GoogleEngine(updates.googleApiKey, this.logger);
                        this.logger.info('Google TTS engine initialized via config update');
                    } else {
                        this.engines.google.setApiKey(updates.googleApiKey);
                    }
                }

                // Update Speechify API key if provided (and not the placeholder)
                if (updates.speechifyApiKey && updates.speechifyApiKey !== '***REDACTED***') {
                    this.config.speechifyApiKey = updates.speechifyApiKey;
                    if (!this.engines.speechify) {
                        this.engines.speechify = new SpeechifyEngine(
                            updates.speechifyApiKey,
                            this.logger,
                            this.config
                        );
                        this.logger.info('Speechify TTS engine initialized via config update');
                    } else {
                        this.engines.speechify.setApiKey(updates.speechifyApiKey);
                    }
                }

                // Update ElevenLabs API key if provided (and not the placeholder)
                if (updates.elevenlabsApiKey && updates.elevenlabsApiKey !== '***REDACTED***') {
                    this.config.elevenlabsApiKey = updates.elevenlabsApiKey;
                    if (!this.engines.elevenlabs) {
                        this.engines.elevenlabs = new ElevenLabsEngine(
                            updates.elevenlabsApiKey,
                            this.logger,
                            this.config
                        );
                        this.logger.info('ElevenLabs TTS engine initialized via config update');
                    } else {
                        this.engines.elevenlabs.setApiKey(updates.elevenlabsApiKey);
                    }
                }

                // Update profanity filter if changed
                if (updates.profanityFilter) {
                    this.profanityFilter.setMode(updates.profanityFilter);
                }

                // Update language detector configuration if changed
                if (updates.fallbackLanguage || updates.languageConfidenceThreshold || updates.languageMinTextLength) {
                    this.languageDetector.updateConfig({
                        fallbackLanguage: updates.fallbackLanguage,
                        confidenceThreshold: updates.languageConfidenceThreshold,
                        minTextLength: updates.languageMinTextLength
                    });
                    this._logDebug('CONFIG', 'Language detector configuration updated', {
                        fallbackLanguage: updates.fallbackLanguage,
                        confidenceThreshold: updates.languageConfidenceThreshold,
                        minTextLength: updates.languageMinTextLength
                    });
                }

                this._saveConfig();

                res.json({ success: true, config: this.config });

            } catch (error) {
                this.logger.error(`Failed to update config: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get available voices
        this.api.registerRoute('GET', '/api/tts/voices', async (req, res) => {
            const engine = req.query.engine || 'all';

            const voices = {};

            if (engine === 'all' || engine === 'tiktok') {
                voices.tiktok = TikTokEngine.getVoices();
            }

            if ((engine === 'all' || engine === 'google') && this.engines.google) {
                voices.google = GoogleEngine.getVoices();
            }

            if ((engine === 'all' || engine === 'speechify') && this.engines.speechify) {
                try {
                    voices.speechify = await this.engines.speechify.getVoices();
                } catch (error) {
                    this.logger.error('Failed to load Speechify voices', { error: error.message });
                    voices.speechify = {};
                }
            }

            if ((engine === 'all' || engine === 'elevenlabs') && this.engines.elevenlabs) {
                try {
                    voices.elevenlabs = await this.engines.elevenlabs.getVoices();
                } catch (error) {
                    this.logger.error('Failed to load ElevenLabs voices', { error: error.message });
                    voices.elevenlabs = {};
                }
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

        // Permission stats
        this.api.registerRoute('GET', '/api/tts/permissions/stats', (req, res) => {
            const stats = this.permissionManager.getStats();
            res.json({ success: true, stats });
        });

        // Debug logs
        this.api.registerRoute('GET', '/api/tts/debug/logs', (req, res) => {
            const limit = parseInt(req.query.limit) || 100;
            const category = req.query.category || null;

            let logs = this.debugLogs;

            if (category) {
                logs = logs.filter(log => log.category === category);
            }

            res.json({
                success: true,
                logs: logs.slice(-limit),
                totalLogs: this.debugLogs.length
            });
        });

        // Clear debug logs
        this.api.registerRoute('POST', '/api/tts/debug/clear', (req, res) => {
            const count = this.debugLogs.length;
            this.debugLogs = [];
            res.json({ success: true, cleared: count });
        });

        // Enable/disable debug
        this.api.registerRoute('POST', '/api/tts/debug/toggle', (req, res) => {
            this.debugEnabled = !this.debugEnabled;
            this._logDebug('DEBUG', `Debug logging ${this.debugEnabled ? 'enabled' : 'disabled'}`);
            res.json({ success: true, debugEnabled: this.debugEnabled });
        });

        // Get plugin status
        this.api.registerRoute('GET', '/api/tts/status', (req, res) => {
            res.json({
                success: true,
                status: {
                    initialized: true,
                    config: {
                        defaultEngine: this.config.defaultEngine,
                        defaultVoice: this.config.defaultVoice,
                        enabledForChat: this.config.enabledForChat,
                        autoLanguageDetection: this.config.autoLanguageDetection,
                        volume: this.config.volume,
                        speed: this.config.speed
                    },
                    engines: {
                        tiktok: !!this.engines.tiktok,
                        google: !!this.engines.google,
                        speechify: !!this.engines.speechify
                    },
                    queue: this.queueManager.getInfo(),
                    debugEnabled: this.debugEnabled,
                    totalDebugLogs: this.debugLogs.length
                }
            });
        });

        // Get recent active chat users for autocomplete
        this.api.registerRoute('GET', '/api/tts/recent-users', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                
                // Query event_logs for recent chat messages
                const stmt = this.db.db.prepare(`
                    SELECT DISTINCT username, MAX(timestamp) as last_seen
                    FROM event_logs
                    WHERE event_type = 'chat' AND username IS NOT NULL AND username != ''
                    GROUP BY username
                    ORDER BY last_seen DESC
                    LIMIT ?
                `);
                
                const users = stmt.all(limit);
                
                res.json({
                    success: true,
                    users: users.map(u => ({
                        username: u.username,
                        lastSeen: u.last_seen
                    }))
                });
            } catch (error) {
                this.logger.error(`Failed to get recent users: ${error.message}`);
                res.json({ success: false, error: error.message });
            }
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
                // Skip historical messages - only process messages that arrive after plugin startup
                if (data.timestamp && data.timestamp < this.startupTimestamp) {
                    this._logDebug('TIKTOK_EVENT', 'Skipping historical chat message', {
                        messageTimestamp: data.timestamp,
                        startupTimestamp: this.startupTimestamp,
                        username: data.uniqueId || data.nickname
                    });
                    this.logger.info(`TTS: Skipping historical chat message from ${data.uniqueId || data.nickname}`);
                    return;
                }

                // Extract text from either 'message' or 'comment' field
                const chatText = data.message || data.comment;

                // IMPORTANT: Use uniqueId as the primary userId for consistency
                // uniqueId is the TikTok username and is stable across sessions
                const userId = data.uniqueId || data.nickname || data.userId;
                const username = data.uniqueId || data.nickname;

                this._logDebug('TIKTOK_EVENT', 'Chat event received', {
                    uniqueId: data.uniqueId,
                    nickname: data.nickname,
                    message: chatText,
                    teamMemberLevel: data.teamMemberLevel,
                    isSubscriber: data.isSubscriber,
                    userId: data.userId,
                    normalizedUserId: userId,
                    normalizedUsername: username,
                    timestamp: data.timestamp
                });

                this.logger.info(`TTS: Received chat event from ${username}: "${chatText}"`);

                // Only process if chat TTS is enabled
                // Note: Global tts_enabled check is now in speak() method
                if (!this.config.enabledForChat) {
                    this._logDebug('TIKTOK_EVENT', 'Chat TTS disabled in config', { enabledForChat: false });
                    this.logger.warn('TTS: Chat TTS is disabled in config');
                    return;
                }

                // Speak chat message
                const result = await this.speak({
                    text: chatText,
                    userId: userId,
                    username: username,
                    source: 'chat',
                    teamLevel: data.teamMemberLevel || 0,
                    isSubscriber: data.isSubscriber || false
                });

                if (!result.success) {
                    this._logDebug('TIKTOK_EVENT', 'Chat message rejected', {
                        error: result.error,
                        reason: result.reason,
                        details: result.details
                    });
                    this.logger.warn(`TTS: Chat message rejected: ${result.error} - ${result.reason || ''}`);
                } else {
                    this._logDebug('TIKTOK_EVENT', 'Chat message queued successfully', {
                        position: result.position,
                        queueSize: result.queueSize
                    });
                }

            } catch (error) {
                this._logDebug('TIKTOK_EVENT', 'Chat event error', {
                    error: error.message,
                    stack: error.stack
                });
                this.logger.error(`TTS chat event error: ${error.message}`);
            }
        });

        this._logDebug('INIT', 'TikTok events registered', { enabledForChat: this.config.enabledForChat });
        this.logger.info(`TTS Plugin: TikTok events registered (enabledForChat: ${this.config.enabledForChat})`);
    }

    /**
     * Main speak method - synthesizes and queues TTS
     * @param {object} params - { text, userId, username, voiceId?, engine?, source?, teamLevel?, ... }
     */
    async speak(params) {
        // ===== GLOBAL TTS ENABLE/DISABLE CHECK =====
        // This check MUST be first to block ALL TTS calls when disabled
        const db = this.api.getDatabase();
        const ttsEnabled = db.getSetting('tts_enabled');
        if (ttsEnabled === 'false') {
            this._logDebug('SPEAK_BLOCKED', 'TTS is globally disabled via Quick Actions', {
                tts_enabled: false,
                source: params.source || 'unknown'
            });
            this.logger.info(`TTS: Blocked - TTS is globally disabled (source: ${params.source || 'unknown'})`);
            return {
                success: false,
                error: 'TTS is globally disabled',
                blocked: true,
                reason: 'tts_disabled'
            };
        }

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

        this._logDebug('SPEAK_START', 'Speak method called', {
            text: text?.substring(0, 50),
            userId,
            username,
            voiceId,
            engine,
            source,
            teamLevel,
            isSubscriber,
            priority
        });

        try {
            // Step 1: Check permissions
            this._logDebug('SPEAK_STEP1', 'Checking permissions', {
                userId,
                username,
                teamLevel,
                minTeamLevel: this.config.teamMinLevel
            });

            const permissionCheck = this.permissionManager.checkPermission(
                userId,
                username,
                teamLevel,
                this.config.teamMinLevel
            );

            this._logDebug('SPEAK_STEP1', 'Permission check result', permissionCheck);

            if (!permissionCheck.allowed) {
                this._logDebug('SPEAK_DENIED', 'Permission denied', {
                    username,
                    reason: permissionCheck.reason
                });
                this.logger.info(`TTS permission denied for ${username}: ${permissionCheck.reason}`);
                return {
                    success: false,
                    error: 'permission_denied',
                    reason: permissionCheck.reason,
                    details: permissionCheck
                };
            }

            // Step 2: Filter profanity
            this._logDebug('SPEAK_STEP2', 'Filtering profanity', {
                text,
                mode: this.config.profanityFilter
            });

            const profanityResult = this.profanityFilter.filter(text);

            this._logDebug('SPEAK_STEP2', 'Profanity filter result', {
                hasProfanity: profanityResult.hasProfanity,
                action: profanityResult.action,
                matches: profanityResult.matches
            });

            if (this.config.profanityFilter === 'strict' && profanityResult.action === 'drop') {
                this._logDebug('SPEAK_DENIED', 'Dropped due to profanity', {
                    username,
                    text,
                    matches: profanityResult.matches
                });
                this.logger.warn(`TTS dropped due to profanity: ${username} - "${text}"`);
                return {
                    success: false,
                    error: 'profanity_detected',
                    matches: profanityResult.matches
                };
            }

            const filteredText = profanityResult.filtered;

            // Step 3: Validate and truncate text
            this._logDebug('SPEAK_STEP3', 'Validating text', {
                originalLength: text?.length,
                filteredLength: filteredText?.length
            });

            if (!filteredText || filteredText.trim().length === 0) {
                this._logDebug('SPEAK_DENIED', 'Empty text after filtering');
                return { success: false, error: 'empty_text' };
            }

            let finalText = filteredText.trim();
            if (finalText.length > this.config.maxTextLength) {
                finalText = finalText.substring(0, this.config.maxTextLength) + '...';
                this._logDebug('SPEAK_STEP3', 'Text truncated', {
                    originalLength: text.length,
                    truncatedLength: this.config.maxTextLength
                });
                this.logger.warn(`TTS text truncated for ${username}: ${text.length} -> ${this.config.maxTextLength}`);
            }

            // Step 4: Determine voice and engine
            this._logDebug('SPEAK_STEP4', 'Getting user settings', { userId });

            const userSettings = this.permissionManager.getUserSettings(userId);
            let selectedEngine = engine || userSettings?.assigned_engine || this.config.defaultEngine;
            let selectedVoice = voiceId || userSettings?.assigned_voice_id;

            this._logDebug('SPEAK_STEP4', 'Voice/Engine selection', {
                userId: userId,
                username: username,
                userSettingsFound: !!userSettings,
                userSettingsRaw: userSettings ? {
                    user_id: userSettings.user_id,
                    username: userSettings.username,
                    assigned_voice_id: userSettings.assigned_voice_id,
                    assigned_engine: userSettings.assigned_engine,
                    allow_tts: userSettings.allow_tts
                } : null,
                requestedEngine: engine,
                assignedEngine: userSettings?.assigned_engine,
                selectedEngine,
                requestedVoice: voiceId,
                assignedVoice: userSettings?.assigned_voice_id,
                selectedVoice,
                autoLanguageDetection: this.config.autoLanguageDetection,
                defaultEngine: this.config.defaultEngine,
                defaultVoice: this.config.defaultVoice
            });

            // Priority 1: Auto language detection (if enabled and no user-assigned voice)
            if (!selectedVoice && this.config.autoLanguageDetection) {
                let engineClass = TikTokEngine;
                if (selectedEngine === 'speechify' && this.engines.speechify) {
                    engineClass = SpeechifyEngine;
                } else if (selectedEngine === 'google' && this.engines.google) {
                    engineClass = GoogleEngine;
                } else if (selectedEngine === 'elevenlabs' && this.engines.elevenlabs) {
                    engineClass = ElevenLabsEngine;
                }

                this._logDebug('SPEAK_STEP4', 'Starting language detection', {
                    text: finalText.substring(0, 50),
                    textLength: finalText.length,
                    engineClass: engineClass.name,
                    fallbackLanguage: this.config.fallbackLanguage,
                    confidenceThreshold: this.config.languageConfidenceThreshold,
                    minTextLength: this.config.languageMinTextLength
                });

                const langResult = this.languageDetector.detectAndGetVoice(
                    finalText, 
                    engineClass,
                    this.config.fallbackLanguage
                );

                this._logDebug('SPEAK_STEP4', 'Language detection result', {
                    originalText: text.substring(0, 50),
                    normalizedText: finalText.substring(0, 50),
                    textLength: finalText.length,
                    result: langResult
                });

                if (langResult && langResult.voiceId) {
                    selectedVoice = langResult.voiceId;
                    
                    // Log comprehensive detection information
                    if (langResult.usedFallback) {
                        this.logger.warn(
                            `Language detection FALLBACK: ` +
                            `Detected="${langResult.detectedLangCode || 'N/A'}" ` +
                            `(confidence: ${(langResult.confidence * 100).toFixed(0)}% < ${(this.config.languageConfidenceThreshold * 100).toFixed(0)}% threshold), ` +
                            `Using fallback="${langResult.langCode}" (${langResult.languageName}), ` +
                            `Voice="${langResult.voiceId}", ` +
                            `Reason="${langResult.reason}", ` +
                            `Text="${finalText.substring(0, 50)}..."`
                        );
                        this._logDebug('LANG_DETECTION_FALLBACK', 'Used fallback language', {
                            originalText: text.substring(0, 50),
                            normalizedText: finalText.substring(0, 50),
                            detectedLangCode: langResult.detectedLangCode,
                            confidence: langResult.confidence,
                            threshold: langResult.threshold,
                            fallbackLangCode: langResult.langCode,
                            fallbackLanguageName: langResult.languageName,
                            selectedVoice: langResult.voiceId,
                            reason: langResult.reason,
                            engine: selectedEngine
                        });
                    } else {
                        this.logger.info(
                            `Language detected: ${langResult.languageName} (${langResult.langCode}) ` +
                            `with confidence ${(langResult.confidence * 100).toFixed(0)}% >= ${(this.config.languageConfidenceThreshold * 100).toFixed(0)}% threshold, ` +
                            `Voice="${langResult.voiceId}" for "${finalText.substring(0, 30)}..."`
                        );
                        this._logDebug('LANG_DETECTION_SUCCESS', 'Language detected with high confidence', {
                            originalText: text.substring(0, 50),
                            normalizedText: finalText.substring(0, 50),
                            langCode: langResult.langCode,
                            languageName: langResult.languageName,
                            confidence: langResult.confidence,
                            threshold: langResult.threshold,
                            selectedVoice: langResult.voiceId,
                            engine: selectedEngine
                        });
                    }
                } else {
                    // Language detection completely failed - use system fallback
                    this.logger.error('Language detection returned null or invalid result, using system fallback');
                    this._logDebug('LANG_DETECTION_ERROR', 'Detection failed completely', {
                        result: langResult,
                        systemFallback: this.config.fallbackLanguage
                    });
                    
                    // Get fallback voice from engine
                    const fallbackVoice = engineClass.getDefaultVoiceForLanguage(this.config.fallbackLanguage);
                    if (fallbackVoice) {
                        selectedVoice = fallbackVoice;
                        this.logger.info(`Using system fallback voice: ${fallbackVoice} for language: ${this.config.fallbackLanguage}`);
                    }
                }
            }

            // Priority 2: Use configured default voice if language detection is disabled or failed
            if (!selectedVoice && this.config.defaultVoice) {
                selectedVoice = this.config.defaultVoice;
                this._logDebug('SPEAK_STEP4', 'Using configured default voice (language detection disabled or failed)', { selectedVoice });
            }

            // Final fallback to hardcoded default if nothing else worked
            if (!selectedVoice || selectedVoice === 'undefined' || selectedVoice === 'null') {
                // Use fallback language voice as last resort
                const fallbackVoice = TikTokEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage);
                selectedVoice = fallbackVoice || 'en_us_ghostface'; // Absolute hardcoded fallback
                this._logDebug('SPEAK_STEP4', 'Using absolute fallback voice', {
                    selectedVoice,
                    reason: 'no_voice_selected',
                    fallbackLanguage: this.config.fallbackLanguage
                });
                this.logger.warn(`No voice selected, using absolute fallback: ${selectedVoice}`);
            }

            // Validate engine availability
            if (selectedEngine === 'elevenlabs' && !this.engines.elevenlabs) {
                this._logDebug('SPEAK_STEP4', 'ElevenLabs engine not available, falling back');
                this.logger.warn(`ElevenLabs TTS requested but not available, falling back`);

                // Fallback to Speechify, Google, or TikTok
                if (this.engines.speechify) {
                    selectedEngine = 'speechify';
                    const speechifyVoices = await this.engines.speechify.getVoices();
                    if (!selectedVoice || !speechifyVoices[selectedVoice]) {
                        const langResult = this.languageDetector.detectAndGetVoice(finalText, SpeechifyEngine, this.config.fallbackLanguage);
                        selectedVoice = langResult?.voiceId || SpeechifyEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                        this._logDebug('SPEAK_STEP4', 'Voice reset for Speechify fallback', { selectedVoice, langResult });
                    }
                } else if (this.engines.google) {
                    selectedEngine = 'google';
                    const googleVoices = GoogleEngine.getVoices();
                    if (!selectedVoice || !googleVoices[selectedVoice]) {
                        const langResult = this.languageDetector.detectAndGetVoice(finalText, GoogleEngine, this.config.fallbackLanguage);
                        selectedVoice = langResult?.voiceId || GoogleEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                        this._logDebug('SPEAK_STEP4', 'Voice reset for Google fallback', { selectedVoice, langResult });
                    }
                } else {
                    selectedEngine = 'tiktok';
                    const tiktokVoices = TikTokEngine.getVoices();
                    if (!selectedVoice || !tiktokVoices[selectedVoice]) {
                        const langResult = this.languageDetector.detectAndGetVoice(finalText, TikTokEngine, this.config.fallbackLanguage);
                        selectedVoice = langResult?.voiceId || TikTokEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                        this._logDebug('SPEAK_STEP4', 'Voice reset for TikTok fallback', { selectedVoice, langResult });
                    }
                }
            }

            if (selectedEngine === 'speechify' && !this.engines.speechify) {
                this._logDebug('SPEAK_STEP4', 'Speechify engine not available, falling back to Google/TikTok');
                this.logger.warn(`Speechify TTS requested but not available, falling back`);

                // Fallback to Google if available, otherwise TikTok
                if (this.engines.google) {
                    selectedEngine = 'google';
                    const googleVoices = GoogleEngine.getVoices();
                    if (!selectedVoice || !googleVoices[selectedVoice]) {
                        const langResult = this.languageDetector.detectAndGetVoice(finalText, GoogleEngine, this.config.fallbackLanguage);
                        selectedVoice = langResult?.voiceId || GoogleEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                        this._logDebug('SPEAK_STEP4', 'Voice reset for Google fallback', { selectedVoice, langResult });
                    }
                } else {
                    selectedEngine = 'tiktok';
                    const tiktokVoices = TikTokEngine.getVoices();
                    if (!selectedVoice || !tiktokVoices[selectedVoice]) {
                        const langResult = this.languageDetector.detectAndGetVoice(finalText, TikTokEngine, this.config.fallbackLanguage);
                        selectedVoice = langResult?.voiceId || TikTokEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                        this._logDebug('SPEAK_STEP4', 'Voice reset for TikTok fallback', { selectedVoice, langResult });
                    }
                }
            }

            if (selectedEngine === 'google' && !this.engines.google) {
                this._logDebug('SPEAK_STEP4', 'Google engine not available, falling back to TikTok');
                this.logger.warn(`Google TTS requested but not available, falling back to TikTok`);
                selectedEngine = 'tiktok';
                // Keep the selectedVoice if it's valid for TikTok, otherwise use language detection
                const tiktokVoices = TikTokEngine.getVoices();
                if (!selectedVoice || !tiktokVoices[selectedVoice]) {
                    // Try to detect language from text
                    const langResult = this.languageDetector.detectAndGetVoice(finalText, TikTokEngine, this.config.fallbackLanguage);
                    selectedVoice = langResult?.voiceId || TikTokEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('SPEAK_STEP4', 'Voice reset for TikTok fallback', { selectedVoice, langResult });
                }
            }

            // Step 5: Generate TTS (no caching)
            this._logDebug('SPEAK_STEP5', 'Starting TTS synthesis', {
                engine: selectedEngine,
                voice: selectedVoice,
                textLength: finalText.length,
                speed: this.config.speed
            });

            const ttsEngine = this.engines[selectedEngine];
            if (!ttsEngine) {
                this._logDebug('SPEAK_ERROR', 'Engine not available', { selectedEngine });
                throw new Error(`TTS engine not available: ${selectedEngine}`);
            }

            let audioData;
            try {
                audioData = await ttsEngine.synthesize(finalText, selectedVoice, this.config.speed);
                this._logDebug('SPEAK_STEP5', 'TTS synthesis successful', {
                    engine: selectedEngine,
                    voice: selectedVoice,
                    audioDataLength: audioData?.length || 0
                });
            } catch (engineError) {
                // Fallback to alternative engine
                this._logDebug('SPEAK_STEP5', 'TTS engine failed, trying fallback', {
                    failedEngine: selectedEngine,
                    error: engineError.message
                });
                this.logger.error(`TTS engine ${selectedEngine} failed: ${engineError.message}, trying fallback`);

                // Fallback chain: ElevenLabs → Speechify → Google → TikTok
                if (selectedEngine === 'elevenlabs') {
                    // Try Speechify first, then Google, then TikTok
                    if (this.engines.speechify) {
                        let fallbackVoice = selectedVoice;
                        const speechifyVoices = await this.engines.speechify.getVoices();
                        if (!fallbackVoice || !speechifyVoices[fallbackVoice]) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, SpeechifyEngine, this.config.fallbackLanguage);
                            fallbackVoice = langResult?.voiceId || SpeechifyEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP5', 'Voice adjusted for Speechify fallback', { fallbackVoice, langResult });
                        }

                        audioData = await this.engines.speechify.synthesize(finalText, fallbackVoice, this.config.speed);
                        selectedEngine = 'speechify';
                        selectedVoice = fallbackVoice;
                        this._logDebug('SPEAK_STEP5', 'Fallback synthesis successful', {
                            fallbackEngine: 'speechify',
                            fallbackVoice,
                            audioDataLength: audioData?.length || 0
                        });
                    } else if (this.engines.google) {
                        let fallbackVoice = selectedVoice;
                        const googleVoices = GoogleEngine.getVoices();
                        if (!fallbackVoice || !googleVoices[fallbackVoice]) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, GoogleEngine, this.config.fallbackLanguage);
                            fallbackVoice = langResult?.voiceId || GoogleEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP5', 'Voice adjusted for Google fallback', { fallbackVoice, langResult });
                        }

                        audioData = await this.engines.google.synthesize(finalText, fallbackVoice, this.config.speed);
                        selectedEngine = 'google';
                        selectedVoice = fallbackVoice;
                        this._logDebug('SPEAK_STEP5', 'Fallback synthesis successful', {
                            fallbackEngine: 'google',
                            fallbackVoice,
                            audioDataLength: audioData?.length || 0
                        });
                    } else if (this.engines.tiktok) {
                        let fallbackVoice = selectedVoice;
                        const tiktokVoices = TikTokEngine.getVoices();
                        if (!fallbackVoice || !tiktokVoices[fallbackVoice]) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, TikTokEngine, this.config.fallbackLanguage);
                            fallbackVoice = langResult?.voiceId || TikTokEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP5', 'Voice adjusted for TikTok fallback', { fallbackVoice, langResult });
                        }

                        audioData = await this.engines.tiktok.synthesize(finalText, fallbackVoice);
                        selectedEngine = 'tiktok';
                        selectedVoice = fallbackVoice;
                        this._logDebug('SPEAK_STEP5', 'Fallback synthesis successful', {
                            fallbackEngine: 'tiktok',
                            fallbackVoice,
                            audioDataLength: audioData?.length || 0
                        });
                    } else {
                        this._logDebug('SPEAK_ERROR', 'No fallback available', { error: engineError.message });
                        throw engineError;
                    }
                } else if (selectedEngine === 'speechify') {
                    // Try Google first, then TikTok
                    if (this.engines.google) {
                        let fallbackVoice = selectedVoice;
                        const googleVoices = GoogleEngine.getVoices();
                        if (!fallbackVoice || !googleVoices[fallbackVoice]) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, GoogleEngine, this.config.fallbackLanguage);
                            fallbackVoice = langResult?.voiceId || GoogleEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP5', 'Voice adjusted for Google fallback', { fallbackVoice, langResult });
                        }

                        audioData = await this.engines.google.synthesize(finalText, fallbackVoice, this.config.speed);
                        selectedEngine = 'google';
                        selectedVoice = fallbackVoice;
                        this._logDebug('SPEAK_STEP5', 'Fallback synthesis successful', {
                            fallbackEngine: 'google',
                            fallbackVoice,
                            audioDataLength: audioData?.length || 0
                        });
                    } else if (this.engines.tiktok) {
                        let fallbackVoice = selectedVoice;
                        const tiktokVoices = TikTokEngine.getVoices();
                        if (!fallbackVoice || !tiktokVoices[fallbackVoice]) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, TikTokEngine, this.config.fallbackLanguage);
                            fallbackVoice = langResult?.voiceId || TikTokEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP5', 'Voice adjusted for TikTok fallback', { fallbackVoice, langResult });
                        }

                        audioData = await this.engines.tiktok.synthesize(finalText, fallbackVoice);
                        selectedEngine = 'tiktok';
                        selectedVoice = fallbackVoice;
                        this._logDebug('SPEAK_STEP5', 'Fallback synthesis successful', {
                            fallbackEngine: 'tiktok',
                            fallbackVoice,
                            audioDataLength: audioData?.length || 0
                        });
                    } else {
                        this._logDebug('SPEAK_ERROR', 'No fallback available', { error: engineError.message });
                        throw engineError;
                    }
                } else if (selectedEngine === 'google' && this.engines.tiktok) {
                    // Try to keep the voice if it's valid for TikTok, otherwise detect language
                    let fallbackVoice = selectedVoice;
                    const tiktokVoices = TikTokEngine.getVoices();
                    if (!fallbackVoice || !tiktokVoices[fallbackVoice]) {
                        // Try to detect language from text
                        const langResult = this.languageDetector.detectAndGetVoice(finalText, TikTokEngine, this.config.fallbackLanguage);
                        fallbackVoice = langResult?.voiceId || TikTokEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                        this._logDebug('SPEAK_STEP5', 'Voice adjusted for TikTok fallback', { fallbackVoice, langResult });
                    }

                    audioData = await this.engines.tiktok.synthesize(
                        finalText,
                        fallbackVoice
                    );
                    selectedEngine = 'tiktok';
                    selectedVoice = fallbackVoice;
                    this._logDebug('SPEAK_STEP5', 'Fallback synthesis successful', {
                        fallbackEngine: 'tiktok',
                        fallbackVoice,
                        audioDataLength: audioData?.length || 0
                    });
                } else {
                    this._logDebug('SPEAK_ERROR', 'No fallback available', { error: engineError.message });
                    throw engineError;
                }
            }

            // Validate audioData
            if (!audioData || audioData.length === 0) {
                this._logDebug('SPEAK_ERROR', 'Empty audio data returned', {
                    engine: selectedEngine,
                    audioData: audioData
                });
                throw new Error('Engine returned empty audio data');
            }

            // Step 6: Enqueue for playback
            this._logDebug('SPEAK_STEP6', 'Enqueueing for playback', {
                username,
                textLength: finalText.length,
                voice: selectedVoice,
                engine: selectedEngine,
                volume: this.config.volume * (userSettings?.volume_gain ?? 1.0),
                speed: this.config.speed,
                source,
                priority
            });

            const queueResult = this.queueManager.enqueue({
                userId,
                username,
                text: finalText,
                voice: selectedVoice,
                engine: selectedEngine,
                audioData,
                volume: this.config.volume * (userSettings?.volume_gain ?? 1.0),
                speed: this.config.speed,
                source,
                teamLevel,
                isSubscriber,
                priority
            });

            this._logDebug('SPEAK_STEP6', 'Enqueue result', queueResult);

            if (!queueResult.success) {
                this._logDebug('SPEAK_DENIED', 'Queue rejected item', {
                    reason: queueResult.reason,
                    details: queueResult
                });
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
                queueSize: queueResult.queueSize
            });

            this._logDebug('SPEAK_SUCCESS', 'TTS queued successfully', {
                position: queueResult.position,
                queueSize: queueResult.queueSize,
                estimatedWaitMs: queueResult.estimatedWaitMs
            });

            return {
                success: true,
                queued: true,
                position: queueResult.position,
                queueSize: queueResult.queueSize,
                estimatedWaitMs: queueResult.estimatedWaitMs,
                voice: selectedVoice,
                engine: selectedEngine,
                cached: false
            };

        } catch (error) {
            this._logDebug('SPEAK_ERROR', 'Speak method error', {
                error: error.message,
                stack: error.stack
            });
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
            this._logDebug('PLAYBACK', 'Starting playback', {
                id: item.id,
                username: item.username,
                text: item.text?.substring(0, 50),
                voice: item.voice,
                engine: item.engine,
                volume: item.volume,
                speed: item.speed
            });

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

            this._logDebug('PLAYBACK', 'Audio event emitted to clients', {
                id: item.id,
                event: 'tts:play',
                audioDataLength: item.audioData?.length || 0
            });

            // Estimate playback duration based on realistic speech rate
            // Average speaking rate: ~150 words/min = ~2.5 words/sec = ~12.5 chars/sec
            // Formula: chars * 100ms + buffer (accounting for pauses, pacing, etc.)
            const baseDelay = Math.ceil(item.text.length * 100); // 100ms per character
            const speedAdjustment = item.speed ? (1 / item.speed) : 1; // Adjust for speed
            const buffer = 2000; // 2 second buffer for network latency and startup
            const estimatedDuration = Math.ceil(baseDelay * speedAdjustment) + buffer;

            this._logDebug('PLAYBACK', 'Waiting for playback to complete', {
                estimatedDuration,
                textLength: item.text.length,
                speed: item.speed,
                calculation: `${item.text.length} chars * 100ms * ${speedAdjustment.toFixed(2)} + ${buffer}ms = ${estimatedDuration}ms`
            });

            // Wait for playback to complete
            await new Promise(resolve => setTimeout(resolve, estimatedDuration));

            // Emit playback end event
            this.api.emit('tts:playback:ended', {
                id: item.id,
                username: item.username
            });

            this._logDebug('PLAYBACK', 'Playback completed', { id: item.id });

        } catch (error) {
            this._logDebug('PLAYBACK', 'Playback error', {
                id: item.id,
                error: error.message,
                stack: error.stack
            });
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
            // Stop queue processing
            this.queueManager.stopProcessing();

            // Clear debug logs to free memory
            this.debugLogs = [];

            // Clear caches in utilities
            if (this.permissionManager) {
                this.permissionManager.clearCache();
            }

            this.logger.info('TTS Plugin destroyed and resources cleaned up');
        } catch (error) {
            this.logger.error(`TTS Plugin destroy error: ${error.message}`);
        }
    }
}

module.exports = TTSPlugin;
