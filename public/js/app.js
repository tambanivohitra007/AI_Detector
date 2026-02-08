/**
 * AI Text Humanizer Application
 * Main application entry point
 */

import { uiManager } from './modules/ui.js';
import { apiService } from './modules/api.js';
import { validateText, formatErrorMessage, sanitizeHTML } from './modules/utils.js';
import { CONFIG } from './modules/config.js';
import { loadHistory, saveEntry, deleteEntry, clearHistory, timeAgo } from './modules/history.js';
import { DocumentService } from './modules/document.js';

/**
 * Application Controller
 */
class App {
    constructor() {
        this.ui = uiManager;
        this.api = apiService;
        this.doc = new DocumentService(apiService);
        this.mode = 'text'; // 'text' or 'document'
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

        // History panel
        this.historyToggle = document.getElementById('history-toggle');
        this.historyChevron = document.getElementById('history-chevron');
        this.historyPanel = document.getElementById('history-panel');
        this.historyList = document.getElementById('history-list');
        this.historyEmpty = document.getElementById('history-empty');
        this.historyActions = document.getElementById('history-actions');
        this.historyCount = document.getElementById('history-count');

        this.historyToggle.addEventListener('click', () => {
            this.historyPanel.classList.toggle('open');
            this.historyChevron.classList.toggle('rotate-180');
        });

        document.getElementById('history-clear-btn').addEventListener('click', () => {
            clearHistory();
            this.renderHistory();
        });

        this.historyList.addEventListener('click', (e) => {
            const loadBtn = e.target.closest('[data-history-load]');
            const delBtn = e.target.closest('[data-history-delete]');
            if (loadBtn) {
                this.loadHistoryEntry(loadBtn.dataset.historyLoad);
            } else if (delBtn) {
                deleteEntry(delBtn.dataset.historyDelete);
                this.renderHistory();
            }
        });

        this.renderHistory();

        // Document mode wiring
        this.modeTextBtn = document.getElementById('mode-text-btn');
        this.modeDocBtn = document.getElementById('mode-doc-btn');
        this.docUploadZone = document.getElementById('doc-upload-zone');
        this.docDropzone = document.getElementById('doc-dropzone');
        this.docFileInput = document.getElementById('doc-file-input');
        this.docFileInfo = document.getElementById('doc-file-info');
        this.docFilename = document.getElementById('doc-filename');
        this.docStats = document.getElementById('doc-stats');
        this.docRemoveBtn = document.getElementById('doc-remove-btn');

        this.modeTextBtn.addEventListener('click', () => this.setMode('text'));
        this.modeDocBtn.addEventListener('click', () => this.setMode('document'));

        // Dropzone click
        this.docDropzone.addEventListener('click', () => this.docFileInput.click());

        // Drag events
        this.docDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.docDropzone.classList.add('dropzone-active');
        });
        this.docDropzone.addEventListener('dragleave', () => {
            this.docDropzone.classList.remove('dropzone-active');
        });
        this.docDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.docDropzone.classList.remove('dropzone-active');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFileUpload(file);
        });

        // File input change
        this.docFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleFileUpload(file);
            e.target.value = '';
        });

        // Remove file
        this.docRemoveBtn.addEventListener('click', () => {
            this.doc.reset();
            this.docFileInfo.classList.add('hidden');
            this.docDropzone.classList.remove('hidden');
            this.ui.elements.downloadBtn.classList.add('hidden');
        });

        // Download button
        this.ui.elements.downloadBtn.addEventListener('click', () => this.handleDownload());

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
        // Route to document humanization in document mode
        if (this.mode === 'document') {
            return this.handleDocumentHumanize();
        }

        // Prevent multiple simultaneous requests
        if (this.ui.isProcessing()) {
            return;
        }

        // Get and validate input
        const inputText = this.ui.getInputText();
        const validation = validateText(inputText);

        if (!validation.valid) {
            this.ui.showToast(validation.message, 'error');
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

            // Stream humanized text into the output panel
            this.ui.setOutputText('');
            this.ui.showStreamingCursor();
            this.ui.showStatus('Streaming...', 'info');

            const humanizedText = await this.api.humanizeTextStream(
                inputText,
                settings,
                (textSoFar) => {
                    this.ui.setOutputText(textSoFar);
                    this.ui.hideLoading();
                }
            );

            // Display results
            this.ui.hideStreamingCursor();
            this.ui.setOutputText(humanizedText);
            this.ui.showCopyButton();
            this.ui.showClearButton();
            this.ui.showStatus('Text successfully humanized!', 'success');
            this.ui.showToast('Text successfully humanized!', 'success');

            // Save to history
            saveEntry(inputText, humanizedText);
            this.renderHistory();
        } catch (error) {
            console.error('Humanization error:', error);
            const errorMessage = formatErrorMessage(error);
            this.ui.showError(errorMessage);
            this.ui.showStatus('Failed to humanize text. Please try again.', 'error');
            this.ui.showToast('Failed to humanize text', 'error');
        } finally {
            // Reset UI state
            this.ui.enableRewriteButton();
            this.ui.hideLoading();
            this.ui.hideStreamingCursor();
        }
    }

    /**
     * Set input mode: 'text' or 'document'
     */
    setMode(mode) {
        this.mode = mode;
        const isText = mode === 'text';

        // Toggle visibility
        this.ui.elements.inputText.classList.toggle('hidden', !isText);
        this.docUploadZone.classList.toggle('hidden', isText);

        // Toggle active button styles
        this.modeTextBtn.classList.toggle('bg-white', isText);
        this.modeTextBtn.classList.toggle('shadow-sm', isText);
        this.modeTextBtn.classList.toggle('text-gray-800', isText);
        this.modeTextBtn.classList.toggle('text-gray-500', !isText);

        this.modeDocBtn.classList.toggle('bg-white', !isText);
        this.modeDocBtn.classList.toggle('shadow-sm', !isText);
        this.modeDocBtn.classList.toggle('text-gray-800', !isText);
        this.modeDocBtn.classList.toggle('text-gray-500', isText);

        // Update button text
        const rewriteBtn = this.ui.elements.rewriteBtn;
        const svgHTML = rewriteBtn.querySelector('svg').outerHTML;
        const kbdHTML = rewriteBtn.querySelector('kbd')?.outerHTML || '';
        if (isText) {
            rewriteBtn.innerHTML = `${svgHTML} Humanize Text ${kbdHTML}`;
        } else {
            rewriteBtn.innerHTML = `${svgHTML} Humanize Document ${kbdHTML}`;
        }

        // Hide download button when switching modes
        this.ui.elements.downloadBtn.classList.add('hidden');
        this.ui.elements.docProgressContainer.classList.add('hidden');
    }

    /**
     * Handle file upload (validation + API call)
     */
    async handleFileUpload(file) {
        if (!file.name.toLowerCase().endsWith('.docx')) {
            this.ui.showToast('Please upload a .docx file', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            this.ui.showToast('File too large. Maximum size is 10MB.', 'error');
            return;
        }

        try {
            this.docDropzone.classList.add('hidden');
            this.docFileInfo.classList.remove('hidden');
            this.docFilename.textContent = file.name;
            this.docStats.textContent = 'Uploading...';

            const result = await this.doc.uploadFile(file);

            this.docStats.textContent = `${result.totalParagraphs} paragraphs, ${result.totalWords} words`;
            this.ui.showToast('Document uploaded successfully', 'success');
        } catch (error) {
            this.docDropzone.classList.remove('hidden');
            this.docFileInfo.classList.add('hidden');
            this.ui.showToast(error.message || 'Upload failed', 'error');
        }
    }

    /**
     * Handle document humanization with SSE progress
     */
    async handleDocumentHumanize() {
        if (!this.doc.hasDocument()) {
            this.ui.showToast('Please upload a document first', 'error');
            return;
        }

        this.ui.disableRewriteButton();
        this.ui.showLoading();
        this.ui.clearOutputText();
        this.ui.showStatus('Processing document...', 'info');
        this.ui.elements.downloadBtn.classList.add('hidden');

        // Show progress bar
        const progressContainer = this.ui.elements.docProgressContainer;
        const progressBar = this.ui.elements.docProgressBar;
        const progressLabel = this.ui.elements.docProgressLabel;
        const progressPercent = this.ui.elements.docProgressPercent;
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';
        progressLabel.textContent = 'Starting...';

        try {
            const settings = this.ui.getHumanizationSettings();

            const paragraphs = await this.doc.humanizeDocument(settings, ({ event, data }) => {
                if (event === 'progress') {
                    this.ui.hideLoading();
                    if (data.status === 'starting') {
                        progressLabel.textContent = `Processing ${data.totalChunks} chunk${data.totalChunks > 1 ? 's' : ''}...`;
                    } else if (data.status === 'processing') {
                        progressLabel.textContent = `Chunk ${data.chunk} of ${data.totalChunks}`;
                        progressBar.style.width = `${data.percent}%`;
                        progressPercent.textContent = `${data.percent}%`;
                    } else if (data.status === 'completed') {
                        progressBar.style.width = '100%';
                        progressPercent.textContent = '100%';
                        progressLabel.textContent = 'Complete!';
                    }
                } else if (event === 'error') {
                    this.ui.showToast(`Chunk ${data.chunk || '?'} failed — using original text`, 'error');
                } else if (event === 'complete') {
                    this.ui.setOutputText(data.paragraphs.join('\n\n'));
                    this.ui.showCopyButton();
                    this.ui.showClearButton();
                }
            });

            if (paragraphs.length > 0) {
                this.ui.setOutputText(paragraphs.join('\n\n'));
                this.ui.showCopyButton();
                this.ui.showClearButton();
                this.ui.elements.downloadBtn.classList.remove('hidden');
                this.ui.showStatus('Document successfully humanized!', 'success');
                this.ui.showToast('Document successfully humanized!', 'success');
            }
        } catch (error) {
            console.error('Document humanization error:', error);
            this.ui.showError(formatErrorMessage(error));
            this.ui.showStatus('Failed to humanize document.', 'error');
            this.ui.showToast('Failed to humanize document', 'error');
        } finally {
            this.ui.enableRewriteButton();
            this.ui.hideLoading();
        }
    }

    /**
     * Handle .docx download
     */
    async handleDownload() {
        try {
            this.ui.showToast('Generating document...', 'info');
            await this.doc.downloadDocx();
            this.ui.showToast('Document downloaded!', 'success');
        } catch (error) {
            console.error('Download error:', error);
            this.ui.showToast(error.message || 'Download failed', 'error');
        }
    }

    /**
     * Handle copy button click
     */
    async handleCopy() {
        const success = await this.ui.copyToClipboard();

        if (success) {
            this.ui.showStatus('Copied to clipboard!', 'success');
            this.ui.showToast('Copied to clipboard!', 'success');
        } else {
            this.ui.showStatus('Failed to copy text.', 'error');
            this.ui.showToast('Failed to copy text', 'error');
        }
    }

    /**
     * Handle clear button click
     */
    handleClear() {
        this.ui.clearAll();
        this.ui.elements.downloadBtn.classList.add('hidden');
        this.ui.elements.docProgressContainer.classList.add('hidden');
        if (this.mode === 'document') {
            this.doc.reset();
            this.docFileInfo.classList.add('hidden');
            this.docDropzone.classList.remove('hidden');
        }
    }

    /**
     * Render the history list
     */
    renderHistory() {
        const entries = loadHistory();
        this.historyCount.textContent = entries.length ? `(${entries.length})` : '';

        if (entries.length === 0) {
            this.historyList.innerHTML = '';
            this.historyEmpty.classList.remove('hidden');
            this.historyActions.classList.add('hidden');
            return;
        }

        this.historyEmpty.classList.add('hidden');
        this.historyActions.classList.remove('hidden');

        this.historyList.innerHTML = entries.map(e => `
            <div class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 group">
                <button data-history-load="${e.id}" class="flex-1 text-left min-w-0">
                    <p class="text-sm text-gray-800 truncate">${sanitizeHTML(e.input)}</p>
                    <p class="text-xs text-gray-400 mt-0.5">${timeAgo(e.ts)}</p>
                </button>
                <button data-history-delete="${e.id}" class="ml-3 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `).join('');
    }

    /**
     * Load a history entry into the input/output panels
     * @param {string} id
     */
    loadHistoryEntry(id) {
        const entry = loadHistory().find(e => e.id === id);
        if (!entry) return;
        this.ui.elements.inputText.value = entry.input;
        this.ui.setOutputText(entry.output);
        this.ui.showCopyButton();
        this.ui.showClearButton();
        this.ui.updateWordCount();
        this.ui.showStatus('Loaded from history', 'info');
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
