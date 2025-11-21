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

        // Initialize database tables and defaults
        this.initializeDatabase();

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

    initializeDatabase() {
        try {
            const db = this.api.getDatabase();

            // Create tables if they don't exist
            db.exec(`
                CREATE TABLE IF NOT EXISTS milestone_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    enabled INTEGER DEFAULT 1,
                    threshold INTEGER DEFAULT 1000,
                    mode TEXT DEFAULT 'auto_increment',
                    increment_step INTEGER DEFAULT 1000,
                    animation_gif_path TEXT,
                    animation_video_path TEXT,
                    animation_audio_path TEXT,
                    audio_volume INTEGER DEFAULT 80,
                    playback_mode TEXT DEFAULT 'exclusive',
                    animation_duration INTEGER DEFAULT 0,
                    session_reset INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.exec(`
                CREATE TABLE IF NOT EXISTS milestone_stats (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    cumulative_coins INTEGER DEFAULT 0,
                    current_milestone INTEGER DEFAULT 0,
                    last_trigger_at DATETIME,
                    session_start_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create milestone tiers table for multiple configurable tiers
            db.exec(`
                CREATE TABLE IF NOT EXISTS milestone_tiers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tier_name TEXT NOT NULL,
                    threshold INTEGER NOT NULL,
                    animation_gif_path TEXT,
                    animation_video_path TEXT,
                    animation_audio_path TEXT,
                    enabled INTEGER DEFAULT 1,
                    sort_order INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create user milestone stats table for per-user tracking
            db.exec(`
                CREATE TABLE IF NOT EXISTS milestone_user_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL UNIQUE,
                    username TEXT,
                    cumulative_coins INTEGER DEFAULT 0,
                    current_tier_id INTEGER,
                    last_trigger_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Initialize defaults if not exists
            const configStmt = db.prepare(`
                INSERT OR IGNORE INTO milestone_config (
                    id, enabled, threshold, mode, increment_step,
                    audio_volume, playback_mode, animation_duration, session_reset
                )
                VALUES (1, 1, 1000, 'auto_increment', 1000, 80, 'exclusive', 0, 0)
            `);
            configStmt.run();

            const statsStmt = db.prepare(`
                INSERT OR IGNORE INTO milestone_stats (id, cumulative_coins, current_milestone)
                VALUES (1, 0, 1000)
            `);
            statsStmt.run();

            // Initialize default tiers if none exist
            const tierCountStmt = db.prepare('SELECT COUNT(*) as count FROM milestone_tiers');
            const tierCount = tierCountStmt.get();
            if (tierCount.count === 0) {
                const defaultTiers = [
                    { name: 'Bronze', threshold: 1000, order: 1 },
                    { name: 'Silver', threshold: 5000, order: 2 },
                    { name: 'Gold', threshold: 10000, order: 3 },
                    { name: 'Platinum', threshold: 25000, order: 4 },
                    { name: 'Diamond', threshold: 50000, order: 5 }
                ];
                
                const insertTierStmt = db.prepare(`
                    INSERT INTO milestone_tiers (tier_name, threshold, enabled, sort_order)
                    VALUES (?, ?, 1, ?)
                `);
                
                for (const tier of defaultTiers) {
                    insertTierStmt.run(tier.name, tier.threshold, tier.order);
                }
                
                this.api.log('Default milestone tiers created', 'info');
            }

            this.api.log('Database tables initialized', 'info');
        } catch (error) {
            this.api.log(`Error initializing database: ${error.message}`, 'error');
            throw error;
        }
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

        // ========== TIER MANAGEMENT ROUTES ==========
        
        // Get all milestone tiers
        this.api.registerRoute('get', '/api/gift-milestone/tiers', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const stmt = db.prepare('SELECT * FROM milestone_tiers ORDER BY sort_order ASC, threshold ASC');
                const tiers = stmt.all();
                res.json({ success: true, tiers });
            } catch (error) {
                this.api.log(`Error getting milestone tiers: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Create new tier
        this.api.registerRoute('post', '/api/gift-milestone/tiers', (req, res) => {
            const { tier_name, threshold, animation_gif_path, animation_video_path, animation_audio_path, sort_order } = req.body;

            if (!tier_name || !threshold) {
                return res.status(400).json({ success: false, error: 'tier_name and threshold are required' });
            }

            try {
                const db = this.api.getDatabase();
                const stmt = db.prepare(`
                    INSERT INTO milestone_tiers (tier_name, threshold, animation_gif_path, animation_video_path, animation_audio_path, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                const result = stmt.run(
                    tier_name,
                    threshold,
                    animation_gif_path || null,
                    animation_video_path || null,
                    animation_audio_path || null,
                    sort_order || 0
                );

                this.api.log(`🎯 New milestone tier created: ${tier_name} at ${threshold} coins`, 'info');
                res.json({ success: true, message: 'Tier created', id: result.lastInsertRowid });
            } catch (error) {
                this.api.log(`Error creating milestone tier: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update tier
        this.api.registerRoute('put', '/api/gift-milestone/tiers/:id', (req, res) => {
            const tierId = parseInt(req.params.id);
            const { tier_name, threshold, animation_gif_path, animation_video_path, animation_audio_path, enabled, sort_order } = req.body;

            try {
                const db = this.api.getDatabase();
                const stmt = db.prepare(`
                    UPDATE milestone_tiers
                    SET tier_name = ?, threshold = ?, animation_gif_path = ?, animation_video_path = ?, 
                        animation_audio_path = ?, enabled = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `);
                stmt.run(
                    tier_name,
                    threshold,
                    animation_gif_path || null,
                    animation_video_path || null,
                    animation_audio_path || null,
                    enabled ? 1 : 0,
                    sort_order || 0,
                    tierId
                );

                this.api.log(`🎯 Milestone tier updated: ${tier_name}`, 'info');
                res.json({ success: true, message: 'Tier updated' });
            } catch (error) {
                this.api.log(`Error updating milestone tier: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete tier
        this.api.registerRoute('delete', '/api/gift-milestone/tiers/:id', (req, res) => {
            const tierId = parseInt(req.params.id);

            try {
                const db = this.api.getDatabase();
                const stmt = db.prepare('DELETE FROM milestone_tiers WHERE id = ?');
                stmt.run(tierId);

                this.api.log(`🎯 Milestone tier deleted: ${tierId}`, 'info');
                res.json({ success: true, message: 'Tier deleted' });
            } catch (error) {
                this.api.log(`Error deleting milestone tier: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ========== USER MILESTONE TRACKING ROUTES ==========

        // Get user milestone stats (all users or specific user)
        this.api.registerRoute('get', '/api/gift-milestone/users', (req, res) => {
            try {
                const db = this.api.getDatabase();
                const userId = req.query.userId;
                
                if (userId) {
                    const stmt = db.prepare('SELECT * FROM milestone_user_stats WHERE user_id = ?');
                    const user = stmt.get(userId);
                    res.json({ success: true, user });
                } else {
                    const stmt = db.prepare('SELECT * FROM milestone_user_stats ORDER BY cumulative_coins DESC');
                    const users = stmt.all();
                    res.json({ success: true, users });
                }
            } catch (error) {
                this.api.log(`Error getting user milestone stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Reset user milestone stats
        this.api.registerRoute('post', '/api/gift-milestone/users/:userId/reset', (req, res) => {
            const userId = req.params.userId;

            try {
                const db = this.api.getDatabase();
                const stmt = db.prepare(`
                    UPDATE milestone_user_stats
                    SET cumulative_coins = 0, current_tier_id = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                `);
                stmt.run(userId);

                this.api.log(`🎯 User milestone stats reset: ${userId}`, 'info');
                res.json({ success: true, message: 'User stats reset' });
            } catch (error) {
                this.api.log(`Error resetting user milestone stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

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
            const userId = data.userId || data.uniqueId;
            const username = data.nickname || data.uniqueId;

            if (coins === 0) {
                return;
            }

            // Track global milestone
            const result = db.addCoinsToMilestone(coins);

            // Track per-user milestone
            if (userId) {
                this.trackUserMilestone(userId, username, coins);
            }

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

    trackUserMilestone(userId, username, coins) {
        try {
            const db = this.api.getDatabase();
            
            // Get or create user stats
            let userStmt = db.prepare('SELECT * FROM milestone_user_stats WHERE user_id = ?');
            let userStats = userStmt.get(userId);
            
            if (!userStats) {
                // Create new user entry
                const insertStmt = db.prepare(`
                    INSERT INTO milestone_user_stats (user_id, username, cumulative_coins)
                    VALUES (?, ?, ?)
                `);
                insertStmt.run(userId, username, coins);
                userStats = { user_id: userId, username, cumulative_coins: coins, current_tier_id: null };
            } else {
                // Update existing user
                const newTotal = userStats.cumulative_coins + coins;
                const updateStmt = db.prepare(`
                    UPDATE milestone_user_stats
                    SET cumulative_coins = ?, username = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                `);
                updateStmt.run(newTotal, username, userId);
                userStats.cumulative_coins = newTotal;
            }

            // Check if user reached a new tier
            const tiersStmt = db.prepare(`
                SELECT * FROM milestone_tiers 
                WHERE enabled = 1 AND threshold <= ?
                ORDER BY threshold DESC
                LIMIT 1
            `);
            const achievedTier = tiersStmt.get(userStats.cumulative_coins);

            if (achievedTier && achievedTier.id !== userStats.current_tier_id) {
                // User reached a new tier!
                const updateTierStmt = db.prepare(`
                    UPDATE milestone_user_stats
                    SET current_tier_id = ?, last_trigger_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                `);
                updateTierStmt.run(achievedTier.id, userId);

                this.api.log(`🎯 User ${username} reached tier: ${achievedTier.tier_name} (${achievedTier.threshold} coins)`, 'info');
                
                // Trigger tier celebration with user-specific tier data
                this.triggerTierCelebration(achievedTier, username, userStats.cumulative_coins);
                
                // Emit user milestone achievement
                this.api.emit('milestone:user-achievement', {
                    userId,
                    username,
                    tier: achievedTier,
                    totalCoins: userStats.cumulative_coins
                });
            }
        } catch (error) {
            this.api.log(`Error tracking user milestone: ${error.message}`, 'error');
        }
    }

    triggerTierCelebration(tier, username, totalCoins) {
        try {
            const db = this.api.getDatabase();
            const config = db.getMilestoneConfig();

            if (!config || !config.enabled) {
                return;
            }

            const celebrationData = {
                milestone: tier.threshold,
                tierName: tier.tier_name,
                username: username,
                totalCoins: totalCoins,
                gif: tier.animation_gif_path || config.animation_gif_path,
                video: tier.animation_video_path || config.animation_video_path,
                audio: tier.animation_audio_path || config.animation_audio_path,
                audioVolume: config.audio_volume,
                duration: config.animation_duration,
                playbackMode: config.playback_mode,
                isTier: true
            };

            // Set exclusive mode if configured
            if (config.playback_mode === 'exclusive') {
                this.exclusiveMode = true;
                this.api.emit('milestone:exclusive-start', {});

                // Reset exclusive mode after animation duration
                const duration = config.animation_duration || 10000;
                setTimeout(() => {
                    this.exclusiveMode = false;
                    this.api.emit('milestone:exclusive-end', {});
                }, duration);
            }

            // Emit tier celebration event to overlay
            this.api.emit('milestone:celebrate', celebrationData);

            this.api.log(`🎉 Tier celebration triggered: ${tier.tier_name} for ${username}`, 'info');
        } catch (error) {
            this.api.log(`Error triggering tier celebration: ${error.message}`, 'error');
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
