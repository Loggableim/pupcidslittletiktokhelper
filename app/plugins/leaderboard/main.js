const path = require('path');
const LeaderboardDatabase = require('./db');

/**
 * Leaderboard Plugin
 * Tracks top gifters for current session and all-time
 */
class LeaderboardPlugin {
    constructor(api) {
        this.api = api;
        this.dbModule = null;
        this.sessionData = new Map(); // In-memory session tracking: userId -> { nickname, uniqueId, profilePictureUrl, coins }
    }

    async init() {
        this.api.log('Initializing Leaderboard Plugin...', 'info');

        // Initialize database module
        const db = this.api.getDatabase();
        this.dbModule = new LeaderboardDatabase(db, {
            info: (msg) => this.api.log(msg, 'info'),
            error: (msg) => this.api.log(msg, 'error'),
            warn: (msg) => this.api.log(msg, 'warn')
        });
        
        this.dbModule.initializeTables();

        // Register API routes
        this.registerRoutes();

        // Register Socket.io events
        this.registerSocketEvents();

        // Register TikTok event handlers
        this.registerTikTokEvents();

        this.api.log('✅ Leaderboard Plugin initialized', 'info');
    }

    /**
     * Register API routes
     */
    registerRoutes() {
        // Get current session leaderboard
        this.api.registerRoute('GET', '/api/plugins/leaderboard/session', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 10;
                const sessionBoard = this.getSessionLeaderboard(limit);
                res.json({
                    success: true,
                    data: sessionBoard,
                    sessionStartTime: this.dbModule.getSessionStartTime()
                });
            } catch (error) {
                this.api.log(`Error getting session leaderboard: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get all-time leaderboard
        this.api.registerRoute('GET', '/api/plugins/leaderboard/alltime', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 10;
                const minCoins = parseInt(req.query.minCoins) || 0;
                const alltimeBoard = this.dbModule.getTopGifters(limit, minCoins);
                res.json({
                    success: true,
                    data: alltimeBoard
                });
            } catch (error) {
                this.api.log(`Error getting all-time leaderboard: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get combined leaderboard (both session and all-time)
        this.api.registerRoute('GET', '/api/plugins/leaderboard/combined', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 10;
                const minCoins = parseInt(req.query.minCoins) || 0;
                
                const sessionBoard = this.getSessionLeaderboard(limit);
                const alltimeBoard = this.dbModule.getTopGifters(limit, minCoins);
                
                res.json({
                    success: true,
                    session: {
                        data: sessionBoard,
                        startTime: this.dbModule.getSessionStartTime()
                    },
                    alltime: {
                        data: alltimeBoard
                    }
                });
            } catch (error) {
                this.api.log(`Error getting combined leaderboard: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get user stats
        this.api.registerRoute('GET', '/api/plugins/leaderboard/user/:userId', (req, res) => {
            try {
                const userId = req.params.userId;
                const stats = this.dbModule.getUserStats(userId);
                const sessionStats = this.sessionData.get(userId);

                res.json({
                    success: true,
                    alltime: stats,
                    session: sessionStats || null
                });
            } catch (error) {
                this.api.log(`Error getting user stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Reset session (admin command)
        this.api.registerRoute('POST', '/api/plugins/leaderboard/reset-session', (req, res) => {
            try {
                this.resetSession();
                res.json({
                    success: true,
                    message: 'Session reset successfully'
                });
            } catch (error) {
                this.api.log(`Error resetting session: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get config
        this.api.registerRoute('GET', '/api/plugins/leaderboard/config', (req, res) => {
            try {
                const config = this.dbModule.getConfig();
                res.json({
                    success: true,
                    config
                });
            } catch (error) {
                this.api.log(`Error getting config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update config
        this.api.registerRoute('POST', '/api/plugins/leaderboard/config', (req, res) => {
            try {
                this.dbModule.updateConfig(req.body);
                res.json({
                    success: true,
                    message: 'Config updated successfully'
                });
            } catch (error) {
                this.api.log(`Error updating config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Serve overlay HTML
        this.api.registerRoute('GET', '/leaderboard/overlay', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
        });

        // Serve overlay CSS
        this.api.registerRoute('GET', '/leaderboard/style.css', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'style.css'));
        });

        // Serve overlay JS
        this.api.registerRoute('GET', '/leaderboard/script.js', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'script.js'));
        });

        this.api.log('API routes registered', 'info');
    }

    /**
     * Register Socket.io events
     */
    registerSocketEvents() {
        // Client requests leaderboard update
        this.api.registerSocket('leaderboard:request-update', async (socket) => {
            const sessionBoard = this.getSessionLeaderboard(10);
            const alltimeBoard = this.dbModule.getTopGifters(10, 0);
            
            socket.emit('leaderboard:update', {
                session: {
                    data: sessionBoard,
                    startTime: this.dbModule.getSessionStartTime()
                },
                alltime: {
                    data: alltimeBoard
                }
            });
        });

        // Client requests session reset
        this.api.registerSocket('leaderboard:reset-session', async (socket) => {
            this.resetSession();
            socket.emit('leaderboard:session-reset', {
                success: true,
                timestamp: new Date().toISOString()
            });
        });

        this.api.log('Socket.io events registered', 'info');
    }

    /**
     * Register TikTok event handlers
     */
    registerTikTokEvents() {
        // Listen for gift events
        this.api.registerTikTokEvent('gift', async (data) => {
            try {
                // Robust handling of potentially undefined values
                const userId = data.userId || data.uniqueId || 'unknown';
                const nickname = data.nickname || data.username || 'Unknown User';
                const uniqueId = data.uniqueId || '';
                const profilePictureUrl = data.profilePictureUrl || '';
                const diamondCount = data.diamondCount || data.coins || 0;

                // Validate that we have meaningful data
                if (userId === 'unknown' || diamondCount <= 0) {
                    this.api.log(`Invalid gift data received: ${JSON.stringify(data)}`, 'warn');
                    return;
                }

                // Update session data (in-memory)
                this.updateSessionData(userId, nickname, uniqueId, profilePictureUrl, diamondCount);

                // Update all-time data (persistent, with debouncing)
                this.dbModule.addCoins(userId, nickname, uniqueId, profilePictureUrl, diamondCount);

                // Emit real-time update to connected clients
                this.emitLeaderboardUpdate();

                this.api.log(`Gift tracked: ${nickname} sent ${diamondCount} coins`, 'debug');
            } catch (error) {
                this.api.log(`Error processing gift event: ${error.message}`, 'error');
            }
        });

        this.api.log('TikTok events registered', 'info');
    }

    /**
     * Update session data (in-memory)
     */
    updateSessionData(userId, nickname, uniqueId, profilePictureUrl, coins) {
        const existing = this.sessionData.get(userId);
        
        if (existing) {
            // Update existing entry
            existing.coins += coins;
            // Update user info in case name/picture changed
            if (nickname) existing.nickname = nickname;
            if (uniqueId) existing.uniqueId = uniqueId;
            if (profilePictureUrl) existing.profilePictureUrl = profilePictureUrl;
        } else {
            // Create new entry
            this.sessionData.set(userId, {
                userId,
                nickname: nickname || 'Unknown',
                uniqueId: uniqueId || '',
                profilePictureUrl: profilePictureUrl || '',
                coins
            });
        }
    }

    /**
     * Get session leaderboard sorted by coins
     */
    getSessionLeaderboard(limit = 10) {
        const entries = Array.from(this.sessionData.values());
        entries.sort((a, b) => b.coins - a.coins);
        return entries.slice(0, limit).map((entry, index) => ({
            ...entry,
            rank: index + 1
        }));
    }

    /**
     * Reset session data
     */
    resetSession() {
        this.sessionData.clear();
        this.dbModule.resetSession();
        this.api.log('Session reset complete', 'info');
        
        // Emit reset event to all clients
        this.api.emit('leaderboard:session-reset', {
            timestamp: new Date().toISOString()
        });
        
        // Emit updated leaderboard
        this.emitLeaderboardUpdate();
    }

    /**
     * Emit leaderboard update to all connected clients
     */
    emitLeaderboardUpdate() {
        const sessionBoard = this.getSessionLeaderboard(10);
        const alltimeBoard = this.dbModule.getTopGifters(10, 0);
        
        this.api.emit('leaderboard:update', {
            session: {
                data: sessionBoard,
                startTime: this.dbModule.getSessionStartTime()
            },
            alltime: {
                data: alltimeBoard
            }
        });
    }

    /**
     * Cleanup on plugin disable/shutdown
     */
    async destroy() {
        this.api.log('Stopping Leaderboard Plugin...', 'info');
        
        // Flush any pending database writes
        if (this.dbModule) {
            this.dbModule.destroy();
        }
        
        this.api.log('Leaderboard Plugin stopped', 'info');
    }
}

module.exports = LeaderboardPlugin;
