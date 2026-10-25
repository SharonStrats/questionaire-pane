import { html } from 'lit'
import { consume } from '@lit/context'
import { state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import styles from './QuestionairePaneTakeQuestionAreaView.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { calculateQuestionnaireScore } from '../../../service/questionaireQuestionScoring'
import { loadQuizAiService } from '../../../service/quizAiService'
import { questionairePredicates } from '../../../service/questionairePredicates'
import { getQuestionnaireFormat } from '../../../service/questionaireQuestionQueries'
import { loadQuestionaireQuestionSummaries, type QuestionaireQuestionSummary } from '../../../service/questionaireQuestionQueries'
import { shareQuestionnaireResults } from '../../../service/shareQuestionnaireResults'
import { readQuestionValue } from '../../../service/questionaireQuestionAccessors'
import { renderFormattedText } from '../../shared/questionaire-pane-formatting'
import { shuffleDifferent } from '../../../service/shuffle'
import '../questionaire-pane-take-question-dispatcher/QuestionairePaneTakeQuestionDispatcher'
import '../questionaire-pane-take-final-screen/QuestionairePaneTakeFinalScreen'

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

  @state()
  private accessor questions: QuestionaireQuestionSummary[] = []

  @state()
  private accessor questionsLoading = false

  @state()
  private accessor hintVisible = false

  @state()
  private accessor semanticAnswerResults: Record<string, boolean> = {}

  @state()
  private accessor shareStatus: 'idle' | 'sharing' | 'shared' | 'error' = 'idle'

  @state()
  private accessor shareError = ''

  private questionsRefreshToken = 0
  private questionsKey = ''

  protected willUpdate () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      this.questions = []
      this.questionsLoading = false
      this.completed = false
      this.questionsKey = ''
      return
    }

    const nextKey = subject.doc().uri
    if (nextKey !== this.questionsKey) {
      this.questionsKey = nextKey
      void this.refreshQuestions()
    }
  }

  private async refreshQuestions () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return
    }

    const refreshToken = ++this.questionsRefreshToken
    this.questionsLoading = true

    const questions = await loadQuestionaireQuestionSummaries(store, subject)
    if (refreshToken !== this.questionsRefreshToken) {
      return
    }

    this.questions = shuffleDifferent(questions)
    this.questionsLoading = false
    const isQuiz = getQuestionnaireFormat(store, subject) === 'quiz'
    if (isQuiz && questions.some((question) => question.typeUri === questionairePredicates.question.questionType.shortAnswer.value)) {
      try {
        const service = await loadQuizAiService()
        await service.ensureSemanticModel()
      } catch (error) {
        console.error('Unable to preload short-answer checking', error)
      }
    }
    if (questions.length === 0) {
      this.activeQuestionIndex = 0
      this.completed = false
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
    const { [event.detail.questionUri]: _cleared, ...remainingResults } = this.semanticAnswerResults
    this.semanticAnswerResults = remainingResults
  }

  private handleAnswerEvaluated (event: CustomEvent<{ questionUri: string, correct: boolean }>) {
    this.semanticAnswerResults = {
      ...this.semanticAnswerResults,
      [event.detail.questionUri]: event.detail.correct
    }
  }

  private goPrevious () {
    this.hintVisible = false
    this.activeQuestionIndex = Math.max(0, this.activeQuestionIndex - 1)
  }

  private goNext (questions: QuestionaireQuestionSummary[]) {
    if (this.activeQuestionIndex >= questions.length - 1) {
      this.completed = true
      return
    }

    this.hintVisible = false
    this.activeQuestionIndex = Math.min(questions.length - 1, this.activeQuestionIndex + 1)
  }

  private hasCurrentAnswer (question: QuestionaireQuestionSummary | null) {
    if (!question) return false
    const answer = this.answersByQuestionUri[question.question.uri]
    return Array.isArray(answer) ? answer.length > 0 : typeof answer === 'string' ? answer.trim().length > 0 : answer !== null
  }

  private restart () {
    this.completed = false
    this.activeQuestionIndex = 0
    this.hintVisible = false
    this.answersByQuestionUri = {}
    this.semanticAnswerResults = {}
    this.shareStatus = 'idle'
    this.shareError = ''
  }

  private async shareResults () {
    const { store, subject, acl } = this.questionaire ?? { store: null, subject: null, acl: null }
    if (!store || !subject || !acl) {
      this.shareStatus = 'error'
      this.shareError = 'Sharing is unavailable because ACL services are not configured.'
      console.error(this.shareError)
      return
    }
    this.shareStatus = 'sharing'
    this.shareError = ''
    try {
      const score = calculateQuestionnaireScore(store, subject, this.answersByQuestionUri, this.semanticAnswerResults)
      await shareQuestionnaireResults(store, acl, subject, {
        earnedPoints: score.earnedPoints,
        availablePoints: score.availablePoints,
        answers: this.answersByQuestionUri,
        questionUris: this.questions.map((question) => question.question.uri)
      })
      this.shareStatus = 'shared'
    } catch (error) {
      this.shareStatus = 'error'
      this.shareError = error instanceof Error ? error.message : String(error)
      console.error('Unable to share questionnaire results', error)
    }
  }

  render() {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject

    if (!store || !subject) {
      return html``
    }

    const questions = this.questions
    const isSurvey = getQuestionnaireFormat(store, subject) === 'survey'
    const activeQuestion = questions[this.activeQuestionIndex] ?? questions[0] ?? null
    const score = calculateQuestionnaireScore(store, subject, this.answersByQuestionUri, this.semanticAnswerResults)

    if (this.questionsLoading && questions.length === 0) {
      return html`
        <section class="questionaire-pane-take-question-area-view">
          <div class="questionaire-pane-take-question-area-view-empty">
            Loading questions...
          </div>
        </section>
      `
    }

    if (this.completed) {
      return html`
        <section class="questionaire-pane-take-question-area-view">
          <div class="questionaire-pane-take-question-area-view-card">
            <questionaire-pane-take-final-screen
              .totalQuestions=${score.totalQuestions}
              .answeredQuestions=${score.answeredQuestions}
              .availablePoints=${score.availablePoints}
              .earnedPoints=${score.earnedPoints}
              .isSurvey=${isSurvey}
              .store=${store}
              .questionSummaries=${questions}
              .questionScores=${score.questionScores}
              .answers=${this.answersByQuestionUri}
              .shareStatus=${this.shareStatus}
              .shareError=${this.shareError}
              @questionaire-take-restart=${() => this.restart()}
              @questionaire-take-share-results=${() => { void this.shareResults() }}
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
    const answerComplete = this.hasCurrentAnswer(activeQuestion)
    const hint = readQuestionValue(store, activeQuestion.question, 'hint')

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
            @questionaire-answer-evaluated=${(event: CustomEvent<{ questionUri: string, correct: boolean }>) => this.handleAnswerEvaluated(event)}
          ></questionaire-pane-take-question-dispatcher>
          ${hint
            ? html`
                <div class="questionaire-pane-take-question-area-view-hint">
                  <button
                    class="questionaire-pane-take-question-area-view-hint-button"
                    type="button"
                    aria-expanded=${String(this.hintVisible)}
                    aria-controls="questionaire-pane-take-question-hint"
                    @click=${() => { this.hintVisible = !this.hintVisible }}
                  >
                    ${this.hintVisible ? 'Hide hint' : 'Show hint'}
                  </button>
                  ${this.hintVisible
                    ? html`
                        <p id="questionaire-pane-take-question-hint">
                          ${renderFormattedText(hint)}
                        </p>
                      `
                    : ''}
                </div>
              `
            : ''}
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
              ?disabled=${isLastQuestion && !answerComplete}
            >
              ${isLastQuestion ? 'Finished' : 'Next'}
            </button>
          </div>
        </div>
      </section>
    `
  }
}
