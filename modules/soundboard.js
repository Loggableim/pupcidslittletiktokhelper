const EventEmitter = require('events');
const axios = require('axios');

/**
 * Soundboard Module
 * Handles gift-specific sounds, audio queue management, and MyInstants integration
 */
class SoundboardManager extends EventEmitter {
    constructor(db, io) {
        super();
        this.db = db;
        this.io = io;
        this.queue = [];
        this.isProcessing = false;
        this.likeHistory = []; // Deque for like threshold tracking

        console.log('✅ Soundboard Manager initialized');
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
            volume: sound.volume || 1.0
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
            volume: s.volume || 1.0
        }));
    }

    /**
     * Add or update gift sound
     */
    setGiftSound(giftId, label, mp3Url, volume = 1.0) {
        const stmt = this.db.db.prepare(`
            INSERT INTO gift_sounds (gift_id, label, mp3_url, volume)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(gift_id) DO UPDATE SET
                label = excluded.label,
                mp3_url = excluded.mp3_url,
                volume = excluded.volume
        `);

        const result = stmt.run(giftId, label, mp3Url, volume);
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
     * Core sound playback function with queue management
     */
    async playSound(url, volume = 1.0, label = 'Sound') {
        const playMode = this.db.getSetting('soundboard_play_mode') || 'overlap';
        const maxQueueLength = parseInt(this.db.getSetting('soundboard_max_queue_length')) || 10;

        const soundData = {
            url: url,
            volume: volume,
            label: label,
            timestamp: Date.now()
        };

        if (playMode === 'sequential') {
            // Add to queue
            if (this.queue.length >= maxQueueLength) {
                console.log(`⚠️ Soundboard queue full, dropping sound: ${label}`);
                return;
            }

            this.queue.push(soundData);
            console.log(`🎵 Added to queue: ${label} (Queue: ${this.queue.length})`);

            // Process queue if not already processing
            if (!this.isProcessing) {
                this.processQueue();
            }
        } else {
            // Overlap mode: play immediately
            this.emitSound(soundData);
            console.log(`🎵 Playing (overlap): ${label}`);
        }
    }

    /**
     * Process sound queue sequentially
     */
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const sound = this.queue.shift();
            console.log(`🎵 Playing from queue: ${sound.label} (Remaining: ${this.queue.length})`);

            // Emit sound to overlay
            this.emitSound(sound);

            // Wait for sound duration (estimate based on URL or use fixed delay)
            // Since we don't have audio duration info, use a configurable delay
            const delayMs = parseInt(this.db.getSetting('soundboard_queue_delay_ms')) || 2000;
            await this.sleep(delayMs);
        }

        this.isProcessing = false;
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

            return [];
        } catch (error) {
            console.error('MyInstants search error:', error.message);
            return [];
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
     * Clear sound queue
     */
    clearQueue() {
        this.queue = [];
        console.log('🗑️ Sound queue cleared');
    }

    /**
     * Get current queue status
     */
    getQueueStatus() {
        return {
            length: this.queue.length,
            isProcessing: this.isProcessing,
            items: this.queue.map(s => ({ label: s.label, volume: s.volume }))
        };
    }

    /**
     * Utility: Sleep function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = SoundboardManager;
