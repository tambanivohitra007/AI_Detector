/**
 * UI Manager Module
 * Handles all DOM interactions and UI updates
 */

import { CONFIG } from './config.js';
import { countWords, sanitizeHTML } from './utils.js';

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
            loadingSpinner: 'loading-spinner',
            settingsToggle: 'settings-toggle',
            settingsPanel: 'settings-panel',
            settingsChevron: 'settings-chevron',
            perplexitySlider: 'perplexity-slider',
            perplexityValue: 'perplexity-value',
            burstinessSlider: 'burstiness-slider',
            burstinessValue: 'burstiness-value'
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
        this.setOutputHTML(`<span class="text-red-600">An error occurred: ${sanitizeHTML(message)}</span>`);
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
     * Toggle settings panel visibility
     */
    toggleSettings() {
        this.elements.settingsPanel.classList.toggle('hidden');
        this.elements.settingsChevron.classList.toggle('rotate-180');
    }

    /**
     * Get perplexity slider value
     * @returns {number}
     */
    getPerplexity() {
        return parseFloat(this.elements.perplexitySlider.value);
    }

    /**
     * Get burstiness slider value
     * @returns {number}
     */
    getBurstiness() {
        return parseFloat(this.elements.burstinessSlider.value);
    }

    /**
     * Compute derived API parameters from slider values
     * @returns {Object} { temperature, top_p, frequency_penalty, presence_penalty }
     */
    getHumanizationSettings() {
        const temperature = this.getPerplexity();
        const topP = Math.min(1.0, Math.max(0.5, 1.0 - temperature * 0.075));
        const frequencyPenalty = this.getBurstiness();
        const presencePenalty = Math.min(2, Math.max(-2, frequencyPenalty * 0.667));

        return {
            temperature,
            top_p: parseFloat(topP.toFixed(3)),
            frequency_penalty: frequencyPenalty,
            presence_penalty: parseFloat(presencePenalty.toFixed(3))
        };
    }

    /**
     * Update a slider's displayed value badge
     * @param {string} slider - 'perplexity' or 'burstiness'
     */
    updateSliderDisplay(slider) {
        if (slider === 'perplexity') {
            this.elements.perplexityValue.textContent = parseFloat(this.elements.perplexitySlider.value).toFixed(2);
        } else if (slider === 'burstiness') {
            this.elements.burstinessValue.textContent = parseFloat(this.elements.burstinessSlider.value).toFixed(2);
        }
    }

    /**
     * Apply a preset to the sliders
     * @param {Object} preset - { temperature, frequencyPenalty }
     */
    applyPreset(preset) {
        this.elements.perplexitySlider.value = preset.temperature;
        this.elements.burstinessSlider.value = preset.frequencyPenalty;
        this.updateSliderDisplay('perplexity');
        this.updateSliderDisplay('burstiness');
    }

    /**
     * Highlight the active preset button, deactivate others
     * @param {string|null} presetName - Active preset key, or null for none
     */
    updatePresetButtons(presetName) {
        const buttons = document.querySelectorAll('.preset-btn');
        buttons.forEach(btn => {
            const isActive = btn.dataset.preset === presetName;
            btn.classList.toggle('active', isActive);
            if (isActive) {
                btn.classList.add('border-indigo-600', 'bg-indigo-600', 'text-white');
                btn.classList.remove('border-gray-300', 'text-gray-700');
            } else {
                btn.classList.remove('border-indigo-600', 'bg-indigo-600', 'text-white');
                btn.classList.add('border-gray-300', 'text-gray-700');
            }
        });
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

        if (handlers.onSettingsToggle) {
            this.elements.settingsToggle.addEventListener('click', handlers.onSettingsToggle);
        }

        if (handlers.onSliderChange) {
            this.elements.perplexitySlider.addEventListener('input', () => handlers.onSliderChange('perplexity'));
            this.elements.burstinessSlider.addEventListener('input', () => handlers.onSliderChange('burstiness'));
        }

        if (handlers.onPresetClick) {
            document.querySelectorAll('.preset-btn').forEach(btn => {
                btn.addEventListener('click', () => handlers.onPresetClick(btn.dataset.preset));
            });
        }
    }
}

// Export singleton instance
export const uiManager = new UIManager();
