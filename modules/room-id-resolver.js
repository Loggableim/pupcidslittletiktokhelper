const axios = require('axios');

/**
 * Enhanced Room ID Resolver with Multiple Fallback Methods
 * 
 * This module provides robust Room ID resolution with:
 * - Multiple fetching strategies (HTML, API, Euler)
 * - Intelligent retry with exponential backoff
 * - Full browser simulation headers
 * - Caching mechanism
 * - Comprehensive error handling
 */
class RoomIdResolver {
    constructor(db, diagnostics) {
        this.db = db;
        this.diagnostics = diagnostics;
        
        // Cache for Room IDs (username -> {roomId, timestamp})
        this.roomIdCache = new Map();
        this.cacheExpiryMs = 5 * 60 * 1000; // 5 minutes
        
        // Retry configuration with exponential backoff
        this.retryConfig = {
            maxRetries: 5,
            initialDelay: 1000,  // 1 second
            maxDelay: 30000,     // 30 seconds
            backoffMultiplier: 2,
            jitter: true
        };
        
        // Timeout configuration (progressive timeouts)
        this.timeoutConfig = {
            html: 15000,      // 15 seconds for HTML fetch
            api: 10000,       // 10 seconds for API fetch
            euler: 12000      // 12 seconds for Euler fetch
        };
    }

    /**
     * Get full browser simulation headers
     */
    _getBrowserHeaders(referer = null) {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        };
        
        if (referer) {
            headers['Referer'] = referer;
            headers['Sec-Fetch-Site'] = 'same-origin';
        }
        
