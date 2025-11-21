const axios = require('axios');

/**
 * TikTok TTS Engine
 * Free TTS using TikTok's API via public endpoint
 */
class TikTokEngine {
    constructor(logger) {
        this.logger = logger;
        // Updated endpoints - using direct TikTok API endpoints as primary
        // The Weilnet endpoint is known to return 500 errors as of Nov 2025
        this.endpoints = [
            // Direct TikTok API endpoints (multiple regions for redundancy)
            {
                url: 'https://api16-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke',
                format: 'direct',
                requiresSession: false
            },
            {
                url: 'https://api22-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke',
                format: 'direct',
                requiresSession: false
            },
            {
                url: 'https://api16-core-c-useast1a.tiktokv.com/media/api/text/speech/invoke',
                format: 'direct',
                requiresSession: false
            },
            // Fallback to proxy endpoints if direct API fails
            {
                url: 'https://tiktok-tts.weilnet.workers.dev/api/generation',
                format: 'proxy',
                requiresSession: false
            },
            {
                url: 'https://tiktoktts.com/api/tiktok-tts',
                format: 'proxy',
                requiresSession: false
            }
        ];
        this.timeout = 15000; // 15s timeout
        this.maxRetries = 1; // Try each endpoint once
    }

    /**
     * Get all available voices for TikTok TTS
     */
    static getVoices() {
        return {
            // English - Characters/Disney
            'en_us_ghostface': { name: 'Ghostface (Scream)', lang: 'en', gender: 'male', style: 'character' },
            'en_us_chewbacca': { name: 'Chewbacca', lang: 'en', gender: 'male', style: 'character' },
            'en_us_c3po': { name: 'C3PO', lang: 'en', gender: 'male', style: 'character' },
            'en_us_stitch': { name: 'Stitch', lang: 'en', gender: 'male', style: 'character' },
            'en_us_stormtrooper': { name: 'Stormtrooper', lang: 'en', gender: 'male', style: 'character' },
            'en_us_rocket': { name: 'Rocket', lang: 'en', gender: 'male', style: 'character' },

            // English - Standard
            'en_male_narration': { name: 'Male Narrator', lang: 'en', gender: 'male', style: 'narration' },
            'en_male_funny': { name: 'Male Funny', lang: 'en', gender: 'male', style: 'funny' },
            'en_female_emotional': { name: 'Female Emotional', lang: 'en', gender: 'female', style: 'emotional' },
            'en_female_samc': { name: 'Female Friendly', lang: 'en', gender: 'female', style: 'friendly' },
            'en_us_001': { name: 'US Female 1', lang: 'en', gender: 'female', style: 'standard' },
            'en_us_002': { name: 'US Female 2', lang: 'en', gender: 'female', style: 'standard' },
            'en_us_006': { name: 'US Male 1', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_007': { name: 'US Male 2', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_009': { name: 'US Male 3', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_010': { name: 'US Male 4', lang: 'en', gender: 'male', style: 'standard' },
            'en_uk_001': { name: 'UK Male 1', lang: 'en', gender: 'male', style: 'british' },
            'en_uk_003': { name: 'UK Female 1', lang: 'en', gender: 'female', style: 'british' },
            'en_au_001': { name: 'Australian Female', lang: 'en', gender: 'female', style: 'australian' },
            'en_au_002': { name: 'Australian Male', lang: 'en', gender: 'male', style: 'australian' },

            // German
            'de_001': { name: 'Deutsch Männlich', lang: 'de', gender: 'male', style: 'standard' },
            'de_002': { name: 'Deutsch Weiblich', lang: 'de', gender: 'female', style: 'standard' },

            // Spanish
            'es_002': { name: 'Español Male', lang: 'es', gender: 'male', style: 'standard' },
            'es_mx_002': { name: 'Español MX Female', lang: 'es', gender: 'female', style: 'mexican' },

            // French
            'fr_001': { name: 'Français Male', lang: 'fr', gender: 'male', style: 'standard' },
            'fr_002': { name: 'Français Female', lang: 'fr', gender: 'female', style: 'standard' },

            // Portuguese
            'pt_female': { name: 'Português Female', lang: 'pt', gender: 'female', style: 'standard' },
            'br_003': { name: 'Português BR Female', lang: 'pt', gender: 'female', style: 'brazilian' },
            'br_004': { name: 'Português BR Male', lang: 'pt', gender: 'male', style: 'brazilian' },
            'br_005': { name: 'Português BR Friendly', lang: 'pt', gender: 'female', style: 'friendly' },

            // Italian
            'it_male_m18': { name: 'Italiano Male', lang: 'it', gender: 'male', style: 'standard' },

            // Japanese
            'jp_001': { name: '日本語 Female', lang: 'ja', gender: 'female', style: 'standard' },
            'jp_003': { name: '日本語 Male', lang: 'ja', gender: 'male', style: 'standard' },
            'jp_005': { name: '日本語 Energetic', lang: 'ja', gender: 'female', style: 'energetic' },
            'jp_006': { name: '日本語 Calm', lang: 'ja', gender: 'male', style: 'calm' },

            // Korean
            'kr_002': { name: '한국어 Male', lang: 'ko', gender: 'male', style: 'standard' },
            'kr_003': { name: '한국어 Female', lang: 'ko', gender: 'female', style: 'standard' },
            'kr_004': { name: '한국어 Bright', lang: 'ko', gender: 'female', style: 'bright' },

            // Indonesian
            'id_001': { name: 'Bahasa Indonesia Female', lang: 'id', gender: 'female', style: 'standard' },

            // Others
            'nl_001': { name: 'Nederlands Male', lang: 'nl', gender: 'male', style: 'standard' },
            'pl_001': { name: 'Polski Female', lang: 'pl', gender: 'female', style: 'standard' },
            'ru_female': { name: 'Русский Female', lang: 'ru', gender: 'female', style: 'standard' },
            'tr_female': { name: 'Türkçe Female', lang: 'tr', gender: 'female', style: 'standard' },
            'vi_female': { name: 'Tiếng Việt Female', lang: 'vi', gender: 'female', style: 'standard' },
            'th_female': { name: 'ภาษาไทย Female', lang: 'th', gender: 'female', style: 'standard' },
            'ar_male': { name: 'العربية Male', lang: 'ar', gender: 'male', style: 'standard' },
            'zh_CN_female': { name: '中文 Female', lang: 'zh', gender: 'female', style: 'standard' },
            'zh_CN_male': { name: '中文 Male', lang: 'zh', gender: 'male', style: 'standard' }
        };
    }

    /**
     * Get default voice for a language
     */
    static getDefaultVoiceForLanguage(langCode) {
        const languageDefaults = {
            'de': 'de_002',
            'en': 'en_us_001',
            'es': 'es_002',
            'fr': 'fr_002',
            'pt': 'br_003',
            'it': 'it_male_m18',
            'ja': 'jp_001',
            'ko': 'kr_003',
            'zh': 'zh_CN_female',
            'ru': 'ru_female',
            'ar': 'ar_male',
            'tr': 'tr_female',
            'vi': 'vi_female',
            'th': 'th_female',
            'nl': 'nl_001',
            'pl': 'pl_001',
            'id': 'id_001'
        };

        return languageDefaults[langCode] || 'en_us_001';
    }

    /**
     * Generate TTS audio from text
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - TikTok voice ID
     * @returns {Promise<string>} Base64-encoded MP3 audio
     */
    async synthesize(text, voiceId) {
        let lastError;
        let attemptCount = 0;

        // Try each endpoint in sequence
        for (const endpoint of this.endpoints) {
            try {
                attemptCount++;
                this.logger.info(`TikTok TTS attempt ${attemptCount}: ${endpoint.url.substring(0, 50)}...`);
                
                const result = await this._makeRequest(endpoint, text, voiceId);
                if (result) {
                    this.logger.info(`TikTok TTS success: ${text.substring(0, 30)}... (voice: ${voiceId}, endpoint: ${endpoint.format})`);
                    return result;
                }
            } catch (error) {
                lastError = error;
                this.logger.warn(`TikTok TTS endpoint ${endpoint.format} failed: ${error.message}`);
                
                // Brief delay before trying next endpoint
                if (attemptCount < this.endpoints.length) {
                    await this._delay(500);
                }
            }
        }

        // All attempts failed
        throw new Error(`All TikTok TTS endpoints failed. Last error: ${lastError?.message || 'Unknown'}`);
    }

    /**
     * Make TTS request to endpoint
     */
    async _makeRequest(endpoint, text, voiceId) {
        // Prepare request based on endpoint format
        let requestData;
        if (endpoint.format === 'direct') {
            // Direct TikTok API format
            requestData = {
                text_speaker: voiceId,
                req_text: text,
                speaker_map_type: 0,
                aid: 1233
            };
        } else {
            // Proxy format (Weilnet, tiktoktts.com, etc.)
            requestData = {
                text: text,
                voice: voiceId
            };
        }

        const response = await axios.post(
            endpoint.url,
            requestData,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'com.zhiliaoapp.musically/2022600030 (Linux; U; Android 7.1.2; es_ES; SM-G988N; Build/NRD90M;tt-ok/3.12.13.1)'
                },
                timeout: this.timeout,
                validateStatus: (status) => status === 200
            }
        );

        // Handle different response formats
        if (endpoint.format === 'direct') {
            // Direct TikTok API response format
            if (response.data && response.data.data && response.data.data.v_str) {
                return response.data.data.v_str; // Base64 audio data
            } else if (response.data && response.data.status_code === 0 && response.data.data) {
                // Alternative direct API format
                return response.data.data;
            }
        } else {
            // Proxy response format
            if (response.data && response.data.data) {
                return response.data.data; // Primary format
            } else if (response.data && response.data.audioContent) {
                return response.data.audioContent; // Alternative format
            } else if (typeof response.data === 'string' && response.data.length > 100) {
                return response.data; // Direct base64
            }
        }

        throw new Error('Invalid response format from TikTok TTS API');
    }

    /**
     * Helper: Delay promise
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test if engine is available
     */
    async test() {
        try {
            await this.synthesize('Test', 'en_us_001');
            return true;
        } catch (error) {
            this.logger.error(`TikTok TTS engine test failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = TikTokEngine;
