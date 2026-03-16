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
const ROUTER_PROMPT=`You are the intent router for Sloth, the AI assistant inside Sloth Space — a content creation app with modes: slide, doc, sheet, workspace.
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

"sheet_fill" — SHEET MODE ONLY. User wants AI to FILL, COMPUTE, or GENERATE values for cells/columns/rows based on existing data.
  Output: {"intent":"sheet_fill","instruction":"what the user wants filled","targetCol":"column name or null","targetRange":"description or null"}
  Examples:
  - "fill column C with estimated market share" → {"intent":"sheet_fill","instruction":"estimate market share based on product data","targetCol":"C"}
  - "based on the product names on the left, fill in their prices" → {"intent":"sheet_fill","instruction":"fill prices for each product","targetCol":null}
  - "predict next quarter revenue for each row" → {"intent":"sheet_fill","instruction":"predict next quarter revenue","targetCol":null}
  - "translate column B to English" → {"intent":"sheet_fill","instruction":"translate to English","targetCol":"B"}
  - "categorize each item" → {"intent":"sheet_fill","instruction":"categorize items","targetCol":null}
  CRITICAL: This is ONLY for sheet mode when the user wants to WRITE/FILL data into cells using AI. If they just want to ASK about data (analyze, summarize), use "describe".

"describe" — user is asking ABOUT THE CURRENT DOCUMENT/CONTENT: what it says, summarize it, what's in it, analyze data, calculate values, explain meaning.
  Output: {"intent":"describe"}
  Examples: "what is this about", "what is the current content", "summarize this", "what does this say", "what does this presentation cover", "help me summarize", "content overview", "what have we written"
  SHEET-SPECIFIC examples (always "describe" when asking about existing sheet data):
    "sum of this column", "sum of column B", "average of this column", "standard deviation of this data", "what does this sheet do", "which project does this sheet belong to",
    "calculate the average for me", "what's the total", "explain this table", "what do these cells mean", "what does this row mean", "analyze this table", "review these numbers for me"
  IMPORTANT: This is about the EXISTING content the user has open, NOT about Sloth Space the app.
  IMPORTANT: In sheet mode, ANY question about the data, cells, columns, rows, formulas, or analysis → "describe".
  PROJECT-LEVEL queries (describe ONLY if no creation request): "what is this project about", "summarize the project", "what conclusions does this project have", "what do the other files say", "how does this relate to the other docs", "cross-reference with the sheet data"
  BUT: if the user also asks to CREATE/MAKE/WRITE a document or file → that is "generate", NOT "describe".
  WORKSPACE MODE: If the user is in workspace mode and asks about a specific project by name (e.g. "what is project X about", "summarize project Y"), this is "describe" — NOT "about" or "chat".
  EXCEPTION: If the user asks to CREATE/MAKE/WRITE a document or file (e.g. "make a document explaining project X", "write a report about project Y content"), this is ALWAYS "generate" NOT "describe".

"about" — user is asking ABOUT Sloth (the AI) or Sloth Space THE APP itself: who are you, what is it, features, how to use it, a specific mode or feature. Also triggers on: "你是誰", "自我介紹", "introduce yourself", "who are you", "what's your name".
  Output: {"intent":"about","topic":"general|slides|doc|sheet|workspace|generation|context_injection|conversion|ui_ops"}
  topic guide:
    "general" — asking about Sloth or Sloth Space overall: "who are you", "你是誰", "自我介紹", "what is Sloth Space", "what is this app", "tell me about it"
    "slides" — asking about slide/presentation mode: "how do I use slide mode", "how do slides work"
    "doc" — asking about document mode: "what is document mode", "how does doc mode work"
    "sheet" — asking about sheet/data mode: "how do I use sheets", "how do sheets work"
    "workspace" — asking about workspace/file management: "what is workspace", "how does workspace work", "how to manage projects"
    "generation" — asking about content generation: "how does generation work", "how do you create content", "內容生成", "怎麼生成"
    "context_injection" — asking about AI Context Injection: "what is context injection", "how does project context work", "什麼是AI Context Injection", "專案怎麼讀取檔案"
    "conversion" — asking about format conversion: "how do I convert formats", "how to turn doc into slides", "怎麼轉換格式"
    "ui_ops" — asking about UI operations: "what can you operate", "how do you control the interface", "介面操作", "你能操作什麼"
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
  WORKSPACE MODE: If the user asks to CREATE/WRITE/GENERATE a document, report, article, presentation, or slide deck based on project data, this is ALWAYS "generate" NOT "describe". The key distinction: "summarize project X" → describe, but "write a document about project X" / "make a report for project X" / "create slides for project X" → generate.
  Output {"intent":"generate","target":"doc"} for document/report/article requests, or {"intent":"generate","target":"slide"} for presentation/slide requests.

"ui_action" — user wants to NAVIGATE, SWITCH MODES, OPEN FILES, MANAGE PROJECTS, or CONTROL THE APP UI.
  This is for app-level operations, NOT content creation.
  Output: {"intent":"ui_action","actions":[{"fn":"functionName","args":["arg1"]}],"message":"Human-readable description"}

  Available functions:
  - modeEnter(mode) — switch to 'slide', 'doc', 'sheet', 'workspace'
  - wsSetView(view) — switch workspace tab: 'projects', 'all', 'unlinked'
  - wsOpenProject(projectNameOrId) — expand a project to show its files (can use project name)
  - openWorkspaceItem(fileNameOrIndex) — open a file (can use file name, will be resolved)
  - wsNewFile(type) — create empty file: 'slide', 'doc', 'sheet'
  - wsCreateProject(name, description) — create a new project
  - wsLinkFile(fileNameOrId, projectNameOrId) — link file to project (can use names)
  - wsUnlinkFile(fileId, projectId) — unlink file from project
  - wsSetActiveProject(projectNameOrId) — set project as AI context
  - wsClearActiveProject() — clear active project context
  - openSettings() — open settings panel
  - openFileNav() — open file navigator sidebar
  - applyPreset(presetName) — apply a slide theme
  - wsSetSearch(query) — search workspace files
  - wsSetSort(by) — sort files: 'date', 'name', 'type'
  - wsDeleteFile(fileId) — delete a file (requires confirmation)
  - wsDeleteProject(projectId) — delete a project (requires confirmation)

  Examples:
  - "switch to workspace" → {"intent":"ui_action","actions":[{"fn":"modeEnter","args":["workspace"]}],"message":"Switching to Workspace"}
  - "open Budget Tracker" → {"intent":"ui_action","actions":[{"fn":"openWorkspaceItem","args":["Budget Tracker"]}],"message":"Opening Budget Tracker"}
  - "create a project called Q2 Planning" → {"intent":"ui_action","actions":[{"fn":"wsCreateProject","args":["Q2 Planning",""]}],"message":"Created project Q2 Planning"}
  - "go to projects tab" → {"intent":"ui_action","actions":[{"fn":"modeEnter","args":["workspace"]},{"fn":"wsSetView","args":["projects"]}],"message":"Switching to Projects"}
  - "put the budget file into Q2 project" → {"intent":"ui_action","actions":[{"fn":"wsLinkFile","args":["budget","Q2 Planning"]}],"message":"Linked budget to Q2 Planning"}
  - "open settings" → {"intent":"ui_action","actions":[{"fn":"openSettings","args":[]}],"message":"Opening settings"}
  - "switch to doc mode" → {"intent":"ui_action","actions":[{"fn":"modeEnter","args":["doc"]}],"message":"Switching to Doc mode"}

  TAB OPERATIONS — the app has a browser-like tab bar. Use tab functions when:
  - User says "switch to the X tab", "go back to my doc/slide/sheet" → modeTabSwitch(tabId). Look up tabId from context.
  - User says "close this tab", "close the slide tab" → modeTabClose(tabId). Use activeTabId for "this tab".
  - User says "open a new slide/doc/sheet tab" → modeTabCreate(mode).
  - If there are MULTIPLE tabs of the same mode (e.g. two doc tabs) and the user says "switch to doc", you MUST ask which one instead of guessing. Output: {"intent":"chat"} and ask which tab they want (list the tab names).
  - When the user says "switch to slide" and there is exactly ONE slide tab open, use modeTabSwitch(tabId) NOT modeEnter.
  - PREFER modeTabSwitch over modeEnter when a tab for that mode already exists. Only use modeTabNew+ntpPickMode to create a NEW tab.
  - To CREATE a new tab: use TWO actions in sequence: modeTabNew() then ntpPickMode(mode). This shows the new-tab page first, then picks the mode — so the user sees the full animation.
  - Do NOT use modeEnter to open new tabs. Always use modeTabNew+ntpPickMode for new tabs.
  Examples:
  - "switch to slide tab" (one slide tab, tabId:2) → {"intent":"ui_action","actions":[{"fn":"modeTabSwitch","args":[2]}],"message":"Switching to Slide tab"}
  - "close this tab" (active tab is tabId:3) → {"intent":"ui_action","actions":[{"fn":"modeTabClose","args":[3]}],"message":"Closing current tab"}
  - "open a new doc" → {"intent":"ui_action","actions":[{"fn":"modeTabNew","args":[]},{"fn":"ntpPickMode","args":["doc"]}],"message":"Opening new Doc tab"}
  - "close the Budget Report tab" (tabId:5) → {"intent":"ui_action","actions":[{"fn":"modeTabClose","args":[5]}],"message":"Closing Budget Report tab"}
  - "open new slide" → {"intent":"ui_action","actions":[{"fn":"modeTabNew","args":[]},{"fn":"ntpPickMode","args":["slide"]}],"message":"Opening new Slide tab"}

  BENCH OPERATIONS — the Bench is a context staging area where users place reference files for AI:
  - benchRemove(id) — remove a specific file from the Bench
  - benchClear() — clear all files from the Bench
  - When the user says "use bench data" or "from bench files", the AI already has access to Bench content as context. Just proceed with generation.
  - When the user says "use project data AND bench data", both are already injected as context. Just proceed.
  - "clear the bench" → {"intent":"ui_action","actions":[{"fn":"benchClear","args":[]}],"message":"Clearing the Bench"}
  - "remove X from bench" → {"intent":"ui_action","actions":[{"fn":"benchRemove","args":[id]}],"message":"Removing X from Bench"}

  SAVE OPERATIONS:
  - modeSave() — save current file to localStorage (quick save)
  - modeSaveCloud() — save current file to cloud storage
  - modeNew() — add a new blank slide (slide mode only)
  - "save" / "存檔" → {"intent":"ui_action","actions":[{"fn":"modeSave","args":[]}],"message":"Saving file"}
  - "save to cloud" / "存到雲端" → {"intent":"ui_action","actions":[{"fn":"modeSaveCloud","args":[]}],"message":"Saving to cloud"}
  - "add a new slide" / "新增空白投影片" → {"intent":"ui_action","actions":[{"fn":"modeNew","args":[]}],"message":"Adding new blank slide"}

  CRITICAL DISTINCTION — "create project" vs "create document":
  - "create a PROJECT" → ui_action (wsCreateProject). A project is an organizational container, NOT content.
  - "create/write a DOCUMENT/FILE/REPORT/SLIDES" → generate. This is content creation.
  - "create a project called X" → ui_action. "create a document about X" → generate.
  Rule of thumb: "open X" / "switch to X" / "go to X" / "create a project" / "link files" / "sort by" / "search for" → ui_action. "Write about X" / "make a presentation about X" / "generate a report" → generate.

"multi_step" — user wants MULTIPLE THINGS done in sequence that span different intent types.
  Use this ONLY when the message contains BOTH app management AND content creation in ONE request.
  Output: {"intent":"multi_step","steps":[step1, step2, ...],"message":"description"}
  Each step is one of:
    {"type":"ui_action","actions":[{"fn":"functionName","args":[...]}]}
    {"type":"generate","target":"doc"|"slide","topic":"what to write about"}
    {"type":"link_last","project":"projectName"} — link the most recently created file to a project
  Examples:
  - "create a project called Q2 and write a budget report for it" →
    {"intent":"multi_step","steps":[
      {"type":"ui_action","actions":[{"fn":"wsCreateProject","args":["Q2",""]}]},
      {"type":"generate","target":"doc","topic":"budget report for Q2"},
      {"type":"link_last","project":"Q2"}
    ],"message":"Creating project Q2, generating budget report, and linking it"}
  - "make a project called Research, create a slide deck about AI, and a doc about machine learning" →
    {"intent":"multi_step","steps":[
      {"type":"ui_action","actions":[{"fn":"wsCreateProject","args":["Research",""]}]},
      {"type":"generate","target":"slide","topic":"AI"},
      {"type":"link_last","project":"Research"},
      {"type":"generate","target":"doc","topic":"machine learning"},
      {"type":"link_last","project":"Research"}
    ],"message":"Creating Research project with AI slides and ML doc"}
  IMPORTANT: Only use multi_step when the request TRULY requires multiple different intent types. If it's just multiple ui_actions, use "ui_action" with multiple actions in the array.

"chat" — ONLY for pure greetings with NO topic and NOT asking about Sloth Space.
  "hello", "hi", "hey"
  CRITICAL: If the message mentions ANY subject/topic (even with typos), it is NOT chat — it is "generate".

PRIORITY RULES (follow in order):
1. Undo words (undo/redo etc.) → ALWAYS "undo", no exceptions.
2. Delete words (delete/remove) → "content_edit" with delete:true.
3. **MULTI-STEP CHECK**: If the message asks for BOTH project/file management AND content creation (e.g. "create project X and write a doc about Y for it"), → "multi_step".
4. **APP MANAGEMENT OVERRIDE**: If the message asks to CREATE/DELETE/MANAGE a PROJECT, or OPEN/SWITCH/NAVIGATE to a mode/file/project, or LINK/UNLINK files → ALWAYS "ui_action". Keywords: project, open, switch, navigate, link, unlink, sort, search, settings. "create a project" / "open settings" / "switch to workspace" → ui_action, NOT generate.
5. **CONTENT CREATION OVERRIDE**: If the message asks to CREATE/MAKE/WRITE a document, file, report, article, slides, or presentation (CONTENT, not a project) → ALWAYS "generate", even if the message ALSO asks about content.
6. Asking what the current content says/summarize (WITHOUT any creation request) → "describe".
7. Questions about Sloth Space THE APP itself → "about".
8. Navigation, mode switching, opening files, managing projects, UI control → "ui_action".
9. Topic/creation requests → "generate". WHEN IN DOUBT, prefer "generate" over "chat".
10. Edit existing specific content → "content_edit".
11. Style/visual changes → "style" (slide only).
12. Image manipulation → "image" (slide only).
13. Batch edits → "deck_edit".
14. ONLY if NONE of the above apply → "chat".

MODE-SPECIFIC:
- "style" and "image" intents ONLY in slide mode. In doc mode use content_edit or generate.
- In DOC mode: insert table/divider, position image → content_edit. Topic creation → generate. To convert doc into slides → generate with target "slide". To extract doc data to spreadsheet → generate with target "sheet".
- In SLIDE mode: to convert slides into a document → generate with target "doc". To extract slide data to spreadsheet → generate with target "sheet".
- In SHEET mode: if user wants to FILL/COMPUTE/GENERATE cell values using AI → "sheet_fill". If user wants to turn sheet data INTO a presentation/slides → "generate" with target "slide". If user wants to turn sheet data into a document → generate with target "doc". If user just asks about data → "describe".
- In WORKSPACE mode: if user asks to CREATE/WRITE/MAKE a document/report/slides about a project → "generate" with target. "describe" is ONLY for read-only questions.
- CROSS-MODE CONVERSION: when user says "turn this into X" / "convert to X" / "make slides from this" / "make a doc from this" / "extract to spreadsheet", use "generate" with the appropriate target ("slide", "doc", or "sheet").
- NEVER choose "chat" when user wants content created, edited, or deleted.
- NEVER choose "chat" if the message contains a topic/subject. Always prefer "generate" or "about".

CONTEXT MEMORY:
- The [Context] may include "Recent AI actions" showing what was just done (e.g. created projects, generated files).
- Use this to resolve references like "that file", "the report", "open it", "the one I just made".
- Example: if recent actions say [Generated doc: "Q2 Budget Report"] and user says "open that report" → ui_action openWorkspaceItem("Q2 Budget Report").
- Example: if recent actions say [UI action: Created project Q2] and user says "open that project" → ui_action wsOpenProject("Q2").

Output ONLY the JSON object.`;

