/**
 * DJ Controller - Core Audio & Controls
 *
 * Handles:
 * - Local audio playback for both decks
 * - Integration with Spotify SDK
 * - Transport controls (play, pause, stop, loop)
 * - Mixer controls (volume, pitch, EQ, crossfader)
 * - Auto-fade transitions
 */

// ==========================================================================
// AUDIO ELEMENTS
// ==========================================================================

const audio1 = new Audio();
const audio2 = new Audio();
window.audio1 = audio1;
window.audio2 = audio2;

// ==========================================================================
// WEB AUDIO API - EQ PROCESSING
// ==========================================================================

let audioContext = null;
let audioNodes = {
    A: { source: null, bass: null, mid: null, treble: null, gain: null },
    B: { source: null, bass: null, mid: null, treble: null, gain: null }
};

/**
 * Initialize Web Audio API for EQ processing
 * Called when user first interacts with audio
 */
function initAudioContext() {
    if (audioContext) return;

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('[DJ] AudioContext initialized');

        // Setup audio nodes for Deck A
        setupDeckAudioNodes('A', audio1);
        // Setup audio nodes for Deck B
        setupDeckAudioNodes('B', audio2);

    } catch (e) {
        console.error('[DJ] Failed to create AudioContext:', e);
    }
}

/**
 * Setup audio processing chain for a deck
 * audio -> bass filter -> mid filter -> treble filter -> gain -> destination
 */
function setupDeckAudioNodes(deck, audioElement) {
    if (!audioContext) return;

    try {
        // Create source from audio element
        const source = audioContext.createMediaElementSource(audioElement);

        // Create bass filter (lowshelf at 200Hz)
        const bass = audioContext.createBiquadFilter();
        bass.type = 'lowshelf';
        bass.frequency.value = 200;
        bass.gain.value = 0; // -12 to +12 dB range

        // Create mid filter (peaking at 1000Hz)
        const mid = audioContext.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1000;
        mid.Q.value = 1;
        mid.gain.value = 0;

        // Create treble filter (highshelf at 3000Hz)
        const treble = audioContext.createBiquadFilter();
        treble.type = 'highshelf';
        treble.frequency.value = 3000;
        treble.gain.value = 0;

        // Create gain node for volume control via EQ path
        const gain = audioContext.createGain();
        gain.gain.value = 1;

        // Connect the chain
        source.connect(bass);
        bass.connect(mid);
        mid.connect(treble);
        treble.connect(gain);
        gain.connect(audioContext.destination);

        // Store references
        audioNodes[deck] = { source, bass, mid, treble, gain };

        console.log('[DJ] Audio nodes setup for Deck', deck);

    } catch (e) {
        console.error('[DJ] Failed to setup audio nodes for Deck', deck, e);
    }
}

/**
 * Apply EQ value to a filter
 * @param {string} deck - 'A' or 'B'
 * @param {string} band - 'bass', 'mid', or 'treble'
 * @param {number} value - Slider value 0 to 1, where 0.5 is neutral
 */
function applyEQ(deck, band, value) {
    if (!audioContext || !audioNodes[deck] || !audioNodes[deck][band]) {
        return;
    }

    // Convert 0-1 slider value to dB (-12 to +12)
    // 0 = -12dB (cut), 0.5 = 0dB (neutral), 1 = +12dB (boost)
    const gainDB = (value - 0.5) * 24;

    audioNodes[deck][band].gain.value = gainDB;
    console.log(`[DJ] EQ ${band} on Deck ${deck}: ${gainDB.toFixed(1)}dB`);
}

// ==========================================================================
// DECK STATE
// ==========================================================================

const deckState = {
    A: {
        source: 'none',      // 'none', 'local', 'spotify'
        isPlaying: false,
        isLooping: false,
        track: null,
        spotifyTrackId: null
    },
    B: {
        source: 'none',
        isPlaying: false,
        isLooping: false,
        track: null,
        spotifyTrackId: null
    }
};
window.deckState = deckState;

// Track which deck is currently using Spotify (only one at a time)
let activeSpotifyDeck = null;
window.activeSpotifyDeck = null; // Expose for app.js

// ==========================================================================
// FILE UPLOAD HANDLERS
// ==========================================================================

function handleFileUpload(event, deck) {
    const file = event.target.files[0];
    if (!file) return;

    // Initialize AudioContext on user interaction
    initAudioContext();

    const audioElement = deck === 'A' ? audio1 : audio2;
    const nameElement = document.getElementById(deck === 'A' ? 'song1Name' : 'song2Name');
    const reader = new FileReader();

    reader.onload = function(e) {
        audioElement.src = e.target.result;
        audioElement.load();
        if (nameElement) {
            nameElement.textContent = file.name;
        }

        // Estimate BPM from filename or use default
        const estimatedBPM = estimateBPMFromFilename(file.name) || 120;

        deckState[deck].source = 'local';
        deckState[deck].track = {
            name: file.name,
            audioFeatures: { tempo: estimatedBPM }
        };
        deckState[deck].spotifyTrackId = null;

        // Reset pitch slider to neutral
        const pitchSlider = document.getElementById(deck === 'A' ? 'pitchSong1' : 'pitchSong2');
        const pitchLabel = document.getElementById(deck === 'A' ? 'pitch1Val' : 'pitch2Val');
        if (pitchSlider) {
            pitchSlider.value = 1;
            audioElement.playbackRate = 1;
        }
        if (pitchLabel) {
            pitchLabel.textContent = '0%';
        }

        // Update effective BPM display
        updateEffectiveBPMDisplay(deck, 1);

        updateDeckUI(deck);
        console.log(`[DJ] Loaded local file on Deck ${deck}:`, file.name, `(estimated ~${estimatedBPM} BPM)`);
        showToast(`Loaded: ${file.name} (EQ and Pitch active)`);
    };

    reader.readAsDataURL(file);
}

