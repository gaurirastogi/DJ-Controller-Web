/**
 * Audio Analyzer - Real-time BPM and Audio Feature Detection
 *
 * OVERVIEW:
 * Uses the Web Audio API to analyze actual audio data and extract:
 * - BPM (beats per minute) via onset detection
 * - Energy levels (RMS amplitude)
 * - Frequency spectrum for basic mood/key hints
 *
 * This provides REAL audio analysis instead of estimates, working even
 * when Spotify's audio-features API is restricted.
 *
 * ALGORITHM:
 * 1. Load audio into AudioContext
 * 2. Apply low-pass filter to isolate beats (bass/kick)
 * 3. Compute onset strength using spectral flux
 * 4. Find peaks in onset function
 * 5. Calculate inter-onset intervals to determine BPM
 *
 * TODO (Future ML Extensions):
 * - Use neural network for more accurate beat tracking
 * - Key detection via chroma feature analysis
 * - Mood classification from spectral features
 */

const AudioAnalyzer = (function() {
    'use strict';

    // ==========================================================================
    // STATE
    // ==========================================================================

    let audioContext = null;
    const analysisCache = new Map(); // Cache results by track ID

    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================

    /**
     * Get or create AudioContext
     * @returns {AudioContext}
     */
    function getAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioContext;
    }

    // ==========================================================================
    // BPM DETECTION
    // ==========================================================================

    /**
     * Detect BPM from an audio URL
     * @param {string} url - URL of the audio file
     * @param {string} trackId - Track ID for caching
     * @returns {Promise<Object>} Analysis results including BPM
     */
    async function analyzeFromUrl(url, trackId) {
        // Check cache first
        if (trackId && analysisCache.has(trackId)) {
            console.log('[AudioAnalyzer] Using cached analysis for', trackId);
            return analysisCache.get(trackId);
        }

        console.log('[AudioAnalyzer] Fetching audio from URL...');

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch audio: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const result = await analyzeFromBuffer(arrayBuffer);

            // Cache the result
            if (trackId) {
                analysisCache.set(trackId, result);
            }

            return result;
        } catch (err) {
            console.error('[AudioAnalyzer] Failed to analyze URL:', err);
            throw err;
        }
    }

    /**
     * Analyze audio from an ArrayBuffer
     * @param {ArrayBuffer} arrayBuffer - Raw audio data
     * @returns {Promise<Object>} Analysis results
     */
    async function analyzeFromBuffer(arrayBuffer) {
        const ctx = getAudioContext();

        console.log('[AudioAnalyzer] Decoding audio...');
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        console.log('[AudioAnalyzer] Analyzing', audioBuffer.duration.toFixed(1), 'seconds of audio');

        // Get audio data (mono mix)
        const channelData = getMonoData(audioBuffer);

        // Detect BPM
        const bpmResult = detectBPM(channelData, audioBuffer.sampleRate);

        // Calculate energy
        const energy = calculateEnergy(channelData);

        // Analyze frequency content for mood hints
        const spectralAnalysis = analyzeSpectrum(channelData, audioBuffer.sampleRate);

        const result = {
            bpm: bpmResult.bpm,
            bpmConfidence: bpmResult.confidence,
            energy: energy,
            spectralCentroid: spectralAnalysis.centroid,
            bassRatio: spectralAnalysis.bassRatio,
            duration: audioBuffer.duration,
            analyzed: true,
            _realAnalysis: true
        };

        console.log('[AudioAnalyzer] Analysis complete:', result);
        return result;
    }

    /**
     * Get mono audio data from buffer
     * @param {AudioBuffer} audioBuffer
     * @returns {Float32Array}
     */
    function getMonoData(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const mono = new Float32Array(length);

        // Mix all channels to mono
        for (let ch = 0; ch < numChannels; ch++) {
            const channelData = audioBuffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                mono[i] += channelData[i] / numChannels;
            }
        }

        return mono;
    }

    /**
     * Detect BPM using onset detection and autocorrelation
     * @param {Float32Array} samples - Audio samples
     * @param {number} sampleRate - Sample rate
     * @returns {Object} BPM and confidence
     */
    function detectBPM(samples, sampleRate) {
        // Parameters
        const hopSize = 512;
        const windowSize = 2048;

        // Calculate onset strength function
        const onsets = calculateOnsetStrength(samples, sampleRate, windowSize, hopSize);

        // Find tempo using autocorrelation
        const bpmResult = findTempoFromOnsets(onsets, sampleRate, hopSize);

        return bpmResult;
    }

    /**
     * Calculate onset strength using spectral flux
     * @param {Float32Array} samples
     * @param {number} sampleRate
     * @param {number} windowSize
     * @param {number} hopSize
     * @returns {Float32Array}
     */
    function calculateOnsetStrength(samples, sampleRate, windowSize, hopSize) {
        const numFrames = Math.floor((samples.length - windowSize) / hopSize);
        const onsets = new Float32Array(numFrames);

        let prevSpectrum = null;

        for (let frame = 0; frame < numFrames; frame++) {
            const start = frame * hopSize;
            const windowedSamples = applyWindow(samples.slice(start, start + windowSize));

            // Simple FFT approximation using DFT for low frequencies
            const spectrum = computeLowFreqSpectrum(windowedSamples, 32);

            if (prevSpectrum) {
                // Spectral flux (only positive differences)
                let flux = 0;
                for (let i = 0; i < spectrum.length; i++) {
                    const diff = spectrum[i] - prevSpectrum[i];
                    if (diff > 0) flux += diff;
                }
                onsets[frame] = flux;
            }

            prevSpectrum = spectrum;
        }

        // Normalize
        const maxOnset = Math.max(...onsets);
        if (maxOnset > 0) {
            for (let i = 0; i < onsets.length; i++) {
                onsets[i] /= maxOnset;
            }
        }

        return onsets;
    }

    /**
     * Apply Hann window to samples
     * @param {Float32Array} samples
     * @returns {Float32Array}
     */
    function applyWindow(samples) {
        const windowed = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (samples.length - 1)));
            windowed[i] = samples[i] * window;
        }
        return windowed;
    }

    /**
     * Compute low-frequency spectrum using simplified DFT
     * @param {Float32Array} samples
     * @param {number} numBins
     * @returns {Float32Array}
     */
    function computeLowFreqSpectrum(samples, numBins) {
        const spectrum = new Float32Array(numBins);
        const N = samples.length;

        for (let k = 0; k < numBins; k++) {
            let real = 0, imag = 0;
            for (let n = 0; n < N; n++) {
                const angle = 2 * Math.PI * k * n / N;
                real += samples[n] * Math.cos(angle);
                imag -= samples[n] * Math.sin(angle);
            }
            spectrum[k] = Math.sqrt(real * real + imag * imag);
        }

        return spectrum;
    }

    /**
     * Find tempo from onset strength function using autocorrelation
     * @param {Float32Array} onsets
     * @param {number} sampleRate
     * @param {number} hopSize
     * @returns {Object}
     */
    function findTempoFromOnsets(onsets, sampleRate, hopSize) {
        const framesPerSecond = sampleRate / hopSize;

        // BPM range: 60-180 BPM
        const minBPM = 60;
        const maxBPM = 180;
        const minLag = Math.floor(framesPerSecond * 60 / maxBPM);
        const maxLag = Math.ceil(framesPerSecond * 60 / minBPM);

        // Compute autocorrelation for each lag
        let bestLag = minLag;
        let bestCorr = -Infinity;
        const correlations = [];

        for (let lag = minLag; lag <= maxLag && lag < onsets.length; lag++) {
            let corr = 0;
            let count = 0;
            for (let i = 0; i < onsets.length - lag; i++) {
                corr += onsets[i] * onsets[i + lag];
                count++;
            }
            corr /= count;
            correlations.push({ lag, corr });

            if (corr > bestCorr) {
                bestCorr = corr;
                bestLag = lag;
            }
        }

        // Convert lag to BPM
        const bpm = Math.round(framesPerSecond * 60 / bestLag);

        // Calculate confidence based on peak prominence
        const avgCorr = correlations.reduce((s, c) => s + c.corr, 0) / correlations.length;
        const confidence = Math.min(1, Math.max(0, (bestCorr - avgCorr) / avgCorr));

        return { bpm, confidence };
    }

    /**
     * Calculate overall energy (RMS)
     * @param {Float32Array} samples
     * @returns {number} Energy normalized to 0-1
     */
    function calculateEnergy(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        const rms = Math.sqrt(sum / samples.length);

        // Normalize (typical RMS for music is 0.1-0.3)
        return Math.min(1, rms * 4);
    }

    /**
     * Analyze frequency spectrum for mood hints
     * @param {Float32Array} samples
     * @param {number} sampleRate
     * @returns {Object}
     */
    function analyzeSpectrum(samples, sampleRate) {
        // Take a sample from the middle of the track
        const chunkSize = Math.min(65536, samples.length);
        const startIdx = Math.floor((samples.length - chunkSize) / 2);
        const chunk = samples.slice(startIdx, startIdx + chunkSize);

        // Compute spectrum
        const spectrum = computeLowFreqSpectrum(applyWindow(chunk), 64);

        // Calculate spectral centroid (brightness)
        let weightedSum = 0, magnitudeSum = 0;
        for (let i = 0; i < spectrum.length; i++) {
            const freq = i * sampleRate / (2 * spectrum.length);
            weightedSum += freq * spectrum[i];
            magnitudeSum += spectrum[i];
        }
        const centroid = magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;

        // Calculate bass ratio (low freq energy / total)
        const bassEnd = Math.floor(spectrum.length * 0.2); // ~0-200Hz
        let bassEnergy = 0, totalEnergy = 0;
        for (let i = 0; i < spectrum.length; i++) {
            totalEnergy += spectrum[i];
            if (i < bassEnd) bassEnergy += spectrum[i];
        }
        const bassRatio = totalEnergy > 0 ? bassEnergy / totalEnergy : 0;

        return { centroid, bassRatio };
    }

    // ==========================================================================
    // REAL-TIME ANALYSIS
    // ==========================================================================

    /**
     * Create a real-time analyzer for an audio element
     * @param {HTMLAudioElement} audioElement
     * @returns {Object} Analyzer with update method
     */
    function createRealtimeAnalyzer(audioElement) {
        const ctx = getAudioContext();
        const source = ctx.createMediaElementSource(audioElement);
        const analyzerNode = ctx.createAnalyser();

        analyzerNode.fftSize = 2048;
        analyzerNode.smoothingTimeConstant = 0.8;

        source.connect(analyzerNode);
        analyzerNode.connect(ctx.destination);

        const bufferLength = analyzerNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        return {
            getFrequencyData() {
                analyzerNode.getByteFrequencyData(dataArray);
                return dataArray;
            },
            getEnergy() {
                analyzerNode.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                return sum / (bufferLength * 255);
            },
            disconnect() {
                source.disconnect();
                analyzerNode.disconnect();
            }
        };
    }

    // ==========================================================================
    // UTILITY
    // ==========================================================================

    /**
     * Clear the analysis cache
     */
    function clearCache() {
        analysisCache.clear();
    }

    /**
     * Check if a track has been analyzed
     * @param {string} trackId
     * @returns {boolean}
     */
    function hasAnalysis(trackId) {
        return analysisCache.has(trackId);
    }

    /**
     * Get cached analysis
     * @param {string} trackId
     * @returns {Object|null}
     */
    function getCachedAnalysis(trackId) {
        return analysisCache.get(trackId) || null;
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        analyzeFromUrl,
        analyzeFromBuffer,
        createRealtimeAnalyzer,
        hasAnalysis,
        getCachedAnalysis,
        clearCache,
        getAudioContext
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioAnalyzer;
}
