// Generic DOM helpers: waiting, typing into rich-text composers, reading messages as Markdown.

/* exported chSleep, chWaitFor, chComposerText, chClearComposer, chInsertText, chClickSend, chToMarkdown, chLog, chCopy */

const chSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chWaitFor(fn, { timeout = 15000, interval = 250 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await chSleep(interval);
  }
  return null;
}

function chComposerText(el) {
  if (!el) return "";
  return ("value" in el && el.tagName === "TEXTAREA" ? el.value : el.innerText || "").trim();
}

function chSelectAllIn(el) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function chCaretToEnd(el) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function chSetTextareaValue(el, text) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  setter.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function chClearComposer(el) {
  if (el.tagName === "TEXTAREA") return chSetTextareaValue(el, "");
  chSelectAllIn(el);
  document.execCommand("delete", false);
}

// Type text into a ProseMirror / contenteditable composer so the site's editor state updates.
// Tries execCommand first (keeps line breaks, never turns into an attachment), then a synthetic paste.
async function chInsertText(el, text) {
  if (el.tagName === "TEXTAREA") {
    chSetTextareaValue(el, (el.value ? el.value + "\n\n" : "") + text);
    return true;
  }
  const before = (el.textContent || "").length;
  const grew = () => (el.textContent || "").length - before >= Math.min(text.length * 0.5, 20);

  // 1) execCommand: behaves like real typing
  chCaretToEnd(el);
  const ok = document.execCommand("insertText", false, text);
  await chSleep(200);
  chLog("insert via execCommand:", ok, "grew:", grew());
  if (grew()) return true;

  // 2) synthetic paste: ProseMirror parses clipboard text into paragraphs
  chCaretToEnd(el);
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  await chSleep(400);
  chLog("insert via paste, grew:", grew());
  if (grew()) return true;

  // 3) write paragraphs straight into the editor DOM; ProseMirror's observer syncs its state from it
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = text.split("\n").map((l) => `<p>${l ? esc(l) : "<br>"}</p>`).join("");
  el.innerHTML = before ? el.innerHTML + html : html;
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  await chSleep(400);
  chLog("insert via innerHTML, grew:", grew());
  return grew();
}

// Copy text to the clipboard. Tries the async API, then the older execCommand route.
async function chCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) { /* needs focus; fall through */ }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:-1000px;opacity:0;";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { /* ignore */ }
  ta.remove();
  return ok;
}

function chLog(...args) {
  console.log("%c[AI Token Saver]", "color:#c96442;font-weight:bold", ...args);
}

async function chClickSend(adapter) {
  const btn = await chWaitFor(() => {
    const b = adapter.sendButton();
    return b && !b.disabled && b.getAttribute("aria-disabled") !== "true" ? b : null;
  }, { timeout: 5000 });
  chLog("send button:", btn ? btn.outerHTML.slice(0, 160) : "not found, pressing Enter instead");
  if (btn) {
    btn.click();
    return true;
  }
  const comp = adapter.composer();
  if (!comp) return false;
  comp.focus();
  comp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
  return true;
}

// Convert a rendered assistant message back into Markdown so code blocks and lists survive.
function chToMarkdown(root) {
  const SKIP = new Set(["BUTTON", "SVG", "STYLE", "SCRIPT", "NOSCRIPT"]);

  function inline(node) {
    let out = "";
    for (const c of node.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) out += c.textContent;
      else if (c.nodeType === Node.ELEMENT_NODE) out += el(c, true);
    }
    return out;
  }

  function el(n, inInline = false) {
    const tag = n.tagName.toUpperCase();
    if (SKIP.has(tag)) return "";
    switch (tag) {
      case "PRE": {
        const code = n.querySelector("code") || n;
        const lang = ((code.className || "").match(/language-([\w+-]+)/) || [])[1] || "";
        return `\n\`\`\`${lang}\n${code.textContent.replace(/\n$/, "")}\n\`\`\`\n\n`;
      }
      case "CODE":
        return "`" + n.textContent + "`";
      case "STRONG":
      case "B":
        return "**" + inline(n) + "**";
      case "EM":
      case "I":
        return "*" + inline(n) + "*";
      case "BR":
        return "\n";
      case "H1": case "H2": case "H3": case "H4": case "H5": case "H6":
        return "\n" + "#".repeat(+tag[1]) + " " + inline(n).trim() + "\n\n";
      case "P":
        return inline(n).trim() + "\n\n";
      case "LI":
        return inline(n).trim() + "\n";
      case "UL":
      case "OL": {
        let i = 1, out = "";
        for (const li of n.children) {
          if (li.tagName !== "LI") continue;
          const body = block(li).trim().replace(/\n/g, "\n   ");
          out += (tag === "OL" ? `${i++}. ` : "- ") + body + "\n";
        }
        return out + "\n";
      }
      case "TABLE": {
        const rows = [...n.querySelectorAll("tr")].map((tr) =>
          "| " + [...tr.children].map((td) => inline(td).trim().replace(/\|/g, "\\|")).join(" | ") + " |");
        if (rows.length > 1) {
          const cols = n.querySelector("tr").children.length;
          rows.splice(1, 0, "|" + " --- |".repeat(cols));
        }
        return rows.join("\n") + "\n\n";
      }
      default:
        return inInline ? inline(n) : block(n);
    }
  }

  function block(node) {
    let out = "";
    for (const c of node.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) out += c.textContent;
      else if (c.nodeType === Node.ELEMENT_NODE) out += el(c);
    }
    return out;
  }

  return block(root).replace(/\n{3,}/g, "\n\n").trim();
}
