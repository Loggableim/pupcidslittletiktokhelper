'use strict';

const path        = require('path');
const BrainEngine = require('./brain/brain-engine');

/**
 * AnimazingPal Plugin
 *
 * AI-powered stream companion.  Uses a Brain Engine to track viewer
 * interactions and engagement patterns during TikTok LIVE streams.
 */
class AnimazingPalPlugin {
    constructor(api) {
        this.api         = api;
        this.io          = api.getSocketIO();
        this.brainEngine = null;
    }

    async init() {
        this.api.log('Initializing AnimazingPal...', 'info');

        await this.initializeBrainEngine();
        this.registerRoutes();
        this.registerTikTokEvents();

        this.api.log('✅ AnimazingPal initialized', 'info');
    }

    // ─── Brain Engine ─────────────────────────────────────────────────────────

    async initializeBrainEngine() {
        try {
            // Store the brain DB alongside the plugin so it persists across
            // restarts but is isolated from the main application database.
            const dataDir    = this.api.getPluginDir();
            const streamerId = this.api.getConfig('streamerId') || 'default';

            const logger = {
                info:  (msg) => this.api.log(msg, 'info'),
                warn:  (msg) => this.api.log(msg, 'warn'),
                error: (msg) => this.api.log(msg, 'error'),
            };

            this.brainEngine = new BrainEngine(dataDir, streamerId, logger);
            await this.brainEngine.initialize();
        } catch (error) {
            this.api.log(`Failed to initialize Brain Engine: ${error.message}`, 'error');
            // Non-fatal: plugin continues without brain engine
            this.brainEngine = null;
        }
    }

    // ─── Routes ───────────────────────────────────────────────────────────────

    registerRoutes() {
        this.api.registerRoute('GET', '/api/plugins/animazingpal/memory', (req, res) => {
            try {
                const limit  = parseInt(req.query.limit) || 50;
                const memory = this.brainEngine ? this.brainEngine.getMemory(limit) : [];
                res.json({ success: true, data: memory, brainReady: !!this.brainEngine?.ready });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('GET', '/api/plugins/animazingpal/status', (req, res) => {
            res.json({
                success:    true,
                brainReady: !!(this.brainEngine && this.brainEngine.ready)
            });
        });
    }

    // ─── TikTok Events ────────────────────────────────────────────────────────

    registerTikTokEvents() {
        const events = ['gift', 'chat', 'follow', 'share', 'like', 'subscribe'];
        for (const evt of events) {
            this.api.registerTikTokEvent(evt, (data) => {
                if (this.brainEngine) {
                    this.brainEngine.processEvent(evt, data);
                }
            });
        }
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    async destroy() {
        if (this.brainEngine) {
            this.brainEngine.destroy();
            this.brainEngine = null;
        }
        this.api.log('AnimazingPal stopped', 'info');
    }
}

module.exports = AnimazingPalPlugin;
