/**
 * Permissions & Monetization Module
 * 
 * This module handles permission checks and monetization features:
 * - Role-based access control
 * - Dynamic permission rules
 * - Coin costs per sound
 * - Cooldowns
 * - Per-user rate limits
 */

class PermissionsManager {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.config = {
      enabled: true,
      defaultRoles: ['everyone'],
      coinCosts: {}, // soundId -> cost
      cooldowns: {}, // soundId -> cooldown ms
      userCooldowns: new Map(), // userId:soundId -> lastUsed timestamp
      rateLimit: {
        enabled: true,
        maxPerHour: 10,
        maxPerDay: 50
      },
      userLimits: new Map() // userId -> { hourly: [], daily: [] }
    };
  }
  
  /**
   * Update configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    };
    
    this.logger.info('[Permissions] Configuration updated');
  }
  
  /**
   * Check if user has permission to trigger a sound
   * @param {Object} user - User object
   * @param {string} soundId - Sound ID
   * @param {Object} soundMeta - Sound metadata
   * @returns {Object} { allowed: boolean, reason?: string }
   */
  checkPermission(user, soundId, soundMeta = {}) {
    if (!this.config.enabled) {
      return { allowed: true };
    }
    
    // Check if sound has specific role requirements
    const allowedRoles = soundMeta.allowedRoles || this.config.defaultRoles;
    
    // Check user role
    const userRole = this._getUserRole(user);
    if (!this._hasRole(userRole, allowedRoles)) {
      return {
        allowed: false,
        reason: `Requires role: ${allowedRoles.join(' or ')}`
      };
    }
    
    // Check cooldown
    const cooldownCheck = this._checkCooldown(user.id, soundId);
    if (!cooldownCheck.allowed) {
      return cooldownCheck;
    }
    
    // Check rate limits
    const rateLimitCheck = this._checkRateLimit(user.id);
    if (!rateLimitCheck.allowed) {
      return rateLimitCheck;
    }
    
    // Check coin cost
    const coinCost = this._getCoinCost(soundId, soundMeta);
    if (coinCost > 0) {
      const coinsCheck = this._checkCoins(user, coinCost);
      if (!coinsCheck.allowed) {
        return coinsCheck;
      }
    }
    
    return { 
      allowed: true,
      coinCost: coinCost
    };
  }
  
  /**
   * Record sound usage (for cooldowns and rate limits)
   * @param {string} userId - User ID
   * @param {string} soundId - Sound ID
   */
  recordUsage(userId, soundId) {
    const now = Date.now();
    
    // Record cooldown
    const cooldownKey = `${userId}:${soundId}`;
    this.config.userCooldowns.set(cooldownKey, now);
    
    // Record rate limit
    if (!this.config.userLimits.has(userId)) {
      this.config.userLimits.set(userId, {
        hourly: [],
        daily: []
      });
    }
    
    const limits = this.config.userLimits.get(userId);
    limits.hourly.push(now);
    limits.daily.push(now);
    
    // Cleanup old entries
    this._cleanupRateLimits(userId);
    
    this.logger.debug(`[Permissions] Recorded usage: user=${userId}, sound=${soundId}`);
  }
  
  /**
   * Set coin cost for a sound
   * @param {string} soundId - Sound ID
   * @param {number} cost - Coin cost
   */
  setCoinCost(soundId, cost) {
    this.config.coinCosts[soundId] = cost;
  }
  
  /**
   * Set cooldown for a sound
   * @param {string} soundId - Sound ID
   * @param {number} cooldown - Cooldown in milliseconds
   */
  setCooldown(soundId, cooldown) {
    this.config.cooldowns[soundId] = cooldown;
  }
  
  /**
   * Get user role
   */
  _getUserRole(user) {
    if (!user) {
      return 'everyone';
    }
    
    // Priority order
    if (user.isTopGifter) {
      return 'top-gifter';
    }
    if (user.isSubscriber) {
      return 'subscriber';
    }
    if (user.isSuperfan) {
      return 'superfan';
    }
    if (user.isFollower) {
      return 'follower';
    }
    if (user.teamMemberLevel >= 1) {
      return 'team-member';
    }
    
    return 'everyone';
  }
  
  /**
   * Check if user has required role
   */
  _hasRole(userRole, allowedRoles) {
    if (allowedRoles.includes('everyone')) {
      return true;
    }
    
    // Role hierarchy
    const roleHierarchy = {
      'everyone': 0,
      'follower': 1,
      'superfan': 2,
      'subscriber': 3,
      'team-member': 4,
      'top-gifter': 5
    };
    
    const userLevel = roleHierarchy[userRole] || 0;
    
    for (const role of allowedRoles) {
      const requiredLevel = roleHierarchy[role] || 0;
      if (userLevel >= requiredLevel) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check cooldown
   */
  _checkCooldown(userId, soundId) {
    const cooldown = this.config.cooldowns[soundId];
    if (!cooldown) {
      return { allowed: true };
    }
    
    const cooldownKey = `${userId}:${soundId}`;
    const lastUsed = this.config.userCooldowns.get(cooldownKey);
    
    if (!lastUsed) {
      return { allowed: true };
    }
    
    const elapsed = Date.now() - lastUsed;
    if (elapsed < cooldown) {
      const remaining = Math.ceil((cooldown - elapsed) / 1000);
      return {
        allowed: false,
        reason: `Cooldown active. Wait ${remaining}s`
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Check rate limits
   */
  _checkRateLimit(userId) {
    if (!this.config.rateLimit.enabled) {
      return { allowed: true };
    }
    
    const limits = this.config.userLimits.get(userId);
    if (!limits) {
      return { allowed: true };
    }
    
    // Check hourly limit
    const hourlyCount = limits.hourly.length;
    if (hourlyCount >= this.config.rateLimit.maxPerHour) {
      return {
        allowed: false,
        reason: 'Hourly rate limit exceeded'
      };
    }
    
    // Check daily limit
    const dailyCount = limits.daily.length;
    if (dailyCount >= this.config.rateLimit.maxPerDay) {
      return {
        allowed: false,
        reason: 'Daily rate limit exceeded'
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Check if user has enough coins
   */
  _checkCoins(user, cost) {
    if (!user || !user.coins) {
      return {
        allowed: false,
        reason: `Requires ${cost} coins`
      };
    }
    
    if (user.coins < cost) {
      return {
        allowed: false,
        reason: `Insufficient coins (need ${cost}, have ${user.coins})`
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Get coin cost for a sound
   */
  _getCoinCost(soundId, soundMeta) {
    // Sound-specific cost takes priority
    if (soundMeta.coinCost !== undefined) {
      return soundMeta.coinCost;
    }
    
    // Global cost
    return this.config.coinCosts[soundId] || 0;
  }
  
  /**
   * Cleanup old rate limit entries
   */
  _cleanupRateLimits(userId) {
    const limits = this.config.userLimits.get(userId);
    if (!limits) {
      return;
    }
    
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;
    
    // Cleanup hourly
    limits.hourly = limits.hourly.filter(time => now - time < oneHour);
    
    // Cleanup daily
    limits.daily = limits.daily.filter(time => now - time < oneDay);
  }
  
  /**
   * Get user statistics
   * @param {string} userId - User ID
   * @returns {Object} User stats
   */
  getUserStats(userId) {
    const limits = this.config.userLimits.get(userId);
    
    if (!limits) {
      return {
        hourlyUsage: 0,
        dailyUsage: 0,
        hourlyLimit: this.config.rateLimit.maxPerHour,
        dailyLimit: this.config.rateLimit.maxPerDay
      };
    }
    
    return {
      hourlyUsage: limits.hourly.length,
      dailyUsage: limits.daily.length,
      hourlyLimit: this.config.rateLimit.maxPerHour,
      dailyLimit: this.config.rateLimit.maxPerDay
    };
  }
  
  /**
   * Reset user limits
   * @param {string} userId - User ID
   */
  resetUserLimits(userId) {
    this.config.userLimits.delete(userId);
    
    // Clear cooldowns for this user
    const keysToDelete = [];
    this.config.userCooldowns.forEach((value, key) => {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.config.userCooldowns.delete(key));
    
    this.logger.info(`[Permissions] Reset limits for user: ${userId}`);
  }
  
  /**
   * Get configuration
   */
  getConfig() {
    return {
      ...this.config,
      userCooldowns: Array.from(this.config.userCooldowns.entries()),
      userLimits: Array.from(this.config.userLimits.entries())
    };
  }
}

module.exports = PermissionsManager;