/**
 * Try to estimate BPM from filename (e.g., "Song Name - 128 BPM.mp3")
 */
function estimateBPMFromFilename(filename) {
    const bpmMatch = filename.match(/(\d{2,3})\s*bpm/i);
    if (bpmMatch) {
        const bpm = parseInt(bpmMatch[1]);
        if (bpm >= 60 && bpm <= 200) {
            return bpm;
        }
    }
    return null;
}

document.getElementById('uploadSong1')?.addEventListener('change', (e) => handleFileUpload(e, 'A'));
document.getElementById('uploadSong2')?.addEventListener('change', (e) => handleFileUpload(e, 'B'));

// ==========================================================================
// TRANSPORT CONTROLS
// ==========================================================================

async function playDeck(deck) {
    console.log(`[DJ] Play requested for Deck ${deck}`);
    console.log(`[DJ] Deck state:`, JSON.stringify(deckState[deck]));
    console.log(`[DJ] SpotifyPlayer available:`, !!window.SpotifyPlayer);
    console.log(`[DJ] SpotifyPlayer ready:`, window.SpotifyPlayer?.isReady?.());
    console.log(`[DJ] activeSpotifyDeck:`, activeSpotifyDeck);

    // Initialize AudioContext on first user interaction (required by browsers)
    initAudioContext();

    const audioElement = deck === 'A' ? audio1 : audio2;

    // If this deck has a Spotify track and SDK is ready
    if (deckState[deck].source === 'spotify' && deckState[deck].spotifyTrackId) {
        const spotifyReady = window.SpotifyPlayer && window.SpotifyPlayer.isReady();
        console.log(`[DJ] Spotify ready check:`, spotifyReady);

        if (spotifyReady) {
            let success = false;

            // If Spotify was already playing on this deck, resume
            if (activeSpotifyDeck === deck) {
                console.log(`[DJ] Resuming Spotify on Deck ${deck}`);
                success = await window.SpotifyPlayer.resume();
            } else {
                // Start new playback
                console.log(`[DJ] Starting new Spotify playback on Deck ${deck}, track:`, deckState[deck].spotifyTrackId);
                success = await window.SpotifyPlayer.playById(deckState[deck].spotifyTrackId, deck);
                if (success) {
                    activeSpotifyDeck = deck;
                    window.activeSpotifyDeck = deck;
                }
            }

            if (success) {
                deckState[deck].isPlaying = true;
                updateTransportUI(deck);
                showToast(`Playing on Deck ${deck}`);
                return;
            } else {
                console.log(`[DJ] Spotify play failed`);
            }
        }
    }

    // Fallback to local audio
    if (audioElement.src) {
        try {
            await audioElement.play();
            deckState[deck].isPlaying = true;
            deckState[deck].source = 'local';
            updateTransportUI(deck);
        } catch(e) {
            console.log('[DJ] Play blocked:', e);
            showToast('Click to enable audio playback');
        }
    } else {
        console.log(`[DJ] No audio source for Deck ${deck}`);
        showToast(`Load a track on Deck ${deck} first`);
    }
}

async function pauseDeck(deck) {
    console.log(`[DJ] Pause requested for Deck ${deck}`);
    console.log(`[DJ] Deck source:`, deckState[deck].source);
    console.log(`[DJ] activeSpotifyDeck:`, activeSpotifyDeck);

    const audioElement = deck === 'A' ? audio1 : audio2;

    // Try to pause Spotify if this deck was using it
    if (deckState[deck].source === 'spotify') {
        const spotifyReady = window.SpotifyPlayer && window.SpotifyPlayer.isReady();
        console.log(`[DJ] Attempting Spotify pause, ready:`, spotifyReady);

        if (spotifyReady) {
            console.log(`[DJ] Calling SpotifyPlayer.pause()`);
            const result = await window.SpotifyPlayer.pause();
            console.log(`[DJ] Pause result:`, result);
        }
    }

    // Always pause local audio too
    audioElement.pause();
    deckState[deck].isPlaying = false;
    updateTransportUI(deck);
    showToast(`Paused Deck ${deck}`);
}

async function stopDeck(deck) {
    console.log(`[DJ] Stop requested for Deck ${deck}`);

    const audioElement = deck === 'A' ? audio1 : audio2;

    // Stop Spotify if active on this deck
    if (deckState[deck].source === 'spotify' && activeSpotifyDeck === deck) {
        if (window.SpotifyPlayer?.isReady()) {
            await window.SpotifyPlayer.pause();
            await window.SpotifyPlayer.seek(0);
        }
    }

    // Stop local audio
    audioElement.pause();
    audioElement.currentTime = 0;
    deckState[deck].isPlaying = false;
    updateTransportUI(deck);

    // Reset seek slider
    const seekSlider = document.getElementById(deck === 'A' ? 'seekSong1' : 'seekSong2');
    if (seekSlider) seekSlider.value = 0;

    const timeDisplay = document.getElementById(deck === 'A' ? 'currentTimeSong1' : 'currentTimeSong2');
    if (timeDisplay) timeDisplay.textContent = '0:00';
}

function toggleLoop(deck) {
    const audioElement = deck === 'A' ? audio1 : audio2;
    deckState[deck].isLooping = !deckState[deck].isLooping;
    audioElement.loop = deckState[deck].isLooping;
    updateTransportUI(deck);
    console.log(`[DJ] Deck ${deck} loop:`, deckState[deck].isLooping);
    showToast(`Loop ${deckState[deck].isLooping ? 'ON' : 'OFF'} for Deck ${deck}`);
}

