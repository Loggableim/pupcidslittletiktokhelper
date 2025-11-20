/**
 * Client-side i18n Module
 * Provides translation functionality for browser-based UI
 */

class I18nClient {
    constructor() {
        this.currentLocale = 'en';
        this.defaultLocale = 'en';
        this.translations = {};
        this.initialized = false;
        this.onLanguageChangeCallbacks = [];
    }

    /**
     * Initialize i18n with locale from localStorage or default
     */
    async init() {
        // Get saved locale from localStorage or use default
        const savedLocale = localStorage.getItem('app_locale') || this.defaultLocale;
        
        // Load translations for the saved locale
        await this.loadTranslations(savedLocale);
        
        this.initialized = true;
        return this;
    }

    /**
     * Load translations from server
     */
    async loadTranslations(locale) {
        try {
            const response = await fetch(`/api/i18n/translations?locale=${locale}`);
            if (!response.ok) {
                throw new Error(`Failed to load translations: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.translations[locale] = data.translations;
            this.currentLocale = locale;
            
            // Save to localStorage
            localStorage.setItem('app_locale', locale);
            
            console.log(`✅ [i18n] Loaded translations for: ${locale}`);
            return true;
        } catch (error) {
            console.error(`❌ [i18n] Failed to load translations for ${locale}:`, error);
            
            // Fallback to default locale if not already trying it
            if (locale !== this.defaultLocale) {
                console.log(`[i18n] Falling back to ${this.defaultLocale}`);
                return this.loadTranslations(this.defaultLocale);
            }
            return false;
        }
    }

    /**
     * Change language and reload translations
     */
    async changeLanguage(locale) {
        console.log(`[i18n] changeLanguage called: ${this.currentLocale} -> ${locale}`);
        
        if (this.currentLocale === locale) {
            console.log(`[i18n] Already using locale: ${locale}`);
            return true; // Already using this locale
        }

        const success = await this.loadTranslations(locale);
        
        if (success) {
            console.log(`[i18n] Translations loaded successfully for: ${locale}`);
            
            // Trigger language change callbacks
            this.onLanguageChangeCallbacks.forEach(callback => {
                try {
                    callback(locale);
                } catch (error) {
                    console.error('[i18n] Error in language change callback:', error);
                }
            });
            
            // Update HTML lang attribute
            document.documentElement.lang = locale;
            console.log(`[i18n] Updated document.documentElement.lang to: ${locale}`);
        } else {
            console.error(`[i18n] Failed to load translations for: ${locale}`);
        }
        
        return success;
    }

    /**
     * Register callback for language changes
     */
    onLanguageChange(callback) {
        if (typeof callback === 'function') {
            this.onLanguageChangeCallbacks.push(callback);
        }
    }

    /**
     * Translate a key
     * @param {string} key - Translation key (e.g., 'dashboard.title')
     * @param {object} params - Parameters for interpolation
     * @returns {string} Translated string
     */
    t(key, params = {}) {
        if (!this.initialized) {
            console.warn('[i18n] Not initialized yet, returning key');
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
                translation = this.translations[this.defaultLocale];
                if (!translation) {
                    return key;
                }
                
                for (const fallbackKey of keys) {
                    if (translation && typeof translation === 'object' && fallbackKey in translation) {
                        translation = translation[fallbackKey];
                    } else {
                        // Return key if not found in fallback either
                        return key;
                    }
                }
                break;
            }
        }

        // If translation is still an object, something went wrong
        if (typeof translation !== 'string') {
            return key;
        }

        // Interpolate parameters
        return this.interpolate(translation, params);
    }

    /**
     * Interpolate parameters into translation string
     * Supports both {param} and {{param}} syntax
     */
    interpolate(str, params) {
        return str.replace(/\{\{?(\w+)\}?\}/g, (match, key) => {
            return key in params ? params[key] : match;
        });
    }

    /**
     * Get current locale
     */
    getLocale() {
        return this.currentLocale;
    }

    /**
     * Get all available locales
     */
    async getAvailableLocales() {
        try {
            const response = await fetch('/api/i18n/locales');
            if (!response.ok) {
                throw new Error('Failed to fetch available locales');
            }
            const data = await response.json();
            return data.locales || ['en', 'de', 'es', 'fr'];
        } catch (error) {
            console.error('[i18n] Failed to fetch available locales:', error);
            return ['en', 'de', 'es', 'fr'];
        }
    }

    /**
     * Update all elements with data-i18n attribute
     */
    updateDOM() {
        // Update elements with data-i18n attribute for text content
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (key) {
                element.textContent = this.t(key);
            }
        });

        // Update elements with data-i18n-html for innerHTML
        document.querySelectorAll('[data-i18n-html]').forEach(element => {
            const key = element.getAttribute('data-i18n-html');
            if (key) {
                element.innerHTML = this.t(key);
            }
        });

        // Update placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            if (key) {
                element.placeholder = this.t(key);
            }
        });

        // Update title attributes (tooltips)
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            if (key) {
                element.title = this.t(key);
            }
        });

        // Update aria-label attributes
        document.querySelectorAll('[data-i18n-aria]').forEach(element => {
            const key = element.getAttribute('data-i18n-aria');
            if (key) {
                element.setAttribute('aria-label', this.t(key));
            }
        });

        // Update page title
        document.title = this.t('app.name');
    }

    /**
     * Setup language switcher for a select element
     */
    setupLanguageSwitcher(selectElement) {
        if (!selectElement) {
            console.warn('[i18n] setupLanguageSwitcher called with null/undefined element');
            return;
        }

        console.log(`[i18n] Setting up language switcher for element ID: ${selectElement.id}`);
        
        // Set current value
        selectElement.value = this.currentLocale;
        console.log(`[i18n] Set ${selectElement.id} value to: ${this.currentLocale}`);

        // Listen for changes
        selectElement.addEventListener('change', async (e) => {
            const newLocale = e.target.value;
            console.log(`[i18n] Language change triggered to: ${newLocale}`);
            
            const success = await this.changeLanguage(newLocale);
            
            if (success) {
                console.log(`[i18n] Language change successful, updating DOM...`);
                this.updateDOM();
                
                // Sync all language selectors
                this.syncAllLanguageSelectors(newLocale);
                
                console.log(`✅ [i18n] Language changed to: ${newLocale}`);
                
                // Show notification (if available)
                if (typeof showNotification === 'function') {
                    showNotification(`Language changed to ${newLocale}`, 'success');
                }
            } else {
                console.error(`❌ [i18n] Failed to change language to: ${newLocale}`);
                selectElement.value = this.currentLocale; // Revert
            }
        });
        
        console.log(`[i18n] Event listener registered for ${selectElement.id}`);
    }

    /**
     * Sync all language selectors to the current locale
     */
    syncAllLanguageSelectors(locale) {
        const selectors = [
            document.getElementById('language-selector'),
            document.getElementById('topbar-language-selector')
        ];

        selectors.forEach(selector => {
            if (selector && selector.value !== locale) {
                selector.value = locale;
            }
        });
    }
}

// Create global instance and expose it
const i18n = new I18nClient();
window.i18n = i18n; // Make it globally accessible

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        i18n.init().then(() => {
            i18n.updateDOM();
        });
    });
} else {
    // DOM already loaded
    i18n.init().then(() => {
        i18n.updateDOM();
    });
}
