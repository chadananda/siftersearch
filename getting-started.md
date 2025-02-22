# SifterSearch Project Context

## Project Overview
SifterSearch is a RAG (Retrieval-Augmented Generation) library management system with an API and admin interface. The project consists of two main components:
1. A Fastify-based backend API
2. A SvelteKit-based admin interface

## Key Documentation
Please read these files in order to understand the project:

1. `/readme.md` - Main project documentation containing:
   - Technology stack overview
   - Implementation plan
   - Database schemas
   - Development setup instructions
   - Testing approach

2. `/1-technology.md` - Technical specifications including:
   - Code organization philosophy
   - Modern JavaScript ES6 Module requirements
   - Unicode and internationalization handling
   - Complete tech stack details for backend and frontend
   - Authentication and storage solutions
   - Document processing tools

3. `/6-admin-ui.md` - Admin UI implementation details

4. `/site/README.md` - Current progress on UI implementation:
   - Phase 1 completed items:
     - SvelteKit + TailwindCSS setup
     - Theme switching (dark/light)
     - Base layout components
     - Initial routes (/, /documents, /edit/[docId], /analytics)
   - Current focus: Main page chat interface

5. `/instructions.md` - Code style requirements:
   - Use bare-metal ES6 JS/modules
   - Fastify backend
   - SvelteKit with Svelte 5 Runes
   - Tailwind v4 with color variables and CSS Color Module Level 5
   - Zero abstraction approach
   - Direct logic
   - Minimal classes
   - Pure functions
   - Horizontal, chainable code
   - Keep error logs, remove working logs
   - Never create files without permission

## Current Task
Working on the admin site home page (`/site/src/routes/+page.svelte`):
- Implementing a clean, centered chat interface
- Removing unnecessary components (stats cards, getting started card)
- Following the project's minimalist, direct coding approach

## Development Server
For UI development:
1. CD to `/site` directory
2. Run `npm run dev` to start the SvelteKit development server
3. Backend integration will be implemented later

## Code Style Notes
- Use modern JavaScript features
- Keep code horizontal and chainable where possible
- Avoid unnecessary abstraction layers
- Maintain clear documentation
- Use descriptive variable names
- Follow flat directory structure
