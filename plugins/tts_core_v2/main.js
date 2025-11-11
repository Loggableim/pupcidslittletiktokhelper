const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Logging helper
const LOG_PREFIX = '[TTS-Core-V2]';
function logDebug(message) {
    console.log(`${LOG_PREFIX} ${message}`);
}

logDebug('Loading dependencies...');

let francAll;
try {
    const francModule = require('franc-min');
    francAll = francModule.francAll || francModule;
    logDebug('franc-min loaded successfully');
} catch (error) {
    console.error(`${LOG_PREFIX} ERROR: Failed to load franc-min:`, error.message);
    // Fallback: disable language detection
    francAll = () => [['eng', 1]]; // Default to English
    logDebug('franc-min not available, using fallback');
}
const { francAll } = require('franc-min');

// TikTok TTS Voice Mapping mit Sprachzuordnung
const TIKTOK_VOICES = {
    // Englisch - Disney/Characters
    'en_us_ghostface': { name: 'Ghostface (Scream)', lang: 'en' },
    'en_us_chewbacca': { name: 'Chewbacca (Star Wars)', lang: 'en' },
    'en_us_c3po': { name: 'C3PO (Star Wars)', lang: 'en' },
    'en_us_stitch': { name: 'Stitch (Lilo & Stitch)', lang: 'en' },
    'en_us_stormtrooper': { name: 'Stormtrooper (Star Wars)', lang: 'en' },
    'en_us_rocket': { name: 'Rocket (Guardians)', lang: 'en' },

    // Englisch - Standard
    'en_male_narration': { name: 'Male Narrator', lang: 'en' },
    'en_male_funny': { name: 'Male Funny', lang: 'en' },
    'en_female_emotional': { name: 'Female Emotional', lang: 'en' },
    'en_female_samc': { name: 'Female Friendly', lang: 'en' },
    'en_us_001': { name: 'US Female 1', lang: 'en' },
    'en_us_002': { name: 'US Female 2', lang: 'en' },
    'en_us_006': { name: 'US Male 1', lang: 'en' },
    'en_us_007': { name: 'US Male 2', lang: 'en' },
    'en_us_009': { name: 'US Male 3', lang: 'en' },
    'en_us_010': { name: 'US Male 4', lang: 'en' },

    // Deutsch
    'de_001': { name: 'Deutsch Männlich', lang: 'de' },
    'de_002': { name: 'Deutsch Weiblich', lang: 'de' },

    // Weitere Sprachen
    'es_002': { name: 'Spanisch Male', lang: 'es' },
    'fr_001': { name: 'Französisch Male', lang: 'fr' },
    'fr_002': { name: 'Französisch Female', lang: 'fr' },
    'pt_female': { name: 'Portugiesisch Female', lang: 'pt' },
    'br_003': { name: 'Portugiesisch BR Female', lang: 'pt' },
    'id_001': { name: 'Indonesisch Female', lang: 'id' },
    'jp_001': { name: 'Japanisch Female', lang: 'ja' },
    'jp_003': { name: 'Japanisch Male', lang: 'ja' },
    'kr_002': { name: 'Koreanisch Male', lang: 'ko' }
};

// Sprache zu Voice-ID Mapping
const LANGUAGE_TO_VOICE = {
    'eng': 'en_us_001',      // Englisch
    'deu': 'de_001',         // Deutsch
    'spa': 'es_002',         // Spanisch
    'fra': 'fr_001',         // Französisch
    'por': 'pt_female',      // Portugiesisch
    'jpn': 'jp_001',         // Japanisch
    'kor': 'kr_002',         // Koreanisch
    'ind': 'id_001'          // Indonesisch
};

/**
 * TTS Core V2 Plugin - Advanced Text-to-Speech System
 *
 * Features:
 * - Mehrsprachige Erkennung pro Kommentar
 * - Automatisches Voice-Mapping nach Sprache
 * - Username-Vorlesen mit separater Stimme
 * - Async Queue mit konfigurierbarem Throttling
 * - Wortfilter & Fäkalsprache-Filter
 * - Moderationssystem (Mute/Ban)
 * - Feedback-Loop für Zuschauer-Stimmenwahl
 * - Teamlevel-Freigabe
 * - Vollständiges UI & Logging
 */
