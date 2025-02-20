# 4. API Organization



## 1. Overview

We use a **Fastify-based** API in `/server`, with each route file named for the resource (e.g., `content.js`, `users.js`, `chat.js`). The main routes are:

- **`/api/tools`** – Agentic tool endpoints for LLM usage
- **`/api/content`** – Document editing and content management
- **`/api/users`** – User and role management
- **`/api/chat`** – Chat-related endpoints
- **`/api/v1`** – Public endpoints (for external devs or public-facing usage)

All these routes are typically registered in `server/index.js` (or a small aggregator file in `server/routes`) and are served under `/api`. The **SvelteKit** site in `/site` handles the main UI at the top level.

---

## 2. Example Server Setup

Below is a sample `server/index.js` showing the route registrations with **prefix**es:

```js
// server/index.js
import path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';

// Route imports
import toolsRoutes from './routes/tools.js';
import contentRoutes from './routes/content.js';
import usersRoutes from './routes/users.js';
import chatRoutes from './routes/chat.js';
import publicV1Routes from './routes/public/v1/index.js';
// Any short link handler, etc.

export async function createServer() {
  const fastify = Fastify({
    logger: true,
    trustProxy: true
  });

  // Register plugins
  await fastify.register(cors);
  await fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await fastify.register(staticPlugin, {
    root: path.join(process.cwd(), 'site/build'),
    prefix: '/',
    decorateReply: false
  });

  // Private API routes
  fastify.register(contentRoutes, { prefix: '/api/content' });
  fastify.register(usersRoutes, { prefix: '/api/users' });
  fastify.register(chatRoutes, { prefix: '/api/chat' });

  // Agentic tools
  fastify.register(toolsRoutes, { prefix: '/api/tools' });

  // Public v1
  fastify.register(publicV1Routes, { prefix: '/api/v1' });

  // Example short link or redirect
  fastify.get('/link/:id', handleShortLink);

  // Serve the SvelteKit SPA
  fastify.get('*', (request, reply) => {
    reply.sendFile('index.html');
  });

  return fastify;
}
```

### Key Points

1. **Noun-based** route files: `content.js`, `users.js`, etc.
2. **`/api/tools`** for LLM agentic tools.
3. **`/api/v1`** for public endpoints.
4. We serve the compiled **SvelteKit** site from `site/build`, so the top-level routes go to the UI, while `/api` routes go to Fastify.

---

## 3. Agentic Tool API

We keep a **tools.js** route file at `server/routes/tools.js`, which references our **agentic** or shared library of tools. For instance:

```js
// server/routes/tools.js
import { toolRegistry } from '../../tools/registry.js';
import { hasPermission } from '../../services/user_management.js';
import { trackToolUsage, updateToolUsage } from '../../services/analytics.js';
import { executeToolWithTimeout } from '../../services/tools.js';

export default async function toolsRoutes(fastify) {
  // GET /api/tools => list all tools
  fastify.get('/', async (request, reply) => {
    const user = request.user;
    const availableTools = Object.values(toolRegistry)
      .filter(tool => hasPermission(user, `tools:${tool.name}`));
    return { tools: availableTools };
  });

  // POST /api/tools/:toolName => call a specific tool
  Object.entries(toolRegistry).forEach(([toolName, toolDef]) => {
    fastify.post(`/${toolName}`, {
      schema: {
        body: toolDef.parameters,
        response: {
          200: toolDef.returns
        }
      },
      handler: async (request, reply) => {
        const user = request.user;
        try {
          const usageId = await trackToolUsage(user.id, toolName);
          const result = await executeToolWithTimeout(
            toolName,
            request.body,
            user.id,
            usageId
          );
          await updateToolUsage(usageId, { success: true });
          return result;
        } catch (err) {
          await updateToolUsage(0, { success: false, error: err.message });
          throw err;
        }
      }
    });
  });
}
```

---

## 4. Content API

A typical **`content.js`** route might handle document creation, editing, or diff merges. For example:

