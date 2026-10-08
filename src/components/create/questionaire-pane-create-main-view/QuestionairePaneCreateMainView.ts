import { html } from 'lit'
import { consume } from '@lit/context'
import { state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace, sym } from 'rdflib'
import styles from './QuestionairePaneCreateMainView.styles.css'
import { QuestionaireContext, questionaireContext } from '../../../context'
import '../questionaire-pane-create-header/QuestionairePaneCreateHeader'
import '../questionaire-pane-create-content-view/QuestionairePaneCreateContentView'
import '../questionaire-pane-create-starter-view/QuestionairePaneCreateStarterView'
import '../questionaire-pane-create-question-area-view/QuestionairePaneCreateQuestionAreaView'

const quiz = Namespace('http://example.org/ns/quiz#')

@customElement('questionaire-pane-create-main-view')
export default class QuestionairePaneCreateMainView extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @state()
  private accessor showQuestionArea = false

  @state()
  private accessor starterQuestionTypeUri: string | null = null

  @state()
  private accessor questionListStatus: 'loading' | 'empty' | 'populated' = 'loading'

  private questionListRefreshToken = 0
  private questionListKey = ''

  private hasQuestions () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return false
    }

    const draft = sym(`${subject.doc().uri.replace(/index\.ttl$/, '')}draft.ttl`)
    return store.statementsMatching(draft, quiz('question'), undefined, draft.doc()).length > 0
  }

  protected willUpdate () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      this.questionListStatus = 'loading'
      this.showQuestionArea = false
      this.questionListKey = ''
      return
    }

    const nextKey = subject.doc().uri
    if (nextKey !== this.questionListKey) {
      this.questionListKey = nextKey
      void this.refreshQuestionList()
    }
  }

  private async refreshQuestionList () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return
    }

    const refreshToken = ++this.questionListRefreshToken
    this.questionListStatus = 'loading'

    const baseUrl = subject.doc().uri.replace(/index\.ttl$/, '')
    const draft = sym(`${baseUrl}draft.ttl`)
    try {
      await store.fetcher?.load(draft.doc())
    } catch (error) {
      if (refreshToken === this.questionListRefreshToken) {
        this.questionListStatus = 'empty'
      }
      return
    }

    const hasQuestions = this.hasQuestions()
    if (refreshToken !== this.questionListRefreshToken) {
      return
    }

    this.questionListStatus = hasQuestions ? 'populated' : 'empty'
    if (hasQuestions) {
      this.showQuestionArea = true
    }
  }

  private showQuestions (event?: CustomEvent<{ questionTypeUri?: string }>) {
    this.starterQuestionTypeUri = event?.detail.questionTypeUri ?? null
    this.showQuestionArea = true
    this.questionListStatus = 'populated'
  }

  render() {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    const isQuestionArea = this.showQuestionArea || this.questionListStatus === 'populated'
    const showStarter = this.questionListStatus === 'empty' && !isQuestionArea

    return html`
      <div class="questionaire-pane-create-main-view">
        ${store && subject
          ? html`
              <questionaire-pane-create-header></questionaire-pane-create-header>
              <questionaire-pane-create-content-view>
                ${showStarter
                  ? html`
                      <questionaire-pane-create-starter-view
                        @questionaire-question-created=${this.showQuestions}
                      ></questionaire-pane-create-starter-view>
                    `
                  : isQuestionArea
                  ? html`
                      <questionaire-pane-create-question-area-view
                        .selectedQuestionTypeUri=${this.starterQuestionTypeUri}
                      ></questionaire-pane-create-question-area-view>
                    `
                  : html``}
              </questionaire-pane-create-content-view>
            `
          : html``}
      </div>
    `
  }
}