class TTSCoreV2Plugin {
    constructor(api) {
        logDebug('Constructor called');
        this.api = api;
        this.db = api.getDatabase();
        this.io = api.getSocketIO();
        this.pluginDir = api.getPluginDir();

        logDebug(`Plugin directory: ${this.pluginDir}`);
        logDebug(`Database: ${this.db ? 'OK' : 'MISSING'}`);
        logDebug(`Socket.IO: ${this.io ? 'OK' : 'MISSING'}`);

        // TTS Queue & State
        this.queue = [];
        this.isPlaying = false;
        this.lastPlayTime = 0;

        // TikTok TTS API
        this.ttsApiUrl = 'https://api16-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke/';
        this.ttsApiFallbackUrl = 'https://tiktok-tts.weilnet.workers.dev/api/generation';

        // Rate Limiting
        this.rateLimitDelay = 1000; // 1 Request pro Sekunde
        this.retryCount = 3;
        this.retryDelay = 2000;

        // Moderation
        this.mutedUsers = new Map(); // username -> { until: timestamp, permanent: bool }
        this.chatLog = []; // Letzte 100 Chat-Events
        this.maxChatLog = 100;

        // User Voice Selection (Feedback Loop)
        this.userSelectedVoices = new Map(); // username -> voiceId

        // Whitelist für Teamlevel-Bypass
        this.levelWhitelist = new Set();

        // Config Files
        this.bannedWordsFile = path.join(this.pluginDir, 'banned_words.json');
        this.mutedUsersFile = path.join(this.pluginDir, 'muted_users.json');
        this.configFile = path.join(this.pluginDir, 'config.json');

        // Load persisted data
        this.bannedWords = this.loadBannedWords();
        this.loadMutedUsers();
        this.config = this.loadConfig();
    }

    async init() {
        logDebug('=== INIT START ===');
        this.api.log('TTS Core V2 Plugin initializing...');

        try {
            // Ensure config files exist
            logDebug('Ensuring config files...');
            this.ensureConfigFiles();
            logDebug('Config files OK');

            // Register API Routes
            logDebug('Registering API routes...');
            this.registerRoutes();
            logDebug('API routes registered');

            // Register TikTok Event Hooks
            logDebug('Registering TikTok events...');
            this.registerTikTokEvents();
            logDebug('TikTok events registered');

            // Register Socket Events
            logDebug('Registering Socket events...');
            this.registerSocketEvents();
            logDebug('Socket events registered');

            // Start cleanup timer for expired mutes
            logDebug('Starting cleanup timer...');
            this.startMuteCleanupTimer();
            logDebug('Cleanup timer started');

            logDebug('=== INIT COMPLETE ===');
            this.api.log('TTS Core V2 Plugin initialized successfully');
            this.api.log(`Loaded ${this.bannedWords.length} banned words`);
            this.api.log(`Loaded ${this.mutedUsers.size} muted users`);
        } catch (error) {
            console.error(`${LOG_PREFIX} INIT ERROR:`, error);
            this.api.log(`TTS Core V2 initialization failed: ${error.message}`, 'error');
            throw error;
        }
        this.api.log('TTS Core V2 Plugin initializing...');

        // Ensure config files exist
        this.ensureConfigFiles();

        // Register API Routes
        this.registerRoutes();

        // Register TikTok Event Hooks
        this.registerTikTokEvents();

        // Register Socket Events
        this.registerSocketEvents();

        // Start cleanup timer for expired mutes
        this.startMuteCleanupTimer();

        this.api.log('TTS Core V2 Plugin initialized successfully');
        this.api.log(`Loaded ${this.bannedWords.length} banned words`);
        this.api.log(`Loaded ${this.mutedUsers.size} muted users`);
    }

    // ============================================
    // CONFIG MANAGEMENT
    // ============================================

