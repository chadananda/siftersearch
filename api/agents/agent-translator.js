/**
 * Translator Agent - Shoghi Effendi Style Specialist
 *
 * The Translator agent renders text in the distinctive translation style
 * of Shoghi Effendi, the Guardian of the Baha'i Faith. His translations
 * are known for:
 * - Elevated, dignified English prose
 * - Victorian-era vocabulary and syntax
 * - Poetic rhythm and cadence
 * - Preservation of spiritual majesty
 */

import { BaseAgent } from './base-agent.js';

// Examples of Shoghi Effendi's distinctive translation style
const STYLE_EXAMPLES = `
EXAMPLE 1 - From "Gleanings from the Writings of Baha'u'llah":
Original concept: "God's light has appeared and illuminated the whole world"
Shoghi Effendi style: "The light of Divine Revelation hath been vouchsafed unto men, and the whole earth is aglow with its effulgent splendor."

EXAMPLE 2 - From "The Hidden Words":
Original concept: "Before you were created, I loved you"
Shoghi Effendi style: "O Son of Man! Veiled in My immemorial being and in the ancient eternity of My essence, I knew My love for thee; therefore I created thee, have engraved on thee Mine image and revealed to thee My beauty."

EXAMPLE 3 - From "Prayers and Meditations":
Original concept: "I ask you to help me detach from worldly things"
Shoghi Effendi style: "I beseech Thee, by the splendor of the light of Thy glorious face, the majesty of Thine ancient grandeur, to enable me to achieve detachment from the world and all that is therein."

EXAMPLE 4 - Characteristic phrases:
- "vouchsafe unto" (grant to)
- "hath been made manifest" (has appeared)
- "in this Day" (in this era/time)
- "the company of the faithful" (the believers)
- "that which hath streamed forth" (what has flowed/come)
- "the Day-Star of Truth" (the Sun of Reality/Truth)
- "the Pen of the Most High" (God's revelation)
- "the ocean of divine knowledge" (spiritual wisdom)
- "the breezes of divine revelation" (spiritual influence)
- "the tabernacle of glory" (the place of God's presence)
`;

const TRANSLATOR_SYSTEM_PROMPT = `You are a translation specialist emulating the distinctive English prose style of Shoghi Effendi, Guardian of the Baha'i Faith (1897-1957).

CHARACTERISTICS OF SHOGHI EFFENDI'S STYLE:
1. VOCABULARY: Elevated, Victorian-era words
   - "vouchsafe" (grant), "beseech" (earnestly ask), "verily" (truly)
   - "hath", "doth", "thee", "thou", "thy", "thine"
   - "manifest", "effulgent", "resplendent", "celestial"
   - "ordained", "decreed", "proclaimed"

2. SYNTAX: Formal, inverted sentence structures
   - "Great is the blessedness of him who..."
   - "Blessed is he that hath..."
   - "By the righteousness of God!"
   - "Would that ye might..."

3. IMAGERY: Rich spiritual metaphors
   - Light/darkness, sun/dawn
   - Ocean/waves/drops
   - Gardens/flowers/breezes
   - Fire/flame/spark
   - Throne/dominion/sovereignty

4. RHYTHM: Poetic cadence with balanced phrases
   - Parallel constructions
   - Repetition for emphasis
   - Rising and falling intonation

5. TONE: Majestic yet intimate
   - Addresses the divine with reverence
   - Speaks to humans with compassion
   - Conveys urgency without anxiety

${STYLE_EXAMPLES}

TRANSLATION GUIDELINES:
- Preserve the original meaning precisely
- Elevate the register without changing the message
- Use archaic pronouns (thee/thou) for divine address
- Employ characteristic phrases naturally
- Maintain poetic rhythm
- Do not add content not in the original`;

