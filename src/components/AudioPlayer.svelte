<script>
  /**
   * AudioPlayer Component
   * Text-to-speech player for documents
   * For patron+ users only
   */
  import { onMount, onDestroy } from 'svelte';
  import { services } from '../lib/api.js';
  import { getAuthState } from '../lib/auth.svelte.js';

  const auth = getAuthState();

  // Props
  let { documentId = null, documentTitle = '', onClose = () => {} } = $props();

  // State
  let loading = $state(true);
  let error = $state(null);
  let voices = $state([]);
  let selectedVoice = $state('');
  let audioExists = $state(false);
  let generating = $state(false);
  let generationProgress = $state(0);
  let jobId = $state(null);

  // Audio player state
  let audioUrl = $state(null);
  let audioElement = $state(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let playbackRate = $state(1);

  // Patron tiers that can use audio
  const PATRON_TIERS = ['patron', 'institutional', 'admin'];
  let canUseAudio = $derived(
    auth.isAuthenticated &&
    PATRON_TIERS.includes(auth.user?.tier)
  );

  onMount(async () => {
    if (!documentId) {
      error = 'No document specified';
      loading = false;
      return;
    }

    try {
      // Load voices and check if audio exists
      const [voicesResult, existsResult] = await Promise.all([
        services.getVoices(),
        services.checkAudio(documentId)
      ]);

      voices = voicesResult.voices || [];
      if (voices.length > 0) {
        selectedVoice = voices[0].id;
      }

      if (existsResult.exists) {
        audioExists = true;
        audioUrl = existsResult.url;
      }
    } catch (err) {
      error = err.message || 'Failed to load audio options';
    } finally {
      loading = false;
    }
  });

  onDestroy(() => {
    if (audioElement) {
      audioElement.pause();
      audioElement = null;
    }
  });

  async function requestAudio() {
    if (!canUseAudio || generating) return;

    generating = true;
    generationProgress = 0;
    error = null;

    try {
      const result = await services.requestAudio(documentId, {
        voiceId: selectedVoice,
        format: 'mp3'
      });

      if (result.status === 'already_exists') {
        audioExists = true;
        audioUrl = result.url;
        generating = false;
        return;
      }

      jobId = result.jobId;
      pollJobStatus();
    } catch (err) {
      error = err.message || 'Failed to request audio generation';
      generating = false;
    }
  }

  async function pollJobStatus() {
    if (!jobId) return;

    try {
      const status = await services.getAudioStatus(jobId);

      if (status.status === 'completed') {
        generating = false;
        audioExists = true;
        audioUrl = services.getDownloadUrl(jobId);
      } else if (status.status === 'failed') {
        error = status.error || 'Audio generation failed';
        generating = false;
      } else {
        generationProgress = status.progress || 0;
        setTimeout(pollJobStatus, 2000);
      }
    } catch (err) {
      error = err.message || 'Failed to check audio status';
      generating = false;
    }
  }

  function togglePlayPause() {
    if (!audioElement) return;

    if (isPlaying) {
      audioElement.pause();
    } else {
      audioElement.play();
    }
  }

  function handleTimeUpdate() {
    if (audioElement) {
      currentTime = audioElement.currentTime;
    }
  }

  function handleLoadedMetadata() {
    if (audioElement) {
      duration = audioElement.duration;
    }
  }

  function handleEnded() {
    isPlaying = false;
    currentTime = 0;
  }

  function seek(e) {
    if (!audioElement || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioElement.currentTime = percent * duration;
  }

  function changePlaybackRate() {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    playbackRate = rates[nextIndex];
    if (audioElement) {
      audioElement.playbackRate = playbackRate;
    }
  }

  function skip(seconds) {
    if (audioElement) {
      audioElement.currentTime = Math.max(0, Math.min(duration, audioElement.currentTime + seconds));
    }
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  $effect(() => {
    if (audioElement) {
      audioElement.playbackRate = playbackRate;
    }
  });
</script>

<div class="audio-player">
  <header class="player-header">
    <div class="header-info">
      <h3>Audio Player</h3>
      <p class="doc-title">{documentTitle || 'Document'}</p>
    </div>
    <button onclick={onClose} class="btn-close" aria-label="Close">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading audio options...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button onclick={() => error = null} class="btn-secondary">Dismiss</button>
    </div>
  {:else if !canUseAudio}
    <div class="upgrade-notice">
      <h3>Patron Feature</h3>
      <p>Audio playback requires a Patron subscription.</p>
    </div>
  {:else}
    <div class="player-content">
      {#if !audioExists && !generating}
        <!-- Voice selection and generate button -->
        <div class="generate-section">
          <p class="generate-info">Generate audio from this document using text-to-speech.</p>

          <div class="voice-select-wrapper">
            <label for="voice-select">Voice:</label>
            <select id="voice-select" bind:value={selectedVoice} class="voice-select">
              {#each voices as voice}
                <option value={voice.id}>{voice.name} ({voice.language})</option>
              {/each}
            </select>
          </div>

          <button onclick={requestAudio} class="btn-primary generate-btn">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            Generate Audio
          </button>
        </div>
      {:else if generating}
        <!-- Progress indicator -->
        <div class="generating">
          <div class="progress-circle">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border-default)" stroke-width="8" />
              <circle
                cx="50" cy="50" r="45"
                fill="none"
                stroke="var(--accent-primary)"
                stroke-width="8"
                stroke-dasharray="283"
                stroke-dashoffset={283 - (283 * generationProgress / 100)}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <span class="progress-text">{generationProgress}%</span>
          </div>
          <p>Generating audio...</p>
          <p class="progress-note">This may take a few minutes for longer documents.</p>
        </div>
      {:else}
        <!-- Audio player controls -->
        <div class="player-controls">
          <!-- Hidden audio element -->
          <audio
            bind:this={audioElement}
            src={audioUrl}
            onplay={() => isPlaying = true}
            onpause={() => isPlaying = false}
            ontimeupdate={handleTimeUpdate}
            onloadedmetadata={handleLoadedMetadata}
            onended={handleEnded}
          />

          <!-- Progress bar -->
          <div class="progress-bar" onclick={seek} role="slider" tabindex="0" aria-label="Seek">
            <div class="progress-track">
              <div class="progress-fill" style="width: {duration ? (currentTime / duration * 100) : 0}%"></div>
            </div>
            <div class="time-display">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <!-- Controls row -->
          <div class="controls-row">
            <button onclick={() => skip(-10)} class="control-btn" aria-label="Rewind 10 seconds">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
              </svg>
              <span class="control-label">-10s</span>
            </button>

            <button onclick={togglePlayPause} class="play-btn" aria-label={isPlaying ? 'Pause' : 'Play'}>
              {#if isPlaying}
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              {:else}
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              {/if}
            </button>

            <button onclick={() => skip(10)} class="control-btn" aria-label="Forward 10 seconds">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
              </svg>
              <span class="control-label">+10s</span>
            </button>
          </div>

          <!-- Speed control -->
          <div class="speed-control">
            <button onclick={changePlaybackRate} class="speed-btn">
              {playbackRate}x
            </button>
          </div>

          <!-- Download button -->
          <a href={audioUrl} download class="download-btn">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download MP3
          </a>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .audio-player {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface-0);
  }

  .player-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-default);
    background: var(--surface-1);
  }

  .header-info h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .doc-title {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .btn-close {
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.5rem;
  }

  .btn-close:hover {
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .loading, .error, .upgrade-notice, .generating {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
    flex: 1;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error {
    color: var(--error);
  }

  .upgrade-notice h3 {
    margin: 0 0 0.5rem;
    color: var(--text-primary);
  }

  .upgrade-notice p {
    color: var(--text-secondary);
  }

  .player-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 2rem;
  }

  .generate-section {
    text-align: center;
  }

  .generate-info {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
  }

  .voice-select-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .voice-select-wrapper label {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .voice-select {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    background: var(--surface-0);
    color: var(--text-primary);
    font-size: 0.875rem;
    min-width: 200px;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary:hover {
    background: var(--accent-primary-hover);
  }

  .btn-secondary {
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .generating {
    gap: 1rem;
  }

  .progress-circle {
    position: relative;
    width: 120px;
    height: 120px;
  }

  .progress-circle svg {
    width: 100%;
    height: 100%;
  }

  .progress-circle .progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .progress-note {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .player-controls {
    max-width: 400px;
    margin: 0 auto;
    width: 100%;
  }

  .progress-bar {
    margin-bottom: 1.5rem;
    cursor: pointer;
  }

  .progress-track {
    height: 6px;
    background: var(--surface-2);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-primary);
    transition: width 0.1s;
  }

  .time-display {
    display: flex;
    justify-content: space-between;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .controls-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .control-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.5rem;
    transition: color 0.2s;
  }

  .control-btn:hover {
    color: var(--text-primary);
  }

  .control-btn svg {
    width: 24px;
    height: 24px;
  }

  .control-label {
    font-size: 0.625rem;
    font-weight: 500;
  }

  .play-btn {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
  }

  .play-btn:hover {
    background: var(--accent-primary-hover);
    transform: scale(1.05);
  }

  .play-btn svg {
    width: 28px;
    height: 28px;
  }

  .speed-control {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .speed-btn {
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .speed-btn:hover {
    background: var(--surface-3);
  }

  .download-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--surface-2);
    color: var(--text-primary);
    border: 1px solid var(--border-default);
    border-radius: 0.5rem;
    text-decoration: none;
    font-size: 0.875rem;
    transition: background 0.2s;
  }

  .download-btn:hover {
    background: var(--surface-3);
  }

  .download-btn svg {
    width: 20px;
    height: 20px;
  }

  .w-5 { width: 1.25rem; }
  .h-5 { height: 1.25rem; }
</style>
