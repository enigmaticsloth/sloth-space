// ═══════════════════════════════════════════
// SLOTH SPACE — Shared State & Constants
// ═══════════════════════════════════════════
// All mutable state lives here as properties of the S object.
// Modules import S and read/write through it.
// Constants are exported individually.

// ── Design System Constants ──

export const PRESETS = {
  "clean-white": { id:"clean-white",name:"White",colors:{background:"#FFFFFF",surface:"#F5F5F5",primary:"#111111",secondary:"#666666",accent:"#111111",on_accent:"#FFFFFF",border:"#E0E0E0",table_header_bg:"#F0F0F0",table_header_text:"#111111",table_row_alt:"#FAFAFA"},typography:{heading:{family:"Arial",weight:700,letterSpacing:-0.3},body:{family:"Arial",weight:400,lineHeight:1.6},caption:{family:"Arial",weight:400},scale:[44,32,24,18,14,12]},spacing:{margin:{top:60,right:72,bottom:52,left:72},gap:24,paragraph:14},slide:{width:1280,height:720}},
  "clean-gray": { id:"clean-gray",name:"Gray",colors:{background:"#F2F2F2",surface:"#E8E8E8",primary:"#111111",secondary:"#555555",accent:"#111111",on_accent:"#FFFFFF",border:"#D0D0D0",table_header_bg:"#E0E0E0",table_header_text:"#111111",table_row_alt:"#EBEBEB"},typography:{heading:{family:"Arial",weight:700,letterSpacing:-0.3},body:{family:"Arial",weight:400,lineHeight:1.6},caption:{family:"Arial",weight:400},scale:[44,32,24,18,14,12]},spacing:{margin:{top:60,right:72,bottom:52,left:72},gap:24,paragraph:14},slide:{width:1280,height:720}},
  "clean-dark": { id:"clean-dark",name:"Dark",colors:{background:"#111111",surface:"#1A1A1A",primary:"#F0F0F0",secondary:"#999999",accent:"#F0F0F0",on_accent:"#111111",border:"#333333",table_header_bg:"#333333",table_header_text:"#F0F0F0",table_row_alt:"#1A1A1A"},typography:{heading:{family:"Arial",weight:700,letterSpacing:-0.3},body:{family:"Arial",weight:400,lineHeight:1.6},caption:{family:"Arial",weight:400},scale:[44,32,24,18,14,12]},spacing:{margin:{top:60,right:72,bottom:52,left:72},gap:24,paragraph:14},slide:{width:1280,height:720}},
  "monet": { id:"monet",name:"Monet",colors:{background:"#F6F3EE",surface:"#EDE8DF",primary:"#2C2C3A",secondary:"#7B7B8E",accent:"#7886A5",on_accent:"#FFFFFF",border:"#D5D0C7",table_header_bg:"#D8DCEA",table_header_text:"#2C2C3A",table_row_alt:"#EFECEA"},typography:{heading:{family:"Arial",weight:700,letterSpacing:-0.3},body:{family:"Arial",weight:400,lineHeight:1.6},caption:{family:"Arial",weight:400},scale:[44,32,24,18,14,12]},spacing:{margin:{top:60,right:72,bottom:52,left:72},gap:24,paragraph:14},slide:{width:1280,height:720}},
  "seurat": { id:"seurat",name:"Seurat",colors:{background:"#FDF8EF",surface:"#F0E8D8",primary:"#2A2A1E",secondary:"#6B6B58",accent:"#C67A3C",on_accent:"#FFFFFF",border:"#D9D0C0",table_header_bg:"#E8D8BD",table_header_text:"#2A2A1E",table_row_alt:"#F5F0E5"},typography:{heading:{family:"Arial",weight:700,letterSpacing:-0.3},body:{family:"Arial",weight:400,lineHeight:1.6},caption:{family:"Arial",weight:400},scale:[44,32,24,18,14,12]},spacing:{margin:{top:60,right:72,bottom:52,left:72},gap:24,paragraph:14},slide:{width:1280,height:720}}
};

