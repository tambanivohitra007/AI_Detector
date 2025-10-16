# AI Text Humanizer

Transform AI-generated text into natural, human-like academic writing that passes AI detection.

## Features

- **Side-by-side interface** - Paste text on left, see humanized version on right
- **GPT-5 powered** - Uses the latest AI technology for best results
- **Natural output** - Text sounds distinctly human, not machine-generated
- **Academic focus** - Maintains scholarly tone and technical accuracy
- **Word counter** - Track text length
- **Copy to clipboard** - One-click copying
- **Clean UI** - Professional, easy-to-use interface

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

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

4. **Add your OpenAI API key** to `.env`:
```
OPENAI_API_KEY=your-actual-api-key-here
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

1. **Paste** your AI-generated text in the left panel
2. **Click** "Humanize Text"
3. **Wait** a few seconds for GPT-5 to process
4. **Copy** the natural, human-like version from the right panel

## Deployment

Ready to deploy? See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for detailed instructions on deploying to:
- Vercel (Recommended)
- Render
- Railway
- Heroku
- Docker
- VPS

Quick deploy to Vercel:
```bash
npm install -g vercel
vercel login
vercel
# Add OPENAI_API_KEY in dashboard
vercel --prod
```

## Architecture

### Frontend (`index.html`, `app.js`, `styles.css`)
- Clean, responsive single-page application
- Side-by-side text comparison interface
- Real-time word counting
- Copy to clipboard functionality

### Backend (`server.js`)
- Express.js proxy server
- Handles OpenAI API requests securely
- CORS configuration
- Environment-based configuration

## GPT-5 Configuration

Optimized settings for human-like output:
- **Model**: `gpt-5` (flagship model)
- **Max Output Tokens**: 8192
- **Reasoning Effort**: medium (balanced quality/speed)
- **Verbosity**: medium (natural detail level)

## Security

✅ **Production Ready**:
- API keys stored in environment variables
- `.env` file excluded from Git
- CORS protection
- Input validation
- Error handling

⚠️ **Before Deployment**:
1. Set `OPENAI_API_KEY` in environment variables
2. Never commit `.env` file
3. Update `ALLOWED_ORIGINS` for your domain
4. Monitor API usage to control costs

## Development

Start with auto-reload:
```bash
npm run dev
```

## Troubleshooting

### "404 Not Found" on API calls
- Make sure the server is running (`npm start`)
- Check that you're accessing the app via `http://localhost:3000`
- Verify the API key is valid

### "CORS error"
- The backend proxy should handle CORS automatically
- If issues persist, check the CORS middleware in `server.js`

### "File too large"
- Current limit: 10MB
- Adjust `MAX_FILE_SIZE` in `app.js` if needed

## License

MIT
