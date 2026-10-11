import { html } from 'lit'
import { consume } from '@lit/context'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import { questionaireContext, type QuestionaireContext } from '../../../../context'
import {
  getQuestionaireCreateQuestionTypeByUri
} from '../questionaire-pane-create-question-types'
import { readQuestionTypeUri, readQuestionValue } from '../../../../service/questionaireQuestionAccessors'
import '../questionaire-pane-create-question-base/QuestionairePaneCreateQuestionBase'
import '../questionaire-pane-create-question-multiple-choice/QuestionairePaneCreateQuestionMultipleChoice'
import '../questionaire-pane-create-question-short-answer/QuestionairePaneCreateQuestionShortAnswer'
import '../questionaire-pane-create-question-fill-in-the-blank/QuestionairePaneCreateQuestionFillInTheBlank'
import '../questionaire-pane-create-question-ordering/QuestionairePaneCreateQuestionOrdering'
import '../questionaire-pane-create-question-confidence/QuestionairePaneCreateQuestionConfidence'
import '../questionaire-pane-create-question-true-false/QuestionairePaneCreateQuestionTrueFalse'
import '../questionaire-pane-create-question-match/QuestionairePaneCreateQuestionMatch'

@customElement('questionaire-pane-create-question-dispatcher')
export default class QuestionairePaneCreateQuestionDispatcher extends WebComponent {
  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @property({ attribute: false })
  accessor questionTypeUri: string | null = null

  render() {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const question = this.question

    if (!store || !question) {
      return html``
    }

    const title = readQuestionValue(store, question, 'title')
    const description = readQuestionValue(store, question, 'description')
    const points = readQuestionValue(store, question, 'points') || '1'
    const typeUri = this.questionTypeUri ?? readQuestionTypeUri(store, question)
    const typeDefinition = getQuestionaireCreateQuestionTypeByUri(typeUri)

    if (typeDefinition?.key === 'multiple-choice') {
      return html`
        <questionaire-pane-create-question-multiple-choice
          .question=${question}
        ></questionaire-pane-create-question-multiple-choice>
      `
    }

    if (typeDefinition?.key === 'selection') {
      return html`
        <questionaire-pane-create-question-multiple-choice
          .question=${question}
          .questionTypeLabel=${typeDefinition.label}
          .questionTypeDescription=${'Select one or more answers from the list.'}
          .questionTypeIcon=${'SE'}
          .allowMultipleCorrectAnswers=${true}
        ></questionaire-pane-create-question-multiple-choice>
      `
    }

    if (typeDefinition?.key === 'short-answer') {
      return html`
        <questionaire-pane-create-question-short-answer
          .question=${question}
        ></questionaire-pane-create-question-short-answer>
      `
    }

    if (typeDefinition?.key === 'fill-in-the-blank') {
      return html`
        <questionaire-pane-create-question-fill-in-the-blank
          .question=${question}
        ></questionaire-pane-create-question-fill-in-the-blank>
      `
    }

    if (typeDefinition?.key === 'ordering') {
      return html`
        <questionaire-pane-create-question-ordering
          .question=${question}
        ></questionaire-pane-create-question-ordering>
      `
    }

    if (typeDefinition?.key === 'true-false') {
      return html`
        <questionaire-pane-create-question-true-false
          .question=${question}
        ></questionaire-pane-create-question-true-false>
      `
    }

    if (typeDefinition?.key === 'match') {
      return html`
        <questionaire-pane-create-question-match
          .question=${question}
        ></questionaire-pane-create-question-match>
      `
    }

    if (typeDefinition?.key === 'confidence') {
      return html`
        <questionaire-pane-create-question-confidence
          .question=${question}
        ></questionaire-pane-create-question-confidence>
      `
    }

    return html`
      <questionaire-pane-create-question-base
        .questionTypeLabel=${typeDefinition?.label ?? 'Question'}
        .title=${title}
        .description=${description}
        .points=${points}
      >
        <p class="questionaire-pane-create-question-dispatcher-copy">
          Question-specific controls will appear here once this type is implemented.
        </p>
      </questionaire-pane-create-question-base>
    `
  }
}
