import { describe, expect, it } from 'vitest'
import { navigateHomeSection } from './homeNavigation'

describe('questionnaire home navigation', () => {
  it('switches between personal and shared questionnaire sections', () => {
    expect(navigateHomeSection('mine', 'shared')).toBe('shared')
    expect(navigateHomeSection('shared', 'mine')).toBe('mine')
  })

  it('keeps the selected section when it is selected again', () => {
    expect(navigateHomeSection('shared', 'shared')).toBe('shared')
  })
})
