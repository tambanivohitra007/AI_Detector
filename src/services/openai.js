/**
 * OpenAI Service
 * Handles interactions with OpenAI API
 */

const fetch = require('node-fetch');
const config = require('../config/env');

/**
 * OpenAI Service class
 */
class OpenAIService {
    constructor() {
        this.apiUrl = config.openaiApiUrl;
        this.apiKey = config.openaiApiKey;
    }

    /**
     * Make request to OpenAI API
     * @param {Object} payload - Request payload
     * @returns {Promise<Object>} API response
     */
    async makeRequest(payload) {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(payload),
                timeout: config.requestTimeout
            });

            const data = await response.json();

            if (!response.ok) {
                const error = new Error(data.error?.message || 'OpenAI API request failed');
                error.status = response.status;
                error.details = data;
                throw error;
            }

            return data;
        } catch (error) {
            // Enhance error message
            if (error.type === 'request-timeout') {
                error.message = 'Request to OpenAI timed out. Please try again.';
            } else if (error.code === 'ECONNREFUSED') {
                error.message = 'Could not connect to OpenAI API.';
            }
            throw error;
        }
    }

    /**
     * Validate request payload
     * @param {Object} payload - Payload to validate
     * @returns {{valid: boolean, error?: string}}
     */
    validatePayload(payload) {
        if (!payload.model) {
            return { valid: false, error: 'Model is required' };
        }

        if (!payload.messages || !Array.isArray(payload.messages)) {
            return { valid: false, error: 'Messages must be an array' };
        }

        if (payload.messages.length === 0) {
            return { valid: false, error: 'At least one message is required' };
        }

        // Validate message structure
        for (const message of payload.messages) {
            if (!message.role || !message.content) {
                return { valid: false, error: 'Each message must have role and content' };
            }
        }

        return { valid: true };
    }

    /**
     * Humanize text using OpenAI
     * @param {Object} payload - Request payload
     * @returns {Promise<Object>} API response
     */
    async humanizeText(payload) {
        // Validate payload
        const validation = this.validatePayload(payload);
        if (!validation.valid) {
            const error = new Error(validation.error);
            error.status = 400;
            throw error;
        }

        return await this.makeRequest(payload);
    }

    /**
     * Make a streaming request to OpenAI API
     * Returns the raw response body (a Node.js Readable stream of SSE events).
     * @param {Object} payload - Request payload (stream flag added automatically)
     * @returns {Promise<import('node-fetch').Response>} Raw fetch response
     */
    async makeStreamingRequest(payload) {
        const validation = this.validatePayload(payload);
        if (!validation.valid) {
            const error = new Error(validation.error);
            error.status = 400;
            throw error;
        }

        const streamPayload = {
            ...payload,
            stream: true,
            stream_options: { include_usage: true }
        };

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(streamPayload),
            timeout: config.requestTimeout
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            const error = new Error(data.error?.message || 'OpenAI API streaming request failed');
            error.status = response.status;
            throw error;
        }

        return response;
    }
}

// Export singleton instance
module.exports = new OpenAIService();