// Transport button event listeners
document.getElementById('playSong1')?.addEventListener('click', () => playDeck('A'));
document.getElementById('pauseSong1')?.addEventListener('click', () => pauseDeck('A'));
document.getElementById('stopSong1')?.addEventListener('click', () => stopDeck('A'));
document.getElementById('repeatSong1')?.addEventListener('click', () => toggleLoop('A'));
document.getElementById('loopSong1')?.addEventListener('click', () => toggleLoop('A'));

document.getElementById('playSong2')?.addEventListener('click', () => playDeck('B'));
document.getElementById('pauseSong2')?.addEventListener('click', () => pauseDeck('B'));
document.getElementById('stopSong2')?.addEventListener('click', () => stopDeck('B'));
document.getElementById('repeatSong2')?.addEventListener('click', () => toggleLoop('B'));
document.getElementById('loopSong2')?.addEventListener('click', () => toggleLoop('B'));

// ==========================================================================
// SEEK CONTROLS
// ==========================================================================

async function seekDeck(deck, positionSeconds) {
    const audioElement = deck === 'A' ? audio1 : audio2;
    const positionMs = positionSeconds * 1000;

    console.log(`[DJ] Seek Deck ${deck} to ${positionSeconds}s (${positionMs}ms)`);

    // If using Spotify
    if (deckState[deck].source === 'spotify') {
        const spotifyReady = window.SpotifyPlayer && window.SpotifyPlayer.isReady();
        console.log(`[DJ] Seek Spotify, ready:`, spotifyReady);

        if (spotifyReady) {
            console.log(`[DJ] Calling SpotifyPlayer.seek(${positionMs})`);
            await window.SpotifyPlayer.seek(positionMs);
        }
    }

    // Also seek local audio if it has a source
    if (audioElement.src && audioElement.duration) {
        audioElement.currentTime = positionSeconds;
    }
}

document.getElementById('seekSong1')?.addEventListener('input', function() {
    seekDeck('A', parseInt(this.value));
});

document.getElementById('seekSong2')?.addEventListener('input', function() {
    seekDeck('B', parseInt(this.value));
});

// ==========================================================================
// MIXER CONTROLS
// ==========================================================================

// Volume controls
document.getElementById('volumeSong1')?.addEventListener('input', async function() {
    const volume = parseFloat(this.value);
    audio1.volume = volume;

    // Also update Spotify volume if active on this deck
    if (activeSpotifyDeck === 'A' && window.SpotifyPlayer?.isReady()) {
        await window.SpotifyPlayer.setVolume(volume);
    }

    const label = document.getElementById('vol1Val');
    if (label) label.textContent = Math.round(volume * 100) + '%';
});

document.getElementById('volumeSong2')?.addEventListener('input', async function() {
    const volume = parseFloat(this.value);
    audio2.volume = volume;

    if (activeSpotifyDeck === 'B' && window.SpotifyPlayer?.isReady()) {
        await window.SpotifyPlayer.setVolume(volume);
    }

    const label = document.getElementById('vol2Val');
    if (label) label.textContent = Math.round(volume * 100) + '%';
});

// Pitch controls - affects local audio playback rate
document.getElementById('pitchSong1')?.addEventListener('input', function() {
    const pitch = parseFloat(this.value);
    audio1.playbackRate = pitch;
    const percent = Math.round((pitch - 1) * 100);
    const label = document.getElementById('pitch1Val');
    if (label) label.textContent = (percent >= 0 ? '+' : '') + percent + '%';

    // Update effective BPM display
    updateEffectiveBPMDisplay('A', pitch);
});

document.getElementById('pitchSong2')?.addEventListener('input', function() {
    const pitch = parseFloat(this.value);
    audio2.playbackRate = pitch;
    const percent = Math.round((pitch - 1) * 100);
    const label = document.getElementById('pitch2Val');
    if (label) label.textContent = (percent >= 0 ? '+' : '') + percent + '%';

    // Update effective BPM display
    updateEffectiveBPMDisplay('B', pitch);
});

/**
 * Update the effective BPM display for a deck
 */
function updateEffectiveBPMDisplay(deck, pitch) {
    const displayId = deck === 'A' ? 'effectiveBPM1' : 'effectiveBPM2';
    const displayEl = document.getElementById(displayId);
    if (!displayEl) return;

    const track = deckState[deck]?.track;
    const baseBPM = track?.audioFeatures?.tempo;

    if (deckState[deck]?.source === 'local' && baseBPM) {
        const effectiveBPM = baseBPM * pitch;
        displayEl.innerHTML = `
            <span style="color: #888;">Base: ${Math.round(baseBPM)} BPM</span> →
            <span style="font-weight: bold;">Effective: ${effectiveBPM.toFixed(1)} BPM</span>
        `;
        console.log(`[DJ] Deck ${deck} effective BPM: ${effectiveBPM.toFixed(1)}`);
    } else if (deckState[deck]?.source === 'spotify') {
        displayEl.innerHTML = `
            <span style="color: #888;">~${Math.round(baseBPM || 120)} BPM (Spotify - pitch N/A)</span>
        `;
    } else {
        displayEl.textContent = 'Pitch works on local files only';
    }
}

// EQ controls - Now with real audio processing!
document.getElementById('bassSong1')?.addEventListener('input', function() {
    const value = parseFloat(this.value);
    const valueLabel = this.parentElement?.querySelector('.eq-val');
    if (valueLabel) {
        const db = Math.round((value - 0.5) * 24);
        valueLabel.textContent = (db >= 0 ? '+' : '') + db + 'dB';
    }
    applyEQ('A', 'bass', value);
});

