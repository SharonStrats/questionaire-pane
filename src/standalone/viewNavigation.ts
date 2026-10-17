export function replaceViewWithRestorableContent (
  container: HTMLElement,
  replacement: Node,
  fallback: () => void
): () => void {
  const previous = document.createDocumentFragment()
  while (container.firstChild) previous.appendChild(container.firstChild)
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  let restored = false

  container.replaceChildren(replacement)

  return () => {
    if (restored) return
    restored = true
    if (!previous.hasChildNodes()) {
      fallback()
      return
    }
    container.replaceChildren(previous)
    window.scrollTo(scrollX, scrollY)
  }
}
