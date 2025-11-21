const axios = require('axios');

/**
 * TikTok TTS Engine
 * Free TTS using TikTok's API via public endpoint
 */
class TikTokEngine {
    constructor(logger) {
        this.logger = logger;
        this.apiUrl = 'https://tiktok-tts.weilnet.workers.dev/api/generation';
        this.fallbackUrls = [
            'https://countik.com/api/text/speech',
            'https://gesserit.co/api/tiktok-tts'
        ];
        this.timeout = 15000; // 15s timeout with retries
        this.maxRetries = 2;
        
        // User-Agent that mimics TikTok LIVE Studio (required for API access)
        // Based on TikFinity's successful implementation
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) TikTokLIVEStudio/0.32.2-beta Chrome/104.0.5112.102 Electron/20.1.0-tt.6.release.mssdk.8 TTElectron/20.1.0-tt.6.release.mssdk.8 Safari/537.36';
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
        this.logger.info(`[TIKTOK_TTS] Starting synthesis - text: "${text}", voice: ${voiceId}`);
        let lastError;
        let lastStatusCode;

        // Try primary URL with retries
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                this.logger.info(`[TIKTOK_TTS] Attempt ${attempt + 1}/${this.maxRetries} - URL: ${this.apiUrl}`);
                const result = await this._makeRequest(this.apiUrl, text, voiceId);
                if (result) {
                    this.logger.info(`[TIKTOK_TTS] ✅ Success: ${text.substring(0, 30)}... (voice: ${voiceId}, attempt: ${attempt + 1})`);
                    return result;
                }
            } catch (error) {
                lastError = error;
                lastStatusCode = error.response?.status || 'N/A';
                this.logger.error(`[TIKTOK_TTS] ❌ Attempt ${attempt + 1} failed - Status: ${lastStatusCode}, Error: ${error.message}`);

                // Exponential backoff
                if (attempt < this.maxRetries - 1) {
                    const delay = Math.pow(2, attempt) * 1000;
                    this.logger.info(`[TIKTOK_TTS] Waiting ${delay}ms before retry...`);
                    await this._delay(delay);
                }
            }
        }

        // Try fallback URLs
        for (const fallbackUrl of this.fallbackUrls) {
            try {
                this.logger.info(`[TIKTOK_TTS] Trying fallback URL: ${fallbackUrl}`);
                const result = await this._makeRequest(fallbackUrl, text, voiceId);
                if (result) {
                    this.logger.info(`[TIKTOK_TTS] ✅ Success via fallback: ${fallbackUrl}`);
                    return result;
                }
            } catch (error) {
                lastError = error;
                lastStatusCode = error.response?.status || 'N/A';
                this.logger.error(`[TIKTOK_TTS] ❌ Fallback ${fallbackUrl} failed - Status: ${lastStatusCode}, Error: ${error.message}`);
            }
        }

        // All attempts failed
        const errorMsg = `All TikTok TTS endpoints failed. Last error: ${lastError?.message || 'Unknown'} (Status: ${lastStatusCode})`;
        this.logger.error(`[TIKTOK_TTS] ${errorMsg}`);
        throw new Error(errorMsg);
    }

    /**
     * Make TTS request to endpoint
     */
    async _makeRequest(url, text, voiceId) {
        this.logger.info(`[TIKTOK_TTS] Making request to: ${url}`);
        this.logger.info(`[TIKTOK_TTS] Request body: { text: "${text.substring(0, 50)}...", voice: "${voiceId}" }`);
        this.logger.info(`[TIKTOK_TTS] User-Agent: ${this.userAgent.substring(0, 100)}...`);
        
        const response = await axios.post(
            url,
            {
                text: text,
                voice: voiceId
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': this.userAgent
                },
                timeout: this.timeout
            }
        );

        this.logger.info(`[TIKTOK_TTS] Response status: ${response.status}`);
        this.logger.info(`[TIKTOK_TTS] Response data type: ${typeof response.data}`);
        
        // Handle different response formats
        if (response.data && response.data.data) {
            this.logger.info(`[TIKTOK_TTS] Using response.data.data format (length: ${response.data.data.length})`);
            return response.data.data; // Primary format
        } else if (response.data && response.data.audioContent) {
            this.logger.info(`[TIKTOK_TTS] Using response.data.audioContent format`);
            return response.data.audioContent; // Alternative format
        } else if (typeof response.data === 'string' && response.data.length > 100) {
            this.logger.info(`[TIKTOK_TTS] Using direct base64 format (length: ${response.data.length})`);
            return response.data; // Direct base64
        }

        this.logger.error(`[TIKTOK_TTS] Invalid response format. Data: ${JSON.stringify(response.data).substring(0, 200)}`);
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
