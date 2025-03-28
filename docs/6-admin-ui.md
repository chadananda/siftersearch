# 6. Admin UI

This version refines the **UI** for SifterSearch, with **roles** cascading (SuperUser > Librarian > Editor > AuthUser > AnonUser), a **first-screen chat** interface for all, and more advanced screens for editing, documents, and site management.

---

## 1. Role-Based Navigation & Basic Layout

1. **Roles Cascade**: If something says “Librarian only,” it also allows SuperUser.
2. **Main Layout**:
    - **Left Panel**: Collapsible nav that can also display library/activity summary.
    - **Center Content**: The main screen for chat, doc listing, or editing.
    - **Right Panel**: For metadata editing, AI tool suggestions, diff history, or site management details.
    - **SifterChat fob**: A small floating button in the corner of every page. Clicking opens a pop-up chat window.

---

## 2. Screens & Flows

### 2.1 First Screen: Public Chat + Summary

- **Anon Accessible**: This page is meant to impress visitors and editors.
- **Left Panel**:
    - Library scope summary: total docs, recent additions.
    - Names/emails of who added new docs (mailto links) for easy contact.
    - Possibly a small “Getting Started” tip.
- **Center**: A **Large Chat** interface (SifterChat) explaining the project.
- **Collapsible** left panel: open by default here.

### 2.2 Filterable Library Listing (Editor-Focused)

- **Accessible** once logged in (Editor+). Route: `/documents`.
- **Center**: A list or grid of all documents in the library (including spidered ones if not filtered out).
- **Filtering**: By metadata fields (author, date added, date modified, category), or toggling non-core resources off.
- **Sorting**: By author, date added, date modified, etc.
- **Right Panel**: A large metadata panel showing doc details. The user can do quick edits, e.g. changing an image, updating tags, or letting AI suggest metadata.
- **Add Documents Tab**: Also on this page is a tab or button to open a wizard that:
    1. Accepts multiple file uploads.
    2. Allows them to be staged (partial metadata, partial OCR) before integration.
    3. If duplicates are found, the system warns or merges them.

### 2.3 Single Document Editor

- **Route**: `/edit/[docId]` (Editor+).
- **Left Panel**: Collapsed by default, can be expanded to see nav.
- **Center**: Document text editing with multiple tabs:
    - **View**: Just reading mode.
    - **Edit**: Actual text changes.
    - **Edit History**: Full version or diff list.
    - **Edit Suggestions**: AI-proposed changes, also shown as diffs.
- **Right Panel**: Tabbed interface for content analysis, AI tools (bulk editing), metadata.
    - Possibly a “metadata” tab and an “AI tools” tab.

### 2.4 Library & API Analytics

- Possibly `/analytics` or a sub-route.
- **Charts** or tables: doc counts, user activity, top queries, incomplete metadata stats.
- Librarians or superadmins can see more detail.

### 2.5 Library Config (Superuser) & User Mgmt (Librarian)

- **Config**: `/config` route for superusers to adjust library name, domain, chatbot personality, or advanced crawling rules.
- **Users**: `/users` route for librarians to see and manage roles. Emails link to `mailto:`.

### 2.6 Website (Site) Management

- A **Sites** page (maybe `/sites`) for librarians or superusers. Lists all spidered sites.
    - Each site can have multiple rules for crawling subpaths.
    - Right panel or detail view to tweak domain, path rules, or a YouTube channel.
    - A filterable list if many sites exist, plus a quick view of last crawl time, doc counts.
    - Let the user enable or disable certain sections to limit coverage.

---

## 3. Chat Integration (SifterChat Fob)

- The **fob** sits at the bottom corner on every page.
- Clicking it opens a pop-up with the library’s personality. The personality can be changed in library config.
- The chat can help the user do tasks, show them doc references, or run AI tools.

---

## 4. Summarized Flows

1. **Anon** sees the first screen with the big chat and library summary.
2. **Editor** or above logs in, sees the doc listing at `/documents` with filtering, sorting, add-doc wizard, and quick metadata edits in the right panel.
3. **Selecting** a doc leads to `/edit/[docId]`, a more thorough editing environment with versioning, diffs, and AI suggestions.
4. **Site Management**: librarians/superusers can do `/sites` to manage crawler rules.
5. **Config** and **User** mgmt: superusers do `/config`, librarians do `/users`.
6. **Analytics** for librarians or superusers at `/analytics`.
7. The **SifterChat** fob is always present.

---

## 5. Implementation Details

