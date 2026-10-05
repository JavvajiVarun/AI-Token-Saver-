// Mock chat pages with each site's DOM structure (as the adapters expect).
const SITES = {
  claude: { conv: /^\/chat\//, newPath: '/new', convPath: '/chat/new-',
    composer: '<div class="ProseMirror" contenteditable="true"></div>', send: '<button aria-label="Send message">Send</button>',
    user: t => `<div data-testid="user-message">${t}</div>`, asst: t => `<div data-is-streaming="false"><div class="font-claude-response"><p>${t}</p></div></div>`,
    mkUser: `const u=document.createElement('div'); u.dataset.testid='user-message';`, mkAsst: `const a=document.createElement('div'); a.setAttribute('data-is-streaming','true'); const box=a;`,
    done: `a.setAttribute('data-is-streaming','false');`, stop: '' },
  chatgpt: { conv: /^\/c\//, newPath: '/', convPath: '/c/new-',
    composer: '<div id="prompt-textarea" class="ProseMirror" contenteditable="true"></div>', send: '<button data-testid="send-button">Send</button>',
    user: t => `<div data-message-author-role="user">${t}</div>`, asst: t => `<div data-message-author-role="assistant"><div class="markdown"><p>${t}</p></div></div>`,
    mkUser: `const u=document.createElement('div'); u.setAttribute('data-message-author-role','user');`, mkAsst: `const a=document.createElement('div'); a.setAttribute('data-message-author-role','assistant'); const box=a;`,
    done: '', stop: `<button data-testid="stop-button">Stop</button>` },
  gemini: { conv: /^\/app\/.+/, newPath: '/app', convPath: '/app/new',
    composer: '<rich-textarea><div class="ql-editor" contenteditable="true"></div></rich-textarea>', send: '<button class="send-button" aria-label="Send message">Send</button>',
    user: t => `<user-query><div class="query-text">${t}</div></user-query>`, asst: t => `<model-response><message-content><p>${t}</p></message-content></model-response>`,
    mkUser: `const u=document.createElement('user-query');`, mkAsst: `const a=document.createElement('model-response'); const box=document.createElement('message-content'); a.appendChild(box);`,
    done: '', stop: `<button aria-label="Stop response">Stop</button>` },
  perplexity: { conv: /^\/search\//, newPath: '/', convPath: '/search/new-thread-',
    composer: '<textarea id="ask-input" placeholder="Ask anything..."></textarea>', send: '<button aria-label="Submit">Go</button>',
    user: t => `<div class="group/query"><h1>${t}</h1></div>`, asst: (t, i) => `<div id="markdown-content-${i}" class="prose"><p>${t}</p></div>`,
    mkUser: `const u=document.createElement('div'); u.className='group/query';`, mkAsst: `const a=document.createElement('div'); a.id='markdown-content-'+(n++); a.className='prose'; const box=a;`,
    done: '', stop: `<button data-testid="stop-generating-response-button">Stop</button>` },
};
module.exports = function (site, path) {
  const S = SITES[site]; const inConv = S.conv.test(path);
  const filler = 'We discussed the pipeline design in depth, including partitioning and retries. '.repeat(20);
  const hist = inConv ? Array.from({ length: 50 }, (_, i) => S.user(`Question ${i}: ${filler}`) + S.asst(`Answer ${i}: ${filler}`, i)).join('') : '';
  return `<!doctype html><html><body><main><div id="thread">${hist}</div><form onsubmit="return false">${S.composer}${S.send}</form></main>
<script>
window.sent=[]; let n=100;
const comp=document.querySelector('#ask-input, [contenteditable="true"]');
const read=()=>comp.tagName==='TEXTAREA'?comp.value:comp.innerText; const clear=()=>{ if(comp.tagName==='TEXTAREA') comp.value=''; else comp.innerHTML=''; };
document.querySelector('form button').onclick=()=>{
  const text=read().trim(); if(!text) return; window.sent.push(text); clear();
  ${S.mkUser} u.textContent=text; thread.appendChild(u);
  if (!/${S.conv.source}/.test(location.pathname)) history.pushState({}, '', '${S.convPath}'+Math.random().toString(36).slice(2,8));
  ${S.mkAsst} thread.appendChild(a);
  const stopHtml=${JSON.stringify(S.stop)}; let stop=null;
  if(stopHtml){ const w=document.createElement('div'); w.innerHTML=stopHtml; stop=w.firstChild; document.querySelector('form').appendChild(stop); }
  const reply = text.includes('handoff summary')
    ? '<h2>Goal</h2><p>Build a <strong>BigQuery</strong> pipeline.</p><ul><li>Decision: partition by date</li><li>Retries: 3</li></ul><pre><code class="language-python">def run():\\n    return 42\\n</code></pre><p>Next: add tests.</p>'
    : '<p>Sure, here is the answer to: '+text.slice(0,30)+'</p>';
  let i=0; const parts=reply.match(/.{1,40}/gs);
  const t=setInterval(()=>{ box.innerHTML=parts.slice(0,++i).join(''); if(i>=parts.length){ clearInterval(t); ${S.done} if(stop) stop.remove(); } },120);
};
</script></body></html>`;
};
module.exports.SITES = SITES;
