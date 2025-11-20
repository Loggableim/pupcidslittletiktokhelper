/**
 * Theme Manager
 * Handles day/night/high contrast theme switching
 * Corporate branding color: #12a116
 */

class ThemeManager {
    constructor() {
        this.currentTheme = 'night'; // Default theme
        this.themes = {
            night: {
                name: 'Night Mode',
                icon: 'moon',
                description: 'Dark theme (default)'
            },
            day: {
                name: 'Day Mode',
                icon: 'sun',
                description: 'Light theme'
            },
            contrast: {
                name: 'High Contrast',
                icon: 'eye',
                description: 'For vision impaired'
            }
        };
        
        this.init();
    }

    init() {
        // Load saved theme from localStorage
        const savedTheme = localStorage.getItem('dashboard-theme');
        if (savedTheme && this.themes[savedTheme]) {
            this.currentTheme = savedTheme;
        }

        // Apply theme immediately
        this.applyTheme(this.currentTheme);

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupUI());
        } else {
            this.setupUI();
        }
    }

    setupUI() {
        this.createThemeToggle();
        this.attachEventListeners();
    }

    createThemeToggle() {
        // Find the topbar-right container
        const topbarRight = document.querySelector('.topbar-right');
        if (!topbarRight) {
            console.warn('Topbar-right container not found');
            return;
        }

        // Create theme toggle button container
        const themeToggleContainer = document.createElement('div');
        themeToggleContainer.style.position = 'relative';
        themeToggleContainer.innerHTML = `
            <button id="theme-toggle-btn" class="theme-toggle-btn" title="Change theme">
                <i data-lucide="${this.themes[this.currentTheme].icon}"></i>
            </button>
            <div id="theme-dropdown" class="theme-dropdown">
                ${Object.entries(this.themes).map(([key, theme]) => `
                    <div class="theme-option ${key === this.currentTheme ? 'active' : ''}" data-theme="${key}">
                        <div class="theme-option-icon">
                            <i data-lucide="${theme.icon}"></i>
                        </div>
                        <div class="theme-option-content">
                            <div class="theme-option-name">${theme.name}</div>
                            <div class="theme-option-description">${theme.description}</div>
                        </div>
                        <i data-lucide="check" class="theme-option-check"></i>
                    </div>
                `).join('')}
            </div>
        `;

        // Insert before settings button
        const settingsBtn = document.getElementById('topbar-settings-btn');
        if (settingsBtn) {
            topbarRight.insertBefore(themeToggleContainer, settingsBtn);
        } else {
            topbarRight.appendChild(themeToggleContainer);
        }

        // Initialize Lucide icons for the new elements
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    attachEventListeners() {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        const dropdown = document.getElementById('theme-dropdown');

        if (!toggleBtn || !dropdown) return;

        // Toggle dropdown
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!toggleBtn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });

        // Theme option clicks
        const themeOptions = dropdown.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            option.addEventListener('click', () => {
                const theme = option.dataset.theme;
                this.setTheme(theme);
                dropdown.classList.remove('show');
            });
        });
    }

    setTheme(theme) {
        if (!this.themes[theme]) {
            console.warn('Unknown theme:', theme);
            return;
        }

        this.currentTheme = theme;
        this.applyTheme(theme);
        this.saveTheme(theme);
        this.updateUI(theme);
    }

    applyTheme(theme) {
        // Remove all theme classes
        document.documentElement.removeAttribute('data-theme');

        // Apply new theme (only for non-default)
        if (theme !== 'night') {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    saveTheme(theme) {
        localStorage.setItem('dashboard-theme', theme);
    }

    updateUI(theme) {
        // Update toggle button icon
        const toggleBtn = document.getElementById('theme-toggle-btn');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.setAttribute('data-lucide', this.themes[theme].icon);
                if (window.lucide) {
                    window.lucide.createIcons();
                }
            }
        }

        // Update active state in dropdown
        const themeOptions = document.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            if (option.dataset.theme === theme) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}

// Initialize theme manager
const themeManager = new ThemeManager();
