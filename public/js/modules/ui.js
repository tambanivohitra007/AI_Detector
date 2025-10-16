/**
 * UI Manager Module
 * Handles all DOM interactions and UI updates
 */

import { CONFIG } from './config.js';
import { countWords } from './utils.js';

/**
 * UI Manager class for handling DOM operations
 */
export class UIManager {
    constructor() {
        this.elements = {};
        this.state = {
            isProcessing: false
        };
    }

    /**
     * Initialize UI and cache DOM elements
     * @returns {boolean} Success status
     */
    init() {
        const elementIds = {
            inputText: 'input-text',
            outputText: 'output-text',
            rewriteBtn: 'rewrite-btn',
            copyBtn: 'copy-btn',
            clearBtn: 'clear-btn',
            wordCountValue: 'word-count-value',
            statusMessage: 'status-message',
            loadingSpinner: 'loading-spinner'
        };

        // Cache all elements with validation
        for (const [key, id] of Object.entries(elementIds)) {
            const element = document.getElementById(id);
            if (!element) {
                console.error(`Element with ID '${id}' not found!`);
                return false;
            }
            this.elements[key] = element;
        }

        return true;
    }

    /**
     * Get input text value
     * @returns {string}
     */
    getInputText() {
        return this.elements.inputText.value.trim();
    }

    /**
     * Set output text
     * @param {string} text - Text to display
     */
    setOutputText(text) {
        this.elements.outputText.textContent = text;
    }

    /**
     * Set output HTML
     * @param {string} html - HTML to display
     */
    setOutputHTML(html) {
        this.elements.outputText.innerHTML = html;
    }

    /**
     * Clear output text
     */
    clearOutputText() {
        this.setOutputHTML('<span class="text-gray-400 italic">Your humanized text will appear here...</span>');
    }

    /**
     * Update word count display
     */
    updateWordCount() {
        const text = this.getInputText();
        const wordCount = countWords(text);
        this.elements.wordCountValue.textContent = wordCount;
    }

    /**
     * Show loading spinner
     */
    showLoading() {
        this.elements.loadingSpinner.classList.remove('hidden');
        this.state.isProcessing = true;
    }

    /**
     * Hide loading spinner
     */
    hideLoading() {
        this.elements.loadingSpinner.classList.add('hidden');
        this.state.isProcessing = false;
    }

    /**
     * Enable rewrite button
     */
    enableRewriteButton() {
        this.elements.rewriteBtn.disabled = false;
    }

    /**
     * Disable rewrite button
     */
    disableRewriteButton() {
        this.elements.rewriteBtn.disabled = true;
    }

    /**
     * Show copy button
     */
    showCopyButton() {
        this.elements.copyBtn.classList.remove('hidden');
    }

    /**
     * Hide copy button
     */
    hideCopyButton() {
        this.elements.copyBtn.classList.add('hidden');
    }

    /**
     * Show clear button
     */
    showClearButton() {
        this.elements.clearBtn.classList.remove('hidden');
    }

    /**
     * Hide clear button
     */
    hideClearButton() {
        this.elements.clearBtn.classList.add('hidden');
    }

    /**
     * Show status message
     * @param {string} message - Message to display
     * @param {string} type - Message type ('success', 'error', 'info')
     */
    showStatus(message, type = 'info') {
        this.elements.statusMessage.textContent = message;
        this.elements.statusMessage.className = `text-sm ${
            type === 'success' ? 'text-green-600' :
            type === 'error' ? 'text-red-600' :
            'text-gray-600'
        }`;
    }

    /**
     * Clear status message
     */
    clearStatus() {
        this.elements.statusMessage.textContent = '';
    }

    /**
     * Show error message in output
     * @param {string} message - Error message
     */
    showError(message) {
        this.setOutputHTML(`<span class="text-red-600">An error occurred: ${message}</span>`);
    }

    /**
     * Check if currently processing
     * @returns {boolean}
     */
    isProcessing() {
        return this.state.isProcessing;
    }

    /**
     * Copy text to clipboard
     * @returns {Promise<boolean>} Success status
     */
    async copyToClipboard() {
        try {
            const text = this.elements.outputText.textContent;
            await navigator.clipboard.writeText(text);

            // Show temporary feedback
            const originalHTML = this.elements.copyBtn.innerHTML;
            this.elements.copyBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Copied!';

            setTimeout(() => {
                this.elements.copyBtn.innerHTML = originalHTML;
            }, CONFIG.COPY_FEEDBACK_DURATION);

            return true;
        } catch (error) {
            console.error('Copy failed:', error);
            return false;
        }
    }

    /**
     * Clear all inputs and outputs
     */
    clearAll() {
        this.elements.inputText.value = '';
        this.clearOutputText();
        this.hideCopyButton();
        this.hideClearButton();
        this.clearStatus();
        this.updateWordCount();
    }

    /**
     * Set up event listeners
     * @param {Object} handlers - Event handler functions
     */
    attachEventListeners(handlers) {
        if (handlers.onInput) {
            this.elements.inputText.addEventListener('input', handlers.onInput);
        }

        if (handlers.onRewrite) {
            this.elements.rewriteBtn.addEventListener('click', handlers.onRewrite);
        }

        if (handlers.onCopy) {
            this.elements.copyBtn.addEventListener('click', handlers.onCopy);
        }

        if (handlers.onClear) {
            this.elements.clearBtn.addEventListener('click', handlers.onClear);
        }
    }
}

// Export singleton instance
export const uiManager = new UIManager();
