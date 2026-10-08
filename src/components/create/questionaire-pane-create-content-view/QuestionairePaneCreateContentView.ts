import { html } from 'lit'
import { customElement, WebComponent } from 'solid-ui'
import styles from './QuestionairePaneCreateContentView.styles.css'

@customElement('questionaire-pane-create-content-view')
export default class QuestionairePaneCreateContentView extends WebComponent {
  static styles = styles

  render() {
    return html`<slot></slot>`
  }
}
