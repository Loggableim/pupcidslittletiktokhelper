const path = require('path');
const fs = require('fs');
const multer = require('multer');

/**
 * Gift Milestone Celebration Plugin
 *
 * Celebrates coin milestones with custom animations and audio
 * Tracks cumulative gift coins and triggers celebrations when thresholds are reached
 */
class GiftMilestonePlugin {
    constructor(api) {
        this.api = api;
        this.uploadDir = path.join(__dirname, 'uploads');
        this.upload = null;
        this.exclusiveMode = false; // Track if we're in exclusive playback mode
    }

    async init() {
        this.api.log('Initializing Gift Milestone Celebration Plugin...', 'info');

        // Create upload directory
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }

        // Setup multer for file uploads
        this.setupFileUpload();

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers
        this.registerTikTokEventHandlers();

        // Check for session reset on initialization
        this.checkSessionReset();

        this.api.log('✅ Gift Milestone Celebration Plugin initialized', 'info');
    }

    setupFileUpload() {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.uploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname);
                const type = file.fieldname; // 'gif', 'video', or 'audio'
                cb(null, `milestone-${type}-${uniqueSuffix}${ext}`);
            }
        });

        this.upload = multer({
            storage: storage,
            limits: {
                fileSize: 100 * 1024 * 1024 // 100MB
            },
            fileFilter: (req, file, cb) => {
                const fieldName = file.fieldname;
                let allowedTypes = null;
                let maxSize = 100 * 1024 * 1024; // Default 100MB

                if (fieldName === 'gif') {
                    allowedTypes = /gif|png|jpg|jpeg|webp/;
                    maxSize = 25 * 1024 * 1024; // 25MB
                } else if (fieldName === 'video') {
                    allowedTypes = /mp4|webm|mov|avi/;
                    maxSize = 100 * 1024 * 1024; // 100MB
                } else if (fieldName === 'audio') {
                    allowedTypes = /mp3|wav|ogg|m4a/;
                    maxSize = 25 * 1024 * 1024; // 25MB
                }

                if (!allowedTypes) {
                    return cb(new Error('Invalid field name'));
                }

                const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
                const mimetype = allowedTypes.test(file.mimetype);

                if (mimetype && extname) {
                    return cb(null, true);
                } else {
                    cb(new Error(`Invalid file type for ${fieldName}. Allowed: ${allowedTypes}`));
                }
            }
        });
    }

    registerRoutes() {
        // Serve plugin UI (configuration page)
        this.api.registerRoute('get', '/gift-milestone/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui.html');
            res.sendFile(uiPath);
        });

        // Serve plugin overlay
        this.api.registerRoute('get', '/gift-milestone/overlay', (req, res) => {
            const overlayPath = path.join(__dirname, 'overlay.html');
            res.sendFile(overlayPath);
        });

        // Serve uploaded files
        this.api.registerRoute('get', '/gift-milestone/uploads/:filename', (req, res) => {
            const filename = req.params.filename;
            const filePath = path.join(this.uploadDir, filename);

            if (fs.existsSync(filePath)) {
                res.sendFile(filePath);
            } else {
                res.status(404).json({ success: false, error: 'File not found' });
            }
        });

        // Get milestone config
        this.api.registerRoute('get', '/api/gift-milestone/config', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const config = db.getMilestoneConfig();
                res.json({ success: true, config });
            } catch (error) {
                this.api.log(`Error getting milestone config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get milestone stats
        this.api.registerRoute('get', '/api/gift-milestone/stats', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const stats = db.getMilestoneStats();
                const config = db.getMilestoneConfig();
                res.json({
                    success: true,
                    stats,
                    config
                });
            } catch (error) {
                this.api.log(`Error getting milestone stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update milestone config
        this.api.registerRoute('post', '/api/gift-milestone/config', (req, res) => {
            const config = req.body;

            if (!config) {
                return res.status(400).json({ success: false, error: 'config is required' });
            }

            try {
                const db = this.api.getDatabase();
                db.updateMilestoneConfig(config);
                this.api.log('🎯 Milestone configuration updated', 'info');

                // Notify overlays about config change
                this.api.emit('milestone:config-update', { config });

                res.json({ success: true, message: 'Milestone configuration updated' });
            } catch (error) {
                this.api.log(`Error updating milestone config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Toggle milestone enabled/disabled
        this.api.registerRoute('post', '/api/gift-milestone/toggle', (req, res) => {
            const { enabled } = req.body;

            if (enabled === undefined) {
                return res.status(400).json({ success: false, error: 'enabled is required' });
            }

            try {
                const db = this.api.getDatabase();
                db.toggleMilestone(enabled);
                this.api.log(`🎯 Milestone ${enabled ? 'enabled' : 'disabled'}`, 'info');

                // Notify overlays about toggle
                this.api.emit('milestone:toggle', { enabled });

                res.json({ success: true, message: `Milestone ${enabled ? 'enabled' : 'disabled'}` });
            } catch (error) {
                this.api.log(`Error toggling milestone: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Reset milestone stats
        this.api.registerRoute('post', '/api/gift-milestone/reset', (req, res) => {
            try {
                const db = this.api.getDatabase();
                db.resetMilestoneStats();
                this.api.log('🎯 Milestone stats reset', 'info');

                // Notify overlays about reset
                this.api.emit('milestone:stats-update', db.getMilestoneStats());

                res.json({ success: true, message: 'Milestone stats reset' });
            } catch (error) {
                this.api.log(`Error resetting milestone stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Upload milestone media files
        this.api.registerRoute('post', '/api/gift-milestone/upload/:type', (req, res) => {
            const type = req.params.type; // 'gif', 'video', or 'audio'

            if (!['gif', 'video', 'audio'].includes(type)) {
                return res.status(400).json({ success: false, error: 'Invalid type. Must be gif, video, or audio' });
            }

            this.upload.single(type)(req, res, (err) => {
                if (err) {
                    this.api.log(`Error uploading milestone ${type}: ${err.message}`, 'error');
                    return res.status(500).json({ success: false, error: err.message });
                }

                try {
                    if (!req.file) {
                        return res.status(400).json({ success: false, error: 'No file uploaded' });
                    }

                    const fileUrl = `/gift-milestone/uploads/${req.file.filename}`;
                    this.api.log(`📤 Milestone ${type} uploaded: ${req.file.filename}`, 'info');

                    // Update database with file path
                    const db = this.api.getDatabase();
                    const config = db.getMilestoneConfig();
                    if (type === 'gif') {
                        config.animation_gif_path = fileUrl;
                    } else if (type === 'video') {
                        config.animation_video_path = fileUrl;
                    } else if (type === 'audio') {
                        config.animation_audio_path = fileUrl;
                    }
                    db.updateMilestoneConfig(config);

                    res.json({
                        success: true,
                        message: `${type} uploaded successfully`,
                        url: fileUrl,
                        filename: req.file.filename,
                        size: req.file.size
                    });
                } catch (error) {
                    this.api.log(`Error uploading milestone ${type}: ${error.message}`, 'error');
                    res.status(500).json({ success: false, error: error.message });
                }
            });
        });

        // Delete milestone media file
        this.api.registerRoute('delete', '/api/gift-milestone/media/:type', (req, res) => {
            const type = req.params.type; // 'gif', 'video', or 'audio'

            if (!['gif', 'video', 'audio'].includes(type)) {
                return res.status(400).json({ success: false, error: 'Invalid type' });
            }

            try {
                const db = this.api.getDatabase();
                const config = db.getMilestoneConfig();
                let filePath = null;

                if (type === 'gif' && config.animation_gif_path) {
                    filePath = path.join(__dirname, '..', '..', 'public', config.animation_gif_path);
                    config.animation_gif_path = null;
                } else if (type === 'video' && config.animation_video_path) {
                    filePath = path.join(__dirname, '..', '..', 'public', config.animation_video_path);
                    config.animation_video_path = null;
                } else if (type === 'audio' && config.animation_audio_path) {
                    filePath = path.join(__dirname, '..', '..', 'public', config.animation_audio_path);
                    config.animation_audio_path = null;
                }

                if (filePath && fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    this.api.log(`🗑️ Deleted milestone ${type}`, 'info');
                }

                db.updateMilestoneConfig(config);

                res.json({ success: true, message: `${type} deleted successfully` });
            } catch (error) {
                this.api.log(`Error deleting milestone ${type}: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test milestone trigger
        this.api.registerRoute('post', '/api/gift-milestone/test', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const config = db.getMilestoneConfig();

                if (!config.enabled) {
                    return res.status(400).json({ success: false, error: 'Milestone is disabled' });
                }

                const stats = db.getMilestoneStats();

                this.api.log('🧪 Testing milestone celebration', 'info');

                // Trigger celebration
                this.triggerCelebration(stats.current_milestone || config.threshold);

                res.json({
                    success: true,
                    message: 'Test celebration triggered',
                    milestone: stats.current_milestone || config.threshold
                });
            } catch (error) {
                this.api.log(`Error testing milestone: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Serve uploaded files via static route
        const express = require('express');
        this.api.getApp().use('/plugins/gift-milestone/uploads', express.static(this.uploadDir));

        this.api.log('✅ Gift Milestone routes registered', 'info');
    }

    registerTikTokEventHandlers() {
        // Gift Event - Track coins and check for milestone
        this.api.registerTikTokEvent('gift', (data) => {
            this.handleGiftEvent(data);
        });

        this.api.log('✅ Gift Milestone TikTok event handlers registered', 'info');
    }

    handleGiftEvent(data) {
        try {
            const db = this.api.getDatabase();
            const coins = data.coins || 0;

            if (coins === 0) {
                return;
            }

            // Add coins and check if milestone reached
            const result = db.addCoinsToMilestone(coins);

            // Emit stats update to UI
            this.api.emit('milestone:stats-update', {
                cumulative_coins: result.coins,
                current_milestone: result.nextMilestone
            });

            if (result.triggered) {
                this.api.log(`🎯 Milestone reached! ${result.milestone} coins (Total: ${result.coins})`, 'info');
                this.triggerCelebration(result.milestone);
            } else {
                this.api.log(`💰 Coins added: +${coins} (Total: ${result.coins}/${result.nextMilestone})`, 'debug');
            }
        } catch (error) {
            this.api.log(`Error handling gift event for milestone: ${error.message}`, 'error');
        }
    }

    triggerCelebration(milestone) {
        try {
            const db = this.api.getDatabase();
            const config = db.getMilestoneConfig();

            if (!config || !config.enabled) {
                return;
            }

            const celebrationData = {
                milestone: milestone,
                gif: config.animation_gif_path,
                video: config.animation_video_path,
                audio: config.animation_audio_path,
                audioVolume: config.audio_volume,
                duration: config.animation_duration,
                playbackMode: config.playback_mode
            };

            // Set exclusive mode if configured
            if (config.playback_mode === 'exclusive') {
                this.exclusiveMode = true;
                this.api.emit('milestone:exclusive-start', {});

                // Reset exclusive mode after animation duration
                const duration = config.animation_duration || 10000; // Default 10 seconds
                setTimeout(() => {
                    this.exclusiveMode = false;
                    this.api.emit('milestone:exclusive-end', {});
                }, duration);
            }

            // Emit celebration event to overlay
            this.api.emit('milestone:celebrate', celebrationData);

            this.api.log(`🎉 Milestone celebration triggered: ${milestone} coins`, 'info');
        } catch (error) {
            this.api.log(`Error triggering celebration: ${error.message}`, 'error');
        }
    }

    checkSessionReset() {
        try {
            const db = this.api.getDatabase();
            const config = db.getMilestoneConfig();

            if (config && config.session_reset) {
                this.api.log('🔄 Session reset enabled - resetting milestone stats', 'info');
                db.resetMilestoneStats();
            }
        } catch (error) {
            this.api.log(`Error checking session reset: ${error.message}`, 'error');
        }
    }

    async destroy() {
        this.api.log('🎯 Gift Milestone Plugin destroyed', 'info');
    }
}

module.exports = GiftMilestonePlugin;
