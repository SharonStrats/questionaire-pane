import { html } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import 'solid-ui/components/button'
import 'solid-ui/components/menu'
import 'solid-ui/components/menu-item'
import styles from './QuestionairePaneCreateSidebar.styles.css'
import {
  questionaireCreateQuestionTypes,
  getQuestionaireCreateQuestionTypeByUri,
  type QuestionaireCreateQuestionTypeDefinition
} from '../question-cards/questionaire-pane-create-question-types'

export interface QuestionaireSidebarQuestionSummary {
  question: NamedNode
  title: string
  typeUri: string
}

@customElement('questionaire-pane-create-sidebar')
export default class QuestionairePaneCreateSidebar extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor questions: QuestionaireSidebarQuestionSummary[] = []

  @property({ type: String, attribute: 'selected-question-uri' })
  accessor selectedQuestionUri: string | null = null

  private selectQuestion (questionUri: string) {
    this.dispatchEvent(new CustomEvent('questionaire-question-selected', {
      bubbles: true,
      composed: true,
      detail: { questionUri }
    }))
  }

  private addQuestion (questionTypeUri: string) {
    this.dispatchEvent(new CustomEvent('questionaire-add-question', {
      bubbles: true,
      composed: true,
      detail: { questionTypeUri }
    }))
  }

  private renderTypeBadge (typeDefinition: QuestionaireCreateQuestionTypeDefinition | undefined) {
    return html`
      <span class="questionaire-pane-create-sidebar-question-type-badge ${typeDefinition?.accentClass ?? ''}">
        ${typeDefinition?.label ?? 'Question'}
      </span>
    `
  }

  render() {
    return html`
      <aside class="questionaire-pane-create-sidebar">
        <div class="questionaire-pane-create-sidebar-heading">Question cards</div>
        <div class="questionaire-pane-create-sidebar-list">
          ${this.questions.map((question, index) => {
            const typeDefinition = getQuestionaireCreateQuestionTypeByUri(question.typeUri)
            const isSelected = question.question.uri === this.selectedQuestionUri

            return html`
              <button
                class="questionaire-pane-create-sidebar-question ${isSelected ? 'questionaire-pane-create-sidebar-question--selected' : ''}"
                type="button"
                @click=${() => this.selectQuestion(question.question.uri)}
              >
                <span class="questionaire-pane-create-sidebar-question-number">${index + 1}</span>
                <span class="questionaire-pane-create-sidebar-question-copy">
                  <span class="questionaire-pane-create-sidebar-question-title">${question.title}</span>
                  ${this.renderTypeBadge(typeDefinition)}
                </span>
              </button>
            `
          })}
        </div>
        <solid-ui-menu class="questionaire-pane-create-sidebar-menu" placement="top-start" distance="8">
          <solid-ui-button slot="trigger" class="questionaire-pane-create-sidebar-add" variant="primary">
            <span>+</span>
            <span>Add question</span>
          </solid-ui-button>
          ${questionaireCreateQuestionTypes.map((questionType) => html`
            <solid-ui-menu-item @solid-ui-select=${() => this.addQuestion(questionType.questionTypeUri)}>
              <span class="questionaire-pane-create-sidebar-menu-item-title">${questionType.label}</span>
              <span class="questionaire-pane-create-sidebar-menu-item-description">${questionType.description}</span>
            </solid-ui-menu-item>
          `)}
        </solid-ui-menu>
      </aside>
    `
  }
}