        return headers;
    }

    /**
     * Calculate retry delay with exponential backoff and jitter
     */
    _calculateRetryDelay(attempt) {
        const { initialDelay, maxDelay, backoffMultiplier, jitter } = this.retryConfig;
        
        let delay = Math.min(
            initialDelay * Math.pow(backoffMultiplier, attempt),
            maxDelay
        );
        
        // Add jitter to prevent thundering herd
        if (jitter) {
            const jitterAmount = delay * 0.1; // 10% jitter
            delay += Math.random() * jitterAmount * 2 - jitterAmount;
        }
        
        return Math.floor(delay);
    }

    /**
     * Check cache for Room ID
     */
    _getCachedRoomId(username) {
        const cached = this.roomIdCache.get(username);
        if (!cached) return null;
        
        const age = Date.now() - cached.timestamp;
        if (age > this.cacheExpiryMs) {
            this.roomIdCache.delete(username);
            return null;
        }
        
        console.log(`✅ Using cached Room ID for @${username}: ${cached.roomId} (age: ${Math.floor(age / 1000)}s)`);
        return cached.roomId;
    }

    /**
     * Cache Room ID
     */
    _cacheRoomId(username, roomId) {
        this.roomIdCache.set(username, {
            roomId,
            timestamp: Date.now()
        });
    }

    /**
     * Method 1: Fetch Room ID from HTML (SIGI_STATE parsing)
     */
    async _fetchFromHtml(username, attempt = 0) {
        const url = `https://www.tiktok.com/@${username}/live`;
        
        try {
            console.log(`🔍 [Method 1] Fetching Room ID from HTML: ${url} (attempt ${attempt + 1})`);
            
            const response = await axios.get(url, {
                timeout: this.timeoutConfig.html,
                headers: this._getBrowserHeaders(),
                maxRedirects: 5,
                validateStatus: (status) => status < 500 // Accept any status < 500
            });
            
            // Check for rate limiting or blocking
            if (response.status === 429) {
                throw new Error('Rate limited by TikTok (429)');
            }
            
            if (response.status === 403) {
                throw new Error('Access forbidden by TikTok (403) - possible geo-block or Cloudflare');
            }
            
            const html = response.data;
            
            // Try multiple patterns for SIGI_STATE extraction
            const patterns = [
                /<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/,
                /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/,
                /__SIGI_STATE__\s*=\s*({.*?});/
            ];
            
            let sigiState = null;
            let matchedPattern = null;
            
            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    try {
                        sigiState = JSON.parse(match[1]);
                        matchedPattern = pattern.source;
                        break;
                    } catch (parseError) {
                        console.warn(`⚠️ Failed to parse SIGI_STATE with pattern ${pattern.source}:`, parseError.message);
                        continue;
                    }
                }
            }
            
            if (!sigiState) {
                throw new Error('Failed to extract SIGI_STATE from HTML - pattern mismatch or blocked by TikTok');
            }
            
            console.log(`✅ Successfully parsed SIGI_STATE using pattern: ${matchedPattern}`);
            
            // Try multiple paths to extract Room ID
            const roomIdPaths = [
                () => sigiState?.LiveRoom?.liveRoomUserInfo?.user?.roomId,
                () => sigiState?.LiveRoom?.liveRoomUserInfo?.liveRoom?.roomId,
                () => sigiState?.UserModule?.users?.[username]?.roomId,
                () => sigiState?.UserPage?.userInfo?.user?.roomId
            ];
            
            let roomId = null;
            for (const pathFunc of roomIdPaths) {
                try {
                    roomId = pathFunc();
                    if (roomId) break;
                } catch (e) {
                    continue;
                }
            }
            
            if (!roomId) {
                // Log available paths for debugging
                console.warn('⚠️ Available SIGI_STATE structure:', Object.keys(sigiState || {}).slice(0, 10));
                throw new Error('Failed to extract Room ID from SIGI_STATE - structure changed');
            }
            
            console.log(`✅ [Method 1] Room ID from HTML: ${roomId}`);
            return roomId;
            
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error(`HTML fetch timeout after ${this.timeoutConfig.html}ms`);
            }
            throw error;
        }
    }

    /**
     * Method 2: Fetch Room ID from TikTok API (Live endpoint)
     */
    async _fetchFromApi(username, attempt = 0) {
        try {
            console.log(`🔍 [Method 2] Fetching Room ID from API (attempt ${attempt + 1})`);
            
            const response = await axios.get(`https://www.tiktok.com/api/live/detail/`, {
                timeout: this.timeoutConfig.api,
                headers: this._getBrowserHeaders('https://www.tiktok.com'),
                params: {
                    uniqueId: username
                },
                maxRedirects: 5,
                validateStatus: (status) => status < 500
            });
            
            if (response.status === 429) {
                throw new Error('Rate limited by TikTok API (429)');
            }
            
            const roomId = response.data?.data?.user?.roomId || 
                          response.data?.LiveRoomInfo?.roomId ||
                          response.data?.data?.liveRoom?.roomId;
            
            if (!roomId) {
                // Check if user is offline
                const status = response.data?.data?.liveRoom?.status || 
                              response.data?.LiveRoomInfo?.status;
                if (status === 4) {
                    throw new Error('User is not live (status: 4)');
                }
                throw new Error('Failed to extract Room ID from API response');
            }
            
            console.log(`✅ [Method 2] Room ID from API: ${roomId}`);
            return roomId;
            
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error(`API fetch timeout after ${this.timeoutConfig.api}ms`);
            }
            throw error;
        }
    }

    /**
     * Method 3: Fetch Room ID from alternative TikTok Web API
     */
    async _fetchFromWebApi(username, attempt = 0) {
        try {
            console.log(`🔍 [Method 3] Fetching Room ID from Web API (attempt ${attempt + 1})`);
            
            const response = await axios.get(`https://www.tiktok.com/api/user/detail/`, {
                timeout: this.timeoutConfig.api,
                headers: this._getBrowserHeaders('https://www.tiktok.com'),
                params: {
                    uniqueId: username
                },
                maxRedirects: 5,
                validateStatus: (status) => status < 500
            });
            
            const roomId = response.data?.userInfo?.user?.roomId;
            
            if (!roomId) {
                throw new Error('Failed to extract Room ID from Web API response');
            }
            
            console.log(`✅ [Method 3] Room ID from Web API: ${roomId}`);
            return roomId;
            
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error(`Web API fetch timeout after ${this.timeoutConfig.api}ms`);
            }
            throw error;
        }
    }

    /**
     * Method 4: Fetch Room ID from Euler Stream (requires API key)
     */
    async _fetchFromEuler(username, eulerApiKey, attempt = 0) {
        if (!eulerApiKey) {
            throw new Error('Euler API key not configured');
        }
        
        try {
            console.log(`🔍 [Method 4] Fetching Room ID from Euler Stream (attempt ${attempt + 1})`);
            
            const response = await axios.get(`https://tiktok.eulerstream.com/live/room_id`, {
                timeout: this.timeoutConfig.euler,
                headers: {
                    'Authorization': `Bearer ${eulerApiKey}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    unique_id: username
                },
                validateStatus: (status) => status < 500
            });
            
            if (response.status === 401) {
                throw new Error('Euler API key is invalid or expired (401)');
            }
            
            if (response.status === 403) {
                throw new Error('Euler API key lacks permission (403)');
            }
            
            if (response.status === 429) {
                throw new Error('Euler API rate limit reached (429)');
            }
            
            if (response.data?.code !== 200) {
                throw new Error(`Euler API error: ${response.data?.message || 'Unknown error'}`);
            }
            
            const roomId = response.data?.room_id;
            
            if (!roomId) {
                throw new Error('Failed to extract Room ID from Euler response');
            }
            
            console.log(`✅ [Method 4] Room ID from Euler: ${roomId}`);
            return roomId;
            
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error(`Euler fetch timeout after ${this.timeoutConfig.euler}ms`);
            }
            throw error;
        }
    }

    /**
     * Resolve Room ID with comprehensive fallback strategy
     * 
     * @param {string} username - TikTok username
     * @param {object} options - Configuration options
     * @returns {Promise<string>} Room ID
     */
    async resolve(username, options = {}) {
        const {
            useCache = true,
            eulerApiKey = null,
            disableEulerFallback = false,
            logDetails = true
        } = options;
        
        // Check cache first
        if (useCache) {
            const cached = this._getCachedRoomId(username);
            if (cached) return cached;
        }
        
        console.log(`🔄 Starting Room ID resolution for @${username}...`);
        
        // Define all available methods in priority order
        const methods = [
            {
                name: 'HTML',
                func: () => this._fetchFromHtml(username),
                critical: true  // HTML fetch is most reliable when working
            },
            {
                name: 'API',
                func: () => this._fetchFromApi(username),
                critical: false
            },
            {
                name: 'WebAPI',
                func: () => this._fetchFromWebApi(username),
                critical: false
            }
        ];
        
        // Add Euler method if available and not disabled
        if (eulerApiKey && !disableEulerFallback) {
            methods.push({
                name: 'Euler',
                func: () => this._fetchFromEuler(username, eulerApiKey),
                critical: false
            });
        }
        
        const errors = [];
        let lastMethod = null;
        
        // Try each method with retry logic
        for (const method of methods) {
            lastMethod = method.name;
            let methodSuccess = false;
            
            for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
                try {
                    const roomId = await method.func();
                    
                    // Success! Cache and return
                    this._cacheRoomId(username, roomId);
                    
                    console.log(`✅ Room ID resolved successfully via ${method.name}: ${roomId}`);
                    
                    // Log diagnostics if not first method
                    if (method.name !== 'HTML' && this.diagnostics) {
                        this.diagnostics.logConnectionAttempt(
                            username, 
                            true, 
                            `FALLBACK_${method.name}`, 
                            `Room ID retrieved via ${method.name} fallback`
                        );
                    }
                    
                    return roomId;
                    
                } catch (error) {
                    const errorMsg = `[${method.name}] Attempt ${attempt + 1}/${this.retryConfig.maxRetries}: ${error.message}`;
                    
                    if (logDetails) {
                        console.warn(`⚠️ ${errorMsg}`);
                    }
                    
                    errors.push({
                        method: method.name,
                        attempt: attempt + 1,
                        error: error.message
                    });
                    
                    // Check if we should retry
                    const shouldRetry = 
                        attempt < this.retryConfig.maxRetries - 1 &&
                        !error.message.includes('401') &&  // Don't retry auth errors
                        !error.message.includes('403') &&  // Don't retry permission errors
                        !error.message.includes('not live'); // Don't retry if user offline
                    
                    if (shouldRetry) {
                        const delay = this._calculateRetryDelay(attempt);
                        if (logDetails) {
                            console.log(`⏳ Retrying ${method.name} in ${delay}ms...`);
                        }
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        break; // Move to next method
                    }
                }
            }
            
            // Log failed method
            if (!methodSuccess && logDetails) {
                console.warn(`❌ ${method.name} method exhausted all retries`);
            }
        }
        
        // All methods failed - create comprehensive error
        const errorSummary = errors.map(e => 
            `${e.method} (${e.attempt}): ${e.error}`
        ).join('\n  ');
        
        const errorMsg = `Failed to resolve Room ID for @${username} after trying all methods:\n  ${errorSummary}`;
        
        console.error(`❌ ${errorMsg}`);
        
        // Log to diagnostics
        if (this.diagnostics) {
            this.diagnostics.logConnectionAttempt(
                username,
                false,
                'ROOM_ID_RESOLUTION_FAILED',
                errorMsg
            );
        }
        
        throw new Error(errorMsg);
    }

    /**
     * Clear cache for specific username or all
     */
    clearCache(username = null) {
        if (username) {
            this.roomIdCache.delete(username);
            console.log(`🗑️  Cleared Room ID cache for @${username}`);
        } else {
            this.roomIdCache.clear();
            console.log(`🗑️  Cleared all Room ID cache`);
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        const entries = Array.from(this.roomIdCache.entries()).map(([username, data]) => ({
            username,
            roomId: data.roomId,
            age: Math.floor((Date.now() - data.timestamp) / 1000),
            expiresIn: Math.floor((this.cacheExpiryMs - (Date.now() - data.timestamp)) / 1000)
        }));
        
        return {
            size: this.roomIdCache.size,
            maxAge: Math.floor(this.cacheExpiryMs / 1000),
            entries
        };
    }
}

module.exports = RoomIdResolver;
