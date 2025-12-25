/**
 * Spotify API Layer
 * Handles authentication, token management, and API calls
 *
 * ARCHITECTURE NOTES:
 * - Uses Authorization Code Flow for secure token handling
 * - Token refresh handled automatically via server proxy
 * - All API calls go through server to hide client secret
 *
 * TODO (Future ML Extensions):
 * - Cache audio features for faster retrieval
 * - Implement feature vector database for similarity search
 * - Add collaborative filtering based on user listening history
 */

const SpotifyAPI = (function() {
    'use strict';

    // ==========================================================================
    // CONFIGURATION
    // ==========================================================================

    const CONFIG = {
        // API endpoints (proxied through our server for security)
        AUTH_URL: '/api/spotify/auth',
        TOKEN_URL: '/api/spotify/token',
        REFRESH_URL: '/api/spotify/refresh',
        API_BASE: '/api/spotify',

        // Spotify scopes needed for features
        SCOPES: [
            'user-read-private',
            'user-read-email',
            'playlist-read-private',
            'playlist-read-collaborative',
            'user-library-read',
            'user-top-read'
        ].join(' ')
    };

    // ==========================================================================
    // STATE
    // ==========================================================================

    let state = {
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        user: null,
        isAuthenticated: false
    };

    // ==========================================================================
    // AUTHENTICATION
    // ==========================================================================

    /**
     * Initiate Spotify OAuth flow
     * Redirects user to Spotify login page
     */
    function login() {
        window.location.href = CONFIG.AUTH_URL;
    }

    /**
     * Handle OAuth callback and extract tokens
     * Call this on page load to check for auth callback
     * @returns {Promise<boolean>} Whether authentication was successful
     */
    async function handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        console.log('[SpotifyAPI] Handling callback, code:', !!code, 'error:', error);

        if (error) {
            console.error('Spotify auth error:', error);
            alert('Spotify login failed: ' + error);
            return false;
        }

        if (code) {
            try {
                console.log('[SpotifyAPI] Exchanging code for token...');
                const response = await fetch(CONFIG.TOKEN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    console.error('Token exchange failed:', errData);
                    throw new Error('Token exchange failed: ' + (errData.error || response.status));
                }

                const data = await response.json();
                console.log('[SpotifyAPI] Token received successfully');
                setTokens(data.access_token, data.refresh_token, data.expires_in);

                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);

                return true;
            } catch (err) {
                console.error('Token exchange error:', err);
                alert('Failed to connect to Spotify: ' + err.message);
                return false;
            }
        }

        // Check for existing tokens in localStorage
        const hasTokens = loadStoredTokens();
        console.log('[SpotifyAPI] Loaded stored tokens:', hasTokens);
        return hasTokens;
    }

    /**
     * Store tokens and calculate expiry
     */
    function setTokens(accessToken, refreshToken, expiresIn) {
        state.accessToken = accessToken;
        state.refreshToken = refreshToken;
        state.expiresAt = Date.now() + (expiresIn * 1000) - 60000; // 1 min buffer
        state.isAuthenticated = true;

        // Persist to localStorage
        localStorage.setItem('spotify_access_token', accessToken);
        localStorage.setItem('spotify_refresh_token', refreshToken);
        localStorage.setItem('spotify_expires_at', state.expiresAt.toString());
    }

    /**
     * Load tokens from localStorage
     * @returns {boolean} Whether valid tokens were found
     */
    function loadStoredTokens() {
        const accessToken = localStorage.getItem('spotify_access_token');
        const refreshToken = localStorage.getItem('spotify_refresh_token');
        const expiresAt = parseInt(localStorage.getItem('spotify_expires_at') || '0');

        console.log('[SpotifyAPI] Checking stored tokens:', {
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            expiresAt: new Date(expiresAt).toISOString(),
            isExpired: expiresAt <= Date.now()
        });

        if (accessToken && refreshToken && expiresAt > Date.now()) {
            state.accessToken = accessToken;
            state.refreshToken = refreshToken;
            state.expiresAt = expiresAt;
            state.isAuthenticated = true;
            console.log('[SpotifyAPI] Valid tokens loaded from storage');
            return true;
        }

        // Try to refresh if we have a refresh token
        if (refreshToken) {
            console.log('[SpotifyAPI] Tokens expired, attempting refresh...');
            return refreshAccessToken();
        }

        console.log('[SpotifyAPI] No valid tokens found');
        return false;
    }

    /**
     * Refresh access token using refresh token
     * @returns {Promise<boolean>} Whether refresh was successful
     */
    async function refreshAccessToken() {
        if (!state.refreshToken) return false;

        try {
            const response = await fetch(CONFIG.REFRESH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: state.refreshToken })
            });

            if (!response.ok) throw new Error('Token refresh failed');

            const data = await response.json();
            setTokens(data.access_token, state.refreshToken, data.expires_in);
            return true;
        } catch (err) {
            console.error('Token refresh error:', err);
            logout();
            return false;
        }
    }

    /**
     * Clear authentication state
     */
    function logout() {
        state = {
            accessToken: null,
            refreshToken: null,
            expiresAt: null,
            user: null,
            isAuthenticated: false
        };
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_expires_at');
    }

    /**
     * Ensure we have a valid access token
     * @returns {Promise<string|null>} Valid access token or null
     */
    async function getValidToken() {
        if (!state.isAuthenticated) return null;

        if (Date.now() >= state.expiresAt) {
            const refreshed = await refreshAccessToken();
            if (!refreshed) return null;
        }

        return state.accessToken;
    }

    // ==========================================================================
    // API CALLS
    // ==========================================================================

    /**
     * Make authenticated API request
     * @param {string} endpoint - API endpoint (relative to /api/spotify)
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} API response data
     */
    async function apiCall(endpoint, options = {}) {
        const token = await getValidToken();
        if (!token) throw new Error('Not authenticated');

        const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            // Create a detailed error with status code
            const err = new Error(error.message || `API call failed: ${response.status}`);
            err.status = response.status;
            err.endpoint = endpoint;
            throw err;
        }

        return response.json();
    }

    /**
     * Get current user profile
     * @returns {Promise<Object>} User profile data
     */
    async function getCurrentUser() {
        if (state.user) return state.user;
        state.user = await apiCall('/me');
        return state.user;
    }

    /**
     * Get user's playlists
     * @param {number} limit - Max playlists to return
     * @param {number} offset - Offset for pagination
     * @returns {Promise<Object>} Playlists response
     */
    async function getUserPlaylists(limit = 50, offset = 0) {
        return apiCall(`/me/playlists?limit=${limit}&offset=${offset}`);
    }

    /**
     * Get tracks from a playlist
     * @param {string} playlistId - Spotify playlist ID
     * @param {number} limit - Max tracks to return
     * @param {number} offset - Offset for pagination
     * @returns {Promise<Object>} Playlist tracks response
     */
    async function getPlaylistTracks(playlistId, limit = 100, offset = 0) {
        return apiCall(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
    }

    /**
     * Get audio features for multiple tracks
     * @param {string[]} trackIds - Array of Spotify track IDs
     * @returns {Promise<Object>} Audio features response
     *
     * AUDIO FEATURES RETURNED BY SPOTIFY:
     * - tempo: BPM (60-200 typical range)
     * - key: Pitch class (0-11, where 0=C, 1=C#, etc.)
     * - mode: 1=Major, 0=Minor
     * - energy: 0.0-1.0 (intensity/power)
     * - danceability: 0.0-1.0 (how suitable for dancing)
     * - valence: 0.0-1.0 (musical positivity)
     * - loudness: dB (typically -60 to 0)
     * - speechiness: 0.0-1.0 (presence of spoken words)
     * - acousticness: 0.0-1.0 (acoustic vs electronic)
     * - instrumentalness: 0.0-1.0 (vocal presence)
     * - liveness: 0.0-1.0 (audience presence)
     * - time_signature: beats per bar (3-7)
     *
     * NOTE: This endpoint returns 403 for non-approved Spotify apps.
     * When 403 occurs, we return null features and the app falls back
     * to estimated features based on track metadata.
     */
    async function getAudioFeatures(trackIds) {
        if (!trackIds.length) return { audio_features: [], restricted: false };

        // Spotify API limits to 100 tracks per request
        const chunks = [];
        for (let i = 0; i < trackIds.length; i += 100) {
            chunks.push(trackIds.slice(i, i + 100));
        }

        try {
            const results = await Promise.all(
                chunks.map(chunk => apiCall(`/audio-features?ids=${chunk.join(',')}`))
            );

            return {
                audio_features: results.flatMap(r => r.audio_features),
                restricted: false
            };
        } catch (err) {
            // Handle 403 Forbidden - audio-features is restricted for non-approved apps
            if (err.status === 403) {
                console.warn('[SpotifyAPI] Audio features endpoint restricted (403). Using estimated features.');
                return {
                    audio_features: trackIds.map(() => null),
                    restricted: true
                };
            }
            throw err;
        }
    }

    /**
     * Get audio features for a single track
     * @param {string} trackId - Spotify track ID
     * @returns {Promise<Object>} Audio features for track
     */
    async function getTrackAudioFeatures(trackId) {
        return apiCall(`/audio-features/${trackId}`);
    }

    /**
     * Get track recommendations based on seeds
     * @param {Object} options - Recommendation parameters
     * @returns {Promise<Object>} Recommendations response
     *
     * OPTIONS:
     * - seed_tracks: Array of track IDs (up to 5 combined seeds)
     * - seed_artists: Array of artist IDs
     * - seed_genres: Array of genre strings
     * - target_tempo: Target BPM
     * - target_energy: Target energy (0-1)
     * - target_danceability: Target danceability (0-1)
     * - min_X/max_X: Min/max bounds for features
     */
    async function getRecommendations(options = {}) {
        const params = new URLSearchParams();

        Object.entries(options).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                params.append(key, value.join(','));
            } else if (value !== undefined) {
                params.append(key, value.toString());
            }
        });

        params.append('limit', options.limit || 20);

        return apiCall(`/recommendations?${params.toString()}`);
    }

    /**
     * Search for tracks
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Object>} Search results
     */
    async function searchTracks(query, limit = 20) {
        const params = new URLSearchParams({
            q: query,
            type: 'track',
            limit: limit.toString()
        });
        return apiCall(`/search?${params.toString()}`);
    }

    /**
     * Get user's top tracks
     * @param {string} timeRange - 'short_term', 'medium_term', or 'long_term'
     * @param {number} limit - Max tracks to return
     * @returns {Promise<Object>} Top tracks response
     */
    async function getTopTracks(timeRange = 'medium_term', limit = 50) {
        return apiCall(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`);
    }

    /**
     * Get user's saved tracks (library)
     * @param {number} limit - Max tracks to return
     * @param {number} offset - Offset for pagination
     * @returns {Promise<Object>} Saved tracks response
     */
    async function getSavedTracks(limit = 50, offset = 0) {
        return apiCall(`/me/tracks?limit=${limit}&offset=${offset}`);
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        // Auth
        login,
        logout,
        handleCallback,
        isAuthenticated: () => state.isAuthenticated,
        getAccessToken: () => state.accessToken,
        getUser: getCurrentUser,

        // Playlists
        getUserPlaylists,
        getPlaylistTracks,

        // Audio Features
        getAudioFeatures,
        getTrackAudioFeatures,

        // Discovery
        getRecommendations,
        searchTracks,
        getTopTracks,
        getSavedTracks
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpotifyAPI;
}
