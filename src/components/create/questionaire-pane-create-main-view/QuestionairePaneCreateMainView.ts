import { html } from 'lit'
import { consume } from '@lit/context'
import { state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { sym, type NamedNode } from 'rdflib'
import styles from './QuestionairePaneCreateMainView.styles.css'
import { QuestionaireContext, questionaireContext } from '../../../context'
import { questionairePredicates } from '../../../service/questionairePredicates'
import { createQuestionaireMutations } from '../../../service/questionaireQuestionMutations'
import { getQuestionnaireFormat } from '../../../service/questionaireQuestionQueries'
import { loadQuizAiService } from '../../../service/quizAiService'
import '../questionaire-pane-create-header/QuestionairePaneCreateHeader'
import '../questionaire-pane-create-content-view/QuestionairePaneCreateContentView'
import '../questionaire-pane-create-starter-view/QuestionairePaneCreateStarterView'
import '../questionaire-pane-create-question-area-view/QuestionairePaneCreateQuestionAreaView'
import '../../provider/QuestionaireProvider'
import '../../take/questionaire-pane-take-main-view/QuestionairePaneTakeMainView'
import '~icons/lucide/x'
import '~icons/lucide/file-up'

function isNamedNode (term: unknown): term is NamedNode {
  return Boolean(
    term &&
      typeof term === 'object' &&
      'termType' in term &&
      (term as { termType?: string }).termType === 'NamedNode' &&
      typeof (term as { doc?: () => unknown }).doc === 'function'
  )
}

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

  @state()
  private accessor previewSubject: NamedNode | null = null

  @state()
  private accessor previewError = ''

  @state()
  private accessor previewLoading = false

  @state()
  private accessor previewVersions: NamedNode[] = []

  @state()
  private accessor importDialogOpen = false

  @state()
  private accessor importFiles: File[] = []

  @state()
  private accessor importLoading = false

  @state()
  private accessor importPreparing = false

  @state()
  private accessor importError = ''

  @state()
  private accessor importDropActive = false

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
    return store.statementsMatching(draft, questionairePredicates.questionnaire.question, undefined, draft.doc()).length > 0
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

  private async openPreview (selectedVersion?: NamedNode) {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject || this.previewLoading) {
      return
    }

    const versions = store.each(
      subject,
      questionairePredicates.questionnaire.hasVersion,
      undefined,
      subject.doc()
    ).filter(isNamedNode)
    if (selectedVersion) {
      await this.loadPreviewVersion(selectedVersion)
      return
    }

    if (versions.length === 0) {
      this.previewError = 'Publish the questionnaire before opening its live preview.'
      return
    }

    if (versions.length > 1) {
      this.previewVersions = versions
      this.previewError = ''
      return
    }

    await this.loadPreviewVersion(versions[0])
  }

  private async loadPreviewVersion (published: NamedNode) {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    if (!store || this.previewLoading) return

    this.previewLoading = true
    this.previewError = ''
    try {
      await store.fetcher?.load(published.doc())
      this.previewSubject = published
    } catch (error) {
      this.previewError = error instanceof Error
        ? `Unable to load the published preview: ${error.message}`
        : `Unable to load the published preview: ${String(error)}`
      console.error(this.previewError, error)
    } finally {
      this.previewLoading = false
    }
  }

  private closePreviewVersionChooser () {
    this.previewVersions = []
  }

  private closePreview () {
    this.previewSubject = null
    this.previewError = ''
  }

  private async openImportDialog (event?: Event) {
    if (this.importPreparing || this.importLoading) {
      return
    }

    this.importPreparing = true
    this.importError = ''

    try {
      const questionaire = this.questionaire ?? { store: null, subject: null }
      if (questionaire.store && questionaire.subject) {
        await loadQuizAiService()
      }

      const files = (event as CustomEvent<{ files?: File[] }>).detail?.files
      if (files?.length) {
        this.setImportFiles(files)
      }

      this.importDialogOpen = true
    } catch (error) {
      this.importError = error instanceof Error
        ? `Unable to load the DOCX importer: ${error.message}`
        : `Unable to load the DOCX importer: ${String(error)}`
      console.error(this.importError, error)
      this.importDialogOpen = true
    } finally {
      this.importPreparing = false
    }
  }

  private selectImportFiles (event: Event) {
    const input = event.currentTarget as HTMLInputElement
    this.setImportFiles(Array.from(input.files ?? []))
  }

  private setImportFiles (files: File[]) {
    const docxFiles = files.filter(file =>
      file.name.toLowerCase().endsWith('.docx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

    this.importFiles = docxFiles
    this.importError = docxFiles.length || !files.length
      ? ''
      : 'Choose a Word document with a .docx extension.'
  }

  private onImportDragOver (event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.importDropActive = true
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  private onImportDragLeave (event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.importDropActive = false
  }

  private onImportDrop (event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.importDropActive = false
    this.setImportFiles(Array.from(event.dataTransfer?.files ?? []))
  }

  private closeImportDialog () {
    if (this.importLoading) {
      return
    }

    this.importDialogOpen = false
    this.importFiles = []
    this.importError = ''
    this.importDropActive = false
  }

  private async importDocuments () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject || this.importFiles.length === 0 || this.importLoading) {
      return
    }

    this.importLoading = true
    this.importError = ''
    try {
      const baseUrl = subject.doc().uri.replace(/index\.ttl$/, '')
      const format = getQuestionnaireFormat(store, subject)
      const service = await loadQuizAiService()
      const importedQuestions = await service.importDocuments(store, baseUrl, this.importFiles, format)
      if (importedQuestions.length === 0) {
        throw new Error('No question and answer pairs were found. Use “Question:” and “Answer:” lines, or end question lines with a question mark.')
      }

      const mutations = createQuestionaireMutations(store)
      for (const question of importedQuestions) {
        const questionTypeUri = {
          'multiple-choice': questionairePredicates.question.questionType.multipleChoice.value,
          selection: questionairePredicates.question.questionType.selection.value,
          'true-false': questionairePredicates.question.questionType.trueFalse.value,
          'fill-in-the-blank': questionairePredicates.question.questionType.fillInBlank.value,
          'short-answer': questionairePredicates.question.questionType.shortAnswer.value,
          ordering: questionairePredicates.question.questionType.ordering.value,
          match: questionairePredicates.question.questionType.match.value
        }[question.type]
        const isTextAnswer = question.type === 'fill-in-the-blank' || question.type === 'short-answer'
        const isOrdering = question.type === 'ordering'
        const isMatch = question.type === 'match'
        await mutations.addQuestionToQuestionnaire({
          baseUrl,
          title: question.title,
          questionTypeUri,
          options: isTextAnswer || isOrdering || isMatch ? [] : question.options,
          correctOption: question.correctAnswers[0] ?? null,
          correctOptions: question.correctAnswers,
          answers: isTextAnswer ? question.correctAnswers : undefined,
          items: isOrdering ? question.options : undefined,
          leftItems: isMatch ? question.sourceItems : undefined,
          rightItems: isMatch ? question.targetItems : undefined,
          points: 1
        })
      }

      this.importDialogOpen = false
      this.importFiles = []
      this.showQuestionArea = true
      this.questionListStatus = 'populated'
      await this.refreshQuestionList()
    } catch (error) {
      this.importError = error instanceof Error
        ? `Unable to create quiz from DOCX files: ${error.message}`
        : `Unable to create quiz from DOCX files: ${String(error)}`
      console.error(this.importError, error)
    } finally {
      this.importLoading = false
    }
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
              <questionaire-pane-create-header
                @questionaire-preview-requested=${(event: CustomEvent<{ published?: NamedNode }>) => { void this.openPreview(event.detail?.published) }}
                @questionaire-document-import-requested=${(event: Event) => { void this.openImportDialog(event) }}
              ></questionaire-pane-create-header>
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
        ${this.previewVersions.length > 1
          ? html`
              <div class="questionaire-pane-preview-overlay" role="dialog" aria-modal="true" aria-label="Choose published questionnaire version">
                <div class="questionaire-pane-preview-overlay-toolbar">
                  <div>
                    <p class="questionaire-pane-preview-overlay-kicker">Published versions</p>
                    <p class="questionaire-pane-preview-overlay-description">Choose the version to open in live preview.</p>
                  </div>
                  <button class="questionaire-pane-preview-overlay-close" type="button" aria-label="Close version chooser" @click=${() => this.closePreviewVersionChooser()}>
                    <icon-lucide-x></icon-lucide-x>
                  </button>
                </div>
                <div class="questionaire-pane-preview-overlay-message">
                  <div class="questionaire-pane-preview-version-list">
                    ${this.previewVersions.map((version, index) => html`
                      <button type="button" @click=${() => { this.previewVersions = []; void this.loadPreviewVersion(version) }}>
                        Published version ${index + 1}
                        <small>${version.doc().uri}</small>
                      </button>
                    `)}
                  </div>
                </div>
              </div>
            `
          : this.previewSubject || this.previewError || this.previewLoading
          ? html`
              <div class="questionaire-pane-preview-overlay" role="dialog" aria-modal="true" aria-label="Live questionnaire preview">
                <div class="questionaire-pane-preview-overlay-toolbar">
                  <div>
                    <p class="questionaire-pane-preview-overlay-kicker">Live preview</p>
                    <p class="questionaire-pane-preview-overlay-description">
                      This is the published version. Responses are not saved from preview.
                    </p>
                  </div>
                  <button
                    class="questionaire-pane-preview-overlay-close"
                    type="button"
                    aria-label="Close live preview"
                    @click=${() => this.closePreview()}
                  >
                    <icon-lucide-x></icon-lucide-x>
                  </button>
                </div>
                ${this.previewLoading
                  ? html`<div class="questionaire-pane-preview-overlay-message">Loading published questionnaire...</div>`
                  : this.previewError
                  ? html`<div class="questionaire-pane-preview-overlay-message" role="alert">${this.previewError}</div>`
                  : html`
                      <questionaire-provider .store=${store} .subject=${this.previewSubject}>
                        <questionaire-pane-take-main-view></questionaire-pane-take-main-view>
                      </questionaire-provider>
                    `}
              </div>
            `
          : html``}
        ${this.importDialogOpen
          ? html`
              <div class="questionaire-pane-import-overlay" role="dialog" aria-modal="true" aria-label="Create quiz from DOCX">
                <section class="questionaire-pane-import-dialog">
                  <div class="questionaire-pane-import-dialog-header">
                    <div>
                      <p class="questionaire-pane-import-dialog-kicker">Create from DOCX</p>
                      <h2>Turn your notes into questions</h2>
                      <p>Select one or more Word documents. They will be saved with this questionnaire and converted into editable questions.</p>
                    </div>
                    <button
                      class="questionaire-pane-import-dialog-close"
                      type="button"
                      aria-label="Close DOCX importer"
                      ?disabled=${this.importLoading}
                      @click=${() => this.closeImportDialog()}
                    >
                      <icon-lucide-x></icon-lucide-x>
                    </button>
                  </div>
                  <label
                    class="questionaire-pane-import-picker ${this.importDropActive ? 'questionaire-pane-import-picker--active' : ''}"
                    @dragover=${this.onImportDragOver}
                    @dragleave=${this.onImportDragLeave}
                    @drop=${this.onImportDrop}
                  >
                    <icon-lucide-file-up aria-hidden="true"></icon-lucide-file-up>
                    <span>Drop Word documents here or choose files</span>
                    <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple @change=${(event: Event) => this.selectImportFiles(event)} />
                  </label>
                  ${this.importFiles.length > 0
                    ? html`
                        <ul class="questionaire-pane-import-file-list">
                          ${this.importFiles.map((file) => html`<li>${file.name}</li>`)}
                        </ul>
                      `
                    : html`<p class="questionaire-pane-import-empty">No documents selected yet.</p>`}
                  ${this.importError ? html`<p class="questionaire-pane-import-error" role="alert">${this.importError}</p>` : html``}
                  <div class="questionaire-pane-import-dialog-actions">
                    <button type="button" ?disabled=${this.importLoading} @click=${() => this.closeImportDialog()}>Cancel</button>
                    <button
                      class="questionaire-pane-import-dialog-primary"
                      type="button"
                      ?disabled=${this.importLoading || this.importFiles.length === 0}
                      @click=${() => { void this.importDocuments() }}
                    >
                      ${this.importLoading ? 'Creating quiz…' : 'Create editable quiz'}
                    </button>
                  </div>
                </section>
              </div>
            `
          : html``}
        ${this.importPreparing
          ? html`
              <div class="questionaire-pane-import-overlay" role="status" aria-live="polite">
                <div class="questionaire-pane-import-loading">
                  <span class="questionaire-pane-import-spinner" aria-hidden="true"></span>
                  <p>Preparing the DOCX importer...</p>
                </div>
              </div>
            `
          : html``}
        ${this.importLoading
          ? html`
              <div class="questionaire-pane-import-overlay" role="status" aria-live="polite">
                <div class="questionaire-pane-import-loading">
                  <span class="questionaire-pane-import-spinner" aria-hidden="true"></span>
                  <p>Creating your editable quiz...</p>
                </div>
              </div>
            `
          : html``}
      </div>
    `
  }
}
