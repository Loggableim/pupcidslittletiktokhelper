const EventEmitter = require('events');

/**
 * GhostStreamAdapter - Adapter to make GhostStream compatible with TikTok connector interface
 * Provides a unified interface that existing code can use
 */
class GhostStreamAdapter extends EventEmitter {
    constructor(ghostStreamPlugin, db) {
        super();
        this.ghostStreamPlugin = ghostStreamPlugin;
        this.db = db;
        this.currentSession = null;
        this.currentUsername = null;
        this.isConnected = false;
        
        // Stats tracking (compatible with TikTok connector)
        this.stats = {
            viewers: 0,
            likes: 0,
            totalCoins: 0,
            followers: 0,
            shares: 0,
            gifts: 0
        };
    }

    /**
     * Connect to TikTok LIVE via GhostStream
     * @param {string} username - TikTok username
     * @param {object} options - Connection options
     */
    async connect(username, options = {}) {
        if (this.isConnected) {
            await this.disconnect();
        }

        try {
            this.currentUsername = username;

            // Get GhostStream options from database
            const headlessMode = this.db.getSetting('ghoststream_headless_mode') === 'true';
            const autoRestart = this.db.getSetting('ghoststream_auto_restart') !== 'false'; // Default: true

            // Create GhostStream session
            const response = await fetch('http://localhost:3000/api/ghoststream/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountId: username,
                    username: username,
                    options: {
                        headless: headlessMode,
                        autoRestart: autoRestart
                    }
                })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to connect via GhostStream');
            }

            this.currentSession = {
                sessionId: data.sessionId,
                token: data.token,
                overlayUrl: data.overlayUrl,
                wsUrl: data.wsUrl
            };

            this.isConnected = true;

            // Emit connected event (compatible with TikTok connector)
            this.emit('connected', {
                username: username,
                sessionId: data.sessionId,
                timestamp: new Date().toISOString()
            });

            console.log(`✅ Connected to TikTok LIVE via GhostStream: @${username}`);
            
            return this.currentSession;
        } catch (error) {
            this.isConnected = false;
            console.error(`❌ GhostStream connection error:`, error);
            throw error;
        }
    }

    /**
     * Disconnect from TikTok LIVE
     */
    async disconnect() {
        if (!this.isConnected || !this.currentSession) {
            return;
        }

        try {
            await fetch('http://localhost:3000/api/ghoststream/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.currentSession.sessionId
                })
            });

            this.emit('disconnected', {
                username: this.currentUsername,
                timestamp: new Date().toISOString()
            });

            this.currentSession = null;
            this.currentUsername = null;
            this.isConnected = false;

            console.log(`🔌 Disconnected from GhostStream`);
        } catch (error) {
            console.error(`❌ Error disconnecting from GhostStream:`, error);
        }
    }

    /**
     * Check if connected
     */
    isActive() {
        return this.isConnected;
    }

    /**
     * Get current stats
     */
    getStats() {
        return this.stats;
    }

    /**
     * Get deduplication stats (stub for compatibility)
     */
    getDeduplicationStats() {
        return {
            totalEventsProcessed: 0,
            duplicatesFiltered: 0,
            cacheSize: 0
        };
    }

    /**
     * Broadcast status to Socket.IO clients
     */
    broadcastStatus(status, data) {
        // This would be handled by the plugin's WebSocket
        console.log(`GhostStream status: ${status}`, data);
    }
}

module.exports = GhostStreamAdapter;
