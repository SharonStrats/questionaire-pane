import { describe, expect, it } from 'vitest'
import { applyTextFormat } from './questionaire-pane-formatting'

describe('questionaire text formatting', () => {
  it('wraps the selected text with the explicit subscript representation', () => {
    expect(applyTextFormat('H2O', 1, 2, 'subscript')).toEqual({
      value: 'H[[sub:2]]O',
      start: 7,
      end: 8
    })
  })

  it('wraps superscript selections and toggles the same selection off', () => {
    const formatted = applyTextFormat('x2', 1, 2, 'superscript')
    expect(formatted.value).toBe('x[[sup:2]]')
    expect(applyTextFormat(formatted.value, formatted.start, formatted.end, 'superscript')).toEqual({
      value: 'x2',
      start: 1,
      end: 2
    })
  })

  it('does not change the value when there is no selection', () => {
    expect(applyTextFormat('plain', 2, 2, 'subscript')).toEqual({
      value: 'plain',
      start: 2,
      end: 2
    })
  })
})
