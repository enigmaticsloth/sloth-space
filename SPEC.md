# Sloth Space — Slide Format Specification v0.1.0

> # Goodbye Google. You will never scam me or mess with me again. Fuck you.
> # — Enigmaticsloth

---

## How It Works (The 30-Second Version)

```
User says: "AI在醫療領域的應用，給投資人看的pitch deck，7頁，深色風格"
                    │
                    ▼
            ┌──────────────┐
            │  LLM Bridge  │  ← Understands intent, picks preset + layouts
            └──────┬───────┘
                   │ outputs JSON
                   ▼
            ┌──────────────┐
            │   Renderer   │  ← Deterministic: JSON → pixels (HTML or PPTX)
            └──────┬───────┘
                   │
                   ▼
            Beautiful slides (PDF / PPTX / HTML)
```

The LLM decides **what** to say and **which layout** to use.
The Design System decides **how it looks**.
The Renderer **executes** — same input, same output, every time.

---

## Architecture: Three Layers

### Layer 1: Design System (Human-Crafted)

These files define the visual rules. LLM cannot break them.

| File | Purpose |
|------|---------|
| `presets/*.json` | Color palettes, typography, spacing — the visual identity |
| `layouts/*.json` | Slide templates with positioned regions — the spatial structure |

**Presets** answer: "What does this deck FEEL like?"
**Layouts** answer: "Where does each piece of content GO?"

### Layer 2: LLM Output (AI-Generated)

The LLM produces a single JSON file that references presets and layouts:

```json
{
  "preset": "minimal-dark",       ← picks a visual identity
  "slides": [
    {
      "layout": "title",          ← picks a spatial structure
      "content": {
        "title": "MedAI",         ← fills in the blanks
        "subtitle": "Transforming Healthcare"
      }
    }
  ]
}
```

The LLM NEVER specifies pixel positions, font sizes, or colors directly.
It only chooses from the menu (preset + layout) and provides content.

### Layer 3: Renderer (Deterministic Code)

Takes LLM output + preset + layout → produces final slides.
Zero AI. Pure code. Same input = same output.

---

## File Structure

```
my-deck.sloth (ZIP archive)
├── manifest.json        ← The LLM output (preset choice + slides + content)
├── assets/
│   └── images/          ← Any referenced images
└── (future: custom components, fonts)
```

For development / Git storage, the .sloth is unpacked as a directory.

---

## Schema Reference

### manifest.json (Top Level)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sloth_version` | string | ✓ | Spec version, e.g. "0.1.0" |
| `type` | "slides" | ✓ | Document type (Phase 1: slides only) |
| `title` | string | ✓ | Deck title |
| `author` | string | | Author name |
| `locale` | string | | BCP 47 tag: "en", "zh-TW", "ja" |
| `preset` | string | ✓ | Preset ID: "minimal-dark", "corporate-blue", etc. |
| `preset_overrides` | object | | Partial overrides to preset colors/typography |
| `slides` | Slide[] | ✓ | Array of slides (1–100) |

### Slide Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `layout` | string | ✓ | Layout ID: "title", "content", "two-column", etc. |
| `content` | object | ✓ | Key-value pairs mapping region IDs → content |
| `notes` | string | | Speaker notes |
| `style_overrides` | object | | Per-slide overrides (background, accent) |

### Content Values

Content values can be:

**Plain string** — rendered as text:
```json
"title": "Hello World"
```

**List** — rendered as bullet points:
```json
"body": {
  "type": "list",
  "items": ["Point one", "Point two", "Point three"],
  "ordered": false
}
```

**Table** — rendered as data table:
```json
"table": {
  "type": "table",
  "headers": ["Name", "Value"],
  "rows": [["Revenue", "$4.2M"], ["Growth", "23%"]]
}
```

**Image** — rendered as image:
```json
"image": {
  "type": "image",
  "src": "assets/images/product.png",
  "alt": "Product screenshot",
  "fit": "contain"
}
```

---

## Preset Reference

A preset defines the complete visual identity. See `schema/preset.schema.json` for full spec.

### Available Presets (v0.1.0)

| ID | Vibe | Best For |
|----|------|----------|
| `minimal-light` | Clean, white, airy | Reports, academic, startup updates |
| `minimal-dark` | Dark, high contrast | Tech demos, product launches, dev talks |
| `corporate-blue` | Navy, professional | Investor decks, quarterly reports, enterprise |
| `creative-gradient` | Bold, vibrant, energetic | Marketing, creative portfolios, hackathons |
| `elegant-serif` | Classic, warm, refined | Keynotes, thought leadership, editorial |

