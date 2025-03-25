# 4. API Organization

## 1. Overview

SifterSearch uses a **simplified architecture** where:

- A **SvelteKit** application handles both UI routes and API endpoints with prefix `/api`
- **Manticore Search** provides powerful search capabilities with both BM25 and vector search
- The entire application runs in a single Node.js process for simplified deployment
- **Role-based access control** is implemented at the application level

The main API routes are:

- **`/api/content`** – Document editing and content management
- **`/api/search`** – Search endpoints for document retrieval
- **`/api/users`** – User and role management
- **`/api/chat`** – Chat-related endpoints
- **`/api/tools`** – Tool endpoints for LLM usage
- **`/api/v1`** – Public endpoints (for external devs or public-facing usage)

In development mode, the SvelteKit dev server handles all requests.
In production mode, the SvelteKit application is built with the Node adapter and deployed as a standalone Node.js application.

---

## 2. SvelteKit API Routes

Below is a simplified example of how API routes are implemented in SvelteKit:

```js
// src/routes/api/health/+server.js
export async function GET() {
  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
```

For routes that require authentication:

```js
// src/routes/api/content/create/+server.js
import { json, error } from '@sveltejs/kit';

export async function POST({ request, locals }) {
  // User and role are added by hooks.server.js
  const { user, role } = locals;
  
  // Check if user has appropriate role
  if (!user || !['SuperUser', 'Librarian', 'Editor'].includes(role)) {
    throw error(403, 'Not authorized to create documents');
  }
  
  const { title, text } = await request.json();
  
  try {
    const doc = await createDocument({ 
      title, 
      text, 
      userId: user.id 
    });
    
    return json({ success: true, docId: doc.id });
  } catch (err) {
    throw error(500, err.message);
  }
}
```

### Key Points

1. **Single Port**: Both the API and UI are served from the same port (3000 by default)
2. **Environment Variables**: A single `.env` file at the project root is used for both frontend and backend
3. **Authentication**: Implemented at the application level using `hooks.server.js`
4. **Role-Based Access**: All API endpoints check user roles before processing requests
5. **Development Workflow**: 
   - Run `npm run dev` to start the SvelteKit dev server
   - Local Manticore instance runs in Docker
6. **Production Build**:
   - Built SvelteKit app is deployed as a standalone Node.js application
   - Manticore Search runs in a separate container

---

## 3. Authentication and Authorization

Authentication is implemented using Clerk and SvelteKit's server hooks:

```js
// src/hooks.server.js
import { clerkClient } from '@clerk/clerk-sdk-node';

export async function handle({ event, resolve }) {
  // Get session from cookies or headers
  const sessionId = event.cookies.get('__session');
  
  if (sessionId) {
    try {
      // Validate session and get user data
      const session = await clerkClient.sessions.getSession(sessionId);
      const user = await clerkClient.users.getUser(session.userId);
      
      // Add user and role to event.locals for all routes
      event.locals.user = user;
      event.locals.role = determineUserRole(user);
    } catch (error) {
      // Invalid session, user will be treated as anonymous
      event.locals.role = 'AnonUser';
    }
  } else {
    // No session, user is anonymous
    event.locals.role = 'AnonUser';
  }
  
  return resolve(event);
}

function determineUserRole(user) {
  // Logic to determine role based on user metadata
  if (user.publicMetadata.isSuperUser) return 'SuperUser';
  if (user.publicMetadata.isLibrarian) return 'Librarian';
  if (user.publicMetadata.isEditor) return 'Editor';
  return 'AuthUser';
}
```

---

## 4. Storage API

SifterSearch provides API endpoints for document storage operations using Backblaze B2:

