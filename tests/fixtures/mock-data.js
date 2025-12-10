/**
 * Mock Data Fixtures for Testing
 *
 * Contains realistic test data for the SifterSearch system including:
 * - English and Arabic content from Bahá'í texts
 * - Sample documents with frontmatter
 * - Translation pairs for inline translation testing
 * - User tiers and permissions
 */

// ============================================================================
// ARABIC-ENGLISH TRANSLATION PAIRS (from Prayers and Meditations)
// ============================================================================

export const translationPairs = {
  // Prayer I - Short excerpts for unit tests
  prayerI: {
    arabic: 'سُبْحانَكَ يا إِلهي يَشْهَدُ كُلُّ ذِي بَصَرٍ بِسَلْطَنَتِكَ وَاقْتِدَارِكَ وَكُلُّ ذِي نَظَرٍ بِعَظَمَتِكَ وَاجْتِبارِكَ',
    english: 'Glorified art Thou, O Lord my God! Every man of insight confesseth Thy sovereignty and Thy dominion, and every discerning eye perceiveth the greatness of Thy majesty and the compelling power of Thy might.',
    translator: 'Shoghi Effendi'
  },
  // Key phrases for testing alignment
  phrases: [
    {
      arabic: 'سُبْحانَكَ يا إِلهي',
      english: 'Glorified art Thou, O Lord my God!'
    },
    {
      arabic: 'أَسْئَلُكَ',
      english: 'I beseech Thee'
    },
    {
      arabic: 'بِأَنْ تَحْفَظَهُمْ',
      english: 'to keep them safe'
    },
    {
      arabic: 'لا خَوْفٌ عَلَيْهِمْ وَلا هُمْ يَحْزَنُونَ',
      english: 'on whom shall come no fear and who shall not be put to grief'
    }
  ]
};

// ============================================================================
// SAMPLE DOCUMENTS
// ============================================================================

export const sampleDocuments = {
  // English Bahá'í document
  englishBahai: {
    id: 'doc_bahai_en_001',
    title: 'Prayers and Meditations',
    author: "Bahá'u'lláh",
    religion: "Bahá'í",
    collection: 'Prayers',
    language: 'en',
    year: 1938,
    chunk_count: 3,
    description: 'Translated by Shoghi Effendi'
  },

  // Arabic Bahá'í document
  arabicBahai: {
    id: 'doc_bahai_ar_001',
    title: 'مناجات',
    author: 'حضرة بهاءالله',
    religion: "Bahá'í",
    collection: 'Prayers',
    language: 'ar',
    year: 1858,
    chunk_count: 3,
    description: 'Original Arabic prayers'
  },

  // Buddhist text
  buddhist: {
    id: 'doc_buddhism_001',
    title: 'The Dhammapada',
    author: 'Traditional',
    religion: 'Buddhism',
    collection: 'Sutras',
    language: 'en',
    year: null,
    chunk_count: 5,
    description: 'Sayings of the Buddha'
  },

  // Islamic text
  islamic: {
    id: 'doc_islam_001',
    title: 'Nahj al-Balagha',
    author: 'Imam Ali',
    religion: 'Islam',
    collection: 'Sermons',
    language: 'ar',
    year: 661,
    chunk_count: 10,
    description: 'Peak of Eloquence'
  }
};

// ============================================================================
// SAMPLE PARAGRAPHS (with vectors placeholder)
// ============================================================================

