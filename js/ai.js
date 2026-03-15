import { S, LLM_DEFAULTS, CONFIG_KEY, CHAT_TABS_KEY, VALID_PRESETS, VALID_LAYOUTS, PRESETS, LAYOUTS } from './state.js';

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  ⚠️  DIRECTIVE FOR ALL AI EDITORS (LLMs, Copilot, Cursor, etc.)  ⚠️       ║
// ║                                                                            ║
// ║  1. NEVER hardcode language-specific keywords in regex patterns for         ║
// ║     intent detection, command matching, or content classification.          ║
// ║     The LLM router exists precisely to handle multilingual input.           ║
// ║     English-only shortcuts (undo, save, export...) are acceptable as       ║
// ║     fast-path optimizations, but NEVER add translations — the router       ║
// ║     handles every other language.                                          ║
// ║                                                                            ║
// ║  2. NEVER hardcode content parsing logic. All data interpretation          ║
// ║     (dates, currencies, languages, data types, etc.) MUST be delegated     ║
// ║     to the LLM via prompts. Hardcoded parsers break on edge cases.         ║
// ║                                                                            ║
// ║  3. When adding new features, ask: "Will this break if the user speaks     ║
// ║     a language I didn't anticipate?" If yes, let the LLM handle it.        ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// Send button arrow SVG (shared constant)
const SEND_ARROW_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';

// ═══════════════════════════════════════════
// LLM CONFIGURATION
// ═══════════════════════════════════════════

function loadConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      const c = JSON.parse(saved);
      Object.assign(S.llmConfig, c);
      return true;
    }
  } catch(e) {}
  return false;
}

function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(S.llmConfig));
}

function isConfigured() {
  if (S.llmConfig.provider === 'ollama') return !!S.llmConfig.url;
  if (S.llmConfig.provider === 'custom') return !!S.llmConfig.url;
  return !!S.llmConfig.apiKey; // cloud providers need API key
}

// ═══════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════

const STYLE_PROMPT=`You are a color/style interpreter for a presentation app. Convert the user's style description into a JSON action.

Output ONLY a JSON object. Possible keys:
- "background": hex color for slide background
- "heading_color": hex color for ALL text (global)
- "font": font family name
- "font_size": number (px) for ALL text globally. Our scale: title=44, h1=32, h2=24, body=18, caption=14, small=12. Use these as reference.
- "region": region ID to target (e.g. "title", "subtitle", "body", "heading", "quote", "left", "right"). If the user specifies a specific part, use this.
- "region_color": hex color for that specific region only (use WITH "region")
- "region_font": font name for that specific region only (use WITH "region")
- "region_font_size": number (px) for that specific region only (use WITH "region"). For "bigger"=+4~6px, "smaller"=-4~6px relative to defaults.
- "underline": true/false — add/remove underline
- "bold": true/false — add/remove bold
- "italic": true/false — add/remove italic
- "region_bounds": {x,y,w,h} — reposition/resize a region (use WITH "region"). Slide is 1280×720, margins 72/60. x,y are relative to margins.
- "reset_bounds": true — reset a region to its default layout position (use WITH "region")
- "slides": "all" or a number (default "all")

If the message is NOT about visual style (colors, fonts, bold, underline, italic, background, size), output {"none":true}.
IMPORTANT: Requests to change TEXT CONTENT (e.g. "change content", "enrich", "rewrite this") are NOT style changes. Output {"none":true} for those.

Region IDs in our system: title, subtitle, tagline, date, heading, body, footnote, left, right, left_label, right_label, quote, author, role, table, description, source, contact.

Default font sizes per role: title=44px, heading/h1=32px, h2=24px, body=18px, caption=14px, small=12px.
When user says "bigger"/"larger", increase by 4-6px from the region's default.
When user says "smaller", decrease by 4-6px from the region's default.
When user gives an explicit size like "24px" or "32", use that exact value.

Color interpretation:
- "Monet blue" / "dusty blue like Monet" → muted dusty blue #5B7FA5
- "Monet gold" → warm cream-gold #E8D5A3
- "dark tech blue" → dark tech blue #0A1628
- "Seurat gold" → pointillist gold #C5943A
- "red" → #CC0000, "green" → #2E8B57, "yellow" → #FFD700, "black" → #000000, "white" → #FFFFFF
- Use your best judgment for artistic descriptions.

Examples:
"text color Monet blue, background Monet gold" → {"heading_color":"#5B7FA5","background":"#E8D5A3"}
"title text green" → {"region":"title","region_color":"#2E8B57"}
"heading red" → {"region":"title","region_color":"#CC0000"}
"subtitle white" → {"region":"subtitle","region_color":"#FFFFFF"}
"body text blue" → {"region":"body","region_color":"#1E90FF"}
"background dark teal" → {"background":"#0A4F5C"}
"slide 3 heading red" → {"region":"heading","region_color":"#CC0000","slides":3}
"font Georgia" → {"font":"Georgia"}
"text bigger" → {"font_size":22}
"heading text bigger" → {"region":"heading","region_font_size":38}
"body text smaller" → {"region":"body","region_font_size":14}
"heading 50px" → {"region":"heading","region_font_size":50}
"add underline" → {"underline":true}
"heading bold" → {"region":"title","bold":true}
"subtitle italic and underline" → {"region":"subtitle","italic":true,"underline":true}
"remove underline" → {"underline":false}
"move heading to center" → {"region":"title","region_bounds":{"x":200,"y":280,"w":736,"h":100}}
"body bigger and wider" → {"region":"body","region_bounds":{"x":0,"y":64,"w":1136,"h":560}}
"heading reset" → {"region":"title","reset_bounds":true}
"content enrich" → {"none":true}
"rewrite this section" → {"none":true}

Output ONLY the JSON object.`;

// Serialize deck content compactly for LLM
function deckToContentJSON(){
  return S.currentDeck.slides.map((s,i)=>{
    const c={slide:i+1,layout:s.layout,content:{}};
    for(const[k,v]of Object.entries(s.content)){
      c.content[k]=v;
    }
    return c;
  });
}

// ── Content editor prompt ──
const CONTENT_EDIT_PROMPT=`You are an AI slide content editor. You will receive the current content of a specific region in a slide, and the user's editing instruction. Output ONLY the new content that should REPLACE the old content entirely.

CRITICAL RULES:
- Your output will COMPLETELY REPLACE the old content. Do NOT include any of the old text unless it should remain.
- If the user provides specific new text (e.g. "change to XXX"), output EXACTLY that text — nothing else.
- If the input is a plain string, output a plain string.
- If the input is a list object {"type":"list","items":[...]}, output the same structure.
- If the input is a table object {"type":"table","headers":[...],"rows":[...]}, output the same structure.
- Respect the user's language. If user says "in English", translate to English.
- When asked to "enrich" / "add more" / "expand":
  - Keep existing bullet points but expand them
  - Add 1-2 NEW bullet points if appropriate
- When asked to "rewrite": restructure and improve, same amount or MORE.
- Do NOT change the format/structure unless asked. If it's a list, keep it as a list.
- Output ONLY the raw content. No explanation, no code fences, no markdown, no quotes around plain strings.`;

// ── Deck-wide content edit prompt ──
const DECK_EDIT_PROMPT=`You are an AI slide content editor. You will receive the FULL content of a slide deck as a JSON array, and the user's editing instruction. You must apply the instruction to ALL slides and output the updated JSON array.

Rules:
- Output ONLY a JSON array of slide content objects. No explanation.
- Each object in the array must have: {"slide": N, "content": {...}}
- Keep the EXACT same structure and format for each region (string stays string, list stays list, table stays table).
- Apply the user's instruction to EVERY slide.
- Common instructions:
  - "translate to English" → translate ALL text content to English. Keep structure.
  - "translate to Chinese" → translate ALL text content to Traditional Chinese.
  - "enrich" → expand and add detail to ALL content regions across all slides.
  - "simplify" → make all content more concise.
  - "more professional" → rewrite all content in a more professional tone.
- NEVER remove content unless explicitly asked (e.g. "delete" / "remove" / "clear"). Only transform it.
- When asked to DELETE/remove/clear the content of a region, output an EMPTY string "" — nothing else.
- NEVER change the number of slides or layouts. Only change the text content within regions.
- For tables, translate/update cell values but keep the same rows/columns structure.
- For lists, keep the same number of items (or more if enriching), never fewer.
- Output ONLY the JSON array.`;

// Apply style overrides from LLM response
function applyStyleOverrides(styleObj){
  window.pushUndo(); // Save undo snapshot before style change
  const targetSlides=styleObj.slides||'all';
  // If there's a selected region and no explicit region in styleObj, use the selection
  const regionId=styleObj.region||(S.selectedRegion?S.selectedRegion.regionId:null);
  const msgs=[];

  S.currentDeck.slides.forEach((s,i)=>{
    if(targetSlides!=='all'&&(i+1)!==targetSlides)return;
    // Also respect selected slide if a region is selected
    if(regionId&&S.selectedRegion&&targetSlides==='all'&&S.selectedRegion.slideIdx!==undefined){
      // If user selected a specific region on a specific slide, only apply there
      // Unless they explicitly said "all slides" or a different slide number
    }
    if(!s.style_overrides)s.style_overrides={};

    // Global overrides
    if(styleObj.background)s.style_overrides.background=styleObj.background;
    if(styleObj.heading_color)s.style_overrides.heading_color=styleObj.heading_color;
    if(styleObj.font)s.style_overrides.font=styleObj.font;
    if(styleObj.font_size)s.style_overrides.font_size=Number(styleObj.font_size);

    // Text decorations (global)
    if(styleObj.underline!==undefined)s.style_overrides.underline=styleObj.underline;
    if(styleObj.bold!==undefined)s.style_overrides.bold=styleObj.bold;
    if(styleObj.italic!==undefined)s.style_overrides.italic=styleObj.italic;

    // Per-region bounds (Free-form Canvas via AI)
    if(regionId&&styleObj.region_bounds){
      if(!s.style_overrides.regions)s.style_overrides.regions={};
      if(!s.style_overrides.regions[regionId])s.style_overrides.regions[regionId]={};
      s.style_overrides.regions[regionId].bounds=styleObj.region_bounds;
    }
    if(regionId&&styleObj.reset_bounds){
      if(s.style_overrides?.regions?.[regionId]?.bounds){
        delete s.style_overrides.regions[regionId].bounds;
      }
    }

    // Per-region overrides
    const hasRegionStyle=styleObj.region_color||styleObj.region_font||styleObj.region_font_size||
      (regionId&&(styleObj.underline!==undefined||styleObj.bold!==undefined||styleObj.italic!==undefined));
    if(regionId&&hasRegionStyle){
      if(!s.style_overrides.regions)s.style_overrides.regions={};
      if(!s.style_overrides.regions[regionId])s.style_overrides.regions[regionId]={};
      const rr=s.style_overrides.regions[regionId];
      if(styleObj.region_color)rr.color=styleObj.region_color;
      if(styleObj.region_font)rr.font=styleObj.region_font;
      if(styleObj.region_font_size)rr.font_size=Number(styleObj.region_font_size);
      if(styleObj.underline!==undefined)rr.underline=styleObj.underline;
      if(styleObj.bold!==undefined)rr.bold=styleObj.bold;
      if(styleObj.italic!==undefined)rr.italic=styleObj.italic;
      // If targeting a region, don't apply decoration/size globally
      delete s.style_overrides.underline;
      delete s.style_overrides.bold;
      delete s.style_overrides.italic;
      if(styleObj.region_font_size)delete s.style_overrides.font_size;
    }
  });

  if(styleObj.background)msgs.push(`Background → ${styleObj.background}`);
  if(styleObj.heading_color)msgs.push(`All text → ${styleObj.heading_color}`);
  if(styleObj.font)msgs.push(`Font → ${styleObj.font}`);
  if(regionId&&styleObj.region_color)msgs.push(`${regionId} text → ${styleObj.region_color}`);
  if(regionId&&styleObj.region_font)msgs.push(`${regionId} font → ${styleObj.region_font}`);
  if(styleObj.font_size)msgs.push(`All font size → ${styleObj.font_size}px`);
  if(regionId&&styleObj.region_font_size)msgs.push(`${regionId} font size → ${styleObj.region_font_size}px`);
  if(styleObj.underline===true)msgs.push(`${regionId||'all'} +underline`);
  if(styleObj.underline===false)msgs.push(`${regionId||'all'} -underline`);
  if(styleObj.bold===true)msgs.push(`${regionId||'all'} +bold`);
  if(styleObj.italic===true)msgs.push(`${regionId||'all'} +italic`);
  if(regionId&&styleObj.region_bounds)msgs.push(`${regionId} moved/resized`);
  if(regionId&&styleObj.reset_bounds)msgs.push(`${regionId} reset`);
  return msgs;
}

