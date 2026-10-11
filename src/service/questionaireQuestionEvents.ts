export type QuestionaireQuestionEventName =
  | 'questionaire-question-updated'
  | 'questionaire-question-saved'
  | 'questionaire-question-deleted'

export function dispatchQuestionaireQuestionEvent (
  target: EventTarget,
  type: QuestionaireQuestionEventName,
  questionUri: string
) {
  target.dispatchEvent(new CustomEvent(type, {
    bubbles: true,
    composed: true,
    detail: { questionUri }
  }))
}
