import { html } from 'lit'
import { consume } from '@lit/context'
import { state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import styles from './MainView.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import '../starter-view/StarterView'
import '../area-view/AreaView'

@customElement('questionaire-pane-take-main-view')
export default class QuestionairePaneTakeMainView extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @state()
  private accessor started = false

  private handleStart () {
    this.started = true
  }

  render() {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject

    if (!store || !subject) {
      return html``
    }

    return html`
      <div class="questionaire-pane-take-main-view">
        ${this.started
          ? html`
              <questionaire-pane-take-question-area-view></questionaire-pane-take-question-area-view>
            `
          : html`
              <questionaire-pane-take-starter-view
                @questionaire-question-started=${() => this.handleStart()}
              ></questionaire-pane-take-starter-view>
            `}
      </div>
    `
  }
}
