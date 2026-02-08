/**
 * History Module
 * Persists humanization results in localStorage.
 */

const STORAGE_KEY = 'humanizer_history';
const MAX_ENTRIES = 20;

/**
 * @typedef {Object} HistoryEntry
 * @property {string} id
 * @property {string} input - First 200 chars of the original text
 * @property {string} output - Full humanized text
 * @property {number} ts - Timestamp
 */

/**
 * Load history from localStorage
 * @returns {HistoryEntry[]}
 */
export function loadHistory() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}

/**
 * Save a new entry, keeping only the most recent MAX_ENTRIES
 * @param {string} input
 * @param {string} output
 */
export function saveEntry(input, output) {
    const entries = loadHistory();
    entries.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        input: input.slice(0, 200),
        output,
        ts: Date.now()
    });
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/**
 * Delete a single entry by id
 * @param {string} id
 */
export function deleteEntry(id) {
    const entries = loadHistory().filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/**
 * Clear all history
 */
export function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Format a relative time string
 * @param {number} ts
 * @returns {string}
 */
export function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
