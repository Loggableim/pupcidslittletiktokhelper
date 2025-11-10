const EventEmitter = require('events');
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Soundboard Manager Class
 * Handles gift-specific sounds, audio queue management, and MyInstants integration
 */
class SoundboardManager extends EventEmitter {
    constructor(db, io, logger) {
        super();
        this.db = db;
        this.io = io;
        this.logger = logger;
        this.likeHistory = []; // Deque for like threshold tracking
        this.MAX_LIKE_HISTORY_SIZE = 100;

        console.log('✅ Soundboard Manager initialized (Queue managed in frontend)');
    }

    /**
     * Get sound for a specific gift
     */
    getGiftSound(giftId) {
        const stmt = this.db.db.prepare('SELECT * FROM gift_sounds WHERE gift_id = ?');
        const sound = stmt.get(giftId);
        return sound ? {
            id: sound.id,
            giftId: sound.gift_id,
            label: sound.label,
            mp3Url: sound.mp3_url,
            volume: sound.volume || 1.0,
            animationUrl: sound.animation_url || null,
            animationType: sound.animation_type || 'none'
        } : null;
    }

    /**
     * Get all gift sounds
     */
    getAllGiftSounds() {
        const stmt = this.db.db.prepare('SELECT * FROM gift_sounds ORDER BY label ASC');
        const sounds = stmt.all();
        return sounds.map(s => ({
            id: s.id,
            giftId: s.gift_id,
            label: s.label,
            mp3Url: s.mp3_url,
            volume: s.volume || 1.0,
            animationUrl: s.animation_url || null,
            animationType: s.animation_type || 'none'
        }));
    }

    /**
     * Add or update gift sound
     */
    setGiftSound(giftId, label, mp3Url, volume = 1.0, animationUrl = null, animationType = 'none') {
        const stmt = this.db.db.prepare(`
            INSERT INTO gift_sounds (gift_id, label, mp3_url, volume, animation_url, animation_type)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(gift_id) DO UPDATE SET
                label = excluded.label,
                mp3_url = excluded.mp3_url,
                volume = excluded.volume,
                animation_url = excluded.animation_url,
                animation_type = excluded.animation_type
        `);

        const result = stmt.run(giftId, label, mp3Url, volume, animationUrl, animationType);
        return result.lastInsertRowid || result.changes;
    }

    /**
     * Delete gift sound
     */
    deleteGiftSound(giftId) {
        const stmt = this.db.db.prepare('DELETE FROM gift_sounds WHERE gift_id = ?');
        stmt.run(giftId);
    }

    /**
     * Play sound for gift event
     */
    async playGiftSound(giftData) {
        const giftSound = this.getGiftSound(giftData.giftId);

        if (giftSound) {
            // Use specific gift sound
            await this.playSound(giftSound.mp3Url, giftSound.volume, giftSound.label);

            // Play animation if configured
            if (giftSound.animationType && giftSound.animationType !== 'none') {
                this.playGiftAnimation(giftData, giftSound);
            }
        } else {
            // Use default gift sound if configured
            const defaultUrl = this.db.getSetting('soundboard_default_gift_sound');
            const defaultVolume = parseFloat(this.db.getSetting('soundboard_gift_volume')) || 1.0;

            if (defaultUrl) {
                await this.playSound(defaultUrl, defaultVolume, 'Default Gift');
            }
        }
    }

    /**
     * Play animation for gift event
     */
    playGiftAnimation(giftData, giftSound) {
        const animationData = {
            type: giftSound.animationType,
            url: giftSound.animationUrl,
            giftName: giftData.giftName || giftSound.label,
            username: giftData.username || 'Anonymous',
            giftImage: giftData.giftPictureUrl || null,
            timestamp: Date.now()
        };

        console.log(`🎬 Playing gift animation: ${animationData.type} for ${animationData.giftName}`);
        this.io.emit('gift:animation', animationData);
    }

