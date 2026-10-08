import { binaryPayload } from '../../platform/desktop.js';
/** Platform handoff payloads contain report content, never a browser-local report URL. */
export function emailDraftURL(title, text) {
  const subject = String(title)
    .replace(/[\r\n]+/g, ' ')
    .toWellFormed();
  const body = String(text)
    .replace(/\r\n|\r|\n/g, '\r\n')
    .toWellFormed();
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function canNativeShare(data, platform = navigator) {
  if (typeof window !== 'undefined' && window.briefHost && platform === navigator) return true;
  if (typeof platform.share !== 'function') return false;
  try {
    if (typeof platform.canShare === 'function') return platform.canShare(data);
    return !data.files;
  } catch {
    return false;
  }
}

/** Called directly from a click, retaining the browser's required user activation. */
export async function shareWithApps(data, platform = navigator) {
  if (typeof window !== 'undefined' && window.briefHost && platform === navigator) {
    try {
      const files = await Promise.all(
        (data.files || []).map((file) => binaryPayload(file.name, file.type, file)),
      );
      const bounds = document.activeElement?.getBoundingClientRect();
      const result = await window.briefHost.send('share', {
        anchor: bounds ? { x: bounds.x + bounds.width / 2, y: bounds.bottom } : undefined,
        title: data.title || '',
        text: data.text || '',
        files,
      });
      return result.status;
    } catch {
      return 'failed';
    }
  }
  if (!canNativeShare(data, platform)) return 'unsupported';
  try {
    await platform.share(data);
    return 'handed-off';
  } catch (error) {
    return error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
