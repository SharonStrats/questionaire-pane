import { consume } from '@lit/context'
import { html } from 'lit'
import { property } from 'lit/decorators.js'
import { type NamedNode } from 'rdflib'
import { customElement, WebComponent } from 'solid-ui'
import { questionaireContext, type QuestionaireContext } from '../../../../context'
import { uploadQuestionImage } from '../../../../service/questionaireImageUpload'
import { createQuestionaireLogic } from '../../../../service/questionaireLogic'
import styles from './QuestionairePaneCreateQuestionImageUpload.styles.css'

@customElement('questionaire-pane-create-question-image-upload')
export default class QuestionairePaneCreateQuestionImageUpload extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @property({ type: String })
  accessor image = ''

  private async saveImageFile (file: File) {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question || !file.type.startsWith('image/')) {
      return
    }

    try {
      const image = await uploadQuestionImage(store, question, file)
      await createQuestionaireLogic(store).updateQuestionImage({ question, image })
      this.dispatchEvent(new CustomEvent('questionaire-question-image-changed', {
        bubbles: true,
        composed: true,
        detail: { image }
      }))
    } catch (error) {
      console.error('Unable to upload questionnaire image', error)
      this.dispatchEvent(new CustomEvent('questionaire-question-image-error', {
        bubbles: true,
        composed: true,
        detail: { error }
      }))
    }
  }

  private handleFileChange (event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0]
    if (file) {
      void this.saveImageFile(file)
    }
  }

  render () {
    return html`
      <div class="questionaire-pane-create-question-image-upload">
        <label>Image <span>(optional)</span></label>
        <label
          class="questionaire-pane-create-question-image-upload-control"
          @dragover=${(event: DragEvent) => { event.preventDefault() }}
          @drop=${(event: DragEvent) => {
            event.preventDefault()
            const file = event.dataTransfer?.files?.[0]
            if (file) void this.saveImageFile(file)
          }}
        >
          <input type="file" accept="image/*" @change=${this.handleFileChange} />
          <span>Drop an image here or choose a file</span>
        </label>
        ${this.image
          ? html`<img class="questionaire-pane-question-image-preview" src=${this.image} alt="Question preview" />`
          : html``}
      </div>
    `
  }
}