    /**
     * Play sound for follow event
     */
    async playFollowSound() {
        const url = this.db.getSetting('soundboard_follow_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_follow_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Follow');
        }
    }

    /**
     * Play sound for subscribe event
     */
    async playSubscribeSound() {
        const url = this.db.getSetting('soundboard_subscribe_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_subscribe_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Subscribe');
        }
    }

    /**
     * Play sound for share event
     */
    async playShareSound() {
        const url = this.db.getSetting('soundboard_share_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_share_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Share');
        }
    }

    /**
     * Handle like event with threshold logic
     */
    async handleLikeEvent(likeCount) {
        const now = Date.now();
        const threshold = parseInt(this.db.getSetting('soundboard_like_threshold')) || 0;
        const windowSeconds = parseInt(this.db.getSetting('soundboard_like_window_seconds')) || 10;

        if (threshold === 0) {
            return; // Like threshold disabled
        }

        // Add current like event to history
        this.likeHistory.push({ count: likeCount, timestamp: now });

        // Remove likes outside the time window
        const windowMs = windowSeconds * 1000;
        this.likeHistory = this.likeHistory.filter(like => (now - like.timestamp) <= windowMs);

        // Enforce max size to prevent unbounded growth
        if (this.likeHistory.length > this.MAX_LIKE_HISTORY_SIZE) {
            this.likeHistory = this.likeHistory.slice(-this.MAX_LIKE_HISTORY_SIZE);
            if (this.logger) {
                this.logger.warn(`Like history exceeded ${this.MAX_LIKE_HISTORY_SIZE}, trimmed to most recent`);
            }
        }

        // Calculate total likes in window
        const totalLikes = this.likeHistory.reduce((sum, like) => sum + like.count, 0);

        // Check if threshold is met
        if (totalLikes >= threshold) {
            const url = this.db.getSetting('soundboard_like_sound');
            const volume = parseFloat(this.db.getSetting('soundboard_like_volume')) || 1.0;

            if (url) {
                await this.playSound(url, volume, `Like Threshold (${totalLikes} likes)`);
            }

            // Clear history after triggering
            this.likeHistory = [];
        }
    }

    /**
     * Core sound playback function
     * Queue management happens in the frontend based on play_mode
     */
    async playSound(url, volume = 1.0, label = 'Sound') {
        const soundData = {
            url: url,
            volume: volume,
            label: label,
            timestamp: Date.now()
        };

        // Always send to frontend immediately
        // Frontend handles queue management based on play_mode (overlap/sequential)
        this.emitSound(soundData);
        console.log(`🎵 Playing: ${label}`);
    }

    /**
     * Emit sound to overlay via Socket.io
     */
    emitSound(soundData) {
        this.io.emit('soundboard:play', {
            url: soundData.url,
            volume: soundData.volume,
            label: soundData.label
        });
    }

    /**
     * Search MyInstants for sounds using the official API
     * API: https://github.com/abdipr/myinstants-api
     */
    async searchMyInstants(query, page = 1, limit = 20) {
        try {
            // Use the official MyInstants API
            const response = await axios.get('https://myinstants-api.vercel.app/search', {
                params: {
                    q: query,
                    page: page,
                    limit: limit
                },
                timeout: 10000,
                headers: {
                    'User-Agent': 'TikTok-Soundboard/1.0'
                }
            });

            if (response.data && response.data.data) {
                return response.data.data.map(instant => ({
                    id: instant.id || null,
                    name: instant.title || instant.name || 'Unknown',
                    url: instant.mp3 || instant.sound,
                    description: instant.description || '',
                    tags: instant.tags || [],
                    color: instant.color || null
                }));
            }

            return []; // Return empty array if no results
        } catch (error) {
            console.error('MyInstants search error:', error.message);
            return [];
        }
    }

    /**
     * Resolve MyInstants page URL to MP3 URL
     */
    async resolveMyInstantsUrl(pageUrl) {
        try {
            const response = await axios.get(pageUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data);

            // Try different methods to find the MP3 URL
            // Method 1: From play button
            const playButton = $('.small-button, .instant-play').first();
            let soundPath = playButton.attr('onmousedown')?.match(/play\('([^']+)'/)?.[1];

            if (soundPath) {
                return soundPath.startsWith('http') ? soundPath : `https://www.myinstants.com${soundPath}`;
            }

            // Method 2: From data attributes
            soundPath = playButton.attr('data-sound') || playButton.attr('data-url');
            if (soundPath) {
                return soundPath.startsWith('http') ? soundPath : `https://www.myinstants.com${soundPath}`;
            }

            // Method 3: Find any .mp3 link in the page
            const mp3Match = response.data.match(/https?:\/\/[^\s"'<>]+?\.mp3[^\s"'<>]*/i);
            if (mp3Match) {
                return mp3Match[0];
            }

            throw new Error('Could not find MP3 URL');
        } catch (error) {
            console.error('MyInstants resolve error:', error.message);
            throw error;
        }
    }

    /**
     * Get trending sounds from MyInstants
     */
    async getTrendingSounds(limit = 20) {
        try {
            const response = await axios.get('https://myinstants-api.vercel.app/trending', {
                params: { limit },
                timeout: 10000,
                headers: {
                    'User-Agent': 'TikTok-Soundboard/1.0'
                }
            });

            if (response.data && response.data.data) {
                return response.data.data.map(instant => ({
                    id: instant.id || null,
                    name: instant.title || instant.name || 'Unknown',
                    url: instant.mp3 || instant.sound,
                    description: instant.description || '',
                    tags: instant.tags || [],
                    color: instant.color || null
                }));
            }

            return [];
        } catch (error) {
            console.error('MyInstants trending error:', error.message);
            return [];
        }
    }

    /**
     * Get random sounds from MyInstants
     */
    async getRandomSounds(limit = 20) {
        try {
            const response = await axios.get('https://myinstants-api.vercel.app/random', {
                params: { limit },
                timeout: 10000,
                headers: {
                    'User-Agent': 'TikTok-Soundboard/1.0'
                }
            });

            if (response.data && response.data.data) {
                return response.data.data.map(instant => ({
                    id: instant.id || null,
                    name: instant.title || instant.name || 'Unknown',
                    url: instant.mp3 || instant.sound,
                    description: instant.description || '',
                    tags: instant.tags || [],
                    color: instant.color || null
                }));
            }

            return [];
        } catch (error) {
            console.error('MyInstants random error:', error.message);
            return [];
        }
    }

    /**
     * Test sound playback
     */
    async testSound(url, volume = 1.0) {
        await this.playSound(url, volume, 'Test Sound');
    }

    /**
     * Clear sound queue (deprecated - queue is now managed in frontend)
     */
    clearQueue() {
        // Queue management is now handled in the frontend
        console.log('⚠️ clearQueue() called but queue is managed in frontend');
    }

    /**
     * Get current queue status (deprecated - queue is now managed in frontend)
     */
    getQueueStatus() {
        return {
            length: 0,
            isProcessing: false,
            items: [],
            note: 'Queue management is now handled in the frontend'
        };
    }
}

/**
 * Soundboard Plugin
 *
 * Handles gift-specific sounds, audio queue management, and MyInstants integration
 */
class SoundboardPlugin {
    constructor(api) {
        this.api = api;
        this.soundboard = null;
    }

    async init() {
        this.api.log('Initializing Soundboard Plugin...', 'info');

        // Initialize SoundboardManager
        const db = this.api.getDatabase();
        const io = this.api.getSocketIO();
        this.soundboard = new SoundboardManager(db, io, {
            info: (msg) => this.api.log(msg, 'info'),
            warn: (msg) => this.api.log(msg, 'warn'),
            error: (msg) => this.api.log(msg, 'error'),
            debug: (msg) => this.api.log(msg, 'debug')
        });

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers
        this.registerTikTokEventHandlers();

        this.api.log('✅ Soundboard Plugin initialized', 'info');
    }

    registerRoutes() {
        // Get all gift sounds
        this.api.registerRoute('get', '/api/soundboard/gifts', (req, res) => {
            try {
                const gifts = this.soundboard.getAllGiftSounds();
                res.json(gifts);
            } catch (error) {
                this.api.log(`Error getting gift sounds: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Add/update gift sound
        this.api.registerRoute('post', '/api/soundboard/gifts', (req, res) => {
            const { giftId, label, mp3Url, volume, animationUrl, animationType } = req.body;

            if (!giftId || !label || !mp3Url) {
                return res.status(400).json({ success: false, error: 'giftId, label and mp3Url are required' });
            }

            try {
                const id = this.soundboard.setGiftSound(
                    giftId,
                    label,
                    mp3Url,
                    volume || 1.0,
                    animationUrl || null,
                    animationType || 'none'
                );
                this.api.log(`🎵 Gift sound set: ${label} (ID: ${giftId})`, 'info');
                res.json({ success: true, id });
            } catch (error) {
                this.api.log(`Error setting gift sound: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete gift sound
        this.api.registerRoute('delete', '/api/soundboard/gifts/:giftId', (req, res) => {
            try {
                this.soundboard.deleteGiftSound(req.params.giftId);
                this.api.log(`🗑️ Deleted gift sound: ${req.params.giftId}`, 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error deleting gift sound: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test sound
        this.api.registerRoute('post', '/api/soundboard/test', async (req, res) => {
            const { url, volume } = req.body;

            if (!url) {
                return res.status(400).json({ success: false, error: 'url is required' });
            }

            try {
                await this.soundboard.testSound(url, volume || 1.0);
                this.api.log(`🔊 Testing sound: ${url}`, 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error testing sound: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get queue status
        this.api.registerRoute('get', '/api/soundboard/queue', (req, res) => {
            try {
                const status = this.soundboard.getQueueStatus();
                res.json(status);
            } catch (error) {
                this.api.log(`Error getting queue status: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Clear queue
        this.api.registerRoute('post', '/api/soundboard/queue/clear', (req, res) => {
            try {
                this.soundboard.clearQueue();
                this.api.log('🧹 Soundboard queue cleared', 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error clearing queue: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants search
        this.api.registerRoute('get', '/api/myinstants/search', async (req, res) => {
            const { query, page, limit } = req.query;

            if (!query) {
                return res.status(400).json({ success: false, error: 'query is required' });
            }

            try {
                const results = await this.soundboard.searchMyInstants(query, page || 1, limit || 20);
                res.json({ success: true, results });
            } catch (error) {
                this.api.log(`Error searching MyInstants: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants trending
        this.api.registerRoute('get', '/api/myinstants/trending', async (req, res) => {
            const { limit } = req.query;

            try {
                const results = await this.soundboard.getTrendingSounds(limit || 20);
                res.json({ success: true, results });
            } catch (error) {
                this.api.log(`Error getting trending sounds: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants random
        this.api.registerRoute('get', '/api/myinstants/random', async (req, res) => {
            const { limit } = req.query;

            try {
                const results = await this.soundboard.getRandomSounds(limit || 20);
                res.json({ success: true, results });
            } catch (error) {
                this.api.log(`Error getting random sounds: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants resolve URL
        this.api.registerRoute('get', '/api/myinstants/resolve', async (req, res) => {
            const { url } = req.query;

            if (!url) {
                return res.status(400).json({ success: false, error: 'url is required' });
            }

            // Wenn es bereits eine direkte MP3-URL ist, direkt zurückgeben
            if (url.match(/\.mp3($|\?)/i)) {
                return res.json({ success: true, mp3: url });
            }

            try {
                const mp3Url = await this.soundboard.resolveMyInstantsUrl(url);
                return res.json({ success: true, mp3: mp3Url });
            } catch (error) {
                this.api.log(`Error resolving MyInstants URL: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.log('✅ Soundboard routes registered', 'info');
    }

    registerTikTokEventHandlers() {
        const db = this.api.getDatabase();

        // Gift Event
        this.api.registerTikTokEvent('gift', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (soundboardEnabled) {
                await this.soundboard.playGiftSound(data);
            }
        });

        // Follow Event
        this.api.registerTikTokEvent('follow', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (soundboardEnabled) {
                await this.soundboard.playFollowSound();
            }
        });

        // Subscribe Event
        this.api.registerTikTokEvent('subscribe', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (soundboardEnabled) {
                await this.soundboard.playSubscribeSound();
            }
        });

        // Share Event
        this.api.registerTikTokEvent('share', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (soundboardEnabled) {
                await this.soundboard.playShareSound();
            }
        });

        // Like Event
        this.api.registerTikTokEvent('like', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (soundboardEnabled) {
                await this.soundboard.handleLikeEvent(data.likeCount || 1);
            }
        });

        this.api.log('✅ Soundboard TikTok event handlers registered', 'info');
    }

    /**
     * Public method to access soundboard manager (for other modules/plugins)
     */
    getSoundboard() {
        return this.soundboard;
    }

    async destroy() {
        this.api.log('🎵 Soundboard Plugin destroyed', 'info');
    }
}

module.exports = SoundboardPlugin;