export const sampleParagraphs = {
  englishBahai: [
    {
      id: 'doc_bahai_en_001_p0',
      document_id: 'doc_bahai_en_001',
      paragraph_index: 0,
      text: 'Glorified art Thou, O Lord my God! Every man of insight confesseth Thy sovereignty and Thy dominion, and every discerning eye perceiveth the greatness of Thy majesty and the compelling power of Thy might. The winds of tests are powerless to hold back them that enjoy near access to Thee from setting their faces towards the horizon of Thy glory.',
      heading: 'Prayer I',
      title: 'Prayers and Meditations',
      author: "Bahá'u'lláh",
      religion: "Bahá'í",
      collection: 'Prayers',
      language: 'en',
      year: 1938,
      _vectors: { default: new Array(3072).fill(0.1) } // Placeholder
    },
    {
      id: 'doc_bahai_en_001_p1',
      document_id: 'doc_bahai_en_001',
      paragraph_index: 1,
      text: 'I beseech Thee, O my God, by them and by the sighs which their hearts utter in their separation from Thee, to keep them safe from the mischief of Thine adversaries, and to nourish their souls with what Thou hast ordained for Thy loved ones on whom shall come no fear and who shall not be put to grief.',
      heading: 'Prayer I',
      title: 'Prayers and Meditations',
      author: "Bahá'u'lláh",
      religion: "Bahá'í",
      collection: 'Prayers',
      language: 'en',
      year: 1938,
      _vectors: { default: new Array(3072).fill(0.2) }
    }
  ],

  arabicBahai: [
    {
      id: 'doc_bahai_ar_001_p0',
      document_id: 'doc_bahai_ar_001',
      paragraph_index: 0,
      text: 'سُبْحانَكَ يا إِلهي يَشْهَدُ كُلُّ ذِي بَصَرٍ بِسَلْطَنَتِكَ وَاقْتِدَارِكَ وَكُلُّ ذِي نَظَرٍ بِعَظَمَتِكَ وَاجْتِبارِكَ؛ لا تَمْنَعُ الْمُقَرَّبينَ أَرْياحُ الافْتِتانِ عَنِ التَّوَجُّهِ إِلى أُفُقِ عِزِّكَ.',
      heading: 'مناجات ١',
      title: 'مناجات',
      author: 'حضرة بهاءالله',
      religion: "Bahá'í",
      collection: 'Prayers',
      language: 'ar',
      year: 1858,
      _vectors: { default: new Array(3072).fill(0.3) }
    },
    {
      id: 'doc_bahai_ar_001_p1',
      document_id: 'doc_bahai_ar_001',
      paragraph_index: 1,
      text: 'أَسْئَلُكَ يا إِلهِي بِهِمْ وَبِالزَّفَراتِ الَّتِيْ تَخْرُجُ مِنْ قُلُوبِهِمْ فِيْ فِراقِكَ، بِأَنْ تَحْفَظَهُمْ مِنْ شَرِّ أَعْدائِكَ، وَتَرْزُقَهُمْ ما قَدَّرْتَه لأَوْلِيائِكَ الَّذِينَ لا خَوْفٌ عَلَيْهِمْ وَلا هُمْ يَحْزَنُونَ.',
      heading: 'مناجات ١',
      title: 'مناجات',
      author: 'حضرة بهاءالله',
      religion: "Bahá'í",
      collection: 'Prayers',
      language: 'ar',
      year: 1858,
      _vectors: { default: new Array(3072).fill(0.4) }
    }
  ],

  buddhist: [
    {
      id: 'doc_buddhism_001_p0',
      document_id: 'doc_buddhism_001',
      paragraph_index: 0,
      text: 'Mind is the forerunner of all actions. All deeds are led by mind, created by mind. If one speaks or acts with a corrupt mind, suffering follows, as the wheel follows the hoof of an ox pulling a cart.',
      heading: 'Twin Verses',
      title: 'The Dhammapada',
      author: 'Traditional',
      religion: 'Buddhism',
      collection: 'Sutras',
      language: 'en',
      year: null,
      _vectors: { default: new Array(3072).fill(0.5) }
    }
  ]
};

// ============================================================================
// MARKDOWN DOCUMENTS FOR PARSING TESTS
// ============================================================================

export const markdownDocuments = {
  withFrontmatter: `---
title: Prayers and Meditations
author: Bahá'u'lláh
religion: Bahá'í
collection: Prayers
language: en
year: 1938
---

# Prayer I

Glorified art Thou, O Lord my God! Every man of insight confesseth Thy sovereignty and Thy dominion, and every discerning eye perceiveth the greatness of Thy majesty and the compelling power of Thy might.

The winds of tests are powerless to hold back them that enjoy near access to Thee from setting their faces towards the horizon of Thy glory, and the tempests of trials must fail to draw away and hinder such as are wholly devoted to Thy will from approaching Thy court.

# Prayer II

Unto Thee be praise, O Lord my God! I entreat Thee, by Thy signs that have encompassed the entire creation, and by the light of Thy countenance that hath illuminated all that are in heaven and on earth.`,

  withArabic: `---
title: مناجات
author: حضرة بهاءالله
religion: Bahá'í
language: ar
---

# مناجات الأولى

سُبْحانَكَ يا إِلهي يَشْهَدُ كُلُّ ذِي بَصَرٍ بِسَلْطَنَتِكَ وَاقْتِدَارِكَ وَكُلُّ ذِي نَظَرٍ بِعَظَمَتِكَ وَاجْتِبارِكَ؛ لا تَمْنَعُ الْمُقَرَّبينَ أَرْياحُ الافْتِتانِ عَنِ التَّوَجُّهِ إِلى أُفُقِ عِزِّكَ.

وَلا تَطْرُدُ المُخْلِصِينَ عَواصِفُ الامْتِحانِ عَنِ التَّقَرُّبِ إِلَيْكَ، كأَنَّ فِي قُلُوبِهِمْ أَضاءَ سِرَاجُ حُبِّكَ وَمِصْباحُ وُدِّكَ.`,

  noFrontmatter: `This is a plain text document without any YAML frontmatter.

It contains multiple paragraphs of content that should be parsed and indexed
without any metadata extraction from the content itself.

The parser should handle this gracefully and return empty metadata.`
};

// ============================================================================
// SEARCH TEST QUERIES
// ============================================================================