    ensureConfigFiles() {
        logDebug(`Checking config files in: ${this.pluginDir}`);

        // banned_words.json
        logDebug(`Checking: ${this.bannedWordsFile}`);
        // banned_words.json
        if (!fs.existsSync(this.bannedWordsFile)) {
            const defaultBannedWords = [
                // URLs & Links
                'http', 'https', 'www.', '.com', '.de', '.org', '.net',
                // Beispiel Schimpfwörter (erweitern nach Bedarf)
                'fuck', 'shit', 'bitch', 'damn', 'ass',
                'arsch', 'scheiße', 'scheisse', 'fick'
            ];
            fs.writeFileSync(this.bannedWordsFile, JSON.stringify(defaultBannedWords, null, 2));
            this.api.log('Created default banned_words.json');
        }

        // muted_users.json
        if (!fs.existsSync(this.mutedUsersFile)) {
            fs.writeFileSync(this.mutedUsersFile, JSON.stringify({}, null, 2));
            this.api.log('Created empty muted_users.json');
        }

        // config.json
        if (!fs.existsSync(this.configFile)) {
            const defaultConfig = {
                default_voice: 'en_us_001',
                include_username: true,
                username_voice: 'en_us_ghostface',
                queue_delay_ms: 1000,
                max_queue_size: 100,
                min_team_level: 0,
                enable_language_detection: true,
                enable_word_filter: true,
                filter_mode: 'censor', // 'censor', 'skip', 'beep'
                profanity_level: 'standard', // 'mild', 'standard', 'strict'
                enable_emoji_voice_selection: false,
                enable_gift_voice_selection: false,
                volume: 80,
                speed: 1.0,
                max_text_length: 300
            };
            fs.writeFileSync(this.configFile, JSON.stringify(defaultConfig, null, 2));
            this.api.log('Created default config.json');
        }
    }

    loadConfig() {
        try {
            const data = fs.readFileSync(this.configFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            this.api.log(`Failed to load config: ${error.message}`, 'error');
            return {};
        }
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
            return true;
        } catch (error) {
            this.api.log(`Failed to save config: ${error.message}`, 'error');
            return false;
        }
    }

