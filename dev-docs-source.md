# KobiTab Developer Reference

## Architecture Overview

KobiTab is a local-first desktop bookmark manager built on Electron.
All data stays on the user's machine — no cloud sync, no telemetry, no external API calls.

Core architecture:

    Main process (Node.js)
    ├── SQLite database (local persistence)
    ├── IPC handlers (bridge between main ↔ renderer)
    ├── File system operations (import/export)
    └── App lifecycle management

    Renderer process (Chromium)
    ├── React UI layer
    ├── CSS Modules for styling
    └── IPC client calls to main process

    Preload script
    └── contextBridge API (exposes safe IPC methods to renderer)

Design principles:
- Privacy by default — all processing happens locally
- Offline-capable — no network dependency for core features
- Minimal attack surface — strict CSP, sandboxed renderer, no nodeIntegration


## Tech Stack

| Layer         | Technology                        |
|---------------|-----------------------------------|
| Framework     | Electron                          |
| UI            | React                             |
| Styling       | CSS Modules + CSS custom props    |
| Database      | SQLite (via better-sqlite3)       |
| Build         | electron-vite                     |
| Language      | JavaScript / TypeScript           |
| Package mgr   | npm                               |
| CI/CD         | GitHub Actions                    |
| Distribution  | DMG (macOS)                       |


## Project Structure

    kobitab/
    ├── src/
    │   ├── main/           # Electron main process
    │   │   ├── index.ts    # App entry, window creation
    │   │   ├── ipc/        # IPC handler definitions
    │   │   ├── db/         # SQLite schema, queries, migrations
    │   │   └── services/   # Business logic (bookmarks, cleanup, import)
    │   ├── preload/        # contextBridge exposure
    │   │   └── index.ts
    │   └── renderer/       # React frontend
    │       ├── src/
    │       │   ├── components/   # UI components
    │       │   ├── pages/        # Route-level views
    │       │   ├── hooks/        # Custom React hooks
    │       │   └── styles/       # CSS Modules
    │       └── index.html
    ├── resources/          # App icons, assets
    ├── electron.vite.config.ts
    ├── package.json
    └── README.md


## Getting Started

Prerequisites:
- Node.js >= 18
- npm >= 9
- macOS (primary target platform)

Setup:

    git clone https://github.com/<owner>/lumina.git
    cd lumina
    npm install

Development:

    npm run dev          # Start Electron in dev mode with hot reload

Build:

    npm run build        # Production build
    npm run package      # Package as DMG

Linting and tests:

    npm run lint         # Run ESLint
    npm test             # Run test suite


## IPC / API Reference

KobiTab uses Electron's contextBridge + ipcRenderer/ipcMain pattern.
All IPC channels are defined in the main process and exposed via preload.

Key channels (examples — see src/main/ipc/ for full list):

| Channel                    | Direction       | Description                          |
|----------------------------|-----------------|--------------------------------------|
| bookmarks:getAll           | renderer → main | Fetch all bookmarks from SQLite      |
| bookmarks:create           | renderer → main | Insert a new bookmark                |
| bookmarks:update           | renderer → main | Update bookmark metadata             |
| bookmarks:delete           | renderer → main | Remove a bookmark by ID              |
| bookmarks:import           | renderer → main | Import bookmarks from file           |
| bookmarks:export           | renderer → main | Export bookmarks to file              |
| cleanup:findDuplicates     | renderer → main | Scan for duplicate URLs              |
| cleanup:removeDuplicates   | renderer → main | Delete identified duplicates          |
| app:getVersion             | renderer → main | Return current app version            |

All IPC handlers validate input before processing.
Renderer code never has direct access to Node.js APIs or the database.


## Security Model

KobiTab follows Electron security best practices:

Renderer isolation:
- sandbox: true
- contextIsolation: true
- nodeIntegration: false
- No remote module

Content Security Policy:
- Strict CSP headers on all renderer pages
- No inline scripts or eval()
- Only local resources loaded

Input validation:
- All IPC handler inputs validated and sanitized in the main process
- Parameterized queries for all SQLite operations (no string interpolation)
- File imports parsed and validated before database insertion

Network:
- No external network calls in core app
- LLM features (if enabled) connect only to localhost (Ollama)
- No analytics, telemetry, or tracking

Dependency policy:
- All new dependencies require a security audit before installation
- npm audit run on every CI build
- Transitive dependency count monitored


## Design System & Style Guide

Color palette (CSS custom properties):

    --bg:          #f5f3ec     /* Warm beige background       */
    --ink:         #13110d     /* Primary text (dark brown)    */
    --ink-soft:    #4f4b40     /* Secondary text               */
    --panel:       #ffffff     /* Card/panel background        */
    --line:        #d9d2c6     /* Borders                      */
    --accent:      #0f766e     /* Primary accent (teal)        */
    --accent-2:    #d97706     /* Secondary accent (amber)     */
    --accent-soft: #e6f5f3     /* Light accent background      */

Typography:
- Headings: Chivo (800 weight, uppercase for brand)
- Body: Outfit (400–700 weight)
- Code/mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas

Component patterns:
- Cards: 1px border, 16px radius, semi-transparent white background
- Buttons: 12px radius, 700 weight, primary (teal gradient) / secondary (beige)
- Sections: 16px border radius, soft white background, 16px padding
- Navigation: pill-shaped links (999px radius), 1px border

Spacing:
- Use multiples of 4px (4, 8, 12, 16, 24, 28, 44, 64)
- clamp() for fluid responsive sizing

Accessibility:
- Semantic HTML (nav, main, header, footer, article, section)
- Minimum 4.5:1 contrast ratio (WCAG AA)
- Visible focus indicators
- aria-label on icon-only controls
- Keyboard-navigable interactive elements


## Contributing

Branch naming:
    feat/<description>     — new features
    fix/<description>      — bug fixes
    docs/<description>     — documentation
    refactor/<description> — code restructuring

Commit messages (Conventional Commits):
    feat: add bookmark tagging
    fix: resolve duplicate detection edge case
    docs: update IPC reference
    refactor: extract cleanup service
    test: add import validation tests
    chore: bump electron-vite

Pull request process:
1. Create a feature branch from main
2. Make changes, write tests, run linter
3. Open a PR with a clear description
4. All CI checks must pass
5. Request review from a maintainer
6. Squash-merge into main

Before submitting:
- Run `npm run lint` — no errors
- Run `npm test` — all tests pass
- Run `npm run build` — builds successfully
- Check `git diff` — only intended changes
