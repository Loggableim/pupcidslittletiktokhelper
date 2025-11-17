const axios = require('axios');

/**
 * OpenShock API Client - Production Ready
 *
 * Provides full integration with OpenShock API including:
 * - Device management
 * - Shock/Vibrate/Sound commands
 * - Rate limiting (60 req/min)
 * - Request queue with priorities
 * - Retry logic
 * - Comprehensive error handling
 * - Connection testing
 *
 * @class OpenShockClient
 */
class OpenShockClient {
    /**
     * Creates an instance of OpenShockClient
     *
     * @param {string} apiKey - OpenShock API token
     * @param {string} [baseUrl='https://api.openshock.app'] - API base URL
     * @param {Object} [logger=console] - Logger instance (must have info, warn, error methods)
     */
    constructor(apiKey, baseUrl = 'https://api.openshock.app', logger = console) {
        // Allow empty API key for initial setup - warn but don't throw
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            logger.warn('OpenShockClient: API key not configured. Plugin will run in configuration mode only.');
            this.apiKey = '';
            this.isConfigured = false;
        } else {
            this.apiKey = apiKey;
            this.isConfigured = true;
        }

        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.logger = logger;

        // Rate limiting configuration (60 requests per minute)
        this.rateLimitWindow = 60000; // 1 minute in ms
        this.maxRequestsPerWindow = 60;
        this.requestTimestamps = [];

        // Request queue with priority support
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.maxConcurrentRequests = 5;
        this.activeRequests = 0;

        // Timeout configuration
        this.defaultTimeout = 30000; // 30 seconds

        // Retry configuration
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second base delay

        // Device cooldown tracking
        this.deviceCooldowns = new Map();
        this.minCooldownMs = 100; // Minimum 100ms between commands to same device

