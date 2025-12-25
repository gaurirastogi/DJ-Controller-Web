/**
 * DJ Controller Server
 *
 * Handles:
 * - Static file serving
 * - Spotify OAuth authentication
 * - Spotify API proxy (to hide client secret)
 * - File uploads for local audio
 *
 * SECURITY NOTE:
 * Client secret is kept server-side only. Never expose it to the frontend.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// Load environment variables from .env file
require('dotenv').config();

// ==========================================================================
// CONFIGURATION
// ==========================================================================

/**
 * Spotify OAuth Configuration
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://developer.spotify.com/dashboard
 * 2. Create a new application
 * 3. Add http://127.0.0.1:3000/api/spotify/callback to Redirect URIs
 *    (Spotify requires 127.0.0.1, not localhost)
 * 4. Copy Client ID and Client Secret below (or use environment variables)
 */
const SPOTIFY_CONFIG = {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/api/spotify/callback',
    scopes: [
        'user-read-private',
        'user-read-email',
        'playlist-read-private',
        'playlist-read-collaborative',
        'user-library-read',
        'user-top-read',
        'streaming',
        'user-read-playback-state',
        'user-modify-playback-state'
    ].join(' ')
};

// ==========================================================================
// MIDDLEWARE
// ==========================================================================

app.use(express.json());
app.use(express.static('public'));

// Setup multer for file uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function(req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ==========================================================================
// SPOTIFY OAUTH ROUTES
// ==========================================================================

/**
 * Initiate Spotify OAuth flow
 * Redirects user to Spotify login page
 */
app.get('/api/spotify/auth', (req, res) => {
    const params = new URLSearchParams({
        client_id: SPOTIFY_CONFIG.clientId,
        response_type: 'code',
        redirect_uri: SPOTIFY_CONFIG.redirectUri,
        scope: SPOTIFY_CONFIG.scopes,
        show_dialog: 'true' // Force login dialog
    });

    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

/**
 * Spotify OAuth callback
 * Handles the authorization code and redirects to frontend
 */
app.get('/api/spotify/callback', (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return res.redirect(`/?error=${encodeURIComponent(error)}`);
    }

    if (code) {
        // Redirect to frontend with the code
        res.redirect(`/?code=${encodeURIComponent(code)}`);
    } else {
        res.redirect('/?error=no_code');
    }
});

/**
 * Exchange authorization code for access token
 */
app.post('/api/spotify/token', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Authorization code required' });
    }

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    `${SPOTIFY_CONFIG.clientId}:${SPOTIFY_CONFIG.clientSecret}`
                ).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: SPOTIFY_CONFIG.redirectUri
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Token exchange error:', error);
            return res.status(response.status).json(error);
        }

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('Token exchange failed:', err);
        res.status(500).json({ error: 'Token exchange failed' });
    }
});

/**
 * Refresh access token
 */
app.post('/api/spotify/refresh', async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
        return res.status(400).json({ error: 'Refresh token required' });
    }

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    `${SPOTIFY_CONFIG.clientId}:${SPOTIFY_CONFIG.clientSecret}`
                ).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refresh_token
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Token refresh error:', error);
            return res.status(response.status).json(error);
        }

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('Token refresh failed:', err);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

// ==========================================================================
// SPOTIFY API PROXY
// ==========================================================================

/**
 * Proxy requests to Spotify API
 * This keeps the access token handling on the server and allows CORS
 */
app.all('/api/spotify/*', async (req, res, next) => {
    // Skip if this is one of the auth routes
    const authRoutes = ['/api/spotify/auth', '/api/spotify/callback', '/api/spotify/token', '/api/spotify/refresh'];
    if (authRoutes.includes(req.path)) {
        return next();
    }

    const authHeader = req.headers.authorization;
    console.log('[Proxy] Request:', req.method, req.path);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('[Proxy] No auth header');
        return res.status(401).json({ error: 'Access token required' });
    }

    // Extract the Spotify API path from our proxy path
    const spotifyPath = req.path.replace('/api/spotify', '');

    // Build the Spotify API URL
    const spotifyUrl = `https://api.spotify.com/v1${spotifyPath}${
        Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : ''
    }`;

    try {
        const response = await fetch(spotifyUrl, {
            method: req.method,
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: req.method !== 'GET' && req.method !== 'HEAD'
                ? JSON.stringify(req.body)
                : undefined
        });

        // Handle rate limiting
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || '1';
            res.set('Retry-After', retryAfter);
            return res.status(429).json({
                error: 'Rate limited',
                retryAfter: parseInt(retryAfter)
            });
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Spotify API error:', response.status, spotifyUrl, error);
            return res.status(response.status).json(error);
        }

        // Handle empty responses
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            res.status(204).send();
        }

    } catch (err) {
        console.error('Spotify API proxy error:', err);
        res.status(500).json({ error: 'API request failed' });
    }
});

// ==========================================================================
// FILE UPLOAD
// ==========================================================================

/**
 * Handle local audio file uploads
 */
app.post('/upload', upload.single('song'), function(req, res) {
    if (!req.file) {
        return res.status(400).send('No files were uploaded.');
    }
    res.status(200).json({ filename: req.file.filename });
});

// ==========================================================================
// ERROR HANDLING
// ==========================================================================

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ==========================================================================
// START SERVER
// ==========================================================================

// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Validate required environment variables
if (!SPOTIFY_CONFIG.clientId || !SPOTIFY_CONFIG.clientSecret) {
    console.error(`
╔═══════════════════════════════════════════════════════════╗
║  ERROR: Missing Spotify credentials                       ║
╠═══════════════════════════════════════════════════════════╣
║  Please create a .env file with:                          ║
║                                                           ║
║  SPOTIFY_CLIENT_ID=your_client_id                         ║
║  SPOTIFY_CLIENT_SECRET=your_client_secret                 ║
║                                                           ║
║  See .env.example for reference                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
    process.exit(1);
}

app.listen(port, '127.0.0.1', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           DJ Controller Server Running                    ║
╠═══════════════════════════════════════════════════════════╣
║  Local:    http://127.0.0.1:${port}                         ║
║                                                           ║
║  Features:                                                ║
║  ✓ Auto-DJ Track Selection Engine                        ║
║  ✓ Harmonic + BPM Mixing Assistant                       ║
║  ✓ DJ Set Analytics Dashboard                            ║
║                                                           ║
║  Setup Spotify:                                           ║
║  1. Set SPOTIFY_CLIENT_ID environment variable           ║
║  2. Set SPOTIFY_CLIENT_SECRET environment variable       ║
║  3. Add callback URL in Spotify Dashboard:               ║
║     http://127.0.0.1:${port}/api/spotify/callback           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
