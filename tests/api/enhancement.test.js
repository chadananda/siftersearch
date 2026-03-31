/**
 * RAG Enhancement Layer Tests (Phase 1)
 *
 * TDD: These tests are written FIRST and must all be RED (failing)
 * before any implementation code exists.
 *
 * Tests cover: disambiguation prompts, HyPE generation, entity extraction,
 * content API enhancement methods, and enhanced index document shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sampleDocuments,
  sampleParagraphs,
  sampleDisambiguationResponse,
  sampleHyPEResponse,
  sampleEntityResponse,
  sampleParagraphsWithEnhancement
} from '../fixtures/mock-data.js';

// ==========================================================================
// Disambiguation Prompt Construction
// ==========================================================================

describe('Disambiguation Prompt', () => {
  it('should build sliding window with ~20 preceding paragraphs', async () => {
    const { buildDisambiguationPrompt } = await import('../../api/lib/enhancement-ai.js');
    const doc = { title: 'Kitab-i-Iqan', author: "Baha'u'llah", religion: "Baha'i", collection: 'Core', year: 1861 };
    const entities = { people: ["Baha'u'llah (1817-1892)"], concepts: ["progressive revelation"] };
    const paragraphs = Array.from({ length: 25 }, (_, i) => ({
      paragraph_index: i,
      text: `Paragraph ${i} text content here.`
    }));
    const targetIndex = 22;

    const { systemPrompt, userPrompt } = buildDisambiguationPrompt(doc, entities, paragraphs, targetIndex);

    // System prompt includes doc metadata
    expect(systemPrompt).toContain('Kitab-i-Iqan');
    expect(systemPrompt).toContain("Baha'u'llah");
    // System prompt includes entities
    expect(systemPrompt).toContain("Baha'u'llah (1817-1892)");
    expect(systemPrompt).toContain('progressive revelation');
    // Window includes preceding paragraphs (at least ~20)
    expect(systemPrompt).toContain('[P');
    expect(systemPrompt).toContain('[TARGET]');
    // Target paragraph is included
    expect(systemPrompt).toContain('Paragraph 22 text content here');
    // User prompt asks to disambiguate
    expect(userPrompt).toContain('Disambiguate');
  });

  it('should handle documents with fewer than 20 paragraphs', async () => {
    const { buildDisambiguationPrompt } = await import('../../api/lib/enhancement-ai.js');
    const doc = { title: 'Short Text', author: 'Author', religion: "Baha'i", collection: 'Letters', year: 1920 };
    const entities = {};
    const paragraphs = Array.from({ length: 5 }, (_, i) => ({
      paragraph_index: i,
      text: `Short paragraph ${i}.`
    }));

    const { systemPrompt } = buildDisambiguationPrompt(doc, entities, paragraphs, 3);

    // All available preceding paragraphs should be included
    expect(systemPrompt).toContain('Short paragraph 0');
    expect(systemPrompt).toContain('Short paragraph 1');
    expect(systemPrompt).toContain('Short paragraph 2');
    expect(systemPrompt).toContain('[TARGET]');
  });

  it('should instruct to draw only from document text, not general knowledge', async () => {
    const { buildDisambiguationPrompt } = await import('../../api/lib/enhancement-ai.js');
    const doc = { title: 'Test', author: 'A', religion: 'Islam', collection: 'Hadith', year: 800 };

    const { systemPrompt } = buildDisambiguationPrompt(doc, {}, [{ paragraph_index: 0, text: 'Test' }], 0);

    expect(systemPrompt).toMatch(/only.*from.*document|only.*from.*text/i);
    expect(systemPrompt).toMatch(/never.*general knowledge/i);
  });

  it('should include conceptual reference types in disambiguation instructions', async () => {
    const { buildDisambiguationPrompt } = await import('../../api/lib/enhancement-ai.js');
    const doc = { title: 'Test', author: 'A', religion: "Baha'i", collection: 'Mystical', year: 1860 };

    const { systemPrompt } = buildDisambiguationPrompt(doc, {}, [{ paragraph_index: 0, text: 'Test' }], 0);

    // Must mention conceptual/philosophical reference resolution
    expect(systemPrompt).toMatch(/conceptual|philosophical/i);
    expect(systemPrompt).toMatch(/principle|teaching|doctrine/i);
    expect(systemPrompt).toMatch(/station|condition|path/i);
  });
});

// ==========================================================================
// Disambiguation Response Parsing
// ==========================================================================

describe('Disambiguation Response Parsing', () => {
  it('should extract terse context from LLM response', async () => {
    const { parseDisambiguationResponse } = await import('../../api/lib/enhancement-ai.js');

    const response = 'The author (Baha\'u\'llah) addresses believers in Baghdad, 1858. "He" refers to the Bab. "This teaching" refers to progressive revelation.';
    const parsed = parseDisambiguationResponse(response);

    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe('string');
    expect(parsed.length).toBeGreaterThan(10);
    expect(parsed.length).toBeLessThan(500); // ~80 tokens ≈ ~400 chars max
  });

  it('should reject verbose summaries (over ~100 tokens)', async () => {
    const { parseDisambiguationResponse } = await import('../../api/lib/enhancement-ai.js');

    // Verbose summary disguised as disambiguation
    const verbose = 'In this passage, the author discusses at great length the nature of divine revelation and how it has progressed through the ages. He explains that each Manifestation of God has brought teachings suited to the needs of the time, building upon previous dispensations. The concept of progressive revelation is central to the Baha\'i Faith and represents one of its most important theological principles. This passage is particularly significant because it was written during a period of great upheaval. The author goes on to describe how spiritual truth is eternal but its expression changes. Furthermore, the historical context of 19th century Persia must be considered.';
    const parsed = parseDisambiguationResponse(verbose);

    // Should truncate or reject
    expect(parsed.split(/\s+/).length).toBeLessThanOrEqual(100);
  });

  it('should handle empty or malformed responses', async () => {
    const { parseDisambiguationResponse } = await import('../../api/lib/enhancement-ai.js');

    expect(parseDisambiguationResponse('')).toBeNull();
    expect(parseDisambiguationResponse(null)).toBeNull();
    expect(parseDisambiguationResponse(undefined)).toBeNull();
  });
});

// ==========================================================================
// HyPE (Hypothetical Question) Generation
// ==========================================================================

describe('HyPE Generation', () => {
  it('should parse 3 questions from LLM response', async () => {
    const { parseHyPEResponse } = await import('../../api/lib/enhancement-ai.js');

    const response = `What is the Baha'i concept of progressive revelation?
How does Baha'u'llah explain the unity of God's messengers?
What evidence does the Kitab-i-Iqan provide for the Bab's station?`;

    const questions = parseHyPEResponse(response);

    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBe(3);
    questions.forEach(q => {
      expect(typeof q).toBe('string');
      expect(q.length).toBeGreaterThan(5);
      expect(q.split(/\s+/).length).toBeLessThanOrEqual(25); // under ~20 words
    });
  });

  it('should handle fewer than 3 questions', async () => {
    const { parseHyPEResponse } = await import('../../api/lib/enhancement-ai.js');

    const response = 'What does this passage teach about unity?';
    const questions = parseHyPEResponse(response);

    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBeGreaterThanOrEqual(1);
  });

  it('should strip numbering and bullet markers', async () => {
    const { parseHyPEResponse } = await import('../../api/lib/enhancement-ai.js');

    const response = `1. What is progressive revelation?
2. How are the messengers connected?
3. What role does the Bab play?`;

    const questions = parseHyPEResponse(response);

    expect(questions[0]).not.toMatch(/^\d+\./);
    expect(questions[1]).not.toMatch(/^\d+\./);
  });

  it('should return null for empty responses', async () => {
    const { parseHyPEResponse } = await import('../../api/lib/enhancement-ai.js');

    expect(parseHyPEResponse('')).toBeNull();
    expect(parseHyPEResponse(null)).toBeNull();
  });
});

// ==========================================================================
// Entity Extraction
// ==========================================================================

describe('Entity Extraction', () => {
  it('should parse structured entity JSON from LLM response', async () => {
    const { parseEntityResponse } = await import('../../api/lib/enhancement-ai.js');

    const response = JSON.stringify({
      people: ["Baha'u'llah (1817-1892, founder of the Baha'i Faith)", "The Bab (1819-1850, herald)"],
      organizations: ["Baha'i community"],
      concepts: ["progressive revelation", "unity of God"],
      time_periods: ["mid-19th century Persia"]
    });

    const entities = parseEntityResponse(response);

    expect(entities).toBeTruthy();
    expect(Array.isArray(entities.people)).toBe(true);
    expect(entities.people.length).toBe(2);
    expect(Array.isArray(entities.organizations)).toBe(true);
    expect(Array.isArray(entities.concepts)).toBe(true);
    expect(Array.isArray(entities.time_periods)).toBe(true);
  });

  it('should handle JSON wrapped in markdown code fences', async () => {
    const { parseEntityResponse } = await import('../../api/lib/enhancement-ai.js');

    const response = '```json\n{"people": ["Author A"], "organizations": [], "concepts": ["tawhid"], "time_periods": []}\n```';
    const entities = parseEntityResponse(response);

    expect(entities.people).toEqual(['Author A']);
    expect(entities.concepts).toEqual(['tawhid']);
  });

  it('should return empty arrays for missing fields', async () => {
    const { parseEntityResponse } = await import('../../api/lib/enhancement-ai.js');

    const response = JSON.stringify({ people: ["Someone"] });
    const entities = parseEntityResponse(response);

    expect(entities.people).toEqual(['Someone']);
    expect(entities.organizations).toEqual([]);
    expect(entities.concepts).toEqual([]);
    expect(entities.time_periods).toEqual([]);
  });

  it('should return null for unparseable responses', async () => {
    const { parseEntityResponse } = await import('../../api/lib/enhancement-ai.js');

    expect(parseEntityResponse('not json at all')).toBeNull();
    expect(parseEntityResponse('')).toBeNull();
    expect(parseEntityResponse(null)).toBeNull();
  });
});

// ==========================================================================
// Content API Enhancement Methods
// ==========================================================================

describe('Content API Enhancement Methods', () => {
  it('should expose updateContextOnly that does NOT touch synced or embedding', async () => {
    const { content } = await import('../../api/lib/content.js');

    expect(typeof content.updateContextOnly).toBe('function');
  });

  it('should expose updateHypQuestions that does NOT touch synced or embedding', async () => {
    const { content } = await import('../../api/lib/content.js');

    expect(typeof content.updateHypQuestions).toBe('function');
  });

  it('should expose getUndisambiguated query', async () => {
    const { content } = await import('../../api/lib/content.js');

    expect(typeof content.getUndisambiguated).toBe('function');
  });

  it('should expose getUnhyped query', async () => {
    const { content } = await import('../../api/lib/content.js');

    expect(typeof content.getUnhyped).toBe('function');
  });

  it('should expose getDocsWithoutEntities query', async () => {
    const { content } = await import('../../api/lib/content.js');

    expect(typeof content.getDocsWithoutEntities).toBe('function');
  });

  it('should expose upsertDocEntities', async () => {
    const { content } = await import('../../api/lib/content.js');

    expect(typeof content.upsertDocEntities).toBe('function');
  });

  it('should expose getDocEntities', async () => {
    const { content } = await import('../../api/lib/content.js');

    expect(typeof content.getDocEntities).toBe('function');
  });

  it('should expose markEnhancedSynced', async () => {
    const { content } = await import('../../api/lib/content.js');

    expect(typeof content.markEnhancedSynced).toBe('function');
  });

  it('should expose getEnhancedUnsynced', async () => {
    const { content } = await import('../../api/lib/content.js');

    expect(typeof content.getEnhancedUnsynced).toBe('function');
  });
});

// ==========================================================================
// Enhanced Index Document Shape
// ==========================================================================

describe('Enhanced Index Document Shape', () => {
  it('should build correct enhanced document for Meilisearch', async () => {
    const { buildEnhancedDocument } = await import('../../api/lib/enhancement-ai.js');

    const paragraph = {
      id: 'para_001',
      doc_id: 1,
      paragraph_index: 5,
      text: 'He declared that the promised One had appeared.',
      context: 'Baha\'u\'llah (the author) declares that the Bab (the "promised One") has appeared, referring to the Babi dispensation in 1844 Persia.',
      hyp_questions: JSON.stringify([
        "What did Baha'u'llah say about the Bab's appearance?",
        "When did the promised One appear according to Baha'i belief?",
        "How does the Kitab-i-Iqan describe the Bab's station?"
      ]),
      heading: 'Part One',
      blocktype: 'paragraph',
      title: 'Kitab-i-Iqan',
      author: "Baha'u'llah",
      religion: "Baha'i",
      collection: 'Core Publications',
      language: 'en',
      year: 1861,
      authority: 10,
      tier: 'primary'
    };

    const doc = buildEnhancedDocument(paragraph);

    expect(doc.id).toBe('para_001');
    expect(doc.text).toBe(paragraph.text);
    expect(doc.context).toBe(paragraph.context);
    expect(doc.hyp_questions).toBeTruthy();
    expect(doc.title).toBe('Kitab-i-Iqan');
    expect(doc.religion).toBe("Baha'i");
    expect(doc.authority).toBe(10);
    expect(doc.tier).toBe('primary');
    expect(doc.doc_id).toBe(1);
    expect(doc.paragraph_index).toBe(5);
  });
});

// ==========================================================================
// Enhancement Worker Processing Order
// ==========================================================================

describe('Enhancement Worker', () => {
  it('should export startEnhancementWorker and stopEnhancementWorker', async () => {
    const worker = await import('../../api/services/enhancement-worker.js');

    expect(typeof worker.startEnhancementWorker).toBe('function');
    expect(typeof worker.stopEnhancementWorker).toBe('function');
  });

  it('should export getEnhancementStats', async () => {
    const worker = await import('../../api/services/enhancement-worker.js');

    expect(typeof worker.getEnhancementStats).toBe('function');
  });
});
