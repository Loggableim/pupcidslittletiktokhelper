/**
 * Fetch Utilities with Security Limits
 * 
 * This module provides secure fetch functions with timeout, size limits,
 * and content validation.
 */

const axios = require('axios');
const { isAllowedHost } = require('./validators');

/**
 * Fetch with size and timeout limits
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Buffer>} Response data
 */
async function fetchWithLimit(url, options = {}) {
  const {
    timeout = 10000,
    maxBytes = 10 * 1024 * 1024, // 10MB default
    allowedHosts = [],
    validateContentType = null,
    logger = console
  } = options;
  
  // Validate URL
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL');
  }
  
  // Check if host is allowed
  if (allowedHosts.length > 0 && !isAllowedHost(url, allowedHosts)) {
    throw new Error(`Host not allowed: ${new URL(url).hostname}`);
  }
  
  try {
    // Make request with streaming to check size
    const response = await axios.get(url, {
      timeout,
      responseType: 'stream',
      maxRedirects: 5,
      validateStatus: (status) => status === 200,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TikTokStreamTool/1.0)'
      }
    });
    
    // Check content type if validator provided
    if (validateContentType) {
      const contentType = response.headers['content-type'];
      if (!validateContentType(contentType)) {
        response.data.destroy();
        throw new Error(`Invalid content type: ${contentType}`);
      }
    }
    
    // Check content length if available
    const contentLength = parseInt(response.headers['content-length'], 10);
    if (contentLength && contentLength > maxBytes) {
      response.data.destroy();
      throw new Error(`Content too large: ${contentLength} bytes (max: ${maxBytes})`);
    }
    
    // Download with size check
    return new Promise((resolve, reject) => {
      const chunks = [];
      let downloadedBytes = 0;
      
      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        
        if (downloadedBytes > maxBytes) {
          response.data.destroy();
          reject(new Error(`Download exceeded size limit: ${downloadedBytes} bytes (max: ${maxBytes})`));
          return;
        }
        
        chunks.push(chunk);
      });
      
      response.data.on('end', () => {
        const buffer = Buffer.concat(chunks);
        logger.debug(`[FetchLimit] Downloaded ${downloadedBytes} bytes from ${url}`);
        resolve(buffer);
      });
      
      response.data.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Fetch JSON with limits
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Parsed JSON response
 */
async function fetchJsonWithLimit(url, options = {}) {
  const buffer = await fetchWithLimit(url, {
    ...options,
    validateContentType: (contentType) => {
      return contentType && (
        contentType.includes('application/json') ||
        contentType.includes('text/json')
      );
    }
  });
  
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new Error('Failed to parse JSON response');
  }
}

/**
 * Check if URL is accessible (HEAD request)
 * @param {string} url - URL to check
 * @param {Object} options - Options
 * @returns {Promise<Object>} Response headers
 */
async function checkUrlAccessibility(url, options = {}) {
  const {
    timeout = 5000,
    allowedHosts = [],
    logger = console
  } = options;
  
  // Validate URL
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL');
  }
  
  // Check if host is allowed
  if (allowedHosts.length > 0 && !isAllowedHost(url, allowedHosts)) {
    throw new Error(`Host not allowed: ${new URL(url).hostname}`);
  }
  
  try {
    const response = await axios.head(url, {
      timeout,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TikTokStreamTool/1.0)'
      }
    });
    
    logger.debug(`[CheckURL] ${url} is accessible`);
    
    return {
      accessible: true,
      contentType: response.headers['content-type'],
      contentLength: response.headers['content-length'],
      headers: response.headers
    };
  } catch (error) {
    logger.debug(`[CheckURL] ${url} is not accessible: ${error.message}`);
    
    return {
      accessible: false,
      error: error.message
    };
  }
}

module.exports = {
  fetchWithLimit,
  fetchJsonWithLimit,
  checkUrlAccessibility
};
