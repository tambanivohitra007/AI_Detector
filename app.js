/**
 * AI Text Humanizer Application
 * Transforms AI-generated text into natural, human-like academic writing
 */

// Configuration
const CONFIG = {
    // API_URL: "http://10.0.1.101:3000/api/rewrite",
    API_URL: "http://10.0.1.7:3000/api/rewrite",
    MODEL: "gpt-5",
    MAX_OUTPUT_TOKENS: 8192,
    REASONING_EFFORT: "medium",
    VERBOSITY: "medium",
    MAX_RETRY_ATTEMPTS: 3,
    INITIAL_RETRY_DELAY: 1000
};

// DOM Elements
const elements = {
    inputText: null,
    outputText: null,
    rewriteBtn: null,
    copyBtn: null,
    clearBtn: null,
    wordCountValue: null,
    statusMessage: null,
    loadingSpinner: null
};

// Application state
const appState = {
    isProcessing: false
};

/**
 * Initialize the application
 */
function init() {
    // Cache DOM elements with error checking
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

    // Check each element exists before caching
    for (const [key, id] of Object.entries(elementIds)) {
        const element = document.getElementById(id);
        if (!element) {
            console.error(`Element with ID '${id}' not found!`);
            return; // Stop initialization if any element is missing
        }
        elements[key] = element;
    }

    // Attach event listeners
    attachEventListeners();

    // Initial word count update
    updateWordCount();
}

/**
 * Attach all event listeners
 */
function attachEventListeners() {
    // Add null checks before attaching event listeners
    if (elements.inputText) {
        elements.inputText.addEventListener('input', updateWordCount);
    }
    
    if (elements.rewriteBtn) {
        elements.rewriteBtn.addEventListener('click', handleRewrite);
    }
    
    if (elements.copyBtn) {
        elements.copyBtn.addEventListener('click', handleCopy);
    }
    
    if (elements.clearBtn) {
        elements.clearBtn.addEventListener('click', handleClear);
    }
}

/**
 * Update word count
 */
function updateWordCount() {
    const text = elements.inputText.value.trim();
    const wordCount = text ? text.split(/\s+/).length : 0;
    elements.wordCountValue.textContent = wordCount;
}

/**
 * Handle rewrite button click
 */
async function handleRewrite() {
    const inputText = elements.inputText.value.trim();

    if (!inputText) {
        showStatus('Please enter some text to humanize.', 'error');
        return;
    }

    if (appState.isProcessing) {
        return;
    }

    appState.isProcessing = true;
    elements.rewriteBtn.disabled = true;
    elements.loadingSpinner.classList.remove('hidden');
    elements.outputText.innerHTML = '';
    showStatus('Processing...', 'info');

    try {
        const rewrittenText = await callHumanizeAPI(inputText);

        elements.outputText.textContent = rewrittenText;
        elements.copyBtn.classList.remove('hidden');
        elements.clearBtn.classList.remove('hidden');
        showStatus('✓ Text successfully humanized!', 'success');
    } catch (error) {
        console.error('Error:', error);
        elements.outputText.innerHTML = '<span class="text-red-600">An error occurred: ' + error.message + '</span>';
        showStatus('Failed to humanize text. Please try again.', 'error');
    } finally {
        appState.isProcessing = false;
        elements.rewriteBtn.disabled = false;
        elements.loadingSpinner.classList.add('hidden');
    }
}

/**
 * Call the API to humanize text
 * @param {string} text - The text to humanize
 * @returns {Promise<string>} - The humanized text
 */
