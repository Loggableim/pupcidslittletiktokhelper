const { chromium } = require('playwright');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

/**
 * BrowserController - Manages Playwright Chromium instances
 * Controls browser lifecycle, DOM monitoring, and command execution
 */
class BrowserController extends EventEmitter {
    constructor(sessionId, options = {}) {
        super();
        this.sessionId = sessionId;
        this.options = {
            headless: options.headless || false,
            userDataDir: options.userDataDir || null,
            ...options
        };
        
        this.browser = null;
        this.context = null;
        this.page = null;
        this.isRunning = false;
        this.observers = new Map();
        this.cookies = options.cookies || null;
        this.username = options.username || null;
        
        // Auto-restart configuration
        this.shouldRestart = options.autoRestart !== false;
        this.crashCount = 0;
        this.maxCrashes = 3;
    }

    /**
     * Start browser instance
     */
    async start() {
        if (this.isRunning) {
            throw new Error('Browser already running');
        }

        try {
            // Create user data directory if needed for cookie isolation
            const userDataDir = this.options.userDataDir || 
                path.join(__dirname, '../../data/ghoststream/profiles', this.sessionId);
            
            if (!fs.existsSync(userDataDir)) {
                fs.mkdirSync(userDataDir, { recursive: true });
            }

            // Launch browser
            this.browser = await chromium.launch({
                headless: this.options.headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-blink-features=AutomationControlled'
                ]
            });

            // Create browser context with cookies if provided
            const contextOptions = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1920, height: 1080 }
            };

            this.context = await this.browser.newContext(contextOptions);

            // Inject cookies if provided
            if (this.cookies) {
                await this.context.addCookies(this.cookies);
            }

            // Create page
            this.page = await this.context.newPage();
            
            // Setup page event listeners
            this.setupPageListeners();

            this.isRunning = true;
            this.emit('started', { sessionId: this.sessionId });

            console.log(`✅ Browser started for session ${this.sessionId}`);
            
            return true;
        } catch (error) {
            console.error(`❌ Failed to start browser for session ${this.sessionId}:`, error);
            this.emit('error', { type: 'start_failed', error: error.message });
            throw error;
        }
    }

    /**
     * Setup page event listeners
     */
    setupPageListeners() {
        if (!this.page) return;

        // Handle console messages
        this.page.on('console', msg => {
            this.emit('console', { 
                type: msg.type(), 
                text: msg.text() 
            });
        });

        // Handle page errors
        this.page.on('pageerror', error => {
            this.emit('page_error', { 
                error: error.message,
                stack: error.stack 
            });
        });

        // Handle crashes
        this.page.on('crash', () => {
            console.error(`💥 Page crashed for session ${this.sessionId}`);
            this.crashCount++;
            this.emit('crash', { crashCount: this.crashCount });
            
            if (this.shouldRestart && this.crashCount < this.maxCrashes) {
                setTimeout(() => this.restart(), 5000);
            }
        });

        // Handle dialog (alert, confirm, prompt)
        this.page.on('dialog', async dialog => {
            this.emit('dialog', {
                type: dialog.type(),
                message: dialog.message()
            });
            await dialog.dismiss();
        });
    }

    /**
     * Navigate to TikTok LIVE
     */
    async navigateToTikTok(username) {
        if (!this.page) {
            throw new Error('Browser not started');
        }

        try {
            const url = `https://www.tiktok.com/@${username}/live`;
            console.log(`🌐 Navigating to ${url}...`);
            
            await this.page.goto(url, { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });

            // Wait for page to stabilize
            await this.page.waitForTimeout(2000);

            // Check if logged in
            const isLoggedIn = await this.checkLoginStatus();
            
            if (!isLoggedIn) {
                this.emit('login_required', { username });
                console.log(`🔐 Login required for session ${this.sessionId}`);
            } else {
                console.log(`✅ Already logged in for session ${this.sessionId}`);
                // Start monitoring chat
                await this.startChatMonitoring();
            }

            return { success: true, loggedIn: isLoggedIn };
        } catch (error) {
            console.error(`❌ Navigation error:`, error);
            this.emit('error', { type: 'navigation_failed', error: error.message });
            throw error;
        }
    }

    /**
     * Check if user is logged in to TikTok
     */
    async checkLoginStatus() {
        if (!this.page) return false;

        try {
            // Check for login indicators
            // TikTok shows login button when not logged in
            const loginButton = await this.page.$('button[data-e2e="top-login-button"]');
            return loginButton === null;
        } catch (error) {
            return false;
        }
    }

    /**
     * Start monitoring TikTok chat
     */
    async startChatMonitoring() {
        if (!this.page) {
            throw new Error('Browser not started');
        }

        try {
            // Inject chat monitoring script
            await this.page.evaluate(() => {
                // Create MutationObserver for chat
                const chatObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1) { // Element node
                                // Try to extract chat message
                                const chatItem = node.querySelector('[data-e2e="chat-item"]') || 
                                               (node.matches && node.matches('[data-e2e="chat-item"]') ? node : null);
                                
                                if (chatItem) {
                                    try {
                                        const username = chatItem.querySelector('[data-e2e="chat-username"]')?.textContent || 'Unknown';
                                        const message = chatItem.querySelector('[data-e2e="chat-content"]')?.textContent || '';
                                        
                                        // Emit custom event that we can listen to
                                        window.dispatchEvent(new CustomEvent('tiktok-chat-message', {
                                            detail: { username, message, timestamp: Date.now() }
                                        }));
                                    } catch (e) {
                                        console.error('Error parsing chat:', e);
                                    }
                                }

                                // Try to extract gift
                                const giftItem = node.querySelector('[data-e2e="gift-item"]') ||
                                               (node.matches && node.matches('[data-e2e="gift-item"]') ? node : null);
                                
                                if (giftItem) {
                                    try {
                                        const username = giftItem.querySelector('[data-e2e="gift-sender"]')?.textContent || 'Unknown';
                                        const giftName = giftItem.querySelector('[data-e2e="gift-name"]')?.textContent || 'Unknown Gift';
                                        
                                        window.dispatchEvent(new CustomEvent('tiktok-gift', {
                                            detail: { username, giftName, timestamp: Date.now() }
                                        }));
                                    } catch (e) {
                                        console.error('Error parsing gift:', e);
                                    }
                                }
                            }
                        });
                    });
                });

                // Find chat container
                const chatContainer = document.querySelector('[data-e2e="live-chat-container"]') ||
                                    document.querySelector('[class*="chat"]');
                
                if (chatContainer) {
                    chatObserver.observe(chatContainer, {
                        childList: true,
                        subtree: true
                    });
                    console.log('✅ Chat monitoring started');
                } else {
                    console.warn('⚠️  Chat container not found');
                }
            });

            // Listen for custom events from page
            await this.page.exposeFunction('emitChatMessage', (data) => {
                this.emit('chat_message', data);
            });

            await this.page.exposeFunction('emitGift', (data) => {
                this.emit('gift', data);
            });

            // Bind page events to exposed functions
            await this.page.evaluate(() => {
                window.addEventListener('tiktok-chat-message', (e) => {
                    window.emitChatMessage(e.detail);
                });

                window.addEventListener('tiktok-gift', (e) => {
                    window.emitGift(e.detail);
                });
            });

            console.log(`✅ Chat monitoring active for session ${this.sessionId}`);
        } catch (error) {
            console.error(`❌ Failed to start chat monitoring:`, error);
            this.emit('error', { type: 'monitoring_failed', error: error.message });
            throw error;
        }
    }

    /**
     * Execute command in browser
     */
    async executeCommand(command) {
        if (!this.page) {
            throw new Error('Browser not started');
        }

        const { type, selector, value, code } = command;

        try {
            switch (type) {
                case 'click':
                    await this.page.click(selector);
                    return { success: true, type: 'click', selector };

                case 'type':
                    await this.page.fill(selector, value);
                    return { success: true, type: 'type', selector, value };

                case 'press':
                    await this.page.press(selector, value);
                    return { success: true, type: 'press', selector, key: value };

                case 'screenshot':
                    const screenshot = await this.page.screenshot({ 
                        type: 'png',
                        encoding: 'base64'
                    });
                    return { success: true, type: 'screenshot', data: screenshot };

                case 'execute':
                    const result = await this.page.evaluate(code);
                    return { success: true, type: 'execute', result };

                default:
                    throw new Error(`Unknown command type: ${type}`);
            }
        } catch (error) {
            console.error(`❌ Command execution failed:`, error);
            throw error;
        }
    }

    /**
     * Get page screenshot
     */
    async getScreenshot() {
        if (!this.page) {
            throw new Error('Browser not started');
        }

        return await this.page.screenshot({ 
            type: 'png',
            encoding: 'base64'
        });
    }

    /**
     * Restart browser
     */
    async restart() {
        console.log(`🔄 Restarting browser for session ${this.sessionId}...`);
        
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.start();
        
        if (this.username) {
            await this.navigateToTikTok(this.username);
        }
    }

    /**
     * Stop browser instance
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        try {
            this.observers.clear();
            
            if (this.page) {
                await this.page.close().catch(() => {});
            }
            
            if (this.context) {
                await this.context.close().catch(() => {});
            }
            
            if (this.browser) {
                await this.browser.close().catch(() => {});
            }

            this.page = null;
            this.context = null;
            this.browser = null;
            this.isRunning = false;

            this.emit('stopped', { sessionId: this.sessionId });
            console.log(`✅ Browser stopped for session ${this.sessionId}`);
        } catch (error) {
            console.error(`❌ Error stopping browser:`, error);
            this.emit('error', { type: 'stop_failed', error: error.message });
        }
    }
}

module.exports = BrowserController;
