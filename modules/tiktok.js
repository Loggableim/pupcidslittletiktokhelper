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
        this.retryDelays = {
            default: [2000, 5000, 10000],           // Standard: 2s, 5s, 10s
            signApi: [5000, 15000, 30000],          // Sign API errors: 5s, 15s, 30s (longer delays)
            network: [3000, 8000, 15000]            // Network errors: 3s, 8s, 15s
        };
        this.lastErrorType = null;

        // Auto-Reconnect-Limiter
        this.autoReconnectCount = 0;
        this.maxAutoReconnects = 5; // Max 5 automatische Reconnects
        this.autoReconnectResetTimeout = null;

        this.stats = {
            viewers: 0,
            likes: 0,
            totalCoins: 0,
            followers: 0,
            shares: 0,
            gifts: 0
        };

        // Stream duration tracking
        this.streamStartTime = null;
        this.durationInterval = null;
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
                // FIX: Disable Euler Stream fallbacks to avoid permission errors
                // Users can enable by setting TIKTOK_ENABLE_EULER_FALLBACKS=true
                disableEulerFallbacks: process.env.TIKTOK_ENABLE_EULER_FALLBACKS !== 'true',
                // FIX: Enable connectWithUniqueId to bypass captchas on low-quality IPs
                // This allows the 3rd-party service to determine Room ID without scraping
                connectWithUniqueId: process.env.TIKTOK_CONNECT_WITH_UNIQUE_ID === 'true',
                // Session-Keys Support (falls vorhanden)
                ...(options.sessionId && { sessionId: options.sessionId }),
                // Sign API Key Support (optional, for custom Euler Stream API key)
                ...(process.env.TIKTOK_SIGN_API_KEY && { signApiKey: process.env.TIKTOK_SIGN_API_KEY })
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

            // Start stream duration tracking
            // Try to get real stream start time from roomInfo if available
            if (state.roomInfo && state.roomInfo.create_time) {
                // TikTok provides create_time in seconds, convert to milliseconds
                this.streamStartTime = state.roomInfo.create_time * 1000;
            } else if (state.roomInfo && state.roomInfo.createTime) {
                // Alternative field name
                this.streamStartTime = state.roomInfo.createTime * 1000;
            } else {
                // Fallback: use current time as start time
                this.streamStartTime = Date.now();
            }

            // Start interval to broadcast duration every second
            if (this.durationInterval) {
                clearInterval(this.durationInterval);
            }
            this.durationInterval = setInterval(() => {
                this.broadcastStats();
            }, 1000); // Update every second

            // Reset Auto-Reconnect-Counter nach 5 Minuten stabiler Verbindung
            if (this.autoReconnectResetTimeout) {
                clearTimeout(this.autoReconnectResetTimeout);
            }
            this.autoReconnectResetTimeout = setTimeout(() => {
                this.autoReconnectCount = 0;
                console.log('✅ Auto-reconnect counter reset after stable connection');
            }, 5 * 60 * 1000); // 5 Minuten

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
            this.lastErrorType = errorInfo.type;

            console.error(`❌ TikTok Verbindungsfehler (${errorInfo.type}):`, errorInfo.message);
            
            // Zeige Vorschlag an, wenn vorhanden
            if (errorInfo.suggestion) {
                console.log(`💡 Tipp: ${errorInfo.suggestion}`);
            }

            // Retry-Logik bei bestimmten Fehlern
            if (errorInfo.retryable && this.retryCount < this.maxRetries) {
                // Wähle passende Verzögerung basierend auf Fehlertyp
                let delayArray = this.retryDelays.default;
                
                if (errorInfo.type.includes('SIGN_API')) {
                    delayArray = this.retryDelays.signApi;
                } else if (errorInfo.type === 'NETWORK_ERROR') {
                    delayArray = this.retryDelays.network;
                }
                
                const delay = delayArray[Math.min(this.retryCount, delayArray.length - 1)];
                this.retryCount++;

                console.log(`⏳ Wiederhole Verbindung in ${delay / 1000} Sekunden... (Versuch ${this.retryCount}/${this.maxRetries})`);

                this.broadcastStatus('retrying', {
                    attempt: this.retryCount,
                    maxRetries: this.maxRetries,
                    delay: delay,
                    error: errorInfo.message,
                    errorType: errorInfo.type
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

        // FIX: Euler Stream Permission Error - Check this first
        // Note: We check for specific error message patterns from tiktok-live-connector
        if (errorMessage.includes('Euler Stream') || 
            errorMessage.includes('lack of permission') || 
            (errorMessage.includes('www.eulerstream.com') && errorMessage.includes('fallback method'))) {
            return {
                type: 'EULER_STREAM_PERMISSION_ERROR',
                message: 'Euler Stream Fallback-Methode benötigt einen API-Schlüssel. Die Verbindung ist fehlgeschlagen, weil Euler Stream als Fallback verwendet wurde, aber keine Berechtigung vorliegt.',
                suggestion: 'Euler Stream Fallbacks sind jetzt standardmäßig deaktiviert. Falls das Problem weiterhin auftritt, starte den Server neu. Optional: Registriere dich bei https://www.eulerstream.com für einen API-Schlüssel und setze TIKTOK_SIGN_API_KEY in der .env Datei.',
                retryable: false
            };
        }

        // SIGI_STATE Fehler (Blockierung) - Höchste Priorität, da definitiv nicht retryable
        if (errorMessage.includes('SIGI_STATE') || errorMessage.includes('blocked by TikTok')) {
            return {
                type: 'BLOCKED_BY_TIKTOK',
                message: 'TikTok blockiert den Zugriff. Die HTML-Seite konnte nicht geparst werden (SIGI_STATE-Fehler).',
                suggestion: 'NICHT SOFORT ERNEUT VERSUCHEN! Warte mindestens 5-10 Minuten. Zu viele Verbindungsversuche können zu längeren Blockierungen führen. Alternativen: VPN verwenden, andere IP-Adresse nutzen oder Session-Keys konfigurieren.',
                retryable: false
            };
        }

        // Sign API Fehler (häufigster Fehler nach SIGI_STATE)
        if (errorMessage.includes('Sign Error') || errorMessage.includes('sign server')) {
            // 504 Gateway Timeout - externes Service-Problem
            if (errorMessage.includes('504') || errorMessage.includes('Gateway')) {
                return {
                    type: 'SIGN_API_GATEWAY_TIMEOUT',
                    message: 'TikTok Sign-Server antwortet nicht (504 Gateway Timeout). Der externe Sign-API-Dienst ist überlastet oder nicht erreichbar.',
                    suggestion: 'Warte 2-5 Minuten bevor du es erneut versuchst. Dies ist ein Problem mit dem externen Sign-Server, nicht mit deiner Verbindung. Falls dauerhaft: Prüfe ob tiktok-live-connector Updates verfügbar sind.',
                    retryable: true
                };
            }
            // 500 Internal Server Error
            if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
                return {
                    type: 'SIGN_API_ERROR',
                    message: 'TikTok Sign-Server meldet einen internen Fehler (500). Der externe Sign-API-Dienst hat ein Problem.',
                    suggestion: 'Warte 1-2 Minuten und versuche es erneut. Dies ist ein temporäres Problem des Sign-Servers. Falls dauerhaft: Prüfe ob tiktok-live-connector Updates verfügbar sind.',
                    retryable: true
                };
            }
            // Allgemeiner Sign-Fehler
            return {
                type: 'SIGN_API_ERROR',
                message: 'Fehler beim TikTok Sign-Server. Der externe Signatur-Dienst ist möglicherweise nicht verfügbar.',
                suggestion: 'Warte 1-2 Minuten und versuche es erneut. Falls das Problem anhält: Prüfe auf Updates der tiktok-live-connector Library.',
                retryable: true
            };
        }

        // Room ID Fehler - oft bedeutet dies, dass der Stream offline ist
        // FIX: Also check for FetchIsLiveError
        if (errorMessage.includes('Room ID') || errorMessage.includes('room id') || 
            errorMessage.includes('LIVE_NOT_FOUND') || errorMessage.includes('not live') ||
            errorMessage.includes('FetchIsLiveError') || errorMessage.includes('fetchRoomId')) {
            return {
                type: 'ROOM_NOT_FOUND',
                message: 'Stream nicht gefunden oder nicht live. TikTok konnte keine aktive LIVE-Session für diesen User finden.',
                suggestion: 'Stelle sicher, dass der Username korrekt ist und der User aktuell LIVE ist. Überprüfe dies in der TikTok App.',
                retryable: false
            };
        }

        // Timeout
        if (errorMessage.includes('Timeout') || errorMessage.includes('timeout')) {
            return {
                type: 'CONNECTION_TIMEOUT',
                message: 'Verbindungs-Timeout. Die Verbindung zu TikTok dauerte zu lange (>30 Sekunden).',
                suggestion: 'Überprüfe deine Internetverbindung und Firewall-Einstellungen. Stelle sicher, dass ausgehende Verbindungen zu TikTok nicht blockiert werden.',
                retryable: true
            };
        }

        // Network Fehler
        if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('network') || errorMessage.includes('Network')) {
            return {
                type: 'NETWORK_ERROR',
                message: 'Netzwerkfehler. Keine Verbindung zu TikTok-Servern möglich.',
                suggestion: 'Überprüfe deine Internetverbindung. Stelle sicher, dass TikTok nicht durch Firewall/Antivirus blockiert wird.',
                retryable: true
            };
        }

        // Unbekannter Fehler
        return {
            type: 'UNKNOWN_ERROR',
            message: errorMessage || errorString || 'Unbekannter Verbindungsfehler',
            suggestion: 'Bitte überprüfe die Konsolen-Logs für weitere Details. Falls das Problem anhält, melde es mit den Fehlerdetails.',
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
        this.lastErrorType = null; // Reset last error type

        // Clear duration tracking
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = null;
        }
        this.streamStartTime = null;

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

    // Hilfsfunktion zum Extrahieren von Gift-Daten aus verschiedenen Event-Strukturen
    extractGiftData(data) {
        // Gift-Daten können verschachtelt sein: data.gift.* oder direkt data.*
        const gift = data.gift || data;

        const extractedData = {
            giftName: gift.name || gift.giftName || gift.gift_name || null,
            giftId: gift.id || gift.giftId || gift.gift_id || null,
            giftPictureUrl: gift.image?.url_list?.[0] || gift.image?.url || gift.giftPictureUrl || gift.picture_url || null,
            // BUG FIX: Separate diamond_count from coins to prevent double conversion
            // Do NOT use gift.coins as fallback for diamondCount - they are different values
            diamondCount: gift.diamond_count || gift.diamondCount || gift.diamonds || 0,
            repeatCount: data.repeatCount || data.repeat_count || 1,
            giftType: data.giftType || data.gift_type || 0,
            repeatEnd: data.repeatEnd || data.repeat_end || false
        };

        // Debug-Logging wenn keine Gift-Daten gefunden wurden
        if (!extractedData.giftName && !extractedData.giftId) {
            console.warn('⚠️ Keine Gift-Daten in Event gefunden. Event-Struktur:', {
                hasGift: !!data.gift,
                hasGiftName: !!(data.giftName || data.name),
                hasGiftId: !!(data.giftId || data.id),
                hasDiamondCount: !!(data.diamondCount || data.diamond_count),
                keys: Object.keys(data).slice(0, 15) // Erste 15 Keys für Debugging
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

            // Auto-Reconnect mit Limit
            if (this.currentUsername && this.autoReconnectCount < this.maxAutoReconnects) {
                this.autoReconnectCount++;
                const delay = 5000;

                console.log(`🔄 Attempting auto-reconnect ${this.autoReconnectCount}/${this.maxAutoReconnects} in ${delay/1000}s...`);

                setTimeout(() => {
                    this.connect(this.currentUsername).catch(err => {
                        console.error(`Auto-reconnect ${this.autoReconnectCount}/${this.maxAutoReconnects} failed:`, err.message);
                    });
                }, delay);

                // Reset Counter nach 5 Minuten erfolgreicher Verbindung
                if (this.autoReconnectResetTimeout) {
                    clearTimeout(this.autoReconnectResetTimeout);
                }
            } else if (this.autoReconnectCount >= this.maxAutoReconnects) {
                console.warn(`⚠️ Max auto-reconnect attempts (${this.maxAutoReconnects}) reached. Manual reconnect required.`);
                this.broadcastStatus('max_reconnects_reached', {
                    maxReconnects: this.maxAutoReconnects,
                    message: 'Bitte manuell neu verbinden'
                });
            }
        });

        this.connection.on('error', (err) => {
            console.error('❌ Connection error:', err);
        });

        // ========== CHAT ==========
        this.connection.on('chat', (data) => {
            const userData = this.extractUserData(data);

            // DEBUG: Log raw event structure to understand teamMemberLevel
            console.log('🔍 [DEBUG] Chat event structure:', {
                hasUserIdentity: !!data.userIdentity,
                hasFansClub: !!(data.user && data.user.fansClub),
                fansClubLevel: data.user?.fansClub?.data?.level,
                isModeratorOfAnchor: data.userIdentity?.isModeratorOfAnchor,
                isSubscriberOfAnchor: data.userIdentity?.isSubscriberOfAnchor,
                availableKeys: Object.keys(data).slice(0, 20)
            });

            // Extrahiere Team-Level aus verschiedenen Quellen
            // Priority: 1. Fans Club Level, 2. Moderator = 10, 3. Subscriber = 1, 4. Default = 0
            let teamMemberLevel = 0;

            // Check if user is moderator (highest priority)
            if (data.userIdentity?.isModeratorOfAnchor) {
                teamMemberLevel = 10;  // Moderators get highest level
            }
            // Check fans club level
            else if (data.user?.fansClub?.data?.level) {
                teamMemberLevel = data.user.fansClub.data.level;
            }
            // Check if subscriber
            else if (data.userIdentity?.isSubscriberOfAnchor) {
                teamMemberLevel = 1;  // Subscribers get level 1
            }

            const eventData = {
                username: userData.username,
                nickname: userData.nickname,
                message: data.comment || data.message,
                userId: userData.userId,
                profilePictureUrl: userData.profilePictureUrl,
                teamMemberLevel: teamMemberLevel,
                isModerator: data.userIdentity?.isModeratorOfAnchor || false,
                isSubscriber: data.userIdentity?.isSubscriberOfAnchor || false,
                timestamp: new Date().toISOString()
            };

            this.handleEvent('chat', eventData);
            this.db.logEvent('chat', eventData.username, eventData);
        });

        // ========== GIFT ==========
        this.connection.on('gift', (data) => {
            // Extrahiere Gift-Daten
            const giftData = this.extractGiftData(data);

            // Wenn kein Gift-Name vorhanden, versuche aus Katalog zu laden
            if (!giftData.giftName && giftData.giftId) {
                const catalogGift = this.db.getGift(giftData.giftId);
                if (catalogGift) {
                    giftData.giftName = catalogGift.name;
                    // Wenn diamondCount nicht verfügbar, nutze Katalog-Wert
                    if (!giftData.diamondCount && catalogGift.diamond_count) {
                        giftData.diamondCount = catalogGift.diamond_count;
                    }
                }
            }

            // Robuste Coins-Berechnung: diamond_count * 2 * repeat_count
            // (≈2 Coins pro Diamond ist die Standard-Konvertierung)
            const repeatCount = giftData.repeatCount;
            const diamondCount = giftData.diamondCount;
            let coins = 0;

            if (diamondCount > 0) {
                coins = diamondCount * 2 * repeatCount;
            }

            // BUG FIX LOGGING: Verify gift calculation is correct
            console.log(`🎁 [GIFT CALC] ${giftData.giftName}: diamondCount=${diamondCount}, repeatCount=${repeatCount}, coins=${coins}`);

            // Streak-Ende prüfen
            // Streakable Gifts nur zählen wenn Streak beendet ist
            const isStreakEnd = giftData.repeatEnd;
            const isStreakable = giftData.giftType === 1; // giftType 1 = streakable

            // Nur zählen wenn:
            // - Kein streakable Gift ODER
            // - Streakable Gift UND Streak ist beendet
            if (!isStreakable || (isStreakable && isStreakEnd)) {
                this.stats.totalCoins += coins;
                this.stats.gifts++; // Increment gift counter

                const userData = this.extractUserData(data);
                const eventData = {
                    username: userData.username,
                    nickname: userData.nickname,
                    giftName: giftData.giftName,
                    giftId: giftData.giftId,
                    giftPictureUrl: giftData.giftPictureUrl,
                    repeatCount: repeatCount,
                    diamondCount: diamondCount,
                    coins: coins,
                    totalCoins: this.stats.totalCoins,
                    isStreakEnd: isStreakEnd,
                    timestamp: new Date().toISOString()
                };

                this.handleEvent('gift', eventData);
                this.db.logEvent('gift', eventData.username, eventData);
                this.broadcastStats();
            } else {
                // Streak läuft noch - nicht zählen, aber loggen für Debugging
                console.log(`🎁 Streak läuft: ${giftData.giftName || 'Unknown Gift'} x${repeatCount} (noch nicht gezählt)`);
            }
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
            // Robuste Extraktion von totalLikes aus verschiedenen Properties
            let totalLikes = null;
            const possibleTotalProps = [
                'totalLikes',
                'total_like_count',
                'totalLikeCount',
                'total',
                'total_likes'
            ];

            for (const prop of possibleTotalProps) {
                const value = data[prop];
                if (typeof value === 'number' && value >= 0) {
                    totalLikes = value;
                    break;
                }
            }

            // BUG FIX: Extract likeCount from multiple possible properties
            // TikTok API may send 'count', 'likeCount', or 'like_count'
            const likeCount = data.likeCount || data.count || data.like_count || 1;

            // BUG FIX LOGGING: Track like event data
            console.log(`💗 [LIKE EVENT] likeCount=${likeCount}, totalLikes=${totalLikes}, data.likeCount=${data.likeCount}, data.count=${data.count}, data.like_count=${data.like_count}`);

            // Wenn totalLikes gefunden wurde, verwende diesen Wert direkt
            if (totalLikes !== null) {
                this.stats.likes = totalLikes;
            } else {
                // Fallback: Inkrementiere basierend auf likeCount
                this.stats.likes += likeCount;
            }

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
        // Calculate stream duration in seconds
        const streamDuration = this.streamStartTime 
            ? Math.floor((Date.now() - this.streamStartTime) / 1000)
            : 0;

        this.io.emit('tiktok:stats', {
            ...this.stats,
            streamDuration: streamDuration
        });
    }

    resetStats() {
        this.stats = {
            viewers: 0,
            likes: 0,
            totalCoins: 0,
            followers: 0,
            shares: 0,
            gifts: 0
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
