const { WebcastEventEmitter, createWebSocketUrl, ClientCloseCode } = require('@eulerstream/euler-websocket-sdk');
const EventEmitter = require('events');
const WebSocket = require('ws');

/**
 * TikTok Live Connector - Eulerstream WebSocket API
 * 
 * This module uses EXCLUSIVELY the Eulerstream WebSocket SDK
 * from https://www.eulerstream.com/docs
 * 
 * The module handles all connection logic via Eulerstream's WebSocket API:
 * - Room ID resolution (automatic via Eulerstream)
 * - WebSocket connection management
 * - Event handling (chat, gifts, likes, etc.)
 * - Retry logic and error handling
 * 
 * STREAM TIME FIX: This module properly extracts and persists the actual
 * TikTok stream start time from event metadata, preventing the
 * timer from showing software start time instead of real stream duration.
 */
class TikTokConnector extends EventEmitter {
    constructor(io, db, logger = console) {
        super();
        this.io = io;
        this.db = db;
        this.logger = logger;
        this.ws = null;
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
        this.processedEvents = new Map();
        this.maxProcessedEvents = 1000;
        this.eventExpirationMs = 60000;

        // Eulerstream WebSocket event emitter
        this.eventEmitter = null;
    }

    /**
     * Connect to TikTok Live stream using Eulerstream WebSocket API
     * @param {string} username - TikTok username (without @)
     * @param {object} options - Connection options
     */
    async connect(username, options = {}) {
        if (this.isConnected) {
            await this.disconnect();
        }

        try {
            this.currentUsername = username;

            // Read Eulerstream API key from configuration
            // Priority: Database setting > Environment variables
            const apiKey = this.db.getSetting('tiktok_euler_api_key') || process.env.EULER_API_KEY || process.env.SIGN_API_KEY;
            
            if (!apiKey) {
                const errorMsg = 'Eulerstream API key is required. Please configure it in one of the following ways:\n' +
                    '1. Dashboard Settings: Set "tiktok_euler_api_key" in the settings\n' +
                    '2. Environment Variable: Set EULER_API_KEY=your_key\n' +
                    '3. Environment Variable: Set SIGN_API_KEY=your_key\n' +
                    'Get your API key from: https://www.eulerstream.com';
                this.logger.error('❌ ' + errorMsg);
                throw new Error(errorMsg);
            }
            
            // Validate API key format (basic check)
            if (typeof apiKey !== 'string' || apiKey.trim().length < 32) {
                const errorMsg = 'Invalid Eulerstream API key format. The key should be a long alphanumeric string (64+ characters).';
                this.logger.error('❌ ' + errorMsg);
                throw new Error(errorMsg);
            }

            this.logger.info(`🔄 Verbinde mit TikTok LIVE: @${username}...`);
            this.logger.info(`⚙️  Connection Mode: Eulerstream WebSocket API`);
            this.logger.info(`🔑 Eulerstream API Key configured (${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)})`);

            // Create WebSocket URL using Eulerstream SDK
            // Configure features for optimal connection reliability
            const wsUrl = createWebSocketUrl({
                uniqueId: username,
                apiKey: apiKey,
                features: {
                    useEnterpriseApi: true  // Use Enterprise API infrastructure (recommended for better reliability)
                }
            });

            this.logger.info(`🔧 Connecting to Eulerstream WebSocket...`);

            // Create WebSocket connection
            this.ws = new WebSocket(wsUrl);

            // Create event emitter for processing messages
            this.eventEmitter = new WebcastEventEmitter(this.ws);

            // Setup WebSocket event handlers
            await this._setupWebSocketHandlers();

            // Wait for connection to open
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout after 60s'));
                }, 60000);

