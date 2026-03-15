# Sloth Space — Changelog

## 2026-03-15 Session: Undo/Redo Overhaul + Doc Selection + Mobile Fixes

### Undo/Redo System (Doc Mode) — Full Rewrite

The doc undo/redo system was rebuilt from scratch across this session, fixing a chain of interconnected bugs.

**Architecture:**

```
docPushUndo()        — snapshot current state → undo stack (called before edits)
docUndo()            — pop first *different* state from undo stack → restore
docRedo()            — pop first *different* state from redo stack → restore
docFlushEditing()    — sync contenteditable DOM → data model
docContentKey(doc)   — content fingerprint ignoring `updated` timestamp
docPopDifferent(st)  — pop first snapshot with different content from a stack
docStackHasDifferent — check if stack has any meaningfully different snapshot
```

**Bugs fixed (in discovery order):**

1. **Ctrl+Z intercepted in chat input / textarea** — Global keydown handler called `e.preventDefault()` for all Ctrl+Z, killing browser-native undo in chat input. Fix: `isPlainInput` guard returns early for INPUT/TEXTAREA/SELECT, letting browser handle. Doc block contenteditable goes through our custom system; slide inline edit goes through browser.

2. **Edit Text popup action did nothing** — `docEditingBlockId` was never set before enabling contenteditable. Added `docEditingBlockId=bid` before `el.contentEditable='true'`.

3. **Context menu appeared at cursor instead of beside block** — Added `anchorEl` parameter to `renderCtxMenuPopup()`, positions menu to the right of the element with viewport fallback.

4. **No undo snapshots during typing** — `docInputBlock()` never called `docPushUndo()`. Added debounced push (1.5s) via `docUndoPushTimer`, plus push on `docFocusBlock()` when switching blocks.

5. **Push-then-pop no-op** — `docPushUndo(); docUndo()` pushed current state then immediately popped it back. Removed the `docPushUndo()` call before `docUndo()` — `docUndo()` already saves current state to redo stack internally.

6. **renderDocMode re-focus corruption** — After `docUndo()` → `renderDocMode()`, if `docEditingBlockId` was still set, the re-focus triggered `docFocusBlock()` → `docPushUndo()`, pushing the just-restored state right back. Fix: set `docEditingBlockId=null` before render, plus `docUndoRedoInProgress` flag to block pushes during undo/redo cycle.

7. **Duplicate snapshots (ghost undo steps)** — `docPushUndo()` dedup check used `JSON.stringify` which included the `updated` timestamp. Since timestamp changes on every keystroke, dedup never matched. Fix: `docContentKey()` strips `updated` before comparing.

8. **Toolbar undo/redo buttons unresponsive** — `pointerEvents:'none'` was set when stack was "empty", but `docUndo()` changes the stack during operation, causing buttons to disable mid-click. Fix: removed `pointerEvents` control entirely — buttons always clickable, visual state only via opacity/color.

9. **Undo button falsely enabled** — `docUpdateUndoUI` checked `stack.length > 0` but stack could contain only snapshots identical to current state. Fix: `docStackHasDifferent()` scans for a snapshot with different `docContentKey`.

10. **Undo/redo lost on page refresh** — Stacks were in-memory only. Fix: persist to `sessionStorage` (survives refresh, clears on tab close). Save after every stack mutation; restore on doc mode entry.

11. **Redo cleared on refresh** — `beforeunload` handler called `docPushUndo()` which does `docRedoStack=[]`. Fix: `beforeunload` only calls `docFlushEditing()` + `docSaveUndoStacks()` + `docSaveNow()`, never `docPushUndo()`.

**Shared utilities extracted:**

- `docFlushEditing()` — replaces 3 duplicate flush blocks (keyboard handler, `modeUndo()`, `beforeunload`)
- `docPopDifferent(stack)` — shared by `docUndo()` and `docRedo()`
- `docStackHasDifferent(stack)` — shared by `docUpdateUndoUI()`

---

### Doc Block Selection + AI Context Menu

Ported slide mode's block selection and AI context menu to doc mode.

- `docSelectBlock()` — first click selects (shows selection bar), second click enters edit mode
- `showDocCtxAiMenu()` — context AI menu with doc-specific suggestions (Edit, Delete, Rewrite, Expand, Translate, etc.)
- `docCaptionClick()` — caption-specific AI menu
- Selection bar shows block index, type, and content preview

**Shared context menu module:**

`renderCtxMenuPopup({title, suggestions, execFn, placeholder, customExecCode, clickEvent, anchorEl})` — used by slide, doc, and caption context menus. Positions menu to the right of the anchor element with viewport fallback.

**Unified `clearSelection()`** — clears both slide (`selectedRegion`) and doc (`docSelectedBlockId`, `docSelectedCaptionBlockId`) state, hides selection bar and context menu.

---

### Mobile Fixes

1. **Doc scrolling broken** — `doc-canvas` was inside `.slide-panel` which has `touch-action:none`. CSS `touch-action` values are *intersected* up the ancestor chain (`none ∩ pan-y = none`), so no CSS override can fix it. Fix: moved `doc-canvas` out of `.slide-panel` into `.middle` container directly. Same for `workspace-canvas`.

2. **Touch-based drag** — HTML5 Drag and Drop doesn't work on touch devices. Added parallel `touchstart/touchmove/touchend` system (`docTouchDragStart`, `docTouchDragMove`, `docTouchDragEnd`) with auto-scroll near edges.

3. **Native scrollbar removed on mobile** — `scrollbar-width:none` + `::-webkit-scrollbar { display:none }` for doc-canvas and workspace-canvas. Finger swipe still works; the non-functional scrollbar track is hidden.

---

### Toolbar Fixes

1. **Superscript/subscript buttons** — Clicking toolbar buttons stole focus from contenteditable, so `document.execCommand()` had no selection to act on. Fix: all toolbar elements (`.dt-btn`, `.dt-select`, `.color-swatch`, `.font-item`) get `mousedown → preventDefault()` in `initToolbar()`.

2. **Slide inline edit toolbar** — `modeExecCmd()` now calls `document.execCommand(cmd)` directly when `isInlineEditing()`, instead of inserting a tag into chat input.

3. **Undo/redo button visual states** — White (`#fff`) when enabled, dark gray (`#555`, `opacity:0.35`) when disabled. Unified across slide (`updateUndoRedoUI`) and doc (`docUpdateUndoUI`).

---

### Keyboard Handling Fixes

1. **Shift+Arrow text selection** — Global arrow key handler now skips when `shiftKey` is held, when active element is contenteditable/input, or when in doc mode. Doc block's ArrowUp/ArrowDown handlers skip when `shiftKey` is held, letting browser handle native text selection.

2. **Doc first block layout broken** — `renderDocMode()` template had a missing `>` in the opening `<div>` tag — `${blocksHtml}` was injected inside the tag attributes instead of as children. Fixed by adding `>` before `${blocksHtml}`.

---

### File

All changes are in the single monolithic file: `app.html` (~9134 lines).