document.getElementById('midSong1')?.addEventListener('input', function() {
    const value = parseFloat(this.value);
    const valueLabel = this.parentElement?.querySelector('.eq-val');
    if (valueLabel) {
        const db = Math.round((value - 0.5) * 24);
        valueLabel.textContent = (db >= 0 ? '+' : '') + db + 'dB';
    }
    applyEQ('A', 'mid', value);
});

document.getElementById('trebleSong1')?.addEventListener('input', function() {
    const value = parseFloat(this.value);
    const valueLabel = this.parentElement?.querySelector('.eq-val');
    if (valueLabel) {
        const db = Math.round((value - 0.5) * 24);
        valueLabel.textContent = (db >= 0 ? '+' : '') + db + 'dB';
    }
    applyEQ('A', 'treble', value);
});

document.getElementById('bassSong2')?.addEventListener('input', function() {
    const value = parseFloat(this.value);
    const valueLabel = this.parentElement?.querySelector('.eq-val');
    if (valueLabel) {
        const db = Math.round((value - 0.5) * 24);
        valueLabel.textContent = (db >= 0 ? '+' : '') + db + 'dB';
    }
    applyEQ('B', 'bass', value);
});

document.getElementById('midSong2')?.addEventListener('input', function() {
    const value = parseFloat(this.value);
    const valueLabel = this.parentElement?.querySelector('.eq-val');
    if (valueLabel) {
        const db = Math.round((value - 0.5) * 24);
        valueLabel.textContent = (db >= 0 ? '+' : '') + db + 'dB';
    }
    applyEQ('B', 'mid', value);
});

document.getElementById('trebleSong2')?.addEventListener('input', function() {
    const value = parseFloat(this.value);
    const valueLabel = this.parentElement?.querySelector('.eq-val');
    if (valueLabel) {
        const db = Math.round((value - 0.5) * 24);
        valueLabel.textContent = (db >= 0 ? '+' : '') + db + 'dB';
    }
    applyEQ('B', 'treble', value);
});

// ==========================================================================
// CROSSFADER
// ==========================================================================

let crossfaderValue = 0.5;

document.getElementById('crossfade')?.addEventListener('input', function() {
    crossfaderValue = parseFloat(this.value);
    applyCrossfade();
    updateCrossfaderDisplay();
});

async function applyCrossfade() {
    // Equal power crossfade curve
    const volumeA = Math.cos(crossfaderValue * 0.5 * Math.PI);
    const volumeB = Math.cos((1.0 - crossfaderValue) * 0.5 * Math.PI);

    const vol1Slider = document.getElementById('volumeSong1');
    const vol2Slider = document.getElementById('volumeSong2');
    const baseVolA = parseFloat(vol1Slider?.value || 1);
    const baseVolB = parseFloat(vol2Slider?.value || 1);

    // Apply to local audio
    audio1.volume = volumeA * baseVolA;
    audio2.volume = volumeB * baseVolB;

    // Apply to Spotify based on which deck is active
    if (window.SpotifyPlayer?.isReady()) {
        if (activeSpotifyDeck === 'A') {
            await window.SpotifyPlayer.setVolume(volumeA * baseVolA);
        } else if (activeSpotifyDeck === 'B') {
            await window.SpotifyPlayer.setVolume(volumeB * baseVolB);
        }
    }
}

/**
 * Update the crossfader display to show current levels
 */
function updateCrossfaderDisplay() {
    const volumeA = Math.cos(crossfaderValue * 0.5 * Math.PI);
    const volumeB = Math.cos((1.0 - crossfaderValue) * 0.5 * Math.PI);

    const crossfaderAEl = document.getElementById('crossfaderA');
    const crossfaderBEl = document.getElementById('crossfaderB');
    const crossfaderStatusEl = document.getElementById('crossfaderStatus');

    if (crossfaderAEl) {
        const percentA = Math.round(volumeA * 100);
        crossfaderAEl.textContent = `A: ${percentA}%`;
        crossfaderAEl.style.fontWeight = percentA > 70 ? 'bold' : 'normal';
    }

    if (crossfaderBEl) {
        const percentB = Math.round(volumeB * 100);
        crossfaderBEl.textContent = `B: ${percentB}%`;
        crossfaderBEl.style.fontWeight = percentB > 70 ? 'bold' : 'normal';
    }

    if (crossfaderStatusEl) {
        if (crossfaderValue < 0.2) {
            crossfaderStatusEl.textContent = 'Deck A Solo';
            crossfaderStatusEl.style.color = '#3b82f6';
        } else if (crossfaderValue > 0.8) {
            crossfaderStatusEl.textContent = 'Deck B Solo';
            crossfaderStatusEl.style.color = '#f97316';
        } else if (crossfaderValue > 0.4 && crossfaderValue < 0.6) {
            crossfaderStatusEl.textContent = 'Equal Mix';
            crossfaderStatusEl.style.color = '#22c55e';
        } else {
            crossfaderStatusEl.textContent = crossfaderValue < 0.5 ? 'Favoring A' : 'Favoring B';
            crossfaderStatusEl.style.color = '#888';
        }
    }
}

// ==========================================================================
// SYNC BPM
// ==========================================================================

