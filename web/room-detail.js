// Room detail page (placeholder until W5).
export function mount(container, { id }) {
  container.textContent = `Room ${id}`;
  return () => container.replaceChildren();
}
