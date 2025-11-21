/**
 * Chatango Theme Adapter
 * Adapts Chatango shoutbox colors to match the current theme (day/night/high contrast)
 * Corporate branding color: #13A318 (green)
 */

class ChatangoThemeAdapter {
    constructor() {
        this.themeConfigs = {
            night: {
                // Default night mode - green branding
                a: '13A318',      // Background color (green)
                b: 100,           // Background opacity
                c: 'FFFFFF',      // Title and icons color (white)
                d: 'FFFFFF',      // Group owner's msg, URL and background text color
                e: '1e293b',      // Messages background color (dark blue-gray)
                f: 100,           // Messages background opacity
                g: 'FFFFFF',      // Messages text color (white)
                h: '334155',      // Input background color (slate)
                i: 100,           // Input background opacity
                j: 'FFFFFF',      // Input text color (white)
                k: '13A318',      // Date color (green)
                l: '13A318',      // Border color (green)
                m: '13A318',      // Button color (green)
                n: 'FFFFFF',      // Button text color (white)
                o: 100,           // Button opacity
                p: '10',          // Font size
                q: '13A318',      // Main border color (green)
                r: 100,           // Main border visibility
                s: 0,             // Rounded corners
                t: 0,             // Messages sound toggle (off)
                sbc: '64748b',    // Scrollbar color
                sba: 100,         // Scrollbar opacity
                cvbg: '13a318',   // Collapsed view background (green)
                cvfg: 'FFFFFF'    // Collapsed view font/icon color (white)
            },
            day: {
                // Day mode - light theme with green accents
                a: '13A318',      // Background color (green)
                b: 100,           // Background opacity
                c: '1e293b',      // Title and icons color (dark)
                d: '1e293b',      // Group owner's msg, URL text (dark)
                e: 'f8fafc',      // Messages background color (very light gray)
                f: 100,           // Messages background opacity
                g: '1e293b',      // Messages text color (dark)
                h: 'FFFFFF',      // Input background color (white)
                i: 100,           // Input background opacity
                j: '1e293b',      // Input text color (dark)
                k: '0f8712',      // Date color (darker green)
                l: '13A318',      // Border color (green)
                m: '13A318',      // Button color (green)
                n: 'FFFFFF',      // Button text color (white)
                o: 100,           // Button opacity
                p: '10',          // Font size
                q: '13A318',      // Main border color (green)
                r: 100,           // Main border visibility
                s: 0,             // Rounded corners
                t: 0,             // Messages sound toggle (off)
                sbc: 'cbd5e1',    // Scrollbar color (light gray)
                sba: 100,         // Scrollbar opacity
                cvbg: '13a318',   // Collapsed view background (green)
                cvfg: 'FFFFFF'    // Collapsed view font/icon color (white)
            },
            contrast: {
                // High contrast mode for vision impaired
                a: '000000',      // Background color (black)
                b: 100,           // Background opacity
                c: 'FFFF00',      // Title and icons color (yellow - high visibility)
                d: 'FFFF00',      // Group owner's msg, URL text (yellow)
                e: '000000',      // Messages background color (black)
                f: 100,           // Messages background opacity
                g: 'FFFFFF',      // Messages text color (white)
                h: '000000',      // Input background color (black)
                i: 100,           // Input background opacity
                j: 'FFFF00',      // Input text color (yellow)
                k: 'FFFF00',      // Date color (yellow)
                l: 'FFFF00',      // Border color (yellow)
                m: 'FFFF00',      // Button color (yellow)
                n: '000000',      // Button text color (black)
                o: 100,           // Button opacity
                p: '12',          // Font size (larger for readability)
                q: 'FFFF00',      // Main border color (yellow)
                r: 100,           // Main border visibility
                s: 0,             // Rounded corners
                t: 0,             // Messages sound toggle (off)
                sbc: 'FFFF00',    // Scrollbar color (yellow)
                sba: 100,         // Scrollbar opacity
                cvbg: '000000',   // Collapsed view background (black)
                cvfg: 'FFFF00'    // Collapsed view font/icon color (yellow)
            }
        };

        this.init();
    }

    init() {
        // Wait for theme manager to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupThemeListener());
        } else {
            this.setupThemeListener();
        }
    }

    setupThemeListener() {
        // Listen for theme changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                    this.updateChatangoTheme();
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });

        // Apply initial theme
        this.updateChatangoTheme();
    }

    getCurrentTheme() {
        const themeAttr = document.documentElement.getAttribute('data-theme');
        return themeAttr || 'night'; // Default to night if no theme set
    }

    updateChatangoTheme() {
        const currentTheme = this.getCurrentTheme();
        const config = this.themeConfigs[currentTheme];

        if (!config) {
            console.warn('Unknown theme for Chatango:', currentTheme);
            return;
        }

        // Note: Chatango embeds are loaded via script tags with JSON config
        // Once loaded, their colors cannot be dynamically changed without reloading the iframe
        // This is a limitation of the Chatango embed system
        // The best we can do is log the theme change for future enhancement
        console.log('Chatango theme would be:', currentTheme, config);
        
        // Store the current theme preference for future page loads
        localStorage.setItem('chatango-preferred-theme', currentTheme);
    }

    /**
     * Get the configuration for a specific theme
     * This can be used to manually recreate the embed with new colors
     */
    getConfigForTheme(theme) {
        return this.themeConfigs[theme] || this.themeConfigs.night;
    }

    /**
     * Generate embed code for current theme
     * Useful for dynamic recreation if needed
     */
    generateEmbedCode(elementId, position = 'dashboard') {
        const theme = this.getCurrentTheme();
        const config = this.getConfigForTheme(theme);

        const baseConfig = {
            handle: 'pupcidsltth',
            arch: 'js',
            styles: {
                ...config,
                surl: 0,
                allowpm: 0,
                cnrs: '0.35',
                fwtickm: 1
            }
        };

        if (position === 'widget') {
            // Bottom-right widget configuration
            return {
                id: elementId,
                style: 'width: 200px;height: 300px;',
                config: {
                    ...baseConfig,
                    styles: {
                        ...baseConfig.styles,
                        pos: 'br',
                        cv: 1,
                        cvw: 75,
                        cvh: 30,
                        ticker: 1
                    }
                }
            };
        } else {
            // Dashboard embed configuration
            return {
                id: elementId,
                style: 'width: 100%;height: 100%;',
                config: baseConfig
            };
        }
    }
}

// Initialize the adapter when the script loads
const chatangoThemeAdapter = new ChatangoThemeAdapter();