// ── Pass 1: small fast model decides intent ──
const ROUTER_PROMPT=`You are an intent router for Sloth Space, a content creation app with modes: slide, doc, sheet, workspace.
Classify the user's message into ONE intent. Output ONLY a JSON object.

INTENTS:

"undo" — undo, restore, revert, go back to previous state.
  Output: {"intent":"undo"}
  CRITICAL RULE: undo, redo, ctrl+z ALL mean undo.
  These words mean "go back" NOT "delete". NEVER confuse undo with delete/content_edit.

"content_edit" — edit or delete specific content (a region on a slide, a doc block).
  Slides: {"intent":"content_edit","slide":N or null,"region":"regionId" or null,"delete":true/false}
  Docs: {"intent":"content_edit","delete":true/false}
  delete:true when user wants to remove/clear/delete content: "delete", "remove", "clear"
  Also: insert table, add divider, move image, change image position → content_edit in doc mode.

"style" — visual changes only: colors, fonts, sizes, backgrounds, bold, italic, underline, spacing, region bounds. Slide mode only.

"image" — image operations on slides: place, move, resize, delete, scale, crop, fit. Slide mode only.

"deck_edit" — batch edit ALL slides at once or restructure entire doc.
  "translate everything to English", "translate everything", "reorganize this article"

"describe" — user is asking ABOUT THE CURRENT DOCUMENT/CONTENT: what it says, summarize it, what's in it, analyze data, calculate values, explain meaning.
  Output: {"intent":"describe"}
  Examples: "what is this about", "what is the current content", "summarize this", "what does this say", "what does this presentation cover", "help me summarize", "content overview", "what have we written"
  SHEET-SPECIFIC examples (always "describe" when asking about existing sheet data):
    "sum of this column", "sum of column B", "average of this column", "standard deviation of this data", "what does this sheet do", "which project does this sheet belong to",
    "calculate the average for me", "what's the total", "explain this table", "what do these cells mean", "what does this row mean", "analyze this table", "review these numbers for me"
  IMPORTANT: This is about the EXISTING content the user has open, NOT about Sloth Space the app.
  IMPORTANT: In sheet mode, ANY question about the data, cells, columns, rows, formulas, or analysis → "describe".
  PROJECT-LEVEL queries (always "describe"): "what is this project about", "summarize the project", "what conclusions does this project have", "what do the other files say", "how does this relate to the other docs", "cross-reference with the sheet data"
  WORKSPACE MODE: If the user is in workspace mode and asks about a specific project by name (e.g. "what is project X about", "summarize project Y"), this is ALWAYS "describe" — NOT "about" or "chat".

"about" — user is asking ABOUT Sloth Space THE APP itself: what it is, features, how to use it, a specific mode.
  Output: {"intent":"about","topic":"general|slides|doc|sheet|workspace"}
  topic guide:
    "general" — asking about Sloth Space overall: "what is Sloth Space", "what is this app", "tell me about it", "what features does it have"
    "slides" — asking about slide/presentation mode: "how do I use slide mode", "how do slides work", "how to make a presentation"
    "doc" — asking about document mode: "what is document mode", "how does doc mode work", "how to write an article"
    "sheet" — asking about sheet/data mode: "how do I use sheets", "how do sheets work", "how to create a data table"
    "workspace" — asking about workspace/file management: "what is workspace", "how does workspace work", "how do I manage files"
  CRITICAL DISTINCTIONS for "about":
    - "about" is ONLY for meta-questions about the app's features/usage/identity.
    - If user mentions specific files, items, or data INSIDE workspace (e.g. "files in workspace", "can you see my file", "do I have a document", "open that file"), this is NOT about — it is "chat" or "generate" depending on context.
    - If user asks about CONTENT they see/have (e.g. "can you see it", "what's in it", "which files do I have"), this is "chat" NOT "about", even if they mention "workspace" or "sloth space".
    - "What is Sloth Space?" → about. "I have a file called sloth_space in my workspace" → NOT about.
    - "How do I use slide mode?" → about. "Create a pitch deck about Sloth Space" → generate.
    - "Can you see the files in my workspace" → chat (asking about AI's ability to see their content).
    - Rule of thumb: if the user references things INSIDE the workspace or their documents, it's about their data, not about the app.

"generate" — create NEW content from scratch. User provides a topic or confirms generation.
  Any mode. Includes: generate X, write X, introduce X, introduction to X, write about X, create article about X, make a presentation, add three pages.
  In DOC mode: if user gives ANY topic to write about → ALWAYS generate.
  Confirmations like "yes", "OK", "let's do it", "go", "sure", "yes", "right" → generate.
  TYPO TOLERANCE: Users may have typos! When in doubt between chat and generate, choose generate.
  IMPORTANT: If the user wants to CREATE/GENERATE/WRITE content about ANY topic (including Sloth Space), this is "generate" NOT "about".

"chat" — ONLY for pure greetings with NO topic and NOT asking about Sloth Space.
  "hello", "hi", "hey"
  CRITICAL: If the message mentions ANY subject/topic (even with typos), it is NOT chat — it is "generate".

PRIORITY RULES (follow in order):
1. Undo words (undo/redo etc.) → ALWAYS "undo", no exceptions.
2. Delete words (delete/remove) → "content_edit" with delete:true.
3. Asking what the current content says/summarize → "describe".
4. Questions about Sloth Space THE APP itself (features, how-to-use, what-is-this) → "about". BUT if user asks about specific files/items/content INSIDE workspace, that is NOT "about".
5. Topic/creation requests (including creating content ABOUT Sloth Space) → "generate". WHEN IN DOUBT, prefer "generate" over "chat".
5. Edit existing specific content → "content_edit".
6. Style/visual changes → "style" (slide only).
7. Image manipulation → "image" (slide only).
8. Batch edits → "deck_edit".
9. ONLY if NONE of the above apply → "chat".

MODE-SPECIFIC:
- "style" and "image" intents ONLY in slide mode. In doc mode use content_edit or generate.
- In DOC mode: insert table/divider, position image → content_edit. Topic creation → generate.
- NEVER choose "chat" when user wants content created, edited, or deleted.
- NEVER choose "chat" if the message contains a topic/subject. Always prefer "generate" or "about".

Output ONLY the JSON object.`;

// ── Pass 2a: conversation mode ──
const CHAT_PROMPT=`You are Sloth Space, a friendly AI presentation assistant. Reply in the user's language.

Rules:
- Be VERY concise. 1-2 sentences max.
- Ask AT MOST one question per reply.
- The ONLY thing you need from the user to start generating is a TOPIC. Everything else (slides count, style, audience) you can decide yourself.
- If the user mentions ANY topic at all (even with typos, even vague like "AI"), tell them: "Great! Let me know your topic in more detail and I'll generate content for you." or equivalent. Do NOT answer the topic as a knowledge question — the user wants content GENERATED, not explained.
- Do NOT ask multiple questions. Do NOT keep chatting round after round.
- Do NOT output JSON.
- If the user seems frustrated or confused, be encouraging and suggest they type a topic directly.`;

// ── Hardcoded Sloth Space intros (English = source of truth, non-EN → LLM translate) ──
const ABOUT_TEXTS={
  general:`🦥 **Sloth Space** — AI-Powered Content Creation Platform

**What is it?**
Sloth Space is an AI-native content creation tool that lets you build beautiful presentations, documents, and data sheets using natural language. No blank pages, no templates to hunt for — just tell me your topic and I'll generate complete, polished content for you.

**Four Modes:**
• **Slides** — Auto-generate multi-page presentations with 5 design themes and real-time style tweaks
• **Doc** — AI-powered long-form writing with rich block types (headings, tables, images, quotes)
• **Sheet** — Create and manage structured data tables right inside your workspace
• **Workspace** — Organize all your files into projects, cross-reference data, and let AI use your materials as context

**Key Features:**
• 🎨 Natural language styling — "make the background Monet blue", "bigger title font"
• 📎 Cross-file references — mention a doc or sheet by name and AI uses its data
• 🖼️ Smart image placement — drag, drop, or paste; AI picks the best position
• 📤 Export to PPTX — one-click PowerPoint export
• ↩️ Unlimited Undo/Redo — go back to any state

**How to start?**
Just type a topic below! Examples:
"Create a pitch deck about AI trends"
"Write an article about sustainable energy"`,

  slides:`📊 **Slides Mode**

Slides mode lets you create professional presentations entirely through natural language.

**How it works:**
1. Type a topic (e.g. "AI trends in healthcare") and I'll generate a complete deck — title slide, content slides, data tables, quotes, and a closing slide.
2. Edit any region by clicking on it and typing instructions like "rewrite this in English" or "add more detail".
3. Change styles naturally — "background to dark blue", "title font bigger", "Monet theme".

**Design Themes:** clean-white, clean-gray, clean-dark, monet (impressionist), seurat (pointillist)
**Layouts:** title, content, two-column, quote, data-table, image-top/left/right/bottom, closing
**Image Support:** Paste or drag images onto slides; AI auto-positions them based on aspect ratio and content density.

**Key commands:**
• Type a topic → generates a new deck
• Click a region + type instruction → edits that specific region
• "translate to English" → translates entire deck
• "export ppt" → downloads as .pptx file
• Undo/Redo available at any time`,

  doc:`📝 **Doc Mode**

Doc mode is an AI-powered document editor for long-form writing — articles, reports, memos, and more.

**How it works:**
1. Type a topic and I'll generate a complete document with proper structure: headings, paragraphs, lists, tables, quotes, and dividers.
2. Click any block to select it, then type an instruction to edit just that block.
3. Supports rich block types: heading1/2/3, paragraph, list, numbered list, quote, code, table, image, divider, and caption.

**Editing capabilities:**
• "Enrich this paragraph" → expands with more detail
• "Rewrite in a more professional tone" → rewrites selected block
• "Add a comparison table" → inserts a table block
• "Translate to Chinese" → translates entire document
• Drag-and-drop block reordering (coming soon)

**Tables:** Full support with headers, rows, floating (left/right/center), and captions.
**Images:** Insert with URL, supports float positioning and captions.
**Zoom:** Type "zoom 150%" or "zoom in/out" to adjust the editor view.`,

  sheet:`📈 **Sheet Mode**

Sheet mode lets you create and manage structured data tables with formulas.

**How it works:**
1. Switch to Sheet mode from the mode picker or create from Workspace.
2. Click a cell to select, double-click or press Enter to edit.
3. Press Enter to confirm and move down, Tab to move right, Escape to cancel.
4. Shift+Enter inserts a newline inside a cell.
5. Use the ƒx button in the toolbar or type = to see formula autocomplete.

**Formulas:** Start with = to use formulas. Available functions:
• =SUM(A1:A10) — sum of range
• =AVERAGE(A1:A10) — mean value
• =COUNT(A1:A10) — count non-empty cells
• =MIN / =MAX — smallest / largest value
• =STDEV(A1:A10) — standard deviation
• =MEDIAN(A1:A10) — median value
• Arithmetic: =A1+B1*2, =A1/A2

**Quick-create from chat:** /sheet Title followed by CSV data.
**Cross-referencing:** Mention a sheet name when making slides and AI will use the data.`,

  workspace:`📁 **Workspace**

Workspace is where you organize everything in Sloth Space — and the **Project** is the core concept.

**What is a Project?**
A Project is a folder that groups related files together. Think of it as a context container — when you open a Project and create content inside it, AI automatically reads all linked files as context. This means your presentations can reference your data sheets, your documents can pull from your research notes, and everything stays connected.

**How Projects work:**
• Create a Project for any initiative (e.g. "Q1 Report", "Product Launch", "Research Paper")
• Link files to a Project — Slides, Docs, Sheets, Images all live together
• AI auto-references linked files when generating new content inside that Project
• Search and filter across Projects as your workspace grows
• Unlink or reorganize files between Projects at any time

**File types you can create:**
• **Slides** — AI-generated presentations
• **Doc** — long-form documents and articles
• **Sheet** — structured data tables (CSV-style)
• **Images** — drag-drop or paste; stored with compression

**Quick-create commands:**
• /doc Title — creates a new document
• /sheet Title + CSV data — creates a new data sheet
• Use the "+" menu for slides, docs, sheets, or images`
};

