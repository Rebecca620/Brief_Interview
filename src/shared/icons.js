// Original web SVGs. Apple design references inform sizing and hierarchy;
// these are not exported SF Symbols or an Apple font dependency.
const paths = {
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',

  plus: '<path d="M12 5v14M5 12h14"/>',
  forward: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M6 10H4v11h16V10h-2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  edit: '<path d="m5 15-1 5 5-1L20 8l-4-4L5 15Zm8-8 4 4"/>',
  sliders: '<path d="M4 6h7m4 0h5M4 12h2m4 0h10M4 18h10m4 0h2M11 3v6M6 9v6m8 0v6"/>',
};
export function icon(name) {
  if (!Object.hasOwn(paths, name)) return '';
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}
export function initIcons() {
  document.querySelectorAll('[data-icon]').forEach((element) => {
    element.innerHTML = icon(element.dataset.icon);
  });
}
