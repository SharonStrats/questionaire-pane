import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { type NamedNode } from 'rdflib'
import { WebComponent } from 'solid-ui'
import { questionaireContext, type QuestionaireContext } from '../../../../context'
import { createQuestionaireLogic } from '../../../../service/questionaireLogic'
import { dispatchQuestionaireQuestionEvent } from '../../../../service/questionaireQuestionEvents'

export default abstract class QuestionairePaneCreateQuestionCardBase extends WebComponent {
  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @state()
  protected accessor draftDirty = false

  connectedCallback () {
    super.connectedCallback()
    this.addEventListener('input', this.onDraftInput)
    this.addEventListener('click', this.onDraftClick)
    this.addEventListener('questionaire-question-footer-cancel', this.onDraftCancel)
  }

  disconnectedCallback () {
    this.removeEventListener('input', this.onDraftInput)
    this.removeEventListener('click', this.onDraftClick)
    this.removeEventListener('questionaire-question-footer-cancel', this.onDraftCancel)
    super.disconnectedCallback()
  }

  private onDraftInput = () => {
    this.draftDirty = true
  }

  private onDraftClick = (event: Event) => {
    const target = event.target
    if (!(target instanceof HTMLButtonElement) ||
        target.disabled ||
        target.closest('questionaire-pane-create-question-footer, questionaire-pane-create-question-header')) {
      return
    }
    this.draftDirty = true
  }

  private onDraftCancel = () => {
    this.resetDraft()
  }

  protected resetDraft () {
    this.draftDirty = false
  }

  protected updated (changedProperties: Map<PropertyKey, unknown>) {
    if (changedProperties.has('question')) {
      this.draftDirty = false
    }
  }

  protected getStore () {
    return this.questionaire?.store ?? null
  }

  protected getQuestionLogic () {
    const store = this.getStore()
    if (!store) {
      return null
    }

    return createQuestionaireLogic(store)
  }

  protected getBaseUrl () {
    const questionaire = this.questionaire ?? { subject: null }
    const subject = questionaire.subject
    if (!subject) {
      return null
    }

    return subject.doc().uri.replace(/index\.ttl$/, '')
  }

  protected getQuestionNumber () {
    const question = this.question
    if (!question) {
      return 1
    }

    const match = question.uri.match(/q(\d+)\.ttl$/)
    return match ? Number(match[1]) : 1
  }

  protected emitQuestionChanged () {
    const question = this.question
    if (!question) {
      return
    }

    dispatchQuestionaireQuestionEvent(this, 'questionaire-question-updated', question.uri)
  }

  protected emitQuestionSaved () {
    const question = this.question
    if (!question) {
      return
    }

    dispatchQuestionaireQuestionEvent(this, 'questionaire-question-saved', question.uri)
    this.draftDirty = false
  }

  protected emitQuestionDeleted () {
    const question = this.question
    if (!question) {
      return
    }

    dispatchQuestionaireQuestionEvent(this, 'questionaire-question-deleted', question.uri)
  }

  protected async deleteQuestion () {
    const question = this.question
    const logic = this.getQuestionLogic()
    const baseUrl = this.getBaseUrl()
    if (!question || !logic || !baseUrl) {
      return
    }

    await logic.deleteQuestionFromQuestionnaire({
      baseUrl,
      question
    })

    this.emitQuestionDeleted()
  }
}