// ── Pass 2a: conversation mode ──
const CHAT_PROMPT=`You are Sloth, the AI assistant inside Sloth Space — an AI-native content creation platform.

IDENTITY:
- Your name is **Sloth**. Always refer to yourself as "Sloth" (not "I am an AI" or "I am a language model").
- You are friendly, helpful, and a little laid-back (like a sloth 🦥) but very capable.
- Reply in the user's language.

YOUR JOB (use this when introducing yourself or explaining what you can do):
- You help users create and manage content across four modes: **Slides** (presentations), **Doc** (documents/reports), **Sheet** (spreadsheets/data), and **Workspace** (project & file management).
- You can generate complete presentations, documents, and data tables from just a topic description — no templates needed.
- You can create **Projects** to organize related files together.
- **AI Context Injection** is your core superpower: when a user works inside a Project, you automatically read ALL linked files (docs, sheets, slides) as context. This means you can cross-reference data across files, synthesize information from multiple sources, and generate new content that draws from the entire project. For example: "summarize this project" reads every file and produces a unified summary; "create slides from the research data" pulls from linked docs and sheets to build a coherent presentation.
- You can convert between formats: turn docs into slides, slides into docs, extract data into sheets, etc.
- You help users style, edit, and refine their content using natural language.

SELF-INTRODUCTION TEMPLATE (adapt to user's language):
"Hi, I'm Sloth 🦥 — your AI creative assistant in Sloth Space! I help you create presentations, documents, and spreadsheets using natural language. You can organize everything into Projects, and I'll automatically use all your linked files as context when generating new content — that's my AI Context Injection superpower. Just give me a topic and I'll handle the rest!"

Rules:
- Be VERY concise. 1-2 sentences max for normal replies. For self-introductions, you may be longer.
- Ask AT MOST one question per reply.
- The ONLY thing you need from the user to start generating is a TOPIC. Everything else (slides count, style, audience) you can decide yourself.
- If the user mentions ANY topic at all (even with typos, even vague like "AI"), tell them you can generate content for them. Do NOT answer the topic as a knowledge question — the user wants content GENERATED, not explained.
- Do NOT ask multiple questions. Do NOT keep chatting round after round.
- Do NOT output JSON.
- If the user seems frustrated or confused, be encouraging and suggest they type a topic directly.`;

// ── Hardcoded Sloth Space intros (English = source of truth, non-EN → LLM translate) ──
const ABOUT_TEXTS={
  // ── General: concise self-intro with 4 core capabilities ──
  general:`🦥 Hi, I'm **Sloth** — your AI creative assistant in Sloth Space!

I can help you with four things:
• **Content Generation** — give me a topic, I'll create complete slides, documents, or spreadsheets
• **AI Context Injection** 🧠 — put files into a Project, and I automatically read them all as context. Cross-reference, summarize, or generate new content from your entire project
• **Format Conversion** — turn docs into slides, slides into docs, extract data into sheets
• **UI Operations** — create projects, organize files, switch modes, style content — all through natural language

Ask me about any of these to learn more! Or just type a topic to get started.`,

  // ── Mode-specific ──
  slides:`📊 **Slides Mode**

Type a topic and I generate a complete presentation — title, content, tables, quotes, closing slide. 5 themes: clean-white, clean-gray, clean-dark, monet, seurat. 10 layouts including two-column, data-table, and image variants.

**What you can do:**
• Generate a full deck from a topic: "AI trends in healthcare"
• Edit specific regions: click a region, then type "rewrite in English" or "add more detail"
• Style with natural language: "background to dark blue", "title font bigger", "Monet theme"
• Paste or drag images — I auto-position them
• "translate to English" → translates the entire deck
• "export ppt" → downloads as .pptx
• Undo/Redo anytime`,

  doc:`📝 **Doc Mode**

Type a topic and I generate a structured document with headings, paragraphs, lists, tables, quotes, code blocks, and dividers.

**What you can do:**
• Generate a full document from a topic: "write an article about sustainable energy"
• Click any block to select it, then type an instruction to edit just that block
• "Enrich this paragraph" → expands with detail
• "Add a comparison table" → inserts a table
• "Translate to Chinese" → translates the entire document
• Tables support headers, rows, and captions
• Images with float positioning (left/right/center)
• Zoom: "zoom 150%" or "zoom in/out"`,

  sheet:`📈 **Sheet Mode**

Create and manage structured data tables. Click to select cells, double-click to edit, = to use formulas.

**What you can do:**
• AI-powered cell filling: "fill column C with estimated prices" → I use existing data to intelligently fill cells
• Formulas: =SUM, =AVERAGE, =COUNT, =MIN, =MAX, =STDEV, =MEDIAN, arithmetic (=A1+B1*2)
• Quick-create from chat: /sheet Title + CSV data
• Cross-reference: mention a sheet name when making slides or docs, and I use its data as context
• Tab to move right, Enter to move down, Shift+Enter for newline in cell`,

  workspace:`📁 **Workspace**

Create **Projects** to organize your files (slides, docs, sheets, images) into logical groups. The killer feature: **AI Context Injection** — when you work inside a Project, I automatically read ALL linked files as context.

**What you can do:**
• Create projects: "create a project called Q1 Report"
• Link/unlink files to projects
• Open any file by name: "open Budget Tracker"
• Search and sort files
• Ask questions across your entire project: "summarize this project" → I read every linked file
• Generate content from project data: "create slides from the research" → I cross-reference all linked docs and sheets`,

  // ── Core feature deep-dives ──
  generation:`✨ **Content Generation**

Give me a topic in any language, and I'll create complete, polished content from scratch.

**Slides:** I generate 5-8 slides with varied layouts (title, content, two-column, data-table, quote, closing), speaker notes, and a design theme. Each bullet is 1-2 full sentences with specific details — not just outlines.

**Documents:** I generate a fully structured document with headings, paragraphs, lists, tables, quotes, and dividers. Rich block types let you build professional reports, articles, and memos.

**Sheets:** Describe what data you need and I'll create a structured spreadsheet. Or use AI Fill to intelligently populate cells based on existing data — "fill column C with estimated market share" and I'll reason from your data.

**Editing:** After generation, keep chatting to refine. "add more detail to slide 3", "rewrite this paragraph in a professional tone", "translate everything to English". I modify in-place without losing your existing work.`,

  context_injection:`🧠 **AI Context Injection**

This is the core superpower of Sloth Space's Workspace.

**How it works:**
1. Create a Project (e.g. "Q1 Report")
2. Link files to it — docs, sheets, slides, images
3. When you work inside that Project, I automatically inject ALL linked files into my context
4. Every generation, edit, or question benefits from the full project knowledge

**What this enables:**
• "Summarize this project" → I read every linked file and produce a unified summary
• "Create slides from the research" → I pull from your docs AND sheets to build a coherent deck
• "Write a report based on the data" → I cross-reference your sheets and docs
• "What conclusions can we draw?" → I analyze across all files and synthesize insights

**Why it matters:**
No copy-pasting between files. No manual context-setting. Your slides reference real data from your sheets, your documents synthesize insights from multiple sources. It all just works because I see everything in the project.

**Cross-file references also work outside projects:** mention any file by name in chat (e.g. "use data from Budget Sheet") and I'll pull it in automatically.`,

  conversion:`🔄 **Format Conversion**

Convert between any content format using natural language.

**Supported conversions:**
• **Doc → Slides:** "turn this into a presentation" → I restructure your document into a multi-slide deck with proper layouts
• **Slides → Doc:** "convert to a document" → I merge your slide content into a structured, readable document
• **Doc/Slides → Sheet:** "extract the data into a spreadsheet" → I pull actual data values (numbers, dates, metrics) into a clean table
• **Sheet → Slides:** "make a presentation from this data" → I create slides that visualize and explain your spreadsheet data
• **Sheet → Doc:** "write a report from this data" → I generate a document that analyzes and presents your data

**Important:** I only use data that actually exists in your source content. I won't fabricate numbers or statistics that aren't there.

**Inside a Project:** conversions are even more powerful because I can pull context from ALL linked files, not just the currently open one.`,

  ui_ops:`🎛️ **UI Operations**

I can control the entire Sloth Space interface through natural language — no buttons needed.

**Mode switching:** "switch to doc mode", "go to workspace", "open slides"
**Project management:** "create a project called Q1 Report", "delete project X", "link this file to project Y"
**File operations:** "open Budget Tracker", "create a new doc", "create a new sheet"
**Navigation:** "go to projects tab", "search for budget", "sort by date"
**Styling (Slides):** "background to dark blue", "title font bigger", "use Monet theme", "make heading red"
**Settings:** "open settings"

All of these work in any language — just describe what you want to do and I'll handle it.`
};

