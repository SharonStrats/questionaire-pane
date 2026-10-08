import { html } from 'lit'
import { consume } from '@lit/context'
import { state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace, type NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeQuestionAreaView.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { calculateQuestionnaireScore } from '../../../service/questionaireLogic'
import '../questionaire-pane-take-question-dispatcher/QuestionairePaneTakeQuestionDispatcher'
import '../questionaire-pane-take-final-screen/QuestionairePaneTakeFinalScreen'
import { ns } from 'solid-ui'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('http://example.org/ns/quiz#')

interface QuestionSummary {
  question: NamedNode
  title: string
  typeUri: string
}

type AnswerValue = string | string[] | null

@customElement('questionaire-pane-take-question-area-view')
export default class QuestionairePaneTakeQuestionAreaView extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @state()
  private accessor activeQuestionIndex = 0

  @state()
  private accessor answersByQuestionUri: Record<string, AnswerValue> = {}

  @state()
  private accessor completed = false

  private getQuestions (): QuestionSummary[] {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return []
    }

    const sourceDoc = subject.doc()
    const questionStatements = store.statementsMatching(subject, quiz('question'), undefined, sourceDoc)

    return questionStatements
      .map((statement) => {
        const question = statement.object as NamedNode
        const title = store.any(question, dct('title'), undefined, question.doc())?.value ?? 'Untitled question'
        const typeNode = store.any(question, ns.rdf('type'), undefined, question.doc())
        return {
          question,
          title,
          typeUri: typeNode?.value ?? ''
        }
      })
      .sort((left, right) => left.question.uri.localeCompare(right.question.uri, undefined, { numeric: true, sensitivity: 'base' }))
  }

  protected willUpdate () {
    const questions = this.getQuestions()
    if (questions.length === 0) {
      this.activeQuestionIndex = 0
      return
    }

    if (this.activeQuestionIndex < 0 || this.activeQuestionIndex >= questions.length) {
      this.activeQuestionIndex = 0
    }
  }

  private handleAnswerChanged (event: CustomEvent<{ questionUri: string, answer: AnswerValue }>) {
    this.answersByQuestionUri = {
      ...this.answersByQuestionUri,
      [event.detail.questionUri]: event.detail.answer
    }
  }

  private goPrevious () {
    this.activeQuestionIndex = Math.max(0, this.activeQuestionIndex - 1)
  }

  private goNext (questions: QuestionSummary[]) {
    if (this.activeQuestionIndex >= questions.length - 1) {
      this.completed = true
      return
    }

    this.activeQuestionIndex = Math.min(questions.length - 1, this.activeQuestionIndex + 1)
  }

  private restart () {
    this.completed = false
    this.activeQuestionIndex = 0
  }

  render() {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject

    if (!store || !subject) {
      return html``
    }

    const questions = this.getQuestions()
    const activeQuestion = questions[this.activeQuestionIndex] ?? questions[0] ?? null
    const score = calculateQuestionnaireScore(store, subject, this.answersByQuestionUri)

    if (this.completed) {
      return html`
        <section class="questionaire-pane-take-question-area-view">
          <div class="questionaire-pane-take-question-area-view-card">
            <questionaire-pane-take-final-screen
              .totalQuestions=${score.totalQuestions}
              .answeredQuestions=${score.answeredQuestions}
              .availablePoints=${score.availablePoints}
              .earnedPoints=${score.earnedPoints}
              @questionaire-take-restart=${() => this.restart()}
            ></questionaire-pane-take-final-screen>
          </div>
        </section>
      `
    }

    if (!activeQuestion) {
      return html`
        <section class="questionaire-pane-take-question-area-view">
          <div class="questionaire-pane-take-question-area-view-empty">
            No questions are available yet.
          </div>
        </section>
      `
    }

    const currentAnswer = this.answersByQuestionUri[activeQuestion.question.uri] ?? null
    const isFirstQuestion = this.activeQuestionIndex <= 0
    const isLastQuestion = this.activeQuestionIndex >= questions.length - 1

    return html`
      <section class="questionaire-pane-take-question-area-view">
        <div class="questionaire-pane-take-question-area-view-card">
          <div class="questionaire-pane-take-question-area-view-progress">
            Question ${this.activeQuestionIndex + 1} of ${questions.length}
          </div>
          <questionaire-pane-take-question-dispatcher
            .question=${activeQuestion.question}
            .answer=${currentAnswer}
            .questionTypeUri=${activeQuestion.typeUri}
            @questionaire-answer-changed=${(event: CustomEvent<{ questionUri: string, answer: AnswerValue }>) => this.handleAnswerChanged(event)}
          ></questionaire-pane-take-question-dispatcher>
          <div class="questionaire-pane-take-question-area-view-navigation">
            <button
              class="questionaire-pane-take-question-area-view-nav-button"
              type="button"
              ?disabled=${isFirstQuestion}
              @click=${() => this.goPrevious()}
            >
              Previous
            </button>
            <button
              class="questionaire-pane-take-question-area-view-nav-button questionaire-pane-take-question-area-view-nav-button--primary"
              type="button"
              @click=${() => this.goNext(questions)}
              ?disabled=${isLastQuestion}
            >
              ${isLastQuestion ? 'Finished' : 'Next'}
            </button>
          </div>
        </div>
      </section>
    `
  }
}