// Translation prompt for about texts
const ABOUT_TRANSLATE_PROMPT=`You are a translator. Translate the following product introduction text to the target language.

CRITICAL — DO NOT translate these terms (keep them exactly as-is in English):
Sloth Space, Slides, Doc, Sheet, Workspace, Project, PPTX, PowerPoint, CSV, AI, Undo, Redo, Monet, Seurat

Keep ALL formatting exactly as-is: keep **, •, 🦥, 📊, 📝, 📈, 📁, emojis, markdown bold markers, numbered lists, line breaks.
Only translate the regular text content. Output ONLY the translated text, nothing else.`;

// Describe/summarize prompt for current content
const DESCRIBE_PROMPT=`You are Sloth Space's content assistant. The user wants to understand their current document. Read the content below and respond to their specific question. Use the same language the user asked in.

Rules:
- Be concise but informative.
- Do NOT output JSON. Just plain text.
- If the content is empty or minimal, tell the user there's not much content yet.

For SPREADSHEETS specifically:
- You can see the full sheet data including formulas (shown as "=FORMULA → result") and plain values.
- If the user asks about specific cells, columns, or rows, read and analyze that data directly.
- If the user asks for calculations (sum, average, count, min, max, standard deviation, median, etc.), compute them from the visible data.
- If the user asks what a column/row represents, infer from the header labels and data patterns.
- If the user asks which project or purpose the sheet belongs to, infer from the title, headers, and data content.
- If the user selects a range and asks a question, focus your answer on that range.
- When referencing cells, use standard notation (A1, B2, etc.) so the user can find them.
- Formulas in cells are shown as "=SUM(B2:C2) → 45". The left side is the formula, the right side is the computed value.

DATA TYPE RECOGNITION — cells may contain various data types. You MUST recognize and handle them intelligently:
- Dates: "2026/3/15", "2026.03.15", "3/15/2026", "2026-03-15", "Mar 15, 2026", "15 March 2026" etc. Recognize all common date formats. When computing with dates, understand chronological order, durations, and intervals.
- Times: "1:30", "13:30", "1:30 PM", "14:00", "9:30:45" etc. Understand 12h/24h formats.
- Date+Time: "2026/3/15 14:30", "2026-03-15T09:00" etc.
- Decimals: "3.14", "0.5", "1,234.56" (comma as thousands separator), "-2.5". Treat them as numbers for calculations.
- Currency: "$100", "NT$500", "€50", "¥1000". Strip the symbol for calculations, but mention the currency in your response.
- Percentages: "45%", "0.3" in a column labeled "rate" or "%". Interpret contextually.
- Mixed content: A column might have "Q1 2026" (quarter), "Week 12" (week number), "FY2025" (fiscal year). Infer meaning from context.
- Empty cells: Treat as blank/null. Do not include them in averages or counts unless the user explicitly asks.
When the user asks about patterns, trends, or comparisons, interpret these data types naturally — e.g. "which month had the highest sales" requires recognizing date columns and correlating with numeric columns.

MULTILINGUAL CONTENT — cells may contain text in ANY language (English, Chinese, Japanese, Korean, Spanish, etc.) or mixed languages within the same sheet. Read and understand all of them. Headers are column labels regardless of language. Respond in the language the user asked in, but reference cell content as-is regardless of its language.

CROSS-FILE PROJECT CONTEXT — if the user's file belongs to a project, you will also receive the contents of all sibling files (docs, sheets, slides) in that project under "## PROJECT". Use this to:
- Answer questions like "what is this project about", "what conclusions can we draw", "summarize the whole project"
- Cross-reference data: e.g. a sheet's numbers might explain a doc's narrative, or a doc might provide context for a slide deck
- When the user asks to "generate slides based on the data" or "write a summary from the sheets", synthesize across ALL provided files
- Clearly distinguish which insights come from which file when summarizing multiple files
- If the user's question is only about the CURRENT file, focus on it but mention related files if they add useful context
- The user may ask from the workspace page (no current file open). In that case, you will only have PROJECT CONTEXT. Summarize the entire project: what it contains, key findings, conclusions, and how the files relate to each other.`;

// Helper: serialize current content as readable text for LLM
function getCurrentContentText(){
  if(S.currentMode==='slide'&&S.currentDeck&&S.currentDeck.slides.length>0){
    const lines=S.currentDeck.slides.map((s,i)=>{
      const parts=[`[Slide ${i+1} — ${s.layout}]`];
      for(const[k,v]of Object.entries(s.content)){
        if(typeof v==='string') parts.push(`  ${k}: ${v}`);
        else if(v&&v.type==='list'&&v.items) parts.push(`  ${k}: `+v.items.join(', '));
        else if(v&&v.type==='table') parts.push(`  ${k}: [table ${v.headers?.length||0} cols × ${v.rows?.length||0} rows]`);
        else parts.push(`  ${k}: ${JSON.stringify(v)}`);
      }
      return parts.join('\n');
    });
    return `Slide deck "${S.currentDeck.title||'Untitled'}" (${S.currentDeck.slides.length} slides):\n\n`+lines.join('\n\n');
  }
  if(S.currentMode==='doc'&&S.currentDoc&&S.currentDoc.blocks.length>0){
    const lines=S.currentDoc.blocks.map(b=>{
      const text=window.blockPlainText(b);
      return `[${b.type}] ${text}`;
    }).filter(l=>l.trim().length>3);
    return `Document "${S.currentDoc.title||'Untitled'}" (${S.currentDoc.blocks.length} blocks):\n\n`+lines.join('\n');
  }
  if(S.currentMode==='sheet'&&S.sheet&&S.sheet.current){
    const sh=S.sheet.current;
    const serialized=window.shSerializeForAI ? window.shSerializeForAI() : '';
    if(serialized){
      const lines=serialized.split('\n');
      const preview=lines.slice(0,60).join('\n')+(lines.length>60?'\n... (truncated)':'');
      let result=`Sheet "${sh.title||'Untitled'}" (${sh.rows.length} rows × ${sh.columns.length} cols):\n\n`+preview;
      // Add selection context
      const selCtx=window.shGetSelectionContext ? window.shGetSelectionContext() : '';
      if(selCtx) result+='\n\n'+selCtx;
      return result;
    }
  }
  return '';
}

// ── Pass 2b: slide generation mode ──
const GEN_PROMPT=`You are Sloth Space, an AI presentation designer. Output ONLY valid JSON — no text, no markdown, no code fences, no explanation.

## RULES
- Use ONLY these preset IDs: clean-white, clean-gray, clean-dark, monet, seurat
  - Business/medical/academic → clean-white
  - Tech/product launch → clean-dark
  - Creative/artistic → monet or seurat
  - If unsure → clean-white
- Use ONLY these layout IDs and their regions:
  - title: title (required), subtitle, tagline, date
  - content: heading (required), body (required), footnote
  - two-column: heading (required), left_label, left (required), right_label, right (required)
  - image-top: heading (required), image, body (required)
  - image-left: heading (required), image, body (required)
  - image-right: heading (required), body (required), image
  - image-bottom: heading (required), body (required), image
  - quote: quote (required), author, role
  - data-table: heading (required), description, table (required), source
  - closing: heading (required), subtitle, contact
- Content types: plain string, list {"type":"list","items":[...]}, table {"type":"table","headers":[...],"rows":[...]}, image {"type":"image","src":"...","alt":"..."}
- Style tags: [color: #hex] → style_overrides.heading_color, [bg: #hex] → style_overrides.background, [font: name] → style_overrides.font
- Users may describe colors in natural language instead of hex codes. You MUST convert them:
  - yellow → #FFD700, red → #CC0000, blue → #1E90FF, green → #2E8B57
  - black → #000000, white → #FFFFFF, gray → #888888, orange → #FF8C00
  - Monet blue → #5B7FA5, Monet lavender → #8E7CC3, Monet pink → #D4A5A5
  - Seurat gold → #C5943A, Seurat brown → #8B6914
  - For any other color description, pick the closest reasonable hex code
- "yellow background" → apply style_overrides.background="#FFD700" on ALL slides
- "use Monet blue text" → apply style_overrides.heading_color="#5B7FA5" on ALL slides
- When user says "background X color", apply to ALL slides. When user says "slide 3 background", apply only to slide 3.
- Default 5-8 slides. Always start with title layout, end with closing layout.
- Respect the user's language for all slide content.
- When editing, output the COMPLETE updated JSON.

## CONTENT QUALITY — THIS IS THE MOST IMPORTANT SECTION

BAD example (TOO SHORT — NEVER do this):
{"heading":"Problem Background","body":{"type":"list","items":["AI semantic issues","Model hallucination","Safety risks"]}}

GOOD example (THIS is the minimum quality):
{"heading":"Three Root Causes of AI Semantic Collapse","body":{"type":"list","items":["Training Data Bias: Large language models are trained on corpora containing massive contradictory information, causing logical breaks in reasoning, especially in cross-language translation scenarios where the problems become much more severe.","Attention Mechanism Limitations: The self-attention mechanism in Transformer architecture significantly reduces semantic coherence when processing long texts exceeding 4000 tokens, with research showing perplexity increases up to 40%.","RLHF Side Effects: While reinforcement learning from human feedback improves answer politeness, it also trains models to confidently produce hallucinated content that sounds fluent but lacks factual grounding."]},"notes":"Emphasize that these three causes are interconnected, not independent issues"}

Rules:
- Every bullet MUST be 1-2 full sentences with specific facts, data, examples, or analysis
- NEVER write short labels like "Introduction" or "Key challenges" — always elaborate
- Each content/two-column slide must have 3-5 detailed bullet items
- Use varied layouts: mix content, two-column, quote, data-table. NOT all bullet lists
- Include speaker notes on every slide
- data-table must have realistic numbers
- The user expects a COMPLETE, PRESENTABLE deck — not an outline

## OUTPUT SCHEMA
{"sloth_version":"0.1.0","type":"slides","title":"...","preset":"clean-white","locale":"en","slides":[{"layout":"title","content":{"title":"...","subtitle":"..."},"notes":"...","style_overrides":{}}]}`;

function addMessage(text,type){
  const div=document.createElement('div');
  div.className='msg '+type;
  div.textContent=text;
  const msgs=document.getElementById('chatMessages');
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
  return div;
}

// ═══════════════════════════════════════════
// CHAT TABS (max 3 tabs)
// ═══════════════════════════════════════════

const MAX_CHAT_TABS=3;

function makeTab(title){
  return {id:Date.now()+'_'+Math.random().toString(36).slice(2,6), title:title||'New', history:[], messagesHTML:''};
}

