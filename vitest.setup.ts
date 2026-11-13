// happy-dom's adoptedStyleSheets implementation is not compatible with Lit's
// CSSStyleSheet instances. Force Lit to use regular style elements in tests.
if (typeof ShadowRoot !== "undefined") {
  delete (ShadowRoot.prototype as { adoptedStyleSheets?: unknown }).adoptedStyleSheets
}
