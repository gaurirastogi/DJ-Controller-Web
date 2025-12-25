/**
 * Audio Feature Estimator
 *
 * OVERVIEW:
 * When Spotify's audio-features endpoint is restricted (403 for non-approved apps),
 * this module provides estimated audio features based on available track metadata.
 *
 * ESTIMATION STRATEGY:
 * We use heuristics based on:
 * - Track duration (longer tracks often have lower energy in electronic music)
 * - Popularity (popular tracks tend to be more danceable)
 * - Track name patterns (remix, acoustic, live versions)
 * - Artist genre hints from track/album names
 * - Consistent seeding for reproducibility
 *
 * ACCURACY NOTE:
 * These are estimates, not real audio analysis. The scoring system is designed
 * to still provide meaningful comparisons even with estimated values.
 *
 * TODO (Future ML Extensions):
 * - Train a model on tracks with known features to predict from metadata
 * - Use track waveform analysis for BPM detection
 * - Integrate with external music databases (MusicBrainz, AcousticBrainz)
 */

const FeatureEstimator = (function() {
    'use strict';

    // ==========================================================================
    // CONFIGURATION
    // ==========================================================================

    /**
     * BPM estimation ranges by genre keywords
     * These are typical BPM ranges for different genres
     */
    const GENRE_BPM_HINTS = {
        // Electronic genres
        'techno': { min: 125, max: 150 },
        'house': { min: 118, max: 130 },
        'trance': { min: 130, max: 145 },
        'drum and bass': { min: 160, max: 180 },
        'dnb': { min: 160, max: 180 },
        'dubstep': { min: 135, max: 145 },
        'edm': { min: 125, max: 135 },
        'electronic': { min: 120, max: 135 },

        // Hip-hop/R&B
        'hip hop': { min: 80, max: 115 },
        'hip-hop': { min: 80, max: 115 },
        'rap': { min: 80, max: 110 },
        'trap': { min: 130, max: 170 },
        'r&b': { min: 60, max: 90 },

        // Pop/Rock
        'pop': { min: 100, max: 130 },
        'rock': { min: 100, max: 140 },
        'indie': { min: 100, max: 130 },
        'punk': { min: 140, max: 180 },
        'metal': { min: 100, max: 180 },

        // Latin/Dance
        'reggaeton': { min: 85, max: 100 },
        'salsa': { min: 150, max: 220 },
        'latin': { min: 90, max: 130 },
        'disco': { min: 115, max: 130 },
        'funk': { min: 90, max: 115 },

        // Other
        'ambient': { min: 60, max: 100 },
        'chill': { min: 80, max: 110 },
        'acoustic': { min: 70, max: 120 },
        'jazz': { min: 80, max: 160 },
        'classical': { min: 60, max: 140 }
    };

    /**
     * Default BPM range when no genre hint is found
     */
    const DEFAULT_BPM = { min: 100, max: 140 };

    // ==========================================================================
    // SEEDED RANDOM
    // ==========================================================================

    /**
     * Simple seeded random number generator for reproducibility
     * Same track ID will always produce same estimated features
     * @param {string} seed - Seed string (track ID)
     * @returns {function} Random number generator function
     */
    function createSeededRandom(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash = hash & hash;
        }

        return function() {
            hash = (hash * 1103515245 + 12345) & 0x7fffffff;
            return hash / 0x7fffffff;
        };
    }

    // ==========================================================================
    // ESTIMATION FUNCTIONS
    // ==========================================================================

    /**
     * Estimate BPM based on track metadata
     * @param {Object} track - Spotify track object
     * @param {function} random - Seeded random function
     * @returns {number} Estimated BPM
     */
    function estimateBPM(track, random) {
        const name = (track.name || '').toLowerCase();
        const artistNames = (track.artists || []).map(a => a.name.toLowerCase()).join(' ');
        const albumName = (track.album?.name || '').toLowerCase();
        const searchText = `${name} ${artistNames} ${albumName}`;

        // Look for genre hints
        let bpmRange = DEFAULT_BPM;
        for (const [genre, range] of Object.entries(GENRE_BPM_HINTS)) {
            if (searchText.includes(genre)) {
                bpmRange = range;
                break;
            }
        }

        // Modifiers based on track name patterns
        let modifier = 0;

        // Remixes tend to be slightly faster
        if (name.includes('remix') || name.includes('extended')) {
            modifier += 5;
        }

        // Acoustic versions tend to be slower
        if (name.includes('acoustic') || name.includes('unplugged')) {
            modifier -= 15;
            bpmRange = { min: 70, max: 110 };
        }

        // Live versions vary
        if (name.includes('live')) {
            modifier += (random() - 0.5) * 10;
        }

        // Radio edits are often at standard tempos
        if (name.includes('radio edit')) {
            bpmRange = { min: 115, max: 130 };
        }

        // Generate BPM within range with modifier
        const baseBPM = bpmRange.min + random() * (bpmRange.max - bpmRange.min);
        const estimatedBPM = Math.round(baseBPM + modifier);

        // Clamp to reasonable range
        return Math.max(60, Math.min(200, estimatedBPM));
    }

    /**
     * Estimate key and mode based on track characteristics
     * @param {Object} track - Spotify track object
     * @param {function} random - Seeded random function
     * @returns {{key: number, mode: number}} Estimated key (0-11) and mode (0/1)
     */
    function estimateKey(track, random) {
        // Without audio analysis, we can only make educated guesses
        // We'll use the seeded random to ensure consistency

        // Key distribution in popular music favors certain keys
        // C, G, D, A, E are more common
        const commonKeys = [0, 7, 2, 9, 4]; // C, G, D, A, E
        const allKeys = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

        // 70% chance of common key, 30% chance of any key
        const key = random() < 0.7
            ? commonKeys[Math.floor(random() * commonKeys.length)]
            : allKeys[Math.floor(random() * allKeys.length)];

        // Major vs minor based on track name hints
        const name = (track.name || '').toLowerCase();
        let modeHint = random(); // Default random

        // Minor key hints
        if (name.includes('sad') || name.includes('cry') || name.includes('dark') ||
            name.includes('pain') || name.includes('lost') || name.includes('minor')) {
            modeHint = 0.2;
        }

        // Major key hints
        if (name.includes('happy') || name.includes('love') || name.includes('sun') ||
            name.includes('bright') || name.includes('joy') || name.includes('major')) {
            modeHint = 0.8;
        }

        // Popular music slightly favors major keys
        const mode = modeHint > 0.45 ? 1 : 0;

        return { key, mode };
    }

    /**
     * Estimate energy level (0-1)
     * @param {Object} track - Spotify track object
     * @param {function} random - Seeded random function
     * @returns {number} Estimated energy
     */
    function estimateEnergy(track, random) {
        const name = (track.name || '').toLowerCase();
        const duration = track.duration_ms || 180000;
        const popularity = track.popularity || 50;

        let energy = 0.5 + (random() - 0.5) * 0.4; // Base: 0.3 - 0.7

        // Popularity correlation (popular tracks often have medium-high energy)
        energy += (popularity - 50) * 0.002;

        // Duration hints
        // Very short tracks (<2min) often high energy
        if (duration < 120000) energy += 0.15;
        // Very long tracks (>6min) often lower energy (ambient, progressive)
        if (duration > 360000) energy -= 0.1;

        // Name-based hints
        if (name.includes('remix') || name.includes('club')) energy += 0.15;
        if (name.includes('acoustic') || name.includes('ballad')) energy -= 0.2;
        if (name.includes('chill') || name.includes('relax')) energy -= 0.25;
        if (name.includes('party') || name.includes('dance')) energy += 0.2;
        if (name.includes('rage') || name.includes('hard')) energy += 0.25;

        return Math.max(0.1, Math.min(0.95, energy));
    }

    /**
     * Estimate danceability (0-1)
     * @param {Object} track - Spotify track object
     * @param {function} random - Seeded random function
     * @param {number} estimatedBPM - Already estimated BPM
     * @returns {number} Estimated danceability
     */
    function estimateDanceability(track, random, estimatedBPM) {
        const name = (track.name || '').toLowerCase();
        const popularity = track.popularity || 50;

        // Start with popularity influence (popular = more danceable generally)
        let danceability = 0.4 + (popularity / 100) * 0.3;

        // BPM influence - optimal dance range is 115-130
        const bpmOptimality = 1 - Math.abs(estimatedBPM - 122) / 60;
        danceability += bpmOptimality * 0.2;

        // Name hints
        if (name.includes('dance') || name.includes('club') || name.includes('disco')) {
            danceability += 0.2;
        }
        if (name.includes('ballad') || name.includes('slow')) {
            danceability -= 0.2;
        }
        if (name.includes('acoustic') || name.includes('classical')) {
            danceability -= 0.15;
        }

        // Add some randomness
        danceability += (random() - 0.5) * 0.2;

        return Math.max(0.1, Math.min(0.95, danceability));
    }

    /**
     * Estimate valence/positivity (0-1)
     * @param {Object} track - Spotify track object
     * @param {function} random - Seeded random function
     * @param {number} mode - Estimated mode (0=minor, 1=major)
     * @returns {number} Estimated valence
     */
    function estimateValence(track, random, mode) {
        const name = (track.name || '').toLowerCase();

        // Major keys tend to be happier
        let valence = mode === 1 ? 0.55 : 0.4;

        // Name-based sentiment
        const positiveWords = ['happy', 'love', 'sun', 'joy', 'dance', 'party', 'celebrate', 'beautiful'];
        const negativeWords = ['sad', 'cry', 'dark', 'pain', 'lost', 'alone', 'broken', 'hurt'];

        for (const word of positiveWords) {
            if (name.includes(word)) valence += 0.1;
        }
        for (const word of negativeWords) {
            if (name.includes(word)) valence -= 0.1;
        }

        // Add randomness
        valence += (random() - 0.5) * 0.3;

        return Math.max(0.1, Math.min(0.9, valence));
    }

    // ==========================================================================
    // MAIN ESTIMATION FUNCTION
    // ==========================================================================

    /**
     * Generate estimated audio features for a track
     * @param {Object} track - Spotify track object
     * @returns {Object} Estimated audio features matching Spotify's format
     */
    function estimateFeatures(track) {
        if (!track || !track.id) return null;

        const random = createSeededRandom(track.id);
        const { key, mode } = estimateKey(track, random);
        const tempo = estimateBPM(track, random);
        const energy = estimateEnergy(track, random);
        const danceability = estimateDanceability(track, random, tempo);
        const valence = estimateValence(track, random, mode);

        return {
            // Core features used by the DJ app
            tempo,
            key,
            mode,
            energy,
            danceability,
            valence,

            // Additional features (estimated with reasonable defaults)
            loudness: -8 + (random() - 0.5) * 10,  // Typical range: -15 to -3 dB
            speechiness: 0.05 + random() * 0.15,   // Most music is low speechiness
            acousticness: random() * 0.4,          // Varies widely
            instrumentalness: random() * 0.3,      // Most pop has vocals
            liveness: 0.1 + random() * 0.2,        // Most tracks are studio
            time_signature: 4,                     // Almost always 4/4

            // Meta fields
            id: track.id,
            duration_ms: track.duration_ms,
            _estimated: true,  // Flag to indicate these are estimates
            _confidence: 'low' // Confidence level
        };
    }

    /**
     * Generate estimated features for multiple tracks
     * @param {Array} tracks - Array of Spotify track objects
     * @returns {Array} Array of estimated audio features
     */
    function estimateFeaturesForTracks(tracks) {
        return tracks.map(track => estimateFeatures(track));
    }

    /**
     * Check if features are estimated vs real
     * @param {Object} features - Audio features object
     * @returns {boolean} True if features are estimated
     */
    function isEstimated(features) {
        return features?._estimated === true;
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        estimateFeatures,
        estimateFeaturesForTracks,
        isEstimated,

        // Expose individual estimators for testing
        _estimateBPM: estimateBPM,
        _estimateKey: estimateKey,
        _estimateEnergy: estimateEnergy,
        _estimateDanceability: estimateDanceability,
        _estimateValence: estimateValence
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FeatureEstimator;
}
