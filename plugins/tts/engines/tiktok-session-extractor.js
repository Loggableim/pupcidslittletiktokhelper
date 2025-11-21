const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

/**
 * TikTok SessionID Auto-Extractor
 * Automatically extracts SessionID from TikTok by launching a headless browser
 * 
 * This provides a better user experience than manual cookie extraction:
 * 1. Opens TikTok in headless browser
 * 2. Waits for user to log in (or uses saved cookies)
 * 3. Automatically extracts sessionid from cookies
 * 4. Saves for future use
 */
class TikTokSessionExtractor {
    constructor(logger = console) {
        this.logger = logger;
        this.cookiesPath = path.join(__dirname, '.tiktok-cookies.json');
        this.sessionIdPath = path.join(__dirname, '.tiktok-sessionid');
        this.browser = null;
        this.page = null;
        
        // Constants
        this.USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
        this.VIEWPORT = { width: 1920, height: 1080 };
    }

    /**
     * Get SessionID - tries saved first, then extracts if needed
     * @param {boolean} forceRefresh - Force re-extraction even if saved SessionID exists
     * @returns {Promise<string|null>} SessionID or null if extraction failed
     */
    async getSessionId(forceRefresh = false) {
        try {
            // Try to load saved SessionID first
            if (!forceRefresh) {
                const savedSessionId = await this._loadSavedSessionId();
                if (savedSessionId) {
                    this.logger.info('✅ Using saved TikTok SessionID');
                    return savedSessionId;
                }
            }

            // Extract fresh SessionID
            this.logger.info('🔄 Extracting fresh TikTok SessionID...');
            const sessionId = await this._extractSessionId();
            
            if (sessionId) {
                await this._saveSessionId(sessionId);
                this.logger.info('✅ TikTok SessionID extracted and saved successfully');
                return sessionId;
            } else {
                this.logger.error('❌ Failed to extract TikTok SessionID');
                return null;
            }
        } catch (error) {
            this.logger.error(`❌ SessionID extraction error: ${error.message}`);
            return null;
        }
    }

