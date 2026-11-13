import { describe, expect, it, vi } from 'vitest'
import { scrollQuestionEditorToTop } from './questionEditorNavigation'

describe('question editor navigation', () => {
  it('scrolls the editor to the top after a question is created', () => {
    const scrollIntoView = vi.fn()
    const root = {
      querySelector: vi.fn(() => ({ scrollIntoView }))
    } as unknown as ParentNode

    scrollQuestionEditorToTop(root)

    expect(root.querySelector).toHaveBeenCalledWith('.questionaire-pane-create-question-area-view-editor')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', inline: 'nearest' })
  })
})
