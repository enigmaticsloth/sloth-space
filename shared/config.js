// ═══════════════════════════════════════════
// Sloth Space — shared/config.js
// Data constants, presets, layouts, colors, fonts
// ═══════════════════════════════════════════

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

// Shared mutable state — use state.xxx to read/write from any module
export const state = {
  currentDeck: null,
  currentPreset: "clean-white",
  currentSlide: 0,
  chatHistory: [],
  selectedRegion: null
};
