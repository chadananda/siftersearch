import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Load agent docs directly from docs/agents/ - single source of truth
const agents = defineCollection({
  loader: glob({ pattern: 'agent-*.md', base: './docs/agents' }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    role: z.string().optional(),
    icon: z.string().optional(),
    image: z.string().optional(),
    order: z.number().optional().default(99),
  }),
});

// Separate collection for index pages (README.md files)
const docsIndex = defineCollection({
  loader: glob({ pattern: 'README.md', base: './docs/agents' }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }),
});

// Public Dialogs — long-form multi-round conversations exploring deep
// questions in Bahá'í teachings, comparative theology, and philosophy.
// Each lives in src/content/dialogs/{slug}.md with full SEO frontmatter,
// quality score, topic + tags, hero + decorative imagery.
const dialogs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/dialogs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),  // SEO meta + listing summary
    question: z.string(),     // the seed question, displayed as hero text
    topic: z.enum([
      'theology',
      'ethics',
      'social-order',
      'politics',
      'history',
      'comparative-religion',
      'mysticism',
      'practice',
      'modern-challenges',
      'word-meaning',
      'metaphysics',
      'philosophy'
    ]),
    tags: z.array(z.string()).default([]),
    rounds: z.number().int().min(1),
    qualityScore: z.number().min(0).max(100).optional(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    heroImage: z.string().optional(),       // /images/dialog/{slug}-hero.jpg
    heroPrompt: z.string().optional(),      // generation prompt for hero
    decorativePrompts: z.array(z.string()).default([]),  // for inline imagery
    excerpt: z.string().optional(),         // pull quote for listing card
    featured: z.boolean().default(false),
    // Publish gate. Old v1-v3.1 dialogs default to false (hidden from index)
    // until they're regenerated under v4 with proper assessment + SEO.
    published: z.boolean().default(false),
    // SEO-tuned keyword set (distinct from `tags` which are taxonomy).
    keywords: z.array(z.string()).default([]),
    // Beta: visible per-article assessment.
    assessment: z.object({
      scores: z.record(z.string(), z.number()),
      narrative: z.string(),                  // 3-5 sentence critique
      flags: z.array(z.string()).default([]), // failure-mode tags
      improvement_plan: z.string(),           // forward-looking, in concepts
    }).optional(),
  }),
});

export const collections = { agents, docsIndex, dialogs };