```js
// src/routes/api/storage/+server.js
import { json, error } from '@sveltejs/kit';
import { uploadDocument, getDocument } from '$lib/server/storage/b2-storage';
import { createHash } from 'crypto';

// Upload a document to B2 storage
export async function POST({ request, locals }) {
  const { role, user } = locals;
  
  // Check if user has appropriate role
  if (!user || !['SuperUser', 'Librarian', 'Editor'].includes(role)) {
    throw error(403, 'Not authorized to upload documents');
  }
  
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      throw error(400, 'No file provided');
    }
    
    // Generate hash for deduplication
    const buffer = await file.arrayBuffer();
    const hash = createHash('sha256')
      .update(Buffer.from(buffer))
      .digest('hex');
    
    // Upload to B2
    await uploadDocument({
      buffer: Buffer.from(buffer),
      mimetype: file.type
    }, hash);
    
    return json({ 
      success: true, 
      hash, 
      size: file.size,
      type: file.type
    });
  } catch (err) {
    throw error(500, err.message);
  }
}

// Get a document from B2 storage
export async function GET({ url, locals }) {
  const { role } = locals;
  const hash = url.searchParams.get('hash');
  
  if (!hash) {
    throw error(400, 'No document hash provided');
  }
  
  try {
    const document = await getDocument(hash);
    
    // Stream the document back to the client
    return new Response(document.Body, {
      headers: {
        'Content-Type': document.ContentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${hash}"`,
      }
    });
  } catch (err) {
    throw error(500, err.message);
  }
}
```

### Integration with Manticore

The API also provides endpoints for managing the Manticore search index, which is integrated with Backblaze B2:

```js
// src/routes/api/index/+server.js
import { json, error } from '@sveltejs/kit';
import { indexDocument, reindexAll } from '$lib/server/manticore/index';

// Index a document
export async function POST({ request, locals }) {
  const { role } = locals;
  
  // Only SuperUsers and Librarians can manually index documents
  if (!['SuperUser', 'Librarian'].includes(role)) {
    throw error(403, 'Not authorized to index documents');
  }
  
  const { docId } = await request.json();
  
  try {
    await indexDocument(docId);
    return json({ success: true });
  } catch (err) {
    throw error(500, err.message);
  }
}

// Reindex all documents
export async function PUT({ locals }) {
  const { role } = locals;
  
  // Only SuperUsers can reindex all documents
  if (role !== 'SuperUser') {
    throw error(403, 'Not authorized to reindex all documents');
  }
  
  try {
    // Start reindexing in the background
    reindexAll().catch(console.error);
    return json({ success: true, message: 'Reindexing started' });
  } catch (err) {
    throw error(500, err.message);
  }
}
```

---

## 5. Search API

The search API integrates with Manticore to provide powerful search capabilities:

```js
// src/routes/api/search/+server.js
import { json, error } from '@sveltejs/kit';
import { searchDocuments } from '$lib/server/manticore/search';

export async function POST({ request, locals }) {
  const { role } = locals;
  const { query, filters = {}, limit = 10, offset = 0 } = await request.json();
  
  // Add role-based filters
  const roleFilters = getRoleFilters(role, locals.user);
  const combinedFilters = { ...filters, ...roleFilters };
  
  try {
    // Perform search using Manticore
    const results = await searchDocuments(query, {
      ...combinedFilters,
      limit,
      offset
    });
    
    return json({
      results: results,
      total: results.length,
      query,
      filters: combinedFilters
    });
  } catch (err) {
    throw error(500, err.message);
  }
}

// Helper function to get role-based filters
function getRoleFilters(role, user) {
  switch (role) {
    case 'SuperUser':
    case 'Librarian':
      // Can see all documents
      return {};
    case 'Editor':
      // Can only see their own documents or public ones
      return { $or: [{ userId: user.id }, { isPublic: true }] };
    case 'AuthUser':
    case 'AnonUser':
    default:
      // Can only see public documents
      return { isPublic: true };
  }
}
```

---

## 6. User Management API

The user management API handles user creation, role assignment, and user data retrieval:

```js
// src/routes/api/users/+server.js
import { json, error } from '@sveltejs/kit';
import { clerkClient } from '@clerk/clerk-sdk-node';

// Get all users (SuperUser only)
export async function GET({ locals }) {
  const { role } = locals;
  
  // Only SuperUsers can list all users
  if (role !== 'SuperUser') {
    throw error(403, 'Not authorized to list users');
  }
  
  try {
    const users = await clerkClient.users.getUserList();
    
    // Map users to a simplified format
    const mappedUsers = users.map(user => ({
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      firstName: user.firstName,
      lastName: user.lastName,
      role: determineUserRole(user),
      createdAt: user.createdAt
    }));
    
    return json(mappedUsers);
  } catch (err) {
    throw error(500, err.message);
  }
}