export const LAYOUTS = {
  "title":{regions:[{id:"title",role:"title",bounds:{x:0,y:160,w:900,h:140},align:{horizontal:"left",vertical:"bottom"},fontSize:"title"},{id:"subtitle",role:"subtitle",bounds:{x:0,y:320,w:700,h:60},align:{horizontal:"left",vertical:"top"},fontSize:"h2",optional:true},{id:"tagline",role:"caption",bounds:{x:0,y:420,w:500,h:30},fontSize:"caption",optional:true},{id:"date",role:"caption",bounds:{x:0,y:460,w:300,h:24},fontSize:"small",optional:true}]},
  "content":{regions:[{id:"heading",role:"heading",bounds:{x:0,y:0,w:1136,h:44},align:{horizontal:"left",vertical:"top"},fontSize:"h1"},{id:"body",role:"body",bounds:{x:0,y:64,w:1136,h:480},align:{horizontal:"left",vertical:"top"},fontSize:"body"},{id:"footnote",role:"caption",bounds:{x:0,y:560,w:1136,h:20},fontSize:"small",optional:true}]},
  "two-column":{regions:[{id:"heading",role:"heading",bounds:{x:0,y:0,w:1136,h:44},fontSize:"h1"},{id:"left_label",role:"caption",bounds:{x:0,y:68,w:540,h:24},fontSize:"caption",optional:true},{id:"left",role:"body",bounds:{x:0,y:100,w:540,h:460},fontSize:"body"},{id:"right_label",role:"caption",bounds:{x:596,y:68,w:540,h:24},fontSize:"caption",optional:true},{id:"right",role:"body",bounds:{x:596,y:100,w:540,h:460},fontSize:"body"}]},
  "image-top":{regions:[{id:"heading",role:"heading",bounds:{x:0,y:0,w:1136,h:40},fontSize:"h1"},{id:"image",role:"image",bounds:{x:0,y:56,w:1136,h:300},optional:true},{id:"body",role:"body",bounds:{x:0,y:376,w:1136,h:200},fontSize:"body"}]},
  "image-left":{regions:[{id:"heading",role:"heading",bounds:{x:0,y:0,w:1136,h:40},fontSize:"h1"},{id:"image",role:"image",bounds:{x:0,y:60,w:520,h:520},optional:true},{id:"body",role:"body",bounds:{x:568,y:60,w:568,h:520},fontSize:"body"}]},
  "image-right":{regions:[{id:"heading",role:"heading",bounds:{x:0,y:0,w:1136,h:40},fontSize:"h1"},{id:"body",role:"body",bounds:{x:0,y:60,w:520,h:520},fontSize:"body"},{id:"image",role:"image",bounds:{x:568,y:60,w:568,h:520},optional:true}]},
  "image-bottom":{regions:[{id:"heading",role:"heading",bounds:{x:0,y:0,w:1136,h:40},fontSize:"h1"},{id:"body",role:"body",bounds:{x:0,y:56,w:1136,h:200},fontSize:"body"},{id:"image",role:"image",bounds:{x:0,y:276,w:1136,h:300},optional:true}]},
  "quote":{background_override:"surface",regions:[{id:"quote",role:"quote",bounds:{x:120,y:120,w:896,h:280},align:{horizontal:"center",vertical:"middle"},fontSize:"h1"},{id:"author",role:"author",bounds:{x:120,y:430,w:896,h:32},align:{horizontal:"center"},fontSize:"body",optional:true},{id:"role",role:"caption",bounds:{x:120,y:470,w:896,h:24},align:{horizontal:"center"},fontSize:"caption",optional:true}]},
  "data-table":{regions:[{id:"heading",role:"heading",bounds:{x:0,y:0,w:1136,h:44},fontSize:"h1"},{id:"description",role:"body",bounds:{x:0,y:56,w:1136,h:36},fontSize:"body",optional:true},{id:"table",role:"table",bounds:{x:0,y:112,w:1136,h:420}},{id:"source",role:"caption",bounds:{x:0,y:560,w:1136,h:20},fontSize:"small",optional:true}]},
  "closing":{regions:[{id:"heading",role:"title",bounds:{x:140,y:160,w:856,h:120},align:{horizontal:"center",vertical:"middle"},fontSize:"title"},{id:"subtitle",role:"subtitle",bounds:{x:200,y:300,w:736,h:50},align:{horizontal:"center"},fontSize:"h2",optional:true},{id:"contact",role:"caption",bounds:{x:300,y:400,w:536,h:80},align:{horizontal:"center"},fontSize:"caption",optional:true}]}
};

export const BASIC_COLORS = ["#111111","#333333","#666666","#999999","#CCCCCC","#FFFFFF","#CC0000","#CC6600","#CCCC00","#00CC00","#0066CC","#6600CC","#CC0066","#006666","#663300","#336633"];
export const MONET_COLORS = ["#7886A5","#9BA8C4","#B8C4D8","#D8DCEA","#8B9E8B","#A8B8A0","#C9B8D4","#E8D0E0","#D4C4A8","#EDE8DF","#7B7B8E","#2C2C3A","#A0929B","#BDB2A0","#C7D1D6","#849BAE"];
export const SEURAT_COLORS = ["#C67A3C","#D4A06A","#E8D8BD","#8B9E6B","#6B8E5A","#4A7C6F","#5B8FA8","#3B6E8E","#D4564A","#E88A6E","#F0E8D8","#2A2A1E","#6B6B58","#A09880","#D9D0C0","#B8A88E"];
export const FONTS = ["Arial","Helvetica","Times New Roman","Georgia","Courier New","Verdana","Trebuchet MS","Palatino","Garamond","Futura","Gill Sans","Rockwell","Cambria","Calibri","Consolas","Impact"];

