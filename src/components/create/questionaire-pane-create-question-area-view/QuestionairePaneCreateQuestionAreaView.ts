import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import styles from './QuestionairePaneCreateQuestionAreaView.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { createQuestionaireLogic } from '../../../service/questionaireLogic'
import { loadQuestionaireQuestionSummaries, type QuestionaireQuestionSummary } from '../../../service/questionaireQuestionQueries'
import '../questionaire-pane-create-sidebar/QuestionairePaneCreateSidebar'
import '../question-cards/questionaire-pane-create-question-dispatcher/QuestionairePaneCreateQuestionDispatcher'
import { questionaireCreateQuestionTypes } from '../question-cards/questionaire-pane-create-question-types'

@customElement('questionaire-pane-create-question-area-view')
export default class QuestionairePaneCreateQuestionAreaView extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @state()
  private accessor activeQuestionUri: string | null = null

  @state()
  private accessor activeQuestionTypeUri: string | null = null

  @state()
  private accessor editorDismissed = false

  @state()
  private accessor questions: QuestionaireQuestionSummary[] = []

  @state()
  private accessor questionsLoading = false

  private questionsRefreshToken = 0
  private questionsKey = ''

  @property({ attribute: false })
  accessor selectedQuestionTypeUri: string | null = null

  private getBaseUrl () {
    const questionaire = this.questionaire ?? { subject: null }
    const subject = questionaire.subject
    if (!subject) {
      return null
    }

    return subject.doc().uri.replace(/index\.ttl$/, '')
  }

  protected willUpdate () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      this.questions = []
      this.questionsLoading = false
      this.activeQuestionUri = null
      this.activeQuestionTypeUri = null
      this.editorDismissed = false
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

    let questions: QuestionaireQuestionSummary[] = []
    try {
      questions = await loadQuestionaireQuestionSummaries(store, subject)
    } catch (error) {
      console.error('Unable to load questionnaire questions', error)
      if (refreshToken === this.questionsRefreshToken) {
        this.questionsLoading = false
      }
      return
    }
    if (refreshToken !== this.questionsRefreshToken) {
      return
    }

    this.questions = questions
    this.questionsLoading = false

    if (questions.length === 0) {
      this.activeQuestionUri = null
      this.activeQuestionTypeUri = null
      this.editorDismissed = false
      return
    }

    if (!this.activeQuestionUri || !questions.some((question) => question.question.uri === this.activeQuestionUri)) {
      if (!this.editorDismissed) {
        this.activeQuestionUri = questions[0].question.uri
        this.activeQuestionTypeUri = questions[0].typeUri ?? null
      }
    }

    if (!this.activeQuestionTypeUri) {
      this.activeQuestionTypeUri = this.selectedQuestionTypeUri ?? questions[0].typeUri ?? null
    }
  }

  private async addQuestion (questionTypeUri: string, title: string) {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const baseUrl = this.getBaseUrl()
    if (!store || !baseUrl) {
      return
    }

    const questionaireLogic = createQuestionaireLogic(store)
    const result = await questionaireLogic.addQuestionToQuestionnaire({
      baseUrl,
      title,
      questionTypeUri
    })
    this.activeQuestionUri = result.question.uri
    this.activeQuestionTypeUri = questionTypeUri
    this.editorDismissed = false
    await this.refreshQuestions()
  }

  private handleQuestionUpdated (_event: CustomEvent<{ questionUri: string }>) {
    void this.refreshQuestions()
  }

  private async handleSidebarAddQuestion (event: CustomEvent<{ questionTypeUri?: string }>) {
    const questionTypeUri = event.detail.questionTypeUri ?? questionaireCreateQuestionTypes[0]?.questionTypeUri
    if (!questionTypeUri) {
      return
    }

    await this.addQuestion(questionTypeUri, '')
  }

  private handleSidebarSelection (event: CustomEvent<{ questionUri: string }>) {
    this.activeQuestionUri = event.detail.questionUri
    const selectedQuestion = this.questions.find((question) => question.question.uri === event.detail.questionUri)
    this.activeQuestionTypeUri = selectedQuestion?.typeUri ?? null
    this.editorDismissed = false
  }

  private handleQuestionDeleted (event: CustomEvent<{ questionUri: string }>) {
    const deletedQuestionUri = event.detail.questionUri
    if (this.activeQuestionUri === deletedQuestionUri) {
      this.activeQuestionUri = null
      this.activeQuestionTypeUri = null
      this.editorDismissed = false
    }
    void this.refreshQuestions()
  }

  private handleQuestionSaved (event: CustomEvent<{ questionUri: string }>) {
    this.activeQuestionUri = null
    this.activeQuestionTypeUri = null
    this.editorDismissed = true
    void this.refreshQuestions()
  }

  render() {
    const questions = this.questions
    const activeQuestion = this.editorDismissed
      ? null
      : (questions.find((question) => question.question.uri === this.activeQuestionUri) ?? questions[0] ?? null)

    return html`
      <div class="questionaire-pane-create-question-area-view">
        <questionaire-pane-create-sidebar
          .questions=${questions}
          .selectedQuestionUri=${activeQuestion?.question.uri ?? null}
          @questionaire-question-selected=${this.handleSidebarSelection}
          @questionaire-add-question=${(event: CustomEvent<{ questionTypeUri?: string }>) => { void this.handleSidebarAddQuestion(event) }}
        ></questionaire-pane-create-sidebar>
        <div class="questionaire-pane-create-question-area-view-editor">
          <div class="questionaire-pane-create-question-area-view-editor-card">
            ${this.questionsLoading && questions.length === 0
              ? html`<div class="questionaire-pane-create-question-area-view-loading">Loading questions…</div>`
              : activeQuestion
              ? html`
                  <questionaire-pane-create-question-dispatcher
                    .question=${activeQuestion.question}
                    .questionTypeUri=${this.activeQuestionTypeUri ?? activeQuestion.typeUri ?? null}
                    @questionaire-question-updated=${this.handleQuestionUpdated}
                    @questionaire-question-deleted=${this.handleQuestionDeleted}
                    @questionaire-question-saved=${this.handleQuestionSaved}
                  ></questionaire-pane-create-question-dispatcher>
                `
              : html``}
          </div>
        </div>
      </div>
    `
  }
}
