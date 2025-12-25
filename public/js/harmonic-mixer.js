/**
 * Harmonic + BPM Mixing Assistant
 *
 * OVERVIEW:
 * Provides real-time visual guidance for DJ transitions, analyzing harmonic
 * compatibility and BPM matching to help DJs make smooth, musical transitions.
 *
 * FEATURES:
 * - Camelot wheel visualization
 * - BPM compatibility bands
 * - Transition quality ratings (Perfect/Acceptable/Risky)
 * - Color-coded indicators
 *
 * TODO (Future ML Extensions):
 * - Waveform analysis for optimal mix points
 * - Beat grid alignment suggestions
 * - Phrase detection for structural mixing
 * - Audio similarity using neural embeddings
 */

const HarmonicMixer = (function() {
    'use strict';

    // ==========================================================================
    // CONSTANTS
    // ==========================================================================

    /**
     * Transition quality levels
     */
    const TRANSITION_QUALITY = {
        PERFECT: {
            name: 'Perfect',
            color: '#22c55e',       // Green
            bgColor: '#166534',     // Dark green
            description: 'Harmonically compatible, BPM matched'
        },
        ACCEPTABLE: {
            name: 'Acceptable',
            color: '#eab308',       // Yellow
            bgColor: '#854d0e',     // Dark yellow
            description: 'Some adjustment needed but mixable'
        },
        RISKY: {
            name: 'Risky',
            color: '#ef4444',       // Red
            bgColor: '#991b1b',     // Dark red
            description: 'Key clash or large BPM difference'
        }
    };

    /**
     * BPM bands for classification
     */
    const BPM_BANDS = {
        PERFECT: { range: 3, label: 'Beatmatch Ready' },
        EASY: { range: 6, label: 'Minor Adjustment' },
        MODERATE: { range: 12, label: 'Pitch Bend Required' },
        CHALLENGING: { range: 20, label: 'Significant Adjustment' }
    };

    /**
     * Key names for display
     */
    const KEY_NAMES = {
        0: 'C', 1: 'C#/Db', 2: 'D', 3: 'D#/Eb', 4: 'E', 5: 'F',
        6: 'F#/Gb', 7: 'G', 8: 'G#/Ab', 9: 'A', 10: 'A#/Bb', 11: 'B'
    };

    // ==========================================================================
    // BPM ANALYSIS
    // ==========================================================================

    /**
     * Calculate BPM compatibility and return detailed analysis
     *
     * @param {number} bpm1 - Source track BPM
     * @param {number} bpm2 - Target track BPM
     * @returns {Object} BPM compatibility analysis
     */
    function analyzeBPM(bpm1, bpm2) {
        if (!bpm1 || !bpm2) {
            return {
                compatible: false,
                band: null,
                difference: null,
                percentChange: null,
                recommendation: 'BPM data unavailable',
                pitchAdjustment: null
            };
        }

        const diff = Math.abs(bpm1 - bpm2);
        const percentChange = ((bpm2 - bpm1) / bpm1) * 100;

        // Check for half-time/double-time match
        const halfTimeDiff = Math.abs(bpm1 - bpm2 * 2);
        const doubleTimeDiff = Math.abs(bpm1 * 2 - bpm2);
        const isHalfTime = halfTimeDiff < diff;
        const isDoubleTime = doubleTimeDiff < diff;

        let effectiveDiff = diff;
        let effectivePercent = percentChange;
        let timeNote = '';

        if (isHalfTime && halfTimeDiff <= BPM_BANDS.MODERATE.range) {
            effectiveDiff = halfTimeDiff;
            effectivePercent = ((bpm2 * 2 - bpm1) / bpm1) * 100;
            timeNote = ' (half-time)';
        } else if (isDoubleTime && doubleTimeDiff <= BPM_BANDS.MODERATE.range) {
            effectiveDiff = doubleTimeDiff;
            effectivePercent = ((bpm2 - bpm1 * 2) / (bpm1 * 2)) * 100;
            timeNote = ' (double-time)';
        }

        // Determine band
        let band;
        if (effectiveDiff <= BPM_BANDS.PERFECT.range) {
            band = 'PERFECT';
        } else if (effectiveDiff <= BPM_BANDS.EASY.range) {
            band = 'EASY';
        } else if (effectiveDiff <= BPM_BANDS.MODERATE.range) {
            band = 'MODERATE';
        } else if (effectiveDiff <= BPM_BANDS.CHALLENGING.range) {
            band = 'CHALLENGING';
        } else {
            band = 'INCOMPATIBLE';
        }

        // Generate recommendation
        let recommendation;
        switch (band) {
            case 'PERFECT':
                recommendation = `BPMs are nearly identical${timeNote}. Ready for seamless beatmatch.`;
                break;
            case 'EASY':
                recommendation = `Minor pitch adjustment needed${timeNote}. ${percentChange > 0 ? 'Speed up' : 'Slow down'} by ${Math.abs(effectivePercent).toFixed(1)}%.`;
                break;
            case 'MODERATE':
                recommendation = `Noticeable pitch change required${timeNote}. Consider using key lock.`;
                break;
            case 'CHALLENGING':
                recommendation = `Large BPM gap${timeNote}. Recommend filter transition or quick cut.`;
                break;
            default:
                recommendation = `BPMs are very different. Consider spinback, echo out, or track swap.`;
        }

        return {
            compatible: band !== 'INCOMPATIBLE',
            band,
            bandInfo: BPM_BANDS[band] || { range: 999, label: 'Not Recommended' },
            difference: diff,
            effectiveDifference: effectiveDiff,
            percentChange: percentChange.toFixed(1),
            effectivePercentChange: effectivePercent.toFixed(1),
            isHalfTime,
            isDoubleTime,
            recommendation,
            pitchAdjustment: effectivePercent.toFixed(1)
        };
    }

    // ==========================================================================
    // HARMONIC ANALYSIS
    // ==========================================================================

    /**
     * Analyze harmonic compatibility between two tracks
     *
     * @param {number} key1 - Source key (0-11)
     * @param {number} mode1 - Source mode (0=minor, 1=major)
     * @param {number} key2 - Target key (0-11)
     * @param {number} mode2 - Target mode (0=minor, 1=major)
     * @returns {Object} Harmonic compatibility analysis
     */
    function analyzeHarmonic(key1, mode1, key2, mode2) {
        // Use AutoDJEngine for Camelot conversion
        const camelot1 = AutoDJEngine.toCamelot(key1, mode1);
        const camelot2 = AutoDJEngine.toCamelot(key2, mode2);
        const compatibility = AutoDJEngine.getHarmonicCompatibility(camelot1, camelot2);

        const keyName1 = getKeyDisplay(key1, mode1);
        const keyName2 = getKeyDisplay(key2, mode2);

        let relationship;
        let recommendation;

        if (!camelot1 || !camelot2) {
            return {
                compatible: false,
                compatibility: 0.5,
                relationship: 'Unknown',
                recommendation: 'Key data unavailable',
                source: { key: keyName1, camelot: camelot1 },
                target: { key: keyName2, camelot: camelot2 }
            };
        }

        // Determine relationship
        if (camelot1 === camelot2) {
            relationship = 'Same Key';
            recommendation = 'Perfect harmonic match. Any transition style works.';
        } else if (compatibility >= 0.9) {
            relationship = 'Relative Major/Minor';
            recommendation = 'Excellent blend. Long crossfades work beautifully.';
        } else if (compatibility >= 0.85) {
            relationship = 'Adjacent Key';
            recommendation = 'Great transition. Use phrase mixing for best results.';
        } else if (compatibility >= 0.7) {
            relationship = 'Energy Boost';
            recommendation = 'Good for building energy. Quick mix recommended.';
        } else if (compatibility >= 0.6) {
            relationship = 'Diagonal Move';
            recommendation = 'Acceptable with quick transition. Avoid long blends.';
        } else if (compatibility >= 0.4) {
            relationship = 'Two Steps Away';
            recommendation = 'Risky blend. Use filters, effects, or quick cuts.';
        } else {
            relationship = 'Key Clash';
            recommendation = 'Keys clash significantly. Use echo out, spinback, or hard cut.';
        }

        return {
            compatible: compatibility >= 0.6,
            compatibility,
            relationship,
            recommendation,
            source: { key: keyName1, camelot: camelot1 },
            target: { key: keyName2, camelot: camelot2 }
        };
    }

    /**
     * Get display string for key
     * @param {number} key - Pitch class (0-11)
     * @param {number} mode - 0=minor, 1=major
     * @returns {string} Formatted key name
     */
    function getKeyDisplay(key, mode) {
        if (key === null || key === undefined) return 'Unknown';
        const modeName = mode === 1 ? 'Major' : 'Minor';
        return `${KEY_NAMES[key]} ${modeName}`;
    }

    // ==========================================================================
    // TRANSITION ANALYSIS
    // ==========================================================================

    /**
     * Analyze overall transition quality between two tracks
     *
     * @param {Object} sourceTrack - Source track with audio features
     * @param {Object} targetTrack - Target track with audio features
     * @returns {Object} Complete transition analysis
     */
    function analyzeTransition(sourceTrack, targetTrack) {
        const src = sourceTrack.audioFeatures || sourceTrack;
        const tgt = targetTrack.audioFeatures || targetTrack;

        const bpmAnalysis = analyzeBPM(src.tempo, tgt.tempo);
        const harmonicAnalysis = analyzeHarmonic(src.key, src.mode, tgt.key, tgt.mode);

        // Determine overall quality
        let quality;
        if (bpmAnalysis.band === 'PERFECT' && harmonicAnalysis.compatibility >= 0.85) {
            quality = TRANSITION_QUALITY.PERFECT;
        } else if (
            (bpmAnalysis.band === 'EASY' || bpmAnalysis.band === 'PERFECT') &&
            harmonicAnalysis.compatibility >= 0.6
        ) {
            quality = TRANSITION_QUALITY.ACCEPTABLE;
        } else if (
            bpmAnalysis.band === 'MODERATE' &&
            harmonicAnalysis.compatibility >= 0.7
        ) {
            quality = TRANSITION_QUALITY.ACCEPTABLE;
        } else {
            quality = TRANSITION_QUALITY.RISKY;
        }

        // Generate transition tips
        const tips = generateTransitionTips(bpmAnalysis, harmonicAnalysis);

        return {
            quality,
            bpm: {
                source: src.tempo ? Math.round(src.tempo) : null,
                target: tgt.tempo ? Math.round(tgt.tempo) : null,
                ...bpmAnalysis
            },
            harmonic: harmonicAnalysis,
            energyChange: calculateEnergyChange(src.energy, tgt.energy),
            tips,
            overallScore: (
                (bpmAnalysis.compatible ? 0.4 : 0) +
                (harmonicAnalysis.compatibility * 0.4) +
                (calculateEnergyChange(src.energy, tgt.energy).acceptable ? 0.2 : 0)
            )
        };
    }

    /**
     * Calculate energy change analysis
     * @param {number} sourceEnergy - Source track energy (0-1)
     * @param {number} targetEnergy - Target track energy (0-1)
     * @returns {Object} Energy change analysis
     */
    function calculateEnergyChange(sourceEnergy, targetEnergy) {
        if (sourceEnergy === null || targetEnergy === null ||
            sourceEnergy === undefined || targetEnergy === undefined) {
            return { change: 0, percent: 0, direction: 'unknown', acceptable: true };
        }

        const change = targetEnergy - sourceEnergy;
        const percent = (change / sourceEnergy) * 100;

        let direction;
        if (change > 0.05) direction = 'up';
        else if (change < -0.05) direction = 'down';
        else direction = 'stable';

        return {
            change: change.toFixed(2),
            percent: percent.toFixed(1),
            direction,
            acceptable: Math.abs(change) <= 0.3
        };
    }

    /**
     * Generate practical DJ tips for the transition
     * @param {Object} bpmAnalysis - BPM analysis result
     * @param {Object} harmonicAnalysis - Harmonic analysis result
     * @returns {Array} Array of tip strings
     */
    function generateTransitionTips(bpmAnalysis, harmonicAnalysis) {
        const tips = [];

        // BPM tips
        if (bpmAnalysis.band === 'PERFECT') {
            tips.push('🎯 BPM is locked. Focus on the harmonic blend.');
        } else if (bpmAnalysis.band === 'EASY') {
            tips.push(`📍 Adjust pitch ${bpmAnalysis.pitchAdjustment > 0 ? '+' : ''}${bpmAnalysis.pitchAdjustment}% to match.`);
        } else if (bpmAnalysis.band === 'MODERATE') {
            tips.push('🔧 Enable key lock to prevent pitch shift artifacts.');
        } else if (bpmAnalysis.isHalfTime || bpmAnalysis.isDoubleTime) {
            tips.push('⏱️ Consider half-time/double-time beatmatching.');
        }

        // Harmonic tips
        if (harmonicAnalysis.compatibility >= 0.9) {
            tips.push('🎹 Try a long, gradual blend for maximum harmony.');
        } else if (harmonicAnalysis.compatibility >= 0.7) {
            tips.push('🎼 Use phrase mixing - blend during drops or breaks.');
        } else if (harmonicAnalysis.compatibility >= 0.4) {
            tips.push('🎛️ High-pass filter the outgoing track to reduce clash.');
        } else {
            tips.push('⚡ Quick cut or echo out recommended to avoid dissonance.');
        }

        return tips;
    }

    // ==========================================================================
    // UI GENERATION
    // ==========================================================================

    /**
     * Generate HTML for transition indicator badge
     * @param {Object} quality - Quality object from TRANSITION_QUALITY
     * @returns {string} HTML string
     */
    function generateQualityBadge(quality) {
        return `
            <span class="transition-badge" style="
                background-color: ${quality.bgColor};
                color: ${quality.color};
                padding: 4px 12px;
                border-radius: 12px;
                font-weight: bold;
                font-size: 12px;
                border: 1px solid ${quality.color};
            ">
                ${quality.name}
            </span>
        `;
    }

    /**
     * Generate HTML for BPM compatibility indicator
     * @param {Object} bpmAnalysis - BPM analysis result
     * @returns {string} HTML string
     */
    function generateBPMIndicator(bpmAnalysis) {
        let color;
        switch (bpmAnalysis.band) {
            case 'PERFECT': color = '#22c55e'; break;
            case 'EASY': color = '#86efac'; break;
            case 'MODERATE': color = '#eab308'; break;
            case 'CHALLENGING': color = '#f97316'; break;
            default: color = '#ef4444';
        }

        return `
            <div class="bpm-indicator" style="display: flex; align-items: center; gap: 8px;">
                <div class="bpm-dot" style="
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background-color: ${color};
                "></div>
                <span style="color: ${color};">${bpmAnalysis.bandInfo?.label || 'Unknown'}</span>
                <span style="color: #888; font-size: 12px;">
                    (${bpmAnalysis.source} → ${bpmAnalysis.target} BPM)
                </span>
            </div>
        `;
    }

    /**
     * Generate HTML for harmonic compatibility indicator
     * @param {Object} harmonicAnalysis - Harmonic analysis result
     * @returns {string} HTML string
     */
    function generateHarmonicIndicator(harmonicAnalysis) {
        const compat = harmonicAnalysis.compatibility;
        let color;
        if (compat >= 0.85) color = '#22c55e';
        else if (compat >= 0.6) color = '#eab308';
        else color = '#ef4444';

        return `
            <div class="harmonic-indicator" style="display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="key-badge" style="
                        padding: 4px 8px;
                        background-color: #333;
                        border-radius: 4px;
                        font-family: monospace;
                    ">
                        ${harmonicAnalysis.source.camelot || '?'}
                    </div>
                    <span style="color: ${color};">→</span>
                    <div class="key-badge" style="
                        padding: 4px 8px;
                        background-color: #333;
                        border-radius: 4px;
                        font-family: monospace;
                    ">
                        ${harmonicAnalysis.target.camelot || '?'}
                    </div>
                    <span style="color: ${color}; font-weight: bold;">
                        ${harmonicAnalysis.relationship}
                    </span>
                </div>
                <div style="color: #888; font-size: 12px;">
                    ${harmonicAnalysis.source.key} → ${harmonicAnalysis.target.key}
                </div>
            </div>
        `;
    }

    /**
     * Generate complete transition card HTML
     * @param {Object} sourceTrack - Source track info
     * @param {Object} targetTrack - Target track info
     * @param {Object} analysis - Transition analysis result
     * @returns {string} HTML string
     */
    function generateTransitionCard(sourceTrack, targetTrack, analysis) {
        return `
            <div class="transition-card" style="
                background-color: #1a1a1a;
                border: 1px solid #333;
                border-radius: 12px;
                padding: 16px;
                margin: 8px 0;
            ">
                <div class="transition-header" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                ">
                    <div style="font-size: 14px; color: #888;">
                        ${sourceTrack.name || 'Current Track'} → ${targetTrack.name || 'Next Track'}
                    </div>
                    ${generateQualityBadge(analysis.quality)}
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div class="bpm-section">
                        <div style="color: #666; font-size: 11px; margin-bottom: 4px;">BPM</div>
                        ${generateBPMIndicator(analysis.bpm)}
                    </div>

                    <div class="harmonic-section">
                        <div style="color: #666; font-size: 11px; margin-bottom: 4px;">KEY</div>
                        ${generateHarmonicIndicator(analysis.harmonic)}
                    </div>

                    <div class="tips-section" style="
                        background-color: #262626;
                        padding: 12px;
                        border-radius: 8px;
                        margin-top: 8px;
                    ">
                        <div style="color: #666; font-size: 11px; margin-bottom: 8px;">DJ TIPS</div>
                        ${analysis.tips.map(tip => `
                            <div style="color: #ccc; font-size: 13px; margin: 4px 0;">
                                ${tip}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================================================
    // CANDIDATE LIST RENDERING
    // ==========================================================================

    /**
     * Generate HTML for a list of candidate tracks with transition analysis
     * @param {Object} currentTrack - Currently playing track
     * @param {Array} candidates - Array of candidate tracks with scores
     * @returns {string} HTML string
     */
    function generateCandidateList(currentTrack, candidates) {
        if (!candidates.length) {
            return '<div style="color: #666; text-align: center; padding: 20px;">No candidates available</div>';
        }

        return candidates.map((candidate, index) => {
            const analysis = analyzeTransition(currentTrack, candidate.track);
            const track = candidate.track;

            return `
                <div class="candidate-row" data-track-id="${track.id}" style="
                    background-color: ${index === 0 ? '#1e3a5f' : '#1a1a1a'};
                    border: 1px solid ${index === 0 ? '#3b82f6' : '#333'};
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 8px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                            <div style="font-weight: ${index === 0 ? 'bold' : 'normal'}; color: #fff;">
                                ${index === 0 ? '⭐ ' : ''}${track.name || 'Unknown Track'}
                            </div>
                            <div style="font-size: 12px; color: #888;">
                                ${track.artists?.map(a => a.name).join(', ') || 'Unknown Artist'}
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="text-align: right;">
                                <div style="font-family: monospace; color: #fff;">
                                    ${Math.round(track.audioFeatures?.tempo || 0)} BPM
                                </div>
                                <div style="font-family: monospace; color: #888; font-size: 12px;">
                                    ${AutoDJEngine.toCamelot(track.audioFeatures?.key, track.audioFeatures?.mode) || '?'}
                                </div>
                            </div>
                            ${generateQualityBadge(analysis.quality)}
                            <div style="
                                width: 48px;
                                text-align: center;
                                font-weight: bold;
                                color: ${candidate.total >= 0.8 ? '#22c55e' : candidate.total >= 0.6 ? '#eab308' : '#ef4444'};
                            ">
                                ${Math.round(candidate.total * 100)}%
                            </div>
                        </div>
                    </div>
                    ${index === 0 ? `
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #333; color: #888; font-size: 12px;">
                            ${candidate.explanation}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        // Analysis
        analyzeBPM,
        analyzeHarmonic,
        analyzeTransition,

        // UI Generation
        generateQualityBadge,
        generateBPMIndicator,
        generateHarmonicIndicator,
        generateTransitionCard,
        generateCandidateList,

        // Constants
        TRANSITION_QUALITY,
        BPM_BANDS
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HarmonicMixer;
}
