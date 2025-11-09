const { TikTokLiveConnection } = require('tiktok-live-connector');
const EventEmitter = require('events');

class TikTokConnector extends EventEmitter {
    constructor(io, db) {
        super();
        this.io = io;
        this.db = db;
        this.connection = null;
        this.isConnected = false;
        this.currentUsername = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.retryDelays = [2000, 5000, 10000]; // Exponential backoff: 2s, 5s, 10s
        this.stats = {
            viewers: 0,
            likes: 0,
            totalCoins: 0,
            followers: 0,
            shares: 0
        };
    }

    async connect(username, options = {}) {
        if (this.isConnected) {
            await this.disconnect();
        }

        // Reset retry counter bei neuem Verbindungsversuch
        if (!options.isRetry) {
            this.retryCount = 0;
        }

        try {
            this.currentUsername = username;

            // Erweiterte Verbindungsoptionen
            const connectionOptions = {
                processInitialData: true,
                enableExtendedGiftInfo: true,
                enableWebsocketUpgrade: true,
                requestPollingIntervalMs: 1000,
                // Session-Keys Support (falls vorhanden)
                ...(options.sessionId && { sessionId: options.sessionId })
            };

            console.log(`🔄 Verbinde mit TikTok LIVE: @${username}${this.retryCount > 0 ? ` (Versuch ${this.retryCount + 1}/${this.maxRetries + 1})` : ''}...`);

            this.connection = new TikTokLiveConnection(username, connectionOptions);

            // Event-Listener registrieren
            this.registerEventListeners();

            // Verbindung herstellen mit Timeout
            const state = await Promise.race([
                this.connection.connect(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Verbindungs-Timeout nach 30 Sekunden')), 30000)
                )
            ]);

            this.isConnected = true;
            this.retryCount = 0; // Reset bei erfolgreicher Verbindung

            this.broadcastStatus('connected', {
                username,
                roomId: state.roomId,
                roomInfo: state.roomInfo
            });

            // Speichere letzten verbundenen Username für automatisches Gift-Katalog-Update beim Neustart
            this.db.setSetting('last_connected_username', username);

            console.log(`✅ Connected to TikTok LIVE: @${username}`);

            // Gift-Katalog automatisch aktualisieren (ohne preferConnected, da bereits verbunden)
            setTimeout(() => {
                this.updateGiftCatalog({ preferConnected: false }).catch(err => {
                    console.warn('⚠️ Automatisches Gift-Katalog-Update fehlgeschlagen:', err.message);
                });
            }, 2000);

        } catch (error) {
            this.isConnected = false;

            // Detaillierte Fehleranalyse
            const errorInfo = this.analyzeConnectionError(error);

            console.error(`❌ TikTok Verbindungsfehler (${errorInfo.type}):`, errorInfo.message);

            // Retry-Logik bei bestimmten Fehlern
            if (errorInfo.retryable && this.retryCount < this.maxRetries) {
                const delay = this.retryDelays[this.retryCount];
                this.retryCount++;

                console.log(`⏳ Wiederhole Verbindung in ${delay / 1000} Sekunden...`);

                this.broadcastStatus('retrying', {
                    attempt: this.retryCount,
                    maxRetries: this.maxRetries,
                    delay: delay,
                    error: errorInfo.message
                });

                // Warte und versuche erneut
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.connect(username, { ...options, isRetry: true });
            }

            // Broadcast detaillierter Fehler
            this.broadcastStatus('error', {
                error: errorInfo.message,
                type: errorInfo.type,
                suggestion: errorInfo.suggestion,
                retryable: errorInfo.retryable
            });

            throw new Error(errorInfo.message);
        }
    }

