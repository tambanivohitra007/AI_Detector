# AI Text Humanizer

Transform AI-generated text into natural, human-like academic writing that passes AI detection.

## Features

- **Text Humanization** — Paste text and get a human-sounding rewrite with real-time streaming
- **Document Humanization** — Upload a `.docx` Word document, humanize all paragraphs in chunks, and download the result as a new `.docx`
- **GPT-5 Powered** — Uses the latest model for best results
- **Tunable Settings** — Adjust perplexity and burstiness sliders, or pick a preset (Balanced, Maximum Human-like, Conservative)
- **Side-by-side Interface** — Original text on the left, humanized version on the right
- **History** — Browse and reload previous humanization results
- **Copy & Download** — One-click copy to clipboard or download as `.docx`
- **Authentication** — Password login or Microsoft OAuth (configurable)
- **Security** — CSRF protection, HMAC-signed request tokens, rate limiting, audit logging

## Setup

### Prerequisites
- Node.js (v16 or higher)
- npm

### Installation

1. **Clone the repository**:
```bash
git clone <your-repo-url>
cd AI_Detector
```

2. **Install dependencies**:
```bash
npm install
```

3. **Create environment file**:
```bash
cp .env.example .env
```

4. **Configure `.env`** (minimum required):
```
OPENAI_API_KEY=your-api-key-here
AUTH_USERNAME=admin
AUTH_PASSWORD=your-password
```

5. **Start the server**:
```bash
npm start
```

6. **Open your browser**:
```
http://localhost:3000
```

## How It Works

### Text Mode
1. Paste your AI-generated text in the left panel
2. Adjust perplexity/burstiness settings (optional)
3. Click **Humanize Text** (or press `Ctrl+Enter`)
4. Watch the output stream in real-time on the right panel
5. Copy the result to clipboard

### Document Mode
1. Click the **Document** toggle in the input panel header
2. Drag-and-drop or browse for a `.docx` file (max 10MB)
3. Click **Humanize Document**
4. Watch the progress bar as each chunk is processed
5. Click **Download .docx** to save the humanized document

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | *(required)* | OpenAI API key |
| `OPENAI_API_URL` | `https://api.openai.com/v1/chat/completions` | OpenAI API endpoint |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment (`development` or `production`) |
| `AUTH_USERNAME` | | Admin username for password login |
| `AUTH_PASSWORD` | | Admin password for password login |
| `MICROSOFT_CLIENT_ID` | | Microsoft OAuth client ID |
| `MICROSOFT_CLIENT_SECRET` | | Microsoft OAuth client secret |
| `MICROSOFT_REDIRECT_URI` | | Microsoft OAuth redirect URI |
| `MICROSOFT_TENANT` | `organizations` | Azure AD tenant |
| `ALLOWED_EMAIL_DOMAIN` | `apiu.edu` | Allowed email domain for OAuth |
| `SESSION_EXPIRY_MS` | `86400000` (24h) | Session duration |
| `SIGNING_SECRET` | *(auto-generated)* | HMAC signing secret for tokens |
| `TOKEN_EXPIRY_MS` | `900000` (15min) | Request token expiry |
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins |
| `REQUEST_SIZE_LIMIT` | `10mb` | Max JSON body size |
| `REQUEST_TIMEOUT` | `60000` | OpenAI API timeout (ms) |
| `DOCX_MAX_FILE_SIZE` | `10485760` (10MB) | Max `.docx` upload size |
| `DOCX_CHUNK_TARGET_WORDS` | `1200` | Target words per document chunk |
| `DOCX_MAX_OUTPUT_TOKENS` | `8192` | Max output tokens per chunk |

## Architecture

```
public/                     Frontend (served as static files)
  index.html                Main application page
  css/styles.css            Custom styles (Tailwind via CDN)
  js/app.js                 Application controller
  js/modules/
    api.js                  API service (streaming, retry, token mgmt)
    config.js               Client-side config & system prompt
    document.js             DocumentService (upload, humanize, download)
    history.js              LocalStorage history management
    ui.js                   DOM interactions & UI state
    utils.js                Validation & formatting helpers

src/                        Backend (Express)
  app.js                    Express app setup, middleware, route mounting
  server.js                 HTTP server entry point
  config/env.js             Environment config loader
  middleware/
    auth.js                 HMAC token generation & verification
    cors.js                 CORS middleware
    csrf.js                 CSRF double-submit cookie protection
    errorHandler.js         Global error handler
    logger.js               Request logger
    session.js              Cookie-based session management
  routes/
    api.js                  Core API routes (login, logout, token, rewrite)
    auth.js                 Microsoft OAuth routes
    document.js             Document routes (upload, humanize, generate)
  services/
    audit.js                JSON-lines audit logger
    openai.js               OpenAI API client
```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Health check |
| `POST` | `/api/login` | None | Password login |
| `POST` | `/api/logout` | Session | Logout |
| `GET` | `/api/token` | Session | Get HMAC-signed request token |
| `POST` | `/api/rewrite` | Session + Token | Humanize text (streaming supported) |
| `POST` | `/api/document/upload` | Session | Upload `.docx`, extract paragraphs |
| `POST` | `/api/document/humanize` | Session + Token | Humanize document via SSE progress |
| `POST` | `/api/document/generate` | Session | Generate and download `.docx` |

## Security

- All API endpoints require session authentication (except `/api/health` and `/api/login`)
- Write endpoints (`/api/rewrite`, `/api/document/humanize`) require HMAC-signed request tokens
- CSRF protection via double-submit cookie on all POST requests
- Rate limiting: 20 req/min for text rewrites, 5 req/min for document humanization, 10 attempts/15min for login
- File uploads use memory storage (no temp files on disk), `.docx` only, 10MB max
- Audit logging for all significant actions

## Development

Start with auto-reload:
```bash
npm run dev
```

Run tests:
```bash
npx jest --verbose
```

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for detailed instructions on deploying to Vercel, Render, Railway, Heroku, Docker, or a VPS.

Quick deploy to Vercel:
```bash
npm install -g vercel
vercel login
vercel
# Add OPENAI_API_KEY and AUTH_USERNAME/AUTH_PASSWORD in dashboard
vercel --prod
```

## License

MIT
