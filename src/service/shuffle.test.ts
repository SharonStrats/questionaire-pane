import { describe, expect, it, vi } from 'vitest'
import { shuffle, shuffleDifferent } from './shuffle'

describe('shuffle', () => {
  it('returns a new array without changing the input', () => {
    const values = ['one', 'two', 'three']

    const result = shuffle(values)

    expect(result).not.toBe(values)
    expect(result).toHaveLength(values.length)
    expect(result).toEqual(expect.arrayContaining(values))
    expect(values).toEqual(['one', 'two', 'three'])
  })

  it('uses the random order produced by the shuffle algorithm', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)

    expect(shuffle(['one', 'two', 'three'])).toEqual(['two', 'three', 'one'])
  })

  it('does not leave multiple values in their original order', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)

    expect(shuffleDifferent([1, 2])).toEqual([2, 1])
  })
})
