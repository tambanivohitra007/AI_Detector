/**
 * AI Text Humanizer Application
 * Main application entry point
 */

import { uiManager } from './modules/ui.js';
import { apiService } from './modules/api.js';
import { validateText, formatErrorMessage } from './modules/utils.js';

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
            onClear: () => this.handleClear()
        });

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
            // Call API to humanize text
            const humanizedText = await this.api.humanizeText(inputText);

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
