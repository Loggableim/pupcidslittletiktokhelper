/**
 * GhostStream Connector Plugin
 * Alternative TikTok LIVE connection layer using Playwright browser automation
 * Replaces problematic EulerStream API
 */

const BrowserController = require('../../modules/ghoststream/browser-controller');
const SessionManager = require('../../modules/ghoststream/session-manager');
const CommandExecutor = require('../../modules/ghoststream/command-executor');
const crypto = require('crypto');
const path = require('path');

class GhostStreamConnectorPlugin {
    constructor(api) {
        this.api = api;
        this.db = api.getDatabase();
        this.io = api.getSocketIO();
        
        // Initialize session manager
        const jwtSecret = this.api.getConfig('jwtSecret') || this.generateSecret();
        this.sessionManager = new SessionManager({
            jwtSecret,
            sessionTimeout: parseInt(this.api.getConfig('sessionTimeout')) || 3600000,
            maxSessions: parseInt(this.api.getConfig('maxSessions')) || 5
        });

        // Initialize command executor
        const chatCommandsConfig = this.api.getConfig('chatCommands') || {};
        this.commandExecutor = new CommandExecutor({
            commandPrefix: chatCommandsConfig.prefix || '!',
            allowedCommands: chatCommandsConfig.allowedCommands || ['scene', 'tts', 'click'],
            rateLimit: parseInt(this.api.getConfig('commandRateLimit')) || 10,
            rateLimitWindow: parseInt(this.api.getConfig('commandRateLimitWindow')) || 60000
        });

        // Track if GhostStream is active (replaces TikTok connector)
        this.isActive = false;
        this.currentSession = null;

        // Setup event listeners
        this.setupEventListeners();
    }

    async init() {
        this.api.log('GhostStream Connector initializing...');

        // Save JWT secret if not set
        if (!this.api.getConfig('jwtSecret')) {
            this.api.setConfig('jwtSecret', this.generateSecret());
        }

        // Register API routes
        this.registerRoutes();

        // Register WebSocket handlers
        this.registerWebSocketHandlers();

        // Setup command executor handlers
        this.setupCommandHandlers();

        this.api.log('GhostStream Connector initialized successfully');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Session events
        this.sessionManager.on('session:created', ({ sessionId, accountId }) => {
            this.api.log(`Session created: ${sessionId} for account ${accountId}`);
        });

        this.sessionManager.on('session:deleted', ({ sessionId }) => {
            this.api.log(`Session deleted: ${sessionId}`);
        });

        // Command executor events
        this.commandExecutor.on('command:executed', ({ username, commandName, result }) => {
            this.api.log(`Command executed by ${username}: ${commandName}`);
        });

        this.commandExecutor.on('command:error', ({ username, commandName, error }) => {
            this.api.log(`Command error from ${username}: ${commandName} - ${error}`, 'error');
        });
    }

