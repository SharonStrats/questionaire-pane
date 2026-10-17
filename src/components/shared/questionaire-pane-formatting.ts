import { html, type TemplateResult } from 'lit'

export type TextFormat = 'subscript' | 'superscript'

const markers: Record<TextFormat, [string, string]> = {
  subscript: ['[[sub:', ']]'],
  superscript: ['[[sup:', ']]']
}

export function applyTextFormat (value: string, start: number, end: number, format: TextFormat) {
  if (start === end) return { value, start, end }
  const [open, close] = markers[format]
  const selected = value.slice(start, end)
  if (value.slice(Math.max(0, start - open.length), start) === open &&
      value.slice(end, end + close.length) === close) {
    return {
      value: value.slice(0, start - open.length) + selected + value.slice(end + close.length),
      start: start - open.length,
      end: end - open.length
    }
  }
  return {
    value: value.slice(0, start) + open + selected + close + value.slice(end),
    start: start + open.length,
    end: end + open.length
  }
}

export function renderFormattedText (value: string): TemplateResult[] {
  const result: TemplateResult[] = []
  const pattern = /\[\[(sub|sup):(.*?)\]\]/gs
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) result.push(html`${value.slice(cursor, index)}`)
    const content = match[2] ?? ''
    result.push(match[1] === 'sub' ? html`<sub>${content}</sub>` : html`<sup>${content}</sup>`)
    cursor = index + match[0].length
  }
  if (cursor < value.length) result.push(html`${value.slice(cursor)}`)
  return result
}
