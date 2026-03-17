# Sloth Space

> AI-native workspace. Type what you want. Sloth builds it.

> **Sloth Space is for drafting at the speed of thought. We do the 0-to-1 heavy lifting. Need to push pixels or tweak font shadows? Export it to Office and do it there. Life is too short for manual formatting.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**Live:** [enigmaticsloth.github.io/sloth-space](https://enigmaticsloth.github.io/sloth-space/index.html#home)

---

## What is this

Sloth Space is an AI-native prototyping tool for slides, documents, and spreadsheets. You describe what you need in natural language, and the AI drafts it — a pitch deck, a project proposal, a budget sheet — in seconds. When you need pixel-perfect polish, export to Office.

We're not replacing Google Docs or PowerPoint. We're replacing the blank page. The first draft is the hardest part, and that's what Sloth does: the 0-to-1 heavy lifting across slides, docs, and sheets in one unified workspace.

The AI doesn't just create content — it operates the entire application. It switches modes, creates projects, opens files, generates documents, links them together, and navigates the UI, all from a single chat input.

---

## Features

**Content Creation**
- Slide decks with 5 design themes (Monet, Seurat, clean-white, clean-gray, clean-dark)
- Rich documents with headings, tables, images, quotes, code blocks, dividers
- Data sheets with formulas (SUM, AVERAGE, COUNT, MIN, MAX, STDEV, MEDIAN, IF, CONCAT, ABS, ROUND, LEN, UPPER, LOWER, LEFT, RIGHT, NOW, TODAY)
- PPTX export for presentations

**Editing UX**
- Unified single-click select / double-click edit across all three modes (slides, docs, sheets)
- Single click on any block or cell shows an AI context menu (rewrite, translate, expand, suggest formula, etc.)
- Double click enters inline text editing with cursor placement at click position
- Sheet cell corner drag handles — 4 dots at selected cell corners for drag-to-select range
- Custom selection toolbar (Copy/Cut/Paste/AI Edit) replaces native iOS toolbar on mobile
- Column/row header menus with select entire column/row

**Agentic UI**
- The LLM doesn't just generate content — it operates the entire application interface
- 27 whitelisted UI functions: mode switching, workspace navigation, file/project CRUD, panels, search/sort
- Multi-step executor — "create a project called Q2, write a budget report and put it in there" triggers create → switch mode → generate → link in one command
- Natural language intent routing — no hardcoded commands, works in any language
- Fuzzy name-to-ID resolution for natural language references ("open that file", "delete the Q2 project")
- Context memory — AI remembers recent actions to resolve pronouns and references
- Monet-orange overlay indicator showing AI actions in real-time
- Destructive actions require user confirmation; schema validation on all parameters

**AI Context Injection**
- Cross-file project context — AI reads all files in a project when generating new content
- Per-block AI actions — rewrite, expand, translate, simplify, change tone, suggest formula
- Bench (context staging) — pin files, paste text, or drop images as extra context for generation
- Cross-file references — mention a doc or sheet by name, AI pulls its data into the prompt

**Workspace**
- Project-based file organization
- Auto-linking generated content to source projects
- Cloud sync via Supabase (GitHub OAuth)

---

## Architecture

```
sloth-space/
├── index.html              # Entry point
├── serve.sh                # Local dev server script
├── js/
│   ├── app.js              # Module loader + init sequence
│   ├── state.js            # All mutable state (S object), constants
│   ├── ai.js               # LLM router, intent dispatch, AI UI control, multi-step
│   ├── ui.js               # Rendering, mode management, settings, file nav, mobile landing
│   ├── storage.js          # Save/load, cloud sync, unified modeSave()
│   ├── slide.js            # Slide renderer, canvas, context menus
│   ├── doc.js              # Doc editor, undo/redo, block operations
│   ├── sheet.js            # Sheet grid, formulas, cell editing
│   ├── workspace.js        # Workspace CRUD, project management
│   ├── bench.js            # Bench (context staging), file extraction, mobile overlay
│   ├── sel-toolbar.js      # Selection toolbar (floating text formatting on selection)
│   └── keys.js             # Keyboard shortcuts, image paste/drop
├── shared/
│   ├── auth.js             # GitHub OAuth, Supabase session management
│   ├── config.js           # API endpoints, model defaults, feature flags
│   ├── llm.js              # LLM API wrapper (OpenAI-compatible), streaming, retry
│   ├── storage.js          # Supabase cloud storage adapter
│   ├── welcome.js          # Welcome screen, onboarding flow
│   └── styles.css          # Shared component styles
├── slides/
│   ├── prompts.js          # LLM prompt templates (router, gen, style, edit, image)
│   ├── editor.js           # Slide content editing, style application
│   ├── renderer.js         # Slide canvas rendering, layout engine
│   ├── export.js           # PPTX export via PptxGenJS
│   └── slides.css          # Slide-specific styles
├── css/
│   ├── styles.css          # CSS module loader (imports all below)
│   ├── base.css            # Variables, resets, Monet-inspired dark theme
│   ├── layout.css          # Main layout, chat panel, bottom panel, input area
│   ├── tabbar.css          # Mode tab bar, new tab page
│   ├── responsive.css      # Mobile/tablet overrides, bench overlay, 3-stage chat
│   ├── landing.css         # Landing page styles
│   ├── landing-page.css    # Landing page mode cards, demo stage
│   ├── nav.css             # File navigation sidebar
│   ├── topbar.css          # Top bar, tab strip
│   ├── bench.css           # Bench panel styles
│   ├── contextmenu.css     # AI context menu popup
│   ├── doc.css             # Doc mode styles
│   ├── sheet.css           # Sheet mode styles
│   ├── workspace.css       # Workspace view styles
│   └── animations.css      # Transitions, keyframes, overlays
├── presets/                 # Slide design themes (JSON)
├── layouts/                 # Slide layout definitions (10 layouts)
├── schema/                  # Data validation schemas
└── examples/                # Sample deck JSON files
```

### How the AI works

```
User: "Create a project called Q2, write a budget report and put it in there"
         │
         ▼
   ┌─────────────┐
   │  LLM Router  │  ← Classifies intent (8B model, fast)
   └──────┬───────┘
          │ { intent: "multi_step", steps: [...] }
          ▼
   ┌──────────────┐
   │  Multi-Step   │  ← Async executor, runs steps sequentially
   │  Executor     │
   └──────┬───────┘
          │
          ├── Step 1: wsCreateProject("Q2")        ← UI action
          ├── Step 2: modeEnter("doc")              ← Switch mode
          ├── Step 3: doDocGenerate("budget report") ← LLM generates content
          ├── Step 4: _autoLinkToProject()          ← Link file to project
          └── Step 5: Navigate to workspace         ← Show result
```

### Intent Router

All user input goes through a single LLM-based intent router. No regex, no hardcoded language patterns. The router classifies into one of these intents:

| Intent | What it does |
|--------|-------------|
| `generate` | Create new content (slides, docs) |
| `content_edit` | Edit or delete specific content |
| `style` | Visual changes (colors, fonts, layouts) |
| `describe` | Summarize/analyze existing content |
| `ui_action` | Navigate, switch modes, manage projects |
| `multi_step` | Mixed operations (create + generate + link) |
| `deck_edit` | Batch edit all slides / restructure doc |
| `image` | Image operations on slides |
| `undo` | Undo/redo |
| `about` | Questions about Sloth Space itself |
| `chat` | General conversation |

### AI UI Control

The AI can execute 27 whitelisted UI functions:

- **Mode switching** — `modeEnter`, `showModePicker`
- **Workspace navigation** — `wsSetView`, `wsOpenProject`, `openWorkspaceItem`
- **File operations** — `wsNewFile`, `wsCreateDoc`, `wsDeleteFile`
- **Project management** — `wsCreateProject`, `wsDeleteProject`, `wsLinkFile`, `wsUnlinkFile`
- **UI panels** — `openSettings`, `openFileNav`
- **Search/sort** — `wsSetSearch`, `wsSetSort`

Security: whitelist-based execution, schema validation on parameters, destructive actions require confirmation, fuzzy name-to-ID resolution for natural language references.

---

## Tech Stack

- **Frontend:** Vanilla JS (ES Modules), zero frameworks, zero build step
- **AI:** Any OpenAI-compatible API (Groq, OpenAI, Grok, Ollama, Claude, custom)
- **Router model:** Llama 3.1 8B (via Groq, free tier) — fast intent classification
- **Main model:** User's choice — GPT-4o, Claude, Llama 70B, etc.
- **Storage:** localStorage + Supabase Storage (cloud sync)
- **Auth:** GitHub OAuth via Supabase
- **Export:** PPTX via PptxGenJS

---

## Development Log

### Day 1 (2026-03-14)
Core slide generation, doc mode with undo/redo system (11 bugs fixed in chain), block selection + AI context menu, mobile touch support, toolbar fixes. Single monolithic `app.html` (~9100 lines).

### Day 2 (2026-03-15)
Split monolith into 8 ES modules. Cloud auto-sync system with Supabase. File navigation sidebar redesign (Monet-themed). Chat tabs with AI-generated titles.

### Day 3 (2026-03-16)
- Removed all hardcoded Chinese regex — pure LLM routing, language-agnostic
- Cross-file project context (3-layer detection)
- Unified `modeSave()` across all modes
- Workspace → generate auto mode switch
- Auto-link generated content to projects

**Phase 3: AI Controlled UI**
- `ALLOWED_ACTIONS` whitelist (27 functions) with confirmation for destructive actions
- `executeUIActions()` — whitelist check, schema validation, execution
- `resolveActionRefs()` — fuzzy name → ID resolution
- Monet-orange overlay indicator showing AI actions in real-time
- `multi_step` intent — one sentence triggers create project + generate doc + link
- `executeMultiStep()` — async sequential executor with per-step delay and overlay
- Context memory — recent actions injected into router for resolving "that file", "open it"
- 429 rate limit auto-retry (3 attempts, 5s/10s/15s backoff)

### Day 3.5 (2026-03-17)
Landing page demo complete redesign — interactive mini Sloth UI with animated cursor:
- Mini app frame replicating real workspace (topbar, tabs, canvas, prompt bar)
- 5 scenes: Slides, Workspace scan, Sheet, Doc, Convert (right-click context menu)
- Cursor types prompts, clicks send, scans files — real "operational feel"
- Monet orange AI indicator system (sweep bar, pulsing badge, frame glow, orange status)
- File link cards after generation (color-coded icon, filename, type badge)
- Phase-2 result summary cards with stats and breakdowns

### Day 4 (2026-03-17)
**Selection toolbar + Bench images + Licensing**
- Selection toolbar extracted to `sel-toolbar.js` module
- Bench image insertion with slide-quality thumbnails
- AGPL-3.0 license headers on all 30 core files
- AI auto-link to projects (LLM-driven project name extraction, auto-create missing projects, topbar badge refresh, animated link action)

**Mobile UX overhaul (c38–c43)**
- Full mobile landing page — JS functions, demo mirroring via MutationObserver, auth gate, mode grid
- Unified chat + prompt rounded card on mobile (chat panel + bottom panel merged visually)
- Bench converted to button + bottom-sheet overlay on mobile (saves screen space)
- Mobile file nav delete fix (double-confirm eliminated via `skipConfirm` parameter)
- Workspace button added to mobile topbar
- Blank tab on refresh filtered out; closing blank tabs no longer triggers save
- Tab double-tap fix — `:hover` wrapped in `@media(hover:hover)`, `touch-action:manipulation` added
- Workspace buttons shortened to "+ File" / "+ Project" (prevents two-line wrapping)
- Bench button styled in Monet grey with text label
- Chat panel 3-stage toggle on mobile: full (8 lines) → half (4 lines) → closed

**Bug fixes + Interaction redesign (c53–c55)**
- Tab duplication on every refresh — fixed async auth race condition (`getSession()` resolving after `checkWelcomeScreen()` already restored tabs, causing `enterSlides()` to create a duplicate)
- iOS native Copy/Paste/Look Up toolbar suppressed — `-webkit-touch-callout:none` + `contextmenu` event prevention, so only the custom Sloth toolbar appears
- Unified single-click select / double-click edit across all three modes (slide, doc, sheet) — single click selects a block/cell and shows AI context menu, double click enters inline text editing
- Doc mode changed from always-contenteditable to `contenteditable="false"` by default, toggled on double-click
- Sheet cells show 4 corner drag handles on selection — drag any corner to select a range of cells (touch-supported)
- Sheet AI context menu on cell selection — suggest formula, explain formula, reformat, fill column
- Column/row header context menus gain "Select column" / "Select row" option

**Full i18n cleanup (c56)**
- Removed ALL Chinese from codebase — zero CJK characters remaining in any JS/CSS/HTML file
- LLM prompt templates (router, gen, style, edit, image) rewritten in English only
- Intent router regex: replaced all Chinese patterns with English equivalents
- AI smart fallback, project keyword matching, describe follow-up — all English only
- Fullwidth CJK punctuation normalizers converted to Unicode escapes
- Comments and UI strings translated across all modules

---

## Setup

1. Open [enigmaticsloth.github.io/sloth-space](https://enigmaticsloth.github.io/sloth-space/index.html#home) (or serve locally)
2. Click ⚙ Settings
3. Enter your API key (Groq free tier works great for the router)
4. Set a main model for content generation
5. Start typing — "make a pitch deck about AI trends"

For local development:
```bash
cd sloth-space
./serve.sh  # or python3 -m http.server 8080
```

---

## Philosophy

> No frameworks. No build steps. No abstractions between you and the code.
>
> The LLM is not a chatbot bolted onto a UI — it IS the UI.
> Every button click could be a sentence. Every sentence could be a button click.

### Positioning

Sloth Space is a **prototyping tool**, not a full-featured office suite. We handle the 0-to-1: turning a vague idea into a structured first draft across slides, docs, and sheets. When users need to push pixels, tweak kerning, or add conditional formatting — they export to Office and do it there.

This is intentional. Competing with Google Docs on editing depth is a losing game. Competing on **draft speed** — going from nothing to a solid first version in one natural language command — is where the moat is.

---

## License

[AGPL-3.0](LICENSE) — Free to use, modify, and distribute. If you run a modified version as a network service, you must open-source your changes.

---

*Built in 4 days by [@enigmaticsloth](https://github.com/enigmaticsloth)*