    /**
     * Register API routes
     */
    registerRoutes() {
        // POST /api/ghoststream/connect - Start stream session
        this.api.registerRoute('POST', '/api/ghoststream/connect', async (req, res) => {
            try {
                const { accountId, username, cookies, options = {} } = req.body;

                if (!username) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Username required' 
                    });
                }

                // Create session
                const session = this.sessionManager.createSession(accountId || username, {
                    username,
                    cookies,
                    headless: options.headless !== undefined ? options.headless : 
                              this.api.getConfig('headlessMode'),
                    autoRestart: options.autoRestart !== undefined ? options.autoRestart : 
                                this.api.getConfig('autoRestart')
                });

                // Create browser controller
                const browserController = new BrowserController(session.sessionId, {
                    headless: session.options.headless,
                    autoRestart: session.options.autoRestart,
                    cookies: session.cookies,
                    username: session.username
                });

                // Attach browser controller to session
                this.sessionManager.attachBrowserController(session.sessionId, browserController);

                // Setup browser event listeners
                this.setupBrowserEventListeners(browserController, session.sessionId);

                // Start browser
                await browserController.start();
                await browserController.navigateToTikTok(username);

                this.sessionManager.updateStatus(session.sessionId, 'connected');

                // If this is the first session and plugin is meant to replace TikTok connector
                if (!this.currentSession) {
                    this.currentSession = session.sessionId;
                    this.isActive = true;
                }

                res.json({
                    success: true,
                    sessionId: session.sessionId,
                    token: session.token,
                    overlayUrl: `${req.protocol}://${req.get('host')}/api/ghoststream/overlay/${session.sessionId}`,
                    wsUrl: `ws://${req.get('host')}/ws/ghoststream/${session.sessionId}`
                });
            } catch (error) {
                this.api.log(`Connect error: ${error.message}`, 'error');
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // POST /api/ghoststream/disconnect - Stop session
        this.api.registerRoute('POST', '/api/ghoststream/disconnect', async (req, res) => {
            try {
                const { sessionId } = req.body;

                if (!sessionId) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Session ID required' 
                    });
                }

                await this.sessionManager.deleteSession(sessionId);

                // Clear current session if this was it
                if (this.currentSession === sessionId) {
                    this.currentSession = null;
                    this.isActive = false;
                }

                res.json({ success: true });
            } catch (error) {
                this.api.log(`Disconnect error: ${error.message}`, 'error');
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // GET /api/ghoststream/status/:sessionId - Get session status
        this.api.registerRoute('GET', '/api/ghoststream/status/:sessionId', async (req, res) => {
            try {
                const session = this.sessionManager.getSession(req.params.sessionId);

                if (!session) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'Session not found' 
                    });
                }

                res.json({
                    success: true,
                    session: {
                        sessionId: session.sessionId,
                        accountId: session.accountId,
                        username: session.username,
                        status: session.status,
                        createdAt: session.createdAt,
                        lastActivity: session.lastActivity
                    }
                });
            } catch (error) {
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // GET /api/ghoststream/sessions - List all sessions
        this.api.registerRoute('GET', '/api/ghoststream/sessions', async (req, res) => {
            try {
                const sessions = this.sessionManager.getAllSessions().map(s => ({
                    sessionId: s.sessionId,
                    accountId: s.accountId,
                    username: s.username,
                    status: s.status,
                    createdAt: s.createdAt
                }));

                res.json({ success: true, sessions });
            } catch (error) {
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // POST /api/ghoststream/command - Execute browser command
        this.api.registerRoute('POST', '/api/ghoststream/command', async (req, res) => {
            try {
                const { sessionId, command, token } = req.body;

                if (!sessionId || !command) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Session ID and command required' 
                    });
                }

                // Verify token
                if (token) {
                    const decoded = this.sessionManager.verifyToken(token);
                    if (!decoded || decoded.sessionId !== sessionId) {
                        return res.status(401).json({ 
                            success: false, 
                            error: 'Invalid token' 
                        });
                    }
                }

                const session = this.sessionManager.getSession(sessionId);
                if (!session || !session.browserController) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'Session not found or browser not running' 
                    });
                }

                const result = await session.browserController.executeCommand(command);
                this.sessionManager.updateActivity(sessionId);

                res.json({ success: true, result });
            } catch (error) {
                this.api.log(`Command error: ${error.message}`, 'error');
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // GET /api/ghoststream/overlay/:sessionId - Serve overlay HTML
        this.api.registerRoute('GET', '/api/ghoststream/overlay/:sessionId', async (req, res) => {
            const sessionId = req.params.sessionId;
            const session = this.sessionManager.getSession(sessionId);

            if (!session) {
                return res.status(404).send('Session not found');
            }

            const overlayHtml = this.generateOverlayHtml(sessionId, req.get('host'));
            res.type('html').send(overlayHtml);
        });
    }

    /**
     * Register WebSocket handlers
     */
    registerWebSocketHandlers() {
        // Handle WebSocket connections for GhostStream
        this.io.on('connection', (socket) => {
            socket.on('ghoststream:subscribe', (data) => {
                const { sessionId, token } = data;

                // Verify token if provided
                if (token) {
                    const decoded = this.sessionManager.verifyToken(token);
                    if (!decoded || decoded.sessionId !== sessionId) {
                        socket.emit('ghoststream:error', { error: 'Invalid token' });
                        return;
                    }
                }

                const session = this.sessionManager.getSession(sessionId);
                if (!session) {
                    socket.emit('ghoststream:error', { error: 'Session not found' });
                    return;
                }

                // Join room for this session
                socket.join(`ghoststream:${sessionId}`);
                socket.emit('ghoststream:subscribed', { sessionId });

                this.api.log(`Client subscribed to session ${sessionId}`);
            });
        });
    }

