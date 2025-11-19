/**
 * WebSocket Wrapper Module
 * 
 * This module provides a robust WebSocket wrapper for client registration
 * and message broadcasting.
 * 
 * Features:
 * - Client registration (dashboard, overlay, admin)
 * - Targeted broadcasting
 * - Connection management
 * - Message validation
 */

const WebSocket = require('ws');
const { isValidClientType, sanitizeUserId } = require('../utils/validators');

class WebSocketWrapper {
  constructor(options = {}) {
    this.wss = null;
    this.clients = new Map(); // websocket -> client info
    this.logger = options.logger || console;
    this.heartbeatInterval = options.heartbeatInterval || 30000; // 30 seconds
    this.heartbeatTimer = null;
  }
  
  /**
   * Initialize WebSocket server
   * @param {Object} server - HTTP server instance
   */
  init(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws/new-soundboard'
    });
    
    this.wss.on('connection', (ws, req) => {
      this._handleConnection(ws, req);
    });
    
    this.wss.on('error', (error) => {
      this.logger.error('[WebSocket] Server error:', error);
    });
    
    // Start heartbeat
    this._startHeartbeat();
    
    this.logger.info('[WebSocket] Server initialized on path /ws/new-soundboard');
  }
  
  /**
   * Handle new WebSocket connection
   */
  _handleConnection(ws, req) {
    const clientId = this._generateClientId();
    
    // Initialize client info
    const clientInfo = {
      id: clientId,
      ws: ws,
      type: null,
      userId: null,
      ip: req.socket.remoteAddress,
      connectedAt: new Date(),
      isAlive: true
    };
    
    this.clients.set(ws, clientInfo);
    
    this.logger.info(`[WebSocket] New connection: ${clientId} from ${clientInfo.ip}`);
    
    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this._handleMessage(ws, message);
      } catch (error) {
        this.logger.error('[WebSocket] Failed to parse message:', error);
        this._sendError(ws, 'Invalid message format');
      }
    });
    
    // Handle pong for heartbeat
    ws.on('pong', () => {
      const client = this.clients.get(ws);
      if (client) {
        client.isAlive = true;
      }
    });
    
    // Handle close
    ws.on('close', () => {
      this._handleDisconnect(ws);
    });
    
    // Handle error
    ws.on('error', (error) => {
      this.logger.error('[WebSocket] Connection error:', error);
    });
    
    // Send welcome message
    this._send(ws, {
      type: 'welcome',
      clientId: clientId,
      message: 'Connected to new-soundboard WebSocket'
    });
  }
  
  /**
   * Handle WebSocket message
   */
  _handleMessage(ws, message) {
    const client = this.clients.get(ws);
    if (!client) {
      return;
    }
    
    const { type, ...payload } = message;
    
    switch (type) {
      case 'hello':
        this._handleHello(ws, payload);
        break;
      
      case 'ping':
        this._send(ws, { type: 'pong', timestamp: Date.now() });
        break;
      
      default:
        this.logger.warn(`[WebSocket] Unknown message type: ${type}`);
    }
  }
  
  /**
   * Handle hello message (client registration)
   */
  _handleHello(ws, payload) {
    const client = this.clients.get(ws);
    if (!client) {
      return;
    }
    
    const { client: clientType, userId } = payload;
    
    // Validate client type
    if (!isValidClientType(clientType)) {
      this._sendError(ws, 'Invalid client type');
      return;
    }
    
    // Update client info
    client.type = clientType;
    client.userId = userId ? sanitizeUserId(userId) : null;
    
    this.logger.info(`[WebSocket] Client registered: ${client.id} as ${clientType}${userId ? ` (user: ${userId})` : ''}`);
    
    // Send confirmation
    this._send(ws, {
      type: 'hello-ack',
      clientId: client.id,
      clientType: clientType
    });
  }
  
  /**
   * Handle disconnect
   */
  _handleDisconnect(ws) {
    const client = this.clients.get(ws);
    if (client) {
      this.logger.info(`[WebSocket] Client disconnected: ${client.id}`);
      this.clients.delete(ws);
    }
  }
  
  /**
   * Send message to a specific client
   */
  _send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        this.logger.error('[WebSocket] Failed to send message:', error);
      }
    }
  }
  
  /**
   * Send error message to client
   */
  _sendError(ws, error) {
    this._send(ws, {
      type: 'error',
      error: error
    });
  }
  
  /**
   * Broadcast message to all clients of specific type(s)
   * @param {string|Array<string>} clientTypes - Client type(s) to broadcast to
   * @param {Object} message - Message to broadcast
   */
  broadcast(clientTypes, message) {
    const types = Array.isArray(clientTypes) ? clientTypes : [clientTypes];
    let sentCount = 0;
    
    this.clients.forEach((client) => {
      if (client.type && types.includes(client.type)) {
        this._send(client.ws, message);
        sentCount++;
      }
    });
    
    this.logger.debug(`[WebSocket] Broadcast to ${sentCount} clients (types: ${types.join(', ')})`);
  }
  
  /**
   * Broadcast to all connected clients
   * @param {Object} message - Message to broadcast
   */
  broadcastAll(message) {
    let sentCount = 0;
    
    this.clients.forEach((client) => {
      this._send(client.ws, message);
      sentCount++;
    });
    
    this.logger.debug(`[WebSocket] Broadcast to all ${sentCount} clients`);
  }
  
  /**
   * Send message to specific user
   * @param {string} userId - User ID
   * @param {Object} message - Message to send
   */
  sendToUser(userId, message) {
    let sentCount = 0;
    
    this.clients.forEach((client) => {
      if (client.userId === userId) {
        this._send(client.ws, message);
        sentCount++;
      }
    });
    
    this.logger.debug(`[WebSocket] Sent to user ${userId} (${sentCount} connections)`);
  }
  
  /**
   * Get connected clients statistics
   */
  getStats() {
    const stats = {
      total: this.clients.size,
      byType: {}
    };
    
    this.clients.forEach((client) => {
      const type = client.type || 'unregistered';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    });
    
    return stats;
  }
  
  /**
   * Start heartbeat to detect dead connections
   */
  _startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(() => {
      this.clients.forEach((client, ws) => {
        if (!client.isAlive) {
          this.logger.warn(`[WebSocket] Terminating dead connection: ${client.id}`);
          ws.terminate();
          this.clients.delete(ws);
          return;
        }
        
        client.isAlive = false;
        ws.ping();
      });
    }, this.heartbeatInterval);
  }
  
  /**
   * Generate unique client ID
   */
  _generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Cleanup and close all connections
   */
  destroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    if (this.wss) {
      this.clients.forEach((client, ws) => {
        ws.close(1000, 'Server shutting down');
      });
      
      this.wss.close(() => {
        this.logger.info('[WebSocket] Server closed');
      });
    }
    
    this.clients.clear();
  }
}

module.exports = WebSocketWrapper;