// Translation prompt for about texts
const ABOUT_TRANSLATE_PROMPT=`You are a translator. Translate the following product introduction text to the target language.

CRITICAL — DO NOT translate these terms (keep them exactly as-is in English):
Sloth, Sloth Space, Slides, Doc, Sheet, Workspace, Project, AI Context Injection, AI Fill, PPTX, PowerPoint, CSV, AI, Undo, Redo, Monet, Seurat

Keep ALL formatting exactly as-is: keep **, •, 🦥, 📊, 📝, 📈, 📁, 🧠, ✨, 🔄, 🎛️, emojis, markdown bold markers, numbered lists, line breaks.
Only translate the regular text content. Output ONLY the translated text, nothing else.`;

// Sheet Fill prompt — AI as a Function
const SHEET_FILL_PROMPT=`You are Sloth, the AI data assistant inside Sloth Space. The user wants you to FILL cells in their spreadsheet based on existing data and their instruction.

You will receive:
1. The current sheet data as a markdown table
2. The user's instruction describing what to fill
3. (Optional) A target column name

Your job: Generate values for the requested cells. Output ONLY a JSON object:
{"column":"target column name","values":["val1","val2","val3",...]}

Rules:
- "column" must be an EXISTING column name from the sheet, or a new column name if the user asks to add one.
- "values" array must have EXACTLY the same length as the number of data rows (excluding header).
- Each value should be a string. Use "" for cells you can't determine.
- If the user asks to fill a specific column, fill that column.
- If no specific column is mentioned, infer the best target column (usually an empty one, or create a new column name).
- Be intelligent: use the existing data to inform your values. If the sheet has product names and the user asks for prices, estimate reasonable prices.
- For translations, translate each cell value in the target column.
- For categorization, assign appropriate categories based on the data.
- For predictions/estimates, provide reasonable values with context from the data.
- Output ONLY the JSON object. No explanation, no markdown fences.`;

