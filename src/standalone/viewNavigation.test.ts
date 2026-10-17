// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { replaceViewWithRestorableContent } from './viewNavigation'

describe('restorable standalone views', () => {
  it('restores the exact previous view when the replacement is cancelled', () => {
    const app = document.createElement('main')
    const previous = document.createElement('section')
    previous.dataset.view = 'shared'
    previous.textContent = 'loaded questionnaire library'
    app.appendChild(previous)
    document.body.appendChild(app)

    const replacement = document.createElement('section')
    replacement.textContent = 'Pod folders'
    const fallback = vi.fn()
    const cancel = replaceViewWithRestorableContent(app, replacement, fallback)

    cancel()

    expect(app.firstElementChild).toBe(previous)
    expect(app.textContent).toBe('loaded questionnaire library')
    expect(fallback).not.toHaveBeenCalled()
  })

  it('does not reload or lose state when cancelled more than once', () => {
    const app = document.createElement('main')
    const previous = document.createElement('section')
    const input = document.createElement('input')
    input.value = 'in-progress answer'
    previous.appendChild(input)
    app.appendChild(previous)

    const cancel = replaceViewWithRestorableContent(app, document.createElement('div'), vi.fn())
    cancel()
    cancel()

    expect(app.querySelector('input')?.value).toBe('in-progress answer')
  })

  it('uses the fallback safely when opened without a previous view', () => {
    const app = document.createElement('main')
    const fallback = vi.fn()
    const cancel = replaceViewWithRestorableContent(app, document.createElement('div'), fallback)

    cancel()

    expect(fallback).toHaveBeenCalledOnce()
  })
})