```js
// server/routes/content.js
import { getUserRole } from '../services/user_management.js';
import { createDocument, updateDocument } from '../services/content_edit.js';

export default async function contentRoutes(fastify) {
  fastify.post('/create', async (request, reply) => {
    const user = request.user;
    if (!['librarian','editor'].includes(getUserRole(user))) {
      return reply.code(403).send({ error: 'Not allowed to create documents' });
    }
    const { title, text } = request.body;
    const doc = await createDocument({ title, text, userId: user.id });
    return { success: true, docId: doc.id };
  });

  fastify.post('/update', async (request, reply) => {
    const user = request.user;
    if (!['librarian','editor'].includes(getUserRole(user))) {
      return reply.code(403).send({ error: 'Not allowed to edit documents' });
    }
    const { docId, changes } = request.body;
    const updated = await updateDocument(docId, changes, user.id);
    return { success: true, updated };
  });

  // Additional endpoints for diff merges, content approval, etc.
}
```

### Note

- We do role checks inside these routes.
- The actual editing logic (diff merges, AI suggestions) lives in `content_edit.js` or `content_edit_ai.js`.

---

## 5. Users API

**`users.js`** might handle user creation, role assignment, or listing library members:

```js
// server/routes/users.js
import { createUser, listUsers, updateUserRole } from '../services/user_management.js';

export default async function usersRoutes(fastify) {
  fastify.get('/', async (request, reply) => {
    // Return list of users for the library in context
    const libraryId = request.user.libraryId;
    const users = await listUsers(libraryId);
    return { users };
  });

  fastify.post('/create', async (request, reply) => {
    const { email, role } = request.body;
    const newUser = await createUser(email, role);
    return { success: true, user: newUser };
  });

  fastify.post('/role', async (request, reply) => {
    const { userId, newRole } = request.body;
    await updateUserRole(userId, newRole);
    return { success: true };
  });
}
```

---

## 6. Chat API

**`chat.js`** might provide endpoints for chat sessions or hooking into external LLM services:

```js
// server/routes/chat.js
export default async function chatRoutes(fastify) {
  fastify.post('/handshake', async (request, reply) => {
    // Initialize a chat session
    const { sessionId, libraryId } = request.body;
    // logic to create a session...
    return { success: true, sessionId };
  });

  fastify.post('/message', async (request, reply) => {
    // Send a chat message to the AI or retrieve a stored conversation
    const { sessionId, message } = request.body;
    // logic...
    return { response: '...' };
  });
}
```

---

## 7. Public API (v1)

A separate folder, e.g. `server/routes/public/v1/`, can hold endpoints for external devs:

```js
// server/routes/public/v1/index.js
import searchRoutes from './search.js';
import documentsRoutes from './documents.js';

export default async function publicV1(fastify) {
  fastify.register(searchRoutes, { prefix: '/search' });
  fastify.register(documentsRoutes, { prefix: '/documents' });

  // Rate limiting or API key checks can go here
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-api-key'];
    if (!apiKey) {
      return reply.code(401).send({ error: 'API key required' });
    }
    // Validate key, attach user, handle rate limit
  });
}
```

---

## 8. Authentication & OpenAPI

We still rely on **Clerk** or a custom JWT approach. The user’s role is attached to `request.user` so we can do route-level checks. For **OpenAPI** docs, we can use `@fastify/swagger`.

---

## 9. Summary

1. **SvelteKit** at `/site` for the main front-end.
2. **Fastify** routes in `/server/routes/` with **noun-based** files: `tools.js`, `content.js`, `users.js`, `chat.js`, `public/v1/`.
3. **Agentic Tools** in `/api/tools`, referencing a common `toolRegistry`.
4. **Editing** logic in `/api/content`, user logic in `/api/users`, chat in `/api/chat`.
5. **Public** endpoints under `/api/v1`.
6. **Role checks** done in route handlers, calling well-tested services in `/services`.

This updated API reference aligns with our final **directory structure** and route organization, ensuring a clean, consistent approach for SifterSearch.