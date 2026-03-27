'use strict';

const path         = require('path');
const MemoryDatabase = require('./memory-database');

/**
 * Brain Engine
 *
 * Central intelligence component for AnimazingPal.  Processes TikTok
 * LIVE events, maintains interaction memory, and derives engagement
 * patterns.
 */
class BrainEngine {
    constructor(dataDir, streamerId, logger) {
        this.dataDir   = dataDir;
        this.streamerId = streamerId || 'default';
        this.logger    = logger;
        this.memoryDb  = null;
        this.ready     = false;
    }

    /**
     * Initialize the Brain Engine.
     * The MemoryDatabase.initialize() call runs all schema migrations
     * BEFORE any query that references streamer_id, so legacy databases
     * are upgraded transparently.
     */
    async initialize() {
        try {
            const dbPath    = path.join(this.dataDir, 'animazingpal_brain.db');
            this.memoryDb   = new MemoryDatabase(dbPath, this.logger);
            this.memoryDb.initialize();

            this.ready = true;
            this.logger.info('Brain Engine initialized successfully');
        } catch (error) {
            this.logger.error(`Failed to initialize Brain Engine: ${error.message}`);
            throw error;
        }
    }

    /**
     * Process an incoming TikTok event and store it in memory.
     * @param {string} eventType - e.g. 'gift', 'chat', 'follow'
     * @param {Object} data
     */
    processEvent(eventType, data) {
        if (!this.ready || !this.memoryDb) return;

        try {
            const userId   = data.userId   || data.uniqueId || 'unknown';
            const username = data.nickname || data.uniqueId || 'viewer';
            this.memoryDb.recordInteraction(this.streamerId, userId, username, eventType, data);
        } catch (error) {
            this.logger.error(`Brain Engine failed to process ${eventType}: ${error.message}`);
        }
    }

    /**
     * Get recent interactions from memory.
     * @param {number} limit
     * @returns {Array}
     */
    getMemory(limit = 50) {
        if (!this.ready || !this.memoryDb) return [];
        return this.memoryDb.getRecentInteractions(this.streamerId, limit);
    }

    destroy() {
        if (this.memoryDb) {
            this.memoryDb.close();
            this.memoryDb = null;
        }
        this.ready = false;
    }
}

module.exports = BrainEngine;
