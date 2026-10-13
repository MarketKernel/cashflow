/**
 * The page's own dialogs and messages: no alert(), no confirm() — they block
 * the page, look like the browser's and cannot be translated or tested.
 */
import { t } from '../core/i18n';
import { h, icon } from './dom';

export interface Action {
  label: string;
  kind?: 'primary' | 'danger' | 'plain';
  /** Return false to keep the dialog open (a field did not check out). */
  run?: () => boolean | void | Promise<boolean | void>;
  key?: string;
}

export interface Dialog {
  element: HTMLDialogElement;
  close: () => void;
}

let open = 0;
let toasts: HTMLElement | null = null;

/** True while a dialog is open: the keyboard shortcuts wait. */
export const dialogOpen = (): boolean => open > 0;

/**
 * A modal <dialog> with a title, a body and buttons along the bottom. Esc and the
 * close button close it; Enter in a field is left to the field.
 */
export function dialog(title: string, body: Node | Node[], actions: Action[], options: { wide?: boolean; onClose?: () => void } = {}): Dialog {
  const element = h('dialog', { class: options.wide ? 'dialog dialog--wide' : 'dialog', 'aria-label': title });
  const close = (): void => {
    if (!element.isConnected) return;
    element.close();
  };
  element.addEventListener('close', () => {
    open -= 1;
    // Messages shown from inside the dialog outlive it.
    if (toasts && element.contains(toasts)) (document.querySelector('dialog[open]') ?? document.body).append(toasts);
    element.remove();
    options.onClose?.();
  });
  const buttons = actions.map((action) =>
    h(
      'button',
      {
        type: 'button',
        class: `button${action.kind === 'primary' ? ' button--primary' : action.kind === 'danger' ? ' button--danger' : ''}`,
        key: action.key,
        on: {
          click: async () => {
            const result = await action.run?.();
            if (result !== false) close();
          },
        },
      },
      action.label,
    ),
  );
  element.append(
    h(
      'header',
      { class: 'dialog-head' },
      h('h2', null, title),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': t('dialog', 'Close'), on: { click: close } }, icon('close')),
    ),
    h('div', { class: 'dialog-body' }, ...(Array.isArray(body) ? body : [body])),
    h('footer', { class: 'dialog-actions' }, ...buttons),
  );
  document.body.append(element);
  open += 1;
  element.showModal();
  return { element, close };
}

/** Asks; resolves true for yes. */
export function confirmDialog(title: string, text: string, yes: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    dialog(title, h('p', null, text), [
      { label: t('dialog', 'Cancel') },
      { label: yes, kind: danger ? 'danger' : 'primary', key: 'confirm', run: () => void (answer = true) },
    ], { onClose: () => resolve(answer) });
  });
}

/** A short message at the bottom that goes away by itself. */
export function toast(text: string, kind: 'info' | 'error' = 'info'): void {
  if (!toasts) {
    toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toasts);
  }
  const item = h('div', { class: `toast toast--${kind}` }, text);
  // Above an open modal dialog, which sits in the top layer: the message goes in there.
  const host = document.querySelector('dialog[open]') ?? document.body;
  if (toasts.parentElement !== host) host.append(toasts);
  toasts.append(item);
  window.setTimeout(() => item.classList.add('toast--leaving'), kind === 'error' ? 5000 : 2600);
  window.setTimeout(() => item.remove(), kind === 'error' ? 5400 : 3000);
}

/** A labelled field: the label above, an optional hint below. */
export function field(label: string, control: Node, hint?: Node | string | null, className = ''): HTMLLabelElement {
  return h('label', { class: `field ${className}`.trim() }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

/** Buttons that pick one of a few values. */
export function segmented<T extends string>(options: Array<[T, string]>, value: T, change: (value: T) => void, label: string, key?: string): HTMLDivElement {
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  for (const [option, text] of options) {
    const button = h(
      'button',
      {
        type: 'button',
        role: 'radio',
        'aria-checked': option === value ? 'true' : 'false',
        class: option === value ? 'segment segment--on' : 'segment',
        key: key ? `${key}-${option}` : undefined,
        on: {
          click: () => {
            for (const b of Array.from(group.children)) {
              b.setAttribute('aria-checked', 'false');
              b.classList.remove('segment--on');
            }
            button.setAttribute('aria-checked', 'true');
            button.classList.add('segment--on');
            change(option);
          },
        },
      },
      text,
    );
    group.append(button);
  }
  return group;
}

export function select<T extends string>(options: Array<[T, string]>, value: T, change: (value: T) => void, attributes: Record<string, unknown> = {}): HTMLSelectElement {
  const element = h('select', { ...attributes, on: { change: () => change(element.value as T) } });
  for (const [option, text] of options) element.append(h('option', { value: option, selected: option === value }, text));
  element.value = value;
  return element;
}

/** Enter moves to the next field of the form, and from the last one presses `submit`. */
export function enterMovesOn(fields: HTMLElement[], submit: () => void): void {
  fields.forEach((input, index) => {
    input.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent) || event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      const next = fields[index + 1];
      if (next) {
        next.focus();
        if (next instanceof HTMLInputElement) next.select();
      } else submit();
    });
  });
}