document.getElementById('syncSongs')?.addEventListener('click', function() {
    const trackA = deckState.A.track;
    const trackB = deckState.B.track;

    if (!trackA || !trackB) {
        showToast('Load tracks on both decks first');
        return;
    }

    const bpmA = trackA.audioFeatures?.tempo;
    const bpmB = trackB.audioFeatures?.tempo;

    if (!bpmA || !bpmB) {
        showToast('BPM data not available for these tracks');
        return;
    }

    // Check which deck has local audio (we can only adjust local audio)
    const deckALocal = deckState.A.source === 'local';
    const deckBLocal = deckState.B.source === 'local';

    if (!deckALocal && !deckBLocal) {
        showToast('Sync BPM only works with local audio files. Spotify tracks cannot be speed-adjusted.');
        return;
    }

    let targetDeck, referenceDeck, targetBPM, referenceBPM;

    if (deckALocal && !deckBLocal) {
        // Deck A is local, B is Spotify - sync A to B
        targetDeck = 'A';
        referenceDeck = 'B';
        targetBPM = bpmA;
        referenceBPM = bpmB;
    } else if (deckBLocal && !deckALocal) {
        // Deck B is local, A is Spotify - sync B to A
        targetDeck = 'B';
        referenceDeck = 'A';
        targetBPM = bpmB;
        referenceBPM = bpmA;
    } else {
        // Both are local - sync B to A (default behavior)
        targetDeck = 'B';
        referenceDeck = 'A';
        targetBPM = bpmB;
        referenceBPM = bpmA;
    }

    // Calculate pitch adjustment
    const ratio = referenceBPM / targetBPM;

    // Clamp to valid pitch range (0.5 to 1.5)
    const clampedRatio = Math.max(0.5, Math.min(1.5, ratio));

    // Apply to the target deck's audio
    const audioElement = targetDeck === 'A' ? audio1 : audio2;
    audioElement.playbackRate = clampedRatio;

    // Update pitch slider
    const pitchSlider = document.getElementById(targetDeck === 'A' ? 'pitchSong1' : 'pitchSong2');
    const pitchLabel = document.getElementById(targetDeck === 'A' ? 'pitch1Val' : 'pitch2Val');
    if (pitchSlider) {
        pitchSlider.value = clampedRatio;
        const percent = Math.round((clampedRatio - 1) * 100);
        if (pitchLabel) pitchLabel.textContent = (percent >= 0 ? '+' : '') + percent + '%';
    }

    // Update effective BPM display
    updateEffectiveBPMDisplay(targetDeck, clampedRatio);

    const effectiveBPM = targetBPM * clampedRatio;
    console.log(`[DJ] Synced: Deck ${targetDeck} (${targetBPM.toFixed(1)} BPM) to match Deck ${referenceDeck} (${referenceBPM.toFixed(1)} BPM)`);
    console.log(`[DJ] Pitch ratio: ${clampedRatio.toFixed(3)}, Effective BPM: ${effectiveBPM.toFixed(1)}`);

    if (Math.abs(effectiveBPM - referenceBPM) < 1) {
        showToast(`BPM Synced! Both decks at ~${Math.round(referenceBPM)} BPM`);
    } else {
        showToast(`Deck ${targetDeck} adjusted to ${effectiveBPM.toFixed(1)} BPM (limited by pitch range)`);
    }
});

// ==========================================================================
// AUTO-FADE TRANSITION
// ==========================================================================

let isAutoFading = false;
let autoFadeDirection = null; // 'AtoB' or 'BtoA'
let lastTrackSwitchTime = 0; // Timestamp of last track switch during transition

// Expose for other modules to check
window.isTransitioning = () => isAutoFading || (Date.now() - lastTrackSwitchTime < 2000);

document.getElementById('autoFade')?.addEventListener('click', startAutoFade);

async function startAutoFade() {
    const autoFadeBtn = document.getElementById('autoFade');

    // If already fading, allow cancel
    if (isAutoFading) {
        cancelAutoFade();
        return;
    }

    // Check if both decks have tracks loaded - use multiple indicators
    const deckALoaded = deckState.A.source !== 'none' ||
                        deckState.A.spotifyTrackId ||
                        deckState.A.track ||
                        (audio1 && audio1.src && audio1.src !== '');
    const deckBLoaded = deckState.B.source !== 'none' ||
                        deckState.B.spotifyTrackId ||
                        deckState.B.track ||
                        (audio2 && audio2.src && audio2.src !== '');

    console.log(`[DJ] AutoFade check - Deck A loaded: ${deckALoaded} (source: ${deckState.A.source}, trackId: ${deckState.A.spotifyTrackId})`);
    console.log(`[DJ] AutoFade check - Deck B loaded: ${deckBLoaded} (source: ${deckState.B.source}, trackId: ${deckState.B.spotifyTrackId})`);

    if (!deckALoaded && !deckBLoaded) {
        showToast('Load tracks on both decks first');
        return;
    }

    if (!deckALoaded || !deckBLoaded) {
        showToast('Load a track on the other deck to transition');
        return;
    }

    // Determine fade direction based on which deck is playing
    if (deckState.A.isPlaying && !deckState.B.isPlaying) {
        autoFadeDirection = 'AtoB';
    } else if (deckState.B.isPlaying && !deckState.A.isPlaying) {
        autoFadeDirection = 'BtoA';
    } else if (activeSpotifyDeck === 'A') {
        autoFadeDirection = 'AtoB';
    } else if (activeSpotifyDeck === 'B') {
        autoFadeDirection = 'BtoA';
    } else {
        // Default: use crossfader position
        autoFadeDirection = crossfaderValue < 0.5 ? 'AtoB' : 'BtoA';
    }

    const fromDeck = autoFadeDirection === 'AtoB' ? 'A' : 'B';
    const toDeck = autoFadeDirection === 'AtoB' ? 'B' : 'A';

    // Check if this is a Spotify-to-Spotify transition
    // Use spotifyTrackId as the primary indicator since source might not always be set
    const fromIsSpotify = deckState[fromDeck].source === 'spotify' || deckState[fromDeck].spotifyTrackId;
    const toIsSpotify = deckState[toDeck].source === 'spotify' || deckState[toDeck].spotifyTrackId;
    const isSpotifyTransition = fromIsSpotify && toIsSpotify;

    console.log(`[DJ] Transition type - From: ${fromIsSpotify ? 'Spotify' : 'Local'}, To: ${toIsSpotify ? 'Spotify' : 'Local'}`);

    if (isSpotifyTransition) {
        await startSpotifyTransition(fromDeck, toDeck, autoFadeBtn);
    } else {
        await startStandardTransition(fromDeck, toDeck, autoFadeBtn);
    }
}

