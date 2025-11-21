/**
 * Template Renderer for LastEvent Spotlight
 *
 * Handles rendering and updating overlay templates with user data.
 */

class TemplateRenderer {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings || {};
    this.currentUser = null;
    this.imageCache = new Map();
  }

  /**
   * Escape HTML to prevent XSS attacks
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Update settings and re-render
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.applyStyles();

    // Re-render current user with new settings
    if (this.currentUser) {
      this.render(this.currentUser, false); // Don't animate, just update styles
    }
  }

  /**
   * Apply global styles to container
   */
  applyStyles() {
    if (!this.container) return;

    // Apply alignment
    if (this.settings.alignCenter) {
      this.container.style.display = 'flex';
      this.container.style.justifyContent = 'center';
      this.container.style.alignItems = 'center';
      this.container.style.textAlign = 'center';
    } else {
      this.container.style.textAlign = 'left';
    }

    // Apply background
    if (this.settings.enableBackground) {
      this.container.style.backgroundColor = this.settings.backgroundColor || 'rgba(0, 0, 0, 0.7)';
    } else {
      this.container.style.backgroundColor = 'transparent';
    }
  }

  /**
   * Preload profile picture
   */
  async preloadImage(url) {
    if (!url) return null;

    // Check cache
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url);
    }

    // Load image
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.imageCache.set(url, url);
        resolve(url);
      };
      img.onerror = () => {
        console.warn('Failed to load profile picture:', url);
        resolve(null);
      };
      img.src = url;

      // Timeout after 5 seconds
      setTimeout(() => resolve(null), 5000);
    });
  }

  /**
   * Render user data
   */
  async render(userData, animate = true) {
    if (!this.container) return;

    this.currentUser = userData;

    // Handle null user
    if (!userData && this.settings.hideOnNullUser) {
      this.container.style.display = 'none';
      return;
    } else if (!userData) {
      this.container.innerHTML = '<div class="no-data">Waiting for event...</div>';
      return;
    }

    // Show container
    this.container.style.display = '';

    // Preload image if enabled
    let profilePicUrl = userData.profilePictureUrl;
    if (this.settings.preloadImages && profilePicUrl) {
      profilePicUrl = await this.preloadImage(profilePicUrl);
    }

    // Build HTML
    const html = this.buildHTML(userData, profilePicUrl);

    // Update DOM
    this.container.innerHTML = html;

    // Apply styles
    this.applyStyles();
    this.applyElementStyles();
  }

  /**
   * Build HTML for user data
   */
  buildHTML(userData, profilePicUrl) {
    const parts = [];
    const isGiftEvent = userData.eventType === 'gifter' || userData.eventType === 'topgift' || userData.eventType === 'giftstreak';
    const hasGiftData = userData.metadata && (userData.metadata.giftName || userData.metadata.giftPictureUrl);

    // Profile picture
    if (this.settings.showProfilePicture && profilePicUrl) {
      const size = this.settings.profilePictureSize || '80px';
      const escapedNickname = this.escapeHtml(userData.nickname);
      const escapedProfilePicUrl = this.escapeHtml(profilePicUrl);
      parts.push(`
        <div class="profile-picture" style="
          width: ${size};
          height: ${size};
          border-radius: 50%;
          overflow: hidden;
          ${this.settings.enableBorder ? `border: 3px solid ${this.settings.borderColor || '#FFFFFF'};` : ''}
          margin: 10px;
        ">
          <img src="${escapedProfilePicUrl}" alt="${escapedNickname}" style="width: 100%; height: 100%; object-fit: cover;">
        </div>
      `);
    }

    // Gift icon (for gift-related events)
    if (isGiftEvent && hasGiftData) {
      const giftPictureUrl = userData.metadata.giftPictureUrl;
      const giftName = userData.metadata.giftName || 'Gift';
      const size = this.settings.profilePictureSize || '80px';
      
      if (giftPictureUrl) {
        // Show gift image if available
        const escapedGiftPictureUrl = this.escapeHtml(giftPictureUrl);
        const escapedGiftName = this.escapeHtml(giftName);
        parts.push(`
          <div class="gift-icon" style="
            width: ${size};
            height: ${size};
            border-radius: 10px;
            overflow: hidden;
            ${this.settings.enableBorder ? `border: 3px solid ${this.settings.borderColor || '#FFFFFF'};` : ''}
            margin: 10px;
            background: rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <img src="${escapedGiftPictureUrl}" alt="${escapedGiftName}" style="width: 90%; height: 90%; object-fit: contain;">
          </div>
        `);
      } else {
        // Fallback to emoji if no gift image
        const giftEmoji = userData.eventType === 'topgift' ? '💎' : (userData.eventType === 'giftstreak' ? '🔥' : '🎁');
        parts.push(`
          <div class="gift-icon" style="
            width: ${size};
            height: ${size};
            border-radius: 10px;
            ${this.settings.enableBorder ? `border: 3px solid ${this.settings.borderColor || '#FFFFFF'};` : ''}
            margin: 10px;
            background: rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: calc(${size} * 0.6);
          ">
            ${giftEmoji}
          </div>
        `);
      }
    }

    // Text content
    const textParts = [];

    // Event label
    const escapedLabel = this.escapeHtml(userData.label || 'Event');
    textParts.push(`
      <div class="event-label" style="
        font-size: calc(${this.settings.fontSize || '32px'} * 0.6);
        color: ${this.settings.fontColor || '#FFFFFF'};
        opacity: 0.8;
        margin-bottom: 5px;
      ">
        ${escapedLabel}
      </div>
    `);

    // Username
    if (this.settings.showUsername) {
      const escapedNickname = this.escapeHtml(userData.nickname || 'Anonymous');
      textParts.push(`
        <div class="username" style="
          font-family: ${this.settings.fontFamily || 'Exo 2'};
          font-size: ${this.settings.fontSize || '32px'};
          line-height: ${this.settings.fontLineSpacing || '1.2'};
          letter-spacing: ${this.settings.fontLetterSpacing || 'normal'};
          color: ${this.settings.fontColor || '#FFFFFF'};
          font-weight: bold;
        ">
          ${escapedNickname}
        </div>
      `);
    }

    // Gift metadata (for gift-related events)
    if (isGiftEvent && hasGiftData) {
      const giftInfo = [];
      
      if (userData.metadata.giftName) {
        const escapedGiftName = this.escapeHtml(userData.metadata.giftName);
        giftInfo.push(`<span style="color: #ffc107;">🎁 ${escapedGiftName}</span>`);
      }
      
      if (userData.metadata.giftCount && userData.metadata.giftCount > 1) {
        const giftCount = parseInt(userData.metadata.giftCount) || 0;
        giftInfo.push(`<span style="color: #00ff00;">×${giftCount}</span>`);
      }
      
      if (userData.metadata.coins && userData.metadata.coins > 0) {
        const coins = parseInt(userData.metadata.coins) || 0;
        giftInfo.push(`<span style="color: #ffd700;">💰 ${coins} coins</span>`);
      }
      
      if (giftInfo.length > 0) {
        textParts.push(`
          <div class="gift-metadata" style="
            font-size: calc(${this.settings.fontSize || '32px'} * 0.7);
            color: ${this.settings.fontColor || '#FFFFFF'};
            margin-top: 5px;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            justify-content: ${this.settings.alignCenter ? 'center' : 'flex-start'};
          ">
            ${giftInfo.join(' ')}
          </div>
        `);
      }
    }

    if (textParts.length > 0) {
      parts.push(`
        <div class="text-content" style="padding: 10px;">
          ${textParts.join('')}
        </div>
      `);
    }

    return `
      <div class="user-display" style="
        display: flex;
        flex-direction: ${this.settings.alignCenter ? 'column' : 'row'};
        align-items: center;
        justify-content: center;
        padding: 20px;
      ">
        ${parts.join('')}
      </div>
    `;
  }

  /**
   * Apply element-specific styles (effects, etc.)
   */
  applyElementStyles() {
    const usernameElement = this.container.querySelector('.username');

    if (usernameElement && window.TextEffects) {
      const textEffects = new window.TextEffects();
      textEffects.applyComprehensiveEffects(usernameElement, this.settings);
    }
  }

  /**
   * Clear current display
   */
  clear() {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.currentUser = null;
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  window.TemplateRenderer = TemplateRenderer;
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TemplateRenderer;
}
