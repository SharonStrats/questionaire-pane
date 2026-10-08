import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace, sym, type NamedNode } from 'rdflib'
import styles from './QuestionairePaneCreateQuestionAreaView.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { createQuestionaireLogic } from '../../../service/questionaireLogic'
import '../questionaire-pane-create-sidebar/QuestionairePaneCreateSidebar'
import '../question-cards/questionaire-pane-create-question-dispatcher/QuestionairePaneCreateQuestionDispatcher'
import {
  getQuestionaireCreateQuestionTypeByUri,
  questionaireCreateQuestionTypes,
} from '../question-cards/questionaire-pane-create-question-types'
import { ns } from 'solid-ui'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('http://example.org/ns/quiz#')

interface QuestionSummary {
  question: NamedNode
  title: string
  typeLabel: string
  typeUri: string
}

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

  private getQuestions (): QuestionSummary[] {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return []
    }

    const draft = sym(`${this.getBaseUrl() ?? ''}draft.ttl`)
    const draftDoc = draft.doc()
    const questionStatements = store.statementsMatching(draft, quiz('question'), undefined, draftDoc)

    return questionStatements
      .map((statement) => {
      const question = statement.object as NamedNode
      const title = store.any(question, dct('title'), undefined, question.doc())?.value ?? 'Untitled question'
      const typeNode = store.any(question, ns.rdf('type'), undefined, question.doc())
      const typeUri = typeNode?.value ?? ''
      const type = getQuestionaireCreateQuestionTypeByUri(typeUri)

      return {
        question,
        title,
        typeLabel: type?.label ?? 'Question',
        typeUri
      }
      })
      .sort((left, right) => left.question.uri.localeCompare(right.question.uri, undefined, { numeric: true, sensitivity: 'base' }))
  }

  protected willUpdate () {
    const questions = this.getQuestions()
    if (questions.length === 0) {
      this.activeQuestionUri = null
      this.activeQuestionTypeUri = null
      this.editorDismissed = false
      return
    }

    if (!this.activeQuestionUri || !questions.some((question) => question.question.uri === this.activeQuestionUri)) {
      if (this.editorDismissed) {
        return
      }
      this.activeQuestionUri = questions[0].question.uri
    }

    if (!this.activeQuestionTypeUri) {
      this.activeQuestionTypeUri = this.selectedQuestionTypeUri ?? questions[0].typeUri ?? null
    }
  }

  protected updated () {
    if (this.getQuestions().length === 0) {
      this.dispatchEvent(new CustomEvent('questionaire-question-list-empty', {
        bubbles: true,
        composed: true
      }))
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
  }

  private handleQuestionUpdated (_event: CustomEvent<{ questionUri: string }>) {
    this.requestUpdate()
  }

  private async handleSidebarAddQuestion (event: CustomEvent<{ questionTypeUri?: string }>) {
    const questionTypeUri = event.detail.questionTypeUri ?? questionaireCreateQuestionTypes[0]?.questionTypeUri
    if (!questionTypeUri) {
      return
    }

    await this.addQuestion(questionTypeUri, 'Untitled question')
  }

  private handleSidebarSelection (event: CustomEvent<{ questionUri: string }>) {
    this.activeQuestionUri = event.detail.questionUri
    const selectedQuestion = this.getQuestions().find((question) => question.question.uri === event.detail.questionUri)
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
    this.requestUpdate()
  }

  private handleQuestionSaved (event: CustomEvent<{ questionUri: string }>) {
    this.activeQuestionUri = null
    this.activeQuestionTypeUri = null
    this.editorDismissed = true
    this.requestUpdate()
  }

  render() {
    const questions = this.getQuestions()
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
            ${activeQuestion
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