/**
 * Spotify-to-Spotify transition
 * Since only one Spotify stream can play at a time, we:
 * 1. Fade out the current track
 * 2. At midpoint, switch to the new track at low volume
 * 3. Fade in the new track
 */
async function startSpotifyTransition(fromDeck, toDeck, autoFadeBtn) {
    isAutoFading = true;
    autoFadeDirection = fromDeck === 'A' ? 'AtoB' : 'BtoA';

    console.log(`[DJ] Starting Spotify transition: Deck ${fromDeck} → Deck ${toDeck}`);
    console.log(`[DJ] Current activeSpotifyDeck: ${activeSpotifyDeck}`);
    console.log(`[DJ] Deck states - A: ${deckState.A.source}/${deckState.A.isPlaying}, B: ${deckState.B.source}/${deckState.B.isPlaying}`);

    // Update button
    if (autoFadeBtn) {
        autoFadeBtn.textContent = 'Cancel Fade';
        autoFadeBtn.style.background = '#991b1b';
        autoFadeBtn.style.borderColor = '#ef4444';
    }

    showToast(`Transitioning Deck ${fromDeck} → Deck ${toDeck}...`);

    const crossfadeSlider = document.getElementById('crossfade');
    const duration = 6000; // 6 seconds total
    const interval = 50;
    const totalSteps = duration / interval;
    const midpoint = Math.floor(totalSteps / 2);
    let step = 0;
    let hasSwitched = false;

    // Determine starting crossfader position based on direction
    const startCrossfader = fromDeck === 'A' ? 0 : 1;
    const endCrossfader = fromDeck === 'A' ? 1 : 0;

    // Set initial crossfader position
    crossfaderValue = startCrossfader;
    if (crossfadeSlider) crossfadeSlider.value = startCrossfader;
    updateCrossfaderDisplay();

    // Make sure the from deck is playing and we have the right track
    // If Spotify isn't playing the fromDeck track, start it
    if (window.SpotifyPlayer?.isReady()) {
        const currentState = await window.SpotifyPlayer.getState();
        const fromTrackId = deckState[fromDeck].spotifyTrackId;

        // Check if correct track is playing
        if (!currentState || currentState.paused || activeSpotifyDeck !== fromDeck) {
            console.log(`[DJ] Starting playback on Deck ${fromDeck} before transition`);
            await window.SpotifyPlayer.playById(fromTrackId, fromDeck);
            activeSpotifyDeck = fromDeck;
            window.activeSpotifyDeck = fromDeck;
            deckState[fromDeck].isPlaying = true;
            updateTransportUI(fromDeck);
            await new Promise(r => setTimeout(r, 500)); // Wait for playback to start
        }

        // Ensure volume is at 100% to start
        await window.SpotifyPlayer.setVolume(1);
    }

    // Clear any existing interval
    if (window.autoFadeInterval) {
        clearInterval(window.autoFadeInterval);
    }

    window.autoFadeInterval = setInterval(async () => {
        if (!isAutoFading) {
            clearInterval(window.autoFadeInterval);
            return;
        }

        step++;

        // Phase 1: Fade out current track (0% to 50%)
        if (step <= midpoint) {
            const fadeOutProgress = step / midpoint;
            const volume = 1 - (fadeOutProgress * 0.9); // Fade to 10% volume

            if (window.SpotifyPlayer?.isReady()) {
                await window.SpotifyPlayer.setVolume(Math.max(0.1, volume));
            }

            // Update crossfader visual - smooth transition from start to middle
            crossfaderValue = startCrossfader + ((0.5 - startCrossfader) * fadeOutProgress);
            if (crossfadeSlider) crossfadeSlider.value = crossfaderValue;
            updateCrossfaderDisplay();
        }

        // Midpoint: Switch tracks
        if (step === midpoint && !hasSwitched) {
            hasSwitched = true;
            console.log('[DJ] Switching to new track...');

            // Record the switch time to prevent false "track ended" events
            lastTrackSwitchTime = Date.now();

            // Set volume low before switching
            if (window.SpotifyPlayer?.isReady()) {
                await window.SpotifyPlayer.setVolume(0.1);
            }

            // Start the new track
            const trackId = deckState[toDeck].spotifyTrackId;
            console.log(`[DJ] Playing track ${trackId} on Deck ${toDeck}`);

            if (trackId && window.SpotifyPlayer?.isReady()) {
                const success = await window.SpotifyPlayer.playById(trackId, toDeck);
                if (success) {
                    activeSpotifyDeck = toDeck;
                    window.activeSpotifyDeck = toDeck;
                    deckState[fromDeck].isPlaying = false;
                    deckState[toDeck].isPlaying = true;
                    updateTransportUI(fromDeck);
                    updateTransportUI(toDeck);
                    console.log(`[DJ] Switched to Deck ${toDeck}`);
                } else {
                    console.error('[DJ] Failed to switch tracks');
                }
            }
        }

        // Phase 2: Fade in new track (50% to 100%)
        if (step > midpoint) {
            const fadeInProgress = (step - midpoint) / midpoint;
            const volume = 0.1 + (fadeInProgress * 0.9); // Fade from 10% to 100%

            if (window.SpotifyPlayer?.isReady()) {
                await window.SpotifyPlayer.setVolume(Math.min(1, volume));
            }

            // Update crossfader visual - smooth transition from middle to end
            crossfaderValue = 0.5 + ((endCrossfader - 0.5) * fadeInProgress);
            if (crossfadeSlider) crossfadeSlider.value = crossfaderValue;
            updateCrossfaderDisplay();
        }

        // Complete
        if (step >= totalSteps) {
            clearInterval(window.autoFadeInterval);
            window.autoFadeInterval = null;
            isAutoFading = false;
            autoFadeDirection = null;

            // Ensure full volume
            if (window.SpotifyPlayer?.isReady()) {
                await window.SpotifyPlayer.setVolume(1);
            }

            // Set final crossfader position
            crossfaderValue = endCrossfader;
            if (crossfadeSlider) crossfadeSlider.value = endCrossfader;
            updateCrossfaderDisplay();

            // Reset button
            if (autoFadeBtn) {
                autoFadeBtn.textContent = 'Auto Fade';
                autoFadeBtn.style.background = '';
                autoFadeBtn.style.borderColor = '';
            }

            showToast(`Transition complete! Now playing Deck ${toDeck}`);
            console.log('[DJ] Spotify transition complete');
        }
    }, interval);
}

