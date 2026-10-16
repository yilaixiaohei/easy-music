// Restore the user's place after dismissing a surface without leaving a keyboard ring.
// The next Tab restores normal visible keyboard focus.
export function restoreFocus(element: HTMLElement | null | undefined) {
  if (!element?.isConnected) return;
  element.setAttribute('data-restored-focus', '');
  const cleanup = () => {
    element.removeAttribute('data-restored-focus');
    element.removeEventListener('blur', cleanup);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', cleanup, true);
  };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Tab') cleanup(); };
  element.addEventListener('blur', cleanup, { once: true });
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', cleanup, true);
  element.focus({ preventScroll: true });
  if (document.activeElement !== element) cleanup();
}
