/**
 * DJ Set Analytics Dashboard
 *
 * OVERVIEW:
 * Provides Spotify Wrapped-style analytics for DJ sessions, tracking metrics
 * like BPM curves, energy progression, transition quality, and set statistics.
 *
 * DATA PERSISTENCE:
 * - Session data stored in memory during active session
 * - Complete sessions saved to localStorage for history
 * - Export functionality for session data (JSON format)
 *
 * TODO (Future ML Extensions):
 * - Crowd response prediction based on energy curves
 * - Transition quality prediction using historical data
 * - Set style classification (progressive, peak-time, etc.)
 * - Comparison with professional DJ set patterns
 */

const AnalyticsDashboard = (function() {
    'use strict';

    // ==========================================================================
    // STATE
    // ==========================================================================

    const STORAGE_KEY = 'dj_session_history';

    let currentSession = null;
    let isRecording = false;

    /**
     * Session data structure
     */
    function createSession() {
        return {
            id: generateSessionId(),
            startTime: Date.now(),
            endTime: null,
            tracks: [],           // Array of played tracks with timestamps
            transitions: [],      // Array of transition data
            skippedTracks: [],    // Tracks that were loaded but skipped
            peakEnergy: 0,
            lowestEnergy: 1,
            peakEnergyTime: null,
            totalPlaytime: 0
        };
    }

    /**
     * Generate unique session ID
     */
    function generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ==========================================================================
    // SESSION MANAGEMENT
    // ==========================================================================

    /**
     * Start a new recording session
     * @returns {Object} The new session object
     */
    function startSession() {
        if (isRecording) {
            endSession(); // End previous session first
        }
        currentSession = createSession();
        isRecording = true;
        console.log('[Analytics] Session started:', currentSession.id);
        return currentSession;
    }

    /**
     * End the current session and save to history
     * @returns {Object} The completed session with summary
     */
    function endSession() {
        if (!currentSession) return null;

        currentSession.endTime = Date.now();
        currentSession.totalPlaytime = calculateTotalPlaytime();

        const summary = generateSessionSummary();

        // Save to history
        saveSessionToHistory(currentSession);

        const completedSession = { ...currentSession, summary };

        currentSession = null;
        isRecording = false;

        console.log('[Analytics] Session ended:', completedSession.id);
        return completedSession;
    }

    /**
     * Get current session status
     * @returns {Object} Session status
     */
    function getSessionStatus() {
        return {
            isRecording,
            session: currentSession,
            trackCount: currentSession?.tracks.length || 0,
            duration: currentSession
                ? Date.now() - currentSession.startTime
                : 0
        };
    }

    // ==========================================================================
    // TRACK RECORDING
    // ==========================================================================

    /**
     * Record a track being played
     * @param {Object} track - Track object with audio features
     * @param {Object} options - Additional options
     */
    function recordTrackPlayed(track, options = {}) {
        if (!isRecording || !currentSession) return;

        const trackEntry = {
            track,
            playedAt: Date.now(),
            deck: options.deck || 'unknown',
            playDuration: 0,
            wasSkipped: false,
            transitionScore: options.transitionScore || null
        };

        // Update peak/lowest energy
        const energy = track.audioFeatures?.energy;
        if (energy !== undefined) {
            if (energy > currentSession.peakEnergy) {
                currentSession.peakEnergy = energy;
                currentSession.peakEnergyTime = Date.now();
            }
            if (energy < currentSession.lowestEnergy) {
                currentSession.lowestEnergy = energy;
            }
        }

        currentSession.tracks.push(trackEntry);

        // Record transition if this isn't the first track
        if (currentSession.tracks.length > 1) {
            recordTransition(
                currentSession.tracks[currentSession.tracks.length - 2],
                trackEntry
            );
        }
    }

    /**
     * Record a track being skipped (loaded but not fully played)
     * @param {Object} track - Track that was skipped
     */
    function recordTrackSkipped(track) {
        if (!isRecording || !currentSession) return;

        currentSession.skippedTracks.push({
            track,
            skippedAt: Date.now()
        });

        // Mark last track as skipped if it matches
        const lastTrack = currentSession.tracks[currentSession.tracks.length - 1];
        if (lastTrack && lastTrack.track.id === track.id) {
            lastTrack.wasSkipped = true;
        }
    }

    /**
     * Update play duration for current track
     * @param {string} trackId - Track ID
     * @param {number} duration - Play duration in seconds
     */
    function updateTrackDuration(trackId, duration) {
        if (!currentSession) return;

        const trackEntry = currentSession.tracks.find(t => t.track.id === trackId);
        if (trackEntry) {
            trackEntry.playDuration = duration;
        }
    }

    /**
     * Record transition between two tracks
     * @param {Object} fromEntry - Previous track entry
     * @param {Object} toEntry - Current track entry
     */
    function recordTransition(fromEntry, toEntry) {
        const fromTrack = fromEntry.track;
        const toTrack = toEntry.track;

        // Calculate transition analysis using HarmonicMixer
        let analysis = null;
        try {
            analysis = HarmonicMixer.analyzeTransition(fromTrack, toTrack);
        } catch (e) {
            console.warn('[Analytics] Could not analyze transition:', e);
        }

        const transition = {
            fromTrack: {
                id: fromTrack.id,
                name: fromTrack.name,
                bpm: fromTrack.audioFeatures?.tempo,
                key: AutoDJEngine.toCamelot(fromTrack.audioFeatures?.key, fromTrack.audioFeatures?.mode),
                energy: fromTrack.audioFeatures?.energy
            },
            toTrack: {
                id: toTrack.id,
                name: toTrack.name,
                bpm: toTrack.audioFeatures?.tempo,
                key: AutoDJEngine.toCamelot(toTrack.audioFeatures?.key, toTrack.audioFeatures?.mode),
                energy: toTrack.audioFeatures?.energy
            },
            timestamp: Date.now(),
            quality: analysis?.quality?.name || 'Unknown',
            overallScore: analysis?.overallScore || 0,
            bpmDifference: analysis?.bpm?.difference || 0,
            harmonicCompatibility: analysis?.harmonic?.compatibility || 0
        };

        currentSession.transitions.push(transition);
    }

    // ==========================================================================
    // METRICS CALCULATION
    // ==========================================================================

    /**
     * Calculate total playtime in milliseconds
     */
    function calculateTotalPlaytime() {
        if (!currentSession?.tracks.length) return 0;

        return currentSession.tracks.reduce((total, entry) => {
            return total + (entry.playDuration * 1000);
        }, 0);
    }

    /**
     * Get BPM over time data for charting
     * @returns {Array} Array of {time, bpm} objects
     */
    function getBPMTimeline() {
        if (!currentSession?.tracks.length) return [];

        return currentSession.tracks.map(entry => ({
            time: entry.playedAt - currentSession.startTime,
            bpm: entry.track.audioFeatures?.tempo || 0,
            trackName: entry.track.name
        }));
    }

    /**
     * Get energy curve data for charting
     * @returns {Array} Array of {time, energy} objects
     */
    function getEnergyCurve() {
        if (!currentSession?.tracks.length) return [];

        return currentSession.tracks.map(entry => ({
            time: entry.playedAt - currentSession.startTime,
            energy: entry.track.audioFeatures?.energy || 0,
            trackName: entry.track.name
        }));
    }

    /**
     * Get best transition in the session
     * @returns {Object|null} Best transition or null
     */
    function getBestTransition() {
        if (!currentSession?.transitions.length) return null;

        return currentSession.transitions.reduce((best, current) => {
            if (!best || current.overallScore > best.overallScore) {
                return current;
            }
            return best;
        }, null);
    }

    /**
     * Calculate average key distance across all transitions
     * @returns {number} Average harmonic compatibility (0-1)
     */
    function getAverageKeyCompatibility() {
        if (!currentSession?.transitions.length) return 0;

        const sum = currentSession.transitions.reduce((acc, t) => {
            return acc + (t.harmonicCompatibility || 0);
        }, 0);

        return sum / currentSession.transitions.length;
    }

    /**
     * Get skipped vs played ratio
     * @returns {Object} Stats about skipped and played tracks
     */
    function getPlayedVsSkipped() {
        if (!currentSession) return { played: 0, skipped: 0, ratio: 0 };

        const played = currentSession.tracks.filter(t => !t.wasSkipped).length;
        const skipped = currentSession.skippedTracks.length;

        return {
            played,
            skipped,
            ratio: played > 0 ? skipped / played : 0
        };
    }

    /**
     * Get transition quality distribution
     * @returns {Object} Count of each quality level
     */
    function getTransitionQualityDistribution() {
        if (!currentSession?.transitions.length) {
            return { Perfect: 0, Acceptable: 0, Risky: 0 };
        }

        return currentSession.transitions.reduce((dist, t) => {
            const quality = t.quality || 'Unknown';
            dist[quality] = (dist[quality] || 0) + 1;
            return dist;
        }, { Perfect: 0, Acceptable: 0, Risky: 0 });
    }

    /**
     * Get genre/mood distribution (based on audio features)
     * @returns {Object} Estimated genre breakdown
     */
    function getMoodDistribution() {
        if (!currentSession?.tracks.length) return {};

        // Simple mood classification based on audio features
        const moods = {
            highEnergy: 0,
            chill: 0,
            dark: 0,
            happy: 0
        };

        currentSession.tracks.forEach(entry => {
            const features = entry.track.audioFeatures;
            if (!features) return;

            if (features.energy > 0.7) moods.highEnergy++;
            if (features.energy < 0.4) moods.chill++;
            if (features.valence < 0.4) moods.dark++;
            if (features.valence > 0.6) moods.happy++;
        });

        const total = currentSession.tracks.length;
        return {
            highEnergy: Math.round((moods.highEnergy / total) * 100),
            chill: Math.round((moods.chill / total) * 100),
            dark: Math.round((moods.dark / total) * 100),
            happy: Math.round((moods.happy / total) * 100)
        };
    }

    // ==========================================================================
    // SESSION SUMMARY
    // ==========================================================================

    /**
     * Generate comprehensive session summary
     * @returns {Object} Session summary object
     */
    function generateSessionSummary() {
        if (!currentSession) return null;

        const duration = (currentSession.endTime || Date.now()) - currentSession.startTime;
        const bpmTimeline = getBPMTimeline();
        const avgBPM = bpmTimeline.length
            ? bpmTimeline.reduce((sum, p) => sum + p.bpm, 0) / bpmTimeline.length
            : 0;

        return {
            // Basic stats
            sessionId: currentSession.id,
            duration: duration,
            durationFormatted: formatDuration(duration),
            trackCount: currentSession.tracks.length,
            transitionCount: currentSession.transitions.length,

            // BPM stats
            averageBPM: Math.round(avgBPM),
            bpmRange: {
                min: Math.min(...bpmTimeline.map(p => p.bpm).filter(b => b > 0)) || 0,
                max: Math.max(...bpmTimeline.map(p => p.bpm)) || 0
            },
            bpmTimeline,

            // Energy stats
            energyCurve: getEnergyCurve(),
            peakEnergy: currentSession.peakEnergy,
            lowestEnergy: currentSession.lowestEnergy,
            peakEnergyTime: currentSession.peakEnergyTime
                ? currentSession.peakEnergyTime - currentSession.startTime
                : null,

            // Transition stats
            bestTransition: getBestTransition(),
            averageTransitionScore: currentSession.transitions.length
                ? currentSession.transitions.reduce((s, t) => s + t.overallScore, 0) / currentSession.transitions.length
                : 0,
            transitionQuality: getTransitionQualityDistribution(),
            averageKeyCompatibility: getAverageKeyCompatibility(),

            // Track stats
            playedVsSkipped: getPlayedVsSkipped(),
            moodDistribution: getMoodDistribution(),

            // Timestamps
            startTime: currentSession.startTime,
            endTime: currentSession.endTime
        };
    }

    /**
     * Format duration in ms to human-readable string
     * @param {number} ms - Duration in milliseconds
     * @returns {string} Formatted string (e.g., "1h 23m")
     */
    function formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes}m ${seconds % 60}s`;
    }

    // ==========================================================================
    // PERSISTENCE
    // ==========================================================================

    /**
     * Save session to localStorage history
     * @param {Object} session - Session to save
     */
    function saveSessionToHistory(session) {
        try {
            const history = getSessionHistory();
            history.push({
                ...session,
                summary: generateSessionSummary()
            });

            // Keep only last 50 sessions
            if (history.length > 50) {
                history.splice(0, history.length - 50);
            }

            localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch (e) {
            console.error('[Analytics] Failed to save session:', e);
        }
    }

    /**
     * Get session history from localStorage
     * @returns {Array} Array of past sessions
     */
    function getSessionHistory() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('[Analytics] Failed to load session history:', e);
            return [];
        }
    }

    /**
     * Clear session history
     */
    function clearSessionHistory() {
        localStorage.removeItem(STORAGE_KEY);
    }

    /**
     * Export current session as JSON
     * @returns {string} JSON string of session data
     */
    function exportSession() {
        const session = currentSession || getSessionHistory().pop();
        if (!session) return null;

        return JSON.stringify({
            ...session,
            summary: generateSessionSummary(),
            exportedAt: new Date().toISOString()
        }, null, 2);
    }

    // ==========================================================================
    // UI GENERATION
    // ==========================================================================

    /**
     * Generate HTML for session summary card
     * @param {Object} summary - Session summary object
     * @returns {string} HTML string
     */
    function generateSummaryCard(summary) {
        if (!summary) return '<div style="color: #666;">No session data available</div>';

        return `
            <div class="analytics-summary" style="
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border-radius: 16px;
                padding: 24px;
                color: #fff;
            ">
                <h2 style="margin: 0 0 20px 0; font-size: 24px;">
                    🎧 Session Complete
                </h2>

                <!-- Hero stats -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
                    ${generateStatBox('Duration', summary.durationFormatted, '⏱️')}
                    ${generateStatBox('Tracks', summary.trackCount.toString(), '🎵')}
                    ${generateStatBox('Avg BPM', summary.averageBPM.toString(), '💓')}
                    ${generateStatBox('Transitions', summary.transitionCount.toString(), '🔀')}
                </div>

                <!-- Energy curve placeholder -->
                <div style="
                    background-color: #0a0a1a;
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 20px;
                ">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #888;">
                        ENERGY CURVE
                    </h3>
                    <div id="energy-chart" style="height: 120px;">
                        ${generateMiniChart(summary.energyCurve)}
                    </div>
                </div>

                <!-- Transition quality -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                    <div style="
                        background-color: #0a0a1a;
                        border-radius: 12px;
                        padding: 16px;
                    ">
                        <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #888;">
                            TRANSITION QUALITY
                        </h3>
                        ${generateQualityBars(summary.transitionQuality)}
                    </div>

                    <div style="
                        background-color: #0a0a1a;
                        border-radius: 12px;
                        padding: 16px;
                    ">
                        <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #888;">
                            SET MOOD
                        </h3>
                        ${generateMoodBars(summary.moodDistribution)}
                    </div>
                </div>

                <!-- Best transition -->
                ${summary.bestTransition ? `
                    <div style="
                        background-color: #1e3a5f;
                        border: 1px solid #3b82f6;
                        border-radius: 12px;
                        padding: 16px;
                    ">
                        <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #60a5fa;">
                            ⭐ BEST TRANSITION
                        </h3>
                        <div style="font-size: 16px;">
                            ${summary.bestTransition.fromTrack.name} → ${summary.bestTransition.toTrack.name}
                        </div>
                        <div style="font-size: 13px; color: #888; margin-top: 4px;">
                            Score: ${Math.round(summary.bestTransition.overallScore * 100)}% •
                            ${summary.bestTransition.fromTrack.key} → ${summary.bestTransition.toTrack.key}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Generate a stat box HTML
     */
    function generateStatBox(label, value, emoji) {
        return `
            <div style="
                background-color: #0a0a1a;
                border-radius: 12px;
                padding: 16px;
                text-align: center;
            ">
                <div style="font-size: 24px; margin-bottom: 4px;">${emoji}</div>
                <div style="font-size: 24px; font-weight: bold;">${value}</div>
                <div style="font-size: 12px; color: #888;">${label}</div>
            </div>
        `;
    }

    /**
     * Generate mini ASCII chart for energy curve
     * @param {Array} data - Energy curve data
     * @returns {string} HTML for mini chart
     */
    function generateMiniChart(data) {
        if (!data || data.length < 2) {
            return '<div style="color: #666; text-align: center;">Not enough data</div>';
        }

        const height = 80;
        const width = 100;
        const points = data.map((d, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - (d.energy * height);
            return `${x},${y}`;
        }).join(' ');

        return `
            <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%;">
                <defs>
                    <linearGradient id="energyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#22c55e;stop-opacity:0.8" />
                        <stop offset="100%" style="stop-color:#22c55e;stop-opacity:0.1" />
                    </linearGradient>
                </defs>
                <polygon
                    points="0,${height} ${points} ${width},${height}"
                    fill="url(#energyGradient)"
                />
                <polyline
                    points="${points}"
                    fill="none"
                    stroke="#22c55e"
                    stroke-width="2"
                />
            </svg>
        `;
    }

    /**
     * Generate quality distribution bars
     */
    function generateQualityBars(quality) {
        const total = quality.Perfect + quality.Acceptable + quality.Risky;
        if (total === 0) return '<div style="color: #666;">No transitions</div>';

        const colors = {
            Perfect: '#22c55e',
            Acceptable: '#eab308',
            Risky: '#ef4444'
        };

        return Object.entries(quality).map(([name, count]) => {
            const percent = Math.round((count / total) * 100);
            return `
                <div style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                        <span>${name}</span>
                        <span>${count} (${percent}%)</span>
                    </div>
                    <div style="
                        background-color: #333;
                        border-radius: 4px;
                        height: 8px;
                        overflow: hidden;
                    ">
                        <div style="
                            background-color: ${colors[name]};
                            width: ${percent}%;
                            height: 100%;
                        "></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Generate mood distribution bars
     */
    function generateMoodBars(moods) {
        const labels = {
            highEnergy: '⚡ High Energy',
            chill: '🌙 Chill',
            dark: '🖤 Dark',
            happy: '☀️ Happy'
        };

        return Object.entries(moods).map(([key, percent]) => `
            <div style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                    <span>${labels[key]}</span>
                    <span>${percent}%</span>
                </div>
                <div style="
                    background-color: #333;
                    border-radius: 4px;
                    height: 6px;
                    overflow: hidden;
                ">
                    <div style="
                        background-color: #6366f1;
                        width: ${percent}%;
                        height: 100%;
                    "></div>
                </div>
            </div>
        `).join('');
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        // Session management
        startSession,
        endSession,
        getSessionStatus,

        // Recording
        recordTrackPlayed,
        recordTrackSkipped,
        updateTrackDuration,

        // Metrics
        getBPMTimeline,
        getEnergyCurve,
        getBestTransition,
        getAverageKeyCompatibility,
        getPlayedVsSkipped,
        getTransitionQualityDistribution,
        getMoodDistribution,
        generateSessionSummary,

        // Persistence
        getSessionHistory,
        clearSessionHistory,
        exportSession,

        // UI
        generateSummaryCard
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalyticsDashboard;
}
