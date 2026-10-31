// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { isDraftButtonClick } from './questionairePaneDraftEvents'

describe('question card draft button handling', () => {
  it('recognises clicks on content inside an answer button', () => {
    const button = document.createElement('button')
    const label = document.createElement('span')
    button.append(label)
    document.body.append(button)

    const event = new MouseEvent('click', { bubbles: true, composed: true })
    label.dispatchEvent(event)
    expect(isDraftButtonClick(event)).toBe(true)
    button.remove()
  })

  it('ignores footer and header buttons', () => {
    const footer = document.createElement('questionaire-pane-create-question-footer')
    const button = document.createElement('button')
    footer.append(button)
    document.body.append(footer)

    const event = new MouseEvent('click', { bubbles: true, composed: true })
    button.dispatchEvent(event)

    expect(isDraftButtonClick(event)).toBe(false)
    footer.remove()
  })
})
