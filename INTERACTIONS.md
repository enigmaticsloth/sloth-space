# Sloth Space — Interaction Spec & Tutorial Checklist

## Slide Region Interactions

### Select (Single Click)
- **Desktop**: Click any region on the slide
- **Mobile**: Tap any region on the slide
- **Result**: Blue outline appears. Context menu pops up with direct actions + AI suggestions.
- **Clicking same region again**: Re-opens the context menu.
- **Clicking a different region**: Switches selection.
- **Clicking empty area**: Deselects (clears selection).

### Edit Text (Double-Click)
- **Desktop**: Double-click a text/list/table region
- **Mobile**: Double-tap, or use "Edit text directly" from context menu
- **Result**: Green outline. Cursor appears inside the text. Full text editing:
  - Type to insert text at cursor
  - Arrow keys to move cursor
  - Select text with Shift+Arrow or click-drag
  - Backspace / Delete to remove characters
  - Ctrl+A to select all, Ctrl+C/V to copy/paste
  - Tab to move between table cells
- **Save & Exit**: Press Escape, or click outside the region.
- **Note**: While editing, slide navigation keys (←/→) and drag/move are disabled.

### Text Selection & Copy
- **Desktop**: Click-drag to highlight text within a region
- **Mobile**: Long-press to select text
- **Result**: A floating tooltip appears above the selection:
  - **"✦ Ask AI about this"** — Pastes the selected text into the chat input with quotes, ready for you to add an instruction (e.g. "translate", "rewrite")
  - **"📋 Copy"** — Copies text to clipboard
- **Note**: Selecting text does NOT trigger region selection or the context menu.

### Move Region (Explicit Mode)
- **How to enter**: Click "Move / reposition" in the context menu
- **Result**: Orange pulsing dashed outline. Cursor becomes move cursor.
- **Drag the region** to a new position on the slide.
- **Release to place**: Region stays at the new position. Move mode auto-exits.
- **Cancel**: Click empty area outside the region, or press Escape.
- **AI alternative**: Type in chat: "把標題移到中間" / "move the title to the center"

### Resize Region
- **How**: Hover over a selected region → small blue squares appear at the four corners.
- **Drag a corner** to resize the region.
- **Note**: Resize handles are always available on selected regions (no need to enter move mode).

### Reset Region Position
- Available in context menu when a region has been moved/resized.
- "Reset position" → returns to the default layout position.
- AI alternative: "標題復位" / "reset the title position"

---

## Context Menu Structure

When you click a region, the context menu appears:

```
┌──────────────────────────────┐
│  [Region Name]           [×] │
├──────────────────────────────┤
│  ✏️ Edit text directly       │  ← Direct action
│  ✥ Move / reposition        │  ← Direct action
│  📍 Reset position (if moved)│  ← Direct action
│  🔀 Change layout            │  ← Direct action
├──── ✦ AI Suggestions ────────┤
│  ✨ Rewrite concisely        │
│  🌐 Translate                │
│  💡 More impactful (title)   │
│  📊 Key data points (body)   │
│  ... (role-specific)         │
├──────────────────────────────┤
│  🗑️ Clear this region        │  ← Danger zone
├──────────────────────────────┤
│  [Ask AI to change this...] [Go] │
└──────────────────────────────┘
```

- **Top section**: Direct, instant actions (no AI involved)
- **Middle section**: AI-powered suggestions (uses LLM)
- **Bottom**: Free-form AI instruction input
- **Mobile**: Menu slides up as a bottom sheet

---

## Image Handling

### Drop / Paste Image
- Drag-and-drop image files onto the app, or paste from clipboard.
- Images appear in the staging area below the chat input.
- Press Send (with or without text):
  - **No text / minimal text** ("add", "放", etc.): Auto-Designer places the image smartly based on aspect ratio and slide content. No LLM call.
  - **With instructions** ("put it on slide 3, top right"): LLM interprets the instruction.

### Auto-Designer Placement Logic
- **Ultra-wide** (aspect ratio ≥ 2.5): Full-width banner
- **Landscape** (≥ 1.4): Top or bottom placement
- **Square-ish** (≥ 0.7): Side placement, adapts to content density
- **Portrait** (< 0.7): Side column, respects two-column layouts

---

## Chat Commands (No LLM)

| Command | Action |
|---------|--------|
| undo / 復原 | Undo last change |
| redo / 重做 | Redo |
| save / 儲存 | Save as .sloth file |
| new / 開新 | New deck |
| load / 載入 | Load a deck |
| export / 匯出 | Export JSON |
| export ppt / 匯出 ppt | Export PPTX |
| settings / 設定 | Open settings |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ← / → | Navigate slides (when not editing) |
| Ctrl+Z | Undo (when not editing) |
| Ctrl+Shift+Z / Ctrl+Y | Redo (when not editing) |
| Escape | Exit inline edit / Exit move mode |
| Tab | Next table cell (in edit mode) |
| Shift+Tab | Previous table cell (in edit mode) |

---

## Tutorial Animation Checklist

Interactions that need animated demonstrations:

1. **Select a region** — click → blue outline + menu appears
2. **Edit text** — double-click → green outline → type → Escape to save
3. **Move a region** — click → menu → "Move" → drag → release to place
4. **Resize a region** — select → hover corner → drag handle
5. **Text selection → Ask AI** — drag to highlight → tooltip → "Ask AI"
6. **Drop image → Auto-place** — drag file → drop → image appears on slide
7. **AI suggestion** — click region → menu → "Rewrite concisely" → text changes
8. **Custom AI instruction** — click region → menu → type in input → Go
9. **Chat commands** — type "undo" / "save" / "export ppt"
10. **Style via chat** — type "背景改藍色" → background changes
