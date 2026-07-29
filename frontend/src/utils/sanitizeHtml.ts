/**
 * Minimal allowlist sanitizer for the rich-text column type. Rich-text values are
 * stored as HTML and later re-injected into a contentEditable via innerHTML, so any
 * tag/attribute not on the allowlist (e.g. <img onerror>, <script>, event handlers)
 * must be stripped before that happens.
 */

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'DIV', 'P', 'BR',
  'UL', 'OL', 'LI',
]);

// Only inline background/text-color styles are allowed through (used by the highlighter tool).
const ALLOWED_STYLE_PROPS = new Set(['background-color', 'color']);

function sanitizeStyle(style: string): string {
  return style
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const prop = decl.split(':')[0]?.trim().toLowerCase();
      return prop && ALLOWED_STYLE_PROPS.has(prop);
    })
    .join('; ');
}

function sanitizeNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.cloneNode(false);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const el = node as Element;
  if (!ALLOWED_TAGS.has(el.tagName)) {
    // Unwrap disallowed elements instead of dropping their (sanitized) text content.
    const frag = document.createDocumentFragment();
    el.childNodes.forEach((child) => {
      const cleaned = sanitizeNode(child);
      if (cleaned) frag.appendChild(cleaned);
    });
    return frag;
  }
  const clean = document.createElement(el.tagName);
  const style = el.getAttribute('style');
  if (style) {
    const cleanedStyle = sanitizeStyle(style);
    if (cleanedStyle) clean.setAttribute('style', cleanedStyle);
  }
  el.childNodes.forEach((child) => {
    const cleaned = sanitizeNode(child);
    if (cleaned) clean.appendChild(cleaned);
  });
  return clean;
}

export function sanitizeRichText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const container = document.createElement('div');
  parsed.body.childNodes.forEach((child) => {
    const cleaned = sanitizeNode(child);
    if (cleaned) container.appendChild(cleaned);
  });
  return container.innerHTML;
}

export function richTextToPlainText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
