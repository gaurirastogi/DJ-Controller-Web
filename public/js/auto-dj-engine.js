/**
 * Intelligent Auto-DJ Track Selection Engine
 *
 * OVERVIEW:
 * This module implements an ML-inspired scoring system for intelligent track selection.
 * While not using actual ML models, it employs weighted feature vectors and
 * domain-specific heuristics that mirror how a real DJ thinks about track transitions.
 *
 * SCORING FORMULA:
 * Total Score = w1*BPM_score + w2*Energy_score + w3*Danceability_score +
 *               w4*Key_score + w5*Progression_bonus
 *
 * Where each component is normalized to [0, 1] range.
 *
 * TODO (Future ML Extensions):
 * - Train a neural network on successful DJ sets to learn optimal weights
 * - Use collaborative filtering to personalize weights per user preference
 * - Implement reinforcement learning based on skip/like feedback
 * - Add audio fingerprinting for transition point detection
 * - Cluster tracks using embeddings for style-aware selection
 */

const AutoDJEngine = (function() {
    'use strict';

    // ==========================================================================
    // CONFIGURATION - TUNABLE WEIGHTS
    // ==========================================================================

    /**
     * Default weights for the scoring formula.
     * These can be adjusted based on DJ style preference.
     *
     * DESIGN TRADEOFF:
     * - Higher BPM weight = smoother tempo transitions, safer mixing
     * - Higher key weight = more harmonic coherence, musical flow
     * - Higher energy weight = better crowd energy management
     * - Higher progression bonus = more dynamic set building
     */
    const DEFAULT_WEIGHTS = {
        bpm: 0.30,           // BPM similarity (most important for beatmatching)
        energy: 0.25,        // Energy level similarity
        danceability: 0.15,  // Danceability match
        key: 0.20,           // Harmonic compatibility
        progression: 0.10   // Energy progression bonus
    };

    // Thresholds for scoring
    const THRESHOLDS = {
        BPM_PERFECT_RANGE: 2,      // BPM within this range = perfect score
        BPM_ACCEPTABLE_RANGE: 8,   // BPM within this range = acceptable
        BPM_MAX_RANGE: 20,         // Beyond this = heavy penalty
        ENERGY_PROGRESSION_TARGET: 0.05  // Ideal energy increase per track
    };

    // Current configuration state
    let config = {
        weights: { ...DEFAULT_WEIGHTS },
        setHistory: [],      // Tracks played in current set
        energyDirection: 1   // 1 = building up, -1 = winding down
    };

    // ==========================================================================
    // CAMELOT WHEEL - HARMONIC MIXING
    // ==========================================================================

    /**
     * Camelot Wheel mapping from Spotify key/mode to Camelot notation
     *
     * The Camelot Wheel is the industry standard for harmonic mixing.
     * Compatible keys are adjacent on the wheel (same number, or +/-1 letter).
     *
     * Key: Spotify uses pitch class notation (0-11)
     * Mode: 1 = Major, 0 = Minor
     *
     * Camelot notation: Number (1-12) + Letter (A=minor, B=major)
     */
    const CAMELOT_WHEEL = {
        // Major keys (mode = 1) -> B column
        '0-1': '8B',   // C Major
        '1-1': '3B',   // C#/Db Major
        '2-1': '10B',  // D Major
        '3-1': '5B',   // D#/Eb Major
        '4-1': '12B',  // E Major
        '5-1': '7B',   // F Major
        '6-1': '2B',   // F#/Gb Major
        '7-1': '9B',   // G Major
        '8-1': '4B',   // G#/Ab Major
        '9-1': '11B',  // A Major
        '10-1': '6B',  // A#/Bb Major
        '11-1': '1B',  // B Major

        // Minor keys (mode = 0) -> A column
        '0-0': '5A',   // C Minor
        '1-0': '12A',  // C#/Db Minor
        '2-0': '7A',   // D Minor
        '3-0': '2A',   // D#/Eb Minor
        '4-0': '9A',   // E Minor
        '5-0': '4A',   // F Minor
        '6-0': '11A',  // F#/Gb Minor
        '7-0': '6A',   // G Minor
        '8-0': '1A',   // G#/Ab Minor
        '9-0': '8A',   // A Minor
        '10-0': '3A',  // A#/Bb Minor
        '11-0': '10A'  // B Minor
    };

    /**
     * Convert Spotify key/mode to Camelot notation
     * @param {number} key - Pitch class (0-11)
     * @param {number} mode - 1=Major, 0=Minor
     * @returns {string} Camelot notation (e.g., "8A", "5B")
     */
    function toCamelot(key, mode) {
        if (key === null || key === undefined || mode === null || mode === undefined) {
            return null;
        }
        return CAMELOT_WHEEL[`${key}-${mode}`] || null;
    }

    /**
     * Parse Camelot notation into number and letter
     * @param {string} camelot - Camelot notation (e.g., "8A")
     * @returns {{number: number, letter: string}} Parsed components
     */
    function parseCamelot(camelot) {
        if (!camelot) return null;
        const match = camelot.match(/^(\d+)([AB])$/);
        if (!match) return null;
        return {
            number: parseInt(match[1]),
            letter: match[2]
        };
    }

    /**
     * Calculate harmonic compatibility between two Camelot keys
     *
     * COMPATIBILITY RULES (in order of preference):
     * 1. Same key = Perfect (1.0)
     * 2. Same number, different letter = Relative major/minor (0.9)
     * 3. +/-1 number, same letter = Adjacent key (0.85)
     * 4. +7/-5 number, same letter = Energy boost (0.7)
     * 5. +/-2 number = Risky but usable (0.4)
     * 6. Everything else = Poor compatibility (0.2)
     *
     * @param {string} camelot1 - First track's Camelot key
     * @param {string} camelot2 - Second track's Camelot key
     * @returns {number} Compatibility score 0-1
     */
    function getHarmonicCompatibility(camelot1, camelot2) {
        if (!camelot1 || !camelot2) return 0.5; // Unknown keys - neutral

        const key1 = parseCamelot(camelot1);
        const key2 = parseCamelot(camelot2);
        if (!key1 || !key2) return 0.5;

        // Same key = perfect match
        if (camelot1 === camelot2) return 1.0;

        // Calculate wheel distance (wrapping around 12)
        const numberDiff = Math.abs(key1.number - key2.number);
        const wheelDistance = Math.min(numberDiff, 12 - numberDiff);
        const sameLetter = key1.letter === key2.letter;

        // Same number, different letter = relative major/minor
        if (wheelDistance === 0 && !sameLetter) return 0.9;

        // Adjacent keys on same column
        if (wheelDistance === 1 && sameLetter) return 0.85;

        // Energy boost transition (+7 on wheel, same column)
        if (wheelDistance === 7 && sameLetter) return 0.7;

        // Adjacent keys on different column
        if (wheelDistance === 1 && !sameLetter) return 0.6;

        // Two steps away
        if (wheelDistance === 2) return 0.4;

        // Three steps away
        if (wheelDistance === 3) return 0.25;

        // Everything else
        return 0.2;
    }

    // ==========================================================================
    // SCORING FUNCTIONS
    // ==========================================================================

    /**
     * Calculate BPM similarity score
     *
     * FORMULA:
     * - Perfect: |BPM1 - BPM2| <= 2 -> score = 1.0
     * - Good: |BPM1 - BPM2| <= 8 -> score = 0.8 - 0.95
     * - Acceptable: Linear decay from 8-20 BPM difference
     * - Beyond 20 BPM: Consider half-time/double-time matching
     *
     * DESIGN DECISION:
     * We also check half-time (BPM*2) and double-time (BPM/2) matches
     * since 140 BPM can mix well with 70 BPM in certain genres.
     *
     * @param {number} bpm1 - Current track BPM
     * @param {number} bpm2 - Candidate track BPM
     * @returns {number} Score 0-1
     */
    function scoreBPM(bpm1, bpm2) {
        if (!bpm1 || !bpm2) return 0.5; // Unknown BPM - neutral

        // Check direct match
        const directDiff = Math.abs(bpm1 - bpm2);

        // Check half-time match (e.g., 140 BPM mixing with 70 BPM)
        const halfTimeDiff = Math.min(
            Math.abs(bpm1 - bpm2 * 2),
            Math.abs(bpm1 * 2 - bpm2)
        );

        // Use the better match
        const diff = Math.min(directDiff, halfTimeDiff);

        // Perfect match
        if (diff <= THRESHOLDS.BPM_PERFECT_RANGE) {
            return 1.0;
        }

        // Good match
        if (diff <= THRESHOLDS.BPM_ACCEPTABLE_RANGE) {
            // Linear interpolation from 0.95 to 0.8
            const t = (diff - THRESHOLDS.BPM_PERFECT_RANGE) /
                      (THRESHOLDS.BPM_ACCEPTABLE_RANGE - THRESHOLDS.BPM_PERFECT_RANGE);
            return 0.95 - (t * 0.15);
        }

        // Acceptable range with decay
        if (diff <= THRESHOLDS.BPM_MAX_RANGE) {
            const t = (diff - THRESHOLDS.BPM_ACCEPTABLE_RANGE) /
                      (THRESHOLDS.BPM_MAX_RANGE - THRESHOLDS.BPM_ACCEPTABLE_RANGE);
            return 0.8 - (t * 0.5); // Decay from 0.8 to 0.3
        }

        // Beyond acceptable - heavy penalty but not zero
        // (Sometimes you need to make a big BPM change)
        return Math.max(0.1, 0.3 - (diff - THRESHOLDS.BPM_MAX_RANGE) * 0.01);
    }

    /**
     * Calculate energy similarity score
     *
     * FORMULA:
     * score = 1 - |energy1 - energy2|
     *
     * Energy values are already normalized 0-1 by Spotify,
     * so we use simple absolute difference.
     *
     * @param {number} energy1 - Current track energy (0-1)
     * @param {number} energy2 - Candidate track energy (0-1)
     * @returns {number} Score 0-1
     */
    function scoreEnergy(energy1, energy2) {
        if (energy1 === null || energy2 === null ||
            energy1 === undefined || energy2 === undefined) {
            return 0.5;
        }
        return 1 - Math.abs(energy1 - energy2);
    }

    /**
     * Calculate danceability similarity score
     *
     * FORMULA:
     * score = 1 - |danceability1 - danceability2|
     *
     * @param {number} dance1 - Current track danceability (0-1)
     * @param {number} dance2 - Candidate track danceability (0-1)
     * @returns {number} Score 0-1
     */
    function scoreDanceability(dance1, dance2) {
        if (dance1 === null || dance2 === null ||
            dance1 === undefined || dance2 === undefined) {
            return 0.5;
        }
        return 1 - Math.abs(dance1 - dance2);
    }

    /**
     * Calculate key compatibility score
     *
     * Uses Camelot wheel for harmonic mixing rules.
     * See getHarmonicCompatibility() for detailed logic.
     *
     * @param {number} key1 - Current track key (0-11)
     * @param {number} mode1 - Current track mode (0/1)
     * @param {number} key2 - Candidate track key (0-11)
     * @param {number} mode2 - Candidate track mode (0/1)
     * @returns {number} Score 0-1
     */
    function scoreKey(key1, mode1, key2, mode2) {
        const camelot1 = toCamelot(key1, mode1);
        const camelot2 = toCamelot(key2, mode2);
        return getHarmonicCompatibility(camelot1, camelot2);
    }

    /**
     * Calculate energy progression bonus
     *
     * CONCEPT:
     * Good DJ sets typically build energy over time. This bonus rewards
     * tracks that follow the desired energy trajectory.
     *
     * FORMULA:
     * - If energyDirection = 1 (building): prefer slightly higher energy
     * - If energyDirection = -1 (winding down): prefer slightly lower energy
     * - Ideal step is ENERGY_PROGRESSION_TARGET (default 0.05)
     *
     * @param {number} currentEnergy - Current track energy
     * @param {number} candidateEnergy - Candidate track energy
     * @returns {number} Bonus score 0-1
     */
    function scoreProgression(currentEnergy, candidateEnergy) {
        if (currentEnergy === null || candidateEnergy === null ||
            currentEnergy === undefined || candidateEnergy === undefined) {
            return 0.5;
        }

        const energyChange = candidateEnergy - currentEnergy;
        const targetChange = THRESHOLDS.ENERGY_PROGRESSION_TARGET * config.energyDirection;

        // Perfect progression
        if (Math.abs(energyChange - targetChange) < 0.02) {
            return 1.0;
        }

        // Good progression (in the right direction)
        if (config.energyDirection > 0 && energyChange > 0 && energyChange <= 0.15) {
            return 0.9 - Math.abs(energyChange - targetChange) * 2;
        }
        if (config.energyDirection < 0 && energyChange < 0 && energyChange >= -0.15) {
            return 0.9 - Math.abs(energyChange - targetChange) * 2;
        }

        // Acceptable (small change in wrong direction)
        if (Math.abs(energyChange) < 0.1) {
            return 0.6;
        }

        // Large change in wrong direction - penalty
        if ((config.energyDirection > 0 && energyChange < -0.1) ||
            (config.energyDirection < 0 && energyChange > 0.1)) {
            return 0.3;
        }

        return 0.5;
    }

    // ==========================================================================
    // MAIN SCORING FUNCTION
    // ==========================================================================

    /**
     * Calculate total similarity score for a candidate track
     *
     * @param {Object} currentTrack - Current track with audio features
     * @param {Object} candidateTrack - Candidate track with audio features
     * @returns {Object} Score breakdown and total
     */
    function calculateScore(currentTrack, candidateTrack) {
        const curr = currentTrack.audioFeatures || currentTrack;
        const cand = candidateTrack.audioFeatures || candidateTrack;

        // Calculate individual component scores
        const scores = {
            bpm: scoreBPM(curr.tempo, cand.tempo),
            energy: scoreEnergy(curr.energy, cand.energy),
            danceability: scoreDanceability(curr.danceability, cand.danceability),
            key: scoreKey(curr.key, curr.mode, cand.key, cand.mode),
            progression: scoreProgression(curr.energy, cand.energy)
        };

        // Calculate weighted total
        const total = Object.keys(scores).reduce((sum, key) => {
            return sum + (scores[key] * config.weights[key]);
        }, 0);

        // Normalize to 0-1 (weights should sum to 1, but just in case)
        const weightSum = Object.values(config.weights).reduce((a, b) => a + b, 0);
        const normalizedTotal = total / weightSum;

        return {
            scores,
            weights: { ...config.weights },
            total: normalizedTotal,
            camelotCurrent: toCamelot(curr.key, curr.mode),
            camelotCandidate: toCamelot(cand.key, cand.mode)
        };
    }

    /**
     * Rank candidate tracks by similarity to current track
     *
     * @param {Object} currentTrack - Current track with audio features
     * @param {Array} candidates - Array of candidate tracks with audio features
     * @returns {Array} Sorted candidates with scores and explanations
     */
    function rankCandidates(currentTrack, candidates) {
        const ranked = candidates.map(candidate => {
            const scoreResult = calculateScore(currentTrack, candidate);

            return {
                track: candidate,
                ...scoreResult,
                explanation: generateExplanation(currentTrack, candidate, scoreResult)
            };
        });

        // Sort by total score descending
        ranked.sort((a, b) => b.total - a.total);

        return ranked;
    }

    /**
     * Generate human-readable explanation for why a track was selected
     *
     * @param {Object} currentTrack - Current track
     * @param {Object} candidateTrack - Candidate track
     * @param {Object} scoreResult - Score breakdown
     * @returns {string} Explanation text
     */
    function generateExplanation(currentTrack, candidateTrack, scoreResult) {
        const curr = currentTrack.audioFeatures || currentTrack;
        const cand = candidateTrack.audioFeatures || candidateTrack;
        const { scores, camelotCurrent, camelotCandidate } = scoreResult;

        const reasons = [];

        // BPM analysis
        const bpmDiff = Math.abs((curr.tempo || 0) - (cand.tempo || 0));
        if (scores.bpm >= 0.95) {
            reasons.push(`BPM match is perfect (${Math.round(curr.tempo)} -> ${Math.round(cand.tempo)} BPM)`);
        } else if (scores.bpm >= 0.8) {
            reasons.push(`BPM is close (${Math.round(bpmDiff)} BPM difference)`);
        } else if (scores.bpm >= 0.5) {
            reasons.push(`BPM requires adjustment (${Math.round(bpmDiff)} BPM difference)`);
        } else {
            reasons.push(`Large BPM jump - consider transition carefully`);
        }

        // Key analysis
        if (scores.key >= 0.9) {
            reasons.push(`Keys are harmonically compatible (${camelotCurrent} -> ${camelotCandidate})`);
        } else if (scores.key >= 0.7) {
            reasons.push(`Key transition is acceptable (${camelotCurrent} -> ${camelotCandidate})`);
        } else if (scores.key >= 0.4) {
            reasons.push(`Key clash possible - use quick mix (${camelotCurrent} -> ${camelotCandidate})`);
        } else {
            reasons.push(`Keys clash - recommend filter transition`);
        }

        // Energy analysis
        const energyChange = (cand.energy || 0) - (curr.energy || 0);
        if (config.energyDirection > 0) {
            if (energyChange > 0.05) {
                reasons.push(`Builds energy nicely (+${(energyChange * 100).toFixed(0)}%)`);
            } else if (energyChange > -0.05) {
                reasons.push(`Maintains energy level`);
            } else {
                reasons.push(`Energy drops - may slow momentum`);
            }
        } else {
            if (energyChange < -0.05) {
                reasons.push(`Winds down smoothly (${(energyChange * 100).toFixed(0)}%)`);
            } else {
                reasons.push(`Maintains current energy`);
            }
        }

        return reasons.join('. ') + '.';
    }

    // ==========================================================================
    // SET MANAGEMENT
    // ==========================================================================

    /**
     * Add a track to the set history
     * @param {Object} track - Track that was played
     */
    function addToSetHistory(track) {
        config.setHistory.push({
            track,
            timestamp: Date.now()
        });
    }

    /**
     * Get the set history
     * @returns {Array} Array of played tracks with timestamps
     */
    function getSetHistory() {
        return [...config.setHistory];
    }

    /**
     * Clear the set history
     */
    function clearSetHistory() {
        config.setHistory = [];
    }

    /**
     * Set energy direction for progression scoring
     * @param {number} direction - 1 for building up, -1 for winding down
     */
    function setEnergyDirection(direction) {
        config.energyDirection = direction > 0 ? 1 : -1;
    }

    // ==========================================================================
    // CONFIGURATION
    // ==========================================================================

    /**
     * Update scoring weights
     * @param {Object} newWeights - Partial or full weight configuration
     */
    function setWeights(newWeights) {
        config.weights = {
            ...config.weights,
            ...newWeights
        };

        // Normalize weights to sum to 1
        const sum = Object.values(config.weights).reduce((a, b) => a + b, 0);
        Object.keys(config.weights).forEach(key => {
            config.weights[key] /= sum;
        });
    }

    /**
     * Get current weights configuration
     * @returns {Object} Current weights
     */
    function getWeights() {
        return { ...config.weights };
    }

    /**
     * Reset weights to defaults
     */
    function resetWeights() {
        config.weights = { ...DEFAULT_WEIGHTS };
    }

    // ==========================================================================
    // UTILITY FUNCTIONS
    // ==========================================================================

    /**
     * Get key name from Spotify key number
     * @param {number} key - Pitch class (0-11)
     * @param {number} mode - 1=Major, 0=Minor
     * @returns {string} Key name (e.g., "C Major", "A Minor")
     */
    function getKeyName(key, mode) {
        const keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        if (key === null || key === undefined) return 'Unknown';
        const modeName = mode === 1 ? 'Major' : 'Minor';
        return `${keyNames[key]} ${modeName}`;
    }

    /**
     * Filter candidates that have already been played
     * @param {Array} candidates - All candidate tracks
     * @returns {Array} Candidates not in set history
     */
    function filterPlayedTracks(candidates) {
        const playedIds = new Set(config.setHistory.map(h => h.track.id));
        return candidates.filter(c => !playedIds.has(c.id));
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        // Scoring
        calculateScore,
        rankCandidates,

        // Set management
        addToSetHistory,
        getSetHistory,
        clearSetHistory,
        setEnergyDirection,

        // Configuration
        setWeights,
        getWeights,
        resetWeights,

        // Utilities
        toCamelot,
        getKeyName,
        getHarmonicCompatibility,
        filterPlayedTracks,

        // Individual scores (for testing/debugging)
        _scoreBPM: scoreBPM,
        _scoreEnergy: scoreEnergy,
        _scoreDanceability: scoreDanceability,
        _scoreKey: scoreKey,
        _scoreProgression: scoreProgression
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AutoDJEngine;
}
