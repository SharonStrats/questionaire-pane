import { html } from 'lit'
import { consume } from '@lit/context'
import { customElement, WebComponent } from 'solid-ui'
import { sym } from 'rdflib'
import styles from './QuestionairePaneCreateStarterView.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { createQuestionaireLogic } from '../../../service/questionaireLogic'
import { readQuestionValue } from '../../../service/questionaireQuestionAccessors'
import { questionaireCreateQuestionTypes } from '../question-cards/questionaire-pane-create-question-types'
import '~icons/lucide/square-pen'

@customElement('questionaire-pane-create-starter-view')
export default class QuestionairePaneCreateStarterView extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  private getBaseUrl () {
    const questionaire = this.questionaire ?? { subject: null }
    const subject = questionaire.subject
    if (!subject) {
      return null
    }

    return subject.doc().uri.replace(/index\.ttl$/, '')
  }

  private async createStarterQuestion (questionTypeUri: string, title: string) {
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
    this.dispatchEvent(new CustomEvent('questionaire-question-created', {
      bubbles: true,
      composed: true,
      detail: {
        questionUri: result.question.uri,
        questionTypeUri
      }
    }))
  }

  private async updateIntroduction (value: string) {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const baseUrl = this.getBaseUrl()
    if (!store || !baseUrl) {
      return
    }

    const questionaireLogic = createQuestionaireLogic(store)
    await questionaireLogic.updateQuestionnaireDescription({ baseUrl, description: value })
  }

  render() {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject

    if (!store || !subject) {
      return html``
    }

    const draft = sym(`${this.getBaseUrl() ?? ''}draft.ttl`)
    const currentIntroduction = readQuestionValue(store, draft, 'description')

    return html`
      <section class="questionaire-pane-create-starter-view">
        <div class="questionaire-pane-create-starter-view-card">
          <div class="questionaire-pane-create-starter-view-icon">
            <icon-lucide-square-pen></icon-lucide-square-pen>
          </div>
          <h2>Start with your first question</h2>
          <p>Choose a question type below. You can switch between quiz and survey format at any time without losing your work.</p>
          <textarea
            class="questionaire-pane-create-starter-view-introduction"
            rows="3"
            placeholder="Add an optional introduction or instructions..."
            .value=${currentIntroduction}
            @blur=${async (event: Event) => {
              await this.updateIntroduction((event.currentTarget as HTMLTextAreaElement).value)
            }}
          ></textarea>
        </div>

        <div class="questionaire-pane-create-starter-view-picker">
          <p class="questionaire-pane-create-starter-view-picker-heading">Choose a question type</p>
          <div class="questionaire-pane-create-starter-view-picker-grid">
            ${questionaireCreateQuestionTypes.map((questionType) => html`
              <button
                class="questionaire-pane-create-starter-view-picker-card ${questionType.accentClass}"
                type="button"
                @click=${() => { void this.createStarterQuestion(questionType.questionTypeUri, '') }}
              >
                <span class="questionaire-pane-create-starter-view-picker-card-icon">${questionType.label.slice(0, 2)}</span>
                <span class="questionaire-pane-create-starter-view-picker-card-copy">
                  <span class="questionaire-pane-create-starter-view-picker-card-title">${questionType.label}</span>
                  <span class="questionaire-pane-create-starter-view-picker-card-description">${questionType.description}</span>
                </span>
                <span class="questionaire-pane-create-starter-view-picker-card-plus">+</span>
              </button>
            `)}
          </div>
        </div>
      </section>
    `
  }
}
