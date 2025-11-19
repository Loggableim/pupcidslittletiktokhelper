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

    // Profile picture
    if (this.settings.showProfilePicture && profilePicUrl) {
      const size = this.settings.profilePictureSize || '80px';
      parts.push(`
        <div class="profile-picture" style="
          width: ${size};
          height: ${size};
          border-radius: 50%;
          overflow: hidden;
          ${this.settings.enableBorder ? `border: 3px solid ${this.settings.borderColor || '#FFFFFF'};` : ''}
          margin: 10px;
        ">
          <img src="${profilePicUrl}" alt="${userData.nickname}" style="width: 100%; height: 100%; object-fit: cover;">
        </div>
      `);
    }

    // Text content
    const textParts = [];

    // Event label
    textParts.push(`
      <div class="event-label" style="
        font-size: calc(${this.settings.fontSize || '32px'} * 0.6);
        color: ${this.settings.fontColor || '#FFFFFF'};
        opacity: 0.8;
        margin-bottom: 5px;
      ">
        ${userData.label || 'Event'}
      </div>
    `);

    // Username
    if (this.settings.showUsername) {
      textParts.push(`
        <div class="username" style="
          font-family: ${this.settings.fontFamily || 'Exo 2'};
          font-size: ${this.settings.fontSize || '32px'};
          line-height: ${this.settings.fontLineSpacing || '1.2'};
          letter-spacing: ${this.settings.fontLetterSpacing || 'normal'};
          color: ${this.settings.fontColor || '#FFFFFF'};
          font-weight: bold;
        ">
          ${userData.nickname || 'Anonymous'}
        </div>
      `);
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
