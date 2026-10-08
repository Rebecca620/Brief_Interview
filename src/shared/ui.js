import { desktop, binaryPayload, reportStorage } from '../platform/desktop.js';
export const $ = (selector) => document.querySelector(selector);
export function toast(message, undo) {
  const element = $('#toast');
  element.replaceChildren(document.createTextNode(message));
  element.dataset.visible = 'true';
  clearTimeout(toast.timer);
  if (undo) {
    const button = document.createElement('button');
    button.textContent = undo.label;
    button.onclick = () => {
      undo.action();
      element.dataset.visible = 'false';
    };
    element.append(button);
  } else
    toast.timer = setTimeout(() => {
      element.dataset.visible = 'false';
    }, 4000);
}
export function showError(message) {
  $('#error-message').textContent = message;
  $('#error-banner').hidden = false;
}
let modalOrigin = null;
export function modal(title, html) {
  $('#modal').classList.toggle(
    'wide',
    ['Review data import', 'Review document import'].includes(title),
  );
  if (!$('#modal').open) {
    const element = document.activeElement;
    const attribute = ['data-edit', 'data-card-share', 'id'].find((name) =>
      element.hasAttribute(name),
    );
    modalOrigin = { element, attribute, value: attribute ? element.getAttribute(attribute) : null };
  }
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  if (!$('#modal').open) $('#modal').showModal();
  $('#modal').scrollTop = 0;
  $('#close-modal').focus();
}
export const closeModal = () => $('#modal').close();
export function download(name, type, body) {
  if (desktop()) {
    binaryPayload(name, type, body)
      .then((file) => desktop().send('saveFile', file))
      .then((result) => toast(result.saved ? 'File saved' : 'Save cancelled'))
      .catch((error) => showError(error.message));
    return;
  }
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(new Blob([body], { type }));
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Download prepared');
}
export function initShell() {
  document.querySelectorAll('dialog').forEach((dialog) => {
    let startedOutside = false;
    const outside = (event) => {
      const bounds = dialog.getBoundingClientRect();
      return (
        event.target === dialog &&
        (event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom)
      );
    };
    dialog.addEventListener('pointerdown', (event) => {
      startedOutside = outside(event);
    });
    dialog.addEventListener('pointercancel', () => {
      startedOutside = false;
    });
    dialog.addEventListener('click', (event) => {
      if (startedOutside && outside(event)) dialog.close();
      startedOutside = false;
    });
    dialog.addEventListener('close', () => {
      startedOutside = false;
    });
  });
  $('#settings-button').onclick = () => $('#settings-modal').showModal();
  $('#close-settings').onclick = () => $('#settings-modal').close();
  $('#settings-modal').addEventListener('close', () => $('#settings-button').focus());
  $('#close-modal').onclick = closeModal;
  $('#modal').addEventListener('close', () => {
    if ($('#modal').open || !modalOrigin) return;
    const { element, attribute, value } = modalOrigin;
    const replacement = attribute
      ? [...document.querySelectorAll(`[${attribute}]`)].find(
          (node) => node.getAttribute(attribute) === value && node.tagName === element.tagName,
        )
      : null;
    (element.isConnected ? element : replacement || $('#main-content')).focus();
  });
  $('#dismiss-error').onclick = () => {
    $('#error-banner').hidden = true;
  };
  $('.skip-link').onclick = (event) => {
    event.preventDefault();
    $('#main-content').focus();
    $('#main-content').scrollIntoView();
  };
  const system = matchMedia('(prefers-color-scheme: dark)');
  let appearance = 'system';
  try {
    appearance = reportStorage.getItem('brief-appearance') || 'system';
  } catch {
    /* Session appearance still works. */
  }
  if (!['system', 'light', 'dark'].includes(appearance)) appearance = 'system';
  const apply = () => {
    document.documentElement.dataset.theme =
      appearance === 'system' ? (system.matches ? 'dark' : 'light') : appearance;
    $('#appearance').value = appearance;
  };
  $('#appearance').onchange = (event) => {
    appearance = event.target.value;
    apply();
    try {
      Promise.resolve(reportStorage.setItem('brief-appearance', appearance)).catch(() =>
        showError('Appearance changed for this session only.'),
      );
    } catch {
      showError('Appearance changed for this session only.');
    }
  };
  system.addEventListener('change', apply);
  apply();
}
