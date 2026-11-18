import { html, nothing } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import styles from './TextResponse.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { readQuestionAnswerValuesByPosition, readQuestionGradingCriteria, readQuestionResponseKinds, readQuestionValue, readQuestionValues } from '../../../service/questionAccessors'
import { loadQuizAiService } from '../../../service/quizAiService'
import { getQuestionnaireFormat } from '../../../service/questionQueries'
import { renderFormattedText } from '../../shared/formatting'
import '../../shared/FormattingToolbar'
import '../../shared/FormattedTextEditor'

@customElement('questionaire-pane-take-question-text-response')
export default class QuestionairePaneTakeQuestionTextResponse extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @property({ attribute: false })
  accessor answer: string | string[] | null = null

  @property({ type: Boolean, attribute: 'multiline' })
  accessor multiline = false

  @property({ type: String, attribute: 'question-type-label' })
  accessor questionTypeLabel = 'Answer'

  @property({ type: String, attribute: 'question-type-description' })
  accessor questionTypeDescription = 'Type your response.'

  @state()
  private accessor draftAnswer = ''

  @state()
  private accessor draftBlankAnswers: string[] = []

  @state()
  private accessor loadedQuestionUri: string | null = null

  private getTitle () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'title')
  }

  private async checkLongAnswers () {
    const store = this.questionaire?.store
    const subject = this.questionaire?.subject
    const question = this.question
    if (!question || !store || !subject || !this.isFillInTheBlank() ||
        getQuestionnaireFormat(store, subject) !== 'quiz') {
      return
    }

    const responseKinds = readQuestionResponseKinds(store, question)
    const guidance = readQuestionAnswerValuesByPosition(store, question)
    const longAnswerIndexes = responseKinds
      .map((kind, index) => kind === 'long-text' && this.draftBlankAnswers[index]?.trim() ? index : -1)
      .filter(index => index >= 0)
    if (longAnswerIndexes.length === 0) return

    try {
      const service = await loadQuizAiService()
      const evaluations = await Promise.all(longAnswerIndexes.map(index =>
        service.evaluateShortAnswer(this.draftBlankAnswers[index], guidance[index] ? [guidance[index]] : [], {
          question: this.getTitle(),
          gradingCriteria: readQuestionGradingCriteria(store, question)
        })
      ))
      const evaluation = evaluations.reduce((combined, current) => ({
        correct: combined.correct && current.correct,
        score: combined.score + current.score,
        maxScore: combined.maxScore + current.maxScore,
        feedback: [combined.feedback, current.feedback].filter(Boolean).join(' '),
        confidence: Math.min(combined.confidence, current.confidence),
        needsReview: combined.needsReview || current.needsReview,
        method: 'sidecar' as const
      }), {
        correct: true,
        score: 0,
        maxScore: 0,
        feedback: '',
        confidence: 1,
        needsReview: false,
        method: 'sidecar' as const
      })
      this.dispatchEvent(new CustomEvent('questionaire-answer-evaluated', {
        bubbles: true,
        composed: true,
        detail: { questionUri: question.uri, correct: evaluation.correct, confidence: evaluation.confidence, evaluation }
      }))
    } catch (error) {
      console.error('Unable to evaluate fill-in-the-blank explanation', error)
    }
  }

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    const answerValues = Array.isArray(this.answer)
      ? this.answer
      : this.answer
        ? [this.answer]
        : []
    this.draftAnswer = typeof this.answer === 'string' ? this.answer : ''
    this.draftBlankAnswers = Array.from(
      { length: this.getBlankCount(this.getTitle()) },
      (_, index) => answerValues[index] ?? ''
    )
    this.loadedQuestionUri = question.uri
  }

  private getBlankCount (title: string) {
    return Math.max(1, title.match(/\[_{2,}\]|_{3,}/g)?.length ?? 0)
  }

  private isFillInTheBlank () {
    return this.questionTypeLabel === 'Fill in the Blank'
  }

  private hasFormattedBlankAnswers () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return false
    }

    return readQuestionValues(store, question, 'answer')
      .some((answer) => /\[\[(sub|sup):/.test(answer))
  }

  private syncAnswer (value: string) {
    this.draftAnswer = value
    const question = this.question
    if (!question) {
      return
    }

    this.dispatchEvent(new CustomEvent('questionaire-answer-changed', {
      bubbles: true,
      composed: true,
      detail: { questionUri: question.uri, answer: value }
    }))
  }

  private syncBlankAnswer (index: number, value: string) {
    const answers = this.draftBlankAnswers.slice()
    answers[index] = value
    this.draftBlankAnswers = answers

    const question = this.question
    if (!question) {
      return
    }

    this.dispatchEvent(new CustomEvent('questionaire-answer-changed', {
      bubbles: true,
      composed: true,
      detail: { questionUri: question.uri, answer: answers }
    }))
  }

  private renderFillInTheBlank (text: string) {
    const parts = text.split(/(\[_{2,}\]|_{3,})/)
    let blankIndex = 0
    const formattedAnswers = this.hasFormattedBlankAnswers()
    const responseKinds = this.questionaire?.store && this.question
      ? readQuestionResponseKinds(this.questionaire.store, this.question)
      : []
    const renderText = (value: string) => value.split(/\r?\n/).map((line, index, lines) =>
      html`${line}${index < lines.length - 1 ? html`<br>` : nothing}`
    )

    return parts.map((part) => {
      if (!/^(\[_{2,}\]|_{3,})$/.test(part)) {
        return renderText(part)
      }

      const index = blankIndex++
      if (responseKinds[index] === 'long-text') {
        return html`
          <textarea
            class="questionaire-pane-take-question-text-response-extended-blank"
            aria-label=${`Explanation ${index + 1}`}
            placeholder="Explain your answer..."
            .value=${this.draftBlankAnswers[index] ?? ''}
            @input=${(event: Event) => this.syncBlankAnswer(index, (event.currentTarget as HTMLTextAreaElement).value)}
            @blur=${() => { void this.checkLongAnswers() }}
          ></textarea>
        `
      }
      if (formattedAnswers) {
        return html`
          <span class="questionaire-pane-take-question-text-response-formatted-blank">
            <questionaire-pane-formatted-text-editor
              class="questionaire-pane-take-question-text-response-blank-editor"
              role="textbox"
              aria-label=${`Blank ${index + 1}`}
              .value=${this.draftBlankAnswers[index] ?? ''}
              @questionaire-formatted-text-input=${(event: CustomEvent<{ value: string }>) => this.syncBlankAnswer(index, event.detail.value)}
            ></questionaire-pane-formatted-text-editor>
            <questionaire-pane-formatting-toolbar></questionaire-pane-formatting-toolbar>
          </span>
        `
      }

      return html`
        <input
          class="questionaire-pane-take-question-text-response-blank"
          type="text"
          aria-label=${`Blank ${index + 1}`}
          .value=${this.draftBlankAnswers[index] ?? ''}
          @input=${(event: Event) => this.syncBlankAnswer(index, (event.currentTarget as HTMLInputElement).value)}
        />
      `
    })
  }

  private async checkShortAnswer () {
    const store = this.questionaire?.store
    const subject = this.questionaire?.subject
    if (this.questionTypeLabel !== 'Short Answer' || !this.question || !this.draftAnswer.trim() || !store || !subject ||
        getQuestionnaireFormat(store, subject) !== 'quiz') {
      return
    }

    const expectedAnswers = readQuestionValues(store, this.question, 'answer')
    if (expectedAnswers.length === 0) {
      return
    }

    try {
      const service = await loadQuizAiService()
      const evaluation = await service.evaluateShortAnswer(this.draftAnswer, expectedAnswers, {
        question: this.getTitle(),
        gradingCriteria: readQuestionGradingCriteria(store, this.question)
      })
      this.dispatchEvent(new CustomEvent('questionaire-answer-evaluated', {
        bubbles: true,
        composed: true,
        detail: {
          questionUri: this.question.uri,
          correct: evaluation.correct,
          confidence: evaluation.confidence,
          evaluation
        }
      }))
    } catch (error) {
      console.error('Unable to evaluate short answer', error)
    }
  }

  render() {
    const title = this.getTitle()
    const fillInTheBlank = this.isFillInTheBlank()
    const fillInTheBlankText = title

    return html`
      <section class="questionaire-pane-take-question-text-response${fillInTheBlank ? ' questionaire-pane-take-question-text-response--fill-in-the-blank' : ''}">
        <div class="questionaire-pane-take-question-text-response-type">${this.questionTypeLabel}</div>
        ${fillInTheBlank
          ? html`
              <div class="questionaire-pane-take-question-text-response-question-body">
                ${this.renderFillInTheBlank(fillInTheBlankText || 'Complete the sentence.')}
              </div>
            `
          : html`
            <h2 class="questionaire-pane-take-question-text-response-title">${renderFormattedText(title || 'Untitled question')}</h2>
          `}
        ${!fillInTheBlank && this.multiline
          ? html`
              <textarea
                class="questionaire-pane-take-question-text-response-input questionaire-pane-take-question-text-response-input--textarea"
                placeholder=${this.questionTypeDescription}
                .value=${this.draftAnswer}
                @input=${(event: Event) => this.syncAnswer((event.currentTarget as HTMLTextAreaElement).value)}
                @blur=${() => { void this.checkShortAnswer() }}
              ></textarea>
            `
          : !fillInTheBlank
            ? html`
              <input
                class="questionaire-pane-take-question-text-response-input"
                type="text"
                placeholder=${this.questionTypeDescription}
                .value=${this.draftAnswer}
                @input=${(event: Event) => this.syncAnswer((event.currentTarget as HTMLInputElement).value)}
                @blur=${() => { void this.checkShortAnswer() }}
              />
            `
            : html``}
      </section>
    `
  }
}
