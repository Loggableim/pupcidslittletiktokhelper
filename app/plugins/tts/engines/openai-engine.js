const OpenAI = require('openai');

/**
 * OpenAI Text-to-Speech Engine
 * High-quality TTS using OpenAI's TTS API (requires API key)
 */
class OpenAIEngine {
    constructor(apiKey, logger, config = {}) {
        this.apiKey = apiKey;
        this.logger = logger;
        this.client = new OpenAI({ apiKey });
        
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
            this.timeout = config.timeout || 10000; // 10s timeout (reduced from 15s)
            this.maxRetries = config.maxRetries || 2;  // 2 retries (3 attempts total)
        }
        
        this.performanceMode = performanceMode;
        this.logger.info(`OpenAI TTS: Performance mode set to '${performanceMode}' (timeout: ${this.timeout}ms, retries: ${this.maxRetries})`);
    }

    /**
     * Get all available OpenAI TTS voices
     */
    static getVoices() {
        return {
            // GPT-4o Mini TTS voices
            'gpt-4o-mini-tts-alloy': { name: 'GPT-4o Mini TTS (Alloy)', lang: 'multi', gender: 'neutral', model: 'gpt-4o-mini-tts', voice: 'alloy' },
            'gpt-4o-mini-tts-echo': { name: 'GPT-4o Mini TTS (Echo)', lang: 'multi', gender: 'male', model: 'gpt-4o-mini-tts', voice: 'echo' },
            'gpt-4o-mini-tts-fable': { name: 'GPT-4o Mini TTS (Fable)', lang: 'multi', gender: 'neutral', model: 'gpt-4o-mini-tts', voice: 'fable' },
            'gpt-4o-mini-tts-onyx': { name: 'GPT-4o Mini TTS (Onyx)', lang: 'multi', gender: 'male', model: 'gpt-4o-mini-tts', voice: 'onyx' },
            'gpt-4o-mini-tts-nova': { name: 'GPT-4o Mini TTS (Nova)', lang: 'multi', gender: 'female', model: 'gpt-4o-mini-tts', voice: 'nova' },
            'gpt-4o-mini-tts-shimmer': { name: 'GPT-4o Mini TTS (Shimmer)', lang: 'multi', gender: 'female', model: 'gpt-4o-mini-tts', voice: 'shimmer' },
            
            // Standard TTS-1 voices (fallback)
            'tts-1-alloy': { name: 'OpenAI TTS-1 (Alloy)', lang: 'multi', gender: 'neutral', model: 'tts-1', voice: 'alloy' },
            'tts-1-echo': { name: 'OpenAI TTS-1 (Echo)', lang: 'multi', gender: 'male', model: 'tts-1', voice: 'echo' },
            'tts-1-fable': { name: 'OpenAI TTS-1 (Fable)', lang: 'multi', gender: 'neutral', model: 'tts-1', voice: 'fable' },
            'tts-1-onyx': { name: 'OpenAI TTS-1 (Onyx)', lang: 'multi', gender: 'male', model: 'tts-1', voice: 'onyx' },
            'tts-1-nova': { name: 'OpenAI TTS-1 (Nova)', lang: 'multi', gender: 'female', model: 'tts-1', voice: 'nova' },
            'tts-1-shimmer': { name: 'OpenAI TTS-1 (Shimmer)', lang: 'multi', gender: 'female', model: 'tts-1', voice: 'shimmer' },
            
            // HD TTS-1-HD voices (highest quality)
            'tts-1-hd-alloy': { name: 'OpenAI TTS-1-HD (Alloy)', lang: 'multi', gender: 'neutral', model: 'tts-1-hd', voice: 'alloy' },
            'tts-1-hd-echo': { name: 'OpenAI TTS-1-HD (Echo)', lang: 'multi', gender: 'male', model: 'tts-1-hd', voice: 'echo' },
            'tts-1-hd-fable': { name: 'OpenAI TTS-1-HD (Fable)', lang: 'multi', gender: 'neutral', model: 'tts-1-hd', voice: 'fable' },
            'tts-1-hd-onyx': { name: 'OpenAI TTS-1-HD (Onyx)', lang: 'multi', gender: 'male', model: 'tts-1-hd', voice: 'onyx' },
            'tts-1-hd-nova': { name: 'OpenAI TTS-1-HD (Nova)', lang: 'multi', gender: 'female', model: 'tts-1-hd', voice: 'nova' },
            'tts-1-hd-shimmer': { name: 'OpenAI TTS-1-HD (Shimmer)', lang: 'multi', gender: 'female', model: 'tts-1-hd', voice: 'shimmer' }
        };
    }

    /**
     * Convert text to speech using OpenAI TTS
     * @param {string} text - The text to convert
     * @param {string} voiceId - The voice ID (e.g., 'gpt-4o-mini-tts-alloy')
     * @param {object} options - Additional options
     * @returns {Promise<Buffer>} Audio buffer
     */
    async synthesize(text, voiceId = 'gpt-4o-mini-tts-alloy', options = {}) {
        const voices = OpenAIEngine.getVoices();
        const voiceConfig = voices[voiceId];

        if (!voiceConfig) {
            throw new Error(`Invalid voice ID: ${voiceId}`);
        }

        const { model, voice } = voiceConfig;

        try {
            this.logger.info(`OpenAI TTS: Synthesizing with model=${model}, voice=${voice}`);

            const response = await this.client.audio.speech.create({
                model: model,
                voice: voice,
                input: text,
                response_format: options.format || 'mp3',
                speed: options.speed || 1.0
            });

            // Convert the response to a buffer
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            this.logger.info(`OpenAI TTS: Successfully synthesized ${buffer.length} bytes`);
            return buffer;

        } catch (error) {
            this.logger.error(`OpenAI TTS: Synthesis failed - ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if the engine is ready to use
     * @returns {Promise<boolean>}
     */
    async isReady() {
        try {
            // Test by listing available models
            await this.client.models.list();
            return true;
        } catch (error) {
            this.logger.error(`OpenAI TTS: Engine not ready - ${error.message}`);
            return false;
        }
    }

    /**
     * Get engine info
     */
    getInfo() {
        return {
            name: 'OpenAI TTS',
            description: 'High-quality text-to-speech using OpenAI API',
            requiresApiKey: true,
            supportedFormats: ['mp3', 'opus', 'aac', 'flac'],
            supportedLanguages: ['multi'], // Supports multiple languages automatically
            maxTextLength: 4096
        };
    }
}

module.exports = OpenAIEngine;
