/**
 * API Service Module
 * Handles all API interactions
 */

import { CONFIG } from './config.js';
import { sleep } from './utils.js';

// Reasoning models that don't support sampling parameters
const REASONING_MODELS = ['o1', 'o1-mini', 'o1-preview', 'o3', 'o3-mini', 'o4-mini', 'gpt-5'];

/**
 * API Service class for handling OpenAI requests
 */
export class APIService {
    constructor(config = {}) {
        this.config = { ...CONFIG, ...config };
    }

    /**
     * Check if the current model is a reasoning model
     * @returns {boolean}
     */
    isReasoningModel() {
        return REASONING_MODELS.some(m => this.config.MODEL.startsWith(m));
    }

    /**
     * Build API payload
     * @param {string} text - Text to humanize
     * @param {Object} settings - Humanization settings (temperature, top_p, frequency_penalty, presence_penalty)
     * @returns {Object} API payload
     */
    buildPayload(text, settings = {}) {
        const payload = {
            model: this.config.MODEL,
            messages: [
                {
                    role: "system",
                    content: this.config.SYSTEM_PROMPT
                },
                {
                    role: "user",
                    content: text
                }
            ],
            max_completion_tokens: this.config.MAX_OUTPUT_TOKENS,
            reasoning_effort: this.config.REASONING_EFFORT,
            verbosity: this.config.VERBOSITY
        };

        // Only inject sampling params for models that support them
        if (!this.isReasoningModel()) {
            if (settings.temperature !== undefined) payload.temperature = settings.temperature;
            if (settings.top_p !== undefined) payload.top_p = settings.top_p;
            if (settings.frequency_penalty !== undefined) payload.frequency_penalty = settings.frequency_penalty;
            if (settings.presence_penalty !== undefined) payload.presence_penalty = settings.presence_penalty;
        }

        return payload;
    }

    /**
     * Make API request with retry logic
     * @param {Object} payload - Request payload
     * @returns {Promise<Object>} API response
     */
    async makeRequest(payload) {
        let attempts = 0;
        let delay = this.config.INITIAL_RETRY_DELAY;

        while (attempts < this.config.MAX_RETRY_ATTEMPTS) {
            try {
                const response = await fetch(this.config.API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const result = await response.json();
                    return this.extractContent(result);
                } else if (response.status === 429 || response.status >= 500) {
                    // Retry on rate limit or server errors
                    attempts++;
                    if (attempts >= this.config.MAX_RETRY_ATTEMPTS) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(`API request failed: ${errorData.error?.message || response.statusText}`);
                    }
                    await sleep(delay);
                    delay *= 2; // Exponential backoff
                } else {
                    // Don't retry on client errors
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`API request failed: ${errorData.error?.message || response.statusText}`);
                }
            } catch (error) {
                if (error.name === 'TypeError' && error.message.includes('fetch')) {
                    // Network error
                    attempts++;
                    if (attempts >= this.config.MAX_RETRY_ATTEMPTS) {
                        throw new Error('Network error. Please check your connection and try again.');
                    }
                    await sleep(delay);
                    delay *= 2;
                } else {
                    throw error;
                }
            }
        }

        throw new Error('API request failed after multiple retries.');
    }

    /**
     * Extract content from API response
     * @param {Object} result - API response
     * @returns {string} Extracted content
     */
    extractContent(result) {
        if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
            return result.choices[0].message.content;
        }
        throw new Error('API returned unexpected response structure.');
    }

    /**
     * Humanize text using API
     * @param {string} text - Text to humanize
     * @param {Object} settings - Humanization settings
     * @returns {Promise<string>} Humanized text
     */
    async humanizeText(text, settings = {}) {
        const payload = this.buildPayload(text, settings);
        return await this.makeRequest(payload);
    }

    /**
     * Update API configuration
     * @param {Object} newConfig - New configuration values
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
}

// Export singleton instance
export const apiService = new APIService();
