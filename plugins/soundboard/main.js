const SoundboardManager = require('../../modules/soundboard');

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
