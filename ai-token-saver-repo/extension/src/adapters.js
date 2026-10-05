// Site adapters: everything that depends on a platform's page structure lives here.
// These sites change their markup often. When something breaks, this is the file to fix.
// Each selector list is tried in order; the first one that matches wins.

/* exported CH_ADAPTERS, chFirst, chAll */

function chFirst(selectors, root = document) {
  for (const s of selectors) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
}

function chAll(selectors, root = document) {
  for (const s of selectors) {
    const els = root.querySelectorAll(s);
    if (els.length) return [...els];
  }
  return [];
}

const CH_ADAPTERS = [
  {
    id: "claude",
    name: "Claude",
    match: () => location.hostname === "claude.ai",
    newChatUrl: "https://claude.ai/new",
    conversationId() {
      const m = location.pathname.match(/\/chat\/([\w-]+)/);
      return m ? m[1] : null;
    },
    isNewChatPage() {
      return location.pathname === "/new" || location.pathname === "/" || /\/project\/[\w-]+\/?$/.test(location.pathname);
    },
    composer: () =>
      chFirst([
        'div.ProseMirror[contenteditable="true"]',
        'fieldset [contenteditable="true"]',
        '[contenteditable="true"]',
      ]),
    sendButton: () =>
      chFirst([
        'button[aria-label="Send message"]',
        'button[aria-label="Send Message"]',
        'fieldset button[type="submit"]',
      ]),
    stopButton: () =>
      chFirst(['button[aria-label="Stop response"]', 'button[aria-label="Stop Response"]']),
    userMessages: () => chAll(['[data-testid="user-message"]']),
    assistantMessages: () =>
      chAll(["div[data-is-streaming]", ".font-claude-response", ".font-claude-message"]),
    isStreaming() {
      return !!document.querySelector('[data-is-streaming="true"]') || !!this.stopButton();
    },
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    match: () => location.hostname === "chatgpt.com" || location.hostname === "chat.openai.com",
    newChatUrl: "https://chatgpt.com/",
    conversationId() {
      const m = location.pathname.match(/\/c\/([\w-]+)/);
      return m ? m[1] : null;
    },
    isNewChatPage() {
      return location.pathname === "/" || /^\/g\/[\w-]+\/?$/.test(location.pathname);
    },
    composer: () =>
      chFirst([
        '#prompt-textarea[contenteditable="true"]',
        'div.ProseMirror[contenteditable="true"]',
        'form [contenteditable="true"]',
        'textarea#prompt-textarea',
        'form textarea:not([style*="display: none"])',
      ]),
    sendButton: () =>
      chFirst([
        'button[data-testid="send-button"]',
        'button#composer-submit-button[aria-label*="Send"]',
        'button[aria-label="Send prompt"]',
        'button[data-testid="composer-submit-button"]',
      ]),
    stopButton: () =>
      chFirst(['button[data-testid="stop-button"]', 'button[aria-label="Stop streaming"]']),
    userMessages: () => chAll(['[data-message-author-role="user"]']),
    assistantMessages: () => chAll(['[data-message-author-role="assistant"]']),
    isStreaming() {
      return !!this.stopButton();
    },
  },
  {
    id: "gemini",
    name: "Gemini",
    match: () => location.hostname === "gemini.google.com",
    newChatUrl: "https://gemini.google.com/app",
    conversationId() {
      const m = location.pathname.match(/\/app\/([\w-]+)/);
      return m ? m[1] : null;
    },
    isNewChatPage() {
      return /^\/(u\/\d+\/)?app\/?$/.test(location.pathname);
    },
    composer: () =>
      chFirst([
        'rich-textarea .ql-editor[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]',
      ]),
    sendButton: () =>
      chFirst([
        'button.send-button:not(.stop)',
        'button[aria-label="Send message"]',
        'button[aria-label*="Send"]',
      ]),
    stopButton: () =>
      chFirst(['button[aria-label="Stop response"]', 'button.send-button.stop', 'button[aria-label*="Stop"]']),
    userMessages: () => chAll(["user-query", ".user-query-container"]),
    assistantMessages: () => chAll(["model-response message-content", "model-response", ".model-response-text"]),
    isStreaming() {
      return !!this.stopButton();
    },
  },
  {
    id: "perplexity",
    name: "Perplexity",
    match: () => location.hostname === "www.perplexity.ai" || location.hostname === "perplexity.ai",
    newChatUrl: "https://www.perplexity.ai/",
    conversationId() {
      const m = location.pathname.match(/\/search\/([\w.-]+)/);
      return m ? m[1] : null;
    },
    isNewChatPage() {
      return location.pathname === "/";
    },
    composer: () =>
      chFirst([
        '#ask-input[contenteditable="true"]',
        "textarea#ask-input",
        'textarea[placeholder*="Ask"]',
        'div[contenteditable="true"][role="textbox"]',
      ]),
    sendButton: () =>
      chFirst([
        'button[aria-label="Submit"]',
        'button[data-testid="submit-button"]',
        'button[aria-label*="Submit"]',
      ]),
    stopButton: () =>
      chFirst([
        'button[data-testid="stop-generating-response-button"]',
        'button[aria-label="Stop generating response"]',
        'button[aria-label*="Stop"]',
      ]),
    userMessages: () => chAll(['[class*="group/query"]', "h1.group\\/query", "h1"]),
    assistantMessages: () => chAll(['[id^="markdown-content-"]', ".prose"]),
    isStreaming() {
      return !!this.stopButton();
    },
  },
];
