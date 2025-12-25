# DJ Controller

A web-based DJ mixing application with Spotify integration, featuring intelligent track recommendations, harmonic mixing analysis, and session analytics.

## Features

- **Dual Deck System**: Load and mix two tracks simultaneously
- **Spotify Integration**: Stream tracks directly from your Spotify Premium account
- **Auto-DJ**: Intelligent next-track recommendations based on BPM, energy, and key compatibility
- **Harmonic Mixing**: Camelot wheel analysis for smooth key-compatible transitions
- **Crossfader**: Smooth transitions with equal-power crossfade
- **EQ Controls**: 3-band EQ (bass, mid, treble) for local audio files
- **Session Analytics**: Track your mixing session history

## Prerequisites

- Node.js (v14 or higher)
- Spotify Premium account (required for streaming)
- Spotify Developer credentials

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/dj-controller-app.git
   cd dj-controller-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create Spotify App**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new application
   - Add `http://127.0.0.1:3000/api/spotify/callback` to Redirect URIs
   - Copy your Client ID and Client Secret

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Spotify credentials:
   ```
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   ```

5. **Start the server**
   ```bash
   npm start
   ```

6. **Open the app**
   Navigate to `http://127.0.0.1:3000` in your browser

## Usage

1. Click "Connect Spotify" to authenticate
2. Select a playlist from the dropdown
3. Click on tracks to load them to Deck A or Deck B
4. Use transport controls (play, pause, stop) to control playback
5. Use the crossfader to blend between decks
6. Enable Auto-DJ for automatic track recommendations

## Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: Vanilla JavaScript, Web Audio API
- **APIs**: Spotify Web API, Spotify Web Playback SDK

## License

MIT