/**
 * Standard transition for local audio or mixed (local + Spotify)
 * Both tracks can play simultaneously with volume crossfade
 */
async function startStandardTransition(fromDeck, toDeck, autoFadeBtn) {
    isAutoFading = true;
    console.log(`[DJ] Starting standard transition: Deck ${fromDeck} → Deck ${toDeck}`);

    // Update button
    if (autoFadeBtn) {
        autoFadeBtn.textContent = 'Cancel Fade';
        autoFadeBtn.style.background = '#991b1b';
        autoFadeBtn.style.borderColor = '#ef4444';
    }

    showToast(`Fading Deck ${fromDeck} → Deck ${toDeck}...`);

    const crossfadeSlider = document.getElementById('crossfade');
    const startValue = fromDeck === 'A' ? 0 : 1;
    const endValue = fromDeck === 'A' ? 1 : 0;
    const duration = 8000; // 8 seconds
    const interval = 50;
    const steps = duration / interval;
    const stepSize = (endValue - startValue) / steps;
    let step = 0;

    // Set crossfader to start position
    crossfaderValue = startValue;
    if (crossfadeSlider) crossfadeSlider.value = startValue;
    await applyCrossfade();
    updateCrossfaderDisplay();

    // Start the incoming deck if not playing
    if (!deckState[toDeck].isPlaying) {
        await playDeck(toDeck);
    }

    window.autoFadeInterval = setInterval(async () => {
        if (!isAutoFading) {
            clearInterval(window.autoFadeInterval);
            return;
        }

        step++;
        crossfaderValue = startValue + (stepSize * step);

        if (crossfadeSlider) {
            crossfadeSlider.value = crossfaderValue;
        }

        await applyCrossfade();
        updateCrossfaderDisplay();

        if (step >= steps) {
            clearInterval(window.autoFadeInterval);
            isAutoFading = false;
            autoFadeDirection = null;

            // Stop the outgoing deck
            await stopDeck(fromDeck);

            // Reset button
            if (autoFadeBtn) {
                autoFadeBtn.textContent = 'Auto Fade';
                autoFadeBtn.style.background = '';
                autoFadeBtn.style.borderColor = '';
            }

            showToast(`Transition complete! Now playing Deck ${toDeck}`);
            console.log('[DJ] Standard transition complete');
        }
    }, interval);
}

function cancelAutoFade() {
    const autoFadeBtn = document.getElementById('autoFade');

    if (window.autoFadeInterval) {
        clearInterval(window.autoFadeInterval);
        window.autoFadeInterval = null;
    }

    isAutoFading = false;
    autoFadeDirection = null;

    // Restore full volume if using Spotify
    if (window.SpotifyPlayer?.isReady()) {
        window.SpotifyPlayer.setVolume(1);
    }

    // Also restore local audio volumes
    const vol1Slider = document.getElementById('volumeSong1');
    const vol2Slider = document.getElementById('volumeSong2');
    if (vol1Slider) audio1.volume = parseFloat(vol1Slider.value);
    if (vol2Slider) audio2.volume = parseFloat(vol2Slider.value);

    // Reset button
    if (autoFadeBtn) {
        autoFadeBtn.textContent = 'Auto Fade';
        autoFadeBtn.style.background = '';
        autoFadeBtn.style.borderColor = '';
    }

    showToast('Auto-fade cancelled');
    console.log('[DJ] Auto-fade cancelled');
}

/**
 * Helper to reset transition state (called when loading new tracks)
 */
function resetTransitionState() {
    if (window.autoFadeInterval) {
        clearInterval(window.autoFadeInterval);
        window.autoFadeInterval = null;
    }
    isAutoFading = false;
    autoFadeDirection = null;
}

// ==========================================================================
// TIME DISPLAY & PROGRESS
// ==========================================================================

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update time display for local audio
audio1.addEventListener('timeupdate', function() {
    const timeDisplay = document.getElementById('currentTimeSong1');
    if (timeDisplay) timeDisplay.textContent = formatTime(audio1.currentTime);

    const seekSlider = document.getElementById('seekSong1');
    if (seekSlider && audio1.duration) {
        seekSlider.max = Math.floor(audio1.duration);
        if (!seekSlider.matches(':active')) {
            seekSlider.value = Math.floor(audio1.currentTime);
        }
    }
});

