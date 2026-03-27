'use strict';

/**
 * Milestone Leaderboard Plugin
 *
 * Shows viewers ranked by milestone tier and cumulative gift coins.
 * Milestone tiers: Bronze (500+), Silver (2000+), Gold (5000+), Diamond (10000+)
 *
 * Tracks gift data independently using the shared main database so it
 * works standalone without requiring any other plugin.
 */
class MilestoneLeaderboardPlugin {
    constructor(api) {
        this.api = api;
        this.io = api.getSocketIO();

        // In-memory session tracking: userId -> { nickname, uniqueId, profilePictureUrl, coins }
        this.sessionData = new Map();
    }

    async init() {
        this.api.log('Initializing Milestone Leaderboard Plugin...', 'info');

        this.initializeDatabase();
        this.registerRoutes();
        this.registerSocketEvents();
        this.registerTikTokEvents();

        this.api.log('✅ Milestone Leaderboard Plugin initialized', 'info');
    }

    // ─── Database ─────────────────────────────────────────────────────────────

    initializeDatabase() {
        try {
            const db = this.api.getDatabase();

            // Per-viewer milestone tracking table (all-time)
            db.exec(`
                CREATE TABLE IF NOT EXISTS milestone_leaderboard (
                    user_id TEXT PRIMARY KEY,
                    nickname TEXT NOT NULL,
                    unique_id TEXT,
                    profile_picture_url TEXT,
                    total_coins INTEGER DEFAULT 0,
                    milestone_tier TEXT DEFAULT 'none',
                    last_gift_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_milestone_lb_coins
                ON milestone_leaderboard(total_coins DESC)
            `);

            // Plugin configuration table
            db.exec(`
                CREATE TABLE IF NOT EXISTS milestone_leaderboard_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    tier_bronze  INTEGER DEFAULT 500,
                    tier_silver  INTEGER DEFAULT 2000,
                    tier_gold    INTEGER DEFAULT 5000,
                    tier_diamond INTEGER DEFAULT 10000,
                    top_count    INTEGER DEFAULT 10,
                    theme        TEXT    DEFAULT 'neon',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.prepare(`
                INSERT OR IGNORE INTO milestone_leaderboard_config
                    (id, tier_bronze, tier_silver, tier_gold, tier_diamond, top_count, theme)
                VALUES (1, 500, 2000, 5000, 10000, 10, 'neon')
            `).run();

            this.api.log('Database tables initialized', 'info');
        } catch (error) {
            this.api.log(`Failed to initialize database: ${error.message}`, 'error');
            throw error;
        }
    }

    // ─── Routes ───────────────────────────────────────────────────────────────

    registerRoutes() {
        // GET leaderboard (all-time)
        this.api.registerRoute('GET', '/api/plugins/milestone-leaderboard/alltime', (req, res) => {
            try {
                const config = this.getConfig();
                const limit  = parseInt(req.query.limit) || config.top_count || 10;
                const data   = this.getAlltimeLeaderboard(limit);
                res.json({ success: true, data, config });
            } catch (error) {
                this.api.log(`Error getting all-time leaderboard: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET leaderboard (current session, in-memory)
        this.api.registerRoute('GET', '/api/plugins/milestone-leaderboard/session', (req, res) => {
            try {
                const config = this.getConfig();
                const limit  = parseInt(req.query.limit) || config.top_count || 10;
                const data   = this.getSessionLeaderboard(limit, config);
                res.json({ success: true, data });
            } catch (error) {
                this.api.log(`Error getting session leaderboard: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GET config
        this.api.registerRoute('GET', '/api/plugins/milestone-leaderboard/config', (req, res) => {
            try {
                res.json({ success: true, config: this.getConfig() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST config
        this.api.registerRoute('POST', '/api/plugins/milestone-leaderboard/config', (req, res) => {
            try {
                this.updateConfig(req.body);
                res.json({ success: true, message: 'Config updated', config: this.getConfig() });
            } catch (error) {
                this.api.log(`Error updating config: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // POST reset session
        this.api.registerRoute('POST', '/api/plugins/milestone-leaderboard/reset-session', (req, res) => {
            try {
                this.sessionData.clear();
                this.io.emit('milestone-leaderboard:update', this.buildPayload());
                res.json({ success: true, message: 'Session reset' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    // ─── Socket Events ────────────────────────────────────────────────────────

    registerSocketEvents() {
        this.api.registerSocket('milestone-leaderboard:get', (socket) => {
            socket.emit('milestone-leaderboard:update', this.buildPayload());
        });
    }

    // ─── TikTok Events ────────────────────────────────────────────────────────

    registerTikTokEvents() {
        this.api.registerTikTokEvent('gift', (data) => {
            this.handleGift(data);
        });
    }

    handleGift(data) {
        try {
            const { userId, nickname, uniqueId, profilePictureUrl, giftId, diamondCount, repeatCount } = data;
            if (!userId) return;

            const coins = (diamondCount || 0) * (repeatCount || 1);
            if (coins <= 0) return;

            // Update in-memory session data
            const existing = this.sessionData.get(userId) || {
                userId, nickname, uniqueId, profilePictureUrl, coins: 0
            };
            existing.coins += coins;
            existing.nickname = nickname;
            this.sessionData.set(userId, existing);

            // Persist to database (all-time)
            this.upsertUser(userId, nickname, uniqueId, profilePictureUrl, coins);

            // Broadcast updated leaderboard
            this.io.emit('milestone-leaderboard:update', this.buildPayload());
        } catch (error) {
            this.api.log(`Error handling gift: ${error.message}`, 'error');
        }
    }

    // ─── Data Helpers ─────────────────────────────────────────────────────────

    upsertUser(userId, nickname, uniqueId, profilePictureUrl, coinsToAdd) {
        try {
            const db     = this.api.getDatabase();
            const config = this.getConfig();

            const stmt = db.prepare(`
                INSERT INTO milestone_leaderboard (user_id, nickname, unique_id, profile_picture_url, total_coins, milestone_tier, last_gift_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    nickname            = excluded.nickname,
                    unique_id           = excluded.unique_id,
                    profile_picture_url = excluded.profile_picture_url,
                    total_coins         = total_coins + excluded.total_coins,
                    milestone_tier      = excluded.milestone_tier,
                    last_gift_at        = CURRENT_TIMESTAMP,
                    updated_at          = CURRENT_TIMESTAMP
            `);

            // Compute tier after adding coins
            const currentRow = db.prepare('SELECT total_coins FROM milestone_leaderboard WHERE user_id = ?').get(userId);
            const newTotal   = (currentRow ? currentRow.total_coins : 0) + coinsToAdd;
            const tier       = this.computeTier(newTotal, config);

            stmt.run(userId, nickname, uniqueId || null, profilePictureUrl || null, coinsToAdd, tier);
        } catch (error) {
            this.api.log(`Failed to upsert user ${userId}: ${error.message}`, 'error');
        }
    }

    computeTier(totalCoins, config) {
        if (totalCoins >= (config.tier_diamond || 10000)) return 'diamond';
        if (totalCoins >= (config.tier_gold    || 5000))  return 'gold';
        if (totalCoins >= (config.tier_silver  || 2000))  return 'silver';
        if (totalCoins >= (config.tier_bronze  || 500))   return 'bronze';
        return 'none';
    }

    getAlltimeLeaderboard(limit = 10) {
        try {
            const db = this.api.getDatabase();
            return db.prepare(`
                SELECT user_id, nickname, unique_id, profile_picture_url,
                       total_coins, milestone_tier, last_gift_at
                FROM milestone_leaderboard
                ORDER BY total_coins DESC
                LIMIT ?
            `).all(limit);
        } catch (error) {
            this.api.log(`Failed to get all-time leaderboard: ${error.message}`, 'error');
            return [];
        }
    }

    getSessionLeaderboard(limit = 10, config = null) {
        if (!config) config = this.getConfig();

        return Array.from(this.sessionData.values())
            .sort((a, b) => b.coins - a.coins)
            .slice(0, limit)
            .map(entry => ({
                ...entry,
                milestone_tier: this.computeTier(entry.coins, config)
            }));
    }

    buildPayload() {
        try {
            const config  = this.getConfig();
            const limit   = config.top_count || 10;
            return {
                alltime: this.getAlltimeLeaderboard(limit),
                session: this.getSessionLeaderboard(limit, config),
                config
            };
        } catch (error) {
            this.api.log(`Failed to build payload: ${error.message}`, 'error');
            return { alltime: [], session: [], config: {} };
        }
    }

    getConfig() {
        try {
            const db = this.api.getDatabase();
            return db.prepare('SELECT * FROM milestone_leaderboard_config WHERE id = 1').get()
                || { tier_bronze: 500, tier_silver: 2000, tier_gold: 5000, tier_diamond: 10000, top_count: 10, theme: 'neon' };
        } catch (error) {
            return { tier_bronze: 500, tier_silver: 2000, tier_gold: 5000, tier_diamond: 10000, top_count: 10, theme: 'neon' };
        }
    }

    updateConfig(updates) {
        try {
            const db      = this.api.getDatabase();
            const allowed = ['tier_bronze', 'tier_silver', 'tier_gold', 'tier_diamond', 'top_count', 'theme'];
            const fields  = Object.keys(updates).filter(k => allowed.includes(k));
            if (fields.length === 0) return;

            const set  = fields.map(f => `${f} = ?`).join(', ');
            const vals = fields.map(f => updates[f]);
            db.prepare(`UPDATE milestone_leaderboard_config SET ${set}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(...vals);
        } catch (error) {
            this.api.log(`Failed to update config: ${error.message}`, 'error');
            throw error;
        }
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    async destroy() {
        this.sessionData.clear();
        this.api.log('Milestone Leaderboard Plugin stopped', 'info');
    }
}

module.exports = MilestoneLeaderboardPlugin;
