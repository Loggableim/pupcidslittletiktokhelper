/**
 * HybridShock Client - WebSocket + HTTP API Client
 *
 * Bietet eine einheitliche Schnittstelle zur HybridShock API:
 * - WebSocket-Verbindung (Port 8833) für Events und Echtzeit-Kommunikation
 * - HTTP REST API (Port 8832) für Actions, Info, Features
 * - Auto-Reconnect mit exponential backoff
 * - Event-basierte Architektur mit EventEmitter-Pattern
 * - Connection-Health-Monitoring mit Heartbeat
 */

const WebSocket = require('ws');
const axios = require('axios');
const EventEmitter = require('events');

class HybridShockClient extends EventEmitter {
    constructor(config = {}) {
        super();

        // Configuration
        this.config = {
            httpHost: config.httpHost || '127.0.0.1',
            httpPort: config.httpPort || 8832,
            wsHost: config.wsHost || '127.0.0.1',
            wsPort: config.wsPort || 8833,
            autoReconnect: config.autoReconnect !== false,
            reconnectInterval: config.reconnectInterval || 5000,
            reconnectMaxInterval: config.reconnectMaxInterval || 30000,
            reconnectDecay: config.reconnectDecay || 1.5,
            heartbeatInterval: config.heartbeatInterval || 30000,
            requestTimeout: config.requestTimeout || 10000
        };

        // State
        this.ws = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.lastHeartbeat = null;

        // Cache
        this.categories = [];
        this.actions = [];
        this.events = [];
        this.appInfo = null;

        // Statistics
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            actionsSent: 0,
            eventsReceived: 0,
            errors: 0,
            connectionCount: 0,
            lastError: null,
            connectedSince: null,
            uptime: 0
        };

        // HTTP Client
        this.httpClient = axios.create({
            baseURL: `http://${this.config.httpHost}:${this.config.httpPort}`,
            timeout: this.config.requestTimeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // HTTP Error Interceptor
        this.httpClient.interceptors.response.use(
            response => response,
            error => {
                this.stats.errors++;
                this.stats.lastError = {
                    type: 'http',
                    message: error.message,
                    timestamp: Date.now()
                };
                this.emit('error', {
                    type: 'http',
                    error: error.message,
                    url: error.config?.url
                });
                throw error;
            }
        );
    }

    /**
     * WebSocket-Verbindung herstellen
     */
    async connect() {
        if (this.isConnected || this.isConnecting) {
            return;
        }

        this.isConnecting = true;
        this.emit('connecting');

        try {
            const wsUrl = `ws://${this.config.wsHost}:${this.config.wsPort}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => this.handleOpen());
            this.ws.on('message', (data) => this.handleMessage(data));
            this.ws.on('close', (code, reason) => this.handleClose(code, reason));
            this.ws.on('error', (error) => this.handleError(error));
            this.ws.on('ping', () => this.handlePing());
            this.ws.on('pong', () => this.handlePong());

        } catch (error) {
            this.isConnecting = false;
            this.handleError(error);

            if (this.config.autoReconnect) {
                this.scheduleReconnect();
            }
        }
    }

    /**
     * WebSocket-Verbindung trennen
     */
    disconnect() {
        this.config.autoReconnect = false;
        this.clearReconnectTimer();
        this.clearHeartbeatTimer();

        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }

        this.isConnected = false;
        this.isConnecting = false;
        this.emit('disconnected', { manual: true });
    }

    /**
     * WebSocket Open Handler
     */
    handleOpen() {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.stats.connectionCount++;
        this.stats.connectedSince = Date.now();

        this.clearReconnectTimer();
        this.startHeartbeat();

        this.emit('connected');
        this.log('WebSocket connected', 'info');
    }

    /**
     * WebSocket Message Handler
     */
    handleMessage(data) {
        this.stats.messagesReceived++;

        try {
            const message = JSON.parse(data.toString());

            // Event von HybridShock empfangen
            if (message.type === 'event') {
                this.stats.eventsReceived++;
                this.emit('hybridshock:event', message.data);
            }

            // Response auf Action
            else if (message.type === 'action:response') {
                this.emit('action:response', message.data);
            }

            // Error-Message
            else if (message.type === 'error') {
                this.handleError(new Error(message.message || 'Unknown error'));
            }

            // Pong (Heartbeat-Response)
            else if (message.type === 'pong') {
                this.lastHeartbeat = Date.now();
            }

            // Generic message event
            this.emit('message', message);

        } catch (error) {
            this.log(`Failed to parse message: ${error.message}`, 'error');
            this.stats.errors++;
        }
    }

    /**
     * WebSocket Close Handler
     */
    handleClose(code, reason) {
        const wasConnected = this.isConnected;

        this.isConnected = false;
        this.isConnecting = false;
        this.clearHeartbeatTimer();

        if (this.stats.connectedSince) {
            this.stats.uptime += Date.now() - this.stats.connectedSince;
            this.stats.connectedSince = null;
        }

        this.emit('disconnected', {
            code,
            reason: reason?.toString(),
            wasConnected
        });

        this.log(`WebSocket closed (code: ${code}, reason: ${reason || 'none'})`, 'warn');

        // Auto-Reconnect
        if (this.config.autoReconnect && code !== 1000) {
            this.scheduleReconnect();
        }
    }

    /**
     * WebSocket Error Handler
     */
    handleError(error) {
        this.stats.errors++;
        this.stats.lastError = {
            type: 'websocket',
            message: error.message,
            timestamp: Date.now()
        };

        this.emit('error', {
            type: 'websocket',
            error: error.message
        });

        this.log(`WebSocket error: ${error.message}`, 'error');
    }

    /**
     * WebSocket Ping Handler
     */
    handlePing() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.pong();
        }
    }

    /**
     * WebSocket Pong Handler
     */
    handlePong() {
        this.lastHeartbeat = Date.now();
    }

    /**
     * Heartbeat starten (Connection-Health-Check)
     */
    startHeartbeat() {
        this.clearHeartbeatTimer();

        this.heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();

                // Check ob letzte Heartbeat zu lange her
                if (this.lastHeartbeat && Date.now() - this.lastHeartbeat > this.config.heartbeatInterval * 2) {
                    this.log('Heartbeat timeout - reconnecting', 'warn');
                    this.ws.close(1001, 'Heartbeat timeout');
                }
            }
        }, this.config.heartbeatInterval);
    }

    /**
     * Heartbeat stoppen
     */
    clearHeartbeatTimer() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Reconnect planen (mit exponential backoff)
     */
    scheduleReconnect() {
        this.clearReconnectTimer();

        const interval = Math.min(
            this.config.reconnectInterval * Math.pow(this.config.reconnectDecay, this.reconnectAttempts),
            this.config.reconnectMaxInterval
        );

        this.reconnectAttempts++;

        this.log(`Reconnecting in ${Math.round(interval / 1000)}s (attempt ${this.reconnectAttempts})`, 'info');

        this.emit('reconnecting', {
            attempt: this.reconnectAttempts,
            interval
        });

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, interval);
    }

    /**
     * Reconnect-Timer löschen
     */
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * HTTP: App-Info abrufen (GET /api/app/info)
     */
    async getAppInfo() {
        try {
            const response = await this.httpClient.get('/api/app/info');
            this.appInfo = response.data;
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get app info: ${error.message}`);
        }
    }

