/**
 * AI Text Humanizer Application
 * Main application entry point
 */

import { uiManager } from './modules/ui.js';
import { apiService } from './modules/api.js';
import { validateText, formatErrorMessage } from './modules/utils.js';
import { CONFIG } from './modules/config.js';

/**
 * Application Controller
 */
class App {
    constructor() {
        this.ui = uiManager;
        this.api = apiService;
    }

    /**
     * Initialize the application
     */
    async init() {
        // Initialize UI
        const success = this.ui.init();
        if (!success) {
            console.error('Failed to initialize UI');
            return;
        }

        // Attach event listeners
        this.ui.attachEventListeners({
            onInput: () => this.handleInput(),
            onRewrite: () => this.handleRewrite(),
            onCopy: () => this.handleCopy(),
            onClear: () => this.handleClear(),
            onSettingsToggle: () => this.handleSettingsToggle(),
            onSliderChange: (slider) => this.handleSliderChange(slider),
            onPresetClick: (preset) => this.handlePresetClick(preset),
            onLogout: () => this.handleLogout()
        });

        // Apply default preset
        this.handlePresetClick(CONFIG.DEFAULT_PRESET);

        // Pre-fetch signing token
        try {
            await this.api.fetchToken();
        } catch (err) {
            console.warn('Failed to pre-fetch signing token:', err);
        }

        // Initial word count update
        this.ui.updateWordCount();

        console.log('Application initialized successfully');
    }

    /**
     * Handle input text changes
     */
    handleInput() {
        this.ui.updateWordCount();
    }

    /**
     * Handle settings panel toggle
     */
    handleSettingsToggle() {
        this.ui.toggleSettings();
    }

    /**
     * Handle slider value change
     * @param {string} slider - 'perplexity' or 'burstiness'
     */
    handleSliderChange(slider) {
        this.ui.updateSliderDisplay(slider);
        const matchingPreset = this.findMatchingPreset();
        this.ui.updatePresetButtons(matchingPreset);
    }

    /**
     * Handle preset button click
     * @param {string} presetName - Preset key from CONFIG.PRESETS
     */
    handlePresetClick(presetName) {
        const preset = CONFIG.PRESETS[presetName];
        if (!preset) return;
        this.ui.applyPreset(preset);
        this.ui.updatePresetButtons(presetName);
    }

    /**
     * Find which preset matches the current slider values, if any
     * @returns {string|null} Matching preset key or null
     */
    findMatchingPreset() {
        const temperature = this.ui.getPerplexity();
        const frequencyPenalty = this.ui.getBurstiness();
        const tolerance = 0.01;

        for (const [name, preset] of Object.entries(CONFIG.PRESETS)) {
            if (Math.abs(preset.temperature - temperature) < tolerance &&
                Math.abs(preset.frequencyPenalty - frequencyPenalty) < tolerance) {
                return name;
            }
        }
        return null;
    }

    /**
     * Handle rewrite button click
     */
    async handleRewrite() {
        // Prevent multiple simultaneous requests
        if (this.ui.isProcessing()) {
            return;
        }

        // Get and validate input
        const inputText = this.ui.getInputText();
        const validation = validateText(inputText);

        if (!validation.valid) {
            this.ui.showStatus(validation.message, 'error');
            return;
        }

        // Prepare UI for processing
        this.ui.disableRewriteButton();
        this.ui.showLoading();
        this.ui.clearOutputText();
        this.ui.showStatus('Processing...', 'info');

        try {
            // Get humanization settings from sliders
            const settings = this.ui.getHumanizationSettings();

            // Call API to humanize text
            const humanizedText = await this.api.humanizeText(inputText, settings);

            // Display results
            this.ui.setOutputText(humanizedText);
            this.ui.showCopyButton();
            this.ui.showClearButton();
            this.ui.showStatus('✓ Text successfully humanized!', 'success');
        } catch (error) {
            console.error('Humanization error:', error);
            const errorMessage = formatErrorMessage(error);
            this.ui.showError(errorMessage);
            this.ui.showStatus('Failed to humanize text. Please try again.', 'error');
        } finally {
            // Reset UI state
            this.ui.enableRewriteButton();
            this.ui.hideLoading();
        }
    }

    /**
     * Handle copy button click
     */
    async handleCopy() {
        const success = await this.ui.copyToClipboard();

        if (success) {
            this.ui.showStatus('✓ Copied to clipboard!', 'success');
        } else {
            this.ui.showStatus('Failed to copy text.', 'error');
        }
    }

    /**
     * Handle clear button click
     */
    handleClear() {
        this.ui.clearAll();
    }

    /**
     * Handle logout
     */
    async handleLogout() {
        try {
            const csrf = document.cookie.split('; ').find(c => c.startsWith('_csrf='));
            const token = csrf ? decodeURIComponent(csrf.split('=')[1]) : '';
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'X-CSRF-Token': token }
            });
        } catch {
            // Proceed to redirect even if the call fails
        }
        window.location.href = '/login';
    }
}

/**
 * Initialize application when DOM is ready
 */
function initApp() {
    const app = new App();
    app.init();
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // DOM is already loaded
    setTimeout(initApp, 0);
}