export const VALID_PRESETS = ['clean-white','clean-gray','clean-dark','monet','seurat'];
export const VALID_LAYOUTS = ['title','content','two-column','image-top','image-left','image-right','image-bottom','quote','data-table','closing'];

// ── Storage Keys ──
export const WS_STORAGE_KEY = 'sloth_workspace_files';
export const WS_PROJECTS_KEY = 'sloth_workspace_projects';
export const WS_LINKS_KEY = 'sloth_workspace_links';
export const STORAGE_KEY = 'sloth_space_deck';
export const STORAGE_HISTORY_KEY = 'sloth_space_chat';
export const CHAT_TABS_KEY = 'sloth_chat_tabs';
export const CONFIG_KEY = 'sloth_space_config';

// ── LLM Provider Defaults ──
export const LLM_DEFAULTS = {
  groq: {
    url:'https://api.groq.com/openai/v1/chat/completions', model:'llama-3.3-70b-versatile', router:'llama-3.1-8b-instant',
    keyPrefix:'gsk_', label:'Groq', desc:'Free · Fast inference', color:'#F55036', keyUrl:'console.groq.com'
  },
  openai: {
    url:'https://api.openai.com/v1/chat/completions', model:'gpt-4o', router:'gpt-4o-mini',
    keyPrefix:'sk-', label:'OpenAI', desc:'GPT-4o · Most popular', color:'#10A37F', keyUrl:'platform.openai.com/api-keys'
  },
  claude: {
    url:'https://api.anthropic.com/v1/messages', model:'claude-sonnet-4-20250514', router:'claude-haiku-3-20240307',
    keyPrefix:'sk-ant-', label:'Claude', desc:'Anthropic · Smart reasoning', color:'#D97757', keyUrl:'console.anthropic.com'
  },
  grok: {
    url:'https://api.x.ai/v1/chat/completions', model:'grok-3', router:'grok-3-mini',
    keyPrefix:'xai-', label:'Grok', desc:'xAI · Real-time knowledge', color:'#1DA1F2', keyUrl:'console.x.ai'
  },
  ollama: {
    url:'http://localhost:11434/v1/chat/completions', model:'llama3.1:8b', router:'llama3.1:8b',
    keyPrefix:'', label:'Ollama', desc:'Local · Offline · Private', color:'#999', keyUrl:''
  },
  custom: {
    url:'', model:'', router:'',
    keyPrefix:'', label:'Custom', desc:'Your own endpoint', color:'#666', keyUrl:''
  }
};

export const CLOUD_PROVIDERS = ['groq','openai','claude','grok'];

// ── Supabase Config ──
export const SUPABASE_URL = 'https://kfqmaztaxghbruhifeve.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcW1henRheGdoYnJ1aGlmZXZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjU0NjIsImV4cCI6MjA4OTAwMTQ2Mn0.eLDC7aUsQymXr8rz4HS_B_AKrpRpo9iQak-TQOeTBrk';
export const CLOUD_BUCKET = 'decks';

// ── Doc Block Types ──
export const DOC_BLOCK_TYPES = [
  {type:'paragraph',  label:'Text',       icon:'¶'},
  {type:'heading1',   label:'Heading 1',  icon:'H1'},
  {type:'heading2',   label:'Heading 2',  icon:'H2'},
  {type:'heading3',   label:'Heading 3',  icon:'H3'},
  {type:'quote',      label:'Quote',      icon:'❝'},
  {type:'code',       label:'Code',       icon:'<>'},
  {type:'list',       label:'Bullet List',icon:'•'},
  {type:'numbered',   label:'Numbered',   icon:'1.'},
  {type:'divider',    label:'Divider',    icon:'—'},
  {type:'image',      label:'Image',      icon:'🖼'},
];

// ── Doc Constants ──
export const DOC_MAX_UNDO = 50;
export const DOC_DRAG_DEAD_ZONE = 18;
export const DOC_DRAG_HYSTERESIS = 10;
export const MAX_UNDO = 50;

// ── Scale Constants for Slide Rendering ──
export const SC = {title:0, h1:1, h2:2, body:3, caption:4, small:5};

// ═══════════════════════════════════════════
// MUTABLE STATE
// ═══════════════════════════════════════════
// All mutable state is on the S object so modules can share it.

