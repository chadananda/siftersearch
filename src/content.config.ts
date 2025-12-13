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

export const collections = { agents, docsIndex };