        // Axios instance with default config
        this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            timeout: this.defaultTimeout,
            headers: {
                'Open-Shock-Token': this.apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'OpenShockClient/1.0'
            }
        });

        // Setup request/response interceptors for logging
        this._setupInterceptors();

        this.logger.info('OpenShockClient initialized', {
            baseUrl: this.baseUrl,
            rateLimit: `${this.maxRequestsPerWindow}/${this.rateLimitWindow}ms`
        });
    }

    /**
     * Setup axios interceptors for logging and error handling
     * @private
     */
    _setupInterceptors() {
        // Request interceptor
        this.axiosInstance.interceptors.request.use(
            (config) => {
                this.logger.info('OpenShock API Request', {
                    method: config.method?.toUpperCase(),
                    url: config.url,
                    hasData: !!config.data
                });
                return config;
            },
            (error) => {
                this.logger.error('OpenShock Request Error', { error: error.message });
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.axiosInstance.interceptors.response.use(
            (response) => {
                this.logger.info('OpenShock API Response', {
                    status: response.status,
                    url: response.config.url
                });
                return response;
            },
            (error) => {
                const errorInfo = {
                    message: error.message,
                    status: error.response?.status,
                    url: error.config?.url,
                    data: error.response?.data
                };
                this.logger.error('OpenShock Response Error', errorInfo);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Validates if the API key is valid by testing authentication
     *
     * @returns {Promise<boolean>} True if API key is valid
     * @throws {Error} If validation fails
     */
    async validateApiKey() {
        try {
            await this.getDevices();
            this.logger.info('API key validation successful');
            return true;
        } catch (error) {
            if (error.response?.status === 401 || error.response?.status === 403) {
                this.logger.error('API key validation failed: Invalid credentials');
                throw new Error('Invalid API key: Authentication failed');
            }
            throw new Error(`API key validation failed: ${error.message}`);
        }
    }

    /**
     * Tests connection to OpenShock API
     *
     * @returns {Promise<Object>} Connection test results
     */
    async testConnection() {
        // Check if API key is configured
        if (!this.isConfigured) {
            return {
                success: false,
                error: 'API key not configured',
                timestamp: new Date().toISOString()
            };
        }

        const startTime = Date.now();
        try {
            const devices = await this.getDevices();
            const latency = Date.now() - startTime;

            const result = {
                success: true,
                latency,
                deviceCount: devices.length,
                timestamp: new Date().toISOString()
            };

            this.logger.info('Connection test successful', result);
            return result;
        } catch (error) {
            const result = {
                success: false,
                latency: Date.now() - startTime,
                error: error.message,
                timestamp: new Date().toISOString()
            };

            this.logger.error('Connection test failed', result);
            return result;
        }
    }

    /**
     * Gets list of all owned devices/shockers
     *
     * @returns {Promise<Array>} Array of device objects
     */
    async getDevices() {
        if (!this.isConfigured) {
            this.logger.warn('OpenShockClient: Cannot get devices - API key not configured');
            return [];
        }
        const response = await this._executeRequest('GET', '/1/shockers/own', null, 1);
        
        // OpenShock API returns LegacyDataResponse { Message, Data }
        // where Data is an array of devices, each containing an array of shockers
        const devicesWithShockers = response.data || response.Data || response || [];
        
        // Flatten the structure: extract all shockers from all devices
        // Each shocker gets device info added to it for context
        const allShockers = [];
        
        for (const device of devicesWithShockers) {
            if (device.shockers || device.Shockers) {
                const shockers = device.shockers || device.Shockers;
                for (const shocker of shockers) {
                    // Map OpenShock API field names to plugin expected format
                    allShockers.push({
                        id: shocker.id || shocker.Id,
                        name: shocker.name || shocker.Name,
                        rfId: shocker.rfId || shocker.RfId,
                        model: shocker.model || shocker.Model,
                        isPaused: shocker.isPaused || shocker.IsPaused || false,
                        createdOn: shocker.createdOn || shocker.CreatedOn,
                        // Add device info for context
                        deviceId: device.id || device.Id,
                        deviceName: device.name || device.Name,
                        // Additional fields that may be present
                        type: shocker.model || shocker.Model || 'Shocker',
                        online: true, // Assume online if returned by API
                        battery: shocker.battery || shocker.Battery,
                        rssi: shocker.rssi || shocker.Rssi
                    });
                }
            }
        }
        
        this.logger.info(`Extracted ${allShockers.length} shockers from ${devicesWithShockers.length} devices`);
        return allShockers;
    }

    /**
     * Gets details for a specific device
     *
     * @param {string} deviceId - Device ID
     * @returns {Promise<Object>} Device details
     */
    async getDevice(deviceId) {
        if (!deviceId) {
            throw new Error('Device ID is required');
        }
        return this._executeRequest('GET', `/1/shockers/${deviceId}`, null, 1);
    }

    /**
     * Sends a shock command to a device
     *
     * @param {string} deviceId - Device ID
     * @param {number} intensity - Intensity (1-100)
     * @param {number} duration - Duration in milliseconds (300-30000)
     * @param {Object} [options={}] - Additional options
     * @param {number} [options.priority=2] - Request priority (lower = higher priority)
     * @returns {Promise<Object>} Command response
     */
    async sendShock(deviceId, intensity, duration, options = {}) {
        return this._sendCommand(deviceId, 'Shock', intensity, duration, options);
    }

    /**
     * Sends a vibrate command to a device
     *
     * @param {string} deviceId - Device ID
     * @param {number} intensity - Intensity (1-100)
     * @param {number} duration - Duration in milliseconds (300-30000)
     * @param {Object} [options={}] - Additional options
     * @param {number} [options.priority=2] - Request priority (lower = higher priority)
     * @returns {Promise<Object>} Command response
     */
    async sendVibrate(deviceId, intensity, duration, options = {}) {
        return this._sendCommand(deviceId, 'Vibrate', intensity, duration, options);
    }

    /**
     * Sends a sound/beep command to a device
     *
     * @param {string} deviceId - Device ID
     * @param {number} intensity - Intensity (1-100)
     * @param {number} duration - Duration in milliseconds (300-30000)
     * @param {Object} [options={}] - Additional options
     * @param {number} [options.priority=2] - Request priority (lower = higher priority)
     * @returns {Promise<Object>} Command response
     */
    async sendSound(deviceId, intensity, duration, options = {}) {
        return this._sendCommand(deviceId, 'Sound', intensity, duration, options);
    }

    /**
     * Sends a control command to a device (generic wrapper)
     * Routes to appropriate method based on type
     *
     * @param {string} deviceId - Device ID
     * @param {Object} command - Command object
     * @param {string} command.type - Command type (shock, vibrate, sound, beep)
     * @param {number} command.intensity - Intensity (1-100)
     * @param {number} command.duration - Duration in milliseconds (300-30000)
     * @param {Object} [options={}] - Additional options
     * @returns {Promise<Object>} Command response
     */
    async sendControl(deviceId, command, options = {}) {
        const { type, intensity, duration } = command;
        
        // Normalize type to match API requirements (capitalize first letter)
        let normalizedType = type;
        if (typeof type === 'string') {
            normalizedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
            
            // Handle 'beep' alias for 'sound'
            if (normalizedType === 'Beep') {
                normalizedType = 'Sound';
            }
        }
        
        // Route to appropriate method
        switch (normalizedType) {
            case 'Shock':
                return this.sendShock(deviceId, intensity, duration, options);
            case 'Vibrate':
                return this.sendVibrate(deviceId, intensity, duration, options);
            case 'Sound':
                return this.sendSound(deviceId, intensity, duration, options);
            default:
                throw new Error(`Unknown command type: ${type}. Must be one of: shock, vibrate, sound`);
        }
    }

    /**
     * Sends a command to a device (internal method)
     *
     * @private
     * @param {string} deviceId - Device ID
     * @param {string} type - Command type (Shock, Vibrate, Sound)
     * @param {number} intensity - Intensity (1-100)
     * @param {number} duration - Duration in milliseconds (300-30000)
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Command response
     */
    async _sendCommand(deviceId, type, intensity, duration, options = {}) {
        // Validate parameters
        this._validateCommandParams(deviceId, type, intensity, duration);

        // Check device cooldown
        await this._checkDeviceCooldown(deviceId);

        const command = {
            shocks: [{
                id: deviceId,
                type,
                intensity: Math.round(intensity),
                duration: Math.round(duration)
            }]
        };

        const priority = options.priority || 2;
        const result = await this._executeRequest('POST', '/2/shockers/control', command, priority);

        // Update device cooldown
        this._updateDeviceCooldown(deviceId);

        return result;
    }

    /**
     * Sends multiple commands in a batch
     *
     * @param {Array<Object>} commands - Array of command objects
     * @param {string} commands[].deviceId - Device ID
     * @param {string} commands[].type - Command type (Shock, Vibrate, Sound)
     * @param {number} commands[].intensity - Intensity (1-100)
     * @param {number} commands[].duration - Duration in milliseconds (300-30000)
     * @param {Object} [options={}] - Additional options
     * @param {number} [options.priority=2] - Request priority
     * @returns {Promise<Object>} Batch command response
     */
    async sendBatch(commands, options = {}) {
        if (!Array.isArray(commands) || commands.length === 0) {
            throw new Error('Commands must be a non-empty array');
        }

        const shocks = commands.map(cmd => {
            this._validateCommandParams(cmd.deviceId, cmd.type, cmd.intensity, cmd.duration);
            return {
                id: cmd.deviceId,
                type: cmd.type,
                intensity: Math.round(cmd.intensity),
                duration: Math.round(cmd.duration)
            };
        });

        const priority = options.priority || 2;
        const result = await this._executeRequest('POST', '/2/shockers/control', { shocks }, priority);

        // Update cooldowns for all devices
        commands.forEach(cmd => this._updateDeviceCooldown(cmd.deviceId));

        return result;
    }

    /**
     * Gets command history for a device
     *
     * @param {string} deviceId - Device ID
     * @param {number} [limit=50] - Maximum number of entries to return
     * @returns {Promise<Array>} Command history
     */
    async getCommandHistory(deviceId, limit = 50) {
        if (!deviceId) {
            throw new Error('Device ID is required');
        }

        const endpoint = `/1/shockers/${deviceId}/logs${limit ? `?limit=${limit}` : ''}`;
        return this._executeRequest('GET', endpoint, null, 3);
    }

    /**
     * Validates command parameters
     *
     * @private
     * @param {string} deviceId - Device ID
     * @param {string} type - Command type
     * @param {number} intensity - Intensity
     * @param {number} duration - Duration
     * @throws {Error} If parameters are invalid
     */
    _validateCommandParams(deviceId, type, intensity, duration) {
        if (!deviceId || typeof deviceId !== 'string') {
            throw new Error('Device ID is required and must be a string');
        }

        const validTypes = ['Shock', 'Vibrate', 'Sound'];
        if (!validTypes.includes(type)) {
            throw new Error(`Invalid command type: ${type}. Must be one of: ${validTypes.join(', ')}`);
        }

        if (typeof intensity !== 'number' || intensity < 1 || intensity > 100) {
            throw new Error('Intensity must be a number between 1 and 100');
        }

        if (typeof duration !== 'number' || duration < 300 || duration > 30000) {
            throw new Error('Duration must be a number between 300 and 30000 milliseconds');
        }
    }

    /**
     * Checks if device is on cooldown
     *
     * @private
     * @param {string} deviceId - Device ID
     * @returns {Promise<void>}
     */
    async _checkDeviceCooldown(deviceId) {
        const lastCommand = this.deviceCooldowns.get(deviceId);
        if (lastCommand) {
            const timeSinceLastCommand = Date.now() - lastCommand;
            if (timeSinceLastCommand < this.minCooldownMs) {
                const waitTime = this.minCooldownMs - timeSinceLastCommand;
                this.logger.info(`Device ${deviceId} on cooldown, waiting ${waitTime}ms`);
                await this._sleep(waitTime);
            }
        }
    }

    /**
     * Updates device cooldown timestamp
     *
     * @private
     * @param {string} deviceId - Device ID
     */
    _updateDeviceCooldown(deviceId) {
        this.deviceCooldowns.set(deviceId, Date.now());
    }

    /**
     * Executes an HTTP request with queue, rate limiting, and retry logic
     *
     * @private
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {Object} [data=null] - Request data
     * @param {number} [priority=5] - Request priority (lower = higher priority)
     * @returns {Promise<any>} Response data
     */
    async _executeRequest(method, endpoint, data = null, priority = 5) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                method,
                endpoint,
                data,
                priority,
                resolve,
                reject,
                timestamp: Date.now()
            });

            // Sort queue by priority (lower number = higher priority)
            this.requestQueue.sort((a, b) => a.priority - b.priority);

            // Process queue if not already processing
            if (!this.isProcessingQueue) {
                this._processQueue();
            }
        });
    }

    /**
     * Processes the request queue
     *
     * @private
     */
    async _processQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            // Wait if we've hit concurrent request limit
            while (this.activeRequests >= this.maxConcurrentRequests) {
                await this._sleep(50);
            }

            // Wait if we've hit rate limit
            await this._handleRateLimit();

            const request = this.requestQueue.shift();
            if (!request) continue;

            this.activeRequests++;

            // Execute request with retry logic
            this._retry(async () => {
                try {
                    const config = {
                        method: request.method,
                        url: request.endpoint
                    };

                    if (request.data) {
                        config.data = request.data;
                    }

                    const response = await this.axiosInstance(config);
                    return response.data;
                } catch (error) {
                    throw this._normalizeError(error);
                }
            }, this.maxRetries)
                .then(result => {
                    request.resolve(result);
                })
                .catch(error => {
                    request.reject(error);
                })
                .finally(() => {
                    this.activeRequests--;
                });

            // Record request timestamp for rate limiting
            this.requestTimestamps.push(Date.now());
        }

        this.isProcessingQueue = false;
    }

    /**
     * Handles rate limiting by waiting if necessary
     *
     * @private
     * @returns {Promise<void>}
     */
    async _handleRateLimit() {
        const now = Date.now();

        // Remove timestamps outside the current window
        this.requestTimestamps = this.requestTimestamps.filter(
            timestamp => now - timestamp < this.rateLimitWindow
        );

        // If we've hit the limit, wait until the oldest request expires
        if (this.requestTimestamps.length >= this.maxRequestsPerWindow) {
            const oldestTimestamp = this.requestTimestamps[0];
            const waitTime = this.rateLimitWindow - (now - oldestTimestamp) + 100; // +100ms buffer

            if (waitTime > 0) {
                this.logger.warn(`Rate limit reached, waiting ${waitTime}ms`);
                await this._sleep(waitTime);
            }
        }
    }

    /**
     * Retries a function with exponential backoff
     *
     * @private
     * @param {Function} fn - Function to retry
     * @param {number} maxRetries - Maximum number of retries
     * @param {number} [attempt=0] - Current attempt number
     * @returns {Promise<any>} Function result
     */
    async _retry(fn, maxRetries, attempt = 0) {
        try {
            return await fn();
        } catch (error) {
            if (attempt >= maxRetries) {
                this.logger.error(`Max retries (${maxRetries}) exceeded`, { error: error.message });
                throw error;
            }

            // Don't retry on client errors (4xx) except 429 (rate limit)
            if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
                throw error;
            }

            const delay = this.retryDelay * Math.pow(2, attempt); // Exponential backoff
            this.logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
                error: error.message
            });

            await this._sleep(delay);
            return this._retry(fn, maxRetries, attempt + 1);
        }
    }

    /**
     * Normalizes error object for consistent error handling
     *
     * @private
     * @param {Error} error - Original error
     * @returns {Error} Normalized error
     */
    _normalizeError(error) {
        const normalizedError = new Error();

        if (error.response) {
            // HTTP error response
            normalizedError.message = `HTTP ${error.response.status}: ${
                error.response.data?.message || error.response.statusText || 'Unknown error'
            }`;
            normalizedError.statusCode = error.response.status;
            normalizedError.response = error.response.data;
        } else if (error.request) {
            // Request made but no response
            normalizedError.message = 'No response from server (timeout or network error)';
            normalizedError.statusCode = 0;
        } else {
            // Something else happened
            normalizedError.message = error.message || 'Unknown error';
            normalizedError.statusCode = 0;
        }

        normalizedError.originalError = error;
        return normalizedError;
    }

    /**
     * Sleep utility
     *
     * @private
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Gets current rate limit status
     *
     * @returns {Object} Rate limit status
     */
    getRateLimitStatus() {
        const now = Date.now();
        const recentRequests = this.requestTimestamps.filter(
            timestamp => now - timestamp < this.rateLimitWindow
        );

        return {
            used: recentRequests.length,
            limit: this.maxRequestsPerWindow,
            remaining: Math.max(0, this.maxRequestsPerWindow - recentRequests.length),
            windowMs: this.rateLimitWindow,
            queueLength: this.requestQueue.length,
            activeRequests: this.activeRequests
        };
    }

    /**
     * Clears the request queue
     */
    clearQueue() {
        const cleared = this.requestQueue.length;
        this.requestQueue.forEach(req => {
            req.reject(new Error('Queue cleared'));
        });
        this.requestQueue = [];
        this.logger.info(`Cleared ${cleared} requests from queue`);
        return cleared;
    }

    /**
     * Gets client statistics
     *
     * @returns {Object} Client statistics
     */
    getStats() {
        return {
            rateLimit: this.getRateLimitStatus(),
            deviceCooldowns: this.deviceCooldowns.size,
            isProcessingQueue: this.isProcessingQueue,
            config: {
                baseUrl: this.baseUrl,
                maxRetries: this.maxRetries,
                timeout: this.defaultTimeout,
                minCooldownMs: this.minCooldownMs
            }
        };
    }

    /**
     * Cleanup and destroy client
     */
    destroy() {
        // Clear request queue
        this.clearQueue();

        // Clear all maps
        this.deviceCooldowns.clear();
        this.requestTimestamps = [];

        this.logger.info('OpenShockClient destroyed');
    }
}

module.exports = OpenShockClient;
