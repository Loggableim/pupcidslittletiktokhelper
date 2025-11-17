const { TikTokLiveConnection } = require('tiktok-live-connector');
const EventEmitter = require('events');

/**
 * TikTok Live Connector - Official Webcast API
 * 
 * This module uses EXCLUSIVELY the official TikTok-Live-Connector library
 * from https://github.com/zerodytrash/TikTok-Live-Connector
 * 
 * The library handles all connection logic internally via the Webcast API:
 * - Room ID resolution (automatic)
 * - WebSocket connection management
 * - Event handling (chat, gifts, likes, etc.)
 * - Retry logic and error handling
 * - Optional Euler Stream fallbacks
 */
class TikTokConnector extends EventEmitter {
    constructor(io, db) {
        super();
        this.io = io;
        this.db = db;
        this.connection = null;
        this.isConnected = false;
        this.currentUsername = null;

        // Auto-Reconnect configuration
        this.autoReconnectCount = 0;
        this.maxAutoReconnects = 5;
        this.autoReconnectResetTimeout = null;

        // Stats tracking
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
        
        // Connection attempt tracking for diagnostics
        this.connectionAttempts = [];
        this.maxAttempts = 10;
    }

    /**
     * Connect to TikTok Live stream using official TikTok-Live-Connector API
     * @param {string} username - TikTok username (without @)
     * @param {object} options - Connection options
     */
    async connect(username, options = {}) {
        if (this.isConnected) {
            await this.disconnect();
        }

        try {
            this.currentUsername = username;

            // Read configuration from database or environment variables
            const signApiKey = this.db.getSetting('tiktok_euler_api_key') || process.env.SIGN_API_KEY;
            const httpTimeout = parseInt(this.db.getSetting('tiktok_http_timeout')) || 20000;
            const enableEulerFallbacks = this.db.getSetting('tiktok_enable_euler_fallbacks') !== 'false'; // Default: true
            const connectWithUniqueId = this.db.getSetting('tiktok_connect_with_unique_id') === 'true'; // Default: false
            const sessionId = this.db.getSetting('tiktok_session_id') || options.sessionId;

            // Configure Sign API key globally for the library
            if (signApiKey) {
                process.env.SIGN_API_KEY = signApiKey;
                console.log('🔑 Euler API Key configured');
            }

            // Configure connection options using official API
            const connectionOptions = {
                // Process initial data to get room info and gifts
                processInitialData: true,
                
                // Enable extended gift information (images, prices, etc.)
                enableExtendedGiftInfo: true,
                
                // Enable WebSocket upgrade for better performance
                enableWebsocketUpgrade: true,
                
                // Polling interval for events (1 second)
                requestPollingIntervalMs: 1000,
                
                // Use connectWithUniqueId to bypass Room ID resolution issues
                // This delegates Room ID resolution to Euler Stream API
                connectWithUniqueId: connectWithUniqueId,
                
                // Control Euler Stream fallback usage
                // When true, disables Euler Stream fallbacks (library uses default Webcast API)
                // When false, uses Euler Stream as fallback when Webcast API fails
                disableEulerFallbacks: !enableEulerFallbacks,
                
                // Web client options (HTTP requests for HTML/API)
                webClientOptions: {
                    timeout: httpTimeout,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                },
                
                // Session ID for authenticated connection (optional)
                ...(sessionId && { sessionId })
            };

            console.log(`🔄 Verbinde mit TikTok LIVE: @${username}...`);
            console.log(`⚙️  Connection Mode: ${connectWithUniqueId ? 'Webcast API via UniqueId (Euler)' : 'Webcast API (Standard)'}, Euler Fallbacks: ${enableEulerFallbacks ? 'Enabled' : 'Disabled'}`);

            // Create connection using official API
            this.connection = new TikTokLiveConnection(username, connectionOptions);

            // Register event listeners
            this.registerEventListeners();

            // Connect with timeout
            const connectionTimeout = parseInt(this.db.getSetting('tiktok_connection_timeout')) || 60000;
            const state = await Promise.race([
                this.connection.connect(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Connection timeout after ${connectionTimeout/1000}s`)), connectionTimeout)
                )
            ]);

            this.isConnected = true;

            // Extract stream start time from room info
            this.streamStartTime = this._extractStreamStartTime(state.roomInfo);

            // Start duration tracking interval
            if (this.durationInterval) {
                clearInterval(this.durationInterval);
            }
            this.durationInterval = setInterval(() => {
                this.broadcastStats();
            }, 1000);

            // Reset auto-reconnect counter after 5 minutes of stable connection
            if (this.autoReconnectResetTimeout) {
                clearTimeout(this.autoReconnectResetTimeout);
            }
            this.autoReconnectResetTimeout = setTimeout(() => {
                this.autoReconnectCount = 0;
                console.log('✅ Auto-reconnect counter reset');
            }, 5 * 60 * 1000);

            // Broadcast success
            this.broadcastStatus('connected', {
                username,
                roomId: state.roomId,
                roomInfo: state.roomInfo
            });

            // Save last connected username
            this.db.setSetting('last_connected_username', username);

            console.log(`✅ Connected to TikTok LIVE: @${username} (Room ID: ${state.roomId})`);
            
            // Log success
            this._logConnectionAttempt(username, true, null, null);

            // Auto-update gift catalog after connection
            setTimeout(() => {
                this.updateGiftCatalog({ preferConnected: false }).catch(err => {
                    console.warn('⚠️  Gift catalog update failed:', err.message);
                });
            }, 2000);

        } catch (error) {
            this.isConnected = false;

            // Analyze and format error
            const errorInfo = this._analyzeError(error);

            console.error(`❌ Connection error:`, errorInfo.message);
            
            if (errorInfo.suggestion) {
                console.log(`💡 Suggestion:`, errorInfo.suggestion);
            }

            // Log failure
            this._logConnectionAttempt(username, false, errorInfo.type, errorInfo.message);

            // Broadcast error
            this.broadcastStatus('error', {
                error: errorInfo.message,
                type: errorInfo.type,
                suggestion: errorInfo.suggestion
            });

            throw error;
        }
    }

    /**
     * Extract stream start time from room info
     * @private
     */
    _extractStreamStartTime(roomInfo) {
        if (!roomInfo) {
            return Date.now();
        }

        // Try multiple field names (TikTok API may use different names)
        const timeFields = ['create_time', 'createTime', 'start_time', 'startTime'];
        
        for (const field of timeFields) {
            if (roomInfo[field]) {
                // Handle both seconds and milliseconds timestamps
                const timestamp = roomInfo[field] > 4000000000 
                    ? roomInfo[field] 
                    : roomInfo[field] * 1000;
                console.log(`📅 Stream start time from ${field}: ${new Date(timestamp).toISOString()}`);
                return timestamp;
            }
        }

        // Fallback to current time
        console.log(`⚠️  Stream start time not available, using current time`);
        return Date.now();
    }

    /**
     * Analyze connection error and provide user-friendly message
     * @private
     */
    _analyzeError(error) {
        const errorMessage = error.message || error.toString();

        // User not live or room not found
        if (errorMessage.includes('LIVE_NOT_FOUND') || 
            errorMessage.includes('not live') ||
            errorMessage.includes('room id') ||
            errorMessage.includes('Room ID')) {
            return {
                type: 'NOT_LIVE',
                message: 'User is not currently live or username is incorrect',
                suggestion: 'Verify the username is correct and the user is streaming on TikTok'
            };
        }

        // Network/timeout errors
        if (errorMessage.includes('timeout') || 
            errorMessage.includes('TIMEOUT') ||
            errorMessage.includes('ECONNABORTED') ||
            errorMessage.includes('ETIMEDOUT')) {
            return {
                type: 'TIMEOUT',
                message: 'Connection timeout - TikTok servers did not respond in time',
                suggestion: 'Check your internet connection. If the problem persists, TikTok servers may be slow or unavailable'
            };
        }

        // Blocking/Captcha
        if (errorMessage.includes('blocked') || 
            errorMessage.includes('captcha') ||
            errorMessage.includes('SIGI_STATE')) {
            return {
                type: 'BLOCKED',
                message: 'Connection blocked by TikTok (possible bot detection or geo-restriction)',
                suggestion: 'Try enabling "Connect with Unique ID" in settings, use a VPN, or wait before retrying'
            };
        }

        // Sign API / Euler errors
        if (errorMessage.includes('Sign') || 
            errorMessage.includes('Euler') ||
            errorMessage.includes('401') ||
            errorMessage.includes('403')) {
            return {
                type: 'SIGN_API_ERROR',
                message: 'Sign API error - API key may be invalid or expired',
                suggestion: 'Check your Euler Stream API key at https://www.eulerstream.com or disable Euler fallbacks'
            };
        }

        // Network connection errors
        if (errorMessage.includes('ECONNREFUSED') || 
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('network')) {
            return {
                type: 'NETWORK_ERROR',
                message: 'Network error - cannot reach TikTok servers',
                suggestion: 'Check your internet connection and firewall settings'
            };
        }

        // Generic error
        return {
            type: 'UNKNOWN_ERROR',
            message: errorMessage,
            suggestion: 'Check the console logs for more details. If the problem persists, report this error'
        };
    }

    /**
     * Log connection attempt for diagnostics
     * @private
     */
    _logConnectionAttempt(username, success, errorType, errorMessage) {
        const attempt = {
            timestamp: new Date().toISOString(),
            username,
            success,
            errorType,
            errorMessage
        };

        this.connectionAttempts.unshift(attempt);
        
        // Keep only last N attempts
        if (this.connectionAttempts.length > this.maxAttempts) {
            this.connectionAttempts = this.connectionAttempts.slice(0, this.maxAttempts);
        }
    }

    /**
     * Analyze old-style connection error (backward compatibility)
     * @deprecated Use _analyzeError instead
     * @private
     */
    analyzeConnectionError(error) {
        const errorMessage = error.message || '';
        const errorString = error.toString();

        // Timeout errors
        if (errorMessage.includes('ECONNABORTED') || error.code === 'ECONNABORTED' || errorMessage.includes('timeout')) {
            return {
                type: 'HTTP_TIMEOUT',
                message: 'HTTP request timeout. Connection to TikTok took too long.',
                suggestion: 'Dies passiert bei langsamen Verbindungen oder wenn TikTok langsam antwortet. Die Timeouts wurden automatisch erhöht. Falls das Problem weiterhin besteht: 1) Prüfe deine Internetverbindung, 2) Versuche es zu einer anderen Zeit, 3) Verwende einen VPN.',
                retryable: true
            };
        }

        // SIGI_STATE error or blocking detected by the library
        // This error comes from the tiktok-live-connector library when it can't access TikTok
        if (errorMessage.includes('SIGI_STATE') || errorMessage.includes('blocked by TikTok')) {
            return {
                type: 'BLOCKED_BY_TIKTOK',
                message: 'TikTok blockiert den Zugriff (Webcast API konnte keine Daten abrufen).',
                suggestion: 'NICHT SOFORT ERNEUT VERSUCHEN! Warte mindestens 5-10 Minuten. Zu viele Verbindungsversuche können zu längeren Blockierungen führen. Alternativen: VPN verwenden, andere IP-Adresse nutzen oder Session-Keys konfigurieren.',
                retryable: false
            };
        }

        // Webcast API parsing errors from the library
        // This catches errors when the library can't parse TikTok's response
        if (errorMessage.includes('extract') && errorMessage.includes('HTML') ||
            errorMessage.includes('Failed to extract the LiveRoom object') ||
            errorMessage.includes('structure changed')) {
            return {
                type: 'HTML_PARSE_ERROR',
                message: 'Webcast API Parsing fehlgeschlagen. TikTok hat möglicherweise die API-Struktur geändert.',
                suggestion: 'Dies kann verschiedene Ursachen haben: 1) TikTok hat die API-Struktur geändert (update tiktok-live-connector library), 2) Geo-Block oder Cloudflare-Schutz ist aktiv (verwende VPN).',
                retryable: true
            };
        }

        // Euler Stream fallback errors from the library
        // The tiktok-live-connector library throws these when Euler Stream is used but fails
        // Note: We check for specific error message patterns from tiktok-live-connector library
        // This is error message matching, not URL validation - the check is safe for this use case
        if (errorMessage.includes('Euler Stream') || 
            errorMessage.includes('lack of permission') || 
            errorMessage.toLowerCase().includes('failed to retrieve room id from euler')) {
            return {
                type: 'EULER_STREAM_PERMISSION_ERROR',
                message: 'Euler Stream Fallback benötigt einen API-Schlüssel. Die tiktok-live-connector library konnte nicht auf Euler Stream zugreifen.',
                suggestion: 'Registriere dich bei https://www.eulerstream.com für einen API-Schlüssel und setze TIKTOK_SIGN_API_KEY in der .env Datei, oder deaktiviere Euler Fallbacks in den Einstellungen.',
                retryable: false
            };
        }

        // Sign API Fehler (häufigster Fehler nach SIGI_STATE)
        if (errorMessage.includes('Sign Error') || errorMessage.includes('sign server')) {
            // 401 Unauthorized - Invalid or expired API key
            if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized') || 
                errorMessage.toLowerCase().includes('invalid') && errorMessage.toLowerCase().includes('api key')) {
                return {
                    type: 'SIGN_API_INVALID_KEY',
                    message: 'Ungültiger oder abgelaufener Euler Stream API-Schlüssel (401 Unauthorized).',
                    suggestion: 'Der konfigurierte API-Schlüssel ist ungültig oder abgelaufen. Lösung: 1) Registriere dich kostenlos bei https://www.eulerstream.com und hole einen neuen API-Schlüssel, 2) Trage den Schlüssel in den TikTok-Einstellungen ein, ODER 3) Deaktiviere "Euler Stream Fallbacks" in den Einstellungen um ohne API-Schlüssel zu verbinden.',
                    retryable: false  // No point retrying with an invalid key
                };
            }
            // 429 Rate Limit
            if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests') || 
                errorMessage.includes('rate limit') || errorMessage.includes('limit_label')) {
                return {
                    type: 'SIGN_API_RATE_LIMIT',
                    message: 'TikTok Sign-Server Rate Limit erreicht (429). Zu viele Verbindungsanfragen in kurzer Zeit.',
                    suggestion: 'Warte 5-10 Minuten bevor du es erneut versuchst. Der Sign-API-Dienst hat ein Limit für Anfragen pro Zeiteinheit.',
                    retryable: true
                };
            }
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
        // FIX: Also check for FetchIsLiveError and "Failed to retrieve Room ID"
        if (errorMessage.includes('Room ID') || errorMessage.includes('room id') || 
            errorMessage.includes('LIVE_NOT_FOUND') || errorMessage.includes('not live') ||
            errorMessage.includes('FetchIsLiveError') || errorMessage.includes('fetchRoomId') ||
            errorMessage.includes('Failed to retrieve Room ID')) {
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
                message: 'Verbindungs-Timeout. Die Verbindung zu TikTok dauerte zu lange.',
                suggestion: 'Überprüfe deine Internetverbindung und Firewall-Einstellungen. Stelle sicher, dass ausgehende Verbindungen zu TikTok nicht blockiert werden. Die Timeouts wurden automatisch erhöht.',
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
    
    /**
     * Run diagnostics on the connection
     */
    async runDiagnostics(username) {
        const testUsername = username || this.currentUsername || 'tiktok';
        
        return {
            timestamp: new Date().toISOString(),
            connection: {
                isConnected: this.isConnected,
                currentUsername: this.currentUsername,
                autoReconnectCount: this.autoReconnectCount,
                maxAutoReconnects: this.maxAutoReconnects
            },
            configuration: {
                httpTimeout: parseInt(this.db.getSetting('tiktok_http_timeout')) || 20000,
                connectionTimeout: parseInt(this.db.getSetting('tiktok_connection_timeout')) || 60000,
                enableEulerFallbacks: this.db.getSetting('tiktok_enable_euler_fallbacks') !== 'false',
                connectWithUniqueId: this.db.getSetting('tiktok_connect_with_unique_id') === 'true',
                signApiConfigured: !!process.env.SIGN_API_KEY
            },
            recentAttempts: this.connectionAttempts.slice(0, 5),
            stats: this.stats
        };
    }
    
    /**
     * Get connection health status
     */
    async getConnectionHealth() {
        const recentFailures = this.connectionAttempts.filter(a => !a.success).length;
        
        let status = 'healthy';
        let message = 'Connection ready';
        
        if (!this.isConnected && this.currentUsername) {
            status = 'disconnected';
            message = 'Not connected';
        } else if (recentFailures >= 3) {
            status = 'degraded';
            message = `${recentFailures} recent failures`;
        } else if (recentFailures >= 5) {
            status = 'critical';
            message = 'Repeated connection errors';
        }
        
        return {
            status,
            message,
            isConnected: this.isConnected,
            currentUsername: this.currentUsername,
            recentAttempts: this.connectionAttempts.slice(0, 5),
            autoReconnectCount: this.autoReconnectCount
        };
    }
}

module.exports = TikTokConnector;