export const S = {
  // ── Mode ──
  currentMode: 'slide',
  currentProduct: 'slides',

  // ── Slide Mode ──
  currentDeck: null,
  currentPreset: 'clean-white',
  currentSlide: 0,
  chatHistory: [],
  selectedRegion: null,
  undoStack: [],
  redoStack: [],
  slideAnimDir: 0,
  inlineEdit: null,

  // ── Slide Freeform Canvas ──
  fcDrag: null,
  fcJustDragged: false,
  fcMoveMode: false,
  fcMoveOrigin: null,

  // ── Text Selection Tooltip ──
  textSelTimeout: null,

  // ── Doc Mode ──
  currentDoc: null,
  docSelectedBlockId: null,
  docEditingBlockId: null,
  docSelectedCaptionBlockId: null,
  docCtxMenuBlockId: null,
  docLastClickedBlock: null,
  docClickTimer: null,
  docUndoPushTimer: null,
  docAutoSaveTimer: null,
  docZoomLevel: 100,

  // ── Doc Undo/Redo ──
  docUndoStack: [],
  docRedoStack: [],
  docUndoRedoInProgress: false,

  // ── Doc Type Menu ──
  docTypeMenuVisible: false,
  docTypeMenuSelection: 0,

  // ── Doc Drag (Mouse) ──
  docDragBlockId: null,
  docDragLastOverId: null,
  docDragStartY: null,
  docDragActivated: false,
  docDragLastInsertAfter: null,

  // ── Doc Drag (Touch) ──
  docTouchDragId: null,
  docTouchStartY: null,
  docTouchActivated: false,
  docTouchLastInsertAfter: null,
  docTouchLastOverId: null,

  // ── LLM Config ──
  llmConfig: {
    provider: 'groq',
    url: '',
    apiKey: '',
    model: '',
    router: ''
  },
  settingsProvider: 'groq',
  welcomeProvider: 'groq',

  // ── Auth / Cloud ──
  supabaseClient: null,
  currentUser: null,
  _authSyncDone: false,

  // ── Workspace ──
  wsSelectedIds: new Set(),
  wsSelectMode: false,
  wsModalType: 'doc',
  wsActiveProjectId: null,   // currently viewing/working in this project
  _wsCurrentFileId: null,    // workspace file ID of file currently being edited
  // Monet palette for project colors (user can pick per project)
  wsProjectColors: [
    { id:'monet-blue',    bg:'rgba(120,134,165,0.15)', border:'rgba(120,134,165,0.35)', text:'#9BA8C4', dot:'#7886A5' },
    { id:'monet-lavender',bg:'rgba(139,123,168,0.15)', border:'rgba(139,123,168,0.35)', text:'#A899C4', dot:'#8B7BA8' },
    { id:'monet-sage',    bg:'rgba(107,142,123,0.15)', border:'rgba(107,142,123,0.35)', text:'#8FB89F', dot:'#6B8E7B' },
    { id:'monet-rose',    bg:'rgba(168,120,130,0.15)', border:'rgba(168,120,130,0.35)', text:'#C49BA5', dot:'#A87882' },
    { id:'monet-ochre',   bg:'rgba(168,145,100,0.15)', border:'rgba(168,145,100,0.35)', text:'#C4B48F', dot:'#A89164' },
    { id:'monet-mist',    bg:'rgba(130,155,160,0.15)', border:'rgba(130,155,160,0.35)', text:'#A8BFC4', dot:'#829BA0' },
  ],
  wsView: 'projects',        // 'projects' | 'all' | 'unlinked'
  wsTypeFilters: { slide: true, doc: true, sheet: true, image: true },  // file type filter checkboxes
  wsSearchQuery: '',         // search bar text
  wsProjectSearch: '',       // project list search text
  wsSortBy: 'date',          // 'date' | 'name' | 'type'
  wsSortAsc: false,          // false = newest/Z-A first, true = oldest/A-Z first

  // ── File Nav ──
  fileNavTab: 'all',

  // ── Chat Tabs ──
  chatTabs: [],       // [{id, title, history[], messagesHTML}] — max 3
  activeChatTab: 0,   // index into chatTabs

  // ── Chat Input ──
  inputCollapsed: false,
  stagedImages: [],
  dragCounter: 0,
  imeComposing: false,

  // ── Sheet Mode ──
  sheet: {
    current: null,           // current sheet data (SheetContent)
    editingCell: null,       // { rowId, colId } currently being edited
    selectedCell: null,      // { rowId, colId } currently selected
    selectedRange: null,     // { startRow, startCol, endRow, endCol }
    undoStack: [],
    redoStack: [],
    undoRedoInProgress: false,
    autoSaveTimer: null,
  },

  // ── Touch / Mobile ──
  touchStartX: 0,
  touchStartY: 0,
  lastW: typeof window !== 'undefined' ? window.innerWidth : 1024,
};