    loadBannedWords() {
        try {
            const data = fs.readFileSync(this.bannedWordsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            this.api.log(`Failed to load banned words: ${error.message}`, 'warn');
            return [];
        }
    }

    saveBannedWords() {
        try {
            fs.writeFileSync(this.bannedWordsFile, JSON.stringify(this.bannedWords, null, 2));
            return true;
        } catch (error) {
            this.api.log(`Failed to save banned words: ${error.message}`, 'error');
            return false;
        }
    }

    loadMutedUsers() {
        try {
            const data = fs.readFileSync(this.mutedUsersFile, 'utf8');
            const mutedData = JSON.parse(data);

            // Convert to Map
            for (const [username, muteInfo] of Object.entries(mutedData)) {
                this.mutedUsers.set(username, muteInfo);
            }
        } catch (error) {
            this.api.log(`Failed to load muted users: ${error.message}`, 'warn');
        }
    }

    saveMutedUsers() {
        try {
            // Convert Map to Object
            const mutedData = {};
            for (const [username, muteInfo] of this.mutedUsers.entries()) {
                mutedData[username] = muteInfo;
            }

            fs.writeFileSync(this.mutedUsersFile, JSON.stringify(mutedData, null, 2));
            return true;
        } catch (error) {
            this.api.log(`Failed to save muted users: ${error.message}`, 'error');
            return false;
        }
    }

    // ============================================
    // API ROUTES
    // ============================================

    registerRoutes() {
        logDebug('Registering routes...');

        // GET /api/tts-v2/config - Get configuration
        logDebug('Registering: GET /api/tts-v2/config');
        // GET /api/tts-v2/config - Get configuration
        this.api.registerRoute('GET', '/api/tts-v2/config', (req, res) => {
            res.json({
                success: true,
                config: this.config
            });
        });

        // POST /api/tts-v2/config - Update configuration
        this.api.registerRoute('POST', '/api/tts-v2/config', (req, res) => {
            try {
                const updates = req.body;
                this.config = { ...this.config, ...updates };
                this.saveConfig();

                res.json({
                    success: true,
                    config: this.config
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // GET /api/tts-v2/voices - Get available voices
        this.api.registerRoute('GET', '/api/tts-v2/voices', (req, res) => {
            res.json({
                success: true,
                voices: TIKTOK_VOICES,
                languageMapping: LANGUAGE_TO_VOICE
            });
        });

        // GET /api/tts-v2/queue - Get queue status
        this.api.registerRoute('GET', '/api/tts-v2/queue', (req, res) => {
            res.json({
                success: true,
                queueLength: this.queue.length,
                maxQueueSize: this.config.max_queue_size,
                isPlaying: this.isPlaying,
                queue: this.queue.map(item => ({
                    username: item.username,
                    text: item.text,
                    voice: item.voice,
                    timestamp: item.timestamp
                }))
            });
        });

        // POST /api/tts-v2/queue/clear - Clear queue
        this.api.registerRoute('POST', '/api/tts-v2/queue/clear', (req, res) => {
            this.queue = [];
            res.json({ success: true, message: 'Queue cleared' });
        });

        // GET /api/tts-v2/banned-words - Get banned words
        this.api.registerRoute('GET', '/api/tts-v2/banned-words', (req, res) => {
            res.json({
                success: true,
                words: this.bannedWords
            });
        });

        // POST /api/tts-v2/banned-words - Add banned word
        this.api.registerRoute('POST', '/api/tts-v2/banned-words', (req, res) => {
            try {
                const { word } = req.body;
                if (!word) {
                    return res.status(400).json({ success: false, error: 'Word required' });
                }

                if (!this.bannedWords.includes(word.toLowerCase())) {
                    this.bannedWords.push(word.toLowerCase());
                    this.saveBannedWords();
                }

                res.json({ success: true, words: this.bannedWords });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // DELETE /api/tts-v2/banned-words - Remove banned word
        this.api.registerRoute('DELETE', '/api/tts-v2/banned-words', (req, res) => {
            try {
                const { word } = req.body;
                this.bannedWords = this.bannedWords.filter(w => w !== word.toLowerCase());
                this.saveBannedWords();

                res.json({ success: true, words: this.bannedWords });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET /api/tts-v2/muted-users - Get muted users
        this.api.registerRoute('GET', '/api/tts-v2/muted-users', (req, res) => {
            const now = Date.now();
            const muted = [];

            for (const [username, muteInfo] of this.mutedUsers.entries()) {
                if (muteInfo.permanent || muteInfo.until > now) {
                    muted.push({
                        username,
                        permanent: muteInfo.permanent || false,
                        until: muteInfo.until,
                        remaining: muteInfo.permanent ? null : Math.max(0, muteInfo.until - now)
                    });
                }
            }

            res.json({ success: true, mutedUsers: muted });
        });

        // POST /api/tts-v2/mute - Mute user
        this.api.registerRoute('POST', '/api/tts-v2/mute', (req, res) => {
            try {
                const { username, duration, permanent } = req.body;

                if (!username) {
                    return res.status(400).json({ success: false, error: 'Username required' });
                }

                const muteInfo = {
                    permanent: permanent || false,
                    until: permanent ? null : Date.now() + (duration * 60 * 1000),
                    mutedAt: Date.now()
                };

                this.mutedUsers.set(username, muteInfo);
                this.saveMutedUsers();

                this.api.log(`User ${username} muted (${permanent ? 'permanent' : duration + ' minutes'})`);

                res.json({
                    success: true,
                    message: `User ${username} muted`,
                    muteInfo
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/tts-v2/unmute - Unmute user
        this.api.registerRoute('POST', '/api/tts-v2/unmute', (req, res) => {
            try {
                const { username } = req.body;

                if (!username) {
                    return res.status(400).json({ success: false, error: 'Username required' });
                }

                this.mutedUsers.delete(username);
                this.saveMutedUsers();

                this.api.log(`User ${username} unmuted`);

                res.json({
                    success: true,
                    message: `User ${username} unmuted`
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET /api/tts-v2/chat-log - Get chat log
        this.api.registerRoute('GET', '/api/tts-v2/chat-log', (req, res) => {
            res.json({
                success: true,
                chatLog: this.chatLog
            });
        });

        // POST /api/tts-v2/test - Test TTS
        this.api.registerRoute('POST', '/api/tts-v2/test', async (req, res) => {
            try {
                const { text, voice } = req.body;

                if (!text) {
                    return res.status(400).json({ success: false, error: 'Text required' });
                }

                await this.speak('TestUser', text, voice || this.config.default_voice, {
                    teamMemberLevel: 999,
                    bypassModeration: true
                });

                res.json({
                    success: true,
                    message: 'TTS test queued'
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST /api/tts-v2/whitelist - Add user to level whitelist
        this.api.registerRoute('POST', '/api/tts-v2/whitelist', (req, res) => {
            try {
                const { username } = req.body;
                this.levelWhitelist.add(username);

                res.json({
                    success: true,
                    message: `User ${username} added to whitelist`
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // DELETE /api/tts-v2/whitelist - Remove user from level whitelist
        this.api.registerRoute('DELETE', '/api/tts-v2/whitelist', (req, res) => {
            try {
                const { username } = req.body;
                this.levelWhitelist.delete(username);

                res.json({
                    success: true,
                    message: `User ${username} removed from whitelist`
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    // ============================================
    // TIKTOK EVENT HOOKS
    // ============================================

    registerTikTokEvents() {
        logDebug('Registering TikTok event hooks...');

        // Chat Event - Main TTS Trigger
        logDebug('Registering: chat event');
        // Chat Event - Main TTS Trigger
        this.api.registerTikTokEvent('chat', async (data) => {
            if (!data.message) return;

            // Add to chat log
            this.addToChatLog('chat', data);

            // Process TTS
            await this.speak(data.username, data.message, null, {
                teamMemberLevel: data.teamMemberLevel || 0,
                userId: data.userId,
                eventType: 'chat'
            });
        });

        // Gift Event
        this.api.registerTikTokEvent('gift', async (data) => {
            // Check if gift voice selection is enabled
            if (this.config.enable_gift_voice_selection) {
                this.handleGiftVoiceSelection(data);
            }

            // Announce gift via TTS (optional)
            const announceGifts = this.config.announce_gifts || false;
            if (announceGifts) {
                const message = `${data.username} sent ${data.giftName}`;
                await this.speak('System', message, this.config.default_voice, {
                    teamMemberLevel: data.teamMemberLevel || 0,
                    eventType: 'gift'
                });
            }
        });

        // Follow Event
        this.api.registerTikTokEvent('follow', async (data) => {
            const announceFollows = this.config.announce_follows || false;
            if (announceFollows) {
                const message = `${data.username} followed!`;
                await this.speak('System', message, this.config.default_voice, {
                    teamMemberLevel: 999,
                    eventType: 'follow'
                });
            }
        });

        // Subscribe Event
        this.api.registerTikTokEvent('subscribe', async (data) => {
            const announceSubscribes = this.config.announce_subscribes || false;
            if (announceSubscribes) {
                const message = `${data.username} subscribed!`;
                await this.speak('System', message, this.config.default_voice, {
                    teamMemberLevel: 999,
                    eventType: 'subscribe'
                });
            }
        });

        // Share Event
        this.api.registerTikTokEvent('share', async (data) => {
            const announceShares = this.config.announce_shares || false;
            if (announceShares) {
                const message = `${data.username} shared the stream!`;
                await this.speak('System', message, this.config.default_voice, {
                    teamMemberLevel: 999,
                    eventType: 'share'
                });
            }
        });
    }

    // ============================================
    // SOCKET EVENTS
    // ============================================

    registerSocketEvents() {
        // Client can request queue status updates
        this.api.registerSocket('tts-v2:get-status', (socket) => {
            socket.emit('tts-v2:status', {
                queueLength: this.queue.length,
                maxQueueSize: this.config.max_queue_size,
                isPlaying: this.isPlaying
            });
        });
    }

    // ============================================
    // CORE TTS LOGIC
    // ============================================

    async speak(username, text, voiceOverride = null, userMetadata = {}) {
        try {
            // Skip if bypassed for system messages
            const bypassModeration = userMetadata.bypassModeration || false;

            // Check if user is muted
            if (!bypassModeration && this.isUserMuted(username)) {
                this.api.log(`User ${username} is muted, skipping TTS`);
                return;
            }

            // Check team level
            if (!bypassModeration && !this.checkTeamLevel(username, userMetadata.teamMemberLevel || 0)) {
                this.api.log(`User ${username} below min team level, skipping TTS`);
                return;
            }

            // Filter text
            const filterResult = this.filterText(text);

            if (filterResult.skip) {
                this.api.log(`Message from ${username} filtered: ${filterResult.reason}`);
                this.io.emit('tts-v2:filtered', {
                    username,
                    originalText: text,
                    reason: filterResult.reason
                });
                return;
            }

            const filteredText = filterResult.text;

            if (!filteredText || filteredText.trim().length === 0) {
                return;
            }

            // Determine voice
            let voice = voiceOverride;

            // Check user-selected voice (Feedback Loop)
            if (!voice && this.userSelectedVoices.has(username)) {
                voice = this.userSelectedVoices.get(username);
            }

            // Auto-detect language and map to voice
            if (!voice && this.config.enable_language_detection) {
                voice = this.detectLanguageAndGetVoice(filteredText);
            }

            // Fallback to default voice
            if (!voice) {
                voice = this.config.default_voice || 'en_us_001';
            }

            // Build final TTS text
            let finalText = filteredText;
            if (this.config.include_username && username !== 'System') {
                finalText = `${username} says: ${filteredText}`;
            }

            // Generate TTS audio
            const audioData = await this.generateTTS(finalText, voice);

            if (!audioData) {
                this.api.log('Failed to generate TTS audio', 'error');
                return;
            }

            // Check queue size
            if (this.queue.length >= this.config.max_queue_size) {
                this.api.log(`TTS queue full (${this.config.max_queue_size}), message rejected`, 'warn');
                this.io.emit('tts-v2:queue-full', {
                    username,
                    text: filteredText,
                    queueSize: this.queue.length
                });
                return;
            }

            // Add to queue
            this.queue.push({
                username,
                text: finalText,
                originalText: text,
                voice,
                audioData,
                timestamp: Date.now()
            });

            this.api.log(`TTS queued: "${finalText}" (Voice: ${voice}, Queue: ${this.queue.length})`);

            // Emit queue update
            this.io.emit('tts-v2:queue-update', {
                queueLength: this.queue.length,
                maxQueueSize: this.config.max_queue_size
            });

            // Process queue
            this.processQueue();

        } catch (error) {
            this.api.log(`TTS Error: ${error.message}`, 'error');
        }
    }

    async generateTTS(text, voice) {
        let lastError = null;

        // Retry logic
        for (let attempt = 1; attempt <= this.retryCount; attempt++) {
            try {
                // Rate limiting - ensure min delay between requests
                const timeSinceLastRequest = Date.now() - this.lastPlayTime;
                if (timeSinceLastRequest < this.rateLimitDelay) {
                    await this.sleep(this.rateLimitDelay - timeSinceLastRequest);
                }

                // Try official TikTok API first
                const audioData = await this.callTikTokAPI(text, voice);

                if (audioData) {
                    this.lastPlayTime = Date.now();
                    return audioData;
                }

                // If failed, try fallback API
                const fallbackData = await this.callFallbackAPI(text, voice);

                if (fallbackData) {
                    this.lastPlayTime = Date.now();
                    return fallbackData;
                }

            } catch (error) {
                lastError = error;
                this.api.log(`TTS generation attempt ${attempt} failed: ${error.message}`, 'warn');

                if (attempt < this.retryCount) {
                    await this.sleep(this.retryDelay * attempt); // Exponential backoff
                }
            }
        }

        this.api.log(`TTS generation failed after ${this.retryCount} attempts: ${lastError?.message}`, 'error');
        return null;
    }

    async callTikTokAPI(text, voice) {
        try {
            const encodedText = encodeURIComponent(text);
            const url = `${this.ttsApiUrl}?text_speaker=${voice}&req_text=${encodedText}`;

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'com.zhiliaoapp.musically/2022600030 (Linux; U; Android 7.1.2; es_ES; SM-G988N; Build/NRD90M;tt-ok/3.12.13.1)',
                    'Accept-Encoding': 'gzip,deflate,compress'
                },
                timeout: 10000
            });

            if (response.data && response.data.data && response.data.data.v_str) {
                // Base64 MP3 data
                return response.data.data.v_str;
            }

            return null;
        } catch (error) {
            // Silent fail, will try fallback
            return null;
        }
    }

    async callFallbackAPI(text, voice) {
        try {
            const response = await axios.post(
                this.ttsApiFallbackUrl,
                {
                    text: text,
                    voice: voice
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            if (response.data && response.data.data) {
                return response.data.data;
            }

            return null;
        } catch (error) {
            throw error;
        }
    }

    processQueue() {
        // If already playing or queue empty, do nothing
        if (this.isPlaying || this.queue.length === 0) {
            return;
        }

        this.isPlaying = true;
        const item = this.queue.shift();

        // Send audio to frontend for playback
        this.io.emit('tts-v2:play', {
            username: item.username,
            text: item.text,
            voice: item.voice,
            audioData: item.audioData, // Base64 MP3
            volume: this.config.volume,
            speed: this.config.speed
        });

        this.api.log(`Playing TTS: "${item.text}"`);

        // Estimate duration (rough: 0.5s per 10 chars + 1s buffer)
        const estimatedDuration = Math.ceil(item.text.length / 10 * 500) + 1000;

        // Add configured delay
        const totalDelay = estimatedDuration + this.config.queue_delay_ms;

        // Schedule next item
        setTimeout(() => {
            this.isPlaying = false;

            // Emit queue update
            this.io.emit('tts-v2:queue-update', {
                queueLength: this.queue.length,
                maxQueueSize: this.config.max_queue_size
            });

            this.processQueue();
        }, totalDelay);
    }

    // ============================================
    // LANGUAGE DETECTION
    // ============================================

    detectLanguageAndGetVoice(text) {
        try {
            // Use franc for language detection
            const detected = francAll(text, { minLength: 3 });

            if (detected && detected.length > 0) {
                const topLang = detected[0][0]; // [['eng', 1], ['deu', 0.5], ...]

                // Map to TikTok voice
                if (LANGUAGE_TO_VOICE[topLang]) {
                    this.api.log(`Detected language: ${topLang} -> Voice: ${LANGUAGE_TO_VOICE[topLang]}`);
                    return LANGUAGE_TO_VOICE[topLang];
                }
            }

            // Fallback to default
            return this.config.default_voice;
        } catch (error) {
            this.api.log(`Language detection failed: ${error.message}`, 'warn');
            return this.config.default_voice;
        }
    }

    // ============================================
    // TEXT FILTERING
    // ============================================

    filterText(text) {
        if (!text) {
            return { text: '', skip: true, reason: 'Empty text' };
        }

        let filtered = text;

        // Length check
        if (filtered.length > this.config.max_text_length) {
            filtered = filtered.substring(0, this.config.max_text_length) + '...';
        }

        // Remove URLs
        filtered = filtered.replace(/https?:\/\/\S+/gi, '');
        filtered = filtered.replace(/www\.\S+/gi, '');

        // Word filter
        if (this.config.enable_word_filter) {
            const filterResult = this.applyWordFilter(filtered);

            if (filterResult.skip) {
                return filterResult;
            }

            filtered = filterResult.text;
        }

        // Profanity filter
        const profanityResult = this.applyProfanityFilter(filtered);
        if (profanityResult.skip) {
            return profanityResult;
        }

        filtered = profanityResult.text;

        // Clean special chars
        filtered = filtered.replace(/[<>{}[\]]/g, '');
        filtered = filtered.trim();

        return { text: filtered, skip: false };
    }

    applyWordFilter(text) {
        let filtered = text;
        let foundBanned = false;

        for (const word of this.bannedWords) {
            const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');

            if (regex.test(filtered)) {
                foundBanned = true;

                if (this.config.filter_mode === 'skip') {
                    return {
                        text: '',
                        skip: true,
                        reason: 'Banned word detected'
                    };
                } else if (this.config.filter_mode === 'censor') {
                    filtered = filtered.replace(regex, '***');
                } else if (this.config.filter_mode === 'beep') {
                    filtered = filtered.replace(regex, '[BEEP]');
                }
            }
        }

        return { text: filtered, skip: false };
    }

    applyProfanityFilter(text) {
        // Basic profanity detection based on level
        const profanityPatterns = {
            mild: [],
            standard: ['fuck', 'shit', 'damn', 'bitch', 'ass'],
            strict: ['fuck', 'shit', 'damn', 'bitch', 'ass', 'hell', 'crap', 'piss']
        };

        const patterns = profanityPatterns[this.config.profanity_level] || profanityPatterns.standard;
        let filtered = text;
        let foundProfanity = false;

        for (const word of patterns) {
            const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');

            if (regex.test(filtered)) {
                foundProfanity = true;

                if (this.config.filter_mode === 'skip') {
                    return {
                        text: '',
                        skip: true,
                        reason: 'Profanity detected'
                    };
                } else {
                    filtered = filtered.replace(regex, '***');
                }
            }
        }

        return { text: filtered, skip: false };
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ============================================
    // MODERATION
    // ============================================

    isUserMuted(username) {
        const muteInfo = this.mutedUsers.get(username);

        if (!muteInfo) {
            return false;
        }

        // Permanent ban
        if (muteInfo.permanent) {
            return true;
        }

        // Timed mute
        if (muteInfo.until && muteInfo.until > Date.now()) {
            return true;
        }

        // Mute expired
        this.mutedUsers.delete(username);
        this.saveMutedUsers();
        return false;
    }

    addToChatLog(eventType, data) {
        const logEntry = {
            type: eventType,
            username: data.username,
            message: data.message || '',
            timestamp: Date.now(),
            teamLevel: data.teamMemberLevel || 0,
            userId: data.userId
        };

        this.chatLog.push(logEntry);

        // Keep only last 100
        if (this.chatLog.length > this.maxChatLog) {
            this.chatLog.shift();
        }

        // Emit to frontend
        this.io.emit('tts-v2:chat-log-update', {
            entry: logEntry,
            chatLog: this.chatLog
        });
    }

    startMuteCleanupTimer() {
        // Clean up expired mutes every 60 seconds
        setInterval(() => {
            let cleaned = 0;
            const now = Date.now();

            for (const [username, muteInfo] of this.mutedUsers.entries()) {
                if (!muteInfo.permanent && muteInfo.until && muteInfo.until < now) {
                    this.mutedUsers.delete(username);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                this.saveMutedUsers();
                this.api.log(`Cleaned up ${cleaned} expired mutes`);
            }
        }, 60000);
    }

    // ============================================
    // TEAMLEVEL & WHITELIST
    // ============================================

    checkTeamLevel(username, userLevel) {
        // Check whitelist first
        if (this.levelWhitelist.has(username)) {
            return true;
        }

        // Check min level
        const minLevel = this.config.min_team_level || 0;
        return userLevel >= minLevel;
    }

    // ============================================
    // FEEDBACK LOOP - VOICE SELECTION
    // ============================================

    handleGiftVoiceSelection(data) {
        // Map gifts to voices (configurable)
        const giftVoiceMap = {
            'Rose': 'en_us_001',
            'TikTok': 'en_us_ghostface',
            'Star': 'de_001',
            // Add more mappings as needed
        };

        const voice = giftVoiceMap[data.giftName];
        if (voice) {
            this.userSelectedVoices.set(data.username, voice);
            this.api.log(`User ${data.username} selected voice ${voice} via gift ${data.giftName}`);

            // Confirm to user
            this.io.emit('tts-v2:voice-selected', {
                username: data.username,
                voice,
                method: 'gift'
            });
        }
    }

    // ============================================
    // UTILITIES
    // ============================================

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================
    // CLEANUP
    // ============================================

    async destroy() {
        this.api.log('TTS Core V2 Plugin shutting down...');
        this.queue = [];
        this.saveMutedUsers();
        this.saveConfig();
    }
}

module.exports = TTSCoreV2Plugin;
