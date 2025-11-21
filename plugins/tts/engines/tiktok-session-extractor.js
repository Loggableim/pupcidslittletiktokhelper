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
        this.LOGIN_TIMEOUT_MS = 30000; // 30 seconds
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
     * Extract SessionID from TikTok using headless browser
     * @private
     */
    async _extractSessionId() {
        try {
            // Launch headless browser
            this.browser = await puppeteer.launch({
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
            });

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
                this.logger.info('💡 Opening TikTok in visible browser for login...');
                
                // Close headless browser and open visible one for login
                await this.browser.close();
                this.browser = null;
                this.page = null;
                
                // Launch visible browser for user to log in
                this.browser = await puppeteer.launch({
                    headless: false, // Visible browser
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });

                this.page = await this.browser.newPage();
                await this.page.setViewport(this.VIEWPORT);
                await this.page.setUserAgent(this.USER_AGENT);
                
                await this.page.goto('https://www.tiktok.com', {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });

                this.logger.info(`⏳ Waiting for login... (${this.LOGIN_TIMEOUT_MS / 1000} seconds)`);
                this.logger.info('   Please log in to TikTok in the browser window');
                
                // Wait for login
                await this._waitForSessionId(this.LOGIN_TIMEOUT_MS);
                
                // Get cookies after login
                const newCookies = await this.page.cookies();
                sessionCookie = newCookies.find(c => c.name === 'sessionid');
                
                // Save cookies for future use
                if (newCookies.length > 0) {
                    await this._saveCookies(newCookies);
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
     * @private
     */
    async _waitForSessionId(timeout = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const cookies = await this.page.cookies();
            const sessionCookie = cookies.find(c => c.name === 'sessionid');
            
            if (sessionCookie && sessionCookie.value) {
                this.logger.info('✅ Login detected!');
                return true;
            }
            
            // Wait 1 second before checking again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        this.logger.warn('⏱️  Timeout waiting for login');
        return false;
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
