import { html } from 'lit'
import { consume } from '@lit/context'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { getQuestionaireCreateQuestionTypeByUri } from '../../create/question-cards/questionaire-pane-create-question-types'
import { readQuestionTypeUri, readQuestionValue } from '../../../service/questionaireQuestionAccessors'
import '../questionaire-pane-take-question-multiple-choice/QuestionairePaneTakeQuestionMultipleChoice'
import '../questionaire-pane-take-question-text-response/QuestionairePaneTakeQuestionTextResponse'
import '../questionaire-pane-take-question-ordering/QuestionairePaneTakeQuestionOrdering'
import '../questionaire-pane-take-question-match/QuestionairePaneTakeQuestionMatch'
import '../questionaire-pane-take-question-rating/QuestionairePaneTakeQuestionRating'
import '../questionaire-pane-take-question-true-false/QuestionairePaneTakeQuestionTrueFalse'

@customElement('questionaire-pane-take-question-dispatcher')
export default class QuestionairePaneTakeQuestionDispatcher extends WebComponent {
  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @property({ attribute: false })
  accessor questionTypeUri: string | null = null

  @property({ attribute: false })
  accessor answer: string | string[] | null = null

  render() {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const question = this.question

    if (!store || !question) {
      return html``
    }

    const title = readQuestionValue(store, question, 'title') || 'Untitled question'
    const hint = readQuestionValue(store, question, 'hint')
    const points = readQuestionValue(store, question, 'points') || '1'
    const typeUri = this.questionTypeUri ?? readQuestionTypeUri(store, question)
    const typeDefinition = getQuestionaireCreateQuestionTypeByUri(typeUri)

    if (typeDefinition?.key === 'multiple-choice' || typeDefinition?.key === 'selection') {
      return html`
        <questionaire-pane-take-question-multiple-choice
          .question=${question}
          .answer=${this.answer}
          .questionTypeLabel=${typeDefinition.label}
          .questionTypeDescription=${typeDefinition.description}
          .allowMultipleSelections=${typeDefinition.key === 'selection'}
        ></questionaire-pane-take-question-multiple-choice>
      `
    }

    if (typeDefinition?.key === 'true-false') {
      return html`
        <questionaire-pane-take-question-true-false
          .question=${question}
          .answer=${this.answer}
        ></questionaire-pane-take-question-true-false>
      `
    }

    if (typeDefinition?.key === 'short-answer') {
      return html`
        <questionaire-pane-take-question-text-response
          .question=${question}
          .answer=${typeof this.answer === 'string' ? this.answer : ''}
          .multiline=${true}
          .questionTypeLabel=${'Short Answer'}
          .questionTypeDescription=${'Type your response.'}
        ></questionaire-pane-take-question-text-response>
      `
    }

    if (typeDefinition?.key === 'fill-in-the-blank') {
      return html`
        <questionaire-pane-take-question-text-response
          .question=${question}
          .answer=${typeof this.answer === 'string' ? this.answer : ''}
          .multiline=${false}
          .questionTypeLabel=${'Fill in the Blank'}
          .questionTypeDescription=${'Type the missing word or phrase.'}
        ></questionaire-pane-take-question-text-response>
      `
    }

    if (typeDefinition?.key === 'ordering') {
      return html`
        <questionaire-pane-take-question-ordering
          .question=${question}
          .answer=${Array.isArray(this.answer) ? this.answer : null}
        ></questionaire-pane-take-question-ordering>
      `
    }

    if (typeDefinition?.key === 'match') {
      return html`
        <questionaire-pane-take-question-match
          .question=${question}
          .answer=${Array.isArray(this.answer) ? this.answer : null}
        ></questionaire-pane-take-question-match>
      `
    }

    if (typeDefinition?.key === 'confidence') {
      return html`
        <questionaire-pane-take-question-rating
          .question=${question}
          .answer=${typeof this.answer === 'string' ? this.answer : ''}
        ></questionaire-pane-take-question-rating>
      `
    }

    return html`
      <section class="questionaire-pane-take-question-dispatcher">
        <h2>${title}</h2>
        ${hint ? html`<p>${hint}</p>` : html``}
        <p>Question type ${typeDefinition?.label ?? 'Question'} is not yet implemented for taking.</p>
        <p>Points: ${points}</p>
      </section>
    `
  }
}