    analyzeConnectionError(error) {
        const errorMessage = error.message || '';
        const errorString = error.toString();

        // Sign API Fehler (häufigster Fehler)
        if (errorMessage.includes('Sign Error') || errorMessage.includes('sign server')) {
            if (errorMessage.includes('504') || errorMessage.includes('Gateway')) {
                return {
                    type: 'SIGN_API_GATEWAY_TIMEOUT',
                    message: 'TikTok Sign-Server antwortet nicht (Gateway Timeout). Dies kann an überlasteten Servern oder TikTok-Blockierungen liegen.',
                    suggestion: 'Bitte versuche es in einigen Minuten erneut. Falls das Problem weiterhin besteht, könnte TikTok temporär den Zugriff blockieren.',
                    retryable: true
                };
            }
            return {
                type: 'SIGN_API_ERROR',
                message: 'Fehler beim TikTok Sign-Server. Der externe Dienst ist möglicherweise nicht verfügbar.',
                suggestion: 'Versuche es später erneut oder verwende Session-Keys falls verfügbar.',
                retryable: true
            };
        }

        // SIGI_STATE Fehler (Blockierung)
        if (errorMessage.includes('SIGI_STATE') || errorMessage.includes('blocked by TikTok')) {
            return {
                type: 'BLOCKED_BY_TIKTOK',
                message: 'TikTok blockiert den Zugriff. Möglicherweise hat TikTok deine IP temporär blockiert.',
                suggestion: 'Warte einige Minuten und versuche es erneut. Bei wiederholten Problemen: VPN verwenden oder Session-Keys nutzen.',
                retryable: false
            };
        }

        // Room ID Fehler
        if (errorMessage.includes('Room ID') || errorMessage.includes('LIVE')) {
            return {
                type: 'ROOM_NOT_FOUND',
                message: 'Stream nicht gefunden. Der Stream ist möglicherweise nicht live oder der Username ist falsch.',
                suggestion: 'Überprüfe den Username und stelle sicher, dass der Stream live ist.',
                retryable: false
            };
        }

        // Timeout
        if (errorMessage.includes('Timeout') || errorMessage.includes('timeout')) {
            return {
                type: 'CONNECTION_TIMEOUT',
                message: 'Verbindungs-Timeout. Die Verbindung zu TikTok dauerte zu lange.',
                suggestion: 'Überprüfe deine Internetverbindung und versuche es erneut.',
                retryable: true
            };
        }

        // Network Fehler
        if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('network') || errorMessage.includes('Network')) {
            return {
                type: 'NETWORK_ERROR',
                message: 'Netzwerkfehler. Keine Verbindung zu TikTok möglich.',
                suggestion: 'Überprüfe deine Internetverbindung.',
                retryable: true
            };
        }

