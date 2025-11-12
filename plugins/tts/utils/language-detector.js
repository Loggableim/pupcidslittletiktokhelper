const { franc } = require('franc-min');

/**
 * Language Detector
 * Detects language from text and routes to appropriate voice
 */
class LanguageDetector {
    constructor(logger) {
        this.logger = logger;

        // Language code mapping (franc uses ISO 639-3, we need ISO 639-1)
        this.languageMap = {
            // Germanic
            'deu': 'de', // German
            'eng': 'en', // English
            'nld': 'nl', // Dutch
            'swe': 'sv', // Swedish
            'dan': 'da', // Danish
            'nor': 'no', // Norwegian

            // Romance
            'spa': 'es', // Spanish
            'fra': 'fr', // French
            'ita': 'it', // Italian
            'por': 'pt', // Portuguese
            'ron': 'ro', // Romanian

            // Slavic
            'pol': 'pl', // Polish
            'rus': 'ru', // Russian
            'ukr': 'uk', // Ukrainian
            'ces': 'cs', // Czech

            // Asian
            'jpn': 'ja', // Japanese
            'kor': 'ko', // Korean
            'cmn': 'zh', // Chinese (Mandarin)
            'zho': 'zh', // Chinese
            'tha': 'th', // Thai
            'vie': 'vi', // Vietnamese
            'ind': 'id', // Indonesian
            'msa': 'ms', // Malay

            // Middle Eastern
            'ara': 'ar', // Arabic
            'tur': 'tr', // Turkish
            'fas': 'fa', // Persian
            'heb': 'he', // Hebrew

            // Other
            'hin': 'hi', // Hindi
            'ben': 'bn', // Bengali
            'tam': 'ta', // Tamil
            'tel': 'te'  // Telugu
        };

        // Confidence threshold (franc confidence score 0-1)
        this.confidenceThreshold = 0.5;

        // Cache recent detections for performance
        this.cache = new Map();
        this.maxCacheSize = 1000;
    }

    /**
     * Detect language from text
     * @param {string} text - Text to analyze
     * @returns {object} { langCode, confidence, detected }
     */
    detect(text) {
        if (!text || text.trim().length < 3) {
            return { langCode: 'en', confidence: 0, detected: false };
        }

        // Check cache
        const cacheKey = text.substring(0, 100); // Cache first 100 chars
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // Use franc for detection
            const detected = franc(text, { minLength: 3 });

            if (detected === 'und') {
                // Undefined - fall back to English
                const result = { langCode: 'en', confidence: 0, detected: false };
                this._addToCache(cacheKey, result);
                return result;
            }

            // Map to ISO 639-1
            const langCode = this.languageMap[detected] || 'en';

            // Estimate confidence (franc doesn't provide this, so we use heuristics)
            const confidence = this._estimateConfidence(text, detected);

            const result = {
                langCode,
                confidence,
                detected: true,
                detectedCode: detected
            };

            this._addToCache(cacheKey, result);
            this.logger.info(`Language detected: ${langCode} (${detected}) with confidence ${confidence.toFixed(2)} for text: "${text.substring(0, 30)}..."`);

            return result;

        } catch (error) {
            this.logger.warn(`Language detection failed: ${error.message}`);
            const result = { langCode: 'en', confidence: 0, detected: false };
            this._addToCache(cacheKey, result);
            return result;
        }
    }

    /**
     * Estimate confidence based on text characteristics
     */
    _estimateConfidence(text, detectedCode) {
        // Heuristic: longer text = higher confidence
        const length = text.trim().length;

        if (length < 10) return 0.3;
        if (length < 20) return 0.5;
        if (length < 50) return 0.7;
        if (length < 100) return 0.8;
        return 0.9;
    }

    /**
     * Add result to cache
     */
    _addToCache(key, value) {
        // LRU eviction: remove oldest if cache is full
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, value);
    }

    /**
     * Get language name from code
     */
    getLanguageName(langCode) {
        const names = {
            'de': 'Deutsch',
            'en': 'English',
            'es': 'Español',
            'fr': 'Français',
            'it': 'Italiano',
            'pt': 'Português',
            'ja': '日本語',
            'ko': '한국어',
            'zh': '中文',
            'ru': 'Русский',
            'ar': 'العربية',
            'tr': 'Türkçe',
            'nl': 'Nederlands',
            'pl': 'Polski',
            'th': 'ภาษาไทย',
            'vi': 'Tiếng Việt',
            'id': 'Bahasa Indonesia'
        };

        return names[langCode] || langCode.toUpperCase();
    }

    /**
     * Detect language and get default voice for detected language
     */
    detectAndGetVoice(text, engineVoices) {
        const { langCode, confidence } = this.detect(text);

        if (!engineVoices || typeof engineVoices.getDefaultVoiceForLanguage !== 'function') {
            return null;
        }

        const voiceId = engineVoices.getDefaultVoiceForLanguage(langCode);

        return {
            langCode,
            confidence,
            voiceId,
            languageName: this.getLanguageName(langCode)
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        this.logger.info('Language detector cache cleared');
    }

    /**
     * Get cache stats
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize
        };
    }
}

module.exports = LanguageDetector;