    /**
     * HTTP: Verfügbare Kategorien abrufen (GET /api/features/categories)
     */
    async getCategories() {
        try {
            const response = await this.httpClient.get('/api/features/categories');
            this.categories = response.data;
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get categories: ${error.message}`);
        }
    }

    /**
     * HTTP: Verfügbare Actions abrufen (GET /api/features/actions)
     */
    async getActions() {
        try {
            const response = await this.httpClient.get('/api/features/actions');
            this.actions = response.data;
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get actions: ${error.message}`);
        }
    }

    /**
     * HTTP: Verfügbare Events abrufen (GET /api/features/events)
     */
    async getEvents() {
        try {
            const response = await this.httpClient.get('/api/features/events');
            this.events = response.data;
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get events: ${error.message}`);
        }
    }

    /**
     * HTTP: Action triggern (POST /api/send/{category}/{action})
     * @param {string} category - Kategorie (z.B. 'shock', 'message')
     * @param {string} action - Action (z.B. 'pulse', 'hello')
     * @param {object} context - Optionales Context-Objekt
     */
    async sendAction(category, action, context = {}) {
        try {
            const response = await this.httpClient.post(
                `/api/send/${category}/${action}`,
                context
            );

            this.stats.actionsSent++;
            this.stats.messagesSent++;

            this.emit('action:sent', {
                category,
                action,
                context,
                response: response.data
            });

            return response.data;
        } catch (error) {
            throw new Error(`Failed to send action ${category}/${action}: ${error.message}`);
        }
    }

    /**
     * WebSocket: Event subscriben
     * @param {string} eventType - Event-Type (z.B. 'shock:completed')
     */
    subscribeEvent(eventType) {
        if (!this.isConnected) {
            throw new Error('Not connected to WebSocket');
        }

        this.sendWebSocketMessage({
            type: 'subscribe',
            event: eventType
        });
    }

    /**
     * WebSocket: Event unsubscriben
     * @param {string} eventType - Event-Type
     */
    unsubscribeEvent(eventType) {
        if (!this.isConnected) {
            throw new Error('Not connected to WebSocket');
        }

        this.sendWebSocketMessage({
            type: 'unsubscribe',
            event: eventType
        });
    }

    /**
     * WebSocket: Message senden
     * @param {object} message - Message-Objekt
     */
    sendWebSocketMessage(message) {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }

        this.ws.send(JSON.stringify(message));
        this.stats.messagesSent++;
    }

    /**
     * Verbindungstest durchführen
     */
    async testConnection() {
        const results = {
            http: false,
            websocket: false,
            appInfo: null,
            error: null
        };

        try {
            // HTTP-Test
            results.appInfo = await this.getAppInfo();
            results.http = true;
        } catch (error) {
            results.error = error.message;
        }

        // WebSocket-Test
        results.websocket = this.isConnected;

        return results;
    }

    /**
     * Status-Objekt zurückgeben
     */
    getStatus() {
        return {
            connected: this.isConnected,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            lastHeartbeat: this.lastHeartbeat,
            uptime: this.stats.connectedSince
                ? this.stats.uptime + (Date.now() - this.stats.connectedSince)
                : this.stats.uptime,
            stats: { ...this.stats }
        };
    }

    /**
     * Statistiken zurücksetzen
     */
    resetStats() {
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            actionsSent: 0,
            eventsReceived: 0,
            errors: 0,
            connectionCount: this.stats.connectionCount,
            lastError: null,
            connectedSince: this.stats.connectedSince,
            uptime: 0
        };
    }

    /**
     * Logging (kann überschrieben werden)
     */
    log(message, level = 'info') {
        this.emit('log', { message, level, timestamp: Date.now() });
    }

    /**
     * Cleanup & Destroy
     */
    destroy() {
        this.disconnect();
        this.removeAllListeners();
    }
}

module.exports = HybridShockClient;