    /**
     * Setup browser event listeners
     */
    setupBrowserEventListeners(browserController, sessionId) {
        // Chat message event
        browserController.on('chat_message', (data) => {
            // Emit to WebSocket subscribers
            this.io.to(`ghoststream:${sessionId}`).emit('ghoststream:chat_message', data);

            // Also emit as TikTok event to maintain compatibility
            this.api.emit('tiktok:chat', {
                uniqueId: data.username,
                comment: data.message,
                timestamp: data.timestamp
            });

            // Try to execute as command
            if (this.api.getConfig('chatCommands.enabled')) {
                this.commandExecutor.parseAndExecute(data.message, data.username)
                    .then(result => {
                        if (result) {
                            this.handleCommandResult(result, browserController, sessionId);
                        }
                    })
                    .catch(err => {
                        this.api.log(`Command execution error: ${err.message}`, 'warn');
                    });
            }
        });

        // Gift event
        browserController.on('gift', (data) => {
            this.io.to(`ghoststream:${sessionId}`).emit('ghoststream:gift', data);

            // Emit as TikTok event
            this.api.emit('tiktok:gift', {
                uniqueId: data.username,
                giftName: data.giftName,
                timestamp: data.timestamp
            });
        });

        // Login required event
        browserController.on('login_required', (data) => {
            this.io.to(`ghoststream:${sessionId}`).emit('ghoststream:login_required', data);
            this.sessionManager.updateStatus(sessionId, 'login_required');
        });

        // Error event
        browserController.on('error', (data) => {
            this.io.to(`ghoststream:${sessionId}`).emit('ghoststream:error', data);
        });

        // Crash event
        browserController.on('crash', (data) => {
            this.io.to(`ghoststream:${sessionId}`).emit('ghoststream:crash', data);
        });
    }

    /**
     * Setup command handlers
     */
    setupCommandHandlers() {
        // Scene switching (requires OBS integration)
        this.commandExecutor.registerCommand('scene', async (args, context) => {
            const sceneName = args.join(' ');
            return { type: 'obs_scene', sceneName };
        });
    }

    /**
     * Handle command execution result
     */
    async handleCommandResult(result, browserController, sessionId) {
        switch (result.type) {
            case 'click':
                await browserController.executeCommand({
                    type: 'click',
                    selector: result.selector
                });
                break;

            case 'tts':
                // Emit TTS event for TTS plugin to handle
                this.api.emit('tiktok:chat', {
                    uniqueId: result.username,
                    comment: result.message,
                    timestamp: Date.now()
                });
                break;

            case 'obs_scene':
                // Emit OBS scene change event
                this.io.emit('obs:scene:change', { sceneName: result.sceneName });
                break;
        }
    }

    /**
     * Generate overlay HTML
     */
    generateOverlayHtml(sessionId, host) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GhostStream Overlay</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: transparent;
            overflow: hidden;
        }
        #alerts {
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        }
        .alert {
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            border-left: 4px solid #00f2ea;
            animation: slideIn 0.3s ease-out;
            pointer-events: none;
        }
        .alert.gift { border-left-color: #ff0050; }
        .alert.follow { border-left-color: #00ff00; }
        @keyframes slideIn {
            from { transform: translateX(-100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        .username { font-weight: bold; color: #00f2ea; }
        .message { margin-top: 5px; }
    </style>
</head>
<body>
    <div id="alerts"></div>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const sessionId = '${sessionId}';
        const socket = io('http://${host}');
        
        socket.on('connect', () => {
            console.log('Connected to GhostStream');
            socket.emit('ghoststream:subscribe', { sessionId });
        });

        socket.on('ghoststream:subscribed', () => {
            console.log('Subscribed to session:', sessionId);
        });

        socket.on('ghoststream:chat_message', (data) => {
            showAlert('chat', data.username, data.message);
        });

        socket.on('ghoststream:gift', (data) => {
            showAlert('gift', data.username, \`sent \${data.giftName}\`);
        });

        socket.on('ghoststream:error', (data) => {
            console.error('GhostStream error:', data.error);
        });

        function showAlert(type, username, message) {
            const alertDiv = document.createElement('div');
            alertDiv.className = \`alert \${type}\`;
            alertDiv.innerHTML = \`
                <div class="username">\${escapeHtml(username)}</div>
                <div class="message">\${escapeHtml(message)}</div>
            \`;
            
            document.getElementById('alerts').appendChild(alertDiv);
            
            setTimeout(() => {
                alertDiv.style.transition = 'opacity 0.3s';
                alertDiv.style.opacity = '0';
                setTimeout(() => alertDiv.remove(), 300);
            }, 5000);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
    }

    /**
     * Generate random secret
     */
    generateSecret() {
        return crypto.randomBytes(32).toString('hex');
    }

    async destroy() {
        this.api.log('GhostStream Connector shutting down...');
        await this.sessionManager.shutdown();
        this.api.log('GhostStream Connector destroyed');
    }
}

module.exports = GhostStreamConnectorPlugin;
