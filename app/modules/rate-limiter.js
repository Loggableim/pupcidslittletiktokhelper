/**
 * Rate Limiter Module
 *
 * Protects API endpoints from abuse/DoS attacks
 * - General API: 100 requests/minute
 * - Auth endpoints: 10 requests/minute
 * - File uploads: 20 requests/minute
 * - Plugin management: 30 requests/minute (more lenient for admin operations)
 */

const rateLimit = require('express-rate-limit');
const logger = require('./logger');

// General API rate limiter (100 req/min)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    error: 'Too many requests from this IP, please try again after a minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again after a minute'
    });
  }
});

// Stricter rate limiter for auth/connection endpoints (10 req/min)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    error: 'Too many connection attempts, please try again after a minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many connection attempts, please try again after a minute'
    });
  }
});

// File upload rate limiter (20 req/min)
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: {
    error: 'Too many file uploads, please try again after a minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many file uploads, please try again after a minute'
    });
  }
});

// More lenient rate limiter for plugin management operations (30 req/min)
// Plugin operations are typically admin actions and may require multiple
// rapid requests (e.g., refreshing all plugins, enabling multiple plugins)
const pluginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    error: 'Too many plugin operations, please slow down and try again in a moment'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Plugin management rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many plugin operations, please slow down and try again in a moment'
    });
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  pluginLimiter
};