    /**
     * Get the executable path for the user's default Chrome/Chromium browser
     * @private
     */
    _getChromePath() {
        const { execSync } = require('child_process');
        const os = require('os');
        const fs = require('fs');
        
        // Common Chrome/Chromium paths
        const possiblePaths = [];
        
        if (os.platform() === 'win32') {
            // Windows paths
            possiblePaths.push(
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
                `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
                `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`
            );
        } else if (os.platform() === 'darwin') {
            // macOS paths
            possiblePaths.push(
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Chromium.app/Contents/MacOS/Chromium'
            );
        } else {
            // Linux paths
            possiblePaths.push(
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/snap/bin/chromium'
            );
        }
        
        // Find first existing path
        for (const path of possiblePaths) {
            if (path && fs.existsSync(path)) {
                this.logger.info(`🔍 Found Chrome at: ${path}`);
                return path;
            }
        }
        
        this.logger.warn('⚠️  Chrome not found, using Puppeteer default (might be Edge on Windows)');
        return null; // Let Puppeteer use its default
    }

    /**
     * Extract SessionID from TikTok using headless browser
     * @private
     */
    async _extractSessionId() {
        try {
            const chromePath = this._getChromePath();
            
            // Launch headless browser with user's Chrome if available
            const launchOptions = {
                headless: 'new', // Use new headless mode
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            };
            
            if (chromePath) {
                launchOptions.executablePath = chromePath;
                this.logger.info('🚀 Using system Chrome browser');
            } else {
                this.logger.info('🚀 Using Puppeteer default browser');
            }
            
            this.browser = await puppeteer.launch(launchOptions);

            this.page = await this.browser.newPage();

            // Set a realistic viewport and user agent
            await this.page.setViewport(this.VIEWPORT);
            await this.page.setUserAgent(this.USER_AGENT);

            // Try to load saved cookies first
            const savedCookies = await this._loadSavedCookies();
            if (savedCookies && savedCookies.length > 0) {
                this.logger.info('📂 Loading saved TikTok cookies...');
                await this.page.setCookie(...savedCookies);
            }

            // Navigate to TikTok
            this.logger.info('🌐 Opening TikTok...');
            await this.page.goto('https://www.tiktok.com', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Check if we're already logged in
            const cookies = await this.page.cookies();
            let sessionCookie = cookies.find(c => c.name === 'sessionid');

            if (!sessionCookie || !sessionCookie.value) {
                this.logger.warn('⚠️  Not logged in to TikTok. Please log in manually.');
                this.logger.info('💡 Opening TikTok in browser for login...');
                
                // Close headless browser and open visible one for login
                await this.browser.close();
                this.browser = null;
                this.page = null;
                
                // Launch visible browser for user to log in
                const visibleLaunchOptions = {
                    headless: false, // Visible browser
                    args: ['--no-sandbox', '--disable-setuid-sandbox'],
                    defaultViewport: null // Use full window size
                };
                
                if (chromePath) {
                    visibleLaunchOptions.executablePath = chromePath;
                    this.logger.info('🌐 Opening your default Chrome browser for login...');
                } else {
                    this.logger.info('🌐 Opening browser for login...');
                }
                
                this.browser = await puppeteer.launch(visibleLaunchOptions);

                this.page = await this.browser.newPage();
                await this.page.setUserAgent(this.USER_AGENT);
                
                this.logger.info('🌐 Loading TikTok login page...');
                await this.page.goto('https://www.tiktok.com', {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });

                this.logger.info('📋 Please complete the following steps:');
                this.logger.info('   1. Log in to your TikTok account in the browser window');
                this.logger.info('   2. Complete any verification steps if required');
                this.logger.info('   3. Wait for automatic detection (browser will close automatically)');
                this.logger.info('');
                this.logger.info('⚠️  Do NOT close the browser window manually!');
                
                // Wait indefinitely for login (no timeout)
                await this._waitForSessionId();
                
                // Get cookies after login
                const newCookies = await this.page.cookies();
                sessionCookie = newCookies.find(c => c.name === 'sessionid');
                
                // Save cookies for future use
                if (newCookies.length > 0) {
                    await this._saveCookies(newCookies);
                    this.logger.info('💾 Cookies saved for future auto-login');
                }
            }

            await this.browser.close();
            this.browser = null;
            this.page = null;

            if (sessionCookie && sessionCookie.value) {
                return sessionCookie.value;
            } else {
                return null;
            }
        } catch (error) {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
            }
            throw error;
        }
    }

    /**
     * Wait for sessionid cookie to appear (user logs in)
     * Checks continuously without timeout - waits until user actually logs in
     * @private
     */
    async _waitForSessionId() {
        this.logger.info('⏳ Waiting for you to log in to TikTok...');
        this.logger.info('💡 After logging in, the SessionID will be detected automatically');
        
        let checkCount = 0;
        
        while (true) {
            try {
                const cookies = await this.page.cookies();
                const sessionCookie = cookies.find(c => c.name === 'sessionid');
                
                if (sessionCookie && sessionCookie.value && sessionCookie.value.length > 10) {
                    this.logger.info('✅ Login detected! SessionID found');
                    return true;
                }
                
                // Show progress every 10 checks (10 seconds)
                checkCount++;
                if (checkCount % 10 === 0) {
                    this.logger.info(`⏳ Still waiting for login... (${checkCount} seconds elapsed)`);
                }
                
                // Wait 1 second before checking again
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                this.logger.error(`Error checking for SessionID: ${error.message}`);
                // Continue waiting despite errors
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    /**
     * Load saved SessionID from file
     * @private
     */
    async _loadSavedSessionId() {
        try {
            const sessionId = await fs.readFile(this.sessionIdPath, 'utf8');
            if (sessionId && sessionId.trim().length > 0) {
                return sessionId.trim();
            }
        } catch (error) {
            // File doesn't exist or can't be read
            return null;
        }
        return null;
    }

    /**
     * Save SessionID to file
     * @private
     */
    async _saveSessionId(sessionId) {
        try {
            await fs.writeFile(this.sessionIdPath, sessionId, 'utf8');
        } catch (error) {
            this.logger.error(`Failed to save SessionID: ${error.message}`);
        }
    }

    /**
     * Load saved cookies from file
     * @private
     */
    async _loadSavedCookies() {
        try {
            const data = await fs.readFile(this.cookiesPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }

    /**
     * Save cookies to file
     * @private
     */
    async _saveCookies(cookies) {
        try {
            await fs.writeFile(this.cookiesPath, JSON.stringify(cookies, null, 2), 'utf8');
        } catch (error) {
            this.logger.error(`Failed to save cookies: ${error.message}`);
        }
    }

    /**
     * Clear saved SessionID and cookies (useful for testing or re-login)
     */
    async clearSaved() {
        try {
            await fs.unlink(this.sessionIdPath).catch(() => {});
            await fs.unlink(this.cookiesPath).catch(() => {});
            this.logger.info('✅ Cleared saved TikTok session data');
        } catch (error) {
            this.logger.error(`Failed to clear saved data: ${error.message}`);
        }
    }
}

module.exports = TikTokSessionExtractor;
