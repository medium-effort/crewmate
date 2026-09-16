Build a self-contained Full-Stack Markdown Notes Web Application with tagging, search, and automated tests.

### Core Requirements:
1. Backend & Persistence:
   - RESTful API supporting full CRUD operations for notes.
   - Note schema: `id`, `title`, `content` (Markdown), `tags` (array of strings), `createdAt`, `updatedAt`.
   - Endpoints for listing/filtering by tags and searching (querying across title and content).
   - Local persistence using SQLite (or a persistent JSON file storage system).

2. Frontend UI:
   - Responsive modern UI (sidebar + main view).
   - Sidebar: Search bar, tag filter pills, and a list of notes with title, date, and preview snippet.
   - Main View: Markdown editor with live preview side-by-side (rendered HTML), title input, and tag manager (add/remove tags).
   - Instant visual feedback on create/update/delete operations.

3. Quality & Testing:
   - Automated test suite covering the core API endpoints and search/filter logic.
   - Initial seed dataset containing a few sample markdown notes with different tags so the app is ready to use immediately.

### Acceptance Criteria:
- Must start with a single command (e.g., `npm install && npm start`).
- All tests must pass out of the box via `npm test`.
- Codebase should be clean, modular, and include a `README.md` with setup and API details.