        // Unbekannter Fehler
        return {
            type: 'UNKNOWN_ERROR',
            message: errorMessage || errorString || 'Unbekannter Verbindungsfehler',
            suggestion: 'Bitte überprüfe die Logs für weitere Details.',
            retryable: true
        };
    }

    disconnect() {
        if (this.connection) {
            this.connection.disconnect();
            this.connection = null;
        }
        this.isConnected = false;
        this.currentUsername = null;
        this.retryCount = 0; // Reset retry counter
        this.resetStats();
        this.broadcastStatus('disconnected');
        console.log('⚫ Disconnected from TikTok LIVE');
    }

    // Hilfsfunktion zum Extrahieren von Benutzerdaten aus verschiedenen Event-Strukturen
    extractUserData(data) {
        // Unterstütze verschiedene Datenstrukturen:
        // 1. Direkt im Event: data.uniqueId, data.nickname
        // 2. Verschachtelt: data.user.uniqueId, data.user.nickname
        const user = data.user || data;

        const extractedData = {
            username: user.uniqueId || user.username || null,
            nickname: user.nickname || user.displayName || null,
            userId: user.userId || user.id || null,
            profilePictureUrl: user.profilePictureUrl || user.profilePicture || null
        };

        // Debug-Logging wenn keine Benutzerdaten gefunden wurden
        if (!extractedData.username && !extractedData.nickname) {
            console.warn('⚠️ Keine Benutzerdaten in Event gefunden. Event-Struktur:', {
                hasUser: !!data.user,
                hasUniqueId: !!data.uniqueId,
                hasUsername: !!data.username,
                hasNickname: !!data.nickname,
                keys: Object.keys(data).slice(0, 10) // Erste 10 Keys für Debugging
            });
        }

        return extractedData;
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
            const userData = this.extractUserData(data);
            const eventData = {
                username: userData.username,
                nickname: userData.nickname,
                message: data.comment || data.message,
                userId: userData.userId,
                profilePictureUrl: userData.profilePictureUrl,
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

            const userData = this.extractUserData(data);
            const eventData = {
                username: userData.username,
                nickname: userData.nickname,
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

            const userData = this.extractUserData(data);
            const eventData = {
                username: userData.username,
                nickname: userData.nickname,
                userId: userData.userId,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('follow', eventData);
            this.db.logEvent('follow', eventData.username, eventData);
            this.broadcastStats();
        });

        // ========== SHARE ==========
        this.connection.on('share', (data) => {
            this.stats.shares++;

            const userData = this.extractUserData(data);
            const eventData = {
                username: userData.username,
                nickname: userData.nickname,
                userId: userData.userId,
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

            const userData = this.extractUserData(data);
            const eventData = {
                username: userData.username,
                nickname: userData.nickname,
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
            const userData = this.extractUserData(data);
            const eventData = {
                username: userData.username,
                nickname: userData.nickname,
                userId: userData.userId,
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

    async updateGiftCatalog(options = {}) {
        const { preferConnected = false, username = null } = options;

        let clientToUse = null;
        let tempClient = null;

        try {
            // Verwende bestehende Verbindung falls vorhanden
            if (this.connection && this.isConnected) {
                clientToUse = this.connection;
            }
            // Oder erstelle temporären Client wenn preferConnected aktiviert ist
            else if (preferConnected) {
                const targetUsername = username || this.currentUsername;

                if (!targetUsername) {
                    console.warn('⚠️ Kein TikTok-Username verfügbar für Gift-Katalog-Update');
                    return { ok: false, message: 'Kein Username konfiguriert', count: 0 };
                }

                console.log(`🔄 Erstelle temporären Client für Gift-Update (@${targetUsername})...`);

                tempClient = new TikTokLiveConnection(targetUsername, {
                    processInitialData: true,
                    enableExtendedGiftInfo: true,
                    enableWebsocketUpgrade: false,
                    requestPollingIntervalMs: 1000
                });

                // Verbinde temporären Client
                await tempClient.connect();

                // Warte kurz damit Gift-Daten geladen werden
                await new Promise(resolve => setTimeout(resolve, 2000));

                clientToUse = tempClient;
            }
            else {
                throw new Error('Nicht verbunden. Bitte zuerst mit einem Stream verbinden.');
            }

            // Hole Gift-Daten vom Client
            const gifts = clientToUse.availableGifts || {};

            if (!gifts || Object.keys(gifts).length === 0) {
                console.warn('⚠️ Keine Gift-Informationen verfügbar. Stream evtl. nicht live.');
                return { ok: false, message: 'Keine Gift-Daten verfügbar', count: 0 };
            }

            // Gifts in Array mit benötigten Feldern umwandeln
            const giftsArray = Object.values(gifts).map(gift => ({
                id: gift.id,
                name: gift.name || `Gift ${gift.id}`,
                image_url: gift.image?.url_list?.[0] || gift.image?.url || gift.image?.imageUrl || null,
                diamond_count: gift.diamond_count || gift.diamondCount || 0
            }));

            // Duplikate entfernen (nach ID)
            const uniqueGifts = Array.from(
                new Map(giftsArray.map(g => [g.id, g])).values()
            );

            // Prüfe ob Update nötig ist (vergleiche mit aktuellen Daten)
            const currentCatalog = this.db.getGiftCatalog();
            const needsUpdate = uniqueGifts.length !== currentCatalog.length ||
                uniqueGifts.some((g, i) => {
                    const existing = currentCatalog.find(c => c.id === g.id);
                    return !existing ||
                           existing.name !== g.name ||
                           existing.image_url !== g.image_url ||
                           existing.diamond_count !== g.diamond_count;
                });

            // In Datenbank speichern (immer, um sicherzustellen dass die Struktur korrekt ist)
            const count = this.db.updateGiftCatalog(uniqueGifts);

            if (needsUpdate || uniqueGifts.length > currentCatalog.length) {
                console.log(`✅ Gift-Katalog aktualisiert: ${count} Einträge (${uniqueGifts.length - currentCatalog.length} neue)`);
            } else {
                console.log(`✅ Gift-Katalog synchronisiert: ${count} Einträge`);
            }

            // Broadcast an Frontend
            this.io.emit('gift_catalog:updated', {
                count,
                timestamp: new Date().toISOString()
            });

            return { ok: true, count, message: `${count} Gifts geladen`, updated: needsUpdate };

        } catch (error) {
            console.error('❌ Fehler beim Gift-Katalog-Update:', error);
            return { ok: false, error: error.message, count: 0 };
        } finally {
            // Temporären Client immer disconnecten
            if (tempClient) {
                try {
                    tempClient.disconnect();
                    console.log('✅ Temporärer Client getrennt');
                } catch (err) {
                    console.warn('⚠️ Fehler beim Trennen des temporären Clients:', err.message);
                }
            }
        }
    }

    getGiftCatalog() {
        return this.db.getGiftCatalog();
    }
}

module.exports = TikTokConnector;