async function callHumanizeAPI(text) {
    const systemPrompt = `You are an expert academic editor and researcher. Your task is to rewrite the provided academic text so that it maintains complete technical precision and logical integrity but reads unmistakably as written, revised, and refined by a thoughtful human scholar. The output should reflect genuine authorial voice, subtle stylistic imperfections, and natural variation in rhythm and reasoning—qualities that make human writing linguistically unpredictable and contextually rich.

<INSTRUCTIONS>
Follow these guidelines carefully:

1. Sentence Variation: Use a natural mix of concise, medium, and extended sentences. Allow rhythm shifts—occasional fragments, parentheticals, or em dashes are welcome.

2. Clause Reordering: Rearrange sentence structures or clause positions when possible without altering meaning. Avoid overly uniform syntax.

3. Transitional Diversity: Alternate between formal transitions ("consequently," "notably") and conversational academic ones ("after all," "that said," "at this point"). Vary pacing between ideas.

4. Human Reasoning: Introduce gentle traces of reflection or uncertainty (“one might wonder,” “it seems plausible,” “arguably,” “in my view”) that mirror authentic scholarly reasoning.

5. Stylistic Imperfection: Allow occasional asymmetry or non-linear phrasing. Real human prose does not read like a machine-perfect pattern.

6. Disciplinary Realism: Use terminology and phrasing genuinely tied to the academic field—avoid generic AI-like filler such as “this plays a key role” or “this is significant.”

7. Contextual Infusion: Enrich the narrative with cause-and-effect insights or interpretive commentary (“these findings, taken together, suggest…” or “this may reveal a deeper connection…”).

8. Tone Dynamics: Maintain a formal scholarly tone, but weave in slight tonal variations—moments of curiosity, emphasis, or restrained skepticism—as a human academic would.

9. Lexical Novelty: Use nuanced, domain-appropriate synonyms instead of overused AI-trigger terms. Slightly vary phrasing across paragraphs.

10. Controlled Randomness: Vary rhythm, punctuation, and connective logic just enough to create authentic burstiness. The prose should feel edited, not generated.

11. Draft Realism: The text should feel as if it has gone through a few thoughtful revisions by an experienced researcher—polished but not mechanically consistent.

</INSTRUCTIONS>

<OUTPUT_REQUIREMENTS>
- Return ONLY the rewritten text
- Do NOT include explanations, comments, or metadata
- Preserve original meaning and structure
- Maintain technical accuracy and academic rigor
- Produce text that statistically reads as human-written (high variability, natural imperfections, and stylistic nuance)
</OUTPUT_REQUIREMENTS>`;


    const payload = {
        model: CONFIG.MODEL,
        messages: [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: text
            }
        ],
        max_completion_tokens: CONFIG.MAX_OUTPUT_TOKENS,
        reasoning_effort: CONFIG.REASONING_EFFORT,
        verbosity: CONFIG.VERBOSITY
    };

    let attempts = 0;
    let delay = CONFIG.INITIAL_RETRY_DELAY;

    while (attempts < CONFIG.MAX_RETRY_ATTEMPTS) {
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();

                if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
                    return result.choices[0].message.content;
                } else {
                    throw new Error('API returned unexpected response structure.');
                }
            } else if (response.status === 429 || response.status >= 500) {
                attempts++;
                if (attempts >= CONFIG.MAX_RETRY_ATTEMPTS) {
                    const errorData = await response.json();
                    throw new Error(`API request failed: ${errorData.error?.message || response.statusText}`);
                }
                await sleep(delay);
                delay *= 2;
            } else {
                const errorData = await response.json();
                throw new Error(`API request failed: ${errorData.error?.message || response.statusText}`);
            }
        } catch (error) {
            attempts++;
            if (attempts >= CONFIG.MAX_RETRY_ATTEMPTS) {
                throw error;
            }
            await sleep(delay);
            delay *= 2;
        }
    }

    throw new Error('API request failed after multiple retries.');
}

/**
 * Handle copy button click
 */
async function handleCopy() {
    const text = elements.outputText.textContent;

    try {
        await navigator.clipboard.writeText(text);
        showStatus('✓ Copied to clipboard!', 'success');

        // Temporary button feedback
        const originalText = elements.copyBtn.innerHTML;
        elements.copyBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Copied!';

        setTimeout(() => {
            elements.copyBtn.innerHTML = originalText;
        }, 2000);
    } catch (error) {
        showStatus('Failed to copy text.', 'error');
    }
}

/**
 * Handle clear button click
 */
function handleClear() {
    elements.inputText.value = '';
    elements.outputText.innerHTML = '<span class="text-gray-400 italic">Your humanized text will appear here...</span>';
    elements.copyBtn.classList.add('hidden');
    elements.clearBtn.classList.add('hidden');
    elements.statusMessage.textContent = '';
    updateWordCount();
}

/**
 * Show status message
 * @param {string} message - The message to display
 * @param {string} type - The type of message ('success', 'error', 'info')
 */
function showStatus(message, type = 'info') {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `text-sm ${
        type === 'success' ? 'text-green-600' :
        type === 'error' ? 'text-red-600' :
        'text-gray-600'
    }`;
}

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - A promise that resolves after the specified time
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize the application when DOM is loaded
function waitForDOM() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM is already loaded
        setTimeout(init, 0); // Use setTimeout to ensure all elements are rendered
    }
}

// Start the initialization process
waitForDOM();
