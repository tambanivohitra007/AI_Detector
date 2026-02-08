/**
 * Document Routes
 * Handles .docx upload, humanization (with SSE progress), and download generation
 */

const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const { Document, Paragraph, TextRun, Packer } = require('docx');
const openaiService = require('../services/openai');
const audit = require('../services/audit');
const { requireSignedRequest } = require('../middleware/auth');
const config = require('../config/env');

const router = express.Router();

// Multer: memory storage, 10 MB limit, .docx only
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.docxMaxFileSize },
    fileFilter(_req, file, cb) {
        if (
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.originalname.toLowerCase().endsWith('.docx')
        ) {
            cb(null, true);
        } else {
            cb(new Error('Only .docx files are allowed.'));
        }
    }
});

/**
 * Document-specific system prompt — preserves paragraph structure
 */
const DOC_SYSTEM_PROMPT = `You are an expert academic editor and researcher. You are processing a SECTION of a larger document. Your task is to rewrite the provided text so that it reads unmistakably as written by a thoughtful human scholar while maintaining complete technical precision and logical integrity.

<INSTRUCTIONS>
1. Preserve the EXACT number of paragraphs. Each paragraph is separated by a double newline (\\n\\n). If the input has N paragraphs, the output MUST have exactly N paragraphs separated by double newlines.
2. Use a natural mix of sentence lengths and structures. Allow rhythm shifts, occasional fragments, parentheticals, or em dashes.
3. Rearrange clause positions when possible without altering meaning.
4. Alternate between formal transitions and conversational academic ones.
5. Introduce gentle traces of reflection or uncertainty that mirror authentic scholarly reasoning.
6. Allow occasional stylistic asymmetry — real human prose is not machine-perfect.
7. Use nuanced, domain-appropriate synonyms instead of overused AI-trigger terms.
8. Vary rhythm, punctuation, and connective logic to create authentic burstiness.
</INSTRUCTIONS>

<OUTPUT_REQUIREMENTS>
- Return ONLY the rewritten text
- Preserve the EXACT number of paragraphs separated by double newlines
- Do NOT include explanations, comments, or metadata
- Maintain technical accuracy and original meaning
</OUTPUT_REQUIREMENTS>`;

/**
 * Group paragraphs into chunks of ~targetWords words each.
 * Never splits a paragraph across chunks.
 */
function chunkParagraphs(paragraphs, targetWords) {
    const chunks = [];
    let current = [];
    let wordCount = 0;

    for (let i = 0; i < paragraphs.length; i++) {
        const pWords = paragraphs[i].split(/\s+/).filter(Boolean).length;

        // Start a new chunk if adding this paragraph would exceed 1.5x target
        // and the current chunk already has content
        if (current.length > 0 && wordCount + pWords > targetWords * 1.5 && wordCount >= targetWords) {
            chunks.push(current);
            current = [];
            wordCount = 0;
        }

        current.push(paragraphs[i]);
        wordCount += pWords;

        // Close chunk when we've reached the target
        if (wordCount >= targetWords && i < paragraphs.length - 1) {
            chunks.push(current);
            current = [];
            wordCount = 0;
        }
    }

    // Push remaining paragraphs
    if (current.length > 0) {
        chunks.push(current);
    }

    return chunks;
}

/**
 * POST /api/document/upload
 * Upload a .docx file, extract paragraphs, return metadata
 */
router.post('/upload', (req, res, next) => {
    upload.single('file')(req, res, async (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ error: { message: `File too large. Maximum size is ${Math.round(config.docxMaxFileSize / 1024 / 1024)}MB.` } });
                }
                return res.status(400).json({ error: { message: err.message } });
            }
            return res.status(400).json({ error: { message: err.message || 'File upload failed.' } });
        }

        if (!req.file) {
            return res.status(400).json({ error: { message: 'No file uploaded.' } });
        }

        try {
            const result = await mammoth.extractRawText({ buffer: req.file.buffer });
            const paragraphs = result.value
                .split(/\n\n+/)
                .map(p => p.trim())
                .filter(p => p.length > 0);

            const totalWords = paragraphs.reduce((sum, p) => sum + p.split(/\s+/).filter(Boolean).length, 0);

            audit.log('docx_upload', {
                user: audit.userName(req),
                ip: audit.ip(req),
                filename: req.file.originalname,
                paragraphs: paragraphs.length,
                words: totalWords
            });

            res.json({
                filename: req.file.originalname,
                paragraphs,
                totalWords,
                totalParagraphs: paragraphs.length
            });
        } catch (error) {
            next(error);
        }
    });
});