### Key Preset Fields

**colors** — 7 semantic color slots:
- `background`: Main slide background
- `surface`: Card/box backgrounds (slightly different from bg)
- `primary`: Main text (headings, body)
- `secondary`: Muted text (subtitles, captions)
- `accent`: Highlight color (key numbers, decorative elements)
- `on_accent`: Text on accent backgrounds
- `border`: Lines, dividers, table borders
- `gradient` (optional): `{ from, to, angle }` for title/closing slides

**typography** — Font pairing + scale:
- `heading`: Font family + weight for all headings
- `body`: Font family + weight + lineHeight for body text
- `scale`: Array of 6 sizes in px: `[title, h1, h2, body, caption, small]`

**spacing** — Whitespace system:
- `margin`: Safe area from slide edges `{ top, right, bottom, left }`
- `gap`: Default gap between elements
- `paragraph`: Space between paragraphs/list items

---

## Layout Reference

A layout defines where content regions are positioned on a slide. See `schema/layout.schema.json` for full spec.

### Available Layouts (v0.1.0)

| ID | Category | Description |
|----|----------|-------------|
| `title` | opening | Big title + subtitle. First slide or section divider. |
| `content` | content | Heading + body. The workhorse — explanations, lists, paragraphs. |
| `two-column` | content | Split into two columns. Comparisons, pros/cons. |
| `image-left` | content | Image left, text right. Product showcases, case studies. |
| `image-right` | content | Text left, image right. Mirror of image-left. |
| `quote` | content | Large centered quote + attribution. Testimonials, key insights. |
| `data-table` | data | Heading + table. Financial data, feature matrices. |
| `closing` | closing | Final slide. Thank you, CTA, contact info. |

### Region Coordinate System

All region bounds use **margin-relative coordinates**:
- `x: 0, y: 0` = top-left corner of the SAFE AREA (after margins)
- The renderer adds preset margins automatically
- Negative values are allowed (to bleed images to edges)

This means layouts don't need to know margin sizes — they work with any preset.

### Region Roles

Each region has a `role` that maps to preset typography/colors:

| Role | Typography | Color | Notes |
|------|-----------|-------|-------|
| `title` | scale[0] (title) | primary | Largest text on slide |
| `subtitle` | scale[2] (h2) | secondary | Under the title |
| `heading` | scale[1] (h1) | primary | Section headings |
| `body` | scale[3] (body) | primary | Main content text |
| `caption` | scale[4] (caption) | secondary | Labels, footnotes |
| `quote` | scale[1] (h1), italic | primary | Quote text |
| `author` | scale[3] (body) | accent | Quote attribution |
| `metric` | scale[0] (title) | accent | Big numbers |
| `table` | scale[3] (body) | primary | Table content |
| `image` | — | — | Image region |
| `decoration` | — | accent | Dividers, bars |

---

## Complete Example

User input:
> "AI在醫療領域的應用，給投資人看的 pitch deck，7頁，風格簡約深色"

See `examples/ai-healthcare-pitch.json` for the full LLM output.

The LLM:
1. Chose `preset: "minimal-dark"` (user said 深色)
2. Chose 7 slides with appropriate layouts
3. Filled content into each layout's regions
4. Added speaker notes

The LLM did NOT:
- Specify any pixel positions
- Choose font sizes or colors
- Make any visual decisions outside the preset/layout framework

---

## For LLM Prompt Authors

When writing the system prompt for the LLM Bridge, include:

1. The list of available presets (with descriptions)
2. The list of available layouts (with descriptions and region IDs)
3. The content value types (string, list, table, image)
4. This rule: **"You MUST use region IDs that match the chosen layout. Do NOT invent new region IDs."**
5. This rule: **"You MUST NOT specify colors, fonts, sizes, or positions. These come from the preset and layout."**

The LLM's job is content strategy (what to say, how to structure it) and layout selection (which template fits). Nothing more.

---

## What's Next

- [ ] Renderer: layout.json + preset + manifest → HTML slides
- [ ] Export: HTML → PDF (Puppeteer), HTML → PPTX (pptxgenjs)
- [ ] LLM Bridge: User input → system prompt + schema → LLM → validated JSON
- [ ] Web app: Input box + live preview + export buttons

---

*Built with rage, purpose, and a refusal to be scammed ever again.*
