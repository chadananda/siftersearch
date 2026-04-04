/**
 * 100 Test Scenarios for Jafar Conversation Quality
 *
 * Categories:
 * - factual: Simple fact-finding questions
 * - comparative: Cross-religion comparisons
 * - author: Author/book lookups
 * - topical: Topic-based research
 * - philosophical: Deep questions needing nuanced answers
 * - browsing: Library exploration
 * - reading: Specific document reading
 * - edge: Edge cases, misspellings, vague queries
 * - multi: Multi-part or follow-up style questions
 * - practical: Real-world application questions
 */

export const SCENARIOS = [
  // ── FACTUAL (15) ──────────────────────────────────────────────────────────
  { id: 1, category: 'factual', query: "What does the Quran say about mercy?" },
  { id: 2, category: 'factual', query: "What are the Bahá'í teachings on education?" },
  { id: 3, category: 'factual', query: "What is the Buddhist concept of nirvana?" },
  { id: 4, category: 'factual', query: "What does the Bible say about forgiveness?" },
  { id: 5, category: 'factual', query: "What is the Hindu concept of dharma?" },
  { id: 6, category: 'factual', query: "What are the Five Pillars of Islam?" },
  { id: 7, category: 'factual', query: "What did Bahá'u'lláh teach about the oneness of humanity?" },
  { id: 8, category: 'factual', query: "What is the Eightfold Path in Buddhism?" },
  { id: 9, category: 'factual', query: "What does the Torah say about justice?" },
  { id: 10, category: 'factual', query: "What are the Zoroastrian teachings on good and evil?" },
  { id: 11, category: 'factual', query: "What is the Sikh concept of seva?" },
  { id: 12, category: 'factual', query: "What does the Bhagavad Gita say about duty?" },
  { id: 13, category: 'factual', query: "What is the Bahá'í view on consultation?" },
  { id: 14, category: 'factual', query: "What does the Quran say about patience?" },
  { id: 15, category: 'factual', query: "What is the concept of grace in Christianity?" },

  // ── COMPARATIVE (10) ──────────────────────────────────────────────────────
  { id: 16, category: 'comparative', query: "How do different religions view the afterlife?" },
  { id: 17, category: 'comparative', query: "Compare the Golden Rule across religions" },
  { id: 18, category: 'comparative', query: "What do Islam and Christianity share in common?" },
  { id: 19, category: 'comparative', query: "How do Buddhism and Hinduism differ on the concept of self?" },
  { id: 20, category: 'comparative', query: "What do the Bahá'í Faith and Islam say about fasting?" },
  { id: 21, category: 'comparative', query: "How is prayer described in different traditions?" },
  { id: 22, category: 'comparative', query: "Compare the creation stories across religions in the library" },
  { id: 23, category: 'comparative', query: "What do various religions teach about wealth and poverty?" },
  { id: 24, category: 'comparative', query: "How do different faiths approach the concept of sin?" },
  { id: 25, category: 'comparative', query: "Compare how Judaism and the Bahá'í Faith view prophecy" },

  // ── AUTHOR LOOKUPS (10) ───────────────────────────────────────────────────
  { id: 26, category: 'author', query: "Do you have any books by Udo Schaefer?" },
  { id: 27, category: 'author', query: "What works by 'Abdu'l-Bahá are in the library?" },
  { id: 28, category: 'author', query: "Show me books by Shoghi Effendi" },
  { id: 29, category: 'author', query: "Do you have anything by Rumi?" },
  { id: 30, category: 'author', query: "What books by Moojan Momen do you have?" },
  { id: 31, category: 'author', query: "Do you have works by Thich Nhat Hanh?" },
  { id: 32, category: 'author', query: "Show me everything by Bahá'u'lláh" },
  { id: 33, category: 'author', query: "What do you have by the Universal House of Justice?" },
  { id: 34, category: 'author', query: "Do you have any books by Adib Taherzadeh?" },
  { id: 35, category: 'author', query: "Who wrote the most books in the library?" },

  // ── TOPICAL RESEARCH (15) ─────────────────────────────────────────────────
  { id: 36, category: 'topical', query: "What do the scriptures say about women's equality?" },
  { id: 37, category: 'topical', query: "Find passages about environmental stewardship" },
  { id: 38, category: 'topical', query: "What do religious texts say about science and religion?" },
  { id: 39, category: 'topical', query: "Search for teachings about peace between nations" },
  { id: 40, category: 'topical', query: "What do the texts say about life after death?" },
  { id: 41, category: 'topical', query: "Find passages about the purpose of suffering" },
  { id: 42, category: 'topical', query: "What do scriptures teach about marriage?" },
  { id: 43, category: 'topical', query: "Search for teachings about truthfulness and honesty" },
  { id: 44, category: 'topical', query: "What do the texts say about the soul?" },
  { id: 45, category: 'topical', query: "Find passages about love in the Bahá'í writings" },
  { id: 46, category: 'topical', query: "What do religious texts say about unity?" },
  { id: 47, category: 'topical', query: "Search for teachings about meditation" },
  { id: 48, category: 'topical', query: "What do the scriptures say about humility?" },
  { id: 49, category: 'topical', query: "Find passages about service to others" },
  { id: 50, category: 'topical', query: "What do the texts teach about detachment from material things?" },

  // ── PHILOSOPHICAL (10) ────────────────────────────────────────────────────
  { id: 51, category: 'philosophical', query: "Why does God allow suffering?" },
  { id: 52, category: 'philosophical', query: "Is there free will in religious thought?" },
  { id: 53, category: 'philosophical', query: "What is the meaning of life according to different traditions?" },
  { id: 54, category: 'philosophical', query: "Can science and religion coexist?" },
  { id: 55, category: 'philosophical', query: "What happens after death?" },
  { id: 56, category: 'philosophical', query: "How do religions explain evil?" },
  { id: 57, category: 'philosophical', query: "What is the nature of God?" },
  { id: 58, category: 'philosophical', query: "Do all religions lead to the same truth?" },
  { id: 59, category: 'philosophical', query: "What is the relationship between faith and reason?" },
  { id: 60, category: 'philosophical', query: "How do the mystics describe union with God?" },

  // ── BROWSING / DISCOVERY (10) ─────────────────────────────────────────────
  { id: 61, category: 'browsing', query: "What's in the library?" },
  { id: 62, category: 'browsing', query: "How many Buddhist texts do you have?" },
  { id: 63, category: 'browsing', query: "Show me the Islamic collections" },
  { id: 64, category: 'browsing', query: "What languages are available?" },
  { id: 65, category: 'browsing', query: "List the Bahá'í collections" },
  { id: 66, category: 'browsing', query: "What's the largest collection?" },
  { id: 67, category: 'browsing', query: "Do you have any Jain texts?" },
  { id: 68, category: 'browsing', query: "Show me documents about the Pali Canon" },
  { id: 69, category: 'browsing', query: "What Hindu scriptures do you carry?" },
  { id: 70, category: 'browsing', query: "How many documents are in the library total?" },

  // ── READING REQUESTS (5) ──────────────────────────────────────────────────
  { id: 71, category: 'reading', query: "Read me the opening of the Hidden Words" },
  { id: 72, category: 'reading', query: "Show me the beginning of the Kitáb-i-Íqán" },
  { id: 73, category: 'reading', query: "What does the first chapter of the Quran say?" },
  { id: 74, category: 'reading', query: "Read the opening verses of the Bhagavad Gita" },
  { id: 75, category: 'reading', query: "Show me the first few paragraphs of the Tao Te Ching" },

  // ── EDGE CASES (15) ───────────────────────────────────────────────────────
  { id: 76, category: 'edge', query: "bahaullah" },  // Misspelling
  { id: 77, category: 'edge', query: "Udo Schafer" },  // Common misspelling
  { id: 78, category: 'edge', query: "books" },  // Extremely vague
  { id: 79, category: 'edge', query: "?" },  // Minimal input
  { id: 80, category: 'edge', query: "What about the thing with the stuff?" },  // Vague
  { id: 81, category: 'edge', query: "Tell me everything about Buddhism" },  // Overly broad
  { id: 82, category: 'edge', query: "Kitab-i-Iqan" },  // Transliteration variant
  { id: 83, category: 'edge', query: "aqdas" },  // Short reference
  { id: 84, category: 'edge', query: "七つの谷" },  // Non-English (Seven Valleys in Japanese)
  { id: 85, category: 'edge', query: "hidden words arabic" },  // Ambiguous — Arabic Hidden Words or about Arabic
  { id: 86, category: 'edge', query: "Who was the Bab?" },  // Historical/biographical
  { id: 87, category: 'edge', query: "Is the Bahá'í Faith a cult?" },  // Provocative
  { id: 88, category: 'edge', query: "What's the best religion?" },  // Subjective/loaded
  { id: 89, category: 'edge', query: "Thank you!" },  // Non-question
  { id: 90, category: 'edge', query: "I'm feeling lost and don't know what to believe" },  // Emotional

  // ── MULTI-PART / COMPLEX (10) ─────────────────────────────────────────────
  { id: 91, category: 'multi', query: "What does the Quran say about Jesus, and how does that compare to the Bible?" },
  { id: 92, category: 'multi', query: "List all Bahá'í books by 'Abdu'l-Bahá and tell me which one discusses education" },
  { id: 93, category: 'multi', query: "Find teachings on prayer from three different religions and compare them" },
  { id: 94, category: 'multi', query: "I'm writing a paper on interfaith dialogue. What sources do you recommend?" },
  { id: 95, category: 'multi', query: "What does Bahá'u'lláh say about justice, and where can I read more?" },
  { id: 96, category: 'multi', query: "How many documents by 'Abdu'l-Bahá do you have, and which ones discuss governance?" },
  { id: 97, category: 'multi', query: "What Buddhist texts discuss mindfulness, and can you show me a key passage?" },
  { id: 98, category: 'multi', query: "I'm a Christian interested in what other religions say about the return of Christ" },
  { id: 99, category: 'multi', query: "Search for passages about the covenant in both the Bahá'í Faith and Judaism" },
  { id: 100, category: 'multi', query: "What is progressive revelation, and which texts in the library discuss it?" },
];

// Category distribution summary:
// factual: 15, comparative: 10, author: 10, topical: 15, philosophical: 10
// browsing: 10, reading: 5, edge: 15, multi: 10
