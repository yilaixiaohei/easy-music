const scrollRegions =
  ".workspace, .sidebar-playlists, .playlist-description, .playlist-dialog, .playlist-picker-list, .queue-list, .lyrics-scroll, .plain-lyrics, .album-display h1";

/** Reveal only the scrollbar next to the pointer, including nested scroll areas. */
export function installAutoScrollbars(): () => void {
  const visible = new Set<HTMLElement>();
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  let dragging: HTMLElement | null = null;

  function reveal(element: HTMLElement): void {
    clearTimeout(timers.get(element));
    timers.delete(element);
    visible.add(element);
    element.classList.add("scrollbar-visible");
  }

  function hideLater(element: HTMLElement): void {
    if (timers.has(element) || element === dragging) return;
    timers.set(
      element,
      setTimeout(() => {
        element.classList.remove("scrollbar-visible");
        visible.delete(element);
        timers.delete(element);
      }, 500),
    );
  }

  function nearEdges(event: PointerEvent): Set<HTMLElement> {
    const near = new Set<HTMLElement>();
    for (const node of event.composedPath()) {
      if (!(node instanceof HTMLElement) || !node.matches(scrollRegions))
        continue;
      const rect = node.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      const vertical =
        node.scrollHeight > node.clientHeight + 1 &&
        rect.right - event.clientX <= 24;
      const horizontal =
        node.scrollWidth > node.clientWidth + 1 &&
        rect.bottom - event.clientY <= 20;
      if (inside && (vertical || horizontal)) near.add(node);
    }
    return near;
  }

  function move(event: PointerEvent): void {
    const near = nearEdges(event);
    for (const element of near) reveal(element);
    for (const element of visible) if (!near.has(element)) hideLater(element);
  }
  function down(event: PointerEvent): void {
    // Keep the thumb visible while dragging, even when the pointer leaves its track.
    const near = nearEdges(event);
    dragging = [...near][0] ?? null;
    if (dragging) reveal(dragging);
  }
  function up(event: PointerEvent): void {
    dragging = null;
    move(event);
  }
  function leave(event: PointerEvent): void {
    if (!event.relatedTarget) for (const element of visible) hideLater(element);
  }
  function blur(): void {
    dragging = null;
    for (const element of visible) hideLater(element);
  }

  document.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerdown", down, { passive: true });
  document.addEventListener("pointerup", up, { passive: true });
  document.addEventListener("pointercancel", blur);
  document.addEventListener("pointerout", leave, { passive: true });
  window.addEventListener("blur", blur);
  return () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerdown", down);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", blur);
    document.removeEventListener("pointerout", leave);
    window.removeEventListener("blur", blur);
    for (const timer of timers.values()) clearTimeout(timer);
    for (const element of visible)
      element.classList.remove("scrollbar-visible");
  };
}
