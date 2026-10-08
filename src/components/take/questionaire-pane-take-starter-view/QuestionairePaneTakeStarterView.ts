import { html } from 'lit'
import { consume } from '@lit/context'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace } from 'rdflib'
import styles from './QuestionairePaneTakeStarterView.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'

const dct = Namespace('http://purl.org/dc/terms/')

@customElement('questionaire-pane-take-starter-view')
export default class QuestionairePaneTakeStarterView extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  private getTitle () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return 'Questionnaire'
    }

    return store.any(subject, dct('title'), undefined, subject.doc())?.value ?? 'Questionnaire'
  }

  private getDescription () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return ''
    }

    return store.any(subject, dct('description'), undefined, subject.doc())?.value ?? ''
  }

  private handleStart () {
    this.dispatchEvent(new CustomEvent('questionaire-question-started', {
      bubbles: true,
      composed: true
    }))
  }

  render() {
    const title = this.getTitle()
    const description = this.getDescription()

    return html`
      <section class="questionaire-pane-take-starter-view">
        <div class="questionaire-pane-take-starter-view-card">
          <p class="questionaire-pane-take-starter-view-kicker">Ready to begin</p>
          <h2>${title}</h2>
          ${description
            ? html`<p class="questionaire-pane-take-starter-view-description">${description}</p>`
            : html``}
          <button class="questionaire-pane-take-starter-view-start" type="button" @click=${() => this.handleStart()}>
            Start questionnaire
          </button>
        </div>
      </section>
    `
  }
}
