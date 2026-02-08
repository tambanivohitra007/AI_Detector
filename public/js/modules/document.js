/**
 * Document Service Module
 * Handles .docx file upload, humanization via SSE, and download generation
 */

/**
 * Read the CSRF double-submit cookie
 * @returns {string}
 */
function getCsrfToken() {
    const match = document.cookie.split('; ').find(c => c.startsWith('_csrf='));
    return match ? decodeURIComponent(match.split('=')[1]) : '';
}

export class DocumentService {
    constructor(apiService) {
        this.api = apiService;
        this.uploadedFilename = null;
        this.uploadedParagraphs = null;
        this.humanizedParagraphs = null;
    }

    /**
     * Upload a .docx file and extract paragraphs
     * @param {File} file
     * @returns {Promise<Object>} { filename, paragraphs, totalWords, totalParagraphs }
     */
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/document/upload', {
            method: 'POST',
            headers: {
                'X-CSRF-Token': getCsrfToken()
            },
            body: formData
        });

        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/login';
                throw new Error('Session expired.');
            }
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Upload failed.');
        }

        const data = await response.json();
        this.uploadedFilename = data.filename;
        this.uploadedParagraphs = data.paragraphs;
        return data;
    }

    /**
     * Humanize the uploaded document via SSE progress events
     * @param {Object} settings - Humanization settings from sliders
     * @param {function(Object): void} onProgress - Callback for progress/error/complete events
     * @returns {Promise<string[]>} Humanized paragraphs
     */
    async humanizeDocument(settings, onProgress) {
        if (!this.uploadedParagraphs) {
            throw new Error('No document uploaded.');
        }

        await this.api.ensureToken();

        const response = await fetch('/api/document/humanize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Request-Token': this.api.token,
                'X-Request-Timestamp': String(this.api.tokenTimestamp),
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify({
                paragraphs: this.uploadedParagraphs,
                settings: {
                    ...settings,
                    model: this.api.config.MODEL
                },
                filename: this.uploadedFilename
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/login';
                throw new Error('Session expired.');
            }
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Humanization failed.');
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            let currentEvent = null;
            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    currentEvent = line.slice(7).trim();
                } else if (line.startsWith('data: ') && currentEvent) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        onProgress({ event: currentEvent, data });

                        if (currentEvent === 'complete' && data.paragraphs) {
                            this.humanizedParagraphs = data.paragraphs;
                        }
                    } catch { /* partial JSON */ }
                    currentEvent = null;
                }
            }
        }

        this.api.fetchToken().catch(() => {});
        return this.humanizedParagraphs || [];
    }

    /**
     * Download humanized paragraphs as a .docx file
     */
    async downloadDocx() {
        if (!this.humanizedParagraphs) {
            throw new Error('No humanized document to download.');
        }

        const response = await fetch('/api/document/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            },
            body: JSON.stringify({
                paragraphs: this.humanizedParagraphs,
                filename: this.uploadedFilename
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/login';
                throw new Error('Session expired.');
            }
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Download generation failed.');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const baseName = (this.uploadedFilename || 'document').replace(/\.docx$/i, '');
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}_humanized.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Reset all document state
     */
    reset() {
        this.uploadedFilename = null;
        this.uploadedParagraphs = null;
        this.humanizedParagraphs = null;
    }

    /**
     * Check if a document has been uploaded
     * @returns {boolean}
     */
    hasDocument() {
        return this.uploadedParagraphs !== null && this.uploadedParagraphs.length > 0;
    }

    /**
     * Check if a humanized result is available
     * @returns {boolean}
     */
    hasResult() {
        return this.humanizedParagraphs !== null && this.humanizedParagraphs.length > 0;
    }
}
