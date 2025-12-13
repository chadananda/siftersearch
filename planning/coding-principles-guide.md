# SifterSearch Coding Principles Guide

## CSS & Styling Architecture

### Color System

Colors follow a three-layer architecture for maintainability and theme support:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: CSS Variables (src/styles/global.css :root)       │
│  ─────────────────────────────────────────────────────────  │
│  Define raw colors with light-dark() for automatic theming  │
│                                                             │
│  --text-primary: light-dark(#0f172a, #f1f5f9);             │
│  --surface-1: light-dark(rgba(248,250,252,0.8), ...);      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Tailwind Tokens (src/styles/global.css @theme)    │
│  ─────────────────────────────────────────────────────────  │
│  Reference CSS vars as Tailwind colors                      │
│                                                             │
│  --color-primary: var(--text-primary);                     │
│  --color-surface-1: var(--surface-1);                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Components (*.svelte, *.astro)                    │
│  ─────────────────────────────────────────────────────────  │
│  Use semantic Tailwind classes only                         │
│                                                             │
│  <div class="bg-surface-1 text-primary border-border">     │
└─────────────────────────────────────────────────────────────┘
```

### Color Token Reference

| Category | Token | Usage |
|----------|-------|-------|
| **Surfaces** | `surface-0` | Base background |
| | `surface-1` | Cards, elevated content |
| | `surface-2` | Hover states, secondary areas |
| | `surface-3` | Most elevated |
| | `surface-*-alpha` | Semi-transparent (for glass effects) |
| **Text** | `primary` | Headings, important text |
| | `secondary` | Body text, descriptions |
| | `tertiary` | Less important text |
| | `muted` | Disabled, placeholder |
| **Borders** | `border` | Default borders |
| | `border-subtle` | Subtle dividers |
| | `border-strong` | Emphasized borders |
| **Accent** | `accent` | Primary brand color, CTAs |
| | `accent-hover` | Accent hover state |
| | `accent-secondary` | Secondary accent |
| | `accent-tertiary` | Tertiary accent |
| **Semantic** | `success` | Success states |
| | `warning` | Warning states |
| | `error` | Error states |
| | `info` | Informational states |

### Usage Guidelines

**✅ DO: Use semantic Tailwind classes**
```html
<div class="bg-surface-1 text-primary border border-border rounded-lg">
  <h2 class="text-xl font-bold text-primary">Title</h2>
  <p class="text-secondary">Description</p>
  <button class="bg-accent text-accent-text hover:bg-accent-hover">
    Action
  </button>
</div>
```

**❌ DON'T: Use arbitrary values with var()**
```html
<!-- Never do this -->
<div class="bg-[var(--surface-1)] text-[var(--text-primary)]">
<span style="color: var(--accent-primary)">
```

**❌ DON'T: Use light-dark() in components**
```html
<!-- Never do this -->
<div class="bg-[light-dark(white,#1e1e1e)]">
```

**✅ ACCEPTABLE: CSS variables in `<style>` blocks**

For scoped component styles or prose/markdown rendering, CSS variables are appropriate:
```css
<style>
  .prose :global(h2) {
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-default);
  }
</style>
```

### Component Classes

For repeated patterns, define component classes in `global.css`:

```css
/* Glass effect surfaces */
.glass-0 { @apply bg-surface-0 backdrop-blur-lg; }
.glass-1 { @apply bg-surface-1 backdrop-blur-md; }

/* Card component */
.card {
  @apply bg-surface-1-alpha border border-border backdrop-blur-lg rounded-xl;
}
```

---

## JavaScript Principles

### ES6+ Modern Style

```javascript
// ✅ Use const/let
const config = { api: 'https://...' };
let counter = 0;

// ❌ Never use var
var oldStyle = 'bad';

// ✅ Arrow functions for callbacks
const items = data.map(item => item.id);

// ✅ Template literals
const message = `Hello, ${user.name}!`;

// ✅ Destructuring
const { id, name, email } = user;
const [first, second] = array;

// ✅ Optional chaining & nullish coalescing
const value = obj?.nested?.property ?? 'default';
```

### Async/Await

```javascript
// ✅ Prefer async/await
async function fetchData() {
  try {
    const response = await fetch('/api/data');
    return await response.json();
  } catch (error) {
    console.error('Fetch failed:', error);
    throw error;
  }
}

// ❌ Avoid .then() chains
function fetchDataOld() {
  return fetch('/api/data')
    .then(res => res.json())
    .then(data => data)
    .catch(err => console.error(err));
}
```

---

## Svelte 5 Principles

### Use Runes, Not Stores

```svelte
<script>
  // ✅ Svelte 5 runes
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log('Count changed:', count);
  });

  // ❌ Old store syntax
  import { writable } from 'svelte/store';
  const count = writable(0);
</script>
```

### Event Handlers

```svelte
<!-- ✅ Svelte 5 -->
<button onclick={() => count++}>Click</button>

<!-- ❌ Old syntax -->
<button on:click={() => count++}>Click</button>
```

---

## DRY Principles

### Single Source of Truth

1. **Colors**: Defined once in `global.css`, used everywhere via Tailwind
2. **Documentation**: Lives in `docs/`, Astro imports from there
3. **Agent configs**: Defined in agent files, docs reference implementation
4. **Types**: Define once, import where needed

### Avoid Duplication

```javascript
// ❌ Duplicated constant
// file1.js
const API_URL = 'https://api.example.com';

// file2.js
const API_URL = 'https://api.example.com';

// ✅ Single definition
// config.js
export const API_URL = 'https://api.example.com';

// file1.js, file2.js
import { API_URL } from './config.js';
```

---

## File Organization

```
src/
├── components/     # Svelte components
├── pages/          # Astro pages
├── layouts/        # Astro layouts
├── styles/
│   └── global.css  # Global styles, color tokens, Tailwind config
└── lib/            # Shared utilities

api/
├── routes/         # API endpoints
├── agents/         # AI agent implementations
├── lib/            # API utilities
└── config.js       # API configuration

docs/
└── agents/         # Agent documentation (Astro content source)
    ├── README.md   # Index page content
    └── agent-*.md  # Individual agent docs

planning/
├── PRD.md                      # Product requirements
└── coding-principles-guide.md  # This file

tests/
└── api/            # API tests
```

---

## Testing

- All tests in `tests/` directory
- Run with `npm test`
- Tests must pass before commit
- Use Vitest for unit tests
- API tests mock external services
