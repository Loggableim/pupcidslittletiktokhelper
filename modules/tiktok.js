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
 * 
 * STREAM TIME FIX: This module now properly extracts and persists the actual
 * TikTok stream start time from roomInfo and event metadata, preventing the
 * timer from showing software start time instead of real stream duration.
 */
class TikTokConnector extends EventEmitter {
    constructor(io, db) {
        super();
        this.io = io;
        this.db = db;
        this.connection = null;
        this.isConnected = false;
        this.currentUsername = null;

        // Increase max listeners to avoid warnings when multiple plugins listen to the same events
        this.setMaxListeners(20);

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
        this._earliestEventTime = null; // Track earliest event to estimate stream start
        this._persistedStreamStart = null; // Persisted value across reconnects
        
        // Connection attempt tracking for diagnostics
        this.connectionAttempts = [];
        this.maxAttempts = 10;

        // Event deduplication tracking
        // Stores processed event hashes to prevent duplicate event handling
        this.processedEvents = new Map();
        this.maxProcessedEvents = 1000; // Keep last 1000 events
        this.eventExpirationMs = 60000; // Events expire after 60 seconds
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
            // Euler fallbacks are MANDATORY - keep enabled by default
            const enableEulerFallbacks = this.db.getSetting('tiktok_enable_euler_fallbacks') !== 'false'; // Default: true
            const connectWithUniqueId = this.db.getSetting('tiktok_connect_with_unique_id') === 'true'; // Default: false
            const sessionId = this.db.getSetting('tiktok_session_id') || options.sessionId;

            // Configure Sign API key globally for the library
            if (signApiKey) {
                process.env.SIGN_API_KEY = signApiKey;
                console.log('🔑 Euler API Key configured');
            } else {
                console.log('⚠️  No Euler API Key configured - using free tier (may have rate limits)');
            }

            // Configure connection options using official API
            const connectionOptions = {
                // Process initial data to get room info and gifts
                processInitialData: true,
                
                // Enable extended gift information (images, prices, etc.)
                enableExtendedGiftInfo: true,
                
                // DON'T fetch room info on connect - this causes additional Euler Stream calls that can timeout
                // We'll rely on the connection itself to verify the stream is live
                fetchRoomInfoOnConnect: false,
                
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
                // INCREASED TIMEOUT: TikTok servers can be slow, especially from certain regions
                webClientOptions: {
                    timeout: Math.max(httpTimeout, 30000), // At least 30 seconds for international connections
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate, br'
                    }
                },
                
                // Session ID for authenticated connection (optional)
                ...(sessionId && { sessionId })
            };

            console.log(`🔄 Verbinde mit TikTok LIVE: @${username}...`);
            console.log(`⚙️  Connection Mode: ${connectWithUniqueId ? 'Webcast API via UniqueId (Euler)' : 'Webcast API (Standard)'}, Euler Fallbacks: ${enableEulerFallbacks ? 'Enabled' : 'Disabled'}`);
            console.log(`🔧 Connection Options:`, JSON.stringify({
                processInitialData: connectionOptions.processInitialData,
                enableExtendedGiftInfo: connectionOptions.enableExtendedGiftInfo,
                fetchRoomInfoOnConnect: connectionOptions.fetchRoomInfoOnConnect,
                connectWithUniqueId: connectionOptions.connectWithUniqueId,
                disableEulerFallbacks: connectionOptions.disableEulerFallbacks,
                hasSessionId: !!sessionId,
                httpTimeout: httpTimeout
            }, null, 2));

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

