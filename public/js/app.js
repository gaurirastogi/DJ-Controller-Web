/**
 * DJ Controller App - Main Integration Module
 *
 * FEATURES:
 * 1. Spotify playlist integration with preview playback
 * 2. Real-time Mixing Assistant with live feedback
 * 3. Functional Auto-DJ with auto-queue and crossfade
 * 4. Session Analytics tracking
 */

const DJApp = (function() {
    'use strict';

    // ==========================================================================
    // STATE
    // ==========================================================================

    let state = {
        currentTrack: null,      // Track on Deck A
        nextTrack: null,         // Track on Deck B
        candidates: [],
        allTracks: [],
        selectedPlaylist: null,
        playlists: [],
        autoDJEnabled: false,
        isTransitioning: false,
        deckAPlaying: false,
        deckBPlaying: false,
        spotifyPlayerReady: false,  // SDK streaming available
        activeDeck: null,           // Which deck is using Spotify player
        // Live mixer state for dynamic feedback
        mixer: {
            crossfader: 0.5,
            deckA: { volume: 1, pitch: 1, bass: 0.5, mid: 0.5, treble: 0.5 },
            deckB: { volume: 1, pitch: 1, bass: 0.5, mid: 0.5, treble: 0.5 }
        }
    };

    // DOM elements cache
    let elements = {};

    // Reference to audio elements from script.js
    let audio1, audio2;

    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================

    function init() {
        console.log('[DJApp] Initializing...');

        // Cache DOM elements
        cacheElements();

        // Get audio elements from global scope (defined in script.js)
        audio1 = window.audio1;
        audio2 = window.audio2;

        // Setup event listeners
        setupEventListeners();
        setupMixerListeners();
        setupAudioListeners();

        // Check for existing auth or OAuth callback
        checkAuth();
    }

    function cacheElements() {
        elements = {
            loginBtn: document.getElementById('spotifyLoginBtn'),
            logoutBtn: document.getElementById('spotifyLogoutBtn'),
            userInfo: document.getElementById('userInfo'),
            playlistSection: document.getElementById('playlistSection'),
            playlistSelect: document.getElementById('playlistSelect'),
            autoDJSection: document.getElementById('autoDJSection'),
            candidatesList: document.getElementById('candidatesList'),
            transitionCard: document.getElementById('transitionCard'),
            autoDJToggle: document.getElementById('autoDJToggle'),
            deckAInfo: document.getElementById('deckAInfo'),
            deckBInfo: document.getElementById('deckBInfo'),
            song1Name: document.getElementById('song1Name'),
            song2Name: document.getElementById('song2Name'),
            endSessionBtn: document.getElementById('endSessionBtn'),
            sessionSummary: document.getElementById('sessionSummary'),
            // Mixer controls
            crossfader: document.getElementById('crossfade'),
            volumeSong1: document.getElementById('volumeSong1'),
            volumeSong2: document.getElementById('volumeSong2'),
            pitchSong1: document.getElementById('pitchSong1'),
            pitchSong2: document.getElementById('pitchSong2'),
            bassSong1: document.getElementById('bassSong1'),
            bassSong2: document.getElementById('bassSong2'),
            midSong1: document.getElementById('midSong1'),
            midSong2: document.getElementById('midSong2'),
            trebleSong1: document.getElementById('trebleSong1'),
            trebleSong2: document.getElementById('trebleSong2'),
            // Transport
            playSong1: document.getElementById('playSong1'),
            playSong2: document.getElementById('playSong2'),
            autoFade: document.getElementById('autoFade')
        };
    }

    function setupEventListeners() {
        // Logout button
        elements.logoutBtn?.addEventListener('click', handleLogout);

        // Playlist selection
        elements.playlistSelect?.addEventListener('change', handlePlaylistChange);

        // Auto-DJ toggle
        elements.autoDJToggle?.addEventListener('click', toggleAutoDJ);

        // Candidate list clicks (event delegation)
        elements.candidatesList?.addEventListener('click', handleCandidateClick);

        // End session button
        elements.endSessionBtn?.addEventListener('click', handleEndSession);

        // Auto-fade button - enhanced version
        elements.autoFade?.addEventListener('click', handleAutoFade);
    }

    function setupMixerListeners() {
        // Crossfader
        elements.crossfader?.addEventListener('input', (e) => {
            state.mixer.crossfader = parseFloat(e.target.value);
            updateLiveMixerFeedback();
        });

        // Deck A controls
        elements.volumeSong1?.addEventListener('input', (e) => {
            state.mixer.deckA.volume = parseFloat(e.target.value);
            updateLiveMixerFeedback();
        });
        elements.pitchSong1?.addEventListener('input', (e) => {
            state.mixer.deckA.pitch = parseFloat(e.target.value);
            updateLiveMixerFeedback();
        });
        elements.bassSong1?.addEventListener('input', (e) => {
            state.mixer.deckA.bass = parseFloat(e.target.value);
            updateLiveMixerFeedback();
        });
        elements.midSong1?.addEventListener('input', (e) => {
            state.mixer.deckA.mid = parseFloat(e.target.value);
            updateLiveMixerFeedback();
        });
        elements.trebleSong1?.addEventListener('input', (e) => {
            state.mixer.deckA.treble = parseFloat(e.target.value);
            updateLiveMixerFeedback();
        });

        // Deck B controls
        elements.volumeSong2?.addEventListener('input', (e) => {
            state.mixer.deckB.volume = parseFloat(e.target.value);
            updateLiveMixerFeedback();
        });
        elements.pitchSong2?.addEventListener('input', (e) => {
            state.mixer.deckB.pitch = parseFloat(e.target.value);
            updateLiveMixerFeedback();
        });
        elements.bassSong2?.addEventListener('input', (e) => {
            state.mixer.deckB.bass = parseFloat(e.target.value);
            updateLiveMixerFeedback();
        });
        elements.midSong2?.addEventListener('input', (e) => {
            state.mixer.deckB.mid = parseFloat(e.target.value);
            updateLiveMixerFeedback();
        });
        elements.trebleSong2?.addEventListener('input', (e) => {
            state.mixer.deckB.treble = parseFloat(e.target.value);
            updateLiveMixerFeedback();
        });
    }

    function setupAudioListeners() {
        if (audio1) {
            audio1.addEventListener('ended', () => {
                state.deckAPlaying = false;
                handleTrackEnded('A');
            });
            audio1.addEventListener('play', () => {
                state.deckAPlaying = true;
                updateDeckPlayState();
            });
            audio1.addEventListener('pause', () => {
                state.deckAPlaying = false;
                updateDeckPlayState();
            });
        }

        if (audio2) {
            audio2.addEventListener('ended', () => {
                state.deckBPlaying = false;
                handleTrackEnded('B');
            });
            audio2.addEventListener('play', () => {
                state.deckBPlaying = true;
                updateDeckPlayState();
            });
            audio2.addEventListener('pause', () => {
                state.deckBPlaying = false;
                updateDeckPlayState();
            });
        }
    }

    // ==========================================================================
    // AUTHENTICATION
    // ==========================================================================

    async function checkAuth() {
        console.log('[DJApp] Checking authentication...');

        try {
            const isAuthenticated = await SpotifyAPI.handleCallback();

            if (isAuthenticated) {
                console.log('[DJApp] User is authenticated');
                await onAuthenticated();
            } else {
                console.log('[DJApp] User not authenticated');
                showLoginState();
            }
        } catch (err) {
            console.error('[DJApp] Auth check failed:', err);
            showLoginState();
        }
    }

    async function onAuthenticated() {
        console.log('[DJApp] Setting up authenticated UI...');

        elements.loginBtn?.classList.add('hidden');
        elements.logoutBtn?.classList.remove('hidden');
        elements.playlistSection?.classList.remove('hidden');
        elements.autoDJSection?.classList.remove('hidden');

        try {
            const user = await SpotifyAPI.getUser();
            console.log('[DJApp] Welcome:', user.display_name);

            if (elements.userInfo) {
                elements.userInfo.textContent = `Welcome, ${user.display_name}`;
                elements.userInfo.classList.remove('hidden');
            }

            await loadPlaylists();
            AnalyticsDashboard.startSession();

            // Initialize Spotify Web Playback SDK (for Premium users)
            initSpotifyPlayer();

        } catch (err) {
            console.error('[DJApp] Setup error:', err);
            alert('Error loading Spotify data. Please try logging in again.');
        }
    }

    async function initSpotifyPlayer() {
        const token = SpotifyAPI.getAccessToken();
        if (!token) {
            console.log('[DJApp] No token for Spotify Player');
            return;
        }

        console.log('[DJApp] Initializing Spotify Player...');

        // Set up callbacks before init
        SpotifyPlayer.onReady((deviceId) => {
            console.log('[DJApp] Spotify Player ready:', deviceId);
            state.spotifyPlayerReady = true;
            updatePlayerStatus();
        });

        SpotifyPlayer.onError((err) => {
            console.error('[DJApp] Spotify Player error:', err);
            state.spotifyPlayerReady = false;
            updatePlayerStatus();
        });

        SpotifyPlayer.onStateChange((deck, playbackState) => {
            // Ignore state changes during transitions to prevent interference
            if (window.isTransitioning && window.isTransitioning()) {
                console.log('[DJApp] Ignoring state change during transition');
                return;
            }

            if (deck === 'A') {
                state.deckAPlaying = playbackState.isPlaying;
            } else if (deck === 'B') {
                state.deckBPlaying = playbackState.isPlaying;
            }
            updateDeckPlayState();
        });

        SpotifyPlayer.onTrackEnd((deck) => {
            // Ignore track end events during transitions
            if (window.isTransitioning && window.isTransitioning()) {
                console.log('[DJApp] Ignoring track end during transition');
                return;
            }
            handleTrackEnded(deck);
        });

        try {
            const success = await SpotifyPlayer.init(token);
            if (success) {
                console.log('[DJApp] Spotify Player initialized successfully');
            } else {
                console.log('[DJApp] Spotify Player init failed - using local audio only');
            }
        } catch (err) {
            console.error('[DJApp] Spotify Player init error:', err);
        }
    }

    function updatePlayerStatus() {
        // Update UI to show streaming status
        const statusEl = document.getElementById('playerStatus');
        if (statusEl) {
            statusEl.textContent = state.spotifyPlayerReady
                ? 'Streaming Ready'
                : 'Local Audio Only';
            statusEl.style.color = state.spotifyPlayerReady ? '#22c55e' : '#eab308';
        }
    }

    function showLoginState() {
        elements.loginBtn?.classList.remove('hidden');
        elements.logoutBtn?.classList.add('hidden');
        elements.userInfo?.classList.add('hidden');
        elements.playlistSection?.classList.add('hidden');
        elements.autoDJSection?.classList.add('hidden');
    }

    function handleLogout() {
        SpotifyAPI.logout();
        showLoginState();
        state = {
            currentTrack: null,
            nextTrack: null,
            candidates: [],
            allTracks: [],
            selectedPlaylist: null,
            playlists: [],
            autoDJEnabled: false,
            isTransitioning: false,
            deckAPlaying: false,
            deckBPlaying: false,
            mixer: {
                crossfader: 0.5,
                deckA: { volume: 1, pitch: 1, bass: 0.5, mid: 0.5, treble: 0.5 },
                deckB: { volume: 1, pitch: 1, bass: 0.5, mid: 0.5, treble: 0.5 }
            }
        };

        if (elements.deckAInfo) elements.deckAInfo.innerHTML = '<div class="track-name">No track loaded</div>';
        if (elements.deckBInfo) elements.deckBInfo.innerHTML = '<div class="track-name">No track loaded</div>';
        if (elements.candidatesList) elements.candidatesList.innerHTML = '';
    }

    // ==========================================================================
    // PLAYLIST MANAGEMENT
    // ==========================================================================

    async function loadPlaylists() {
        console.log('[DJApp] Loading playlists...');

        try {
            const response = await SpotifyAPI.getUserPlaylists(50);
            state.playlists = response.items || [];

            console.log('[DJApp] Loaded', state.playlists.length, 'playlists');

            if (elements.playlistSelect) {
                elements.playlistSelect.innerHTML = '<option value="">Select a playlist...</option>';

                state.playlists.forEach(playlist => {
                    const option = document.createElement('option');
                    option.value = playlist.id;
                    option.textContent = `${playlist.name} (${playlist.tracks.total} tracks)`;
                    elements.playlistSelect.appendChild(option);
                });
            }
        } catch (err) {
            console.error('[DJApp] Failed to load playlists:', err);
        }
    }

    async function handlePlaylistChange(event) {
        const playlistId = event.target.value;
        if (!playlistId) return;

        console.log('[DJApp] Loading playlist:', playlistId);
        state.selectedPlaylist = playlistId;

        try {
            const response = await SpotifyAPI.getPlaylistTracks(playlistId, 50);
            const tracks = (response.items || [])
                .filter(item => item.track && item.track.id)
                .map(item => item.track);

            console.log('[DJApp] Loaded', tracks.length, 'tracks');

            // Add estimated audio features
            state.allTracks = tracks.map(track => ({
                ...track,
                audioFeatures: FeatureEstimator.estimateFeatures(track)
            }));

            updateCandidates();

        } catch (err) {
            console.error('[DJApp] Failed to load tracks:', err);
            alert('Failed to load playlist tracks');
        }
    }

    // ==========================================================================
    // DECK MANAGEMENT & PLAYBACK
    // ==========================================================================

    /**
     * Stop any currently playing content on a deck before switching to a new track
     */
    async function stopDeckBeforeSwitch(deck) {
        const audioElement = deck === 'A' ? audio1 : audio2;
        const isPlaying = deck === 'A' ? state.deckAPlaying : state.deckBPlaying;
        const deckState = window.deckState?.[deck];

        console.log('[DJApp] Stopping deck', deck, 'before switch. Playing:', isPlaying, 'Source:', deckState?.source);

        // Stop Spotify if this deck was using it
        if (deckState?.source === 'spotify' && window.activeSpotifyDeck === deck) {
            if (SpotifyPlayer && SpotifyPlayer.isReady()) {
                console.log('[DJApp] Stopping Spotify on deck', deck);
                await SpotifyPlayer.pause();
                await SpotifyPlayer.seek(0);
            }
        }

        // Stop local audio
        if (audioElement) {
            audioElement.pause();
            audioElement.currentTime = 0;
        }

        // Update state
        if (deck === 'A') {
            state.deckAPlaying = false;
        } else {
            state.deckBPlaying = false;
        }

        // Update script.js state
        if (window.updateDeckPlayState) {
            window.updateDeckPlayState(deck, false);
        }
    }

    async function selectTrackForDeck(deck, track) {
        console.log('[DJApp] Loading to Deck', deck, ':', track.name);

        // IMPORTANT: Stop any currently playing song on this deck before loading new one
        await stopDeckBeforeSwitch(deck);

        const infoElement = deck === 'A' ? elements.deckAInfo : elements.deckBInfo;
        const nameElement = deck === 'A' ? elements.song1Name : elements.song2Name;

        // Update track name
        if (nameElement) {
            nameElement.textContent = `${track.name} - ${track.artists?.map(a => a.name).join(', ')}`;
        }

        // Update deck info with playback status
        const features = track.audioFeatures || {};
        const camelot = AutoDJEngine.toCamelot(features.key, features.mode) || '?';

        // Determine playback mode
        const canStream = state.spotifyPlayerReady;
        let statusText, statusBg, statusColor;

        if (canStream) {
            statusText = '🎵 Ready to Stream - Press ▶';
            statusBg = '#166534';
            statusColor = '#22c55e';
        } else if (track.preview_url) {
            statusText = '🎵 30s Preview - Press ▶';
            statusBg = '#1e3a5f';
            statusColor = '#3b82f6';
        } else {
            statusText = '📁 Load local file to play';
            statusBg = '#854d0e';
            statusColor = '#eab308';
        }

        if (infoElement) {
            infoElement.innerHTML = `
                <div class="track-name" style="font-weight: bold; margin-bottom: 4px;">${track.name}</div>
                <div style="font-size: 12px; color: #888; margin-bottom: 8px;">
                    ${track.artists?.map(a => a.name).join(', ') || ''}
                </div>
                <div style="display: flex; gap: 12px; font-size: 13px; margin-bottom: 8px;">
                    <span style="color: #3b82f6;">~${Math.round(features.tempo || 0)} BPM</span>
                    <span style="color: #22c55e;">${camelot}</span>
                    <span style="color: #f97316;">Energy ${Math.round((features.energy || 0) * 100)}%</span>
                </div>
                <div style="font-size: 11px; padding: 4px 8px; border-radius: 4px; display: inline-block;
                    background: ${statusBg}; color: ${statusColor};">
                    ${statusText}
                </div>
                <button class="play-spotify-btn" data-deck="${deck}" data-track-id="${track.id}" style="
                    margin-left: 8px;
                    padding: 6px 12px;
                    border-radius: 4px;
                    border: none;
                    background: #1db954;
                    color: white;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: bold;
                ">▶ PLAY</button>
            `;

            // Add click handler for play button
            const playBtn = infoElement.querySelector('.play-spotify-btn');
            if (playBtn) {
                playBtn.addEventListener('click', () => playTrackOnDeck(deck, track));
            }
        }

        // Update state
        if (deck === 'A') {
            state.currentTrack = track;
            AutoDJEngine.addToSetHistory(track);
            AnalyticsDashboard.recordTrackPlayed(track, { deck: 'A' });
            updateCandidates();
        } else {
            state.nextTrack = track;
            AnalyticsDashboard.recordTrackPlayed(track, { deck: 'B' });
        }

        // IMPORTANT: Set deck state immediately when track is selected
        if (window.setDeckSource) {
            window.setDeckSource(deck, 'spotify', track);
        }

        updateTransitionCard();
    }

    async function playTrackOnDeck(deck, track) {
        console.log('[DJApp] Playing on Deck', deck, ':', track.name);
        console.log('[DJApp] SpotifyPlayer ready:', state.spotifyPlayerReady);
        console.log('[DJApp] Track ID:', track.id);

        // Update deck state FIRST
        if (window.setDeckSource) {
            window.setDeckSource(deck, 'spotify', track);
        }

        if (state.spotifyPlayerReady && SpotifyPlayer && SpotifyPlayer.isReady()) {
            console.log('[DJApp] Attempting Spotify playback...');
            // Use Spotify Web Playback SDK for full track
            const success = await SpotifyPlayer.playById(track.id, deck);
            console.log('[DJApp] Spotify playById result:', success);

            if (success) {
                state.activeDeck = deck;
                if (deck === 'A') {
                    state.deckAPlaying = true;
                } else {
                    state.deckBPlaying = true;
                }
                updateDeckPlayState();

                // IMPORTANT: Tell script.js that Spotify is now active on this deck
                if (window.updateDeckPlayState) {
                    window.updateDeckPlayState(deck, true);
                }
                // Also set activeSpotifyDeck directly for script.js
                if (typeof window.activeSpotifyDeck !== 'undefined') {
                    window.activeSpotifyDeck = deck;
                }

                console.log('[DJApp] Streaming started on Deck', deck);
                return;
            }
            console.log('[DJApp] Streaming failed, falling back to local audio...');
        } else {
            console.log('[DJApp] SpotifyPlayer not ready');
        }

        // Fallback: Set source to local and use the audio element
        if (window.setDeckSource) {
            window.setDeckSource(deck, 'local', track);
        }

        const audioElement = deck === 'A' ? audio1 : audio2;
        if (audioElement && audioElement.src) {
            audioElement.play().catch(e => console.log('[DJApp] Play blocked:', e));
        } else {
            alert('Load a local audio file to play this track.\n\nNote: Spotify only allows streaming on ONE deck at a time.\nUse local files on the other deck for mixing.');
        }
    }

    function handleTrackEnded(deck) {
        console.log('[DJApp] Track ended on Deck', deck);

        if (state.autoDJEnabled) {
            if (deck === 'A' && state.nextTrack) {
                // Swap decks - B becomes the new main
                state.currentTrack = state.nextTrack;
                state.nextTrack = null;

                // Auto-queue next track to the now-empty deck
                if (state.candidates.length > 0) {
                    const nextCandidate = state.candidates.find(c => c.track.id !== state.currentTrack.id);
                    if (nextCandidate) {
                        selectTrackForDeck('A', nextCandidate.track);
                    }
                }

                // Start playing the new track
                if (audio2 && audio2.src) {
                    audio2.play().catch(e => console.log('[DJApp] Auto-play blocked:', e));
                }
            } else if (deck === 'B' && state.currentTrack) {
                // Queue next track for Deck B
                if (state.candidates.length > 0) {
                    selectTrackForDeck('B', state.candidates[0].track);
                }
            }
        }

        updateCandidates();
    }

    function updateDeckPlayState() {
        // Update UI to show which deck is playing
        if (elements.deckAInfo) {
            elements.deckAInfo.style.borderColor = state.deckAPlaying ? '#22c55e' : '';
        }
        if (elements.deckBInfo) {
            elements.deckBInfo.style.borderColor = state.deckBPlaying ? '#22c55e' : '';
        }
    }

    // ==========================================================================
    // AUTO-DJ
    // ==========================================================================

    function toggleAutoDJ() {
        state.autoDJEnabled = !state.autoDJEnabled;

        if (elements.autoDJToggle) {
            elements.autoDJToggle.textContent = state.autoDJEnabled ? '⏸ Auto-DJ Active' : '▶ Enable Auto-DJ';
            elements.autoDJToggle.style.background = state.autoDJEnabled ? '#166534' : '';
            elements.autoDJToggle.style.borderColor = state.autoDJEnabled ? '#22c55e' : '';
        }

        if (state.autoDJEnabled) {
            console.log('[DJApp] Auto-DJ enabled');

            // Auto-queue if needed
            if (!state.nextTrack && state.candidates.length > 0) {
                selectTrackForDeck('B', state.candidates[0].track);
            }

            // If nothing playing, start Deck A
            if (!state.deckAPlaying && !state.deckBPlaying && state.currentTrack) {
                if (audio1 && audio1.src) {
                    audio1.play().catch(e => console.log('[DJApp] Auto-play blocked:', e));
                }
            }
        } else {
            console.log('[DJApp] Auto-DJ disabled');
        }
    }

    function handleAutoFade() {
        if (!state.currentTrack || !state.nextTrack) {
            alert('Load tracks on both decks first');
            return;
        }

        if (state.isTransitioning) return;
        state.isTransitioning = true;

        console.log('[DJApp] Starting auto-fade transition');

        const duration = 5000; // 5 second crossfade
        const interval = 50;
        const steps = duration / interval;
        let step = 0;

        // Start the incoming track
        if (audio2 && audio2.src && !state.deckBPlaying) {
            audio2.play().catch(e => console.log('[DJApp] Play blocked:', e));
        }

        const fadeInterval = setInterval(() => {
            step++;
            const progress = step / steps;

            // Update crossfader
            state.mixer.crossfader = progress;
            if (elements.crossfader) {
                elements.crossfader.value = progress;
            }

            // Apply crossfade volumes
            const volA = Math.cos(progress * 0.5 * Math.PI);
            const volB = Math.cos((1 - progress) * 0.5 * Math.PI);

            if (audio1) audio1.volume = volA;
            if (audio2) audio2.volume = volB;

            updateLiveMixerFeedback();

            if (step >= steps) {
                clearInterval(fadeInterval);
                state.isTransitioning = false;

                // Stop the outgoing track
                if (audio1) {
                    audio1.pause();
                    audio1.currentTime = 0;
                }

                // Swap decks in state
                state.currentTrack = state.nextTrack;
                state.nextTrack = null;

                // Reset crossfader for next transition
                state.mixer.crossfader = 0;
                if (elements.crossfader) elements.crossfader.value = 0;
                if (audio1) audio1.volume = 1;
                if (audio2) audio2.volume = 0;

                // Auto-queue next if Auto-DJ is on
                if (state.autoDJEnabled && state.candidates.length > 0) {
                    const next = state.candidates.find(c => c.track.id !== state.currentTrack.id);
                    if (next) {
                        selectTrackForDeck('A', state.currentTrack);
                        selectTrackForDeck('B', next.track);
                    }
                }

                updateCandidates();
                console.log('[DJApp] Transition complete');
            }
        }, interval);
    }

    // ==========================================================================
    // CANDIDATES & RANKING
    // ==========================================================================

    function updateCandidates() {
        if (state.currentTrack && state.allTracks.length > 0) {
            const available = AutoDJEngine.filterPlayedTracks(
                state.allTracks.filter(t => t.id !== state.currentTrack.id)
            );
            state.candidates = AutoDJEngine.rankCandidates(state.currentTrack, available);
        } else {
            state.candidates = state.allTracks.map(track => ({
                track,
                total: 0.5,
                explanation: 'Select this track to start your set'
            }));
        }

        updateCandidatesList();
        updateTransitionCard();
    }

    function updateCandidatesList() {
        if (!elements.candidatesList) return;

        if (state.candidates.length === 0) {
            elements.candidatesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #888;">
                    Select a playlist to see tracks
                </div>
            `;
            return;
        }

        const topCandidates = state.candidates.slice(0, 20);

        let html = topCandidates.map((candidate, index) => {
            const track = candidate.track;
            const features = track.audioFeatures || {};
            const camelot = AutoDJEngine.toCamelot(features.key, features.mode) || '?';
            const bpm = features.tempo ? Math.round(features.tempo) : '?';
            const score = candidate.total ? Math.round(candidate.total * 100) : null;
            const hasPreview = !!track.preview_url;

            return `
                <div class="candidate-row" data-track-id="${track.id}" style="
                    background: ${index === 0 && state.currentTrack ? '#1e3a5f' : '#1a1a1a'};
                    border: 1px solid ${index === 0 && state.currentTrack ? '#3b82f6' : '#333'};
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 8px;
                    cursor: pointer;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                ${hasPreview ? '<span style="color: #22c55e; font-size: 10px;">●</span>' : '<span style="color: #666; font-size: 10px;">○</span>'}
                                <span style="font-weight: 500; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${index === 0 && state.currentTrack ? '⭐ ' : ''}${track.name}
                                </span>
                            </div>
                            <div style="font-size: 12px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-left: 16px;">
                                ${track.artists?.map(a => a.name).join(', ') || 'Unknown'}
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-left: 12px;">
                            <div style="text-align: right; font-family: monospace; font-size: 11px; color: #888;">
                                <div>~${bpm} BPM</div>
                                <div>${camelot}</div>
                            </div>
                            ${score !== null && score > 0 ? `
                                <div style="
                                    min-width: 42px;
                                    text-align: center;
                                    padding: 4px 8px;
                                    border-radius: 4px;
                                    font-weight: bold;
                                    font-size: 12px;
                                    background: ${score >= 80 ? '#166534' : score >= 60 ? '#854d0e' : '#991b1b'};
                                    color: ${score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444'};
                                ">${score}%</div>
                            ` : ''}
                            <div style="display: flex; gap: 4px;">
                                <button class="load-deck-btn" data-deck="A" style="
                                    padding: 6px 10px;
                                    border-radius: 4px;
                                    border: none;
                                    background: #3b82f6;
                                    color: white;
                                    cursor: pointer;
                                    font-size: 11px;
                                    font-weight: bold;
                                ">DECK A</button>
                                <button class="load-deck-btn" data-deck="B" style="
                                    padding: 6px 10px;
                                    border-radius: 4px;
                                    border: none;
                                    background: #f97316;
                                    color: white;
                                    cursor: pointer;
                                    font-size: 11px;
                                    font-weight: bold;
                                ">DECK B</button>
                            </div>
                        </div>
                    </div>
                    ${index === 0 && state.currentTrack && candidate.explanation ? `
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #333; color: #888; font-size: 12px;">
                            ${candidate.explanation}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Add legend
        html = `
            <div style="padding: 8px 12px; background: #1a1a2e; border-radius: 8px; margin-bottom: 10px; font-size: 11px; color: #888;">
                <span style="color: #22c55e;">●</span> = Preview available (click ▶ to play) &nbsp;
                <span style="color: #666;">○</span> = No preview (load local file)
            </div>
        ` + html;

        elements.candidatesList.innerHTML = html;
    }

    function handleCandidateClick(event) {
        const deckBtn = event.target.closest('.load-deck-btn');
        if (deckBtn) {
            const row = deckBtn.closest('.candidate-row');
            const trackId = row?.dataset.trackId;
            const deck = deckBtn.dataset.deck;

            if (trackId && deck) {
                const candidate = state.candidates.find(c => c.track.id === trackId);
                if (candidate) {
                    selectTrackForDeck(deck, candidate.track);
                }
            }
            return;
        }

        const row = event.target.closest('.candidate-row');
        if (row && !event.target.closest('button')) {
            const trackId = row.dataset.trackId;
            const candidate = state.candidates.find(c => c.track.id === trackId);
            if (candidate) {
                selectTrackForDeck('A', candidate.track);
            }
        }
    }

    // ==========================================================================
    // LIVE MIXING ASSISTANT
    // ==========================================================================

    function updateTransitionCard() {
        if (!elements.transitionCard) return;

        if (!state.currentTrack || !state.nextTrack) {
            elements.transitionCard.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #888;">
                    Load tracks on both decks to see mixing guidance
                </div>
            `;
            return;
        }

        const analysis = HarmonicMixer.analyzeTransition(state.currentTrack, state.nextTrack);

        // Generate enhanced card with live feedback
        elements.transitionCard.innerHTML = generateEnhancedTransitionCard(analysis);
    }

    function updateLiveMixerFeedback() {
        if (!state.currentTrack || !state.nextTrack || !elements.transitionCard) return;

        const feedbackEl = document.getElementById('live-mixer-feedback');
        if (!feedbackEl) return;

        const { crossfader, deckA, deckB } = state.mixer;

        // Calculate effective BPM based on pitch
        const trackA = state.currentTrack.audioFeatures || {};
        const trackB = state.nextTrack.audioFeatures || {};
        const effectiveBpmA = (trackA.tempo || 120) * deckA.pitch;
        const effectiveBpmB = (trackB.tempo || 120) * deckB.pitch;
        const bpmDiff = Math.abs(effectiveBpmA - effectiveBpmB);

        // Determine status
        let bpmStatus, bpmColor;
        if (bpmDiff <= 2) {
            bpmStatus = 'LOCKED';
            bpmColor = '#22c55e';
        } else if (bpmDiff <= 6) {
            bpmStatus = 'CLOSE';
            bpmColor = '#86efac';
        } else if (bpmDiff <= 12) {
            bpmStatus = 'ADJUST';
            bpmColor = '#eab308';
        } else {
            bpmStatus = 'MISMATCH';
            bpmColor = '#ef4444';
        }

        // Crossfader position feedback
        let fadeStatus;
        if (crossfader < 0.2) {
            fadeStatus = 'Deck A dominant';
        } else if (crossfader > 0.8) {
            fadeStatus = 'Deck B dominant';
        } else if (crossfader > 0.4 && crossfader < 0.6) {
            fadeStatus = 'Equal blend';
        } else {
            fadeStatus = crossfader < 0.5 ? 'Favoring Deck A' : 'Favoring Deck B';
        }

        // EQ feedback
        const bassSwap = deckA.bass < 0.3 && deckB.bass > 0.5;
        const eqTip = bassSwap ? 'Bass swap technique active' : 'Adjust bass for smoother blend';

        feedbackEl.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                    <div style="color: #666; font-size: 10px; margin-bottom: 4px;">BPM SYNC</div>
                    <div style="color: ${bpmColor}; font-weight: bold;">${bpmStatus}</div>
                    <div style="font-size: 11px; color: #888;">
                        A: ${effectiveBpmA.toFixed(1)} | B: ${effectiveBpmB.toFixed(1)}
                    </div>
                </div>
                <div>
                    <div style="color: #666; font-size: 10px; margin-bottom: 4px;">CROSSFADER</div>
                    <div style="color: #fff; font-weight: bold;">${Math.round(crossfader * 100)}%</div>
                    <div style="font-size: 11px; color: #888;">${fadeStatus}</div>
                </div>
            </div>
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #333;">
                <div style="color: #666; font-size: 10px; margin-bottom: 4px;">LIVE TIP</div>
                <div style="font-size: 12px; color: ${bpmDiff > 6 ? '#eab308' : '#22c55e'};">
                    ${bpmDiff > 6
                        ? `Adjust Deck ${effectiveBpmA > effectiveBpmB ? 'A pitch down' : 'B pitch down'} to match BPM`
                        : eqTip}
                </div>
            </div>
        `;
    }

    function generateEnhancedTransitionCard(analysis) {
        const { quality, bpm, harmonic, tips } = analysis;

        return `
            <div style="background: #1a1a1a; border-radius: 12px; padding: 16px;">
                <!-- Header with quality badge -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="font-size: 14px; color: #fff;">
                        Transition Analysis
                    </div>
                    <span style="
                        background: ${quality.bgColor};
                        color: ${quality.color};
                        padding: 4px 12px;
                        border-radius: 12px;
                        font-weight: bold;
                        font-size: 12px;
                        border: 1px solid ${quality.color};
                    ">${quality.name}</span>
                </div>

                <!-- BPM & Key info -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                    <div>
                        <div style="color: #666; font-size: 10px; margin-bottom: 4px;">BPM</div>
                        <div style="font-size: 18px; font-weight: bold; color: #fff;">
                            ${bpm.source || '?'} → ${bpm.target || '?'}
                        </div>
                        <div style="font-size: 11px; color: ${bpm.compatible ? '#22c55e' : '#ef4444'};">
                            ${bpm.bandInfo?.label || 'Unknown'}
                        </div>
                    </div>
                    <div>
                        <div style="color: #666; font-size: 10px; margin-bottom: 4px;">KEY</div>
                        <div style="font-size: 18px; font-weight: bold; color: #fff;">
                            ${harmonic.source.camelot || '?'} → ${harmonic.target.camelot || '?'}
                        </div>
                        <div style="font-size: 11px; color: ${harmonic.compatible ? '#22c55e' : '#ef4444'};">
                            ${harmonic.relationship}
                        </div>
                    </div>
                </div>

                <!-- Live mixer feedback area -->
                <div id="live-mixer-feedback" style="
                    background: #0a0a1a;
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 16px;
                ">
                    <div style="color: #888; text-align: center;">
                        Adjust mixer controls to see live feedback
                    </div>
                </div>

                <!-- Tips -->
                <div style="background: #262626; border-radius: 8px; padding: 12px;">
                    <div style="color: #666; font-size: 10px; margin-bottom: 8px;">MIXING TIPS</div>
                    ${tips.map(tip => `
                        <div style="color: #ccc; font-size: 12px; margin: 4px 0;">${tip}</div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // ==========================================================================
    // ANALYTICS
    // ==========================================================================

    function handleEndSession() {
        const status = AnalyticsDashboard.getSessionStatus();

        if (!status.isRecording) {
            // Start a new session
            AnalyticsDashboard.startSession();
            updateSessionUI(true);
            console.log('[DJApp] Started new recording session');
            return;
        }

        // End current session
        const session = AnalyticsDashboard.endSession();

        if (session && elements.sessionSummary) {
            elements.sessionSummary.innerHTML = `
                ${AnalyticsDashboard.generateSummaryCard(session.summary)}
                <div style="margin-top: 16px; text-align: center;">
                    <p style="color: #888; margin-bottom: 12px;">Session saved! Ready for a new set?</p>
                </div>
            `;
        }

        updateSessionUI(false);
        console.log('[DJApp] Ended recording session');
    }

    function updateSessionUI(isRecording) {
        if (elements.endSessionBtn) {
            if (isRecording) {
                elements.endSessionBtn.textContent = 'End Session';
                elements.endSessionBtn.style.background = '#991b1b';
                elements.endSessionBtn.style.borderColor = '#ef4444';
            } else {
                elements.endSessionBtn.textContent = 'Start New Session';
                elements.endSessionBtn.style.background = '#166534';
                elements.endSessionBtn.style.borderColor = '#22c55e';
            }
        }

        if (elements.sessionSummary && isRecording) {
            elements.sessionSummary.innerHTML = `
                <div class="session-active">
                    <div class="pulse-dot"></div>
                    <span>Recording session...</span>
                </div>
            `;
        }
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        init,
        getState: () => ({ ...state }),
        selectTrackForDeck,
        toggleAutoDJ,
        handleAutoFade
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    DJApp.init();
});
