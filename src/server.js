/**
 * Server Entry Point
 * Starts the HTTP server
 */

const createApp = require('./app');
const config = require('./config/env');

/**
 * Start the server
 */
function startServer() {
    const app = createApp();

    const server = app.listen(config.port, '0.0.0.0', () => {
        console.log('='.repeat(50));
        console.log('AI Text Humanizer Server');
        console.log('='.repeat(50));
        console.log(`Environment: ${config.nodeEnv}`);
        console.log(`Port: ${config.port}`);
        console.log(`\nLocal: http://localhost:${config.port}`);
        console.log(`Network: http://0.0.0.0:${config.port}`);
        console.log(`\nAPI Endpoints:`);
        console.log(`  Health: http://localhost:${config.port}/api/health`);
        console.log(`  Rewrite: http://localhost:${config.port}/api/rewrite`);
        console.log(`  Status: http://localhost:${config.port}/api/status`);
        console.log('='.repeat(50));
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('SIGTERM received, shutting down gracefully...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('\nSIGINT received, shutting down gracefully...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });

    return server;
}

// Start server if this file is run directly
if (require.main === module) {
    startServer();
}

module.exports = startServer;
