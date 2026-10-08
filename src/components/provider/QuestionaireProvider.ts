import { provide } from '@lit/context'
import { html, type PropertyValues } from 'lit'
import { property } from 'lit/decorators.js'
import { NamedNode, Store } from 'rdflib'
import { customElement, WebComponent } from 'solid-ui'
import { questionaireContext, type QuestionaireContext } from '../../context'


@customElement('questionaire-provider')
export default class QuestionaireProvider extends WebComponent {
  
  @property({attribute: false})
  accessor store: Store | null = null

  @property({attribute: false})
  accessor subject: NamedNode | null = null

  @provide({ context: questionaireContext })
  private accessor questionaire: QuestionaireContext = { store: null, subject: null }

  protected willUpdate (changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties)
    if (changedProperties.has('store') || changedProperties.has('subject')) {
      console.debug('questionaire-provider updated', {
        hasStore: Boolean(this.store),
        hasSubject: Boolean(this.subject)
      })
      this.questionaire = { store: this.store, subject: this.subject }
    }
  }

  protected render () {
    return html`
        <slot></slot>
    `
  }
}