/**
 * POST /api/document/humanize
 * Humanize document paragraphs in chunks via SSE progress events
 */
router.post('/humanize', requireSignedRequest, async (req, res) => {
    const { paragraphs, settings, filename } = req.body || {};

    if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
        return res.status(400).json({ error: { message: 'Paragraphs array is required.' } });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let aborted = false;
    req.on('close', () => { aborted = true; });

    const sendEvent = (event, data) => {
        if (aborted) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const chunks = chunkParagraphs(paragraphs, config.docxChunkTargetWords);
        const allResults = [];
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        sendEvent('progress', { status: 'starting', totalChunks: chunks.length });

        for (let i = 0; i < chunks.length; i++) {
            if (aborted) break;

            sendEvent('progress', {
                status: 'processing',
                chunk: i + 1,
                totalChunks: chunks.length,
                percent: Math.round(((i) / chunks.length) * 100)
            });

            const chunkText = chunks[i].join('\n\n');

            // Build payload for this chunk
            const payload = {
                model: settings?.model || 'gpt-5',
                messages: [
                    { role: 'system', content: DOC_SYSTEM_PROMPT },
                    { role: 'user', content: chunkText }
                ],
                max_completion_tokens: config.docxMaxOutputTokens,
                reasoning_effort: 'medium',
                verbosity: 'medium'
            };

            // Apply sampling parameters if provided
            if (settings) {
                if (typeof settings.temperature === 'number') payload.temperature = settings.temperature;
                if (typeof settings.top_p === 'number') payload.top_p = settings.top_p;
                if (typeof settings.frequency_penalty === 'number') payload.frequency_penalty = settings.frequency_penalty;
                if (typeof settings.presence_penalty === 'number') payload.presence_penalty = settings.presence_penalty;
            }

            try {
                const result = await openaiService.humanizeText(payload);
                const content = result.choices?.[0]?.message?.content || '';
                const resultParagraphs = content.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
                allResults.push(...resultParagraphs);

                if (result.usage) {
                    totalPromptTokens += result.usage.prompt_tokens || 0;
                    totalCompletionTokens += result.usage.completion_tokens || 0;
                }
            } catch (chunkError) {
                console.error(`Chunk ${i + 1} failed:`, chunkError.message);
                sendEvent('error', {
                    chunk: i + 1,
                    message: chunkError.message || 'Chunk processing failed'
                });
                // Fall back to original text for this chunk
                allResults.push(...chunks[i]);
            }
        }

        sendEvent('progress', {
            status: 'completed',
            chunk: chunks.length,
            totalChunks: chunks.length,
            percent: 100
        });

        sendEvent('complete', {
            paragraphs: allResults,
            totalParagraphs: allResults.length
        });

        audit.log('docx_humanize', {
            user: audit.userName(req),
            ip: audit.ip(req),
            filename: filename || 'unknown',
            inputParagraphs: paragraphs.length,
            outputParagraphs: allResults.length,
            chunks: chunks.length,
            prompt_tokens: totalPromptTokens,
            completion_tokens: totalCompletionTokens,
            total_tokens: totalPromptTokens + totalCompletionTokens
        });
    } catch (error) {
        sendEvent('error', { message: error.message || 'Humanization failed.' });
    } finally {
        if (!aborted) res.end();
    }
});

/**
 * POST /api/document/generate
 * Generate a .docx file from humanized paragraphs and send as download
 */
router.post('/generate', async (req, res, next) => {
    const { paragraphs, filename } = req.body || {};

    if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
        return res.status(400).json({ error: { message: 'Paragraphs array is required.' } });
    }

    try {
        const doc = new Document({
            sections: [{
                children: paragraphs.map(text =>
                    new Paragraph({
                        children: [
                            new TextRun({
                                text,
                                font: 'Times New Roman',
                                size: 24 // 12pt in half-points
                            })
                        ]
                    })
                )
            }]
        });

        const buffer = await Packer.toBuffer(doc);

        // Build output filename
        const baseName = (filename || 'document').replace(/\.docx$/i, '');
        const outputName = `${baseName}_humanized.docx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
        res.setHeader('Content-Length', buffer.length);

        audit.log('docx_generate', {
            user: audit.userName(req),
            ip: audit.ip(req),
            filename: outputName,
            paragraphs: paragraphs.length
        });

        res.end(buffer);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
