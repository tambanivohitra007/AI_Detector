/**
 * Lightweight test request helper — no external dependencies.
 * Spins up the Express app on an ephemeral port, sends a request, returns { status, body }.
 */

const http = require('http');

/**
 * @param {import('express').Express} app
 * @param {string} method
 * @param {string} path
 * @param {Object} [body]
 * @returns {Promise<{status: number, body: any, headers: Object}>}
 */
function request(app, method, path, body) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            const payload = body ? JSON.stringify(body) : undefined;

            const req = http.request(
                {
                    hostname: '127.0.0.1',
                    port,
                    path,
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
                    }
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        server.close();
                        let parsed;
                        try { parsed = JSON.parse(data); } catch { parsed = data; }
                        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
                    });
                }
            );

            req.on('error', (err) => { server.close(); reject(err); });
            if (payload) req.write(payload);
            req.end();
        });
    });
}

module.exports = request;
