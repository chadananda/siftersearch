/**
 * Narrator Agent - Audio Narration Specialist
 *
 * The Narrator agent provides audio narration of texts using ElevenLabs TTS API.
 * Features:
 * - Pronunciation dictionary for religious/sacred terms
 * - Emotion and pacing detection from context
 * - Multiple voice options for different content types
 * - Streaming audio support
 */

import { BaseAgent } from './base-agent.js';
import { config } from '../lib/config.js';

// Pronunciation dictionary for religious and sacred terms
// Format: word -> IPA pronunciation or phonetic spelling
const PRONUNCIATION_DICTIONARY = {
  // Baha'i terms
  "Baha'u'llah": "bah-HAH-oo-LAH",
  "Baha'i": "bah-HAH-ee",
  "Abdu'l-Baha": "ab-DOOL-bah-HAH",
  "Shoghi Effendi": "SHOW-ghee ef-FEN-dee",
  "Bab": "bahb",
  "Kitab-i-Aqdas": "kee-TAB-ee-AK-das",
  "Kitab-i-Iqan": "kee-TAB-ee-ee-KAHN",
  "Huququ'llah": "hoo-KOO-koo-LAH",
  "Mashriqu'l-Adhkar": "MASH-ree-kool-az-KAR",
  "Ridvan": "riz-VAHN",
  "Naw-Ruz": "now-ROOZ",
  "Ayyam-i-Ha": "ay-YAM-ee-HAH",
  "Haifa": "HIGH-fah",
  "Akka": "AH-kah",
  "Bahji": "bah-JEE",
  "Carmel": "kar-MEL",
  "Tehran": "teh-RAHN",
  "Shiraz": "shee-RAHZ",

  // Arabic/Persian religious terms
  "Allah": "al-LAH",
  "Qur'an": "kur-AHN",
  "Muhammad": "moo-HAM-mad",
  "imam": "ee-MAHM",
  "ayatollah": "ah-yah-toh-LAH",
  "mullah": "MOO-lah",
  "mosque": "mahsk",
  "salat": "sah-LAHT",
  "zakat": "zah-KAHT",
  "hajj": "hahj",
  "umrah": "OOM-rah",
  "jihad": "jee-HAHD",
  "shahada": "shah-HAH-dah",
  "sunnah": "SOON-nah",
  "hadith": "hah-DEETH",
  "sharia": "shah-REE-ah",
  "sufi": "SOO-fee",
  "dervish": "DER-vish",

  // Hebrew/Jewish terms
  "Torah": "TOH-rah",
  "Talmud": "TAHL-mood",
  "Kabbalah": "kah-BAH-lah",
  "Shabbat": "shah-BAHT",
  "synagogue": "SIN-ah-gog",
  "rabbi": "RAB-eye",
  "mitzvah": "MITS-vah",
  "kosher": "KOH-sher",
  "Hashem": "hah-SHEM",
  "Adonai": "ah-doh-NYE",
  "YHWH": "yah-WEH",
  "Elohim": "el-oh-HEEM",

  // Sanskrit/Hindu terms
  "Bhagavad": "BUH-guh-vahd",
  "Gita": "GEE-tah",
  "Upanishads": "oo-PAN-ih-shadz",
  "Vedas": "VAY-dahz",
  "karma": "KAR-mah",
  "dharma": "DAR-mah",
  "moksha": "MOHK-shah",
  "nirvana": "nir-VAH-nah",
  "atman": "AHT-mahn",
  "Brahman": "BRAH-mahn",
  "avatar": "AH-vah-tar",
  "guru": "GOO-roo",
  "yoga": "YOH-gah",
  "mantra": "MAHN-trah",
  "chakra": "CHUK-rah",

  // Buddhist terms
  "Buddha": "BOO-dah",
  "bodhisattva": "boh-dee-SAHT-vah",
  "sangha": "SAHNG-gah",
  "sutra": "SOO-trah",
  "zen": "zen",
  "Theravada": "teh-rah-VAH-dah",
  "Mahayana": "mah-hah-YAH-nah",
  "Vajrayana": "vahj-rah-YAH-nah",
  "vipassana": "vih-PAH-sah-nah",

  // Christian terms (often mispronounced)
  "Eucharist": "YOO-kah-rist",
  "liturgy": "LIT-er-jee",
  "epistle": "ee-PIS-uhl",
  "apostle": "uh-POS-uhl",
  "psalm": "sahm",
  "messiah": "meh-SYE-ah",
  "hallelujah": "hal-uh-LOO-yah",
  "amen": "ah-MEN",
  "hosanna": "hoh-ZAN-ah"
};

