---
title: Transcriber Agent
description: Audio and video to Markdown transcription agent using Whisper AI
role: Audio/Video to Text
icon: microphone
order: 8
---

# Transcriber Agent

**Role:** Audio/Video to Markdown Transcription Specialist
**File:** `api/agents/agent-transcriber.js`

## Overview

The Transcriber agent converts audio and video content into searchable Markdown documents using OpenAI's Whisper model. It handles direct file uploads, URL downloads (including YouTube and Vimeo), and produces clean, well-formatted transcripts suitable for indexing in the library.

## Core Capabilities

### 1. Multi-Source Input
- Direct audio/video file uploads (MP3, MP4, WAV, FLAC, etc.)
- YouTube and Vimeo URL downloads via yt-dlp
- Direct URL downloads for other audio sources
- Podcast RSS feed URLs (future)

### 2. Whisper Transcription
- **Development mode:** OpenAI Whisper API (simpler setup)
- **Production mode:** Local Whisper installation (faster, no API costs)
- Supports multiple languages with auto-detection
- Segment-level timestamps for navigation

### 3. Markdown Formatting
- AI-powered transcript cleanup and formatting
- Section headings based on topic shifts
- Speaker detection and labeling
- Proper punctuation and paragraph breaks
- YAML frontmatter with metadata

### 4. Sacred Text Handling
- Correct spelling of religious terms
- Proper diacriticals (Bahá'u'lláh, 'Abdu'l-Bahá)
- Preservation of speaker's voice and style
- [inaudible] markers for unclear portions

## Architecture

```
Audio/Video Source
       │
       ▼
┌─────────────────────┐
│  Download Media     │ ◄── YouTube, Vimeo, direct URLs
│  (yt-dlp/fetch)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Transcribe Audio   │ ◄── Local Whisper or OpenAI API
│  (whisper/API)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Format Transcript  │ ◄── AI cleanup and structuring
│  (LLM)              │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Save Markdown      │ ──► data/transcriptions/
└─────────────────────┘
```

## Supported Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| MP3 | .mp3 | Most common audio format |
| MP4 | .mp4 | Video with audio extraction |
| WAV | .wav | High-quality uncompressed |
| FLAC | .flac | Lossless compression |
| WebM | .webm | Web video format |
| M4A | .m4a | Apple audio format |
| OGG | .ogg | Open source format |
| MPEG | .mpeg, .mpga | Various MPEG formats |

## Usage Examples

### Transcribe from URL

```javascript
import { TranscriberAgent } from './api/agents/agent-transcriber.js';

const transcriber = new TranscriberAgent();

// Transcribe a YouTube video
const result = await transcriber.transcribe(
  'https://www.youtube.com/watch?v=VIDEO_ID',
  {
    language: 'en',
    whisperModel: 'medium',
    format: true  // AI formatting
  }
);

// Returns:
// {
//   markdown: "---\ntitle: ...\n---\n\n# Talk Title\n\n...",
//   rawText: "original whisper output...",
//   metadata: { title, duration, uploader, url },
//   outputPath: "data/transcriptions/Talk-Title.md",
//   segments: [{ start, end, text }, ...]
// }
```

### Transcribe Local File

```javascript
// Transcribe a local audio file
const result = await transcriber.transcribe(
  '/path/to/lecture.mp3',
  {
    language: 'en',
    format: true
  }
);
```

### Skip AI Formatting

```javascript
// Get raw transcript without AI cleanup
const result = await transcriber.transcribe(url, {
  format: false  // Skip AI formatting
});
```

### Custom Output Path

```javascript
const result = await transcriber.transcribe(url, {
  outputPath: './library/talks/my-lecture.md'
});
```

## Output Format

### Markdown with Frontmatter

```markdown
---
title: "The Power of Prayer"
speaker: "Dr. John Smith"
date: "2024-03-15"
source: "https://youtube.com/watch?v=..."
duration: "01:23:45"
---

# The Power of Prayer

## Introduction

Welcome everyone. Today we're going to explore the transformative
power of prayer across different spiritual traditions...

## Historical Context

The practice of prayer dates back to the earliest recorded
human civilizations...

## Practical Application

When we approach prayer with **sincerity** and **humility**,
we open ourselves to divine guidance...

[Recording ends]
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `service` | quality | AI service tier for formatting |
| `temperature` | 0.3 | Low temp for accurate transcription |
| `maxTokens` | 4000 | Max tokens for formatting response |
| `whisperModel` | medium | Whisper model (tiny, base, small, medium, large) |
| `language` | en | Language code or 'auto' for detection |

## Environment Variables

```bash
# Transcription output directory
TRANSCRIPTION_DIR=./data/transcriptions

# For OpenAI Whisper API (dev mode)
OPENAI_API_KEY=sk-...

# DEV_MODE determines API vs local Whisper
DEV_MODE=true  # Uses OpenAI API
DEV_MODE=false # Uses local Whisper
```

## Dependencies

### For Development (API Mode)
- OpenAI API key with access to Whisper

### For Production (Local Mode)
- [Whisper](https://github.com/openai/whisper) installed locally
- [FFmpeg](https://ffmpeg.org/) for audio processing
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for video downloads

```bash
# Install local Whisper
pip install openai-whisper

# Install yt-dlp
brew install yt-dlp  # macOS
pip install yt-dlp   # or via pip

# Install FFmpeg
brew install ffmpeg  # macOS
```

## API Limits

| Service | Limit | Notes |
|---------|-------|-------|
| OpenAI Whisper API | 25MB max file | Split larger files |
| Local Whisper | No limit | Constrained by RAM/GPU |
| YouTube | Varies | yt-dlp handles most restrictions |

## Integration with Sifter

The Transcriber can be invoked through Sifter for natural language requests:

```
User: "Transcribe this talk: https://youtube.com/watch?v=..."

Sifter: I'll have the Transcriber process that video for you.
[Invokes TranscriberAgent.transcribe()]
The transcript has been saved to the library. Would you like me
to search for specific topics within it?
```

## Integration with Librarian

Transcribed documents can be automatically queued for library ingestion:

```javascript
// Transcribe and queue for library
const transcript = await transcriber.transcribe(url);

// Queue with Librarian for indexing
await librarian.queueDocument('transcription', {
  content: transcript.markdown,
  metadata: transcript.metadata,
  sourcePath: transcript.outputPath
});
```

## Future Enhancements

- [ ] Batch transcription from playlist/channel URLs
- [ ] Speaker diarization (who spoke when)
- [ ] Real-time streaming transcription
- [ ] Podcast RSS feed auto-import
- [ ] Translation of non-English transcripts
- [ ] Audio chapter/segment extraction
- [ ] Integration with narration for read-back verification