- **Component Library**: Use [ShadCN components for Svelte](https://www.shadcn-svelte.com/) whenever possible. These are well-tested, accessible components that provide a solid foundation for the UI.
- **Paths**: We can create SvelteKit pages like `src/routes/+layout.svelte` for the main layout, then subroutes:
    - `/src/routes/index.svelte` → The first screen (public chat + library summary).
    - `/src/routes/documents/+page.svelte` → The filterable listing.
    - `/src/routes/edit/[docId]/+page.svelte` → Single doc editor.
    - `/src/routes/analytics/+page.svelte` → Analytics.
    - `/src/routes/config/+page.svelte` → Library config.
    - `/src/routes/users/+page.svelte` → User management.
    - `/src/routes/sites/+page.svelte` → Spidered site mgmt.
- **Left Panel**: The main nav. Use a collapsible component.
- **Right Panel**: For each page, we can have a separate region for metadata, AI suggestions, etc.
- **Add Documents** wizard can be a tab or a route under `/documents/upload`.

---

## 6. Development Setup

### Local Development Environment

Once you've installed dependencies with `npm install`, start the development environment:

```bash
# Start the development environment (SvelteKit app and Manticore)
npm run dev
```

This will start both the SvelteKit application and the Manticore search engine using Docker Compose, providing a complete development environment with all required services.

For a more detailed view of the application, you can open it in your browser:

```bash
# Open the application in your default browser
open http://localhost:5173
```

### Building for Production

To create a production version of the app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

For deployment, the application uses Docker Compose to run both the SvelteKit application and Manticore search engine:

```bash
# Start the production environment
npm run start
```

---

## 7. Implementation Checklist

### Phase 1: Basic Structure & Navigation
- [x] Set up SvelteKit project with TailwindCSS
- [x] Implement theme switching (dark/light mode)
- [x] Create base layout components
  - [x] Header
  - [x] Footer
  - [x] Sidebar
  - [x] Navigation
  - [x] Theme Toggle
- [x] Set up initial routes
  - [x] Home page (`/`) with chat interface
  - [x] Documents listing (`/documents`)
  - [x] Document editor (`/edit/[docId]`)
  - [x] Analytics dashboard (`/analytics`)
- [ ] Create remaining routes
  - [ ] Site management (`/sites`)
  - [ ] Library configuration (`/config`)
  - [ ] User management (`/users`)
- [ ] Implement responsive navigation
  - [ ] Mobile menu
  - [ ] Breadcrumbs
  - [ ] Collapsible sidebar

### Phase 2: Authentication & Authorization
- [ ] Set up Clerk authentication
  - [ ] Install and configure Clerk SDK
  - [ ] Create auth hooks
  - [ ] Add sign in/sign up pages
  - [ ] Implement auth guards
- [ ] Implement role-based access
  - [ ] Define role hierarchy (SuperUser > Librarian > Editor > AuthUser > AnonUser)
  - [ ] Create role-based navigation
  - [ ] Add permission checks
  - [ ] Create role management interface

### Phase 3: Document Management
- [ ] Create document listing
  - [ ] Implement filtering
  - [ ] Add sorting
  - [ ] Create metadata editor
  - [ ] Add bulk actions
- [ ] Build document editor
  - [ ] Rich text editing
  - [ ] Version control
  - [ ] Collaborative editing
  - [ ] Auto-save
- [ ] Add document upload
  - [ ] File upload wizard
  - [ ] Batch upload
  - [ ] Progress tracking
  - [ ] Error handling

### Phase 4: API Implementation
- [ ] Create SvelteKit API routes
  - [ ] Content management endpoints
  - [ ] Search endpoints
  - [ ] User management endpoints
  - [ ] Analytics endpoints
  - [ ] Chat endpoints
- [ ] Implement API authentication
  - [ ] JWT validation
  - [ ] API key support
  - [ ] Rate limiting

### Phase 5: Search & Chat Integration
- [ ] Integrate with Manticore Search
  - [ ] Configure search indexes
  - [ ] Implement search API
  - [ ] Add faceted search
  - [ ] Support vector search
- [ ] Implement SifterChat component
  - [ ] Create chat interface
  - [ ] Integrate with search API
  - [ ] Add tool execution
  - [ ] Implement voice input/output

### Current Status
We are in Phase 1, with basic layout and initial routes implemented. Next steps:
1. Complete remaining routes (`/sites`, `/config`, `/users`)
2. Set up authentication with Clerk
3. Begin implementing API routes for search and document management
4. Integrate with Manticore for search capabilities

---

## 8. Conclusion

This revised UI ensures:

- A **public** home with chat & library summary.
+For consistent color theming, define light/dark variables (like `bg-primary`, `bg-accent`, `text-primary`, `text-accent`) in a central file (like `app.css`) for use in components, rather than switching in the component template.
- A **powerful** doc listing & metadata panel for bulk edits.
- A **detailed** doc editor with tabs for history, AI suggestions.
- **Site management** for crawled domains.
- **Config & user** mgmt for librarians and superusers.

All with a **SifterChat fob** globally, supporting role-based access and minimal friction for editors.