export const searchQueries = {
  // Keywords that should match specific documents
  byKeyword: [
    { query: 'sovereignty', expectedReligion: "Bahá'í", expectedLanguage: 'en' },
    { query: 'سُبْحانَكَ', expectedReligion: "Bahá'í", expectedLanguage: 'ar' },
    { query: 'mind forerunner', expectedReligion: 'Buddhism', expectedLanguage: 'en' },
    { query: 'unity divine', expectedReligion: "Bahá'í", expectedLanguage: 'en' }
  ],

  // Semantic search concepts
  byConcept: [
    { query: 'prayer to God', expectedCollection: 'Prayers' },
    { query: 'tests and trials', expectedReligion: "Bahá'í" },
    { query: 'mindfulness meditation', expectedReligion: 'Buddhism' }
  ],

  // Filter combinations
  withFilters: [
    { query: 'glory', filters: { religion: "Bahá'í" }, expectedCount: 2 },
    { query: 'praise', filters: { language: 'en' }, expectedCount: 1 },
    { query: '', filters: { religion: 'Buddhism' }, expectedCount: 1 }
  ]
};

// ============================================================================
// USER FIXTURES
// ============================================================================

export const testUsers = {
  admin: {
    id: 1,
    email: 'admin@siftersearch.com',
    name: 'Admin User',
    tier: 'admin',
    preferred_language: 'en'
  },
  patron: {
    id: 2,
    email: 'patron@example.com',
    name: 'Patron User',
    tier: 'patron',
    preferred_language: 'en'
  },
  approved: {
    id: 3,
    email: 'approved@example.com',
    name: 'Approved User',
    tier: 'approved',
    preferred_language: 'ar'
  },
  verified: {
    id: 4,
    email: 'verified@example.com',
    name: 'Verified User',
    tier: 'verified',
    preferred_language: 'en'
  }
};

// ============================================================================
// EMBEDDING MOCK (for testing without API calls)
// ============================================================================

export function createMockEmbedding(text, dimensions = 3072) {
  // Create deterministic pseudo-random embedding based on text content
  // This ensures same text = same embedding for consistent tests
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  const embedding = new Array(dimensions);
  let seed = Math.abs(hash);

  for (let i = 0; i < dimensions; i++) {
    // Simple LCG pseudo-random generator
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    // Normalize to [-1, 1] range typical for embeddings
    embedding[i] = (seed / 0x7fffffff) * 2 - 1;
  }

  return embedding;
}

// ============================================================================
// MEILISEARCH MOCK RESPONSES
// ============================================================================

export const mockMeiliResponses = {
  searchEmpty: {
    hits: [],
    query: '',
    processingTimeMs: 1,
    estimatedTotalHits: 0,
    limit: 20,
    offset: 0
  },

  searchWithHits: (hits) => ({
    hits,
    query: 'test query',
    processingTimeMs: 5,
    estimatedTotalHits: hits.length,
    limit: 20,
    offset: 0
  }),

  indexStats: {
    numberOfDocuments: 100,
    isIndexing: false
  },

  health: {
    status: 'available'
  },

  tasks: {
    results: [],
    limit: 20,
    from: 0,
    next: null
  }
};

// ============================================================================
// INLINE TRANSLATION TABLE FORMAT
// ============================================================================

export const inlineTranslationTable = {
  documentId: 'doc_bahai_ar_001',
  sourceLanguage: 'ar',
  targetLanguage: 'en',
  segments: [
    {
      index: 0,
      source: 'سُبْحانَكَ يا إِلهي',
      target: 'Glorified art Thou, O Lord my God!',
      notes: 'Opening invocation'
    },
    {
      index: 1,
      source: 'يَشْهَدُ كُلُّ ذِي بَصَرٍ',
      target: 'Every man of insight confesseth',
      notes: 'Testimony clause'
    },
    {
      index: 2,
      source: 'بِسَلْطَنَتِكَ وَاقْتِدَارِكَ',
      target: 'Thy sovereignty and Thy dominion',
      notes: 'Divine attributes'
    }
  ],
  metadata: {
    translator: 'Shoghi Effendi',
    quality: 'high',
    createdAt: '2024-01-01T00:00:00Z'
  }
};

// ============================================================================
// EXPORT HELPER
// ============================================================================

export function getAllParagraphs() {
  return [
    ...sampleParagraphs.englishBahai,
    ...sampleParagraphs.arabicBahai,
    ...sampleParagraphs.buddhist
  ];
}

export function getAllDocuments() {
  return Object.values(sampleDocuments);
}

export default {
  translationPairs,
  sampleDocuments,
  sampleParagraphs,
  markdownDocuments,
  searchQueries,
  testUsers,
  createMockEmbedding,
  mockMeiliResponses,
  inlineTranslationTable,
  getAllParagraphs,
  getAllDocuments
};
