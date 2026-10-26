export function isPauseShortcut(event) {
  return (
    (event.code === "Space" || event.key === " ") &&
    !event.repeat &&
    !event.isComposing &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.target?.closest?.(
      "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
    )
  );
}
