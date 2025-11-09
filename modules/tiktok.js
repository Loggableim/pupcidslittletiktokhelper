const { WebcastPushConnection } = require('tiktok-live-connector');
const EventEmitter = require('events');

class TikTokConnector extends EventEmitter {
    constructor(io, db) {
        super();
        this.io = io;
        this.db = db;
        this.connection = null;
        this.isConnected = false;
        this.currentUsername = null;
        this.stats = {
            viewers: 0,
            likes: 0,
            totalCoins: 0,
            followers: 0,
            shares: 0
        };
    }

    async connect(username) {
        if (this.isConnected) {
            await this.disconnect();
        }

        try {
            this.currentUsername = username;
            this.connection = new WebcastPushConnection(username, {
                processInitialData: true,
                enableExtendedGiftInfo: true,
                enableWebsocketUpgrade: true,
                requestPollingIntervalMs: 1000
            });

            // Event-Listener registrieren
            this.registerEventListeners();

            // Verbindung herstellen
            const state = await this.connection.connect();

            this.isConnected = true;
            this.broadcastStatus('connected', {
                username,
                roomId: state.roomId,
                roomInfo: state.roomInfo
            });

            console.log(`✅ Connected to TikTok LIVE: @${username}`);

        } catch (error) {
            this.isConnected = false;
            this.broadcastStatus('error', { error: error.message });
            console.error('❌ TikTok connection error:', error);
            throw error;
        }
    }

    disconnect() {
        if (this.connection) {
            this.connection.disconnect();
            this.connection = null;
        }
        this.isConnected = false;
        this.currentUsername = null;
        this.resetStats();
        this.broadcastStatus('disconnected');
        console.log('⚫ Disconnected from TikTok LIVE');
    }

    registerEventListeners() {
        if (!this.connection) return;

        // Verbindungsstatus
        this.connection.on('connected', (state) => {
            console.log('🟢 WebSocket connected');
        });

        this.connection.on('disconnected', () => {
            console.log('🔴 WebSocket disconnected');
            this.isConnected = false;
            this.broadcastStatus('disconnected');

            // Auto-Reconnect nach 5 Sekunden
            if (this.currentUsername) {
                setTimeout(() => {
                    console.log('🔄 Attempting to reconnect...');
                    this.connect(this.currentUsername).catch(err => {
                        console.error('Reconnect failed:', err);
                    });
                }, 5000);
            }
        });

        this.connection.on('error', (err) => {
            console.error('❌ Connection error:', err);
        });

        // ========== CHAT ==========
        this.connection.on('chat', (data) => {
            const eventData = {
                username: data.uniqueId,
                nickname: data.nickname,
                message: data.comment,
                userId: data.userId,
                profilePictureUrl: data.profilePictureUrl,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('chat', eventData);
            this.db.logEvent('chat', eventData.username, eventData);
        });

        // ========== GIFT ==========
        this.connection.on('gift', (data) => {
            // Nur "streak finished" Gifts zählen (sonst werden combo gifts mehrfach gezählt)
            if (data.giftType === 1 && !data.repeatEnd) {
                return; // Combo gift noch nicht beendet
            }

            const coins = data.diamondCount || 0;
            this.stats.totalCoins += coins;

            const eventData = {
                username: data.uniqueId,
                nickname: data.nickname,
                giftName: data.giftName,
                giftId: data.giftId,
                giftPictureUrl: data.giftPictureUrl,
                repeatCount: data.repeatCount,
                coins: coins,
                totalCoins: this.stats.totalCoins,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('gift', eventData);
            this.db.logEvent('gift', eventData.username, eventData);
            this.broadcastStats();
        });

        // ========== FOLLOW ==========
        this.connection.on('follow', (data) => {
            this.stats.followers++;

            const eventData = {
                username: data.uniqueId,
                nickname: data.nickname,
                userId: data.userId,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('follow', eventData);
            this.db.logEvent('follow', eventData.username, eventData);
            this.broadcastStats();
        });

        // ========== SHARE ==========
        this.connection.on('share', (data) => {
            this.stats.shares++;

            const eventData = {
                username: data.uniqueId,
                nickname: data.nickname,
                userId: data.userId,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('share', eventData);
            this.db.logEvent('share', eventData.username, eventData);
            this.broadcastStats();
        });

        // ========== LIKE ==========
        this.connection.on('like', (data) => {
            const likeCount = data.likeCount || 1;
            this.stats.likes += likeCount;

            const eventData = {
                username: data.uniqueId,
                nickname: data.nickname,
                likeCount: likeCount,
                totalLikes: this.stats.likes,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('like', eventData);
            // Likes nicht loggen (zu viele Events)
            this.broadcastStats();
        });

        // ========== VIEWER COUNT ==========
        this.connection.on('roomUser', (data) => {
            this.stats.viewers = data.viewerCount || 0;
            this.broadcastStats();
        });

        // ========== SUBSCRIBE ==========
        this.connection.on('subscribe', (data) => {
            const eventData = {
                username: data.uniqueId,
                nickname: data.nickname,
                userId: data.userId,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('subscribe', eventData);
            this.db.logEvent('subscribe', eventData.username, eventData);
        });

        // ========== STREAM END ==========
        this.connection.on('streamEnd', () => {
            console.log('📺 Stream has ended');
            this.broadcastStatus('stream_ended');
            this.disconnect();
        });
    }

    handleEvent(eventType, data) {
        // Event an Server-Module weiterleiten
        this.emit(eventType, data);

        // Event an Frontend broadcasten
        this.io.emit('tiktok:event', {
            type: eventType,
            data: data
        });
    }

    broadcastStatus(status, data = {}) {
        this.io.emit('tiktok:status', {
            status,
            username: this.currentUsername,
            ...data
        });
    }

    broadcastStats() {
        this.io.emit('tiktok:stats', this.stats);
    }

    resetStats() {
        this.stats = {
            viewers: 0,
            likes: 0,
            totalCoins: 0,
            followers: 0,
            shares: 0
        };
        this.broadcastStats();
    }

    getStats() {
        return this.stats;
    }

    isActive() {
        return this.isConnected;
    }
}

module.exports = TikTokConnector;