const NARRATOR_SYSTEM_PROMPT = `You are a narration preparation assistant. Your job is to prepare text for text-to-speech synthesis, determining:
1. Appropriate emotion/tone based on content
2. Suggested pacing (slow for prayers, normal for narrative)
3. Any words that need pronunciation guidance

EMOTION OPTIONS:
- reverent: For prayers, sacred texts, meditations
- warm: For stories, personal accounts, friendly passages
- scholarly: For explanations, historical content
- inspiring: For calls to action, uplifting passages
- contemplative: For philosophical, reflective content

PACING:
- slow: Prayers, meditations, poetry
- normal: Narrative, stories, explanations
- measured: Philosophical content, important proclamations`;

export class NarratorAgent extends BaseAgent {
  constructor(options = {}) {
    super('narrator', {
      model: options.model || 'gpt-4o',
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens || 500,
      systemPrompt: NARRATOR_SYSTEM_PROMPT,
      ...options
    });

    this.elevenLabsApiKey = config.get('ELEVENLABS_API_KEY');
    this.defaultVoiceId = config.get('ELEVENLABS_VOICE_ID') || 'pNInz6obpgDQGcFmaJgB'; // Adam voice
    this.pronunciationDictionary = { ...PRONUNCIATION_DICTIONARY };
  }

  /**
   * Analyze text to determine narration parameters
   */
  async analyzeForNarration(text, context = {}) {
    const analyzePrompt = `Analyze this text for text-to-speech narration:

TEXT:
"${text.substring(0, 1000)}${text.length > 1000 ? '...' : ''}"

${context.type ? `Content type: ${context.type}` : ''}
${context.author ? `Author: ${context.author}` : ''}

Return JSON only:
{
  "emotion": "reverent|warm|scholarly|inspiring|contemplative",
  "pacing": "slow|normal|measured",
  "stability": 0.5,
  "clarity": 0.75,
  "style": 0,
  "speakerBoost": true,
  "specialWords": ["words needing careful pronunciation"]
}`;

    const response = await this.chat([
      { role: 'user', content: analyzePrompt }
    ]);

    try {
      return this.parseJSON(response.content);
    } catch {
      return {
        emotion: 'warm',
        pacing: 'normal',
        stability: 0.5,
        clarity: 0.75,
        style: 0,
        speakerBoost: true,
        specialWords: []
      };
    }
  }

  /**
   * Prepare text for TTS with pronunciation guides
   */
  prepareTextForTTS(text) {
    let preparedText = text;

    // Replace known terms with pronunciation-friendly versions
    // ElevenLabs uses SSML-like phonetic hints in angle brackets
    for (const [term, pronunciation] of Object.entries(this.pronunciationDictionary)) {
      // Create a regex that matches the term case-insensitively
      const regex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'gi');
      // Replace with phonetic spelling hint (ElevenLabs format)
      preparedText = preparedText.replace(regex, `<phoneme alphabet="ipa" ph="${pronunciation}">${term}</phoneme>`);
    }

