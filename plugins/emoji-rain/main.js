const path = require('path');
const fs = require('fs');
const multer = require('multer');

/**
 * Emoji Rain Plugin
 *
 * Physics-based emoji rain effect for TikTok events
 * Supports custom emojis, images, and advanced physics simulation
 */
class EmojiRainPlugin {
    constructor(api) {
        this.api = api;
        this.emojiRainUploadDir = path.join(__dirname, 'uploads');
        this.emojiRainUpload = null;
    }

    async init() {
        this.api.log('Initializing Emoji Rain Plugin...', 'info');

        // Create upload directory
        if (!fs.existsSync(this.emojiRainUploadDir)) {
            fs.mkdirSync(this.emojiRainUploadDir, { recursive: true });
        }

        // Setup multer for file uploads
        const emojiRainStorage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.emojiRainUploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, 'emoji-' + uniqueSuffix + path.extname(file.originalname));
            }
        });

        this.emojiRainUpload = multer({
            storage: emojiRainStorage,
            limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
            fileFilter: (req, file, cb) => {
                const allowedTypes = /png|jpg|jpeg|gif|webp|svg/;
                const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
                const mimetype = allowedTypes.test(file.mimetype);

                if (mimetype && extname) {
                    return cb(null, true);
                } else {
                    cb(new Error('Only image files (PNG, JPG, GIF, WebP, SVG) are allowed!'));
                }
            }
        });

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers
        this.registerTikTokEventHandlers();

        this.api.log('✅ Emoji Rain Plugin initialized', 'info');
    }

    registerRoutes() {
        // Get emoji rain config
        this.api.registerRoute('get', '/api/emoji-rain/config', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const config = db.getEmojiRainConfig();
                res.json({ success: true, config });
            } catch (error) {
                this.api.log(`Error getting emoji rain config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update emoji rain config
        this.api.registerRoute('post', '/api/emoji-rain/config', (req, res) => {
            const { config, enabled } = req.body;

            if (!config) {
                return res.status(400).json({ success: false, error: 'config is required' });
            }

            try {
                const db = this.api.getDatabase();
                db.updateEmojiRainConfig(config, enabled !== undefined ? enabled : null);
                this.api.log('🌧️ Emoji rain configuration updated', 'info');

                // Notify overlays about config change
                this.api.emit('emoji-rain:config-update', { config, enabled });

                res.json({ success: true, message: 'Emoji rain configuration updated' });
            } catch (error) {
                this.api.log(`Error updating emoji rain config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Toggle emoji rain
        this.api.registerRoute('post', '/api/emoji-rain/toggle', (req, res) => {
            const { enabled } = req.body;

            if (enabled === undefined) {
                return res.status(400).json({ success: false, error: 'enabled is required' });
            }

            try {
                const db = this.api.getDatabase();
                db.toggleEmojiRain(enabled);
                this.api.log(`🌧️ Emoji rain ${enabled ? 'enabled' : 'disabled'}`, 'info');

                // Notify overlays about toggle
                this.api.emit('emoji-rain:toggle', { enabled });

                res.json({ success: true, message: `Emoji rain ${enabled ? 'enabled' : 'disabled'}` });
            } catch (error) {
                this.api.log(`Error toggling emoji rain: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test emoji rain
        this.api.registerRoute('post', '/api/emoji-rain/test', (req, res) => {
            const { count, emoji, x, y } = req.body;

            try {
                const db = this.api.getDatabase();
                const config = db.getEmojiRainConfig();

                if (!config.enabled) {
                    return res.status(400).json({ success: false, error: 'Emoji rain is disabled' });
                }

                // Create test spawn data
                const testData = {
                    count: parseInt(count) || 1,
                    emoji: emoji || config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)],
                    x: parseFloat(x) || Math.random(),
                    y: parseFloat(y) || 0,
                    username: 'Test User',
                    reason: 'test'
                };

                this.api.log(`🧪 Testing emoji rain: ${testData.count}x ${testData.emoji}`, 'info');

                // Emit to overlay
                this.api.emit('emoji-rain:spawn', testData);

                res.json({ success: true, message: 'Test emojis spawned', data: testData });
            } catch (error) {
                this.api.log(`Error testing emoji rain: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Upload custom emoji rain image
        this.api.registerRoute('post', '/api/emoji-rain/upload', (req, res) => {
            this.emojiRainUpload.single('image')(req, res, (err) => {
                if (err) {
                    this.api.log(`Error uploading emoji rain image: ${err.message}`, 'error');
                    return res.status(500).json({ success: false, error: err.message });
                }

                try {
                    if (!req.file) {
                        return res.status(400).json({ success: false, error: 'No file uploaded' });
                    }

                    const fileUrl = `/plugins/emoji-rain/uploads/${req.file.filename}`;
                    this.api.log(`📤 Emoji rain image uploaded: ${req.file.filename}`, 'info');

                    res.json({
                        success: true,
                        message: 'Image uploaded successfully',
                        url: fileUrl,
                        filename: req.file.filename,
                        size: req.file.size
                    });
                } catch (error) {
                    this.api.log(`Error uploading emoji rain image: ${error.message}`, 'error');
                    res.status(500).json({ success: false, error: error.message });
                }
            });
        });

        // Get list of uploaded emoji rain images
        this.api.registerRoute('get', '/api/emoji-rain/images', (req, res) => {
            try {
                const files = fs.readdirSync(this.emojiRainUploadDir)
                    .filter(f => f !== '.gitkeep')
                    .map(filename => ({
                        filename,
                        url: `/plugins/emoji-rain/uploads/${filename}`,
                        size: fs.statSync(path.join(this.emojiRainUploadDir, filename)).size,
                        created: fs.statSync(path.join(this.emojiRainUploadDir, filename)).birthtime
                    }));

                res.json({ success: true, images: files });
            } catch (error) {
                this.api.log(`Error listing emoji rain images: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete uploaded emoji rain image
        this.api.registerRoute('delete', '/api/emoji-rain/images/:filename', (req, res) => {
            try {
                const filename = req.params.filename;
                const filePath = path.join(this.emojiRainUploadDir, filename);

                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ success: false, error: 'File not found' });
                }

                fs.unlinkSync(filePath);
                this.api.log(`🗑️ Deleted emoji rain image: ${filename}`, 'info');

                res.json({ success: true, message: 'Image deleted successfully' });
            } catch (error) {
                this.api.log(`Error deleting emoji rain image: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Serve uploaded files
        const express = require('express');
        this.api.getApp().use('/plugins/emoji-rain/uploads', express.static(this.emojiRainUploadDir));

        this.api.log('✅ Emoji Rain routes registered', 'info');
    }

    registerTikTokEventHandlers() {
        // Gift Event
        this.api.registerTikTokEvent('gift', (data) => {
            this.spawnEmojiRain('gift', data);
        });

        // Follow Event
        this.api.registerTikTokEvent('follow', (data) => {
            this.spawnEmojiRain('follow', data, 5, '💙');
        });

        // Subscribe Event
        this.api.registerTikTokEvent('subscribe', (data) => {
            this.spawnEmojiRain('subscribe', data, 8, '⭐');
        });

        // Share Event
        this.api.registerTikTokEvent('share', (data) => {
            this.spawnEmojiRain('share', data, 5, '🔄');
        });

        // Like Event
        this.api.registerTikTokEvent('like', (data) => {
            this.spawnEmojiRain('like', data);
        });

        this.api.log('✅ Emoji Rain TikTok event handlers registered', 'info');
    }

    /**
     * Spawn emojis for emoji rain effect
     * @param {string} reason - Event type (gift, like, follow, etc.)
     * @param {object} data - Event data
     * @param {number} count - Number of emojis to spawn
     * @param {string} emoji - Optional specific emoji
     */
    spawnEmojiRain(reason, data, count = null, emoji = null) {
        try {
            const db = this.api.getDatabase();
            const config = db.getEmojiRainConfig();

            if (!config.enabled) {
                return;
            }

            // Calculate count based on reason if not provided
            if (!count) {
                if (reason === 'gift' && data.coins) {
                    count = config.gift_base_emojis + Math.floor(data.coins * config.gift_coin_multiplier);
                    count = Math.min(config.gift_max_emojis, count);
                } else if (reason === 'like' && data.likeCount) {
                    count = Math.floor(data.likeCount / config.like_count_divisor);
                    count = Math.max(config.like_min_emojis, Math.min(config.like_max_emojis, count));
                } else {
                    count = 3; // Default for follow, share, subscribe
                }
            }

            // Select random emoji from config if not specified
            if (!emoji && config.emoji_set && config.emoji_set.length > 0) {
                emoji = config.emoji_set[Math.floor(Math.random() * config.emoji_set.length)];
            }

            // Random horizontal position
            const x = Math.random();
            const y = 0;

            // Emit to overlay
            this.api.emit('emoji-rain:spawn', {
                count: count,
                emoji: emoji,
                x: x,
                y: y,
                username: data.username || 'Unknown',
                reason: reason
            });

            this.api.log(`🌧️ Emoji rain spawned: ${count}x ${emoji} for ${reason}`, 'debug');
        } catch (error) {
            this.api.log(`Error spawning emoji rain: ${error.message}`, 'error');
        }
    }

    async destroy() {
        this.api.log('🌧️ Emoji Rain Plugin destroyed', 'info');
    }
}

module.exports = EmojiRainPlugin;
