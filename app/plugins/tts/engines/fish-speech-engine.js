const axios = require('axios');

/**
 * Fish Speech / SiliconFlow Text-to-Speech Engine
 * High-quality TTS using SiliconFlow's Fish Speech API
 * Provider: https://github.com/orgs/siliconflow/repositories
 */
class FishSpeechEngine {
    constructor(apiKey, logger, config = {}) {
        this.apiKey = apiKey;
        this.logger = logger;
        this.apiUrl = 'https://api.siliconflow.cn/v1/audio/speech';
        
        // Performance mode optimization
        const performanceMode = config.performanceMode || 'balanced';
        
        // Adjust timeout and retries based on performance mode
        if (performanceMode === 'fast') {
            // Fast mode: optimized for low-resource PCs
            this.timeout = 5000;  // 5s timeout for faster failure
            this.maxRetries = 1;  // Only 1 retry (2 attempts total)
        } else if (performanceMode === 'quality') {
            // Quality mode: longer timeouts for better reliability
            this.timeout = 20000; // 20s timeout
            this.maxRetries = 3;  // 3 retries (4 attempts total)
        } else {
            // Balanced mode (default): moderate settings
            this.timeout = config.timeout || 10000; // 10s timeout
            this.maxRetries = config.maxRetries || 2;  // 2 retries (3 attempts total)
        }
        
        this.performanceMode = performanceMode;
        this.logger.info(`Fish Speech TTS: Performance mode set to '${performanceMode}' (timeout: ${this.timeout}ms, retries: ${this.maxRetries})`);
    }

    /**
     * Get all available Fish Speech TTS voices
     */
    static getVoices() {
        return {
            // German voices
            'fishaudio-de-1': { name: 'German Voice 1', lang: 'de', gender: 'neutral', description: 'German TTS voice' },
            'fishaudio-de-2': { name: 'German Voice 2', lang: 'de', gender: 'neutral', description: 'German TTS voice' },
            
            // English voices
            'fishaudio-en-1': { name: 'English Voice 1', lang: 'en', gender: 'neutral', description: 'English TTS voice' },
            'fishaudio-en-2': { name: 'English Voice 2', lang: 'en', gender: 'neutral', description: 'English TTS voice' },
            
            // Multi-language voices
            'fishaudio-multi-1': { name: 'Multi-Language 1', lang: 'multi', gender: 'neutral', description: 'Multi-language TTS voice' },
            'fishaudio-multi-2': { name: 'Multi-Language 2', lang: 'multi', gender: 'neutral', description: 'Multi-language TTS voice' }
        };
    }

    /**
     * Get default voice for a language
     */
    static getDefaultVoiceForLanguage(langCode) {
        const langMap = {
            'de': 'fishaudio-de-1',
            'en': 'fishaudio-en-1',
            'multi': 'fishaudio-multi-1'
        };
        
        return langMap[langCode] || langMap['en'];
    }

    /**
     * Convert text to speech using Fish Speech API
     * @param {string} text - The text to convert
     * @param {string} voiceId - The voice ID
     * @param {number} speed - Speech speed (0.5 to 2.0)
     * @returns {Promise<string>} Base64-encoded audio data
     */
    async synthesize(text, voiceId = 'fishaudio-de-1', speed = 1.0) {
        const voices = FishSpeechEngine.getVoices();
        const voiceConfig = voices[voiceId];

        if (!voiceConfig) {
            throw new Error(`Invalid voice ID: ${voiceId}`);
        }

        try {
            this.logger.info(`Fish Speech TTS: Synthesizing with voice=${voiceId}, speed=${speed}`);

            const response = await axios.post(
                this.apiUrl,
                {
                    model: 'fishaudio-1',
                    input: text,
                    voice: voiceId,
                    speed: speed,
                    response_format: 'mp3'
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: this.timeout
                }
            );

            // Convert the response to base64
            const buffer = Buffer.from(response.data);
            const base64Audio = buffer.toString('base64');

            this.logger.info(`Fish Speech TTS: Successfully synthesized ${buffer.length} bytes`);
            return base64Audio;

        } catch (error) {
            // Enhanced error handling
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                this.logger.error(`Fish Speech TTS: Request timeout after ${this.timeout}ms`);
                throw new Error(`Fish Speech network error: timeout of ${this.timeout}ms exceeded`);
            } else if (error.response) {
                const status = error.response.status;
                const statusText = error.response.statusText;
                this.logger.error(`Fish Speech TTS: API error ${status} - ${statusText}`);
                
                if (status === 401) {
                    throw new Error('Fish Speech API authentication failed - invalid API key');
                } else if (status === 429) {
                    throw new Error('Fish Speech API rate limit exceeded');
                } else if (status === 500) {
                    throw new Error('Fish Speech API server error');
                } else {
                    throw new Error(`Fish Speech API error: ${status} ${statusText}`);
                }
            } else if (error.request) {
                this.logger.error(`Fish Speech TTS: No response from server - ${error.message}`);
                throw new Error(`Fish Speech network error: ${error.message}`);
            } else {
                this.logger.error(`Fish Speech TTS: Request setup error - ${error.message}`);
                throw new Error(`Fish Speech error: ${error.message}`);
            }
        }
    }

    /**
     * Update API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.logger.info('Fish Speech TTS: API key updated');
    }

    /**
     * Test the API connection
     */
    async testConnection() {
        try {
            await this.synthesize('Test', 'fishaudio-en-1', 1.0);
            return { success: true, message: 'Fish Speech API connection successful' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
}

module.exports = FishSpeechEngine;
