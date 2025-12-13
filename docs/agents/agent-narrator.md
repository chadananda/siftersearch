---
title: Narrator Agent
description: Audio narration specialist with pronunciation dictionary for 80+ sacred terms
role: Audio Narration
icon: volume-2
order: 5
---

# Narrator Agent

**Role:** Audio Narration Specialist
**File:** `api/agents/agent-narrator.js`

## Overview

The Narrator agent provides audio narration of texts using ElevenLabs TTS API, featuring a comprehensive pronunciation dictionary for religious and sacred terms.

## Features

- Pronunciation dictionary for 80+ religious/sacred terms
- Emotion and pacing detection from context
- Multiple voice options
- Streaming audio support

## Pronunciation Dictionary

Includes terms from:

| Tradition | Examples |
|-----------|----------|
| Baha'i | Baha'u'llah, Abdu'l-Baha, Shoghi Effendi, Ridvan |
| Islamic | Qur'an, Muhammad, hadith, salat, hajj |
| Jewish | Torah, Talmud, Kabbalah, Shabbat, rabbi |
| Hindu | Bhagavad Gita, Upanishads, karma, dharma, moksha |
| Buddhist | Buddha, bodhisattva, nirvana, sutra, sangha |
| Christian | Eucharist, liturgy, psalm, hallelujah |

## Emotion Options

| Emotion | Use Case |
|---------|----------|
| `reverent` | Prayers, sacred texts, meditations |
| `warm` | Stories, personal accounts |
| `scholarly` | Explanations, historical content |
| `inspiring` | Calls to action, uplifting passages |
| `contemplative` | Philosophical, reflective content |

## Pacing Options

- `slow`: Prayers, meditations, poetry
- `normal`: Narrative, stories, explanations
- `measured`: Philosophical content, proclamations

## Methods

### `narrate(text, options)`
Generate audio narration.

```javascript
const result = await narrator.narrate(text, {
  voiceId: 'optional-voice-id',
  emotion: 'reverent'
});
```

Returns:
```javascript
{
  audio: Buffer,           // MP3 audio data
  mimeType: 'audio/mpeg',
  text: "original text",
  preparedText: "text with pronunciation hints",
  analysis: { emotion, pacing, ... },
  voiceSettings: { stability, similarity_boost, ... }
}
```

### `narrateStream(text, options)`
Stream audio for longer texts.

```javascript
for await (const chunk of narrator.narrateStream(text)) {
  // chunk.chunk = audio data
  // chunk.mimeType = 'audio/mpeg'
}
```

### `analyzeForNarration(text, context)`
Analyze text to determine optimal narration settings.

### `prepareTextForTTS(text)`
Insert pronunciation guides for known terms.

### `addPronunciation(term, pronunciation)`
Add a term to the pronunciation dictionary.

### `getPronunciation(term)`
Get pronunciation for a specific term.

### `getAvailableVoices()`
List available ElevenLabs voices.

### `estimateDuration(text)`
Estimate audio duration based on word count.

```javascript
const { wordCount, estimatedSeconds, estimatedMinutes } = narrator.estimateDuration(text);
```

## Voice Settings by Emotion

| Emotion | Stability | Similarity | Style |
|---------|-----------|------------|-------|
| reverent | 0.7 | 0.8 | 0 |
| warm | 0.5 | 0.7 | 0 |
| scholarly | 0.6 | 0.75 | 0 |
| inspiring | 0.4 | 0.8 | 0.3 |
| contemplative | 0.7 | 0.6 | 0 |

## Configuration

```javascript
const narrator = new NarratorAgent({
  model: 'gpt-4o',
  temperature: 0.3
});
```

## Environment Variables

- `ELEVENLABS_API_KEY`: Required for audio generation
- `ELEVENLABS_VOICE_ID`: Default voice (falls back to "Adam")
