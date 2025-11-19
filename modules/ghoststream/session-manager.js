const EventEmitter = require('events');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * SessionManager - Manages GhostStream sessions
 * Handles session lifecycle, authentication, and cleanup
 */
class SessionManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.sessions = new Map();
        this.jwtSecret = options.jwtSecret || crypto.randomBytes(32).toString('hex');
        this.sessionTimeout = options.sessionTimeout || 3600000; // 1 hour default
        this.maxSessions = options.maxSessions || 5;
        this.cleanupInterval = null;
        
        // Start cleanup timer
        this.startCleanupTimer();
    }

    /**
     * Create a new session
     */
    createSession(accountId, options = {}) {
        // Check max sessions limit
        if (this.sessions.size >= this.maxSessions) {
            throw new Error(`Maximum number of sessions (${this.maxSessions}) reached`);
        }

        const sessionId = this.generateSessionId();
        const token = this.generateToken(sessionId, accountId);
        
        const session = {
            sessionId,
            accountId,
            token,
            username: options.username,
            cookies: options.cookies,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            status: 'created',
            browserController: null,
            options: {
                headless: options.headless !== undefined ? options.headless : false,
                autoRestart: options.autoRestart !== undefined ? options.autoRestart : true,
                ...options
            }
        };

        this.sessions.set(sessionId, session);
        this.emit('session:created', { sessionId, accountId });

        console.log(`✅ Session created: ${sessionId} for account ${accountId}`);
        
        return session;
    }

    /**
     * Get session by ID
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    /**
     * Get all sessions
     */
    getAllSessions() {
        return Array.from(this.sessions.values());
    }

    /**
     * Update session activity
     */
    updateActivity(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivity = Date.now();
        }
    }

    /**
     * Update session status
     */
    updateStatus(sessionId, status) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.status = status;
            this.emit('session:status', { sessionId, status });
        }
    }

    /**
     * Attach browser controller to session
     */
    attachBrowserController(sessionId, browserController) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.browserController = browserController;
        }
    }

    /**
     * Delete session
     */
    async deleteSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }

        // Stop browser controller if running
        if (session.browserController) {
            try {
                await session.browserController.stop();
            } catch (error) {
                console.error(`Error stopping browser for session ${sessionId}:`, error);
            }
        }

        this.sessions.delete(sessionId);
        this.emit('session:deleted', { sessionId });

        console.log(`✅ Session deleted: ${sessionId}`);
        
        return true;
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return `gs_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    /**
     * Generate JWT token for session
     */
    generateToken(sessionId, accountId) {
        return jwt.sign(
            { 
                sessionId, 
                accountId,
                type: 'ghoststream'
            },
            this.jwtSecret,
            { expiresIn: '24h' }
        );
    }

    /**
     * Verify JWT token
     */
    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.jwtSecret);
            return decoded;
        } catch (error) {
            return null;
        }
    }

    /**
     * Cleanup expired sessions
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        const expiredSessions = [];

        for (const [sessionId, session] of this.sessions.entries()) {
            const age = now - session.lastActivity;
            if (age > this.sessionTimeout) {
                expiredSessions.push(sessionId);
            }
        }

        for (const sessionId of expiredSessions) {
            console.log(`🧹 Cleaning up expired session: ${sessionId}`);
            this.deleteSession(sessionId);
        }

        if (expiredSessions.length > 0) {
            this.emit('sessions:cleaned', { count: expiredSessions.length });
        }
    }

    /**
     * Start automatic cleanup timer
     */
    startCleanupTimer() {
        // Run cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions();
        }, 5 * 60 * 1000);
    }

    /**
     * Stop cleanup timer
     */
    stopCleanupTimer() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Shutdown all sessions
     */
    async shutdown() {
        console.log('🛑 Shutting down all GhostStream sessions...');
        
        this.stopCleanupTimer();

        const sessionIds = Array.from(this.sessions.keys());
        for (const sessionId of sessionIds) {
            await this.deleteSession(sessionId);
        }

        console.log('✅ All sessions shut down');
    }
}

module.exports = SessionManager;
