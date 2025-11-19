const EventEmitter = require('events');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const SoundboardFetcher = require('./fetcher');
const SoundboardWebSocketTransport = require('./transport-ws');
const SoundboardApiRoutes = require('./api-routes');

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
        console.log(`🎁 [Soundboard] Gift event received:`, {
            giftId: giftData.giftId,
            giftName: giftData.giftName,
            username: giftData.username,
            repeatCount: giftData.repeatCount || 1
        });

        const giftSound = this.getGiftSound(giftData.giftId);

        if (giftSound) {
            // Use specific gift sound
            console.log(`🎵 [Soundboard] Playing gift-specific sound: ${giftSound.label}`);
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
                console.log(`🎵 [Soundboard] Playing default gift sound (no specific sound found for giftId ${giftData.giftId})`);
                await this.playSound(defaultUrl, defaultVolume, 'Default Gift');
            } else {
                console.log(`ℹ️ [Soundboard] No sound configured for gift: ${giftData.giftName} (ID: ${giftData.giftId})`);
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
        console.log(`⭐ [Soundboard] Follow event received`);
        const url = this.db.getSetting('soundboard_follow_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_follow_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Follow');
        } else {
            console.log(`ℹ️ [Soundboard] No sound configured for follow event`);
        }
    }

    /**
     * Play sound for subscribe event
     */
    async playSubscribeSound() {
        console.log(`🌟 [Soundboard] Subscribe event received`);
        const url = this.db.getSetting('soundboard_subscribe_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_subscribe_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Subscribe');
        } else {
            console.log(`ℹ️ [Soundboard] No sound configured for subscribe event`);
        }
    }

    /**
     * Play sound for share event
     */
    async playShareSound() {
        console.log(`🔄 [Soundboard] Share event received`);
        const url = this.db.getSetting('soundboard_share_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_share_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Share');
        } else {
            console.log(`ℹ️ [Soundboard] No sound configured for share event`);
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

        console.log(`👍 [Soundboard] Like event received: ${likeCount} likes`);

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

        console.log(`👍 [Soundboard] Like threshold check: ${totalLikes}/${threshold} likes in last ${windowSeconds}s`);

        // Check if threshold is met
        if (totalLikes >= threshold) {
            const url = this.db.getSetting('soundboard_like_sound');
            const volume = parseFloat(this.db.getSetting('soundboard_like_volume')) || 1.0;

            if (url) {
                console.log(`🎵 [Soundboard] Like threshold reached! Playing sound (${totalLikes} likes)`);
                await this.playSound(url, volume, `Like Threshold (${totalLikes} likes)`);
            } else {
                console.log(`ℹ️ [Soundboard] Like threshold reached but no sound configured`);
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
        // Validierung
        if (!url || typeof url !== 'string') {
            console.error('❌ [Soundboard] Invalid sound URL:', url);
            return;
        }

        if (typeof volume !== 'number' || volume < 0 || volume > 1) {
            console.warn('⚠️ [Soundboard] Invalid volume, using 1.0:', volume);
            volume = 1.0;
        }

        const soundData = {
            url: url,
            volume: volume,
            label: label,
            timestamp: Date.now()
        };

        console.log(`🎵 [Soundboard] Emitting sound to frontend:`, {
            label: label,
            url: url,
            volume: volume,
            timestamp: new Date().toISOString()
        });

        // Always send to frontend immediately
        // Frontend handles queue management based on play_mode (overlap/sequential)
        this.emitSound(soundData);
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
     * Enhanced to support multiple API response formats and better MP3 URL extraction
     */
    async searchMyInstants(query, page = 1, limit = 20) {
        try {
            console.log(`[MyInstants] Searching for: "${query}" (page ${page}, limit ${limit})`);
            
            // Try the official MyInstants API first
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

            if (response.data && response.data.data && Array.isArray(response.data.data)) {
                console.log(`[MyInstants] API returned ${response.data.data.length} results`);
                
                const results = response.data.data.map(instant => {
                    // Extract MP3 URL from various possible fields
                    let mp3Url = instant.mp3 || instant.sound || instant.url || instant.mp3_url || instant.audio;
                    
                    // If the URL is relative, make it absolute
                    if (mp3Url && !mp3Url.startsWith('http')) {
                        mp3Url = `https://www.myinstants.com${mp3Url}`;
                    }
                    
                    // Log the extracted URL for debugging
                    if (!mp3Url) {
                        console.warn(`[MyInstants] No valid URL found for sound:`, instant);
                    }
                    
                    return {
                        id: instant.id || null,
                        name: instant.title || instant.name || instant.label || 'Unknown',
                        url: mp3Url,
                        description: instant.description || instant.desc || '',
                        tags: instant.tags || instant.categories || [],
                        color: instant.color || null
                    };
                }).filter(sound => sound.url); // Filter out sounds without valid URLs
                
                console.log(`[MyInstants] Returning ${results.length} valid results with URLs`);
                return results;
            }

            // If API returns empty or invalid data, try fallback
            console.log('[MyInstants] API returned no data, trying fallback scraping...');
            return await this.searchMyInstantsFallback(query, page, limit);
        } catch (error) {
            console.error('[MyInstants] API error:', error.message);
            console.log('[MyInstants] Attempting fallback scraping method...');
            
            // Fallback to direct website scraping
            try {
                return await this.searchMyInstantsFallback(query, page, limit);
            } catch (fallbackError) {
                console.error('[MyInstants] Fallback scraping also failed:', fallbackError.message);
                return [];
            }
        }
    }

    /**
     * Fallback method: Direct scraping of MyInstants website
     */
    async searchMyInstantsFallback(query, page = 1, limit = 20) {
        try {
            console.log(`[MyInstants Fallback] Scraping website for: "${query}"`);
            
            const searchUrl = `https://www.myinstants.com/en/search/?name=${encodeURIComponent(query)}`;
            const response = await axios.get(searchUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            const results = [];

            // Parse instant buttons from the page
            $('.instant').each((i, elem) => {
                if (results.length >= limit) return false; // Stop when limit reached

                const $elem = $(elem);
                const $button = $elem.find('.small-button, button[onclick*="play"]').first();
                
                // Extract sound URL from onclick attribute
                const onclickAttr = $button.attr('onclick') || '';
                const soundMatch = onclickAttr.match(/play\('([^']+)'/);
                
                if (soundMatch && soundMatch[1]) {
                    let soundUrl = soundMatch[1];
                    
                    // Convert relative URLs to absolute
                    if (!soundUrl.startsWith('http')) {
                        soundUrl = `https://www.myinstants.com${soundUrl}`;
                    }

                    const name = $elem.find('.instant-link, a').first().text().trim() || 
                                $elem.find('.small-text').first().text().trim() || 
                                'Unknown Sound';
                    
                    results.push({
                        id: null,
                        name: name,
                        url: soundUrl,
                        description: '',
                        tags: [],
                        color: null
                    });
                }
            });

            console.log(`[MyInstants Fallback] Scraped ${results.length} sounds for "${query}"`);
            return results;
        } catch (error) {
            console.error('[MyInstants Fallback] Scraping error:', error.message);
            throw error;
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
            // Method 1: From onclick attribute (most common)
            const playButtons = $('button[onclick*="play"]');
            for (let i = 0; i < playButtons.length; i++) {
                const onclickAttr = $(playButtons[i]).attr('onclick') || '';
                const soundMatch = onclickAttr.match(/play\('([^']+)'/);
                if (soundMatch && soundMatch[1]) {
                    let soundPath = soundMatch[1];
                    return soundPath.startsWith('http') ? soundPath : `https://www.myinstants.com${soundPath}`;
                }
            }

            // Method 2: From onmousedown attribute (legacy)
            const playButton = $('.small-button, .instant-play').first();
            let soundPath = playButton.attr('onmousedown')?.match(/play\('([^']+)'/)?.[1];

            if (soundPath) {
                return soundPath.startsWith('http') ? soundPath : `https://www.myinstants.com${soundPath}`;
            }

            // Method 3: From data attributes
            soundPath = playButton.attr('data-sound') || playButton.attr('data-url');
            if (soundPath) {
                return soundPath.startsWith('http') ? soundPath : `https://www.myinstants.com${soundPath}`;
            }

            // Method 4: Find any .mp3 link in the page
            const mp3Match = response.data.match(/https?:\/\/[^\s"'<>]+?\.mp3[^\s"'<>]*/i);
            if (mp3Match) {
                return mp3Match[0];
            }

            // Method 5: Look in media directory paths
            const mediaMatch = response.data.match(/\/media\/sounds\/[^\s"'<>]+\.mp3/i);
            if (mediaMatch) {
                return `https://www.myinstants.com${mediaMatch[0]}`;
            }

            throw new Error('Could not find MP3 URL in page');
        } catch (error) {
            console.error('MyInstants resolve error:', error.message);
            throw error;
        }
    }

    /**
     * Get trending sounds from MyInstants
     * Enhanced to support multiple API response formats and better MP3 URL extraction
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

            if (response.data && response.data.data && Array.isArray(response.data.data)) {
                return response.data.data.map(instant => {
                    // Extract MP3 URL from various possible fields
                    let mp3Url = instant.mp3 || instant.sound || instant.url || instant.mp3_url || instant.audio;
                    
                    // If the URL is relative, make it absolute
                    if (mp3Url && !mp3Url.startsWith('http')) {
                        mp3Url = `https://www.myinstants.com${mp3Url}`;
                    }
                    
                    return {
                        id: instant.id || null,
                        name: instant.title || instant.name || instant.label || 'Unknown',
                        url: mp3Url,
                        description: instant.description || instant.desc || '',
                        tags: instant.tags || instant.categories || [],
                        color: instant.color || null
                    };
                }).filter(sound => sound.url); // Filter out sounds without valid URLs
            }

            // Fallback to scraping trending page
            console.log('MyInstants trending API returned no data, trying fallback...');
            return await this.getTrendingSoundsFallback(limit);
        } catch (error) {
            console.error('MyInstants trending API error:', error.message);
            
            // Fallback to direct website scraping
            try {
                return await this.getTrendingSoundsFallback(limit);
            } catch (fallbackError) {
                console.error('Fallback trending scraping failed:', fallbackError.message);
                return [];
            }
        }
    }

    /**
     * Fallback method for trending sounds
     */
    async getTrendingSoundsFallback(limit = 20) {
        try {
            const response = await axios.get('https://www.myinstants.com/en/index/us/', {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            const results = [];

            $('.instant').each((i, elem) => {
                if (results.length >= limit) return false;

                const $elem = $(elem);
                const $button = $elem.find('.small-button, button[onclick*="play"]').first();
                
                const onclickAttr = $button.attr('onclick') || '';
                const soundMatch = onclickAttr.match(/play\('([^']+)'/);
                
                if (soundMatch && soundMatch[1]) {
                    let soundUrl = soundMatch[1];
                    if (!soundUrl.startsWith('http')) {
                        soundUrl = `https://www.myinstants.com${soundUrl}`;
                    }

                    const name = $elem.find('.instant-link, a').first().text().trim() || 'Unknown Sound';
                    
                    results.push({
                        id: null,
                        name: name,
                        url: soundUrl,
                        description: '',
                        tags: [],
                        color: null
                    });
                }
            });

            console.log(`Fallback trending scraping found ${results.length} results`);
            return results;
        } catch (error) {
            console.error('Fallback trending scraping error:', error.message);
            throw error;
        }
    }

    /**
     * Get random sounds from MyInstants
     * Enhanced to support multiple API response formats and better MP3 URL extraction
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

            if (response.data && response.data.data && Array.isArray(response.data.data)) {
                return response.data.data.map(instant => {
                    // Extract MP3 URL from various possible fields
                    let mp3Url = instant.mp3 || instant.sound || instant.url || instant.mp3_url || instant.audio;
                    
                    // If the URL is relative, make it absolute
                    if (mp3Url && !mp3Url.startsWith('http')) {
                        mp3Url = `https://www.myinstants.com${mp3Url}`;
                    }
                    
                    return {
                        id: instant.id || null,
                        name: instant.title || instant.name || instant.label || 'Unknown',
                        url: mp3Url,
                        description: instant.description || instant.desc || '',
                        tags: instant.tags || instant.categories || [],
                        color: instant.color || null
                    };
                }).filter(sound => sound.url); // Filter out sounds without valid URLs
            }

            // Fallback to scraping random page
            console.log('MyInstants random API returned no data, trying fallback...');
            return await this.getRandomSoundsFallback(limit);
        } catch (error) {
            console.error('MyInstants random API error:', error.message);
            
            // Fallback to direct website scraping
            try {
                return await this.getRandomSoundsFallback(limit);
            } catch (fallbackError) {
                console.error('Fallback random scraping failed:', fallbackError.message);
                return [];
            }
        }
    }

    /**
     * Fallback method for random sounds
     */
    async getRandomSoundsFallback(limit = 20) {
        try {
            // MyInstants doesn't have a dedicated random page, so we'll fetch from trending
            // and shuffle the results to simulate randomness
            const response = await axios.get('https://www.myinstants.com/en/index/us/', {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            const allSounds = [];

            $('.instant').each((i, elem) => {
                const $elem = $(elem);
                const $button = $elem.find('.small-button, button[onclick*="play"]').first();
                
                const onclickAttr = $button.attr('onclick') || '';
                const soundMatch = onclickAttr.match(/play\('([^']+)'/);
                
                if (soundMatch && soundMatch[1]) {
                    let soundUrl = soundMatch[1];
                    if (!soundUrl.startsWith('http')) {
                        soundUrl = `https://www.myinstants.com${soundUrl}`;
                    }

                    const name = $elem.find('.instant-link, a').first().text().trim() || 'Unknown Sound';
                    
                    allSounds.push({
                        id: null,
                        name: name,
                        url: soundUrl,
                        description: '',
                        tags: [],
                        color: null
                    });
                }
            });

            // Shuffle and take limited results
            const shuffled = allSounds.sort(() => Math.random() - 0.5);
            const results = shuffled.slice(0, limit);

            console.log(`Fallback random scraping found ${results.length} results`);
            return results;
        } catch (error) {
            console.error('Fallback random scraping error:', error.message);
            throw error;
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

        // Initialize preview system components
        this.initPreviewSystem();

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers
        this.registerTikTokEventHandlers();

        this.api.log('✅ Soundboard Plugin initialized', 'info');
    }

    /**
     * Initialize the client-side preview system
     */
    initPreviewSystem() {
        const io = this.api.getSocketIO();
        const app = this.api.getApp();
        const apiLimiter = require('../../modules/rate-limiter').apiLimiter;
        
        // Get sounds directory path
        const soundsDir = path.join(__dirname, '../../public/sounds');
        
        // Initialize fetcher (path validation & URL whitelist)
        this.fetcher = new SoundboardFetcher();
        
        // Initialize WebSocket transport (dashboard client tracking & broadcasting)
        this.transport = new SoundboardWebSocketTransport(io);
        
        // Initialize API routes (preview endpoint with auth & validation)
        this.apiRoutes = new SoundboardApiRoutes(
            app,
            apiLimiter,
            this.fetcher,
            this.transport,
            {
                info: (msg) => this.api.log(msg, 'info'),
                warn: (msg) => this.api.log(msg, 'warn'),
                error: (msg) => this.api.log(msg, 'error')
            },
            soundsDir
        );
        
        this.api.log('✅ Soundboard preview system initialized (client-side mode)', 'info');
        
        // Check environment configuration
        const previewMode = process.env.SOUNDBOARD_PREVIEW_MODE || 'client';
        if (previewMode !== 'client') {
            this.api.log(`⚠️ SOUNDBOARD_PREVIEW_MODE is set to "${previewMode}" but only "client" mode is supported`, 'warn');
        }
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
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Gift event received but soundboard is disabled');
                return;
            }
            await this.soundboard.playGiftSound(data);
        });

        // Follow Event
        this.api.registerTikTokEvent('follow', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Follow event received but soundboard is disabled');
                return;
            }
            await this.soundboard.playFollowSound();
        });

        // Subscribe Event
        this.api.registerTikTokEvent('subscribe', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Subscribe event received but soundboard is disabled');
                return;
            }
            await this.soundboard.playSubscribeSound();
        });

        // Share Event
        this.api.registerTikTokEvent('share', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Share event received but soundboard is disabled');
                return;
            }
            await this.soundboard.playShareSound();
        });

        // Like Event
        this.api.registerTikTokEvent('like', async (data) => {
            const soundboardEnabled = db.getSetting('soundboard_enabled') === 'true';
            if (!soundboardEnabled) {
                // Likes sind sehr häufig - nur beim ersten Mal loggen
                return;
            }
            await this.soundboard.handleLikeEvent(data.likeCount || 1);
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
