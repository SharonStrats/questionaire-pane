import { describe, expect, it } from 'vitest'
import { cloneReviewQuestions, moveReviewQuestion, removeReviewQuestion, updateReviewQuestion } from './reviewModel'

const imported = [{
  title: 'What is Solid?',
  type: 'short-answer' as const,
  options: [],
  correctAnswers: ['A web standard'],
  confidence: 0.92
}]

describe('DOCX import review state', () => {
  it('selects a high-confidence question without changing the imported value', () => {
    const review = cloneReviewQuestions(imported)
    review[0].title = 'Edited'
    expect(imported[0].title).toBe('What is Solid?')
    expect(review[0].approved).toBe(true)
  })

  it('leaves low-confidence and ambiguous questions for explicit review', () => {
    const review = cloneReviewQuestions([
      { ...imported[0], confidence: 0.79 },
      { ...imported[0], confidence: 0.96, warnings: ['Verify the answer key.'] }
    ])
    expect(review[0].approved).toBe(false)
    expect(review[1].approved).toBe(true)
    expect(review[1].warnings).toEqual(['Verify the answer key.'])
  })

  it('updates only the selected question and can exclude it', () => {
    const review = cloneReviewQuestions([...imported, { ...imported[0], title: 'Second' }])
    const edited = updateReviewQuestion(review, 0, { title: 'Changed', approved: false })
    expect(edited[0]).toMatchObject({ title: 'Changed', approved: false })
    expect(edited[1].title).toBe('Second')
    expect(edited).not.toBe(review)
  })

  it('accepts only approved questions, leaving cancellation to the caller', () => {
    const review = updateReviewQuestion(cloneReviewQuestions(imported), 0, { approved: false })
    expect(review.filter(question => question.approved)).toEqual([])
    expect(imported).toHaveLength(1)
  })

  it('preserves provenance, confidence, and warnings through review acceptance', () => {
    const review = cloneReviewQuestions([{
      ...imported[0],
      confidence: 0.72,
      provenance: { sourceDocument: 'lesson.pptx', slide: 3, block: 2, mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      warnings: ['Slide contains speaker notes.']
    }])
    expect(review[0]).toMatchObject({
      confidence: 0.72,
      provenance: { sourceDocument: 'lesson.pptx', slide: 3, block: 2 },
      warnings: ['Slide contains speaker notes.'],
      approved: false
    })

  })

  it('keeps the normalized source block isolated in staged review state', () => {
    const sourceBlock = {
      kind: 'paragraph' as const,
      text: 'Source context',
      sourceDocument: 'lesson.docx',
      mediaType: 'text/plain',
      warnings: ['Check extraction']
    }
    const review = cloneReviewQuestions([{ ...imported[0], sourceBlock }])
    review[0].sourceBlock!.warnings.push('Changed in review')
    expect(sourceBlock.warnings).toEqual(['Check extraction'])
    expect(review[0].sourceBlock).toMatchObject({
      kind: sourceBlock.kind,
      text: sourceBlock.text,
      sourceDocument: sourceBlock.sourceDocument,
      mediaType: sourceBlock.mediaType
    })
  })

  it('moves questions without mutating the original order', () => {
    const review = cloneReviewQuestions([
      { ...imported[0], title: 'First' },
      { ...imported[0], title: 'Second' }
    ])
    const moved = moveReviewQuestion(review, 1, -1)
    expect(moved.map(question => question.title)).toEqual(['Second', 'First'])
    expect(review.map(question => question.title)).toEqual(['First', 'Second'])
  })

  it('removes only the selected question without mutating the original list', () => {
    const review = cloneReviewQuestions([
      { ...imported[0], title: 'First' },
      { ...imported[0], title: 'Second' }
    ])
    const remaining = removeReviewQuestion(review, 0)
    expect(remaining.map(question => question.title)).toEqual(['Second'])
    expect(review).toHaveLength(2)
  })
})