export class TranslatorAgent extends BaseAgent {
  constructor(options = {}) {
    super('translator', {
      model: options.model || 'gpt-4o',
      temperature: options.temperature ?? 0.6,
      maxTokens: options.maxTokens || 2000,
      systemPrompt: TRANSLATOR_SYSTEM_PROMPT,
      ...options
    });

    // Common vocabulary mappings
    this.vocabularyMap = {
      'give': 'vouchsafe',
      'truly': 'verily',
      'show': 'manifest',
      'bright': 'effulgent',
      'shining': 'resplendent',
      'heavenly': 'celestial',
      'ordered': 'ordained',
      'announced': 'proclaimed',
      'asked': 'besought',
      'servant': 'handmaiden/servant'
    };
  }

  /**
   * Translate text into Shoghi Effendi's style
   */
  async translate(text, options = {}) {
    const { sourceLanguage = 'auto', preserveStructure = true } = options;

    const translatePrompt = `Translate this text into the distinctive English prose style of Shoghi Effendi:

ORIGINAL TEXT:
"${text}"

${sourceLanguage !== 'auto' && sourceLanguage !== 'en'
  ? `Source language: ${sourceLanguage}. First translate to English, then render in Shoghi Effendi's style.`
  : 'The text is in English. Render it in Shoghi Effendi\'s elevated translation style.'}

${preserveStructure ? 'Preserve the original paragraph structure.' : 'You may restructure for better flow.'}

Provide the translation only, without explanation or commentary.`;

    const response = await this.chat([
      { role: 'user', content: translatePrompt }
    ]);

    return {
      original: text,
      translation: response.content.trim(),
      style: 'shoghi-effendi',
      sourceLanguage
    };
  }

  /**
   * Translate with comparison to show the style transformation
   */
  async translateWithComparison(text, options = {}) {
    const prompt = `Transform this text into Shoghi Effendi's translation style, then explain the key stylistic changes.

ORIGINAL:
"${text}"

Return JSON only:
{
  "translation": "the transformed text",
  "stylistic_notes": [
    "Note about vocabulary changes",
    "Note about syntax changes",
    "Note about imagery used"
  ]
}`;

    const response = await this.chat([
      { role: 'user', content: prompt }
    ], { temperature: 0.5 });

    try {
      const result = this.parseJSON(response.content);
      return {
        original: text,
        translation: result.translation,
        notes: result.stylistic_notes || [],
        style: 'shoghi-effendi'
      };
    } catch {
      // Fallback: just return the translation
      return this.translate(text, options);
    }
  }

  /**
   * Translate a prayer or devotional text
   */
  async translatePrayer(text, _options = {}) {
    const prayerPrompt = `Transform this prayer or devotional text into Shoghi Effendi's distinctive style for sacred writings.

Pay special attention to:
- Reverent address to the Divine (Thee, Thou, Thy)
- Supplicatory language (I beseech Thee, I implore Thee)
- Closing invocations (verily Thou art, in truth Thou art)
- Rhythm suitable for recitation

ORIGINAL PRAYER:
"${text}"

Provide the transformed prayer only.`;

    const response = await this.chat([
      { role: 'user', content: prayerPrompt }
    ], { temperature: 0.5 });

    return {
      original: text,
      translation: response.content.trim(),
      style: 'shoghi-effendi',
      type: 'prayer'
    };
  }

  /**
   * Check if text already appears to be in Shoghi Effendi's style
   */
  async analyzeStyle(text) {
    const markers = [
      'hath', 'doth', 'thee', 'thou', 'thy', 'thine',
      'vouchsafe', 'beseech', 'verily', 'effulgent',
      'manifest', 'ordained', 'celestial'
    ];

    const textLower = text.toLowerCase();
    const foundMarkers = markers.filter(m => textLower.includes(m));
    const markerScore = foundMarkers.length / markers.length;

    return {
      isAlreadyStyled: markerScore > 0.2,
      confidence: markerScore,
      markersFound: foundMarkers,
      recommendation: markerScore > 0.2
        ? 'Text appears to already be in an elevated style.'
        : 'Text can be transformed into Shoghi Effendi\'s style.'
    };
  }

  /**
   * Provide vocabulary suggestions for a word
   */
  suggestVocabulary(word) {
    const lowerWord = word.toLowerCase();
    if (this.vocabularyMap[lowerWord]) {
      return this.vocabularyMap[lowerWord];
    }
    return null;
  }
}

export default TranslatorAgent;
