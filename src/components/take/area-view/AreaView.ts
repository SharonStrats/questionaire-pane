import { html } from 'lit'
import { consume } from '@lit/context'
import { state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import type { NamedNode } from 'rdflib'
import { authn } from 'solid-logic'
import styles from './AreaView.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { calculateQuestionnaireScore } from '../../../service/questionScoring'
import type { ShortAnswerEvaluation } from '../../../service/quizAiService'
import { loadQuizAiService } from '../../../service/quizAiService'
import { questionairePredicates } from '../../../service/predicates'
import { getQuestionnaireFormat } from '../../../service/questionQueries'
import { loadQuestionaireQuestionSummaries, type QuestionaireQuestionSummary } from '../../../service/questionQueries'
import {
  persistQuestionnaireResults,
  sharePersistedQuestionnaireResults
} from '../../../service/shareQuestionnaireResults'
import { readQuestionValue } from '../../../service/questionAccessors'
import { renderFormattedText } from '../../shared/formatting'
import { shuffleDifferent } from '../../../service/shuffle'
import { showPokemonLevelUp } from '../../standalone/pokemon-level-up/PokemonLevelUpDialog'
import '../dispatcher/Dispatcher'
import '../final-screen/FinalScreen'

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
  private accessor answerEvaluations: Record<string, ShortAnswerEvaluation> = {}

  @state()
  private accessor shareStatus: 'idle' | 'saving' | 'saved' | 'sharing' | 'shared' | 'error' = 'idle'

  @state()
  private accessor shareError = ''

  private savedResultContainer?: NamedNode
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
      this.activeQuestionIndex = 0
      this.answersByQuestionUri = {}
      this.semanticAnswerResults = {}
      this.answerEvaluations = {}
      this.completed = false
      this.shareStatus = 'idle'
      this.shareError = ''
      this.savedResultContainer = undefined
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
    const { [event.detail.questionUri]: _clearedEvaluation, ...remainingEvaluations } = this.answerEvaluations
    this.answerEvaluations = remainingEvaluations
  }

  private handleAnswerEvaluated (event: CustomEvent<{ questionUri: string, correct: boolean, evaluation: ShortAnswerEvaluation }>) {
    this.answerEvaluations = {
      ...this.answerEvaluations,
      [event.detail.questionUri]: event.detail.evaluation
    }
    if (event.detail.evaluation.method !== 'sidecar') {
      this.semanticAnswerResults = {
        ...this.semanticAnswerResults,
        [event.detail.questionUri]: event.detail.correct
      }
    }
  }

  private goPrevious () {
    this.hintVisible = false
    this.activeQuestionIndex = Math.max(0, this.activeQuestionIndex - 1)
  }

  private goNext (questions: QuestionaireQuestionSummary[]) {
    if (this.completed) return
    if (this.activeQuestionIndex >= questions.length - 1) {
      this.completed = true
      void this.saveResults(false)
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

  private async saveResults (shareWithCreator: boolean) {
    const { store, subject, acl } = this.questionaire ?? { store: null, subject: null, acl: null }
    if (!store || !subject || (shareWithCreator && !acl)) {
      this.shareStatus = 'error'
      this.shareError = shareWithCreator
        ? 'Sharing is unavailable because ACL services are not configured.'
        : 'Saving is unavailable because the questionnaire store is not configured.'
      console.error(this.shareError)
      return
    }
    this.shareStatus = shareWithCreator ? 'sharing' : 'saving'
    this.shareError = ''
    try {
      if (shareWithCreator && acl && this.savedResultContainer) {
        await sharePersistedQuestionnaireResults(store, acl, subject, this.savedResultContainer)
        this.shareStatus = 'shared'
        return
      }

      const score = calculateQuestionnaireScore(store, subject, this.answersByQuestionUri, this.semanticAnswerResults, this.answerEvaluations)
      const saved = await persistQuestionnaireResults(store, acl, subject, {
        earnedPoints: score.earnedPoints,
        availablePoints: score.availablePoints,
        answers: this.answersByQuestionUri,
        questionUris: this.questions.map((question) => question.question.uri),
        shareWithCreator
      })
      this.savedResultContainer = saved.resultContainer
      this.shareStatus = shareWithCreator ? 'shared' : 'saved'
      if (saved.pokemonProgress) {
        this.dispatchEvent(new CustomEvent('pokemon-progress-changed', {
          detail: saved.pokemonProgress, bubbles: true, composed: true
        }))
        const user = authn.currentUser()
        if (user) {
          void showPokemonLevelUp(store, user, saved.pokemonProgress).catch(error => {
            console.error('Unable to show Pokemon level-up choices', error)
          })
        }
      }
      if (saved.pokemonProgressError) {
        this.shareError = `Your quiz result was saved, but Pokemon progress is unavailable right now: ${saved.pokemonProgressError}`
      }
    } catch (error) {
      this.shareStatus = 'error'
      this.shareError = error instanceof Error ? error.message : String(error)
      console.error(
        shareWithCreator ? 'Unable to share questionnaire results' : 'Unable to save questionnaire results',
        error
      )
    }

  }

  private cancelTaking () {
    this.dispatchEvent(new CustomEvent('questionaire-take-cancel', { bubbles: true, composed: true }))
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
    const score = calculateQuestionnaireScore(store, subject, this.answersByQuestionUri, this.semanticAnswerResults, this.answerEvaluations)

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
              .resultStatus=${this.shareStatus}
              .resultsSaved=${Boolean(this.savedResultContainer)}
              @questionaire-take-save-results=${() => { void this.saveResults(false) }}
              @questionaire-take-share-results=${() => { void this.saveResults(true) }}
              @questionaire-take-cancel=${() => this.cancelTaking()}
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
            @questionaire-answer-evaluated=${(event: CustomEvent<{ questionUri: string, correct: boolean, evaluation: ShortAnswerEvaluation }>) => this.handleAnswerEvaluated(event)}
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
