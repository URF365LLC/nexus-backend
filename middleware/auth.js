'use strict';

/**
 * NEXUS API Key Auth Middleware
 *
 * Reads NEXUS_API_KEY from environment.
 * Accepts the key via:
 *   - Authorization: Bearer <key>
 *   - X-Api-Key: <key>
 *
 * Apply to all /api/* routes. /health is intentionally left open
 * so Railway health checks pass without credentials.
 */

const API_KEY = process.env.NEXUS_API_KEY;

function requireApiKey(req, res, next) {
    if (!API_KEY) {
        // If the key is not configured, block all requests — misconfigured deploy
        return res.status(503).json({
            success: false,
            error:   'Server misconfigured: NEXUS_API_KEY not set',
        });
    }

    const authHeader = req.headers['authorization'];
    const keyHeader  = req.headers['x-api-key'];

    let provided = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        provided = authHeader.slice(7).trim();
    } else if (keyHeader) {
        provided = keyHeader.trim();
    }

    if (!provided || provided !== API_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    next();
}

module.exports = { requireApiKey };
