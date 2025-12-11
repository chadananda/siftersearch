# Translator Agent

**Role:** Shoghi Effendi Style Specialist
**File:** `api/agents/agent-translator.js`

## Overview

The Translator agent renders text in the distinctive English prose style of Shoghi Effendi, Guardian of the Baha'i Faith (1897-1957).

## Style Characteristics

### Vocabulary
Elevated, Victorian-era words:
- "vouchsafe" (grant), "beseech" (earnestly ask), "verily" (truly)
- "hath", "doth", "thee", "thou", "thy", "thine"
- "manifest", "effulgent", "resplendent", "celestial"

### Syntax
Formal, inverted sentence structures:
- "Great is the blessedness of him who..."
- "Blessed is he that hath..."
- "By the righteousness of God!"

### Imagery
Rich spiritual metaphors:
- Light/darkness, sun/dawn
- Ocean/waves/drops
- Gardens/flowers/breezes
- Fire/flame/spark

### Rhythm
Poetic cadence with balanced phrases, parallel constructions, and repetition for emphasis.

## Methods

### `translate(text, options)`
Main translation method.

```javascript
const result = await translator.translate(
  "God loves you and created you to know Him",
  { sourceLanguage: 'en', preserveStructure: true }
);
```

Returns:
```javascript
{
  original: "God loves you...",
  translation: "Veiled in My immemorial being...",
  style: "shoghi-effendi",
  sourceLanguage: "en"
}
```

### `translateWithComparison(text, options)`
Translates and explains stylistic changes.

```javascript
const result = await translator.translateWithComparison(text);
// Returns translation + stylistic_notes array
```

### `translatePrayer(text, options)`
Specialized translation for prayers and devotional texts.

Features:
- Reverent Divine address (Thee, Thou, Thy)
- Supplicatory language (I beseech Thee)
- Closing invocations (verily Thou art)
- Rhythm suitable for recitation

### `analyzeStyle(text)`
Checks if text already appears to be in Shoghi Effendi's style.

```javascript
const analysis = await translator.analyzeStyle(text);
// { isAlreadyStyled: true, confidence: 0.4, markersFound: ["hath", "thee"] }
```

### `suggestVocabulary(word)`
Returns Shoghi Effendi-style equivalent for common words.

## Style Examples

**Original:** "God's light has appeared and illuminated the whole world"

**Translated:** "The light of Divine Revelation hath been vouchsafed unto men, and the whole earth is aglow with its effulgent splendor."

## Configuration

```javascript
const translator = new TranslatorAgent({
  model: 'gpt-4o',
  temperature: 0.6,    // Moderate for creative yet consistent style
  maxTokens: 2000
});
```
