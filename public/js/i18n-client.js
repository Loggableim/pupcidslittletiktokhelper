/**
 * Client-side Internationalization (i18n) Library
 * 
 * This library provides translation capabilities for the browser,
 * with support for live language switching and automatic UI updates.
 * 
 * Features:
 * - Load translations from server
 * - Support for interpolation ({key} syntax)
 * - Language switching with event emission
 * - LocalStorage persistence
 * - Automatic UI re-rendering
 */

class I18nClient {
    constructor() {
        this.currentLocale = 'en';
        this.defaultLocale = 'en';
        this.translations = {};
        this.listeners = [];
        this.initialized = false;
        
        // Load locale from localStorage
        const savedLocale = localStorage.getItem('app_locale');
        if (savedLocale) {
            this.currentLocale = savedLocale;
        }
    }

    /**
     * Initialize i18n - load translations from server
     */
    async init(locale = null) {
        const targetLocale = locale || this.currentLocale;
        
        try {
            // Load translations for the current locale
            const response = await fetch(`/api/i18n/translations/${targetLocale}`);
            if (!response.ok) {
                throw new Error(`Failed to load translations for ${targetLocale}`);
            }
            
            const data = await response.json();
            this.translations[targetLocale] = data;
            this.currentLocale = targetLocale;
            this.initialized = true;
            
            // Save to localStorage
            localStorage.setItem('app_locale', targetLocale);
            
            // Update HTML lang attribute
            document.documentElement.lang = targetLocale;
            
            console.log(`✅ i18n initialized with locale: ${targetLocale}`);
            
            return true;
        } catch (error) {
            console.error('Failed to initialize i18n:', error);
            
            // Fallback to default locale if not already trying it
            if (targetLocale !== this.defaultLocale) {
                console.log(`Falling back to ${this.defaultLocale}...`);
                return this.init(this.defaultLocale);
            }
            
            return false;
        }
    }

    /**
     * Translate a key
     * @param {string} key - Translation key (e.g., 'dashboard.title')
     * @param {object} params - Parameters for interpolation
     * @returns {string} Translated string
     */
    t(key, params = {}) {
        if (!this.translations[this.currentLocale]) {
            return key;
        }

        const keys = key.split('.');
        let translation = this.translations[this.currentLocale];

        // Traverse the translation object
        for (const k of keys) {
            if (translation && typeof translation === 'object' && k in translation) {
                translation = translation[k];
            } else {
                // Fallback to default locale
                if (this.currentLocale !== this.defaultLocale && this.translations[this.defaultLocale]) {
                    translation = this.translations[this.defaultLocale];
                    for (const fallbackKey of keys) {
                        if (translation && typeof translation === 'object' && fallbackKey in translation) {
                            translation = translation[fallbackKey];
                        } else {
                            return key;
                        }
                    }
                    break;
                }
                return key;
            }
        }

        // If translation is still an object, return the key
        if (typeof translation !== 'string') {
            return key;
        }

        // Interpolate parameters
        return this.interpolate(translation, params);
    }

    /**
     * Interpolate parameters into translation string
     * Example: "Hello {name}" + {name: "John"} => "Hello John"
     */
    interpolate(str, params) {
        return str.replace(/\{(\w+)\}/g, (match, key) => {
            return key in params ? params[key] : match;
        });
    }

    /**
     * Change the current locale
     */
    async setLocale(locale) {
        if (locale === this.currentLocale) {
            return true;
        }

        // Load translations if not already loaded
        if (!this.translations[locale]) {
            const success = await this.init(locale);
            if (!success) {
                return false;
            }
        } else {
            this.currentLocale = locale;
            localStorage.setItem('app_locale', locale);
            document.documentElement.lang = locale;
        }

        // Notify all listeners
        this.notifyListeners(locale);
        
        console.log(`🌍 Language changed to: ${locale}`);
        
        return true;
    }

    /**
     * Get current locale
     */
    getLocale() {
        return this.currentLocale;
    }

    /**
     * Get available locales
     */
    async getAvailableLocales() {
        try {
            const response = await fetch('/api/i18n/locales');
            if (!response.ok) {
                throw new Error('Failed to fetch available locales');
            }
            return await response.json();
        } catch (error) {
            console.error('Failed to get available locales:', error);
            return ['en', 'de', 'es', 'fr'];
        }
    }

    /**
     * Register a listener for locale changes
     */
    onChange(callback) {
        this.listeners.push(callback);
    }

    /**
     * Unregister a listener
     */
    offChange(callback) {
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Notify all listeners of locale change
     */
    notifyListeners(newLocale) {
        this.listeners.forEach(callback => {
            try {
                callback(newLocale);
            } catch (error) {
                console.error('Error in locale change listener:', error);
            }
        });
    }

    /**
     * Update all elements with data-i18n attribute
     */
    updateDOM() {
        // Update elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const params = element.getAttribute('data-i18n-params');
            
            let paramsObj = {};
            if (params) {
                try {
                    paramsObj = JSON.parse(params);
                } catch (e) {
                    console.warn(`Invalid data-i18n-params for ${key}:`, params);
                }
            }
            
            const translation = this.t(key, paramsObj);
            
            // Update text content or placeholder based on element type
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                if (element.hasAttribute('placeholder')) {
                    element.placeholder = translation;
                } else {
                    element.value = translation;
                }
            } else {
                element.textContent = translation;
            }
        });

        // Update elements with data-i18n-title attribute (for tooltips)
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = this.t(key);
        });

        // Update elements with data-i18n-html attribute (for HTML content)
        document.querySelectorAll('[data-i18n-html]').forEach(element => {
            const key = element.getAttribute('data-i18n-html');
            const params = element.getAttribute('data-i18n-params');
            
            let paramsObj = {};
            if (params) {
                try {
                    paramsObj = JSON.parse(params);
                } catch (e) {
                    console.warn(`Invalid data-i18n-params for ${key}:`, params);
                }
            }
            
            element.innerHTML = this.t(key, paramsObj);
        });
    }
}

// Create global instance
const i18n = new I18nClient();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await i18n.init();
        i18n.updateDOM();
    });
} else {
    // DOM already loaded
    i18n.init().then(() => i18n.updateDOM());
}

// Make available globally
window.i18n = i18n;