// Update user role (SuperUser only)
export async function PATCH({ request, locals }) {
  const { role } = locals;
  
  // Only SuperUsers can update roles
  if (role !== 'SuperUser') {
    throw error(403, 'Not authorized to update user roles');
  }
  
  const { userId, newRole } = await request.json();
  
  // Validate role
  if (!['SuperUser', 'Librarian', 'Editor', 'AuthUser'].includes(newRole)) {
    throw error(400, 'Invalid role');
  }
  
  try {
    // Update user metadata in Clerk
    await clerkClient.users.updateUser(userId, {
      publicMetadata: {
        isSuperUser: newRole === 'SuperUser',
        isLibrarian: newRole === 'Librarian',
        isEditor: newRole === 'Editor'
      }
    });
    
    return json({ success: true });
  } catch (err) {
    throw error(500, err.message);
  }
}
```

---

## 7. Chat API

The chat API handles conversations with the AI assistant:

```js
// src/routes/api/chat/+server.js
import { json, error } from '@sveltejs/kit';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST({ request, locals }) {
  const { role, user } = locals;
  const { messages, options = {} } = await request.json();
  
  // Check if user has appropriate role to use chat
  if (role === 'AnonUser') {
    throw error(403, 'Please sign in to use the chat feature');
  }
  
  try {
    // Add system message based on user role
    const systemMessage = getSystemPromptForRole(role);
    const allMessages = [
      { role: 'system', content: systemMessage },
      ...messages
    ];
    
    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: allMessages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 1000
    });
    
    // Log chat usage for analytics
    await logChatUsage(user.id, messages, response);
    
    return json({
      message: response.choices[0].message,
      usage: response.usage
    });
  } catch (err) {
    throw error(500, err.message);
  }
}

// Helper function to get system prompt based on user role
function getSystemPromptForRole(role) {
  switch (role) {
    case 'SuperUser':
      return 'You are assisting a SuperUser with full system access.';
    case 'Librarian':
      return 'You are assisting a Librarian who manages content and users.';
    case 'Editor':
      return 'You are assisting an Editor who can edit and upload content.';
    default:
      return 'You are assisting a user with the SifterSearch system.';
  }
}
```

---

## 8. Public API (v1)

The public API provides endpoints for external developers:

```js
// src/routes/api/v1/search/+server.js
import { json, error } from '@sveltejs/kit';
import { searchDocuments } from '$lib/server/manticore/search';
import { validateApiKey } from '$lib/server/auth/api-keys';

export async function POST({ request }) {
  // Validate API key from headers
  const apiKey = request.headers.get('x-api-key');
  
  if (!apiKey) {
    throw error(401, 'API key is required');
  }
  
  const keyData = await validateApiKey(apiKey);
  
  if (!keyData) {
    throw error(403, 'Invalid API key');
  }
  
  const { query, limit = 10, offset = 0 } = await request.json();
  
  try {
    // Only search public documents for API users
    const results = await searchDocuments(query, {
      isPublic: true,
      limit,
      offset
    });
    
    // Log API usage
    await logApiUsage(keyData.userId, 'search', { query });
    
    return json({
      results: results.map(doc => ({
        id: doc.id,
        title: doc.title,
        snippet: doc.snippet,
        score: doc.score
      })),
      total: results.length
    });
  } catch (err) {
    throw error(500, err.message);
  }
}
```

---

## 9. Summary

The SifterSearch API follows these principles:

1. **Unified Structure**: Single SvelteKit application for both UI and API
2. **Role-Based Access Control**: All endpoints enforce appropriate permissions
3. **Consistent Error Handling**: Standardized error responses across all endpoints
4. **Simplified Authentication**: Authentication handled at the application level
5. **Clear Separation**: API endpoints organized by functionality
6. **Versioned Public API**: Stable public API for external developers