audio2.addEventListener('timeupdate', function() {
    const timeDisplay = document.getElementById('currentTimeSong2');
    if (timeDisplay) timeDisplay.textContent = formatTime(audio2.currentTime);

    const seekSlider = document.getElementById('seekSong2');
    if (seekSlider && audio2.duration) {
        seekSlider.max = Math.floor(audio2.duration);
        if (!seekSlider.matches(':active')) {
            seekSlider.value = Math.floor(audio2.currentTime);
        }
    }
});

// Track ended events
audio1.addEventListener('ended', function() {
    deckState.A.isPlaying = false;
    updateTransportUI('A');
});

audio2.addEventListener('ended', function() {
    deckState.B.isPlaying = false;
    updateTransportUI('B');
});

audio1.addEventListener('play', () => {
    deckState.A.isPlaying = true;
    updateTransportUI('A');
});

audio1.addEventListener('pause', () => {
    deckState.A.isPlaying = false;
    updateTransportUI('A');
});

audio2.addEventListener('play', () => {
    deckState.B.isPlaying = true;
    updateTransportUI('B');
});

audio2.addEventListener('pause', () => {
    deckState.B.isPlaying = false;
    updateTransportUI('B');
});

// ==========================================================================
// SPOTIFY PLAYBACK STATE POLLING
// ==========================================================================

// Poll Spotify playback state for time updates
setInterval(async () => {
    if (activeSpotifyDeck && window.SpotifyPlayer?.isReady()) {
        try {
            const state = await window.SpotifyPlayer.getState();
            if (state) {
                const deck = activeSpotifyDeck;
                const positionSec = state.position / 1000;
                const durationSec = state.duration / 1000;

                const timeDisplay = document.getElementById(deck === 'A' ? 'currentTimeSong1' : 'currentTimeSong2');
                if (timeDisplay) timeDisplay.textContent = formatTime(positionSec);

                const seekSlider = document.getElementById(deck === 'A' ? 'seekSong1' : 'seekSong2');
                if (seekSlider && !seekSlider.matches(':active')) {
                    seekSlider.max = Math.floor(durationSec);
                    seekSlider.value = Math.floor(positionSec);
                }

                deckState[deck].isPlaying = !state.paused;
                updateTransportUI(deck);
            }
        } catch (e) {
            // Ignore errors
        }
    }
}, 500);

// ==========================================================================
// UI HELPERS
// ==========================================================================

function updateTransportUI(deck) {
    const playBtn = document.getElementById(deck === 'A' ? 'playSong1' : 'playSong2');
    const pauseBtn = document.getElementById(deck === 'A' ? 'pauseSong1' : 'pauseSong2');
    const loopBtn = document.getElementById(deck === 'A' ? 'repeatSong1' : 'repeatSong2');
    const loopBtn2 = document.getElementById(deck === 'A' ? 'loopSong1' : 'loopSong2');

    if (playBtn) {
        playBtn.style.background = deckState[deck].isPlaying ? '#22c55e' : '';
        playBtn.style.color = deckState[deck].isPlaying ? 'white' : '';
    }
    if (pauseBtn) {
        const isPaused = !deckState[deck].isPlaying && deckState[deck].source !== 'none';
        pauseBtn.style.background = isPaused ? '#eab308' : '';
        pauseBtn.style.color = isPaused ? 'white' : '';
    }
    if (loopBtn) {
        loopBtn.style.background = deckState[deck].isLooping ? '#3b82f6' : '';
        loopBtn.style.color = deckState[deck].isLooping ? 'white' : '';
    }
    if (loopBtn2) {
        loopBtn2.style.background = deckState[deck].isLooping ? '#3b82f6' : '';
        loopBtn2.style.color = deckState[deck].isLooping ? 'white' : '';
    }
}

function updateDeckUI(deck) {
    const deckEl = document.querySelector(deck === 'A' ? '.deck-a' : '.deck-b');
    if (deckEl) {
        deckEl.style.borderColor = deckState[deck].source !== 'none' ?
            (deck === 'A' ? '#3b82f6' : '#f97316') : '';
    }
}

function showToast(message) {
    console.log('[DJ]', message);

    // Create toast element if it doesn't exist
    let toast = document.getElementById('dj-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'dj-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #333;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2500);
}

// ==========================================================================
// SPOTIFY INTEGRATION HELPERS (called from app.js)
// ==========================================================================

// Called from app.js when Spotify track is selected
window.setDeckSource = function(deck, source, track) {
    deckState[deck].source = source;
    deckState[deck].track = track;
    deckState[deck].spotifyTrackId = track?.id || null;
    updateDeckUI(deck);
    console.log(`[DJ] Deck ${deck} source set to: ${source}, track: ${track?.name}`);
};

// Called from app.js when Spotify playback state changes
window.updateDeckPlayState = function(deck, isPlaying) {
    console.log(`[DJ] updateDeckPlayState called: deck=${deck}, isPlaying=${isPlaying}`);
    deckState[deck].isPlaying = isPlaying;
    if (isPlaying && deckState[deck].source === 'spotify') {
        activeSpotifyDeck = deck;
        window.activeSpotifyDeck = deck;
        console.log(`[DJ] activeSpotifyDeck set to: ${deck}`);
    }
    updateTransportUI(deck);
};

// Get deck state (for app.js)
window.getDeckState = function(deck) {
    return { ...deckState[deck] };
};

console.log('[DJ] Controller initialized');