// Describe/summarize prompt for current content
const DESCRIBE_PROMPT=`You are Sloth, the AI assistant inside Sloth Space. The user wants to understand their current document. Read the content below and respond to their specific question. Use the same language the user asked in. When referring to yourself, use "Sloth".

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
function _serializeSlideTable(v){
  if(!v||v.type!=='table') return '';
  const headers=v.headers||[];
  const rows=v.rows||[];
  const lines=[];
  if(headers.length>0) lines.push('| '+headers.join(' | ')+' |');
  if(headers.length>0) lines.push('|'+headers.map(()=>' --- ').join('|')+'|');
  for(const row of rows){
    if(Array.isArray(row)) lines.push('| '+row.join(' | ')+' |');
    else lines.push('| '+String(row)+' |');
  }
  return lines.join('\n');
}

function getCurrentContentText(){
  if(S.currentMode==='slide'&&S.currentDeck&&S.currentDeck.slides.length>0){
    const lines=S.currentDeck.slides.map((s,i)=>{
      const parts=[`[Slide ${i+1} — ${s.layout}]`];
      for(const[k,v]of Object.entries(s.content)){
        if(typeof v==='string') parts.push(`  ${k}: ${v}`);
        else if(v&&v.type==='list'&&v.items) parts.push(`  ${k}:\n`+v.items.map(item=>`    - ${item}`).join('\n'));
        else if(v&&v.type==='table'){
          const tbl=_serializeSlideTable(v);
          parts.push(`  ${k} (table):\n${tbl}`);
        }
        else parts.push(`  ${k}: ${JSON.stringify(v)}`);
      }
      return parts.join('\n');
    });
    return `Slide deck "${S.currentDeck.title||'Untitled'}" (${S.currentDeck.slides.length} slides):\n\n`+lines.join('\n\n');
  }
  if(S.currentMode==='doc'&&S.currentDoc&&S.currentDoc.blocks.length>0){
    const lines=S.currentDoc.blocks.map(b=>{
      const text=window.blockPlainText(b);
      // For table blocks, serialize the cells as markdown table
      if(b.type==='table'&&b.meta?.cells){
        const cells=b.meta.cells;
        const tblLines=[];
        cells.forEach((row,ri)=>{
          tblLines.push('| '+row.join(' | ')+' |');
          if(ri===0) tblLines.push('|'+row.map(()=>' --- ').join('|')+'|');
        });
        return `[table]\n${tblLines.join('\n')}`;
      }
      return `[${b.type}] ${text}`;
    }).filter(l=>l.trim().length>3);
    return `Document "${S.currentDoc.title||'Untitled'}" (${S.currentDoc.blocks.length} blocks):\n\n`+lines.join('\n');
  }
  if(S.currentMode==='sheet'&&S.sheet&&S.sheet.current){
    const sh=S.sheet.current;
    // Prefer compact markdown table (sheetToMarkdownTable) over old shSerializeForAI
    const serialized=window.sheetToMarkdownTable
      ? window.sheetToMarkdownTable(sh)
      : (window.shSerializeForAI ? window.shSerializeForAI() : '');
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
const GEN_PROMPT=`You are Sloth, the AI presentation designer inside Sloth Space. Output ONLY valid JSON — no text, no markdown, no code fences, no explanation.

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
- data-table: ONLY use when the source material contains actual numerical data. NEVER fabricate statistics, sales figures, or metrics that do not exist in the source content. If there is no data, do NOT include a data-table slide.
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

  // Fetch with auto-retry on 429 rate limit
  let res, retries=0;
  const MAX_RETRIES=3;
  while(true){
    res=await fetch(S.llmConfig.url,{method:'POST',headers,body});
    if(res.status===429 && retries<MAX_RETRIES){
      retries++;
      const wait=retries*5; // 5s, 10s, 15s
      console.warn(`[callLLM] 429 rate limit, retry ${retries}/${MAX_RETRIES} in ${wait}s...`);
      if(window.addMessage) addMessage(`⏳ Rate limited — retrying in ${wait}s... (${retries}/${MAX_RETRIES})`,'system');
      await new Promise(r=>setTimeout(r,wait*1000));
      continue;
    }
    break;
  }
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

  // ── Pending UI action confirmation ──
  if(S._pendingUIActions && /^(DELETE|刪除)$/.test(trimText)){
    const { actions, message } = S._pendingUIActions;
    S._pendingUIActions = null;
    executeUIActions(actions, `✓ Confirmed: ${message}`);
    S.chatHistory.push({role:'assistant',content:`[Confirmed UI action: ${message}]`});
    return;
  }
  if(S._pendingUIActions && /^(no|cancel|n|不|取消|算了)$/i.test(trimText)){
    S._pendingUIActions = null;
    addMessage('Action cancelled.','system');
    return;
  }
  // Clear pending if user sends something else entirely
  if(S._pendingUIActions) S._pendingUIActions = null;

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
  //    Also resolves _resolvedProjectId even for empty projects (for auto-linking new files)
  if(window.wsListProjects){
    const allProjects=window.wsListProjects();
    const lowerText=text.toLowerCase();
    // Sort by name length descending to prefer longer matches (avoid "Hi" matching "this")
    const sorted=[...allProjects].sort((a,b)=>(b.name||'').length-(a.name||'').length);
    for(const proj of sorted){
      if(!proj.name) continue;
      const pName=proj.name.toLowerCase();
      // Use word-boundary match for short names (<=3 chars), substring for longer
      let matched=false;
      if(pName.length<=3){
        const re=new RegExp('\\b'+pName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i');
        matched=re.test(text);
      }else{
        matched=lowerText.includes(pName);
      }
      if(matched){
        // Always resolve the project ID (even for empty projects) so _autoLinkToProject works
        if(!_resolvedProjectId) _resolvedProjectId=proj.id;
        // Only inject context if project has content and we don't already have wsContext
        if(!wsContext){
          const pCtx=window.wsProjectContext ? window.wsProjectContext(proj.id) : '';
          if(pCtx){
            const fileCount=window.wsGetProjectFiles ? window.wsGetProjectFiles(proj.id).length : 0;
            wsContext+=`\n\n## PROJECT CONTEXT: "${proj.name}" (${fileCount} files)\nThe user is asking about this project. All files in this project are provided below.\n\n`+pCtx;
            addMessage(`📁 Reading project "${proj.name}" (${fileCount} file${fileCount!==1?'s':''})...`,'system');
          }
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

  // ── Inject Sloth Space product info when user asks to generate content about it ──
  if(/sloth\s*space/i.test(text)){
    wsContext+=`\n\n## SLOTH SPACE PRODUCT REFERENCE
When generating content about Sloth Space, use this AUTHORITATIVE description as your source of truth. Do NOT invent features or descriptions — use the information below:

${ABOUT_TEXTS.general}

${ABOUT_TEXTS.slides}

${ABOUT_TEXTS.doc}

${ABOUT_TEXTS.sheet}
`;
  }

  // ── Inject Bench context if any files are staged ──
  if (window.benchGetContext) {
    const benchCtx = window.benchGetContext();
    if (benchCtx) wsContext += benchCtx;
  }

  // Block user interaction during AI operations
  _showAIBlocker();

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
    if(S.currentMode==='slide'&&S.currentDeck) ctx.push(`User is in Slide mode viewing "${S.currentDeck.title||'Untitled'}" with ${S.currentDeck.slides.length} slides. "這份文件/this file/this deck" refers to THIS deck.`);
    if(S.currentMode==='slide'&&hasImageOnCurrentSlide()) ctx.push('Current slide has floating images.');
    if(S.selectedRegion) ctx.push(`User has selected region "${S.selectedRegion.regionId}" (${S.selectedRegion.role}) on slide ${S.selectedRegion.slideIdx+1}.`);
    if(wsRefs.length>0) ctx.push('User referenced workspace files: '+wsRefs.map(f=>f.title).join(', ')+'.');
    if(_resolvedProjectId) ctx.push('Project context is loaded and available for this query.');
    // List available projects and files so router can resolve names for ui_action
    if(window.wsListProjects){
      const allProj=window.wsListProjects();
      if(allProj.length>0) ctx.push('Available projects: '+allProj.map(p=>`"${p.name}" (id:${p.id})`).join(', ')+'.');
    }
    if(window.wsLoad){
      const allFiles=window.wsLoad();
      if(allFiles.length>0){
        const fileList=allFiles.slice(0,20).map((f,i)=>`[${i}] "${f.title}" (${f.type})`).join(', ');
        ctx.push('Workspace files: '+fileList+'.');
      }
    }
    if(S.currentMode==='slide'&&!S.currentDeck) ctx.push('No deck loaded yet.');
    // Tab bar context — list open tabs so LLM can switch/close by ID or name
    if(S.modeTabs.length>0){
      const tabList=S.modeTabs.map(t=>`[tabId:${t.id}] "${t.title}" (${t.mode})${t.id===S.activeTabId?' *active*':''}`).join(', ');
      ctx.push('Open tabs: '+tabList+'. Use modeTabSwitch(tabId) to switch, modeTabClose(tabId) to close, modeTabCreate(mode) to open new tab.');
    }
    // Bench context — list files on the bench so LLM knows what's available
    if(S.bench.length>0){
      const benchList=S.bench.map(b=>`[benchId:${b.id}] "${b.name}" (${b.type})`).join(', ');
      ctx.push('Bench files: '+benchList+'. Bench content is already injected as context. Use benchRemove(id) to remove, benchClear() to clear.');
    }
    // Recent action memory — so router can resolve "that file", "the report I just made", etc.
    const recentActions=S.chatHistory.slice(-8).filter(m=>m.role==='assistant'&&m.content.startsWith('['));
    if(recentActions.length>0){
      ctx.push('Recent AI actions: '+recentActions.map(m=>m.content).join(' | ')+'.');
    }
    if(ctx.length>0) routerMsgs.push({role:'system',content:'[Context: '+ctx.join(' ')+']'});

    statusDiv.textContent='Routing...';
    const routerRaw=await callLLM(ROUTER_PROMPT,routerMsgs,{useRouter:true,temperature:0,max_tokens:512,json:true});
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

    // ── Smart fallback: ANY intent → chat when user just wants a filename/title suggestion ──
    // "給這個簡報生成一個檔名" → chat (not generate). Let the LLM suggest a name in chat.
    const isMetaRequest=/filename|file\s*name|檔名|標題|取名|命名|rename|title/i.test(text)
      && !/create|write|make|draft|build|建立|新增|寫/i.test(text.replace(/生成.*檔名|generate.*name|取.*名|命.*名/gi,''));
    if(isMetaRequest && intent!=='chat' && intent!=='describe'){
      console.log(`Smart fallback: ${intent} → chat (user wants filename/title suggestion, not content creation)`);
      intent='chat';
    }

    // ── Smart fallback: minimal safety net (router LLM handles most classification) ──
    // If still "chat" and message has substance → generate
    if(intent==='chat' && !isMetaRequest){
      const hasSubject=text.length>4&&!/^(hi|hello|hey|what|how|why|who|when|where|help|sup|yo)$/i.test(text.trim());
      const hasGenerateHint=/create|make|write|about|build|draft|pitch|deck|report|article|content|generate|轉成|轉換|convert|turn.*into|extract/i.test(text);
      const noDeckOrDoc=(S.currentMode==='slide'&&!S.currentDeck)||(S.currentMode==='doc'&&(!S.currentDoc||S.currentDoc.blocks.length<=2))||(S.currentMode==='workspace');
      if(hasSubject&&(hasGenerateHint||noDeckOrDoc)){
        console.log('Smart fallback: chat → generate (message has topic substance)');
        intent='generate';
      }
    }

    // ── Smart fallback: cross-mode conversion target detection ──
    // If the router returned "generate" but missed the target, detect conversion keywords
    if(intent==='generate' && !routerData.target){
      const wantsSheet=/試算表|表格|spreadsheet|轉成sheet|轉換成sheet|extract.*data|轉成表/i.test(text);
      const wantsDoc=/轉成文件|轉成doc|轉換成文件|轉成文檔|make.*doc|convert.*doc|turn.*into.*doc/i.test(text);
      const wantsSlide=/轉成簡報|轉成slide|轉換成簡報|make.*slide|make.*presentation|convert.*slide|turn.*into.*slide|turn.*into.*presentation/i.test(text);
      if(wantsSheet){
        routerData.target='sheet';
        console.log('Smart fallback: generate → target:sheet (detected conversion keywords)');
      }else if(wantsDoc && S.currentMode!=='doc'){
        routerData.target='doc';
        console.log('Smart fallback: generate → target:doc (detected conversion keywords)');
      }else if(wantsSlide && S.currentMode!=='slide'){
        routerData.target='slide';
        console.log('Smart fallback: generate → target:slide (detected conversion keywords)');
      }
    }

    // ── Smart fallback: ANY intent → describe when user just wants a summary (not a file) ──
    // "總結這個專案" / "summarize this" → should show summary in chat, not generate a doc
    // The router often misclassifies summarize requests as "generate", "chat", etc.
    const isSummarizeOnly=/^(summarize|summary|sum up|overview|recap|總結|摘要|概述|整理|歸納)/i.test(text.trim())
      && !/file|document|doc|report|slide|presentation|sheet|檔案|文件|文檔|簡報|報告|投影片|試算表/i.test(text);
    if(isSummarizeOnly && intent!=='describe'){
      console.log(`Smart fallback: ${intent} → describe (user wants summary, not file creation)`);
      intent='describe';
    }

    // ── Smart fallback: describe → generate when user asks to CREATE a file ──
    // This catches cases where the router picks "describe" but the user actually
    // wants to create a document/report/slides (e.g. "做份文件解釋" / "make a doc explaining")
    if(intent==='describe' && !isSummarizeOnly){
      // Check if router detected a target (doc/slide) — means it saw creation intent
      if(routerData.target){
        console.log('Smart fallback: describe → generate (router detected target:'+routerData.target+')');
        intent='generate';
      }
      // English fallback for creation keywords
      const hasCreateFileHint=/document|doc|report|article|file|slide|presentation|deck/i.test(text)
        && /create|make|write|draft|build|generate|produce/i.test(text);
      if(hasCreateFileHint){
        console.log('Smart fallback: describe → generate (user wants to CREATE a file, not just describe)');
        intent='generate';
      }
    }

    // ── Smart fallback: generate → ui_action when user wants to create a PROJECT (not content) ──
    if(intent==='generate'){
      const wantsProject=/project|專案|proj/i.test(text)
        && /create|make|build|new|建立|建|新增|開/i.test(text)
        && !/document|doc|report|article|file|slide|presentation|deck|文件|文檔|簡報|報告/i.test(text);
      if(wantsProject){
        console.log('Smart fallback: generate → ui_action (user wants to CREATE a project, not content)');
        // Extract project name: look for "叫X" / "called X" / "named X" patterns
        let projName='';
        const cnMatch=text.match(/叫\s*[「「"']?(.+?)[」」"']?\s*(?:的|$)/);
        const enMatch=text.match(/(?:called|named)\s+[""']?(.+?)[""']?\s*$/i);
        const rawMatch=text.match(/project\s+[""']?(.+?)[""']?\s*$/i);
        projName=(cnMatch&&cnMatch[1])||(enMatch&&enMatch[1])||(rawMatch&&rawMatch[1])||'';
        projName=projName.trim().replace(/[。，！？.,!?]+$/,'');
        if(projName){
          intent='ui_action';
          routerData.actions=[
            {fn:'wsCreateProject',args:[projName,'']},
            {fn:'modeEnter',args:['workspace']},
            {fn:'wsSetView',args:['projects']}
          ];
          routerData.message=`Creating project "${projName}"`;
        }
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

    }else if(intent==='sheet_fill'){
      // ── SHEET FILL: AI as Function — fill cells with AI-generated values ──
      if(S.currentMode!=='sheet' || !S.sheet?.current){
        statusDiv.remove();
        addMessage('Please open a sheet first before asking me to fill data.','ai');
      }else{
        statusDiv.textContent='AI is analyzing your data...';
        _showAIActionOverlay('AI ▸ Generating cell values...');
        try{
          const sh=S.sheet.current;
          const mdTable=window.sheetToMarkdownTable ? window.sheetToMarkdownTable(sh) : '';
          const instruction=routerData.instruction || text;
          const targetCol=routerData.targetCol || null;
          let fillPrompt=`## SHEET DATA\n${mdTable}\n\n## INSTRUCTION\n${instruction}`;
          if(targetCol) fillPrompt+=`\n\nTarget column: ${targetCol}`;
          fillPrompt+=`\n\nNumber of data rows: ${sh.rows.length}`;

          const raw=await callLLM(SHEET_FILL_PROMPT,[{role:'user',content:fillPrompt}],{temperature:0.3,max_tokens:4096,json:true});
          const result=extractJSON(raw);
          if(!result || !result.values || !Array.isArray(result.values)){
            throw new Error('AI returned invalid data format');
          }

          // Find or create the target column
          let col=sh.columns.find(c=>c.name.toLowerCase()===result.column?.toLowerCase());
          if(!col){
            // Create new column
            const newId='col_'+Date.now().toString(36);
            col={id:newId, name:result.column||'AI Fill', width:120};
            sh.columns.push(col);
          }

          // Push undo before batch write
          if(window.shPushUndo) window.shPushUndo();

          // Batch write values
          let written=0;
          for(let i=0; i<Math.min(result.values.length, sh.rows.length); i++){
            const val=result.values[i];
            if(val!==undefined && val!==null){
              sh.rows[i].cells[col.id]=String(val);
              written++;
            }
          }
          sh.updated=new Date().toISOString();

          statusDiv.remove();
          _updateAIActionOverlay(`AI ▸ Filled ${written} cells ✓`);
          setTimeout(_hideAIActionOverlay, 1200);
          addMessage(`✓ AI filled ${written} cells in column "${col.name}"`,'ai');
          S.chatHistory.push({role:'assistant',content:`[Sheet fill: ${written} cells in "${col.name}"]`});

          // Re-render and save
          if(window.renderSheetMode) window.renderSheetMode();
          if(window.shAutoSave) window.shAutoSave();
        }catch(e){
          console.error('Sheet fill error:',e);
          statusDiv.remove();
          _hideAIActionOverlay();
          addMessage(`Error filling cells: ${e.message}`,'ai');
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

          // Offer to generate a file from the summary
          const isZh=/[\u4e00-\u9fff]/.test(text);
          const followUp=addMessage('','system');
          followUp.innerHTML=isZh
            ? '需要產生檔案嗎？ <span class="ai-action-btn" data-gen="doc">📄 文件</span> <span class="ai-action-btn" data-gen="slide">📊 投影片</span> <span class="ai-action-btn" data-gen="sheet">📋 試算表</span>'
            : 'Generate a file? <span class="ai-action-btn" data-gen="doc">📄 Doc</span> <span class="ai-action-btn" data-gen="slide">📊 Slides</span> <span class="ai-action-btn" data-gen="sheet">📋 Sheet</span>';
          followUp.querySelectorAll('.ai-action-btn').forEach(btn=>{
            btn.style.cssText='cursor:pointer;padding:4px 12px;border-radius:6px;background:#f0f0f0;margin:0 4px;display:inline-block;font-size:0.9em;transition:background 0.2s';
            btn.onmouseenter=()=>btn.style.background='#e0e0e0';
            btn.onmouseleave=()=>btn.style.background='#f0f0f0';
            btn.onclick=()=>{
              followUp.remove();
              const target=btn.dataset.gen;
              const genPrompt=isZh
                ? `根據上面的總結，產生一份${target==='doc'?'文件':target==='slide'?'投影片':'試算表'}`
                : `Based on the summary above, generate a ${target==='doc'?'document':target==='slide'?'presentation':'spreadsheet'}`;
              window.sendMessage(genPrompt);
            };
          });
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

    }else if(intent==='generate'&&routerData.target==='sheet'){
      // ── CROSS-MODE: Convert current content to spreadsheet ──
      statusDiv.textContent='Converting to spreadsheet...';
      const sourceContent=getCurrentContentText();
      if(!sourceContent){
        statusDiv.remove();
        addMessage('No content to convert. Please open a document or slides first.','ai');
      }else{
        _showAIActionOverlay('AI ▸ Converting to spreadsheet...');
        addMessage(`📊 Converting ${S.currentMode} data to spreadsheet...`,'system');
        const convertPrompt=`You are a data extraction AI. Your job is to extract ACTUAL DATA VALUES (numbers, amounts, dates, percentages, metrics) from the content and organize them into a spreadsheet.

Output ONLY a JSON object: {"title":"sheet title","columns":[{"name":"col1"},{"name":"col2"}],"rows":[{"cells":{"col1":"val","col2":"val"}},...]}

CRITICAL RULES:
- Extract REAL DATA: dollar amounts, percentages, quantities, dates, names — NOT slide titles or section headings.
- If the content contains tables (markdown table format), extract every row of data from those tables.
- If the content contains bullet lists with numbers/values, extract those values into columns.
- Column names should describe the DATA (e.g. "Category", "Amount", "Growth %"), not the slide/section name.
- Every row should be one data record with actual values, NOT a summary of a section.
- If there are budget items, list each item as a row with columns like "Item", "Amount", "Category".
- If there are projections, list each projection as a row with "Metric", "Q1", "Q2", etc.
- NEVER make rows like {"Title":"Introduction","Description":"..."} — that's useless. Extract the DATA inside.
- NEVER fabricate or invent data that does not exist in the source content. Do NOT create fake statistics, sales figures, or metrics.
- If no structured numerical data can be found, extract key text-based information (names, categories, descriptions) into a useful table. Do NOT invent numbers.

SOURCE CONTENT:
${sourceContent}`;
        try{
          const raw=await callLLM(convertPrompt,[{role:'user',content:text}],{temperature:0.3,max_tokens:8192,json:true});
          const result=extractJSON(raw);
          if(!result||!result.columns||!result.rows) throw new Error('Invalid sheet data');
          // Build sheet object
          const sheetId='sh_'+Date.now();
          const cols=result.columns.map((c,i)=>({id:'col_'+i, name:c.name||('Col '+(i+1)), width:120}));
          const rows=result.rows.map(r=>{
            const cells={};
            cols.forEach((col,i)=>{
              const key=result.columns[i].name||('Col '+(i+1));
              cells[col.id]=String(r.cells?.[key]??r.cells?.[col.id]??'');
            });
            return {id:'row_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), cells};
          });
          const sheetData={id:sheetId, title:result.title||'Extracted Data', columns:cols, rows, created:new Date().toISOString(), updated:new Date().toISOString()};
          // Switch to sheet mode with animated new tab
          await _aiEnsureModeForGenerate('sheet');
          if(window.shLoadData) window.shLoadData(sheetData);
          statusDiv.remove();
          _updateAIActionOverlay(`AI ▸ Created sheet with ${rows.length} rows ✓`);
          setTimeout(_hideAIActionOverlay,1200);
          addMessage(`✓ Converted to sheet "${sheetData.title}" (${rows.length} rows × ${cols.length} cols)`,'ai');
          S.chatHistory.push({role:'assistant',content:`[Converted to sheet: "${sheetData.title}" (${rows.length} rows)]`});
          _autoLinkToProject(_resolvedProjectId);
        }catch(e){
          statusDiv.remove();
          _hideAIActionOverlay();
          addMessage(`⚠️ Conversion failed: ${e.message}`,'ai');
        }
      }

    }else if(intent==='generate'&&_isDocTarget(routerData, S.currentMode)){
      // ── DOC GENERATE: create doc blocks ──
      let docWsContext=wsContext;
      // Cross-mode: inject source content when converting from another mode
      if(S.currentMode==='sheet' && S.sheet && S.sheet.current){
        const sheetTitle=S.sheet.current.title || S.sheet.current.name || 'Current Sheet';
        const mdTable=window.sheetToMarkdownTable ? window.sheetToMarkdownTable(S.sheet.current) : '';
        if(mdTable){
          docWsContext+=`\n\n## SOURCE SHEET DATA: "${sheetTitle}"\nThe user wants to create a document based on this spreadsheet data. Use the data below as the basis for the document.\n\n${mdTable}`;
          addMessage(`📊 Using sheet data from "${sheetTitle}" to generate document...`,'system');
        }
      }else if(S.currentMode==='slide' && S.currentDeck){
        const slideContent=getCurrentContentText();
        if(slideContent){
          docWsContext+=`\n\n## SOURCE SLIDE DATA\nThe user wants to convert these slides into a document. Use the slide content below to create a well-structured document.\n\nCRITICAL: Use ONLY the information from these slides. Do NOT invent data, statistics, or content that is not present in the source.\n\n${slideContent}`;
          addMessage(`📊 Converting slides to document...`,'system');
        }
      }
      await _aiEnsureModeForGenerate('doc');
      await doDocGenerate(statusDiv,text,docWsContext);
      _autoLinkToProject(_resolvedProjectId);

    }else if(intent==='generate'){
      // ── GENERATE: create/modify slides (catch-all) ──
      let slideWsContext=wsContext;
      // Cross-mode: inject source content when converting from another mode
      if(S.currentMode==='sheet' && S.sheet && S.sheet.current){
        const sheetTitle=S.sheet.current.title || S.sheet.current.name || 'Current Sheet';
        const mdTable=window.sheetToMarkdownTable ? window.sheetToMarkdownTable(S.sheet.current) : '';
        if(mdTable){
          slideWsContext+=`\n\n## SOURCE SHEET DATA: "${sheetTitle}"\nThe user wants to turn this spreadsheet data into a presentation. Use the data below to create meaningful, well-structured slides.\n\n${mdTable}`;
          addMessage(`📊 Using sheet data from "${sheetTitle}" to generate slides...`,'system');
        }
      }else if(S.currentMode==='doc' && S.currentDoc){
        const docContent=getCurrentContentText();
        if(docContent){
          slideWsContext+=`\n\n## SOURCE DOCUMENT DATA\nThe user wants to convert this document into a presentation. Use the document content below to create well-structured slides.\n\nCRITICAL: Use ONLY the information from this document. Do NOT invent data, statistics, numbers, or tables that are not present in the source. If the document has no numerical data, do NOT create data-table slides with fabricated numbers.\n\n${docContent}`;
          addMessage(`📊 Converting document to slides...`,'system');
        }
      }
      await _aiEnsureModeForGenerate('slide');
      await doGenerate(statusDiv,slideWsContext);
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

    }else if(intent==='ui_action'){
      // ── UI ACTION: AI controls the app interface ──
      statusDiv.remove();
      const actions = routerData.actions || [];
      const message = routerData.message || '';
      if(actions.length === 0){
        addMessage(message || 'No actions to perform.', 'ai');
      } else {
        // Resolve fuzzy names → real IDs/indices
        const resolved = resolveActionRefs(actions);
        // Check if any action requires confirmation
        const needsConfirm = resolved.some(a => ALLOWED_ACTIONS[a.fn]?.confirm);
        if(needsConfirm){
          // Store pending actions for confirmation
          S._pendingUIActions = { actions: resolved, message };
          addMessage(`⚠️ ${message}\nType DELETE to confirm.`, 'system');
          S.chatHistory.push({role:'assistant',content:`[Waiting for confirmation: ${message}]`});
        } else {
          const results = await executeUIActions(resolved, message);
          const failCount = results.filter(r => r.error).length;
          if(failCount > 0){
            addMessage(`⚠️ ${failCount} action(s) failed. Check console for details.`, 'system');
          }
          S.chatHistory.push({role:'assistant',content:`[UI action: ${message}]`});
        }
      }

    }else if(intent==='multi_step'){
      // ── MULTI-STEP: sequential execution of mixed intent types ──
      statusDiv.remove();
      const steps = routerData.steps || [];
      const message = routerData.message || 'Executing multi-step operation...';
      if(steps.length === 0){
        addMessage(message || 'No steps to perform.', 'ai');
      } else {
        await executeMultiStep(steps, message, text, wsContext);
        S.chatHistory.push({role:'assistant',content:`[Multi-step: ${message}]`});
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
    _hideAIBlocker(); // Re-enable user interaction
    sendBtn.disabled=false;
    sendBtn.innerHTML=SEND_ARROW_SVG;
    if(window.modeSave) window.modeSave(); // Unified save for current mode
    saveChatTabs(); // Persist chat tabs
    scheduleTabTitleGen(); // AI-generate tab title if needed
  }
}

// ── Multi-step executor: sequentially runs mixed ui_action / generate / link steps ──
async function executeMultiStep(steps, message, userText, wsContext) {
  _showAIActionOverlay(`AI ▸ ${message}`);
  addMessage(`✦ ${message}`, 'system');
  _aiEnsureCursor();

  let lastCreatedProjectId = null;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepLabel = `Step ${i+1}/${steps.length}`;

    // Update overlay with step progress dots
    const stepDescriptions = {
      ui_action: step.actions?.map(a => ALLOWED_ACTIONS[a.fn]?.label || a.fn).join(', ') || 'UI action',
      generate: `Creating ${step.target || 'doc'}`,
      link_last: `Linking to ${step.project || 'project'}`,
    };
    _updateAIActionOverlay(`AI ▸ ${stepLabel}: ${stepDescriptions[step.type] || step.type}`);
    _aiShowStepProgress(steps.length, i);

    // Delay between steps (≥0.5s) so user can see each step clearly
    if (i > 0) await new Promise(r => setTimeout(r, 600));

    try {
      if (step.type === 'ui_action') {
        const resolved = resolveActionRefs(step.actions || []);

        // Animated execution: process each action with visual feedback
        for (const action of resolved) {
          const fnName = action.fn;
          const args = action.args || [];
          const rule = ALLOWED_ACTIONS[fnName];
          if (!rule) continue;

          // Step 1: Animate — show cursor moving to button + click effect
          await _aiAnimateBeforeAction(fnName, args);

          // Step 2: For wsCreateProject, show phantom typing for the name
          if (fnName === 'wsCreateProject' && args[0]) {
            await _aiShowPhantomInput('Project Name', args[0]);
          }

          // Step 3: Execute the actual function
          const fn = window[fnName];
          if (typeof fn === 'function') {
            try { fn(...args); } catch(e) { console.error(`[AI UI] Error: ${fnName}:`, e); }
          }

          // Step 4: Brief pause to let user see the result
          await new Promise(r => setTimeout(r, 500));

          // Track project creation
          if (fnName === 'wsCreateProject' && args[0]) {
            const projects = window.wsListProjects ? window.wsListProjects() : [];
            const p = projects.find(p => (p.name || '').toLowerCase() === args[0].toLowerCase());
            if (p) lastCreatedProjectId = p.id;
          }
        }

      } else if (step.type === 'generate') {
        _updateAIActionOverlay(`AI ▸ ${stepLabel}: Generating ${step.target || 'doc'}...`);
        _aiShowStepProgress(steps.length, i);

        const targetMode = step.target === 'slide' ? 'slide' : 'doc';
        await _aiEnsureModeForGenerate(targetMode);

        const tempStatus = document.createElement('div');
        tempStatus.className = 'chat-status';
        const topic = step.topic || userText;
        if (step.target === 'slide') {
          const prevHistory = [...S.chatHistory];
          S.chatHistory = [{ role: 'user', content: topic }];
          await doGenerate(tempStatus, wsContext);
          S.chatHistory = prevHistory;
        } else {
          await doDocGenerate(tempStatus, topic, wsContext);
        }
        tempStatus.remove();
        if (lastCreatedProjectId) {
          _autoLinkToProject(lastCreatedProjectId);
        }

      } else if (step.type === 'link_last') {
        const projectName = step.project || '';
        let projectId = lastCreatedProjectId;
        if (!projectId && projectName) {
          const projects = window.wsListProjects ? window.wsListProjects() : [];
          const p = projects.find(p => (p.name || '').toLowerCase().includes(projectName.toLowerCase()));
          if (p) projectId = p.id;
        }
        if (projectId) {
          _autoLinkToProject(projectId);
        }
      }
    } catch (e) {
      console.error(`[Multi-step] Step ${i+1} failed:`, e);
      addMessage(`⚠️ ${stepLabel} failed: ${e.message}`, 'system');
    }
  }

  // Mark all steps done
  _aiShowStepProgress(steps.length, steps.length);

  // Final: navigate to workspace projects to show result
  if (lastCreatedProjectId) {
    await new Promise(r => setTimeout(r, 400));
    _updateAIActionOverlay('AI ▸ Showing results...');
    // Animate workspace switch
    const tabNewBtn = document.getElementById('mtbNewBtn');
    if (tabNewBtn) await _aiSimulateClick(tabNewBtn);
    window.modeEnter('workspace');
    window.wsSetView('projects');
  }

  _aiHideCursor();
  _updateAIActionOverlay('AI ▸ All steps done ✓');
  setTimeout(_hideAIActionOverlay, 1500);
}

// ── Helper: determine if the generate intent should go to doc generation ──
function _isDocTarget(routerData, currentMode){
  const target=routerData.target;
  // Explicit doc target from any mode
  if(target==='doc') return true;
  // In doc mode, default to doc (unless target is explicitly slide/sheet)
  if(currentMode==='doc' && target!=='slide' && target!=='sheet') return true;
  // In workspace mode, default to doc unless target is slide/sheet
  if(currentMode==='workspace' && target!=='slide' && target!=='sheet') return true;
  return false;
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
    // Refresh sidebar file list so new file appears immediately
    if(window.refreshFileList) window.refreshFileList();
  }
}

// ── Slide generation (reusable) ──
async function doGenerate(statusDiv,wsContext){
  statusDiv.textContent='Generating slides...';
  _showAIActionOverlay('AI ▸ Generating slides...');
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
  _updateAIActionOverlay(`AI ▸ Generated ${deck.slides.length} slides ✓`);
  setTimeout(_hideAIActionOverlay, 1200);
  addMessage(`✓ Generated ${deck.slides.length} slides (${S.currentPreset})`,'ai');
  S.chatHistory.push({role:'assistant',content:`[Generated slides: "${deck.title||'Untitled'}" (${deck.slides.length} slides)]`});
  window.renderApp();
  // Sync tab bar filename & tab title after AI generation
  if(window._syncTabBarFilename) window._syncTabBarFilename('slide');
  if(window.modeTabUpdateTitle) window.modeTabUpdateTitle();
}

// ── Doc generation (blocks instead of slides) ──
const DOC_GEN_PROMPT=`You are Sloth, the AI document writer inside Sloth Space.
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
  _showAIActionOverlay('AI ▸ Writing document...');

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

  // Push undo snapshot AFTER generation so user can undo back to the generated state
  // (without this, undo after a manual edit would skip to pre-generation empty state)
  window.docPushUndo();

  statusDiv.remove();
  _updateAIActionOverlay(`AI ▸ Generated document ✓`);
  setTimeout(_hideAIActionOverlay, 1200);
  addMessage(`✓ Generated document "${S.currentDoc.title}" (${newBlocks.length} blocks)`,'ai');
  // Track in chat history for router context memory
  S.chatHistory.push({role:'assistant',content:`[Generated doc: "${S.currentDoc.title}"]`});
  window.renderDocMode();
  // Sync tab bar filename & tab title after AI generation
  if(window._syncTabBarFilename) window._syncTabBarFilename('doc');
  if(window.modeTabUpdateTitle) window.modeTabUpdateTitle();
  window.docSaveNow(); // immediate save, not debounced — survives quick refresh
  // Ensure workspace file ID is tracked so _autoLinkToProject can find it
  if(S.currentDoc && S.currentDoc.id) S._wsCurrentFileId = S.currentDoc.id;
}

// ═══════════════════════════════════════════
// AI UI CONTROL — Phase 3
// ═══════════════════════════════════════════
// Whitelist of functions the AI is allowed to call.
// Anything not in this map is silently ignored.
const ALLOWED_ACTIONS = {
  // ── Mode switching ──
  modeEnter:          { confirm: false, label: 'Switch mode' },
  showModePicker:     { confirm: false, label: 'Show mode picker' },
  // ── Workspace navigation ──
  wsSetView:          { confirm: false, label: 'Switch workspace tab' },
  wsOpenProject:      { confirm: false, label: 'Open project' },
  openWorkspaceItem:  { confirm: false, label: 'Open file' },
  enterWorkspaceMode: { confirm: false, label: 'Enter workspace' },
  // ── File operations ──
  wsNewFile:          { confirm: false, label: 'Create new file' },
  wsCreateDoc:        { confirm: false, label: 'Create document' },
  wsCreateSheet:      { confirm: false, label: 'Create spreadsheet' },
  wsDeleteFile:       { confirm: true,  label: 'Delete file' },
  // ── Project management ──
  wsCreateProject:    { confirm: false, label: 'Create project' },
  wsDeleteProject:    { confirm: true,  label: 'Delete project' },
  wsUpdateProject:    { confirm: false, label: 'Update project' },
  wsLinkFile:         { confirm: false, label: 'Link file to project' },
  wsUnlinkFile:       { confirm: false, label: 'Unlink file from project' },
  wsSetActiveProject: { confirm: false, label: 'Set active project' },
  wsClearActiveProject:{ confirm: false, label: 'Clear active project' },
  // ── UI panels ──
  openSettings:       { confirm: false, label: 'Open settings' },
  closeSettings:      { confirm: false, label: 'Close settings' },
  openFileNav:        { confirm: false, label: 'Open file navigator' },
  // ── Slide/doc operations ──
  applyPreset:        { confirm: false, label: 'Apply theme' },
  setPreset:          { confirm: false, label: 'Apply theme' },
  // ── Search / sort ──
  wsSetSearch:        { confirm: false, label: 'Search files' },
  wsSetSort:          { confirm: false, label: 'Sort files' },
  // ── Mode Tabs ──
  modeTabSwitch:      { confirm: false, label: 'Switch tab' },
  modeTabClose:       { confirm: false, label: 'Close tab' },
  modeTabNew:         { confirm: false, label: 'Open new tab page' },
  ntpPickMode:        { confirm: false, label: 'Pick mode on new tab page' },
  benchRemove:        { confirm: false, label: 'Remove file from Bench' },
  benchClear:         { confirm: true,  label: 'Clear all Bench files' },
  // ── Save operations ──
  modeSave:           { confirm: false, label: 'Save file' },
  modeSaveCloud:      { confirm: false, label: 'Save to cloud' },
  modeNew:            { confirm: false, label: 'Add new slide' },
};

// Parameter validation schemas (lightweight — type checks only)
const ACTION_SCHEMA = {
  modeEnter:      [{ type: 'string', enum: ['slide', 'doc', 'sheet', 'workspace'] }],
  wsSetView:      [{ type: 'string', enum: ['projects', 'all', 'unlinked'] }],
  wsOpenProject:  [{ type: 'string' }],
  openWorkspaceItem: [{ type: 'number' }],
  wsNewFile:      [{ type: 'string', enum: ['slide', 'doc', 'sheet'] }],
  wsCreateDoc:    [{ type: 'string' }, { type: 'string', optional: true }],
  wsCreateSheet:  [{ type: 'string' }, { type: 'string', optional: true }],
  wsCreateProject:[{ type: 'string' }, { type: 'string', optional: true }],
  wsDeleteFile:   [{ type: 'string' }],
  wsDeleteProject:[{ type: 'string' }],
  wsUpdateProject:[{ type: 'string' }, { type: 'object' }],
  wsLinkFile:     [{ type: 'string' }, { type: 'string' }],
  wsUnlinkFile:   [{ type: 'string' }, { type: 'string' }],
  wsSetActiveProject: [{ type: 'string' }],
  applyPreset:    [{ type: 'string' }],
  setPreset:      [{ type: 'string' }],
  wsSetSearch:    [{ type: 'string' }],
  wsSetSort:      [{ type: 'string', enum: ['date', 'name', 'type'] }],
  // Tab operations
  modeTabSwitch:  [{ type: 'number' }],
  modeTabClose:   [{ type: 'number' }],
  modeTabNew:     [],
  ntpPickMode:    [{ type: 'string', enum: ['slide', 'doc', 'sheet', 'workspace'] }],
  // Bench operations
  benchRemove:    [{ type: 'number' }],
  benchClear:     [],
  // Save operations
  modeSave:       [],
  modeSaveCloud:  [],
  modeNew:        [],
};

// ══════════════════════════════════════════════════════════
// AI Visual Operations — animate UI actions so users can follow
// ══════════════════════════════════════════════════════════

/** Show a floating cursor SVG that moves to target elements */
function _aiEnsureCursor() {
  let cursor = document.getElementById('ai-cursor');
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = 'ai-cursor';
    // Simple cursor SVG pointing top-left
    cursor.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 3l14 8-6.5 1.5L11 19z" fill="rgba(200,168,112,0.95)" stroke="#fff" stroke-width="1.5"/></svg>`;
    cursor.style.left = '-40px';
    cursor.style.top = '-40px';
    document.body.appendChild(cursor);
  }
  return cursor;
}
function _aiHideCursor() {
  const c = document.getElementById('ai-cursor');
  if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 300); }
}

/** Move the AI cursor to the center of a DOM element, returns a Promise */
function _aiMoveCursorTo(el) {
  return new Promise(resolve => {
    const cursor = _aiEnsureCursor();
    cursor.style.opacity = '1';
    const rect = el.getBoundingClientRect();
    cursor.style.left = (rect.left + rect.width / 2 - 4) + 'px';
    cursor.style.top = (rect.top + rect.height / 2 - 4) + 'px';
    setTimeout(resolve, 450); // wait for transition
  });
}

/** Simulate a click on a DOM element with visual ripple */
async function _aiSimulateClick(el) {
  if (!el) return;
  // Scroll into view if needed
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  await new Promise(r => setTimeout(r, 150));
  // Move cursor to element
  await _aiMoveCursorTo(el);
  // Add ripple
  el.classList.add('ai-click-ripple');
  await new Promise(r => setTimeout(r, 600));
  el.classList.remove('ai-click-ripple');
}

/** Highlight an element briefly */
async function _aiHighlight(el, duration = 800) {
  if (!el) return;
  el.classList.add('ai-target-highlight');
  await new Promise(r => setTimeout(r, duration));
  el.classList.remove('ai-target-highlight');
}

/** Type text into a visible element char by char (visual only — for display) */
async function _aiSimulateType(targetEl, text, charDelay = 40) {
  if (!targetEl) return;
  targetEl.classList.add('ai-typing-active');
  targetEl.textContent = '';
  // Add blinking cursor span
  const cursorSpan = document.createElement('span');
  cursorSpan.className = 'ai-typing-cursor';
  targetEl.appendChild(cursorSpan);
  for (let i = 0; i < text.length; i++) {
    targetEl.insertBefore(document.createTextNode(text[i]), cursorSpan);
    await new Promise(r => setTimeout(r, charDelay));
  }
  // Remove cursor after a brief pause
  await new Promise(r => setTimeout(r, 300));
  cursorSpan.remove();
  targetEl.classList.remove('ai-typing-active');
}

/**
 * Create a temporary "phantom" input field for showing typing animation
 * when no real input exists on screen (e.g. for wsCreateProject which uses prompt())
 */
async function _aiShowPhantomInput(label, value) {
  const phantom = document.createElement('div');
  phantom.className = 'ai-phantom-input';
  Object.assign(phantom.style, {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: '100002',
    background: '#1e1e1e', border: '1px solid rgba(200,168,112,0.5)',
    borderRadius: '12px', padding: '20px 28px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(200,168,112,0.15)',
    minWidth: '300px', fontFamily: 'inherit',
    animation: 'aiOverlayIn 0.25s ease',
  });
  phantom.innerHTML = `
    <div style="font-size:11px;color:#999;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
    <div class="ai-phantom-text" style="font-size:16px;color:#e0e0e0;min-height:24px;padding:8px 0;border-bottom:2px solid rgba(200,168,112,0.4);"></div>
  `;
  document.body.appendChild(phantom);
  const textEl = phantom.querySelector('.ai-phantom-text');
  await _aiSimulateType(textEl, value, 35);
  await new Promise(r => setTimeout(r, 400));
  phantom.style.animation = 'aiOverlayOut 0.25s ease forwards';
  await new Promise(r => setTimeout(r, 260));
  phantom.remove();
}

/**
 * Map function names to their corresponding DOM elements and animate.
 * Returns the element that was animated (or null if no animation available).
 */
/**
 * Show a floating "phantom action" label when the target button doesn't exist on screen.
 * This ensures the user always sees what AI is doing, even if the relevant UI isn't rendered yet.
 */
async function _aiShowPhantomAction(icon, label) {
  const phantom = document.createElement('div');
  phantom.className = 'ai-phantom-action';
  Object.assign(phantom.style, {
    position: 'fixed', top: '60px', left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '100002',
    background: 'linear-gradient(135deg, #1e1e1e, #2a2a2a)',
    border: '1px solid rgba(200,168,112,0.4)',
    borderRadius: '10px', padding: '12px 24px',
    boxShadow: '0 6px 24px rgba(0,0,0,0.4), 0 0 12px rgba(200,168,112,0.15)',
    display: 'flex', alignItems: 'center', gap: '10px',
    fontFamily: 'inherit', fontSize: '14px', color: '#e0e0e0',
    animation: 'aiOverlayIn 0.25s ease',
    pointerEvents: 'none',
  });
  // icon can be an SVG string or a text icon
  phantom.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;flex-shrink:0;">${icon}</span><span>${label}</span>`;
  document.body.appendChild(phantom);
  await new Promise(r => setTimeout(r, 800));
  phantom.style.animation = 'aiOverlayOut 0.25s ease forwards';
  await new Promise(r => setTimeout(r, 260));
  phantom.remove();
}

async function _aiAnimateBeforeAction(fnName, args) {
  // Flat SVG icons (Feather-style, matches app design)
  const _svgI = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(200,168,112,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const actionLabels = {
    modeEnter:          { icon: _svgI('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'), label: () => `Switching to ${args[0]} mode` },
    wsSetView:          { icon: _svgI('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'), label: () => `Opening ${args[0]} view` },
    wsCreateProject:    { icon: _svgI('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>'), label: () => `Creating project "${args[0]}"` },
    wsOpenProject:      { icon: _svgI('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'), label: () => `Opening project` },
    openWorkspaceItem:  { icon: _svgI('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'), label: () => `Opening file` },
    wsNewFile:          { icon: _svgI('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>'), label: () => `Creating new ${args[0]}` },
    wsCreateDoc:        { icon: _svgI('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'), label: () => `Creating document "${args[0]}"` },
    wsCreateSheet:      { icon: _svgI('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>'), label: () => `Creating spreadsheet "${args[0]}"` },
    wsDeleteFile:       { icon: _svgI('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'), label: () => `Deleting file` },
    wsDeleteProject:    { icon: _svgI('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'), label: () => `Deleting project` },
    wsLinkFile:         { icon: _svgI('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'), label: () => `Linking file to project` },
    wsUnlinkFile:       { icon: _svgI('<path d="M18 13h4"/><path d="M2 11h4"/><line x1="15" y1="5" x2="9" y2="19"/>'), label: () => `Unlinking file` },
    wsSetActiveProject: { icon: _svgI('<line x1="12" y1="2" x2="12" y2="15"/><circle cx="12" cy="19" r="3"/>'), label: () => `Setting active project` },
    applyPreset:        { icon: _svgI('<circle cx="12" cy="12" r="10"/><path d="M12 2a7 7 0 0 0 0 14 4 4 0 0 1 0 8 10 10 0 0 0 0-20z"/>'), label: () => `Applying ${args[0]} theme` },
    setPreset:          { icon: _svgI('<circle cx="12" cy="12" r="10"/><path d="M12 2a7 7 0 0 0 0 14 4 4 0 0 1 0 8 10 10 0 0 0 0-20z"/>'), label: () => `Applying ${args[0]} theme` },
    openSettings:       { icon: _svgI('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'), label: () => `Opening settings` },
    openFileNav:        { icon: _svgI('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>'), label: () => `Opening file navigator` },
    wsSetSearch:        { icon: _svgI('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'), label: () => `Searching files` },
    wsSetSort:          { icon: _svgI('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>'), label: () => `Sorting files` },
    // Tab operations
    modeTabSwitch:      { icon: _svgI('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/>'), label: () => { const t=S.modeTabs.find(t=>t.id===args[0]); return `Switching to tab "${t?.title||'unknown'}"` } },
    modeTabClose:       { icon: _svgI('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'), label: () => { const t=S.modeTabs.find(t=>t.id===args[0]); return `Closing tab "${t?.title||'unknown'}"` } },
    modeTabNew:         { icon: _svgI('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'), label: () => `Opening new tab` },
    ntpPickMode:        { icon: _svgI('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'), label: () => `Selecting ${args[0]}` },
    benchRemove:        { icon: _svgI('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'), label: () => { const b=S.bench.find(b=>b.id===args[0]); return `Removing "${b?.name||'file'}" from Bench` } },
    benchClear:         { icon: _svgI('<path d="M3 6h18"/><path d="M8 6V4h8v2"/>'), label: () => `Clearing Bench` },
    modeSave:           { icon: _svgI('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/>'), label: () => `Saving` },
    modeSaveCloud:      { icon: _svgI('<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>'), label: () => `Saving to cloud` },
    modeNew:            { icon: _svgI('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'), label: () => `Adding new slide` },
  };

  // Try to find the actual DOM element to animate
  const elFinders = {
    modeEnter: () => document.getElementById('mtbNewBtn') || document.querySelector('.mtb-new'),
    wsSetView: () => {
      const tabs = document.querySelectorAll('.ws-nav-tab');
      for (const t of tabs) { if (t.textContent.toLowerCase().includes(args[0])) return t; }
      return null;
    },
    wsCreateProject: () => {
      const btn = document.querySelector('.ws-new-btn.project');
      if (btn) return btn;
      // Also search by text content
      const allBtns = document.querySelectorAll('button');
      for (const b of allBtns) { if (b.textContent.trim().includes('New Project')) return b; }
      return null;
    },
    wsOpenProject: () => {
      const cards = document.querySelectorAll('.ws-project-card');
      for (const c of cards) { if (c.textContent.includes(args[0])) return c; }
      return null;
    },
    openWorkspaceItem: () => {
      const cards = document.querySelectorAll('.ws-file-card');
      return cards[args[0]] || null;
    },
    wsNewFile: () => document.querySelector('.ws-new-btn'),
    openSettings: () => document.querySelector('[onclick*="openSettings"]'),
    openFileNav: () => document.querySelector('[onclick*="openFileNav"]'),
    applyPreset: () => {
      // Find preset pill button by data-preset attribute or text match
      const presetName = args[0];
      const byData = document.querySelector(`#presetPills button[data-preset="${presetName}"]`);
      if (byData) return byData;
      // Fallback: match by display name
      const pills = document.querySelectorAll('#presetPills button');
      const nameMap = {'clean-white':'White','clean-gray':'Gray','clean-dark':'Dark','monet':'Monet','seurat':'Seurat'};
      const displayName = nameMap[presetName] || presetName;
      for (const p of pills) { if (p.textContent.trim() === displayName) return p; }
      return null;
    },
  };
  // setPreset is an alias for applyPreset
  elFinders.setPreset = elFinders.applyPreset;
  // Tab operations
  elFinders.modeTabSwitch = () => document.querySelector(`.mtb-tab[data-tabid="${args[0]}"]`);
  elFinders.modeTabClose = () => {
    const tab = document.querySelector(`.mtb-tab[data-tabid="${args[0]}"]`);
    return tab ? tab.querySelector('.mtb-tab-close') : null;
  };
  elFinders.modeTabNew = () => document.querySelector('.mtb-new');
  elFinders.ntpPickMode = () => {
    // Find the NTP mode icon by mode name
    const ntp = document.getElementById('newTabPage');
    if (!ntp || ntp.style.display === 'none') return null;
    const modes = ntp.querySelectorAll('.ntp-mode');
    const modeMap = { doc: 0, slide: 1, sheet: 2, workspace: 3 };
    const idx = modeMap[args[0]];
    return idx !== undefined ? modes[idx] : null;
  };
  elFinders.benchRemove = () => {
    const card = document.querySelector(`.bench-card[data-benchid="${args[0]}"]`);
    return card ? card.querySelector('.bench-card-del') : null;
  };
  elFinders.benchClear = () => document.getElementById('benchClearBtn');
  elFinders.modeSave = () => document.querySelector('.mtb-save-btn');
  elFinders.modeSaveCloud = () => { const btns = document.querySelectorAll('.mtb-save-btn'); return btns[1] || btns[0]; };
  elFinders.modeNew = () => document.getElementById('mtbNewBtn');

  const finder = elFinders[fnName];
  const el = finder ? finder() : null;

  if (el) {
    // Element found — do full click animation with cursor
    await _aiSimulateClick(el);
    return el;
  } else {
    // Element NOT on screen — show phantom action label as fallback
    const desc = actionLabels[fnName];
    if (desc) {
      await _aiShowPhantomAction(desc.icon, desc.label());
    }
    return null;
  }
}

/**
 * Show step progress dots in the action overlay.
 */
function _aiShowStepProgress(totalSteps, currentStep) {
  const overlay = document.getElementById('ai-action-overlay');
  if (!overlay) return;
  let progressEl = overlay.querySelector('.ai-step-progress');
  if (!progressEl) {
    progressEl = document.createElement('div');
    progressEl.className = 'ai-step-progress';
    overlay.appendChild(progressEl);
  }
  progressEl.innerHTML = '';
  for (let i = 0; i < totalSteps; i++) {
    const dot = document.createElement('div');
    dot.className = 'ai-step-dot';
    if (i < currentStep) dot.classList.add('done');
    if (i === currentStep) dot.classList.add('active');
    progressEl.appendChild(dot);
  }
}

/**
 * Animated "open new tab → pick mode" sequence.
 * Shows AI cursor clicking "+" then clicking the mode on the NTP.
 * Returns after the mode is fully entered.
 */
async function _aiOpenNewTabForMode(mode) {
  _aiEnsureCursor();

  // Step 1: Click "+" button
  _updateAIActionOverlay(`AI ▸ Opening new tab...`);
  const plusBtn = document.querySelector('.mtb-new');
  if (plusBtn) {
    await _aiSimulateClick(plusBtn);
    await new Promise(r => setTimeout(r, 300));
  }
  window.modeTabNew();
  await new Promise(r => setTimeout(r, 600));

  // Step 2: Click mode icon on NTP
  const modeLabels = { slide:'slides', doc:'document', sheet:'spreadsheet', workspace:'workspace' };
  _updateAIActionOverlay(`AI ▸ Selecting ${mode}...`);
  const ntp = document.getElementById('newTabPage');
  if (ntp) {
    const modeMap = { doc: 0, slide: 1, sheet: 2, workspace: 3 };
    const modes = ntp.querySelectorAll('.ntp-mode');
    const el = modes[modeMap[mode]];
    if (el) {
      await _aiSimulateClick(el);
      await new Promise(r => setTimeout(r, 300));
    }
  }
  window.ntpPickMode(mode);
  await new Promise(r => setTimeout(r, 500));

  // Step 3: Deliberate pause — "Generating..."
  _updateAIActionOverlay(`AI ▸ Generating ${modeLabels[mode]||mode}...`);
  await new Promise(r => setTimeout(r, 800));
  _aiHideCursor();
}

/**
 * Shared helper: ensure we're in targetMode before generating.
 * If not in targetMode → animated new tab + mode pick.
 * If already in targetMode → show overlay + deliberate pause.
 * The overlay stays visible — doGenerate/doDocGenerate manage its lifecycle.
 */
async function _aiEnsureModeForGenerate(targetMode) {
  const modeLabels = { slide:'slides', doc:'document', sheet:'spreadsheet' };
  if (S.currentMode !== targetMode) {
    _showAIBlocker();
    _showAIActionOverlay(`AI ▸ Preparing new ${modeLabels[targetMode]||targetMode}...`);
    await _aiOpenNewTabForMode(targetMode);
  } else {
    _showAIBlocker();
    _showAIActionOverlay(`AI ▸ Generating ${modeLabels[targetMode]||targetMode}...`);
    await new Promise(r => setTimeout(r, 600));
  }
}

/* ── AI Action Overlay ── */
function _showAIActionOverlay(text) {
  // Remove any existing overlay
  _hideAIActionOverlay();
  const el = document.createElement('div');
  el.id = 'ai-action-overlay';
  el.innerHTML = `
    <div class="ai-action-spinner"></div>
    <span class="ai-action-text">${text}</span>
  `;
  // Inline styles — Monet orange floating banner
  Object.assign(el.style, {
    position: 'fixed', top: '18px', left: '50%', transform: 'translateX(-50%)',
    zIndex: '99999',
    display: 'flex', alignItems: 'center', gap: '10px',
    background: 'linear-gradient(135deg, rgba(200,168,112,0.92), rgba(180,140,80,0.95))',
    color: '#fff', fontWeight: '600', fontSize: '14px',
    padding: '10px 22px', borderRadius: '12px',
    boxShadow: '0 4px 24px rgba(200,160,100,0.45), 0 0 0 1px rgba(255,255,255,0.08)',
    backdropFilter: 'blur(8px)',
    animation: 'aiOverlayIn 0.3s ease',
    pointerEvents: 'none',
  });
  // Inject keyframes + spinner style if not present
  if (!document.getElementById('ai-action-overlay-style')) {
    const style = document.createElement('style');
    style.id = 'ai-action-overlay-style';
    style.textContent = `
      @keyframes aiOverlayIn { from { opacity:0; transform:translateX(-50%) translateY(-12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      @keyframes aiOverlayOut { from { opacity:1; transform:translateX(-50%) translateY(0); } to { opacity:0; transform:translateX(-50%) translateY(-12px); } }
      @keyframes aiSpinRotate { to { transform:rotate(360deg); } }
      .ai-action-spinner {
        width:16px; height:16px; border:2.5px solid rgba(255,255,255,0.35);
        border-top-color:#fff; border-radius:50%;
        animation: aiSpinRotate 0.7s linear infinite;
        flex-shrink:0;
      }
      .ai-action-text { white-space:nowrap; text-shadow:0 1px 3px rgba(0,0,0,0.2); }
    `;
    document.head.appendChild(style);
  }
  document.body.appendChild(el);
  return el;
}
function _hideAIActionOverlay() {
  const el = document.getElementById('ai-action-overlay');
  if (!el) return;
  el.style.animation = 'aiOverlayOut 0.25s ease forwards';
  setTimeout(() => el.remove(), 260);
}

// ── Interaction blocker: prevents user clicks/touches during AI operations ──
function _showAIBlocker() {
  if (document.getElementById('ai-interaction-blocker')) return;
  const blocker = document.createElement('div');
  blocker.id = 'ai-interaction-blocker';
  Object.assign(blocker.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    zIndex: '99998', // just below the overlay banner (99999)
    background: 'transparent', cursor: 'wait',
  });
  // Block all pointer/touch events
  const stop = e => { e.stopPropagation(); e.preventDefault(); };
  ['pointerdown','pointerup','click','dblclick','mousedown','mouseup',
   'touchstart','touchmove','touchend','contextmenu'].forEach(evt => {
    blocker.addEventListener(evt, stop, { capture: true, passive: false });
  });
  // Allow chat input area to remain functional (user can still type next message)
  document.body.appendChild(blocker);
}
function _hideAIBlocker() {
  const el = document.getElementById('ai-interaction-blocker');
  if (el) el.remove();
}
function _updateAIActionOverlay(text) {
  const el = document.getElementById('ai-action-overlay');
  if (el) {
    const span = el.querySelector('.ai-action-text');
    if (span) span.textContent = text;
  }
}

/**
 * Auto-append smart follow-up actions.
 * e.g. after wsCreateProject → navigate to workspace projects tab to show result.
 */
function _autoChainActions(actions) {
  const fns = actions.map(a => a.fn);
  // After creating a project, navigate to workspace → projects tab to show result
  if (fns.includes('wsCreateProject') && !fns.includes('modeEnter')) {
    actions.push({ fn: 'modeEnter', args: ['workspace'] });
    actions.push({ fn: 'wsSetView', args: ['projects'] });
  }
  return actions;
}

/**
 * Execute an array of AI-driven UI actions.
 * Each action: { fn: 'functionName', args: [...] }
 * Returns array of results/errors for logging.
 */
function executeUIActions(actions, message, opts={}) {
  if (!opts.quiet) actions = _autoChainActions(actions);
  if (message) addMessage(`✦ ${message}`, 'system');
  const showOverlay = !opts.quiet;
  if (showOverlay) _showAIActionOverlay(`AI operating: ${message || 'Performing actions...'}`);

  // If animated mode (not quiet), use async animated execution
  if (!opts.quiet) {
    // Return a promise for animated execution
    const animatedExec = async () => {
      _aiEnsureCursor();
      const results = [];
      let stepIdx = 0;
      for (const action of actions) {
        stepIdx++;
        const fnName = action.fn;
        const args = action.args || [];
        const rule = ALLOWED_ACTIONS[fnName];
        _updateAIActionOverlay(`AI ▸ ${rule?.label || fnName} (${stepIdx}/${actions.length})`);
        if (actions.length > 1) _aiShowStepProgress(actions.length, stepIdx - 1);

        if (!rule) {
          results.push({ fn: fnName, error: 'not allowed' });
          continue;
        }
        // Schema validation
        const schema = ACTION_SCHEMA[fnName];
        if (schema) {
          let valid = true;
          for (let i = 0; i < schema.length; i++) {
            const s = schema[i];
            if (s.optional && args[i] === undefined) continue;
            if (s.type === 'number' && typeof args[i] !== 'number') { valid = false; break; }
            if (s.type === 'string' && typeof args[i] !== 'string') { valid = false; break; }
            if (s.type === 'object' && typeof args[i] !== 'object') { valid = false; break; }
            if (s.enum && !s.enum.includes(args[i])) { valid = false; break; }
          }
          if (!valid) {
            results.push({ fn: fnName, error: 'invalid args', args });
            continue;
          }
        }

        // Animate
        await _aiAnimateBeforeAction(fnName, args);
        if (fnName === 'wsCreateProject' && args[0]) {
          await _aiShowPhantomInput('Project Name', args[0]);
        }

        // Execute
        const fn = window[fnName];
        if (typeof fn !== 'function') {
          results.push({ fn: fnName, error: 'not found' });
          continue;
        }
        try {
          fn(...args);
          results.push({ fn: fnName, ok: true });
        } catch (e) {
          results.push({ fn: fnName, error: e.message });
        }

        // Pause between actions
        if (stepIdx < actions.length) await new Promise(r => setTimeout(r, 500));
      }

      _aiHideCursor();
      if (actions.length > 1) _aiShowStepProgress(actions.length, actions.length);
      const failCount = results.filter(r => r.error).length;
      if (failCount > 0) {
        _updateAIActionOverlay(`AI ▸ Done (${failCount} failed)`);
      } else {
        _updateAIActionOverlay('AI ▸ Done ✓');
      }
      setTimeout(_hideAIActionOverlay, 1200);
      return results;
    };

    // Execute asynchronously — return results via promise
    return animatedExec();
  }

  // Quiet mode — synchronous execution (used by multi-step which handles its own animation)
  const results = [];
  let stepIdx = 0;
  for (const action of actions) {
    stepIdx++;
    const fnName = action.fn;
    const args = action.args || [];
    const rule = ALLOWED_ACTIONS[fnName];
    _updateAIActionOverlay(`AI ▸ ${rule?.label || fnName} (${stepIdx}/${actions.length})`);
    if (!rule) {
      results.push({ fn: fnName, error: 'not allowed' });
      continue;
    }
    const schema = ACTION_SCHEMA[fnName];
    if (schema) {
      let valid = true;
      for (let i = 0; i < schema.length; i++) {
        const s = schema[i];
        if (s.optional && args[i] === undefined) continue;
        if (s.type === 'number' && typeof args[i] !== 'number') { valid = false; break; }
        if (s.type === 'string' && typeof args[i] !== 'string') { valid = false; break; }
        if (s.type === 'object' && typeof args[i] !== 'object') { valid = false; break; }
        if (s.enum && !s.enum.includes(args[i])) { valid = false; break; }
      }
      if (!valid) {
        results.push({ fn: fnName, error: 'invalid args', args });
        continue;
      }
    }
    const fn = window[fnName];
    if (typeof fn !== 'function') {
      results.push({ fn: fnName, error: 'not found' });
      continue;
    }
    try {
      fn(...args);
      results.push({ fn: fnName, ok: true });
    } catch (e) {
      results.push({ fn: fnName, error: e.message });
    }
  }
  if (showOverlay) {
    const failCount = results.filter(r => r.error).length;
    if (failCount > 0) {
      _updateAIActionOverlay(`AI ▸ Done (${failCount} failed)`);
    } else {
      _updateAIActionOverlay('AI ▸ Done ✓');
    }
    setTimeout(_hideAIActionOverlay, 1200);
  }
  return results;
}

/**
 * Resolve fuzzy file/project references in AI actions.
 * Converts human-readable names to actual IDs/indices.
 */
function resolveActionRefs(actions) {
  const files = window.wsLoad ? window.wsLoad() : [];
  const projects = window.wsListProjects ? window.wsListProjects() : [];

  return actions.map(a => {
    const resolved = { ...a, args: [...(a.args || [])] };

    // openWorkspaceItem: if arg is string (filename), resolve to index
    if (a.fn === 'openWorkspaceItem' && typeof a.args[0] === 'string') {
      const name = a.args[0].toLowerCase();
      const idx = files.findIndex(f => (f.title || '').toLowerCase().includes(name));
      if (idx >= 0) resolved.args[0] = idx;
      else {
        console.warn(`[AI UI] File not found: "${a.args[0]}"`);
        return null; // skip this action
      }
    }

    // wsOpenProject: if arg looks like a name (not an ID), resolve to projectId
    if (a.fn === 'wsOpenProject' && typeof a.args[0] === 'string' && !a.args[0].startsWith('proj_')) {
      const name = a.args[0].toLowerCase();
      const proj = projects.find(p => (p.name || '').toLowerCase().includes(name));
      if (proj) resolved.args[0] = proj.id;
      else {
        console.warn(`[AI UI] Project not found: "${a.args[0]}"`);
        return null;
      }
    }

    // wsSetActiveProject: same resolution
    if (a.fn === 'wsSetActiveProject' && typeof a.args[0] === 'string' && !a.args[0].startsWith('proj_')) {
      const name = a.args[0].toLowerCase();
      const proj = projects.find(p => (p.name || '').toLowerCase().includes(name));
      if (proj) resolved.args[0] = proj.id;
    }

    // wsLinkFile: resolve file name → fileId, project name → projectId
    if (a.fn === 'wsLinkFile') {
      if (typeof a.args[0] === 'string' && !a.args[0].startsWith('ws_') && !a.args[0].startsWith('doc_')) {
        const name = a.args[0].toLowerCase();
        const f = files.find(f => (f.title || '').toLowerCase().includes(name));
        if (f) resolved.args[0] = f.id;
      }
      if (typeof a.args[1] === 'string' && !a.args[1].startsWith('proj_')) {
        const name = a.args[1].toLowerCase();
        const p = projects.find(p => (p.name || '').toLowerCase().includes(name));
        if (p) resolved.args[1] = p.id;
      }
    }

    // benchRemove: if arg is string (filename), resolve to bench id
    if (a.fn === 'benchRemove' && typeof a.args[0] === 'string') {
      const name = a.args[0].toLowerCase();
      const item = S.bench.find(b => (b.name || '').toLowerCase().includes(name));
      if (item) resolved.args[0] = item.id;
      else {
        console.warn(`[AI UI] Bench file not found: "${a.args[0]}"`);
        return null;
      }
    }

    // modeTabSwitch / modeTabClose: if arg is string (tab name), resolve to tabId
    if ((a.fn === 'modeTabSwitch' || a.fn === 'modeTabClose') && typeof a.args[0] === 'string') {
      const name = a.args[0].toLowerCase();
      const tab = S.modeTabs.find(t => (t.title || '').toLowerCase().includes(name));
      if (tab) resolved.args[0] = tab.id;
      else {
        console.warn(`[AI UI] Tab not found: "${a.args[0]}"`);
        return null;
      }
    }

    return resolved;
  }).filter(Boolean); // remove nulls from failed resolution
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
  executeUIActions,
  executeMultiStep,
  resolveActionRefs,
  ALLOWED_ACTIONS,
  STYLE_PROMPT,
  CONTENT_EDIT_PROMPT,
  DECK_EDIT_PROMPT,
  ROUTER_PROMPT,
  CHAT_PROMPT,
  GEN_PROMPT,
  IMAGE_PROMPT,
  DOC_GEN_PROMPT,
  SHEET_FILL_PROMPT,
  _showAIActionOverlay,
  _hideAIActionOverlay,
  _updateAIActionOverlay,
  _showAIBlocker,
  _hideAIBlocker,
  ABOUT_TEXTS,
  ABOUT_TRANSLATE_PROMPT
};
