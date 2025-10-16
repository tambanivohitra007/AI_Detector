/**
 * Utility Functions Module
 * Reusable helper functions
 */

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Count words in text
 * @param {string} text - Text to count words in
 * @returns {number} Word count
 */
export function countWords(text) {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Validate text input
 * @param {string} text - Text to validate
 * @returns {{valid: boolean, message: string}}
 */
export function validateText(text) {
    if (!text || !text.trim()) {
        return { valid: false, message: 'Please enter some text to humanize.' };
    }

    if (text.length > 50000) {
        return { valid: false, message: 'Text is too long. Maximum 50,000 characters.' };
    }

    return { valid: true, message: '' };
}

/**
 * Sanitize HTML to prevent XSS
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Format error message for display
 * @param {Error} error - Error object
 * @returns {string} Formatted error message
 */
export function formatErrorMessage(error) {
    if (error.message) {
        return error.message;
    }
    return 'An unexpected error occurred. Please try again.';
}

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce function to limit execution rate
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