                this.ws.once('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.ws.once('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });

            this.isConnected = true;

            // Initialize stream start time
            if (this._persistedStreamStart && this.currentUsername === username) {
                this.streamStartTime = this._persistedStreamStart;
                this.logger.info(`♻️  Restored persisted stream start time: ${new Date(this.streamStartTime).toISOString()}`);
            } else {
                this.streamStartTime = Date.now();
                this._persistedStreamStart = this.streamStartTime;
                this._streamTimeDetectionMethod = 'Connection Time (will auto-correct on first event)';
            }

            // Start duration tracking interval
            if (this.durationInterval) {
                clearInterval(this.durationInterval);
            }
            this.durationInterval = setInterval(() => {
                this.broadcastStats();
            }, 1000);

            // Broadcast stream time info
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
                this.logger.info('✅ Auto-reconnect counter reset');
            }, 5 * 60 * 1000);

            // Broadcast success
            this.broadcastStatus('connected', {
                username,
                method: 'Eulerstream WebSocket'
            });
            
            // Emit connected event for IFTTT engine
            this.emit('connected', {
                username,
                timestamp: new Date().toISOString()
            });

            // Save last connected username
            this.db.setSetting('last_connected_username', username);

            this.logger.info(`✅ Connected to TikTok LIVE: @${username} via Eulerstream`);
            
            // Log success
            this._logConnectionAttempt(username, true, null, null);

        } catch (error) {
            this.isConnected = false;

            // Analyze and format error
            const errorInfo = this._analyzeError(error);

            this.logger.error(`❌ Connection error:`, errorInfo.message);
            
            if (errorInfo.suggestion) {
                this.logger.info(`💡 Suggestion:`, errorInfo.suggestion);
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
     * Setup WebSocket event handlers
     * @private
     */
    async _setupWebSocketHandlers() {
        if (!this.ws || !this.eventEmitter) return;

        // WebSocket connection events
        this.ws.on('open', () => {
            this.logger.info('🟢 Eulerstream WebSocket connected');
        });

        this.ws.on('close', (code, reason) => {
            const reasonText = Buffer.isBuffer(reason) ? reason.toString('utf-8') : (reason || '');
            this.logger.info(`🔴 Eulerstream WebSocket disconnected: ${code} - ${ClientCloseCode[code] || reasonText}`);
            
            // Special handling for authentication errors
            if (code === 4401) {
                this.logger.error('❌ Authentication Error: The provided Eulerstream API key is invalid.');
                this.logger.error('💡 Please check your API key configuration:');
                this.logger.error('   1. Verify the API key in Dashboard Settings (tiktok_euler_api_key)');
                this.logger.error('   2. Or check environment variable EULER_API_KEY');
                this.logger.error('   3. Get a valid key from: https://www.eulerstream.com');
                this.logger.error(`   4. Key format should be a long alphanumeric string (64+ characters)`);
                if (reasonText) {
                    this.logger.error(`   Server message: ${reasonText}`);
                }
            } else if (code === 4400) {
                this.logger.error('❌ Invalid Options: The connection parameters are incorrect.');
                this.logger.error('💡 Please check the username and API key are correct.');
            } else if (code === 4404) {
                this.logger.warn('⚠️  User Not Live: The requested TikTok user is not currently streaming.');
            }
            
            this.isConnected = false;
            this.broadcastStatus('disconnected');
            
            // Emit disconnected event for IFTTT engine
            this.emit('disconnected', {
                username: this.currentUsername,
                timestamp: new Date().toISOString(),
                reason: reasonText || ClientCloseCode[code] || 'Connection closed',
                code: code
            });

            // Don't auto-reconnect on authentication errors
            if (code === 4401 || code === 4400) {
                this.logger.warn('⚠️  Auto-reconnect disabled due to authentication/configuration error. Please fix the issue and manually reconnect.');
                this.broadcastStatus('auth_error', {
                    code: code,
                    message: 'Authentication failed - manual reconnect required',
                    suggestion: 'Please check your Eulerstream API key configuration'
                });
                return;
            }
            
            // Auto-Reconnect with limit (for non-auth errors)
            if (this.currentUsername && this.autoReconnectCount < this.maxAutoReconnects) {
                this.autoReconnectCount++;
                const delay = 5000;

                this.logger.info(`🔄 Attempting auto-reconnect ${this.autoReconnectCount}/${this.maxAutoReconnects} in ${delay/1000}s...`);

                setTimeout(() => {
                    this.connect(this.currentUsername).catch(err => {
                        this.logger.error(`Auto-reconnect ${this.autoReconnectCount}/${this.maxAutoReconnects} failed:`, err.message);
                    });
                }, delay);

                // Reset Counter after 5 minutes successful connection
                if (this.autoReconnectResetTimeout) {
                    clearTimeout(this.autoReconnectResetTimeout);
                }
            } else if (this.autoReconnectCount >= this.maxAutoReconnects) {
                this.logger.warn(`⚠️ Max auto-reconnect attempts (${this.maxAutoReconnects}) reached. Manual reconnect required.`);
                this.broadcastStatus('max_reconnects_reached', {
                    maxReconnects: this.maxAutoReconnects,
                    message: 'Bitte manuell neu verbinden'
                });
            }
        });

        this.ws.on('error', (err) => {
            this.logger.error('❌ WebSocket error:', err);
            
            // Emit error event for IFTTT engine
            this.emit('error', {
                error: err.message || String(err),
                module: 'eulerstream-websocket',
                timestamp: new Date().toISOString()
            });
        });

        // Setup Eulerstream event handlers
        this._registerEulerstreamEvents();
    }

    /**
     * Register Eulerstream event listeners
     * @private
     */
    _registerEulerstreamEvents() {
        if (!this.eventEmitter) return;

        // Helper function to track earliest event time
        const trackEarliestEventTime = (data) => {
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
                        this.logger.info(`🕐 Updated earliest event time: ${new Date(timestamp).toISOString()}`);
                        
                        // If we don't have a stream start time yet, use earliest event
                        if (!this.streamStartTime) {
                            this.streamStartTime = this._earliestEventTime;
                            this._persistedStreamStart = this.streamStartTime;
                            this._streamTimeDetectionMethod = 'First Event Timestamp';
                            this.logger.info(`📅 Set stream start time from earliest event`);
                            
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

        // ========== CHAT ==========
        this.eventEmitter.on('chat', (data) => {
            trackEarliestEventTime(data);
            
            const userData = this.extractUserData(data);

            let teamMemberLevel = 0;

            // Check if user is moderator (highest priority)
            if (data.userIdentity?.isModeratorOfAnchor) {
                teamMemberLevel = 10;
            }
            // Check fans club level
            else if (data.user?.fansClub?.data?.level) {
                teamMemberLevel = data.user.fansClub.data.level;
            }
            // Check if subscriber
            else if (data.userIdentity?.isSubscriberOfAnchor) {
                teamMemberLevel = 1;
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
        this.eventEmitter.on('gift', (data) => {
            trackEarliestEventTime(data);
            
            // Extract gift data
            const giftData = this.extractGiftData(data);

            // If no gift name, try to load from catalog
            if (!giftData.giftName && giftData.giftId) {
                const catalogGift = this.db.getGift(giftData.giftId);
                if (catalogGift) {
                    giftData.giftName = catalogGift.name;
                    if (!giftData.diamondCount && catalogGift.diamond_count) {
                        giftData.diamondCount = catalogGift.diamond_count;
                    }
                }
            }

            // Calculate coins: diamond_count * 2 * repeat_count
            const repeatCount = giftData.repeatCount;
            const diamondCount = giftData.diamondCount;
            let coins = 0;

            if (diamondCount > 0) {
                coins = diamondCount * 2 * repeatCount;
            }

            this.logger.info(`🎁 [GIFT] ${giftData.giftName}: diamondCount=${diamondCount}, repeatCount=${repeatCount}, coins=${coins}, giftType=${giftData.giftType}, repeatEnd=${giftData.repeatEnd}`);

            // Check if streak ended
            const isStreakEnd = giftData.repeatEnd;
            const isStreakable = giftData.giftType === 1;

            // Only count if not streakable OR streakable and streak ended
            if (!isStreakable || (isStreakable && isStreakEnd)) {
                this.stats.totalCoins += coins;
                this.stats.gifts++;

                const userData = this.extractUserData(data);
                const eventData = {
                    uniqueId: userData.username,
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
                    giftType: giftData.giftType,
                    timestamp: new Date().toISOString()
                };

                this.logger.info(`✅ [GIFT COUNTED] Total coins now: ${this.stats.totalCoins}`);

                this.handleEvent('gift', eventData);
                this.db.logEvent('gift', eventData.username, eventData);
                this.broadcastStats();
            } else {
                this.logger.info(`⏳ [STREAK RUNNING] ${giftData.giftName || 'Unknown Gift'} x${repeatCount} (${coins} coins, not counted yet)`);
            }
        });

        // ========== FOLLOW ==========
        this.eventEmitter.on('social', (data) => {
            trackEarliestEventTime(data);
            
            // Social events can be follow, share, etc.
            // We need to check the displayType or action field
            if (data.displayType === 'pm_main_follow_message_viewer_2' || data.action === 1) {
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
            }
        });

        // ========== SHARE ==========
        this.eventEmitter.on('share', (data) => {
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
        this.eventEmitter.on('like', (data) => {
            trackEarliestEventTime(data);
            
            // Extract like count
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

            const likeCount = data.likeCount || data.count || data.like_count || 1;

            this.logger.info(`💗 [LIKE EVENT] likeCount=${likeCount}, totalLikes=${totalLikes}`);

            // If totalLikes found, use it directly
            if (totalLikes !== null) {
                this.stats.likes = totalLikes;
            } else {
                // Fallback: increment based on likeCount
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
            this.broadcastStats();
        });

        // ========== VIEWER COUNT ==========
        this.eventEmitter.on('roomUser', (data) => {
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
        this.eventEmitter.on('subscribe', (data) => {
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

        // ========== MEMBER (JOIN) ==========
        this.eventEmitter.on('member', (data) => {
            trackEarliestEventTime(data);
            
            const userData = this.extractUserData(data);
            this.logger.info(`👋 User joined: ${userData.username || userData.nickname}`);
        });
    }

    /**
     * Extract user data from event
     * @private
     */
    extractUserData(data) {
        const user = data.user || data;

        const extractedData = {
            username: user.uniqueId || user.username || null,
            nickname: user.nickname || user.displayName || null,
            userId: user.userId || user.id || null,
            profilePictureUrl: user.profilePictureUrl || user.profilePicture || null
        };

        if (!extractedData.username && !extractedData.nickname) {
            this.logger.warn('⚠️ No user data found in event. Event structure:', {
                hasUser: !!data.user,
                hasUniqueId: !!data.uniqueId,
                hasUsername: !!data.username,
                hasNickname: !!data.nickname,
                keys: Object.keys(data).slice(0, 10)
            });
        }

        return extractedData;
    }

    /**
     * Extract gift data from event
     * @private
     */
    extractGiftData(data) {
        const gift = data.gift || data;

        const extractedData = {
            giftName: gift.name || gift.giftName || gift.gift_name || null,
            giftId: gift.id || gift.giftId || gift.gift_id || null,
            giftPictureUrl: gift.image?.url_list?.[0] || gift.image?.url || gift.giftPictureUrl || gift.picture_url || null,
            diamondCount: gift.diamond_count || gift.diamondCount || gift.diamonds || 0,
            repeatCount: data.repeatCount || data.repeat_count || 1,
            giftType: data.giftType || data.gift_type || 0,
            repeatEnd: data.repeatEnd || data.repeat_end || false
        };

        if (!extractedData.giftName && !extractedData.giftId) {
            this.logger.warn('⚠️ No gift data found in event. Event structure:', {
                hasGift: !!data.gift,
                hasGiftName: !!(data.giftName || data.name),
                hasGiftId: !!(data.giftId || data.id),
                hasDiamondCount: !!(data.diamondCount || data.diamond_count),
                keys: Object.keys(data).slice(0, 15)
            });
        }

        return extractedData;
    }

    /**
     * Analyze connection error and provide user-friendly message
     * @private
     */
    _analyzeError(error) {
        const errorMessage = error.message || error.toString();

        // SIGI_STATE / TikTok blocking errors
        if (errorMessage.includes('SIGI_STATE') || 
            errorMessage.includes('blocked by TikTok')) {
            return {
                type: 'BLOCKED_BY_TIKTOK',
                message: 'Möglicherweise von TikTok blockiert. SIGI_STATE konnte nicht extrahiert werden.',
                suggestion: 'NICHT SOFORT ERNEUT VERSUCHEN - Warte mindestens 30-60 Minuten bevor du es erneut versuchst.',
                retryable: false
            };
        }

        // Sign API 401 errors (invalid API key)
        if (errorMessage.includes('401') && 
            (errorMessage.includes('Sign Error') || errorMessage.includes('API Key is invalid'))) {
            return {
                type: 'SIGN_API_INVALID_KEY',
                message: 'Sign API Fehler 401 - Der API-Schlüssel ist ungültig',
                suggestion: 'Prüfe deinen Eulerstream API-Schlüssel auf https://www.eulerstream.com',
                retryable: false
            };
        }

        // Sign API 504 Gateway Timeout
        if (errorMessage.includes('504')) {
            return {
                type: 'SIGN_API_GATEWAY_TIMEOUT',
                message: '504 Gateway Timeout - Eulerstream Sign API ist überlastet oder nicht erreichbar',
                suggestion: 'Warte 2-5 Minuten und versuche es dann erneut',
                retryable: true
            };
        }

        // Sign API 500 errors
        if (errorMessage.includes('500') && errorMessage.includes('Sign Error')) {
            return {
                type: 'SIGN_API_ERROR',
                message: '500 Internal Server Error - Eulerstream Sign API Problem',
                suggestion: 'Warte 1-2 Minuten und versuche es dann erneut',
                retryable: true
            };
        }

        // Room ID / User not live errors
        if (errorMessage.includes('Failed to retrieve Room ID')) {
            return {
                type: 'ROOM_NOT_FOUND',
                message: 'Raum-ID konnte nicht abgerufen werden - Benutzer existiert nicht oder ist nicht live',
                suggestion: 'Prüfe ob der Benutzername korrekt ist und der Benutzer gerade live ist',
                retryable: false
            };
        }

        // User not live or room not found (Eulerstream errors)
        if (errorMessage.includes('LIVE_NOT_FOUND') || 
            errorMessage.includes('not live') ||
            errorMessage.includes('room id') ||
            errorMessage.includes('Room ID')) {
            return {
                type: 'NOT_LIVE',
                message: 'User is not currently live or username is incorrect',
                suggestion: 'Verify the username is correct and the user is streaming on TikTok',
                retryable: false
            };
        }

        // Timeout errors
        if (errorMessage.includes('Verbindungs-Timeout') || 
            errorMessage.includes('Connection timeout') ||
            errorMessage.includes('timeout') || 
            errorMessage.includes('TIMEOUT') ||
            errorMessage.includes('ECONNABORTED') ||
            errorMessage.includes('ETIMEDOUT')) {
            return {
                type: 'CONNECTION_TIMEOUT',
                message: 'Verbindungs-Timeout - Server hat nicht rechtzeitig geantwortet',
                suggestion: 'Prüfe deine Internetverbindung. Falls das Problem weiterhin besteht, könnte der Eulerstream-Server langsam oder nicht erreichbar sein',
                retryable: true
            };
        }

        // WebSocket close codes
        if (errorMessage.includes('WebSocket')) {
            return {
                type: 'WEBSOCKET_ERROR',
                message: errorMessage,
                suggestion: 'Check Eulerstream API key and connection settings',
                retryable: true
            };
        }

        // API key errors (general)
        if (errorMessage.includes('API key') || 
            errorMessage.includes('403')) {
            return {
                type: 'API_KEY_ERROR',
                message: 'Invalid or missing Eulerstream API key',
                suggestion: 'Check your Eulerstream API key at https://www.eulerstream.com or set tiktok_euler_api_key in settings',
                retryable: false
            };
        }

        // Network connection errors
        if (errorMessage.includes('ECONNREFUSED') || 
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('network')) {
            return {
                type: 'NETWORK_ERROR',
                message: 'Network error - cannot reach Eulerstream servers',
                suggestion: 'Check your internet connection and firewall settings',
                retryable: true
            };
        }

        // Generic error
        return {
            type: 'UNKNOWN_ERROR',
            message: errorMessage,
            suggestion: 'Check the console logs for more details. If the problem persists, report this error',
            retryable: true
        };
    }

    /**
     * Public method for analyzing connection errors (for testing)
     * @param {Error} error - The error to analyze
     * @returns {Object} Error analysis result
     */
    analyzeConnectionError(error) {
        return this._analyzeError(error);
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
        
        if (this.connectionAttempts.length > this.maxAttempts) {
            this.connectionAttempts = this.connectionAttempts.slice(0, this.maxAttempts);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.eventEmitter) {
            this.eventEmitter = null;
        }
        this.isConnected = false;
        
        const previousUsername = this.currentUsername;
        this.currentUsername = null;

        // Clear duration tracking interval but preserve stream start time
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = null;
        }
        
        if (previousUsername) {
            this.logger.info(`🔄 Disconnected but preserving stream start time for potential reconnection to @${previousUsername}`);
        } else {
            this.streamStartTime = null;
            this._persistedStreamStart = null;
            this._earliestEventTime = null;
        }

        // Clear event deduplication cache on disconnect
        this.processedEvents.clear();
        this.logger.info('🧹 Event deduplication cache cleared');

        this.resetStats();
        this.broadcastStatus('disconnected');
        this.logger.info('⚫ Disconnected from TikTok LIVE');
    }

    /**
     * Generate unique event hash for deduplication
     * @private
     */
    _generateEventHash(eventType, data) {
        const components = [eventType];
        
        if (data.userId) components.push(data.userId);
        if (data.uniqueId) components.push(data.uniqueId);
        if (data.username) components.push(data.username);
        
        switch (eventType) {
            case 'chat':
                if (data.message) components.push(data.message);
                if (data.comment) components.push(data.comment);
                if (data.timestamp) {
                    const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
                    components.push(roundedTime.toString());
                }
                break;
            case 'gift':
                if (data.giftId) components.push(data.giftId.toString());
                if (data.giftName) components.push(data.giftName);
                if (data.repeatCount) components.push(data.repeatCount.toString());
                break;
            case 'follow':
            case 'share':
            case 'subscribe':
                if (data.timestamp) {
                    const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
                    components.push(roundedTime.toString());
                }
                break;
        }
        
        return components.join('|');
    }

    /**
     * Check if event has already been processed
     * @private
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
        
        if (this.processedEvents.has(eventHash)) {
            this.logger.info(`🔄 [DUPLICATE BLOCKED] ${eventType} event already processed: ${eventHash}`);
            return true;
        }
        
        this.processedEvents.set(eventHash, now);
        
        if (this.processedEvents.size > this.maxProcessedEvents) {
            const firstKey = this.processedEvents.keys().next().value;
            this.processedEvents.delete(firstKey);
        }
        
        return false;
    }

    handleEvent(eventType, data) {
        // Check for duplicate events
        if (this._isDuplicateEvent(eventType, data)) {
            this.logger.info(`⚠️  Duplicate ${eventType} event ignored`);
            return;
        }

        // Forward event to server modules
        this.emit(eventType, data);

        // Broadcast event to frontend
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

    getDeduplicationStats() {
        return {
            cacheSize: this.processedEvents.size,
            maxCacheSize: this.maxProcessedEvents,
            expirationMs: this.eventExpirationMs
        };
    }

    clearDeduplicationCache() {
        this.processedEvents.clear();
        this.logger.info('🧹 Event deduplication cache manually cleared');
    }

    isActive() {
        return this.isConnected;
    }

    async updateGiftCatalog(options = {}) {
        // Gift catalog update is not directly supported via Eulerstream WebSocket
        // This would require a separate API call to fetch gift data
        this.logger.warn('⚠️ Gift catalog update not implemented for Eulerstream WebSocket connection');
        return { ok: false, message: 'Gift catalog update not available via WebSocket', count: 0 };
    }

    getGiftCatalog() {
        return this.db.getGiftCatalog();
    }
    
    async runDiagnostics(username) {
        const testUsername = username || this.currentUsername || 'tiktok';
        
        return {
            timestamp: new Date().toISOString(),
            connection: {
                isConnected: this.isConnected,
                currentUsername: this.currentUsername,
                autoReconnectCount: this.autoReconnectCount,
                maxAutoReconnects: this.maxAutoReconnects,
                method: 'Eulerstream WebSocket API'
            },
            configuration: {
                apiKeyConfigured: !!(this.db.getSetting('tiktok_euler_api_key') || process.env.EULER_API_KEY || process.env.SIGN_API_KEY)
            },
            recentAttempts: this.connectionAttempts.slice(0, 5),
            stats: this.stats
        };
    }
    
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