    return preparedText;
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generate audio narration using ElevenLabs API
   */
  async narrate(text, options = {}) {
    if (!this.elevenLabsApiKey) {
      return {
        error: 'ElevenLabs API key not configured',
        text,
        fallback: 'Use browser TTS'
      };
    }

    // Analyze text for optimal narration settings
    const analysis = await this.analyzeForNarration(text, options);

    // Prepare text with pronunciation guides
    const preparedText = this.prepareTextForTTS(text);

    // Map emotion to ElevenLabs voice settings
    const voiceSettings = this.getVoiceSettings(analysis);

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${options.voiceId || this.defaultVoiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.elevenLabsApiKey
        },
        body: JSON.stringify({
          text: preparedText,
          model_id: 'eleven_monolingual_v1',
          voice_settings: voiceSettings
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `ElevenLabs API error: ${response.status}`);
      }

      // Return the audio as a buffer
      const audioBuffer = await response.arrayBuffer();

      return {
        audio: Buffer.from(audioBuffer),
        mimeType: 'audio/mpeg',
        text: text,
        preparedText,
        analysis,
        voiceSettings
      };

    } catch (error) {
      this.logger.error({ error: error.message }, 'ElevenLabs narration failed');
      return {
        error: error.message,
        text,
        analysis,
        fallback: 'Use browser TTS'
      };
    }
  }

  /**
   * Stream audio narration (for longer texts)
   */
  async *narrateStream(text, options = {}) {
    if (!this.elevenLabsApiKey) {
      yield { error: 'ElevenLabs API key not configured' };
      return;
    }

    const analysis = await this.analyzeForNarration(text, options);
    const preparedText = this.prepareTextForTTS(text);
    const voiceSettings = this.getVoiceSettings(analysis);

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${options.voiceId || this.defaultVoiceId}/stream`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.elevenLabsApiKey
        },
        body: JSON.stringify({
          text: preparedText,
          model_id: 'eleven_monolingual_v1',
          voice_settings: voiceSettings
        })
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield { chunk: value, mimeType: 'audio/mpeg' };
      }

    } catch (error) {
      this.logger.error({ error: error.message }, 'ElevenLabs streaming failed');
      yield { error: error.message };
    }
  }

  /**
   * Get ElevenLabs voice settings based on analysis
   */
  getVoiceSettings(analysis) {
    // Base settings
    const settings = {
      stability: analysis.stability ?? 0.5,
      similarity_boost: analysis.clarity ?? 0.75,
      style: analysis.style ?? 0,
      use_speaker_boost: analysis.speakerBoost ?? true
    };

    // Adjust based on emotion
    switch (analysis.emotion) {
      case 'reverent':
        settings.stability = 0.7;
        settings.similarity_boost = 0.8;
        break;
      case 'warm':
        settings.stability = 0.5;
        settings.similarity_boost = 0.7;
        break;
      case 'scholarly':
        settings.stability = 0.6;
        settings.similarity_boost = 0.75;
        break;
      case 'inspiring':
        settings.stability = 0.4;
        settings.similarity_boost = 0.8;
        settings.style = 0.3;
        break;
      case 'contemplative':
        settings.stability = 0.7;
        settings.similarity_boost = 0.6;
        break;
    }

    return settings;
  }

  /**
   * Add a term to the pronunciation dictionary
   */
  addPronunciation(term, pronunciation) {
    this.pronunciationDictionary[term] = pronunciation;
  }

  /**
   * Get pronunciation for a term
   */
  getPronunciation(term) {
    return this.pronunciationDictionary[term] || null;
  }

  /**
   * List all available voices from ElevenLabs
   */
  async getAvailableVoices() {
    if (!this.elevenLabsApiKey) {
      return { error: 'ElevenLabs API key not configured' };
    }

    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': this.elevenLabsApiKey
        }
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const data = await response.json();
      return data.voices.map(v => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        labels: v.labels
      }));

    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to fetch voices');
      return { error: error.message };
    }
  }

  /**
   * Estimate audio duration for text
   */
  estimateDuration(text) {
    // Average speaking rate: ~150 words per minute
    const wordCount = text.split(/\s+/).length;
    const minutes = wordCount / 150;
    return {
      wordCount,
      estimatedSeconds: Math.round(minutes * 60),
      estimatedMinutes: Math.round(minutes * 10) / 10
    };
  }
}

export default NarratorAgent;
