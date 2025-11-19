/**
 * MyInstants API Adapter
 * 
 * This module provides a wrapper around the MyInstants website API.
 * Since there's no official npm package, we implement the functionality
 * based on the web API structure.
 * 
 * Features:
 * - Search for sound instants
 * - Get instant by ID/slug
 * - Resolve audio URLs
 * - Caching with LRU and TTL
 * - Circuit breaker for API resilience
 */

const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class MyInstantsAdapter {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://www.myinstants.com';
    this.cacheDir = options.cacheDir || path.join(__dirname, '../../.cache/myinstants');
    this.cacheTTL = options.cacheTTL || 24 * 60 * 60 * 1000; // 24 hours
    this.maxCacheSize = options.maxCacheSize || 100 * 1024 * 1024; // 100MB
    this.timeout = options.timeout || 10000;
    this.logger = options.logger || console;
    
    // Circuit breaker state
    this.circuitState = 'closed'; // closed, open, half-open
    this.failureCount = 0;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.lastFailureTime = 0;
    
    // Rate limiting
    this.requestQueue = [];
    this.lastRequestTime = 0;
    this.minRequestInterval = options.minRequestInterval || 500; // 500ms between requests
    
    this.init();
  }
  
  async init() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      this.logger.info(`[MyInstants] Cache directory created at ${this.cacheDir}`);
    } catch (error) {
      this.logger.error('[MyInstants] Failed to create cache directory:', error);
    }
  }
  
  /**
   * Search for sound instants
   * @param {string} term - Search term
   * @param {number} page - Page number (default: 1)
   * @returns {Promise<Array>} Array of instant objects
   */
  async search(term, page = 1) {
    if (!term || term.trim().length === 0) {
      throw new Error('Search term cannot be empty');
    }
    
    // Check circuit breaker
    if (!this._canMakeRequest()) {
      throw new Error('MyInstants API circuit breaker is open');
    }
    
    // Rate limiting
    await this._throttle();
    
    try {
      const url = `${this.baseUrl}/search/?name=${encodeURIComponent(term)}&page=${page}`;
      this.logger.debug(`[MyInstants] Searching: ${url}`);
      
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TikTokStreamTool/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      
      const $ = cheerio.load(response.data);
      const results = [];
      
      $('.instant').each((i, elem) => {
        const $elem = $(elem);
        const instantLink = $elem.find('.instant-link');
        const playButton = $elem.find('.small-button');
        
        const name = instantLink.text().trim();
        const href = instantLink.attr('href');
        const slug = href ? href.replace('/instant/', '').replace('/', '') : null;
        const onclickAttr = playButton.attr('onclick');
        
        let audioPath = null;
        if (onclickAttr) {
          const match = onclickAttr.match(/play\('([^']+)'/);
          if (match) {
            audioPath = match[1];
          }
        }
        
        if (name && slug) {
          results.push({
            name,
            slug,
            url: `${this.baseUrl}/instant/${slug}/`,
            audioPath: audioPath,
            licenseStatus: 'unknown' // MyInstants doesn't provide license info
          });
        }
      });
      
      this._recordSuccess();
      this.logger.info(`[MyInstants] Found ${results.length} results for "${term}"`);
      
      return results;
    } catch (error) {
      this._recordFailure();
      this.logger.error('[MyInstants] Search failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Get instant by ID/slug
   * @param {string} id - Instant slug or ID
   * @returns {Promise<Object>} Instant object
   */
  async getInstantById(id) {
    if (!id || id.trim().length === 0) {
      throw new Error('Instant ID cannot be empty');
    }
    
    // Check circuit breaker
    if (!this._canMakeRequest()) {
      throw new Error('MyInstants API circuit breaker is open');
    }
    
    // Check cache first
    const cached = await this._getCached(id);
    if (cached) {
      this.logger.debug(`[MyInstants] Cache hit for ${id}`);
      return cached;
    }
    
    // Rate limiting
    await this._throttle();
    
    try {
      const url = `${this.baseUrl}/instant/${id}/`;
      this.logger.debug(`[MyInstants] Fetching instant: ${url}`);
      
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TikTokStreamTool/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      
      const $ = cheerio.load(response.data);
      const name = $('.instant-page-title').text().trim() || id;
      const playButton = $('.small-button[onclick*="play"]');
      const onclickAttr = playButton.attr('onclick');
      
      let audioPath = null;
      if (onclickAttr) {
        const match = onclickAttr.match(/play\('([^']+)'/);
        if (match) {
          audioPath = match[1];
        }
      }
      
      const instant = {
        name,
        slug: id,
        url: `${this.baseUrl}/instant/${id}/`,
        audioPath: audioPath,
        licenseStatus: 'unknown'
      };
      
      // Cache the result
      await this._setCached(id, instant);
      
      this._recordSuccess();
      this.logger.info(`[MyInstants] Retrieved instant: ${name}`);
      
      return instant;
    } catch (error) {
      this._recordFailure();
      this.logger.error('[MyInstants] Get instant failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Resolve audio URL for an instant
   * @param {Object} instant - Instant object from search or getInstantById
   * @returns {Promise<string|null>} Direct audio URL or null if unavailable
   */
  async resolveAudioUrl(instant) {
    if (!instant || !instant.audioPath) {
      this.logger.warn('[MyInstants] No audio path available for instant');
      return null;
    }
    
    try {
      // MyInstants audio files are typically hosted on their CDN
      // The audioPath is relative, we need to construct the full URL
      let audioUrl;
      
      if (instant.audioPath.startsWith('http')) {
        audioUrl = instant.audioPath;
      } else if (instant.audioPath.startsWith('//')) {
        audioUrl = 'https:' + instant.audioPath;
      } else {
        audioUrl = this.baseUrl + instant.audioPath;
      }
      
      // Validate the URL by making a HEAD request
      const headResponse = await axios.head(audioUrl, {
        timeout: this.timeout,
        validateStatus: (status) => status === 200 || status === 206
      });
      
      const contentType = headResponse.headers['content-type'];
      if (!contentType || !contentType.includes('audio')) {
        this.logger.warn(`[MyInstants] Invalid content type: ${contentType}`);
        return null;
      }
      
      this.logger.info(`[MyInstants] Resolved audio URL: ${audioUrl}`);
      return audioUrl;
    } catch (error) {
      this.logger.error('[MyInstants] Failed to resolve audio URL:', error.message);
      return null;
    }
  }
  
  /**
   * Circuit breaker: check if requests are allowed
   */
  _canMakeRequest() {
    const now = Date.now();
    
    if (this.circuitState === 'open') {
      // Check if we should transition to half-open
      if (now - this.lastFailureTime >= this.resetTimeout) {
        this.circuitState = 'half-open';
        this.logger.info('[MyInstants] Circuit breaker transitioning to half-open');
        return true;
      }
      return false;
    }
    
    return true;
  }
  
  /**
   * Record successful request
   */
  _recordSuccess() {
    if (this.circuitState === 'half-open') {
      this.circuitState = 'closed';
      this.failureCount = 0;
      this.logger.info('[MyInstants] Circuit breaker closed');
    }
  }
  
  /**
   * Record failed request
   */
  _recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.circuitState = 'open';
      this.logger.error('[MyInstants] Circuit breaker opened due to failures');
    }
  }
  
  /**
   * Rate limiting throttle
   */
  async _throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
  
  /**
   * Get cached instant
   */
  async _getCached(id) {
    try {
      const cacheKey = this._getCacheKey(id);
      const cachePath = path.join(this.cacheDir, cacheKey);
      
      const stat = await fs.stat(cachePath);
      const age = Date.now() - stat.mtimeMs;
      
      if (age > this.cacheTTL) {
        // Cache expired
        await fs.unlink(cachePath);
        return null;
      }
      
      const data = await fs.readFile(cachePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // Cache miss
      return null;
    }
  }
  
  /**
   * Set cached instant
   */
  async _setCached(id, instant) {
    try {
      const cacheKey = this._getCacheKey(id);
      const cachePath = path.join(this.cacheDir, cacheKey);
      
      await fs.writeFile(cachePath, JSON.stringify(instant), 'utf8');
      
      // Check cache size and cleanup if needed
      await this._cleanupCache();
    } catch (error) {
      this.logger.error('[MyInstants] Failed to cache instant:', error.message);
    }
  }
  
  /**
   * Generate cache key
   */
  _getCacheKey(id) {
    return crypto.createHash('md5').update(id).digest('hex') + '.json';
  }
  
  /**
   * Cleanup cache if it exceeds max size
   */
  async _cleanupCache() {
    try {
      const files = await fs.readdir(this.cacheDir);
      let totalSize = 0;
      const fileStats = [];
      
      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stat = await fs.stat(filePath);
        totalSize += stat.size;
        fileStats.push({ path: filePath, size: stat.size, mtime: stat.mtimeMs });
      }
      
      if (totalSize > this.maxCacheSize) {
        // Sort by modification time (oldest first)
        fileStats.sort((a, b) => a.mtime - b.mtime);
        
        // Delete oldest files until we're under the limit
        let deletedSize = 0;
        for (const file of fileStats) {
          if (totalSize - deletedSize <= this.maxCacheSize) {
            break;
          }
          await fs.unlink(file.path);
          deletedSize += file.size;
          this.logger.debug(`[MyInstants] Deleted cache file: ${file.path}`);
        }
        
        this.logger.info(`[MyInstants] Cache cleanup: deleted ${deletedSize} bytes`);
      }
    } catch (error) {
      this.logger.error('[MyInstants] Cache cleanup failed:', error.message);
    }
  }
  
  /**
   * Get adapter statistics
   */
  getStats() {
    return {
      circuitState: this.circuitState,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

module.exports = MyInstantsAdapter;
