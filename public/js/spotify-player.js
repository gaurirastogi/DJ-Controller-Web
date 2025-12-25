/**
 * Spotify Web Playback SDK Integration
 *
 * Provides full track streaming for Premium users using a single player
 * that can switch between tracks. Simpler and more reliable than dual players.
 */

const SpotifyPlayer = (function() {
    'use strict';

    // ==========================================================================
    // STATE
    // ==========================================================================

    let state = {
        player: null,
        deviceId: null,
        isReady: false,
        isInitializing: false,
        accessToken: null,
        currentTrackUri: null,
        currentDeck: null,  // 'A' or 'B'
        playbackState: {
            isPlaying: false,
            position: 0,
            duration: 0
        }
    };

    let callbacks = {
        onReady: null,
        onError: null,
        onStateChange: null,
        onTrackEnd: null
    };

    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================

    /**
     * Initialize the Spotify Web Playback SDK
     * @param {string} accessToken - Spotify access token
     * @returns {Promise<boolean>}
     */
    async function init(accessToken) {
        if (state.isInitializing || state.isReady) {
            console.log('[SpotifyPlayer] Already initialized or initializing');
            return state.isReady;
        }

        if (!accessToken) {
            console.error('[SpotifyPlayer] No access token provided');
            return false;
        }

        state.accessToken = accessToken;
        state.isInitializing = true;

        console.log('[SpotifyPlayer] Initializing...');

        try {
            // Load SDK if not already loaded
            if (!window.Spotify) {
                await loadSDK();
            }

            // Wait for SDK to be ready
            await waitForSpotifySDK();

            // Create player
            const success = await createPlayer();

            state.isInitializing = false;
            return success;

        } catch (err) {
            console.error('[SpotifyPlayer] Init failed:', err);
            state.isInitializing = false;
            if (callbacks.onError) callbacks.onError(err);
            return false;
        }
    }

    /**
     * Load the Spotify SDK script
     */
    function loadSDK() {
        return new Promise((resolve, reject) => {
            if (document.getElementById('spotify-player-sdk')) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.id = 'spotify-player-sdk';
            script.src = 'https://sdk.scdn.co/spotify-player.js';
            script.async = true;

            const timeout = setTimeout(() => {
                reject(new Error('SDK load timeout'));
            }, 10000);

            script.onload = () => {
                clearTimeout(timeout);
                console.log('[SpotifyPlayer] SDK script loaded');
                resolve();
            };

            script.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('Failed to load SDK'));
            };

            document.body.appendChild(script);
        });
    }

    /**
     * Wait for Spotify SDK to be ready
     */
    function waitForSpotifySDK() {
        return new Promise((resolve, reject) => {
            if (window.Spotify) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('Spotify SDK ready timeout'));
            }, 10000);

            window.onSpotifyWebPlaybackSDKReady = () => {
                clearTimeout(timeout);
                console.log('[SpotifyPlayer] SDK ready');
                resolve();
            };
        });
    }

    /**
     * Create the Spotify player instance
     */
    function createPlayer() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Player creation timeout'));
            }, 15000);

            state.player = new window.Spotify.Player({
                name: 'DJ Controller',
                getOAuthToken: cb => cb(state.accessToken),
                volume: 1.0
            });

            // Error handlers
            state.player.addListener('initialization_error', ({ message }) => {
                console.error('[SpotifyPlayer] Init error:', message);
                clearTimeout(timeout);
                reject(new Error(message));
            });

            state.player.addListener('authentication_error', ({ message }) => {
                console.error('[SpotifyPlayer] Auth error:', message);
                clearTimeout(timeout);
                reject(new Error(message));
            });

            state.player.addListener('account_error', ({ message }) => {
                console.error('[SpotifyPlayer] Account error:', message);
                clearTimeout(timeout);
                reject(new Error('Premium required'));
            });

            state.player.addListener('playback_error', ({ message }) => {
                console.error('[SpotifyPlayer] Playback error:', message);
                if (callbacks.onError) callbacks.onError(new Error(message));
            });

            // Ready handler
            state.player.addListener('ready', ({ device_id }) => {
                console.log('[SpotifyPlayer] Ready! Device ID:', device_id);
                clearTimeout(timeout);
                state.deviceId = device_id;
                state.isReady = true;
                if (callbacks.onReady) callbacks.onReady(device_id);
                resolve(true);
            });

            state.player.addListener('not_ready', ({ device_id }) => {
                console.log('[SpotifyPlayer] Device offline:', device_id);
                state.isReady = false;
            });

            // Playback state changes
            state.player.addListener('player_state_changed', (playerState) => {
                if (!playerState) return;

                const wasPlaying = state.playbackState.isPlaying;
                const previousTrackUri = state.playbackState.trackUri;
                const currentTrackUri = playerState.track_window?.current_track?.uri;

                state.playbackState = {
                    isPlaying: !playerState.paused,
                    position: playerState.position,
                    duration: playerState.duration,
                    trackUri: currentTrackUri
                };

                // Check if we're in the middle of a transition (ignore state changes during transitions)
                const isTransitioning = window.isTransitioning && window.isTransitioning();

                // Detect track end - but NOT during transitions or track switches
                if (wasPlaying && playerState.paused &&
                    playerState.position === 0 &&
                    playerState.track_window?.previous_tracks?.length > 0 &&
                    !isTransitioning &&
                    previousTrackUri === currentTrackUri) { // Same track ended naturally
                    console.log('[SpotifyPlayer] Track ended');
                    if (callbacks.onTrackEnd) callbacks.onTrackEnd(state.currentDeck);
                }

                // Only fire state change callback if not transitioning
                if (callbacks.onStateChange && !isTransitioning) {
                    callbacks.onStateChange(state.currentDeck, state.playbackState);
                }
            });

            // Connect
            state.player.connect().then(success => {
                if (!success) {
                    clearTimeout(timeout);
                    reject(new Error('Failed to connect'));
                }
                // Don't resolve here - wait for 'ready' event
            });
        });
    }

    // ==========================================================================
    // PLAYBACK CONTROL
    // ==========================================================================

    /**
     * Play a track
     * @param {string} trackUri - Spotify track URI (spotify:track:xxx)
     * @param {string} deck - Which deck is playing ('A' or 'B')
     * @returns {Promise<boolean>}
     */
    async function play(trackUri, deck = 'A') {
        if (!state.isReady || !state.deviceId) {
            console.error('[SpotifyPlayer] Not ready');
            return false;
        }

        try {
            const response = await fetch(
                `https://api.spotify.com/v1/me/player/play?device_id=${state.deviceId}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${state.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        uris: [trackUri]
                    })
                }
            );

            if (!response.ok && response.status !== 204) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || `HTTP ${response.status}`);
            }

            state.currentTrackUri = trackUri;
            state.currentDeck = deck;
            console.log('[SpotifyPlayer] Playing:', trackUri, 'on Deck', deck);
            return true;

        } catch (err) {
            console.error('[SpotifyPlayer] Play failed:', err);
            if (callbacks.onError) callbacks.onError(err);
            return false;
        }
    }

    /**
     * Play a track by ID
     * @param {string} trackId - Spotify track ID
     * @param {string} deck - Which deck
     * @returns {Promise<boolean>}
     */
    function playById(trackId, deck = 'A') {
        return play(`spotify:track:${trackId}`, deck);
    }

    /**
     * Pause playback
     */
    async function pause() {
        if (!state.player) return false;
        try {
            await state.player.pause();
            return true;
        } catch (err) {
            console.error('[SpotifyPlayer] Pause failed:', err);
            return false;
        }
    }

    /**
     * Resume playback
     */
    async function resume() {
        if (!state.player) return false;
        try {
            await state.player.resume();
            return true;
        } catch (err) {
            console.error('[SpotifyPlayer] Resume failed:', err);
            return false;
        }
    }

    /**
     * Toggle play/pause
     */
    async function togglePlay() {
        if (!state.player) return false;
        try {
            await state.player.togglePlay();
            return true;
        } catch (err) {
            console.error('[SpotifyPlayer] Toggle failed:', err);
            return false;
        }
    }

    /**
     * Seek to position
     * @param {number} positionMs - Position in milliseconds
     */
    async function seek(positionMs) {
        if (!state.player) return false;
        try {
            await state.player.seek(positionMs);
            return true;
        } catch (err) {
            console.error('[SpotifyPlayer] Seek failed:', err);
            return false;
        }
    }

    /**
     * Set volume
     * @param {number} volume - Volume 0.0 to 1.0
     */
    async function setVolume(volume) {
        if (!state.player) return false;
        try {
            await state.player.setVolume(Math.max(0, Math.min(1, volume)));
            return true;
        } catch (err) {
            console.error('[SpotifyPlayer] Volume failed:', err);
            return false;
        }
    }

    /**
     * Get current playback state
     */
    async function getState() {
        if (!state.player) return null;
        try {
            return await state.player.getCurrentState();
        } catch (err) {
            return null;
        }
    }

    // ==========================================================================
    // CALLBACKS
    // ==========================================================================

    function onReady(cb) { callbacks.onReady = cb; }
    function onError(cb) { callbacks.onError = cb; }
    function onStateChange(cb) { callbacks.onStateChange = cb; }
    function onTrackEnd(cb) { callbacks.onTrackEnd = cb; }

    // ==========================================================================
    // CLEANUP
    // ==========================================================================

    function disconnect() {
        if (state.player) {
            state.player.disconnect();
        }
        state.isReady = false;
        state.deviceId = null;
        state.player = null;
        console.log('[SpotifyPlayer] Disconnected');
    }

    function updateToken(newToken) {
        state.accessToken = newToken;
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        init,
        isReady: () => state.isReady,
        getDeviceId: () => state.deviceId,

        // Playback
        play,
        playById,
        pause,
        resume,
        togglePlay,
        seek,
        setVolume,
        getState,

        // State
        getPlaybackState: () => ({ ...state.playbackState }),
        getCurrentDeck: () => state.currentDeck,

        // Callbacks
        onReady,
        onError,
        onStateChange,
        onTrackEnd,

        // Lifecycle
        disconnect,
        updateToken
    };
})();

// Make available globally
window.SpotifyPlayer = SpotifyPlayer;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpotifyPlayer;
}