            // Save roomInfo for debugging (optional - can be enabled via setting)
            const debugRoomInfo = this.db.getSetting('tiktok_debug_roominfo') === 'true';
            if (debugRoomInfo) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const debugDir = path.join(__dirname, '..', 'data', 'debug');
                    if (!fs.existsSync(debugDir)) {
                        fs.mkdirSync(debugDir, { recursive: true });
                    }
                    const debugFile = path.join(debugDir, `roomInfo_${username}_${Date.now()}.json`);
                    fs.writeFileSync(debugFile, JSON.stringify(state.roomInfo, null, 2));
                    console.log(`🐛 DEBUG: roomInfo saved to ${debugFile}`);
                } catch (err) {
                    console.warn(`⚠️  Could not save debug roomInfo:`, err.message);
                }
            }

            // Extract stream start time from room info
            // If we're reconnecting and have a persisted start time, use that instead
            if (this._persistedStreamStart && this.currentUsername === username) {
                this.streamStartTime = this._persistedStreamStart;
                console.log(`♻️  Restored persisted stream start time: ${new Date(this.streamStartTime).toISOString()}`);
            } else {
                this.streamStartTime = this._extractStreamStartTime(state.roomInfo);
                this._persistedStreamStart = this.streamStartTime; // Save for potential reconnects
            }

            // Start duration tracking interval
            if (this.durationInterval) {
                clearInterval(this.durationInterval);
            }
            this.durationInterval = setInterval(() => {
                this.broadcastStats();
            }, 1000);

            // Broadcast stream time info for debugging
            this.io.emit('tiktok:streamTimeInfo', {
                streamStartTime: this.streamStartTime,
                streamStartISO: new Date(this.streamStartTime).toISOString(),
                detectionMethod: this._streamTimeDetectionMethod || 'Unknown',
                currentDuration: Math.floor((Date.now() - this.streamStartTime) / 1000)
            });

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
            
            // Emit connected event for IFTTT engine
            this.emit('connected', {
                username,
                roomId: state.roomId,
                roomInfo: state.roomInfo,
                timestamp: new Date().toISOString()
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
     * Tries multiple field locations and formats to find the actual stream start timestamp
     * @private
     */
    _extractStreamStartTime(roomInfo) {
        if (!roomInfo) {
            console.log(`⚠️  No roomInfo available, using current time as fallback`);
            return Date.now();
        }

        // Log full roomInfo structure for debugging (only top-level keys to avoid sensitive data)
        console.log(`🔍 [DEBUG] roomInfo keys available:`, Object.keys(roomInfo).join(', '));
        
        // Log nested structure if available
        if (roomInfo.room) {
            console.log(`🔍 [DEBUG] roomInfo.room keys:`, Object.keys(roomInfo.room).join(', '));
        }
        if (roomInfo.data) {
            console.log(`🔍 [DEBUG] roomInfo.data keys:`, Object.keys(roomInfo.data).join(', '));
        }

        // Helper function to try extracting timestamp from a value
        const tryExtractTimestamp = (value, fieldPath) => {
            if (value === undefined || value === null || value === 0 || value === '0') {
                return null;
            }

            // Handle both seconds and milliseconds timestamps
            // Also handle string timestamps
            let timestamp = typeof value === 'string' ? parseInt(value, 10) : value;
            
            // Skip if not a valid number
            if (isNaN(timestamp)) {
                return null;
            }
            
            // Convert to milliseconds if in seconds (timestamps before year 2100)
            if (timestamp < 4000000000) {
                timestamp = timestamp * 1000;
            }
            
            // Validate timestamp is reasonable (not in future, not before 2020)
            const now = Date.now();
            const minTime = new Date('2020-01-01').getTime();
            
            if (timestamp > minTime && timestamp <= now) {
                console.log(`📅 ✅ Stream start time extracted from ${fieldPath}: ${new Date(timestamp).toISOString()}`);
                console.log(`   ⏱️  Stream duration at connection: ${Math.floor((now - timestamp) / 1000)}s`);
                this._streamTimeDetectionMethod = fieldPath; // Track detection method
                return timestamp;
            } else {
                console.log(`🔍 [DEBUG] Rejected timestamp from ${fieldPath}: ${timestamp} (out of valid range)`);
                return null;
            }
        };

        // Try multiple field names and locations
        // Priority order: most specific to least specific
        const fieldPaths = [
            // Top-level fields (most likely)
            { path: 'start_time', desc: 'roomInfo.start_time' },
            { path: 'startTime', desc: 'roomInfo.startTime' },
            { path: 'create_time', desc: 'roomInfo.create_time' },
            { path: 'createTime', desc: 'roomInfo.createTime' },
            { path: 'finish_time', desc: 'roomInfo.finish_time' },
            { path: 'finishTime', desc: 'roomInfo.finishTime' },
            { path: 'liveStartTime', desc: 'roomInfo.liveStartTime' },
            { path: 'live_start_time', desc: 'roomInfo.live_start_time' },
            { path: 'streamStartTime', desc: 'roomInfo.streamStartTime' },
            { path: 'stream_start_time', desc: 'roomInfo.stream_start_time' },
            
            // Nested under room object
            { obj: 'room', path: 'start_time', desc: 'roomInfo.room.start_time' },
            { obj: 'room', path: 'startTime', desc: 'roomInfo.room.startTime' },
            { obj: 'room', path: 'create_time', desc: 'roomInfo.room.create_time' },
            { obj: 'room', path: 'createTime', desc: 'roomInfo.room.createTime' },
            
            // Nested under data object
            { obj: 'data', path: 'start_time', desc: 'roomInfo.data.start_time' },
            { obj: 'data', path: 'startTime', desc: 'roomInfo.data.startTime' },
            { obj: 'data', path: 'create_time', desc: 'roomInfo.data.create_time' },
            { obj: 'data', path: 'createTime', desc: 'roomInfo.data.createTime' },
            
            // Additional possible locations
            { path: 'duration', desc: 'roomInfo.duration' }, // Some APIs provide duration since start
        ];
        
        // Try all field paths
        for (const field of fieldPaths) {
            let value;
            if (field.obj) {
                // Nested field
                value = roomInfo[field.obj] && roomInfo[field.obj][field.path];
            } else {
                // Top-level field
                value = roomInfo[field.path];
            }
            
            const timestamp = tryExtractTimestamp(value, field.desc);
            if (timestamp) {
                return timestamp;
            }
        }

        // Special case: if duration is provided, calculate start time
        if (roomInfo.duration) {
            const durationSeconds = typeof roomInfo.duration === 'string' 
                ? parseInt(roomInfo.duration, 10) 
                : roomInfo.duration;
            
            if (!isNaN(durationSeconds) && durationSeconds > 0) {
                const startTime = Date.now() - (durationSeconds * 1000);
                console.log(`📅 ✅ Stream start time calculated from duration: ${new Date(startTime).toISOString()}`);
                console.log(`   ⏱️  Stream duration: ${durationSeconds}s`);
                this._streamTimeDetectionMethod = 'Calculated from roomInfo.duration';
                return startTime;
            }
        }

        // Try nested fields that might contain timing information
        if (roomInfo.stream_url && roomInfo.stream_url.live_core_sdk_data) {
            const sdkData = roomInfo.stream_url.live_core_sdk_data;
            if (sdkData.pull_data && sdkData.pull_data.stream_data) {
                try {
                    const streamData = JSON.parse(sdkData.pull_data.stream_data);
                    console.log(`🔍 [DEBUG] Found stream_data, checking for time fields...`);
                    
                    if (streamData.data && streamData.data.origin && streamData.data.origin.main) {
                        const mainStream = streamData.data.origin.main;
                        if (mainStream.sdk_params) {
                            const params = JSON.parse(mainStream.sdk_params);
                            console.log(`🔍 [DEBUG] Stream SDK params available:`, Object.keys(params).join(', '));
                        }
                    }
                } catch (e) {
                    console.log(`🔍 [DEBUG] Could not parse stream_data:`, e.message);
                }
            }
        }

        // Check if there's an owner field with stats that might indicate start time
        if (roomInfo.owner && roomInfo.owner.stats) {
            console.log(`🔍 [DEBUG] Owner stats available:`, Object.keys(roomInfo.owner.stats).join(', '));
        }

        // Check common field
        if (roomInfo.common) {
            console.log(`🔍 [DEBUG] roomInfo.common keys:`, Object.keys(roomInfo.common).join(', '));
            const commonTimestamp = tryExtractTimestamp(
                roomInfo.common.create_time || roomInfo.common.createTime, 
                'roomInfo.common.create_time'
            );
            if (commonTimestamp) {
                return commonTimestamp;
            }
        }

        // Fallback: Try to get earliest event createTime if available
        // This would be set by the first event we receive
        if (this._earliestEventTime) {
            console.log(`📅 ⚠️  Using earliest event time as fallback: ${new Date(this._earliestEventTime).toISOString()}`);
            this._streamTimeDetectionMethod = 'Earliest Event Time (Fallback)';
            return this._earliestEventTime;
        }

        // Final fallback to current time
        console.log(`⚠️  Stream start time not found in roomInfo. Using current time as fallback.`);
        console.log(`💡 Possible reasons:`);
        console.log(`   1. Stream started before connection established`);
        console.log(`   2. TikTok API changed field names/structure`);
        console.log(`   3. Limited room data due to permissions/privacy`);
        console.log(`💡 The timer will auto-correct when first event is received (earliest event time)`);
        
        this._streamTimeDetectionMethod = 'Connection Time (No API data - will auto-correct on first event)';
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
                    message: 'Euler Stream Sign-Server Timeout (504). Der externe Sign-API-Dienst ist überlastet oder nicht erreichbar.',
                    suggestion: 'LÖSUNG: Deaktiviere "Euler Stream Fallbacks" in den Einstellungen (Dashboard → Einstellungen → TikTok → Euler Fallbacks: AUS). Die Verbindung funktioniert dann direkt über TikTok ohne den externen Dienst. Alternativ: Warte 5-10 Minuten und versuche es erneut.',
                    retryable: true
                };
            }
            // 500 Internal Server Error
            if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
                return {
                    type: 'SIGN_API_ERROR',
                    message: 'Euler Stream Sign-Server Fehler (500). Der externe Sign-API-Dienst hat ein Problem.',
                    suggestion: 'LÖSUNG: Deaktiviere "Euler Stream Fallbacks" in den Einstellungen (Dashboard → Einstellungen → TikTok → Euler Fallbacks: AUS). Die Verbindung funktioniert dann direkt über TikTok ohne den externen Dienst. Alternativ: Warte 2-5 Minuten und versuche es erneut.',
                    retryable: true
                };
            }
            // Allgemeiner Sign-Fehler
            return {
                type: 'SIGN_API_ERROR',
                message: 'Fehler beim Euler Stream Sign-Server. Der externe Signatur-Dienst ist möglicherweise nicht verfügbar.',
                suggestion: 'LÖSUNG: Deaktiviere "Euler Stream Fallbacks" in den Einstellungen (Dashboard → Einstellungen → TikTok → Euler Fallbacks: AUS). Die Verbindung funktioniert dann direkt über TikTok. Falls das Problem weiterhin besteht, extrahiere eine Session-ID über das Dashboard.',
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
        
        // Don't reset currentUsername immediately - we might reconnect to same stream
        const previousUsername = this.currentUsername;
        this.currentUsername = null;
        this.retryCount = 0; // Reset retry counter
        this.lastErrorType = null; // Reset last error type

        // Clear duration tracking interval but preserve stream start time
        // This allows reconnection to same stream without losing start time
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = null;
        }
        
        // Only clear stream start time if we're changing streams
        // Keep _persistedStreamStart for potential reconnects
        if (previousUsername) {
            console.log(`🔄 Disconnected but preserving stream start time for potential reconnection to @${previousUsername}`);
        } else {
            this.streamStartTime = null;
            this._persistedStreamStart = null;
            this._earliestEventTime = null;
        }

        // Clear event deduplication cache on disconnect
        this.processedEvents.clear();
        console.log('🧹 Event deduplication cache cleared');

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

        // Helper function to track earliest event time
        const trackEarliestEventTime = (data) => {
            // Try to extract createTime from event data
            if (data && data.createTime) {
                let timestamp = typeof data.createTime === 'string' ? parseInt(data.createTime, 10) : data.createTime;
                
                // Convert to milliseconds if needed
                if (timestamp < 4000000000) {
                    timestamp = timestamp * 1000;
                }
                
                // Update earliest time if this is earlier and reasonable
                const now = Date.now();
                const minTime = new Date('2020-01-01').getTime();
                
                if (timestamp > minTime && timestamp <= now) {
                    if (!this._earliestEventTime || timestamp < this._earliestEventTime) {
                        this._earliestEventTime = timestamp;
                        console.log(`🕐 Updated earliest event time: ${new Date(timestamp).toISOString()}`);
                        
                        // If we don't have a stream start time yet, use earliest event
                        if (!this.streamStartTime) {
                            this.streamStartTime = this._earliestEventTime;
                            this._persistedStreamStart = this.streamStartTime;
                            this._streamTimeDetectionMethod = 'First Event Timestamp';
                            console.log(`📅 Set stream start time from earliest event`);
                            
                            // Broadcast updated stream time info
                            this.io.emit('tiktok:streamTimeInfo', {
                                streamStartTime: this.streamStartTime,
                                streamStartISO: new Date(this.streamStartTime).toISOString(),
                                detectionMethod: this._streamTimeDetectionMethod,
                                currentDuration: Math.floor((Date.now() - this.streamStartTime) / 1000)
                            });
                        }
                    }
                }
            }
        };

        // Verbindungsstatus
        this.connection.on('connected', (state) => {
            console.log('🟢 WebSocket connected');
        });

        this.connection.on('disconnected', () => {
            console.log('🔴 WebSocket disconnected');
            this.isConnected = false;
            this.broadcastStatus('disconnected');
            
            // Emit disconnected event for IFTTT engine
            this.emit('disconnected', {
                username: this.currentUsername,
                timestamp: new Date().toISOString(),
                reason: 'Connection lost'
            });

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
            
            // Emit error event for IFTTT engine
            this.emit('error', {
                error: err.message || String(err),
                module: 'tiktok-connection',
                timestamp: new Date().toISOString()
            });
        });

        // ========== CHAT ==========
        this.connection.on('chat', (data) => {
            // Track earliest event time
            trackEarliestEventTime(data);
            
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
            // DEBUG: Log raw gift event structure for analysis
            console.log(`🔍 [RAW GIFT EVENT]`, {
                hasGift: !!data.gift,
                hasRepeatCount: data.repeatCount !== undefined,
                hasRepeatEnd: data.repeatEnd !== undefined,
                hasDiamondCount: data.diamondCount !== undefined || (data.gift && data.gift.diamond_count !== undefined),
                giftType: data.giftType,
                rawRepeatCount: data.repeatCount,
                rawRepeatEnd: data.repeatEnd,
                rawDiamondCount: data.diamondCount,
                giftObjectDiamondCount: data.gift?.diamond_count,
                topLevelKeys: Object.keys(data).slice(0, 20)
            });

            // Track earliest event time
            trackEarliestEventTime(data);
            
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
            console.log(`🎁 [GIFT CALC] ${giftData.giftName}: diamondCount=${diamondCount}, repeatCount=${repeatCount}, coins=${coins}, giftType=${giftData.giftType}, repeatEnd=${giftData.repeatEnd}`);

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
                    uniqueId: userData.username, // Add uniqueId for compatibility
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
                    giftType: giftData.giftType, // Add giftType for debugging
                    timestamp: new Date().toISOString()
                };

                console.log(`✅ [GIFT COUNTED] Total coins now: ${this.stats.totalCoins}`);

                this.handleEvent('gift', eventData);
                this.db.logEvent('gift', eventData.username, eventData);
                this.broadcastStats();
            } else {
                // Streak läuft noch - nicht zählen, aber loggen für Debugging
                console.log(`⏳ [STREAK RUNNING] ${giftData.giftName || 'Unknown Gift'} x${repeatCount} (${coins} coins, not counted yet)`);
            }
        });

        // ========== FOLLOW ==========
        this.connection.on('follow', (data) => {
            trackEarliestEventTime(data);
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
            trackEarliestEventTime(data);
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
            trackEarliestEventTime(data);
            
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
            trackEarliestEventTime(data);
            this.stats.viewers = data.viewerCount || 0;
            this.broadcastStats();
            
            // Emit viewerChange event for IFTTT engine
            this.emit('viewerChange', {
                viewerCount: data.viewerCount || 0,
                timestamp: new Date().toISOString()
            });
        });

        // ========== SUBSCRIBE ==========
        this.connection.on('subscribe', (data) => {
            trackEarliestEventTime(data);
            
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

    /**
     * Generate unique event hash for deduplication
     * @param {string} eventType - Type of event (chat, gift, follow, etc.)
     * @param {object} data - Event data
     * @returns {string} Event hash
     */
    _generateEventHash(eventType, data) {
        // Create hash based on event type, user, and content
        const components = [eventType];
        
        // Add user identifier
        if (data.userId) components.push(data.userId);
        if (data.uniqueId) components.push(data.uniqueId);
        if (data.username) components.push(data.username);
        
        // Add content-specific identifiers
        switch (eventType) {
            case 'chat':
                // For chat: use message + timestamp (rounded to second to catch rapid duplicates)
                if (data.message) components.push(data.message);
                if (data.comment) components.push(data.comment);
                if (data.timestamp) {
                    // Round to nearest second to catch duplicates within same second
                    const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
                    components.push(roundedTime.toString());
                }
                break;
            case 'gift':
                // For gifts: use giftId + repeatCount + timestamp
                if (data.giftId) components.push(data.giftId.toString());
                if (data.giftName) components.push(data.giftName);
                if (data.repeatCount) components.push(data.repeatCount.toString());
                break;
            case 'follow':
            case 'share':
            case 'subscribe':
                // For follow/share/subscribe: use timestamp (rounded to second)
                if (data.timestamp) {
                    const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
                    components.push(roundedTime.toString());
                }
                break;
        }
        
        // Create simple hash from components
        return components.join('|');
    }

    /**
     * Check if event has already been processed (deduplication)
     * @param {string} eventType - Type of event
     * @param {object} data - Event data
     * @returns {boolean} true if event is duplicate, false if new
     */
    _isDuplicateEvent(eventType, data) {
        const eventHash = this._generateEventHash(eventType, data);
        const now = Date.now();
        
        // Clean up expired events
        for (const [hash, timestamp] of this.processedEvents.entries()) {
            if (now - timestamp > this.eventExpirationMs) {
                this.processedEvents.delete(hash);
            }
        }
        
        // Check if event already processed
        if (this.processedEvents.has(eventHash)) {
            console.log(`🔄 [DUPLICATE BLOCKED] ${eventType} event already processed: ${eventHash}`);
            return true;
        }
        
        // Mark event as processed
        this.processedEvents.set(eventHash, now);
        
        // Limit cache size (LRU - remove oldest if too many)
        if (this.processedEvents.size > this.maxProcessedEvents) {
            const firstKey = this.processedEvents.keys().next().value;
            this.processedEvents.delete(firstKey);
        }
        
        return false;
    }

    handleEvent(eventType, data) {
        // Check for duplicate events
        if (this._isDuplicateEvent(eventType, data)) {
            // Duplicate event detected - do not process
            console.log(`⚠️  Duplicate ${eventType} event ignored`);
            return;
        }

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
        return {
            ...this.stats,
            deduplicationCacheSize: this.processedEvents.size
        };
    }

    /**
     * Get deduplication statistics
     * @returns {object} Deduplication stats
     */
    getDeduplicationStats() {
        return {
            cacheSize: this.processedEvents.size,
            maxCacheSize: this.maxProcessedEvents,
            expirationMs: this.eventExpirationMs
        };
    }

    /**
     * Clear deduplication cache (for debugging/testing)
     */
    clearDeduplicationCache() {
        this.processedEvents.clear();
        console.log('🧹 Event deduplication cache manually cleared');
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
                enableEulerFallbacks: this.db.getSetting('tiktok_enable_euler_fallbacks') !== 'false', // Default: true (mandatory)
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
