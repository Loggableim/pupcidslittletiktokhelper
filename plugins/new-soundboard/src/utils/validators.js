/**
 * Security Validators and Utilities
 * 
 * This module provides security validation functions for the new soundboard plugin.
 * All inputs must be validated and sanitized before processing.
 */

const path = require('path');
const { URL } = require('url');

/**
 * Validate if a local path is safe (within allowed directory)
 * @param {string} filePath - Path to validate
 * @param {string} baseDir - Base directory to restrict to
 * @returns {boolean} True if path is safe
 */
function isSafeLocalPath(filePath, baseDir) {
  if (!filePath || !baseDir) {
    return false;
  }
  
  try {
    const resolvedPath = path.resolve(baseDir, filePath);
    const resolvedBase = path.resolve(baseDir);
    
    // Check if resolved path starts with base directory
    return resolvedPath.startsWith(resolvedBase);
  } catch (error) {
    return false;
  }
}

/**
 * Validate if a hostname is allowed
 * @param {string} url - URL to check
 * @param {Array<string>} allowedHosts - Array of allowed hostnames
 * @returns {boolean} True if host is allowed
 */
function isAllowedHost(url, allowedHosts = []) {
  if (!url) {
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check exact match or wildcard match
    return allowedHosts.some(allowedHost => {
      const allowed = allowedHost.toLowerCase();
      
      if (allowed === hostname) {
        return true;
      }
      
      // Check wildcard (e.g., *.example.com)
      if (allowed.startsWith('*.')) {
        const domain = allowed.substring(2);
        return hostname.endsWith(domain) || hostname === domain.substring(1);
      }
      
      return false;
    });
  } catch (error) {
    return false;
  }
}

/**
 * Sanitize filename to prevent path traversal
 * @param {string} filename - Filename to sanitize
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
  if (!filename) {
    return '';
  }
  
  // Remove path components
  let sanitized = path.basename(filename);
  
  // Remove dangerous characters
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Prevent hidden files
  if (sanitized.startsWith('.')) {
    sanitized = '_' + sanitized;
  }
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    sanitized = name.substring(0, 255 - ext.length) + ext;
  }
  
  return sanitized;
}

/**
 * Validate source type
 * @param {string} sourceType - Source type to validate
 * @returns {boolean} True if valid
 */
function isValidSourceType(sourceType) {
  const validTypes = ['local', 'myinstants', 'url'];
  return validTypes.includes(sourceType);
}

/**
 * Validate audio file MIME type
 * @param {string} mimeType - MIME type to validate
 * @returns {boolean} True if valid audio type
 */
function isValidAudioMimeType(mimeType) {
  if (!mimeType) {
    return false;
  }
  
  const validTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/ogg',
    'audio/opus',
    'audio/webm',
    'audio/aac',
    'audio/m4a',
    'audio/x-m4a'
  ];
  
  return validTypes.some(type => mimeType.toLowerCase().includes(type));
}

/**
 * Validate file extension
 * @param {string} filename - Filename to validate
 * @returns {boolean} True if valid audio extension
 */
function isValidAudioExtension(filename) {
  if (!filename) {
    return false;
  }
  
  const ext = path.extname(filename).toLowerCase();
  const validExts = ['.mp3', '.wav', '.ogg', '.opus', '.webm', '.aac', '.m4a'];
  
  return validExts.includes(ext);
}

/**
 * Validate volume level
 * @param {number} volume - Volume level (0-100)
 * @returns {boolean} True if valid
 */
function isValidVolume(volume) {
  return typeof volume === 'number' && volume >= 0 && volume <= 100;
}

/**
 * Validate duration
 * @param {number} duration - Duration in milliseconds
 * @param {number} maxDuration - Maximum allowed duration
 * @returns {boolean} True if valid
 */
function isValidDuration(duration, maxDuration = 300000) { // 5 minutes default
  return typeof duration === 'number' && duration > 0 && duration <= maxDuration;
}

/**
 * Validate priority level
 * @param {number} priority - Priority level
 * @returns {boolean} True if valid
 */
function isValidPriority(priority) {
  return typeof priority === 'number' && priority >= 0 && priority <= 10;
}

/**
 * Validate client type
 * @param {string} clientType - Client type
 * @returns {boolean} True if valid
 */
function isValidClientType(clientType) {
  const validTypes = ['dashboard', 'overlay', 'admin'];
  return validTypes.includes(clientType);
}

/**
 * Sanitize user ID
 * @param {string} userId - User ID to sanitize
 * @returns {string} Sanitized user ID
 */
function sanitizeUserId(userId) {
  if (!userId) {
    return '';
  }
  
  // Remove potentially dangerous characters
  return userId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 100);
}

/**
 * Validate API key format
 * @param {string} apiKey - API key to validate
 * @returns {boolean} True if valid format
 */
function isValidApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // Check minimum length and format (alphanumeric + some special chars)
  return apiKey.length >= 32 && /^[a-zA-Z0-9_-]+$/.test(apiKey);
}

/**
 * Validate JSON object structure
 * @param {Object} obj - Object to validate
 * @param {Array<string>} requiredFields - Required field names
 * @returns {boolean} True if valid
 */
function hasRequiredFields(obj, requiredFields) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  
  return requiredFields.every(field => field in obj);
}

/**
 * Sanitize metadata object
 * @param {Object} meta - Metadata object
 * @returns {Object} Sanitized metadata
 */
function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  
  const sanitized = {};
  const allowedKeys = [
    'title', 'description', 'tags', 'licenseStatus', 
    'allowedRoles', 'coinCost', 'cooldown', 'volume',
    'fadeIn', 'fadeOut', 'duration'
  ];
  
  for (const key of allowedKeys) {
    if (key in meta) {
      // Basic sanitization - prevent injection
      if (typeof meta[key] === 'string') {
        sanitized[key] = meta[key].substring(0, 1000);
      } else if (typeof meta[key] === 'number') {
        sanitized[key] = meta[key];
      } else if (Array.isArray(meta[key])) {
        sanitized[key] = meta[key].filter(item => typeof item === 'string').slice(0, 50);
      }
    }
  }
  
  return sanitized;
}

/**
 * Create a rate limiter key from request
 * @param {Object} req - Express request object
 * @param {string} identifier - Additional identifier
 * @returns {string} Rate limiter key
 */
function getRateLimitKey(req, identifier = '') {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = req.body?.userId || req.query?.userId || '';
  return `${ip}:${userId}:${identifier}`;
}

module.exports = {
  isSafeLocalPath,
  isAllowedHost,
  sanitizeFilename,
  isValidSourceType,
  isValidAudioMimeType,
  isValidAudioExtension,
  isValidVolume,
  isValidDuration,
  isValidPriority,
  isValidClientType,
  sanitizeUserId,
  isValidApiKey,
  hasRequiredFields,
  sanitizeMetadata,
  getRateLimitKey
};