// Initialize chat tabs on first load
export function initChatTabs(){
  // Try to restore from localStorage
  try{
    const saved=localStorage.getItem(CHAT_TABS_KEY);
    if(saved){
      const data=JSON.parse(saved);
      if(data.tabs&&data.tabs.length>0){
        S.chatTabs=data.tabs;
        S.activeChatTab=Math.min(data.active||0,data.tabs.length-1);
        // Restore active tab's messages + history
        const tab=S.chatTabs[S.activeChatTab];
        S.chatHistory=tab.history||[];
        const msgs=document.getElementById('chatMessages');
        if(msgs&&tab.messagesHTML) msgs.innerHTML=tab.messagesHTML;
        renderChatTabs();
        return;
      }
    }
  }catch(e){console.warn('Chat tabs load failed:',e);}
  // Default: one empty tab
  S.chatTabs=[makeTab('Chat')];
  S.activeChatTab=0;
  S.chatHistory=[];
  renderChatTabs();
}

// Save all tabs to localStorage (called after every message / tab switch)
let _cloudSyncTimer=null;
export function saveChatTabs(){
  // Snapshot current tab before saving
  _snapshotActiveTab();
  try{
    localStorage.setItem(CHAT_TABS_KEY,JSON.stringify({
      tabs:S.chatTabs.map(t=>({id:t.id,title:t.title,history:(t.history||[]).slice(-30),messagesHTML:t.messagesHTML||''})),
      active:S.activeChatTab
    }));
  }catch(e){console.warn('Chat tabs save failed:',e);}
  // Debounced cloud sync (every 10s max)
  if(_cloudSyncTimer) clearTimeout(_cloudSyncTimer);
  _cloudSyncTimer=setTimeout(()=>{ syncChatTabsToCloud(); },10000);
}

// Snapshot current active tab's state from the DOM
function _snapshotActiveTab(){
  const tab=S.chatTabs[S.activeChatTab];
  if(!tab)return;
  tab.history=S.chatHistory;
  const msgs=document.getElementById('chatMessages');
  if(msgs) tab.messagesHTML=msgs.innerHTML;
}

