/**
 * Error Handler Middleware
 * Centralized error handling
 */

const config = require('../config/env');

/**
 * Error response structure
 */
function createErrorResponse(error, statusCode = 500) {
    const response = {
        error: {
            message: error.message || 'Internal server error',
            status: statusCode
        }
    };

    // Include stack trace in development
    if (config.nodeEnv === 'development') {
        response.error.stack = error.stack;
    }

    return response;
}

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
    console.error('Error occurred:', err);

    const statusCode = err.statusCode || err.status || 500;
    const response = createErrorResponse(err, statusCode);

    res.status(statusCode).json(response);
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        error: {
            message: 'Route not found',
            status: 404,
            path: req.url
        }
    });
}

module.exports = {
    errorHandler,
    notFoundHandler
};
