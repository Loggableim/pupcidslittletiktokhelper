/**
 * Theme Manager - Dark/Light Mode
 *
 * Features:
 * - Dark/Light/Auto modes
 * - System theme detection
 * - Persistent theme storage
 * - Smooth transitions
 */

class ThemeManager {
  constructor() {
    this.currentTheme = this.loadTheme();
    this.systemTheme = this.detectSystemTheme();
    this.init();
  }

  /**
   * Initialize theme manager
   */
  init() {
    // Listen for system theme changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        this.systemTheme = e.matches ? 'dark' : 'light';
        if (this.currentTheme === 'auto') {
          this.applyTheme(this.systemTheme);
        }
      });
    }

    // Apply initial theme
    this.applyTheme(this.getEffectiveTheme());

    // Add theme toggle button to all pages
    this.addThemeToggle();
  }

  /**
   * Detect system theme preference
   */
  detectSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  /**
   * Load theme from localStorage
   */
  loadTheme() {
    return localStorage.getItem('theme') || 'auto';
  }

  /**
   * Save theme to localStorage
   */
  saveTheme(theme) {
    localStorage.setItem('theme', theme);
    this.currentTheme = theme;
  }

  /**
   * Get effective theme (resolve 'auto' to actual theme)
   */
  getEffectiveTheme() {
    if (this.currentTheme === 'auto') {
      return this.systemTheme;
    }
    return this.currentTheme;
  }

  /**
   * Apply theme to document
   */
  applyTheme(theme) {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark-mode');
      root.classList.remove('light-mode');
    } else {
      root.classList.add('light-mode');
      root.classList.remove('dark-mode');
    }

    // Dispatch event for components to listen to
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  /**
   * Set theme
   */
  setTheme(theme) {
    this.saveTheme(theme);
    this.applyTheme(this.getEffectiveTheme());
  }

  /**
   * Toggle between light and dark
   */
  toggle() {
    const effectiveTheme = this.getEffectiveTheme();
    const newTheme = effectiveTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  /**
   * Add theme toggle button to page
   */
  addThemeToggle() {
    const toggle = document.createElement('div');
    toggle.id = 'theme-toggle';
    toggle.className = 'theme-toggle';
    toggle.innerHTML = `
      <button id="theme-toggle-btn" class="theme-toggle-btn" title="Toggle theme">
        <svg class="theme-icon sun-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <svg class="theme-icon moon-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </button>
    `;

    document.body.appendChild(toggle);

    // Add click handler
    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
      this.toggle();
      this.updateToggleIcon();
    });

    // Initial icon update
    this.updateToggleIcon();

    // Add CSS
    this.addThemeStyles();
  }

  /**
   * Update toggle button icon
   */
  updateToggleIcon() {
    const effectiveTheme = this.getEffectiveTheme();
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.setAttribute('data-theme', effectiveTheme);
    }
  }

  /**
   * Add theme-related CSS
   */
  addThemeStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Theme variables */
      :root.light-mode {
        --bg-primary: #ffffff;
        --bg-secondary: #f3f4f6;
        --bg-tertiary: #e5e7eb;
        --text-primary: #111827;
        --text-secondary: #6b7280;
        --border-color: #d1d5db;
        --accent-color: #3b82f6;
      }

      :root.dark-mode {
        --bg-primary: #1f2937;
        --bg-secondary: #111827;
        --bg-tertiary: #374151;
        --text-primary: #f9fafb;
        --text-secondary: #9ca3af;
        --border-color: #4b5563;
        --accent-color: #60a5fa;
      }

      /* Theme toggle button */
      .theme-toggle {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
      }

      .theme-toggle-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 2px solid var(--border-color);
        background: var(--bg-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
      }

      .theme-toggle-btn:hover {
        transform: scale(1.1);
        background: var(--bg-tertiary);
      }

      .theme-icon {
        width: 20px;
        height: 20px;
        color: var(--text-primary);
      }

      .theme-toggle-btn[data-theme="dark"] .sun-icon { display: none; }
      .theme-toggle-btn[data-theme="light"] .moon-icon { display: none; }
      .theme-toggle-btn[data-theme="dark"] .moon-icon { display: block; }
      .theme-toggle-btn[data-theme="light"] .sun-icon { display: block; }

      /* Apply theme colors to body */
      body {
        background-color: var(--bg-primary);
        color: var(--text-primary);
        transition: background-color 0.3s ease, color 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize theme manager
const themeManager = new ThemeManager();
