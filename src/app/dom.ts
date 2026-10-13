/**
 * Building the DOM by hand, without a framework: h('div', { class: 'row' }, child, 'text').
 * Text goes in as text nodes, never as HTML: names and notes come from the
 * person and from imported files.
 */

type Child = Node | string | number | null | undefined | false | Child[];
type Listener = (event: Event) => void;

export interface Attributes {
  class?: string | undefined;
  /** Event listeners: { click: (e) => … }. */
  on?: Record<string, Listener> | undefined;
  /** For the focus to come back to the same field after a render (main.ts). */
  key?: string | undefined;
  [name: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Attributes | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (attributes) {
    for (const [name, value] of Object.entries(attributes)) {
      if (value === undefined || value === null || value === false) continue;
      if (name === 'on') {
        for (const [event, listener] of Object.entries(value as Record<string, Listener>)) element.addEventListener(event, listener);
      } else if (name === 'class') element.className = String(value);
      else if (name === 'key') element.dataset.key = String(value);
      else if (name === 'value' && element instanceof HTMLInputElement) {
        // The attribute too: defaultValue then remembers what the field was given, to tell a change.
        element.setAttribute('value', String(value));
        element.value = String(value);
      } else if (name === 'value' && 'value' in element) (element as HTMLInputElement).value = String(value);
      else if (name === 'checked' && element instanceof HTMLInputElement) element.checked = Boolean(value);
      else if (value === true) element.setAttribute(name, '');
      else element.setAttribute(name, String(value));
    }
  }
  append(element, children);
  return element;
}

function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
}

const SVG = 'http://www.w3.org/2000/svg';

/** An SVG element with attributes; for the chart and the icons. */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}, ...children: Array<SVGElement | string>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  for (const child of children) element.append(child);
  return element;
}

const ICONS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  chevron: 'M9 6l6 6-6 6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  back: 'M15 18l-6-6 6-6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  scale: 'M12 4v16M5 8h14M5 8l-3 7h6l-3-7zm14 0l-3 7h6l-3-7zM8 20h8',
};

export function icon(name: keyof typeof ICONS | string): SVGSVGElement {
  return s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'icon' }, s('path', { d: ICONS[name] ?? '' }));
}

/** Clears an element and puts the children in. */
export function fill(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  append(parent, children);
}
