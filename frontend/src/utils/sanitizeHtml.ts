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

// Inline styles allowed through: highlight/text color, font size, and block alignment.
// Each value is validated against a narrow pattern below — never passed through as raw CSS.
const STYLE_VALUE_PATTERNS: Record<string, RegExp> = {
  'background-color': /^(#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\)|transparent|[a-z]+)$/i,
  color: /^(#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\)|[a-z]+)$/i,
  'font-size': /^\d{1,3}(\.\d+)?(px|em|pt|%)$/,
  'text-align': /^(left|right|center|justify)$/,
};

const ALLOWED_DIR_VALUES = new Set(['ltr', 'rtl', 'auto']);

function sanitizeStyle(style: string): string {
  return style
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const [rawProp, ...rest] = decl.split(':');
      const prop = rawProp?.trim().toLowerCase();
      const value = rest.join(':').trim();
      const pattern = prop ? STYLE_VALUE_PATTERNS[prop] : undefined;
      return !!pattern && pattern.test(value);
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
  const dir = el.getAttribute('dir');
  if (dir && ALLOWED_DIR_VALUES.has(dir)) {
    clean.setAttribute('dir', dir);
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

export type TextDirection = 'ltr' | 'rtl';

/**
 * Rich-text values are stored wrapped as `<div dir="ltr|rtl">...</div>` so the
 * chosen direction survives a save/reload. Splits that wrapper back out for editing.
 */
export function splitDirWrapper(html: string): { dir: TextDirection; inner: string } {
  const parsed = new DOMParser().parseFromString(sanitizeRichText(html), 'text/html');
  const children = Array.from(parsed.body.childNodes);
  const first = children[0];
  if (
    children.length === 1 &&
    first?.nodeType === Node.ELEMENT_NODE &&
    (first as Element).tagName === 'DIV' &&
    ((first as Element).getAttribute('dir') === 'rtl' || (first as Element).getAttribute('dir') === 'ltr')
  ) {
    return {
      dir: (first as Element).getAttribute('dir') as TextDirection,
      inner: (first as Element).innerHTML,
    };
  }
  return { dir: 'ltr', inner: parsed.body.innerHTML };
}

export function wrapWithDir(innerHtml: string, dir: TextDirection): string {
  return `<div dir="${dir}">${sanitizeRichText(innerHtml)}</div>`;
}
