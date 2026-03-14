// ═══════════════════════════════════════════
// Sloth Space — shared/llm.js
// LLM provider config, API call, config persistence
// ═══════════════════════════════════════════

export const LLM_DEFAULTS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    router: 'llama-3.1-8b-instant',
    keyPrefix: 'gsk_',
    label: 'Groq',
    desc: 'Free · Fast inference',
    color: '#F55036',
    keyUrl: 'console.groq.com'
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    router: 'gpt-4o-mini',
    keyPrefix: 'sk-',
    label: 'OpenAI',
    desc: 'GPT-4o · Most popular',
    color: '#10A37F',
    keyUrl: 'platform.openai.com/api-keys'
  },
  claude: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514',
    router: 'claude-haiku-3-20240307',
    keyPrefix: 'sk-ant-',
    label: 'Claude',
    desc: 'Anthropic · Smart reasoning',
    color: '#D97757',
    keyUrl: 'console.anthropic.com'
  },
  grok: {
    url: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-3',
    router: 'grok-3-mini',
    keyPrefix: 'xai-',
    label: 'Grok',
    desc: 'xAI · Real-time knowledge',
    color: '#1DA1F2',
    keyUrl: 'console.x.ai'
  },
  ollama: {
    url: 'http://localhost:11434/v1/chat/completions',
    model: 'llama3.1:8b',
    router: 'llama3.1:8b',
    keyPrefix: '',
    label: 'Ollama',
    desc: 'Local · Offline · Private',
    color: '#999',
    keyUrl: ''
  },
  custom: {
    url: '',
    model: '',
    router: '',
    keyPrefix: '',
    label: 'Custom',
    desc: 'Any OpenAI-compatible API',
    color: '#666',
    keyUrl: ''
  }
};

export const CONFIG_KEY = 'sloth_space_config';

// Current LLM config (loaded from localStorage or defaults)
export let llmConfig = {
  provider: 'groq',
  url: LLM_DEFAULTS.groq.url,
  apiKey: '',
  model: LLM_DEFAULTS.groq.model,
  router: LLM_DEFAULTS.groq.router,
  displayName: ''
};

// Hook for cloud sync — set via setOnConfigSave()
let _onConfigSave = null;
export function setOnConfigSave(fn){ _onConfigSave = fn; }

export function loadConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      const c = JSON.parse(saved);
      Object.assign(llmConfig, c);
      return true;
    }
  } catch(e) {}
  return false;
}

export function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(llmConfig));
  if(_onConfigSave) _onConfigSave();
}

export function isConfigured() {
  if (llmConfig.provider === 'ollama') return !!llmConfig.url;
  if (llmConfig.provider === 'custom') return !!llmConfig.url;
  return !!llmConfig.apiKey; // cloud providers need API key
}

export function clearLocalConfig(){
  llmConfig.apiKey='';
  llmConfig.provider='groq';
  llmConfig.url=LLM_DEFAULTS.groq.url;
  llmConfig.model=LLM_DEFAULTS.groq.model;
  llmConfig.router=LLM_DEFAULTS.groq.router;
  llmConfig.displayName='';
  localStorage.removeItem(CONFIG_KEY);
}

export async function callLLM(systemContent,messages,opts={}){
  if(!isConfigured()){throw new Error('No LLM configured. Click ⚙ Settings to set up.');}
  const useRouter=opts.useRouter||false;
  const model=opts.model||(useRouter?llmConfig.router:llmConfig.model);
  const headers={'Content-Type':'application/json'};

  let body;
  if(llmConfig.provider==='claude'){
    // Anthropic Messages API — different format
    headers['x-api-key']=llmConfig.apiKey;
    headers['anthropic-version']='2023-06-01';
    headers['anthropic-dangerous-direct-browser-access']='true';
    const claudeBody={model,system:systemContent,messages:messages.map(m=>({role:m.role==='system'?'user':m.role,content:m.content})),temperature:opts.temperature??0.7,max_tokens:opts.max_tokens||4096};
    body=JSON.stringify(claudeBody);
  }else{
    // OpenAI-compatible format (Groq, OpenAI, Grok, Ollama, Custom)
    if(llmConfig.apiKey)headers['Authorization']=`Bearer ${llmConfig.apiKey}`;
    const oaiBody={model,messages:[{role:'system',content:systemContent},...messages],temperature:opts.temperature??0.7,max_tokens:opts.max_tokens||4096};
    if(opts.json)oaiBody.response_format={type:'json_object'};
    body=JSON.stringify(oaiBody);
  }

  const res=await fetch(llmConfig.url,{method:'POST',headers,body});
  if(!res.ok){const e=await res.text();throw new Error(`API ${res.status}: ${e.slice(0,200)}`);}
  const data=await res.json();

  // Claude returns content[0].text, OpenAI-compatible returns choices[0].message.content
  if(llmConfig.provider==='claude'){
    return data.content?.[0]?.text||'';
  }
  return data.choices?.[0]?.message?.content||'';
}