// AI-generated tab title (1-2 English words)
let _titleGenTimer=null;
function scheduleTabTitleGen(){
  // Debounce: wait 2s after last message, then generate title
  if(_titleGenTimer) clearTimeout(_titleGenTimer);
  _titleGenTimer=setTimeout(()=>{ _genTabTitle(); },2000);
}
async function _genTabTitle(){
  const tab=S.chatTabs[S.activeChatTab];
  if(!tab)return;
  // Only generate if still default title or short snippet
  if(tab.title!=='New'&&tab.title!=='Chat'&&tab._titleDone)return;
  // Need at least 1 user message
  const msgs=tab.history.filter(m=>m.role==='user');
  if(msgs.length===0)return;
  const sample=msgs.map(m=>(m.content||'').slice(0,60)).join(' | ').slice(0,200);
  try{
    const title=await callLLM(
      'You name chat conversations. Given the user messages below, output ONLY 1-2 English words as a short tab title. No quotes, no punctuation, no explanation. Examples: "Weather Deck", "AI Trends", "Q1 Report", "Stock Doc", "Resume".',
      [{role:'user',content:sample}],
      {max_tokens:10,temperature:0.3,useRouter:true}
    );
    const clean=title.replace(/["""'`.!?\n]/g,'').trim().slice(0,14);
    if(clean&&clean.length>=2){
      tab.title=clean;
      tab._titleDone=true;
      renderChatTabs();
      saveChatTabs();
    }
  }catch(e){
    // Fallback: use first 6 chars of first message
    const fallback=(msgs[0].content||'').trim().slice(0,6);
    if(fallback){ tab.title=fallback; tab._titleDone=true; renderChatTabs(); saveChatTabs(); }
  }
}

// Render the tab bar UI
function renderChatTabs(){
  let bar=document.getElementById('chatTabBar');
  if(!bar){
    // Create tab bar and insert before chatMessages
    bar=document.createElement('div');
    bar.id='chatTabBar';
    bar.className='chat-tab-bar';
    const panel=document.getElementById('chatPanel');
    const msgs=document.getElementById('chatMessages');
    if(panel&&msgs) panel.insertBefore(bar,msgs);
  }
  bar.innerHTML='';
  S.chatTabs.forEach((tab,i)=>{
    const el=document.createElement('div');
    el.className='chat-tab'+(i===S.activeChatTab?' active':'');
    el.title=tab.title||'New';

    const label=document.createElement('span');
    label.className='chat-tab-label';
    label.textContent=tab.title||'New';
    el.appendChild(label);

    // Close button (always available)
    const closeBtn=document.createElement('span');
    closeBtn.className='chat-tab-close';
    closeBtn.textContent='×';
    closeBtn.onclick=function(e){ e.stopPropagation(); closeChatTab(i); };
    el.appendChild(closeBtn);

    el.onclick=function(){ switchChatTab(i); };
    bar.appendChild(el);
  });

  // Add tab button (if under max)
  if(S.chatTabs.length<MAX_CHAT_TABS){
    const addBtn=document.createElement('div');
    addBtn.className='chat-tab chat-tab-add';
    addBtn.textContent='+';
    addBtn.title='New chat tab';
    addBtn.onclick=function(){ addChatTab(); };
    bar.appendChild(addBtn);
  }
}

// Switch to a different tab
export function switchChatTab(index){
  if(index===S.activeChatTab)return;
  // Save current tab
  _snapshotActiveTab();
  // Switch
  S.activeChatTab=index;
  const tab=S.chatTabs[index];
  S.chatHistory=tab.history||[];
  // Restore messages
  const msgs=document.getElementById('chatMessages');
  if(msgs) msgs.innerHTML=tab.messagesHTML||'';
  renderChatTabs();
  saveChatTabs();
}

// Add a new tab
export function addChatTab(){
  if(S.chatTabs.length>=MAX_CHAT_TABS)return;
  _snapshotActiveTab();
  const tab=makeTab('New');
  S.chatTabs.push(tab);
  S.activeChatTab=S.chatTabs.length-1;
  S.chatHistory=[];
  const msgs=document.getElementById('chatMessages');
  if(msgs) msgs.innerHTML='';
  renderChatTabs();
  saveChatTabs();
}

// Close a tab
export function closeChatTab(index){
  // If only one tab, clear it (becomes a fresh tab)
  if(S.chatTabs.length<=1){
    S.chatTabs=[makeTab('New')];
    S.activeChatTab=0;
    S.chatHistory=[];
    const msgs=document.getElementById('chatMessages');
    if(msgs) msgs.innerHTML='';
    renderChatTabs();
    saveChatTabs();
    return;
  }
  S.chatTabs.splice(index,1);
  // Adjust active index
  if(S.activeChatTab>=S.chatTabs.length) S.activeChatTab=S.chatTabs.length-1;
  if(S.activeChatTab===index||S.activeChatTab>=S.chatTabs.length){
    S.activeChatTab=Math.min(index,S.chatTabs.length-1);
  }
  // Load the now-active tab
  const tab=S.chatTabs[S.activeChatTab];
  S.chatHistory=tab.history||[];
  const msgs=document.getElementById('chatMessages');
  if(msgs) msgs.innerHTML=tab.messagesHTML||'';
  renderChatTabs();
  saveChatTabs();
}

// Cloud sync: save tabs to Supabase
export async function syncChatTabsToCloud(){
  if(!S.supabaseClient||!S.currentUser)return;
  _snapshotActiveTab();
  try{
    const payload=JSON.stringify({
      tabs:S.chatTabs.map(t=>({id:t.id,title:t.title,history:(t.history||[]).slice(-30)})),
      active:S.activeChatTab,
      savedAt:new Date().toISOString()
    });
    const path=S.currentUser.id+'/chat_tabs.json';
    const blob=new Blob([payload],{type:'application/json'});
    await S.supabaseClient.storage.from('decks').upload(path,blob,{upsert:true});
  }catch(e){console.warn('Chat tabs cloud sync failed:',e);}
}

// Cloud sync: load tabs from Supabase
export async function loadChatTabsFromCloud(){
  if(!S.supabaseClient||!S.currentUser)return false;
  try{
    const path=S.currentUser.id+'/chat_tabs.json';
    const{data,error}=await S.supabaseClient.storage.from('decks').download(path);
    if(error||!data)return false;
    const text=await data.text();
    const parsed=JSON.parse(text);
    if(parsed.tabs&&parsed.tabs.length>0){
      // Cloud tabs don't have messagesHTML, rebuild from history
      S.chatTabs=parsed.tabs.map(t=>{
        const tab={id:t.id,title:t.title,history:t.history||[],messagesHTML:''};
        // Rebuild messagesHTML from history
        tab.messagesHTML=t.history.map(m=>{
          const cls=m.role==='user'?'msg user':'msg ai';
          const escaped=(m.content||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          return `<div class="${cls}">${escaped}</div>`;
        }).join('');
        return tab;
      });
      S.activeChatTab=Math.min(parsed.active||0,S.chatTabs.length-1);
      const tab=S.chatTabs[S.activeChatTab];
      S.chatHistory=tab.history||[];
      const msgs=document.getElementById('chatMessages');
      if(msgs) msgs.innerHTML=tab.messagesHTML||'';
      renderChatTabs();
      saveChatTabs(); // Cache locally
      return true;
    }
  }catch(e){console.warn('Chat tabs cloud load failed:',e);}
  return false;
}

function validateDeck(deck){
  if(!deck||typeof deck!=='object')return 'Response is not a JSON object';
  if(!deck.slides||!Array.isArray(deck.slides)||deck.slides.length===0)return 'No slides array found';
  if(deck.preset&&!VALID_PRESETS.includes(deck.preset))return `Invalid preset: ${deck.preset}`;
  for(let i=0;i<deck.slides.length;i++){
    const s=deck.slides[i];
    if(!s.layout)return `Slide ${i+1} has no layout`;
    if(!VALID_LAYOUTS.includes(s.layout))return `Slide ${i+1} has invalid layout: ${s.layout}`;
    if(!s.content||typeof s.content!=='object')return `Slide ${i+1} has no content`;
  }
  // ensure required fields
  if(!deck.sloth_version)deck.sloth_version='0.1.0';
  if(!deck.type)deck.type='slides';
  if(!deck.title)deck.title='Untitled';
  if(!deck.preset)deck.preset='clean-white';
  if(!deck.locale)deck.locale='en';
  return null; // valid
}

function extractJSON(text){
  if(!text||typeof text!=='string')return null;
  // Try direct parse first
  try{ return JSON.parse(text); }catch(e){}
  // Try to extract from code fences
  const fenceMatch=text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if(fenceMatch){
    try{ return JSON.parse(fenceMatch[1].trim()); }catch(e){}
  }
  // Try to find first [ ... last ] (for array responses)
  const firstBracket=text.indexOf('[');
  const lastBracket=text.lastIndexOf(']');
  if(firstBracket!==-1&&lastBracket>firstBracket){
    try{ return JSON.parse(text.slice(firstBracket,lastBracket+1)); }catch(e){}
  }
  // Try to find first { ... last }
  const first=text.indexOf('{');
  const last=text.lastIndexOf('}');
  if(first!==-1&&last>first){
    try{ return JSON.parse(text.slice(first,last+1)); }catch(e){}
  }
  return null;
}

// Helper: call LLM API (provider-agnostic, OpenAI-compatible)
async function callLLM(systemContent,messages,opts={}){
  if(!isConfigured()){throw new Error('No LLM configured. Click ⚙ Settings to set up.');}
  const useRouter=opts.useRouter||false;
  const model=opts.model||(useRouter?S.llmConfig.router:S.llmConfig.model);
  const headers={'Content-Type':'application/json'};

  let body;
  if(S.llmConfig.provider==='claude'){
    // Anthropic Messages API — different format
    headers['x-api-key']=S.llmConfig.apiKey;
    headers['anthropic-version']='2023-06-01';
    headers['anthropic-dangerous-direct-browser-access']='true';
    const claudeBody={model,system:systemContent,messages:messages.map(m=>({role:m.role==='system'?'user':m.role,content:m.content})),temperature:opts.temperature??0.7,max_tokens:opts.max_tokens||4096};
    body=JSON.stringify(claudeBody);
  }else{
    // OpenAI-compatible format (Groq, OpenAI, Grok, Ollama, Custom)
    if(S.llmConfig.apiKey)headers['Authorization']=`Bearer ${S.llmConfig.apiKey}`;
    const oaiBody={model,messages:[{role:'system',content:systemContent},...messages],temperature:opts.temperature??0.7,max_tokens:opts.max_tokens||4096};
    if(opts.json)oaiBody.response_format={type:'json_object'};
    body=JSON.stringify(oaiBody);
  }

  const res=await fetch(S.llmConfig.url,{method:'POST',headers,body});
  if(!res.ok){const e=await res.text();throw new Error(`API ${res.status}: ${e.slice(0,200)}`);}
  const data=await res.json();

  // Claude returns content[0].text, OpenAI-compatible returns choices[0].message.content
  if(S.llmConfig.provider==='claude'){
    return data.content?.[0]?.text||'';
  }
  return data.choices?.[0]?.message?.content||'';
}

// ═══════════════════════════════════════════
// IMAGE COMMANDS
// ═══════════════════════════════════════════

// LLM prompt for interpreting image commands (any language, any phrasing)
const IMAGE_PROMPT=`You are an image placement/manipulation interpreter for a presentation app.
The user's message is about an image on a slide. Convert it into a JSON action.

Output ONLY a JSON object with one of these action types:

PLACEMENT (when user wants to put an image on a slide):
- {"action":"place","slide":N,"position":"left"|"right"|"top"|"bottom"|"auto"}
  slide: slide number (1-indexed). Default: current slide.
  position: where to place the image. "auto" if not specified.

MANIPULATION (when user wants to adjust an existing image):
- {"action":"scale","factor":0.85}         — scale uniformly (0.85 = shrink 15%, 1.15 = grow 15%)
- {"action":"scale_w","factor":1.1}        — scale width only (wider/narrower)
- {"action":"scale_h","factor":1.1}        — scale height only (taller/shorter)
- {"action":"move","dx":0,"dy":0}          — move by pixels. left=-20, right=+20, up=-20, down=+20. Adjust amount based on phrasing ("a lot" = 60, "a bit" = 15, default = 25)
- {"action":"fit","mode":"contain"|"cover"|"fill"} — change fit mode
- {"action":"remove"}                      — remove image from slide

If the message is NOT about image manipulation, output {"action":"none"}.

Examples:
"move image right a bit" → {"action":"move","dx":25,"dy":0}
"move image left a lot" → {"action":"move","dx":-60,"dy":0}
"make smaller" → {"action":"scale","factor":0.85}
"make bigger a bit" → {"action":"scale","factor":1.15}
"bigger" → {"action":"scale","factor":1.15}
"make it half the size" → {"action":"scale","factor":0.5}
"wider" → {"action":"scale_w","factor":1.1}
"narrower" → {"action":"scale_w","factor":0.9}
"fit proportionally" → {"action":"fit","mode":"contain"}
"fill" → {"action":"fit","mode":"fill"}
"crop" → {"action":"fit","mode":"cover"}
"put it on slide 3 left side" → {"action":"place","slide":3,"position":"left"}
"put it on slide 5" → {"action":"place","slide":5,"position":"auto"}
"delete this image" → {"action":"remove"}
"move image up a bit and left a bit" → {"action":"move","dx":-25,"dy":-25}

Output ONLY the JSON object.`;

// ═══════════════════════════════════════════
// AUTO-DESIGNER — Smart image placement
// ═══════════════════════════════════════════

// Analyze image aspect ratio and slide content to pick optimal placement
function autoDesignImagePlacement(img,slide,p){
  const W=p.slide.width, H=p.slide.height;
  const ar=img.width/img.height; // aspect ratio: >1 = landscape, <1 = portrait, ~1 = square
  const layout=slide.layout;
  const hasTitle=!!(slide.content.title||slide.content.heading);
  const hasBody=!!(slide.content.body||slide.content.left||slide.content.right);
  const hasExistingImages=slide.images&&slide.images.length>0;

  // Smart sizing based on aspect ratio
  let imgW, imgH, x, y, position;

  if(ar>=2.5){
    // Ultra-wide / panoramic → full-width banner at top or bottom
    imgW=W*0.85;
    imgH=imgW/ar;
    x=Math.round((W-imgW)/2);
    if(!hasBody){ y=H*0.35; position='center'; }
    else{ y=hasTitle?60:20; position='top'; }
  }else if(ar>=1.4){
    // Landscape → top banner or bottom half
    imgW=W*0.65;
    imgH=imgW/ar;
    x=Math.round((W-imgW)/2);
    if(hasTitle&&hasBody){ y=H-imgH-50; position='bottom'; }
    else if(hasTitle){ y=Math.round(H*0.3); position='center'; }
    else{ y=40; position='top'; }
  }else if(ar>=0.7){
    // Square-ish → flexible, depends on content density
    imgW=Math.min(W*0.4, H*0.5);
    imgH=imgW/ar;
    if(!hasBody){
      // Sparse slide → center-right, larger
      imgW=W*0.45; imgH=imgW/ar;
      x=W-imgW-60; y=Math.round((H-imgH)/2);
      position='right';
    }else{
      // Content-heavy → smaller, tucked into corner
      x=W-imgW-50; y=H-imgH-50;
      position='bottom-right';
    }
  }else{
    // Portrait → side placement
    imgH=Math.min(H*0.7, img.height);
    imgW=imgH*ar;
    y=Math.round((H-imgH)/2);
    // If two-column layout, place on the emptier side
    if(layout==='two-column'){
      const leftLen=JSON.stringify(slide.content.left||'').length;
      const rightLen=JSON.stringify(slide.content.right||'').length;
      if(leftLen<=rightLen){ x=50; position='left'; }
      else{ x=W-imgW-50; position='right'; }
    }else{
      x=W-imgW-50; position='right';
    }
  }

  // Avoid overlap with existing images
  if(hasExistingImages){
    const offset=slide.images.length*30;
    x=Math.min(x+offset, W-imgW-20);
    y=Math.min(y+offset, H-imgH-20);
  }

  return { imgW:Math.round(imgW), imgH:Math.round(imgH), x:Math.round(x), y:Math.round(y), position };
}

// Place staged images into a slide as a floating overlay (preserves existing content & layout)
function placeImageOnSlide(images,targetSlide,position){
  if(!S.currentDeck||images.length===0)return null;
  window.pushUndo();
  targetSlide=Math.max(0,Math.min(targetSlide,S.currentDeck.slides.length-1));
  const slide=S.currentDeck.slides[targetSlide];
  const img=images[0];
  const p=PRESETS[S.currentPreset];
  const W=p.slide.width, H=p.slide.height;

  let x, y, imgW, imgH;

  if(position!=='auto'&&position){
    // User explicitly specified position — respect it
    imgW=Math.min(img.width, W*0.4);
    imgH=imgW*(img.height/img.width);
    if(position==='left'){ x=40; y=Math.round((H-imgH)/2); }
    else if(position==='right'){ x=W-imgW-40; y=Math.round((H-imgH)/2); }
    else if(position==='top'){ x=Math.round((W-imgW)/2); y=40; }
    else if(position==='bottom'){ x=Math.round((W-imgW)/2); y=H-imgH-40; }
    else if(position==='center'){ x=Math.round((W-imgW)/2); y=Math.round((H-imgH)/2); }
    else if(position==='full'){ imgW=W; imgH=H; x=0; y=0; }
    else{ x=W-imgW-60; y=H-imgH-60; }
  }else{
    // AUTO-DESIGNER: Analyze image + slide content for smart placement
    const auto=autoDesignImagePlacement(img,slide,p);
    imgW=auto.imgW; imgH=auto.imgH;
    x=auto.x; y=auto.y;
    position=auto.position;
  }

  // Store as floating image overlay
  if(!slide.images) slide.images=[];
  slide.images.push({
    id:'img_'+Date.now(),
    dataUrl:img.dataUrl, name:img.name,
    origW:img.width, origH:img.height,
    x:Math.round(x), y:Math.round(y),
    w:Math.round(imgW), h:Math.round(imgH),
    fit:'contain'
  });
  S.currentSlide=targetSlide;

  const ar=img.width/img.height;
  const arLabel=ar>=1.4?'landscape':ar<=0.7?'portrait':'square';
  let msg=`✓ Auto-placed "${img.name}" (${arLabel}) → ${position} on slide ${targetSlide+1}`;
  if(images.length>1){
    msg+=`. ${images.length-1} more image(s) still staged.`;
    S.stagedImages=images.slice(1);
    window.renderStagedImages();
  }
  return msg;
}

function hasImageOnCurrentSlide(){
  if(!S.currentDeck||!S.currentDeck.slides[S.currentSlide])return false;
  const slide=S.currentDeck.slides[S.currentSlide];
  return (slide.images&&slide.images.length>0);
}

// Apply a parsed image action to the last image on current slide
function applyImageAction(actionObj){
  const slide=S.currentDeck.slides[S.currentSlide];
  if(!slide)return '⚠ No slide selected.';
  if(!slide.images||slide.images.length===0){
    return '⚠ No image on current slide. Attach an image first with the + button.';
  }
  window.pushUndo();
  const a=actionObj;
  // Operate on the last-placed image (most recent)
  const img=slide.images[slide.images.length-1];

  if(a.action==='scale'){
    const f=a.factor||1;
    img.w=Math.round(img.w*f);
    img.h=Math.round(img.h*f);
    return `✓ Image resized (${img.w}×${img.h})`;
  }
  if(a.action==='scale_w'){
    img.w=Math.round(img.w*(a.factor||1));
    return `✓ Image width → ${img.w}px`;
  }
  if(a.action==='scale_h'){
    img.h=Math.round(img.h*(a.factor||1));
    return `✓ Image height → ${img.h}px`;
  }
  if(a.action==='move'){
    img.x=Math.round(img.x+(a.dx||0));
    img.y=Math.round(img.y+(a.dy||0));
    return `✓ Image moved to (${img.x}, ${img.y})`;
  }
  if(a.action==='fit'){
    img.fit=a.mode||'contain';
    return `✓ Image fit → ${img.fit}`;
  }
  if(a.action==='remove'){
    slide.images.pop();
    return '✓ Image removed from slide';
  }
  return null;
}

// ═══════════════════════════════════════════
// MAIN MESSAGE PROCESSING PIPELINE
// ═══════════════════════════════════════════

async function sendMessage(){
  const input=document.getElementById('chatInput');
  const text=input.value.trim();
  const hasImages=S.stagedImages.length>0;
  // Allow empty text if images are staged (Auto-Designer: skip LLM)
  if(!text&&!hasImages)return;
  input.value='';
  if(text){ addMessage(text,'user'); S.chatHistory.push({role:'user',content:text}); }

  // ── PASS -1: Local UI commands (no LLM needed) ──
  const trimText=text.trim();
  if(/^(undo|redo)$/i.test(trimText)){
    if(trimText.toLowerCase()==='undo'){ if(S.currentMode==='doc') window.docUndo(); else window.undo(); }
    else { if(S.currentMode==='doc') window.docRedo(); else window.redo(); }
    return;
  }
  if(/^(save|save\s*sloth)$/i.test(trimText)){
    window.saveSloth(); return;
  }
  if(/^(new)$/i.test(trimText)){
    window.newDeck(); return;
  }
  if(/^(load|open)$/i.test(trimText)){
    window.loadDeck(); return;
  }
  if(/^(export|export\s*json|json)$/i.test(trimText)){
    window.exportJSON(); addMessage('✓ Exported JSON','system'); return;
  }
  if(/^(export\s*ppt|pptx?|export\s*slides)$/i.test(trimText)){
    window.exportPPTX(); return;
  }
  if(/^(settings?|config)$/i.test(trimText)){
    window.openSettings(); return;
  }
  // Doc zoom commands
  if(S.currentMode==='doc'){
    const zoomMatch=trimText.match(/^(?:zoom|zoom\s*in)\s*(\d+)?%?$/i);
    if(zoomMatch){ window.docZoomLevel=parseInt(zoomMatch[1])||Math.min(200,window.docZoomLevel+10); window.applyDocZoom(); addMessage(`🔍 Zoom: ${window.docZoomLevel}%`,'system'); return; }
    const zoomOutMatch=trimText.match(/^(?:zoom\s*out)\s*(\d+)?%?$/i);
    if(zoomOutMatch){ window.docZoomLevel=Math.max(50,parseInt(zoomOutMatch[1])||window.docZoomLevel-10); window.applyDocZoom(); addMessage(`🔍 Zoom: ${window.docZoomLevel}%`,'system'); return; }
    const zoomSetMatch=trimText.match(/^(?:zoom)\s*[:=]?\s*(\d+)%?$/i);
    if(zoomSetMatch){ window.docZoomLevel=Math.max(50,Math.min(200,parseInt(zoomSetMatch[1]))); window.applyDocZoom(); addMessage(`🔍 Zoom: ${window.docZoomLevel}%`,'system'); return; }
    if(/^(?:zoom\s*reset|reset\s*zoom|100%)$/i.test(trimText)){ window.docZoomReset(); addMessage('🔍 Zoom reset to 100%','system'); return; }
  }

  // Workspace quick-create: "/doc Title\nContent..." or "/sheet Title\nCSV..."
  const docMatch=trimText.match(/^\/(doc)\s+(.+)/is);
  if(docMatch){
    const lines=docMatch[2].split('\n');
    const title=lines[0].trim();
    const body=lines.slice(1).join('\n').trim()||title;
    const doc=window.wsCreateDoc(title,body);
    addMessage(`✓ Created doc "${doc.title}" (${doc.content.blocks.length} blocks). Reference it by name when making slides!`,'system');
    return;
  }
  const sheetMatch=trimText.match(/^\/(sheet)\s+(.+)/is);
  if(sheetMatch){
    const lines=sheetMatch[2].split('\n');
    const title=lines[0].trim();
    const body=lines.slice(1).join('\n').trim();
    if(!body){addMessage('Sheet needs data! Format: /sheet Title\\nHeader1,Header2\\nRow1,Row2','system');return;}
    const sheet=window.wsCreateSheet(title,body);
    addMessage(`✓ Created sheet "${sheet.title}" (${sheet.content.columns.length} cols, ${sheet.content.rows.length} rows). Reference it by name!`,'system');
    return;
  }

  // ── Consume any staged images before routing ──
  const pendingImages=window.consumeStagedImages();

  const statusDiv=addMessage('Thinking...','system');
  const sendBtn=document.querySelector('.send-btn');
  sendBtn.disabled=true;
  sendBtn.innerHTML='...';

  // ── Project-scoped AI context injection ──
  let wsContext='';
  let _resolvedProjectId=S.wsActiveProjectId||null;

  // 1) Active project context (user explicitly activated a project)
  const projectCtx=window.wsGetActiveProjectContext ? window.wsGetActiveProjectContext() : '';
  if(projectCtx){
    wsContext+='\n\n## PROJECT CONTEXT\nThe user is working inside a project. All linked files are provided below as context. Use this data when generating or editing content.\n\n'+projectCtx;
  }

  // 2) Project name detection from user text — if user mentions a project by name, inject it
  //    This enables "what is project X about?" from workspace mode without activating the project
  if(!wsContext && window.wsListProjects){
    const allProjects=window.wsListProjects();
    const lowerText=text.toLowerCase();
    for(const proj of allProjects){
      if(proj.name && lowerText.includes(proj.name.toLowerCase())){
        const pCtx=window.wsProjectContext ? window.wsProjectContext(proj.id) : '';
        if(pCtx){
          _resolvedProjectId=proj.id;
          const fileCount=window.wsGetProjectFiles ? window.wsGetProjectFiles(proj.id).length : 0;
          wsContext+=`\n\n## PROJECT CONTEXT: "${proj.name}" (${fileCount} files)\nThe user is asking about this project. All files in this project are provided below.\n\n`+pCtx;
          addMessage(`📁 Reading project "${proj.name}" (${fileCount} file${fileCount!==1?'s':''})...`,'system');
        }
        break;
      }
    }
  }

  // 3) Current file's project (auto-detect from the file being viewed)
  if(!wsContext){
    const currentFileId=window.wsGetCurrentFileId ? window.wsGetCurrentFileId() : null;
    if(currentFileId && window.wsGetFileProjects){
      const fileProjects=window.wsGetFileProjects(currentFileId);
      if(fileProjects.length>0){
        const proj=fileProjects[0];
        const pCtx=window.wsProjectContext ? window.wsProjectContext(proj.id) : '';
        if(pCtx){
          _resolvedProjectId=proj.id;
          wsContext+='\n\n## PROJECT CONTEXT\nThe current file belongs to this project. All sibling files are provided below.\n\n'+pCtx;
        }
      }
    }
  }

  // ── Workspace cross-file reference detection (additive to project context) ──
  const wsRefs=window.wsDetectReferences(text);
  if(wsRefs.length>0){
    // Filter out files already in project context to avoid duplication
    const projectFileIds=new Set();
    if(_resolvedProjectId && window.wsGetProjectFiles){
      window.wsGetProjectFiles(_resolvedProjectId).forEach(f=>projectFileIds.add(f.id));
    }
    const extraRefs=wsRefs.filter(f=>!projectFileIds.has(f.id));
    if(extraRefs.length>0){
      wsContext+='\n\n## ADDITIONAL REFERENCED FILES\nThe user also referenced these files by name:\n\n';
      extraRefs.forEach(f=>{ wsContext+=window.wsFileToContext(f)+'\n\n'; });
    }
    const refNames=wsRefs.map(f=>`"${f.title}"`).join(', ');
    addMessage(`📎 Using workspace data: ${refNames}`,'system');
  }

  try{
    // ── If user attached images, go to image path ──
    if(pendingImages.length>0){
      // AUTO-DESIGNER: No text / minimal text → skip LLM entirely, use smart auto-placement
      const isMinimalText=!text||text.length<3||/^(drop|add|place|put|image|img|pic|photo|ok|go|here|yes|sure)$/i.test(text);
      if(isMinimalText){
        statusDiv.remove();
        const msg=placeImageOnSlide(pendingImages,S.currentSlide,'auto');
        if(msg) addMessage(msg,'ai');
        window.renderApp();
        sendBtn.disabled=false; sendBtn.innerHTML=SEND_ARROW_SVG;
        window.autoSave();
        return;
      }
      // User gave specific instructions → use LLM to parse intent
      statusDiv.textContent='Processing image...';
      try{
        const imgRaw=await callLLM(IMAGE_PROMPT,[{role:'user',content:text}],{temperature:0,max_tokens:128,json:true});
        const imgAction=JSON.parse(imgRaw);
        const targetSlide=(imgAction.slide||S.currentSlide+1)-1;
        const position=imgAction.position||'auto';
        const msg=placeImageOnSlide(pendingImages,targetSlide,position);
        statusDiv.remove();
        if(msg) addMessage(msg,'ai');
        window.renderApp();
      }catch(imgErr){
        console.warn('Image LLM failed, using default placement:',imgErr);
        statusDiv.remove();
        const msg=placeImageOnSlide(pendingImages,S.currentSlide,'auto');
        if(msg) addMessage(msg,'ai');
        window.renderApp();
      }
      sendBtn.disabled=false; sendBtn.innerHTML=SEND_ARROW_SVG;
      window.autoSave();
      return;
    }

    // ── UNIFIED LLM ROUTER — classify intent (no hardcoded regex) ──
    const routerMsgs=S.chatHistory.slice(-6);
    // Add context so router can make informed decisions
    const ctx=[];
    ctx.push(`Current mode: ${S.currentMode}.`);
    if(S.currentMode==='doc'&&S.currentDoc){
      ctx.push('User is in Doc mode editing "'+S.currentDoc.title+'" with '+S.currentDoc.blocks.length+' blocks.');
      // Tell AI which block is selected/being edited
      const activeBlockId=window.docEditingBlockId||window.docSelectedBlockId;
      if(activeBlockId){
        const activeBlock=window.docGetBlock(activeBlockId);
        if(activeBlock){
          const blockText=window.blockPlainText(activeBlock);
          const blockIdx=S.currentDoc.blocks.findIndex(b=>b.id===activeBlockId);
          ctx.push(`User has selected block #${blockIdx+1} (type: ${activeBlock.type}): "${blockText.substring(0,200)}${blockText.length>200?'...':''}". If the user asks to edit/rewrite/modify text, apply changes to THIS block.`);
          // Caption context
          if(window.docSelectedCaptionBlockId===activeBlockId && activeBlock.meta?.showCaption){
            ctx.push(`User has specifically selected the CAPTION of this block: "${(activeBlock.meta.caption||'').substring(0,100)}". Apply changes to the caption.`);
          }
        }
      }
    }
    if(S.currentMode==='sheet'&&S.sheet&&S.sheet.current){
      const sh=S.sheet.current;
      ctx.push(`User is in Sheet mode editing "${sh.title}" with ${sh.rows.length} rows × ${sh.columns.length} cols.`);
      // Selection context
      const selCtx=window.shGetSelectionContext ? window.shGetSelectionContext() : '';
      if(selCtx) ctx.push(selCtx);
      ctx.push('Available functions: SUM, AVERAGE, COUNT, MIN, MAX, STDEV, MEDIAN. Formulas start with =.');
    }
    if(S.currentMode==='slide'&&S.currentDeck) ctx.push('User has a deck loaded with '+S.currentDeck.slides.length+' slides.');
    if(S.currentMode==='slide'&&hasImageOnCurrentSlide()) ctx.push('Current slide has floating images.');
    if(S.selectedRegion) ctx.push(`User has selected region "${S.selectedRegion.regionId}" (${S.selectedRegion.role}) on slide ${S.selectedRegion.slideIdx+1}.`);
    if(wsRefs.length>0) ctx.push('User referenced workspace files: '+wsRefs.map(f=>f.title).join(', ')+'.');
    if(_resolvedProjectId) ctx.push('Project context is loaded and available for this query.');
    // In workspace mode, list available projects so router knows what exists
    if(S.currentMode==='workspace' && window.wsListProjects){
      const allProj=window.wsListProjects();
      if(allProj.length>0) ctx.push('Available projects: '+allProj.map(p=>`"${p.name}"`).join(', ')+'.');
    }
    if(S.currentMode==='slide'&&!S.currentDeck) ctx.push('No deck loaded yet.');
    if(ctx.length>0) routerMsgs.push({role:'system',content:'[Context: '+ctx.join(' ')+']'});

    statusDiv.textContent='Routing...';
    const routerRaw=await callLLM(ROUTER_PROMPT,routerMsgs,{useRouter:true,temperature:0,max_tokens:128,json:true});
    let intent='chat';
    let routerData={};
    try{
      routerData=JSON.parse(routerRaw);
      intent=routerData.intent||'chat';
    }catch(e){
      // Try extractJSON fallback before giving up
      const extracted=extractJSON(routerRaw);
      if(extracted&&extracted.intent){
        routerData=extracted;
        intent=extracted.intent;
        console.warn('Router JSON.parse failed, extractJSON succeeded:',routerRaw);
      }else{
        console.warn('Router parse failed completely, defaulting to generate:',e,'raw:',routerRaw);
        // Default to 'generate' instead of 'chat' — user likely wants content created
        intent='generate';
      }
    }

    // ── Smart fallback: minimal safety net (router LLM handles most classification) ──
    // If still "chat" and message has substance → generate
    if(intent==='chat'){
      const hasSubject=text.length>4&&!/^(hi|hello|hey|what|how|why|who|when|where|help|sup|yo)$/i.test(text.trim());
      const hasGenerateHint=/create|make|write|about|build|draft|pitch|deck|report|article|content|generate/i.test(text);
      const noDeckOrDoc=(S.currentMode==='slide'&&!S.currentDeck)||(S.currentMode==='doc'&&(!S.currentDoc||S.currentDoc.blocks.length<=2));
      if(hasSubject&&(hasGenerateHint||noDeckOrDoc)){
        console.log('Smart fallback: chat → generate (message has topic substance)');
        intent='generate';
      }
    }

    // ── Dispatch based on router intent ──

    if(intent==='about'){
      // ── ABOUT: hardcoded intro, translated if needed ──
      const topic=routerData.topic||'general';
      const sourceText=ABOUT_TEXTS[topic]||ABOUT_TEXTS.general;
      const isEN=/^[a-zA-Z\s\?\!\.,'0-9]+$/.test(text.trim());

      if(isEN){
        // English user → show directly, no LLM needed
        statusDiv.remove();
        const aboutDiv=addMessage('','ai');
        aboutDiv.innerHTML=sourceText.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
        S.chatHistory.push({role:'assistant',content:sourceText});
      }else{
        // Non-English → translate via LLM
        statusDiv.textContent='Translating...';
        try{
          const translated=await callLLM(ABOUT_TRANSLATE_PROMPT,[{role:'user',content:`Translate to the same language as: "${text}"\n\n${sourceText}`}],{max_tokens:2048});
          statusDiv.remove();
          const aboutDiv=addMessage('','ai');
          aboutDiv.innerHTML=translated.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
          S.chatHistory.push({role:'assistant',content:translated});
        }catch(e){
          // Fallback: show English if translation fails
          console.warn('About translation failed, showing English:',e);
          statusDiv.remove();
          const aboutDiv=addMessage('','ai');
          aboutDiv.innerHTML=sourceText.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
          S.chatHistory.push({role:'assistant',content:sourceText});
        }
      }

    }else if(intent==='describe'){
      // ── DESCRIBE: summarize current content + project context ──
      const contentText=getCurrentContentText();
      // In workspace mode, there may be no "current file" but wsContext has project data
      if(!contentText && !wsContext){
        statusDiv.remove();
        addMessage('No content to summarize yet. Please create a presentation, document, or sheet first, or ask about a specific project by name!','ai');
      }else{
        statusDiv.textContent='Reading content...';
        try{
          let fullContext='';
          if(contentText) fullContext+=`## CURRENT FILE\n${contentText}`;
          if(wsContext) fullContext+=wsContext;

          const summary=await callLLM(DESCRIBE_PROMPT,[{role:'user',content:`User asked: "${text}"\n\n${fullContext}`}],{max_tokens:2048});
          statusDiv.remove();
          const descDiv=addMessage('','ai');
          descDiv.textContent=summary;
          S.chatHistory.push({role:'assistant',content:summary});
        }catch(e){
          console.error('Describe failed:',e);
          statusDiv.remove();
          addMessage('Sorry, an error occurred while summarizing.','ai');
        }
      }

    }else if(intent==='undo'){
      // ── UNDO: restore previous state ──
      statusDiv.remove();
      if(S.currentMode==='doc'){
        window.docUndo();
        addMessage('↩ Undo','system');
      } else {
        window.undo();
        addMessage('↩ Undo','system');
        window.renderApp();
      }

    }else if(intent==='image'){
      // ── IMAGE: LLM interprets image command ──
      statusDiv.textContent='Processing image...';
      const imgRaw=await callLLM(IMAGE_PROMPT,[{role:'user',content:text}],{temperature:0,max_tokens:128,json:true});
      let imgAction;
      try{ imgAction=JSON.parse(imgRaw); }catch(e){
        imgAction=extractJSON(imgRaw);
        if(!imgAction){ imgAction={action:'none'}; console.warn('Image intent JSON parse failed:',e,'raw:',imgRaw); }
      }
      if(imgAction.action==='none'){
        // LLM says not really an image command — fall through to chat
        statusDiv.textContent='...';
        const raw=await callLLM(CHAT_PROMPT,S.chatHistory);
        S.chatHistory.push({role:'assistant',content:raw});
        statusDiv.remove();
        addMessage(raw,'ai');
      }else if(imgAction.action==='place'){
        statusDiv.remove();
        addMessage('⚠ No image attached. Use the + button to attach an image first.','system');
      }else{
        // Manipulation: scale, move, fit, remove
        const msg=applyImageAction(imgAction);
        statusDiv.remove();
        if(msg) addMessage(msg,'ai');
        window.renderApp();
      }

    }else if(intent==='style'&&S.currentDeck){
      // ── STYLE: LLM interprets style change ──
      statusDiv.textContent='Interpreting style...';
      let styleInput=text;
      if(S.selectedRegion){
        styleInput+=`\n[USER HAS SELECTED: slide ${S.selectedRegion.slideIdx+1}, region "${S.selectedRegion.regionId}" (${S.selectedRegion.role}). Apply changes to this region unless they specify otherwise.]`;
      }
      const styleRaw=await callLLM(STYLE_PROMPT,[{role:'user',content:styleInput}],{temperature:0,max_tokens:128,json:true});
      let styleObj;
      try{ styleObj=JSON.parse(styleRaw); }catch(e){
        styleObj=extractJSON(styleRaw);
        if(!styleObj){ styleObj={none:true}; console.warn('Style JSON parse failed:',e,'raw:',styleRaw); }
      }
      if(!styleObj.none){
        const msgs=applyStyleOverrides(styleObj);
        S.chatHistory.push({role:'assistant',content:`[style: ${msgs.join(', ')}]`});
        statusDiv.remove();
        addMessage(`✓ ${msgs.join(', ')}`,'ai');
        window.renderApp();
      }else{
        // Style LLM said none — fall through to chat
        statusDiv.textContent='...';
        const raw=await callLLM(CHAT_PROMPT,S.chatHistory);
        S.chatHistory.push({role:'assistant',content:raw});
        statusDiv.remove();
        addMessage(raw,'ai');
      }

    }else if(intent==='deck_edit'&&S.currentDeck){
      // ── DECK-WIDE EDIT: all slides at once ──
      statusDiv.textContent='Editing all slides...';
      const deckContent=deckToContentJSON();
      const editInput=`Current deck content:\n${JSON.stringify(deckContent)}\n\nUser instruction: ${text}${wsContext}`;
      const raw=await callLLM(DECK_EDIT_PROMPT,[{role:'user',content:editInput}],{max_tokens:8192});
      S.chatHistory.push({role:'assistant',content:`[deck-wide edit: ${text}]`});
      let updated;
      try{updated=JSON.parse(raw);}catch(e){
        const extracted=extractJSON(raw);
        if(extracted) updated=extracted;
        else throw new Error('LLM returned invalid JSON for deck edit');
      }
      // Normalize: accept array directly, or object with .slides/.updates/.data array
      if(!Array.isArray(updated)){
        if(updated&&Array.isArray(updated.slides))updated=updated.slides;
        else if(updated&&Array.isArray(updated.updates))updated=updated.updates;
        else if(updated&&Array.isArray(updated.data))updated=updated.data;
        else{ console.warn('deck_edit: unexpected shape',updated); updated=[]; }
      }
      window.pushUndo();
      let count=0;
      (Array.isArray(updated)?updated:[]).forEach(item=>{
        const idx=(item.slide||1)-1;
        if(idx>=0&&idx<S.currentDeck.slides.length&&item.content){
          for(const[k,v]of Object.entries(item.content)){
            S.currentDeck.slides[idx].content[k]=v;
          }
          count++;
        }
      });
      statusDiv.remove();
      addMessage(`✓ Updated ${count} slides`,'ai');
      window.renderApp();

    }else if(intent==='content_edit'&&S.currentDeck){
      // ── CONTENT EDIT: targeted region edit ──
      // For bare "delete" with nothing selected, ask user
      if(routerData.delete&&!routerData.region&&!routerData.slide&&!S.selectedRegion){
        statusDiv.remove();
        addMessage('Please select the region you want to delete, or tell me which page and what content to remove.','ai');
        S.chatHistory.push({role:'assistant',content:'Please select the region you want to delete.'});
        sendBtn.disabled=false; sendBtn.innerHTML=SEND_ARROW_SVG;
        window.autoSave();
        return;
      }
      // Router provides slide number and region — no hardcoded regex
      let targetSlide=routerData.slide?routerData.slide-1:S.currentSlide;
      let targetRegion=routerData.region||null;

      // Fall back to click selection if router didn't specify
      if(S.selectedRegion){
        if(!routerData.slide)targetSlide=S.selectedRegion.slideIdx;
        if(!targetRegion)targetRegion=S.selectedRegion.regionId;
      }

      const slide=S.currentDeck.slides[targetSlide];
      if(!slide){throw new Error(`Slide ${targetSlide+1} not found`);}

      // Resolve region ID — handle title↔heading equivalence
      let rId=targetRegion||'body';
      if(!slide.content[rId]){
        if(rId==='title'&&slide.content['heading'])rId='heading';
        else if(rId==='heading'&&slide.content['title'])rId='title';
      }
      // If region doesn't exist, find the main content region
      if(!slide.content[rId]){
        const fallbacks=['body','left','quote','table','description'];
        rId=fallbacks.find(f=>slide.content[f])||null;
        if(!rId){
          const L=LAYOUTS[slide.layout];
          if(L){
            const contentRegion=L.regions.find(r=>r.id!=='heading'&&r.id!=='title'&&slide.content[r.id]);
            if(contentRegion)rId=contentRegion.id;
          }
        }
      }
      const currentContent=rId?slide.content[rId]:null;

      if(currentContent){
        // Delete: router tells us via delete flag — no hardcoded regex
        if(routerData.delete){
          window.pushUndo();
          slide.content[rId]='';
          statusDiv.remove();
          addMessage(`✓ Slide ${targetSlide+1} → ${rId} cleared`,'ai');
          window.renderApp();
        }else{
          // Edit content via LLM
          statusDiv.textContent='Editing content...';
          const contentStr=typeof currentContent==='object'?JSON.stringify(currentContent):currentContent;
          const editInput=`Current content of region "${rId}" on slide ${targetSlide+1} (layout: ${slide.layout}):\n${contentStr}\n\nUser instruction: ${text}${wsContext}`;
          const raw=await callLLM(CONTENT_EDIT_PROMPT,[{role:'user',content:editInput}],{max_tokens:2048});
          S.chatHistory.push({role:'assistant',content:`[edited slide ${targetSlide+1} ${rId}]`});
          let cleaned=raw.trim();
          cleaned=cleaned.replace(/^```(?:json)?\n?/,'').replace(/\n?```$/,'').trim();
          let newContent;
          try{newContent=JSON.parse(cleaned);}catch(e){newContent=cleaned;}
          window.pushUndo();
          slide.content[rId]=newContent;
          statusDiv.remove();
          addMessage(`✓ Slide ${targetSlide+1} → ${rId} updated`,'ai');
          window.renderApp();
        }
      }else{
        // No region found — ask user
        statusDiv.remove();
        addMessage('Please click the region on the slide you want to edit, or tell me which page and section to modify.','ai');
        S.chatHistory.push({role:'assistant',content:'Please click the region on the slide you want to edit, or tell me which page and section to modify.'});
      }

    }else if(intent==='generate'&&S.currentMode==='doc'){
      // ── DOC GENERATE: create doc blocks instead of slides ──
      await doDocGenerate(statusDiv,text,wsContext);
      _autoLinkToProject(_resolvedProjectId);

    }else if(intent==='generate'){
      // ── GENERATE: create/modify slides ──
      await doGenerate(statusDiv,wsContext);
      _autoLinkToProject(_resolvedProjectId);

    }else if(S.currentMode==='doc'&&(intent==='content_edit'||intent==='deck_edit')){
      // ── DOC EDIT ──
      if(routerData.delete){
        // Delete the currently selected doc block
        const bid=window.docEditingBlockId||window.docSelectedBlockId;
        if(bid){
          window.docPushUndo();
          window.docDeleteBlock(bid);
          window.docSelectedBlockId=null;
          window.docEditingBlockId=null;
          statusDiv.remove();
          addMessage('✓ Block deleted.','ai');
          window.renderDocMode();
        } else {
          statusDiv.remove();
          addMessage('Please select a block first, then ask me to delete it.','ai');
        }
      } else {
        await doDocGenerate(statusDiv,text,wsContext);
        _autoLinkToProject(_resolvedProjectId);
      }

    }else{
      // ── CHAT: general conversation (inject project context if available) ──
      statusDiv.textContent='...';
      const chatSysPrompt=wsContext ? CHAT_PROMPT+'\n\nThe user may be asking about project data. Here is the context:\n'+wsContext : CHAT_PROMPT;
      const raw=await callLLM(chatSysPrompt,S.chatHistory);
      S.chatHistory.push({role:'assistant',content:raw});
      statusDiv.remove();
      addMessage(raw,'ai');
    }

  }catch(err){
    console.error('Sloth LLM error:',err);
    statusDiv.remove();
    addMessage(`Error: ${err.message}. Try again?`,'ai');
  }finally{
    sendBtn.disabled=false;
    sendBtn.innerHTML=SEND_ARROW_SVG;
    window.autoSave(); // Save chat history after every message
    saveChatTabs(); // Persist chat tabs
    scheduleTabTitleGen(); // AI-generate tab title if needed
  }
}

// ── Auto-save generated content to workspace & link to source project ──
function _autoLinkToProject(projectId){
  if(!projectId) return;
  if(!window.wsLoad || !window.wsSave || !window.wsLinkFile) return;
  const files=window.wsLoad();
  let fileId=S._wsCurrentFileId;

  // If current content isn't in workspace yet, create an entry
  if(!fileId || !files.some(f=>f.id===fileId)){
    const now=new Date().toISOString();
    if(S.currentMode==='slide' && S.currentDeck){
      const entry={
        id: 'ws_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),
        type:'slides',
        title: S.currentDeck.title||'Untitled',
        created: now, updated: now,
        content: S.currentDeck
      };
      files.push(entry);
      fileId=entry.id;
    } else if(S.currentMode==='doc' && S.currentDoc){
      const entry={
        id: S.currentDoc.id || 'ws_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),
        type:'doc',
        title: S.currentDoc.title||'Untitled',
        created: now, updated: now,
        content: { blocks: S.currentDoc.blocks }
      };
      // Check if doc already exists by id
      const existing=files.findIndex(f=>f.id===entry.id);
      if(existing>=0) files[existing]=entry;
      else files.push(entry);
      fileId=entry.id;
    }
    if(fileId){
      S._wsCurrentFileId=fileId;
      window.wsSave(files);
    }
  }

  // Link to project (wsLinkFile auto-dedupes)
  if(fileId){
    window.wsLinkFile(fileId, projectId);
    const proj=window.wsGetProject ? window.wsGetProject(projectId) : null;
    if(proj) addMessage(`📁 Linked to project "${proj.name}"`,'system');
  }
}

// ── Slide generation (reusable) ──
async function doGenerate(statusDiv,wsContext){
  statusDiv.textContent='Generating slides...';
  // Capture template style bank BEFORE generation (if coming from a template preview)
  const isTemplate=S.currentDeck&&S.currentDeck._isTemplate;
  const styleBank=isTemplate?S.currentDeck._styleBank:null;
  const templatePreset=isTemplate?S.currentDeck.preset:null;

  let editContext='';
  if(S.currentDeck&&!isTemplate){
    editContext=`\n\n## EDITING MODE — CRITICAL\nThe user ALREADY has this deck. They want to MODIFY it, not regenerate from scratch.\nYou MUST keep ALL existing content, slides, and settings UNCHANGED except for what the user specifically asks to change.\nOutput the COMPLETE deck JSON with only the requested changes applied.\n\n[CURRENT DECK]\n${JSON.stringify(S.currentDeck)}`;
  }
  // Inject workspace file data if user referenced any docs/sheets
  const wsExtra=wsContext||'';
  // Only send last 6 messages to generation model to avoid token overflow
  const genHistory=S.chatHistory.slice(-6);
  const raw=await callLLM(GEN_PROMPT+editContext+wsExtra,genHistory,{json:true,max_tokens:8192});
  S.chatHistory.push({role:'assistant',content:raw});

  const deck=extractJSON(raw);
  if(!deck){
    console.error('Generation failed — raw LLM response:',raw.substring(0,500));
    throw new Error('LLM returned invalid JSON. Please try again.');
  }
  const err=validateDeck(deck);
  if(err){
    console.error('Deck validation failed:',err,'deck:',JSON.stringify(deck).substring(0,500));
    throw new Error(`Invalid deck: ${err}`);
  }

  // Apply template style bank: override content but keep the color scheme
  if(styleBank){
    deck.preset=templatePreset||deck.preset;
    const contentIdx=[0,0]; // track which content style variant to use (round-robin)
    deck.slides.forEach((slide,i)=>{
      const layout=slide.layout||'content';
      let bankEntry=styleBank[layout];
      // For 'content' layout, rotate through the array of style variants
      if(Array.isArray(bankEntry)){
        slide.style_overrides={...(slide.style_overrides||{}),...JSON.parse(JSON.stringify(bankEntry[contentIdx[0]%bankEntry.length]))};
        contentIdx[0]++;
      }else if(bankEntry){
        slide.style_overrides={...(slide.style_overrides||{}),...JSON.parse(JSON.stringify(bankEntry))};
      }
      // Fallback: if layout not in bank, try 'content'
      if(!bankEntry&&styleBank.content){
        const fb=styleBank.content;
        if(Array.isArray(fb)){
          slide.style_overrides={...(slide.style_overrides||{}),...JSON.parse(JSON.stringify(fb[contentIdx[1]%fb.length]))};
          contentIdx[1]++;
        }
      }
    });
  }

  window.pushUndo(); // Save undo snapshot before replacing deck
  statusDiv.remove();
  S.currentDeck=deck;
  S.currentPreset=deck.preset||S.currentPreset;
  S.currentSlide=0;
  addMessage(`✓ Generated ${deck.slides.length} slides (${S.currentPreset})`,'ai');
  window.renderApp();
}

// ── Doc generation (blocks instead of slides) ──
const DOC_GEN_PROMPT=`You are Sloth Space Doc Mode, an AI document writer.
You MUST output ONLY a valid JSON object. No markdown, no code fences, no explanation before or after.

The JSON object must have exactly this structure:
{"title":"string","blocks":[...]}

Block types and their JSON format:

1. Text blocks — {"type":"<type>","text":"string"}
   Types: heading1, heading2, heading3, paragraph, quote, code, list, numbered, caption

2. Divider — {"type":"divider","text":""}

3. Table — {"type":"table","text":"","meta":{"cols":N,"rows":N,"cells":[["Header1","Header2",...],["row1col1","row1col2",...],...],"float":"none|left|right","caption":"Table legend text","showCaption":true}}
   "cells" is a 2D array. First row = headers. "rows" = number of data rows (excluding header). "cols" = number of columns. Use float "left" or "right" to wrap text around the table. Use "none" for centered. Default float is "none". Set showCaption to true if providing a caption.

4. Image — {"type":"image","text":"","meta":{"src":"<url>","alt":"description","float":"none|left|right","caption":"Figure legend text","showCaption":true}}
   Use float "left" or "right" to wrap text around the image. Use "none" for centered full-width. Default float is "right". Set showCaption to true if providing a caption.

Rules:
- heading1 for main title and major sections
- heading2/heading3 for subsections
- Each paragraph = one focused idea, 2-4 sentences
- Use list/numbered for enumerations
- quote for key insights
- divider to separate major sections
- Use TABLE blocks when data is naturally tabular (comparisons, statistics, timelines, specs)
- Write in the SAME LANGUAGE as the user
- For scientific content, use proper structure: introduction, background, methods, results, discussion
- Generate real, detailed, substantive content — NOT placeholder text
- Minimum 15 blocks for a full article
- When user asks to insert a divider, add a table, or move/add an image, do it`;

async function doDocGenerate(statusDiv,userText,wsContext){
  statusDiv.textContent='Writing document...';

  let editContext='';
  // Only include edit context if the doc has real content (more than just title + empty paragraph)
  if(S.currentDoc&&S.currentDoc.blocks.length>2){
    const hasContent=S.currentDoc.blocks.some(b=>window.blockPlainText(b).trim().length>10);
    if(hasContent){
      const currentBlocks=S.currentDoc.blocks.map(b=>{
        const obj={type:b.type, text:window.blockPlainText(b)};
        if(b.meta&&Object.keys(b.meta).length>0) obj.meta=b.meta;
        return obj;
      });
      editContext=`\n\nEDITING MODE: The user has an existing document. Modify based on their instruction. Keep existing content unless told to change. Preserve all block meta (table cells, image float/caption, etc.) unless the user asks to change them.\n\n[CURRENT DOC]\n${JSON.stringify({title:S.currentDoc.title,blocks:currentBlocks})}`;
    }
  }

  const wsExtra=wsContext||'';
  const genHistory=S.chatHistory.slice(-6);
  const raw=await callLLM(DOC_GEN_PROMPT+editContext+wsExtra,genHistory,{json:true,max_tokens:8192});
  S.chatHistory.push({role:'assistant',content:raw});

  let docData;
  try{
    docData=JSON.parse(raw);
  }catch(e){
    const extracted=extractJSON(raw);
    if(extracted) docData=extracted;
    else throw new Error('AI returned invalid JSON for doc generation');
  }

  if(!docData.blocks||!Array.isArray(docData.blocks)){
    throw new Error('AI response missing blocks array');
  }

  // Convert to proper block schema
  const newBlocks=docData.blocks.map(b=>
    window.createBlock(b.type||'paragraph', b.text||'', b.meta||{})
  );

  if(!S.currentDoc){
    S.currentDoc=window.docCreateNew(docData.title||userText||'Untitled');
  }
  if(docData.title) S.currentDoc.title=docData.title;
  S.currentDoc.blocks=newBlocks;
  S.currentDoc.updated=new Date().toISOString();

  statusDiv.remove();
  addMessage(`✓ Generated document "${S.currentDoc.title}" (${newBlocks.length} blocks)`,'ai');
  window.renderDocMode();
  window.docSaveNow(); // immediate save, not debounced — survives quick refresh
}

export {
  loadConfig,
  saveConfig,
  isConfigured,
  callLLM,
  addMessage,
  validateDeck,
  extractJSON,
  applyStyleOverrides,
  deckToContentJSON,
  sendMessage,
  doGenerate,
  doDocGenerate,
  hasImageOnCurrentSlide,
  placeImageOnSlide,
  applyImageAction,
  autoDesignImagePlacement,
  STYLE_PROMPT,
  CONTENT_EDIT_PROMPT,
  DECK_EDIT_PROMPT,
  ROUTER_PROMPT,
  CHAT_PROMPT,
  GEN_PROMPT,
  IMAGE_PROMPT,
  DOC_GEN_PROMPT
};
