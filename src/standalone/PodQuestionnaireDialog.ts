import { html, css, nothing } from 'lit'
import { DialogComponent } from 'solid-ui'
import { Namespace, sym } from 'rdflib'
import type { LiveStore, NamedNode } from 'rdflib'
import { entriesFromSubjects, questionnaireClass, type QuestionnaireEntry } from './library'
import 'solid-ui/components/dialog'
import 'solid-ui/components/dialog-content'
import 'solid-ui/components/dialog-header'
import 'solid-ui/components/button'
import '~icons/lucide/folder'
import '~icons/lucide/external-link'
import '~icons/lucide/x'

const ldp = Namespace('http://www.w3.org/ns/ldp#')

class PodQuestionnaireDialog extends DialogComponent<void> {
  static styles = css`
    solid-ui-dialog-content { display: block; min-width: min(620px, 80vw); overflow: visible; }
    solid-ui-dialog-header h1 { font-size: var(--solid-ui-font-size-lg, 1.125rem); }
    .location { color: #6b7280; font-size: var(--solid-ui-font-size-xs, 0.75rem); overflow-wrap: anywhere; }
    .status { color: #6b7280; font-size: var(--solid-ui-font-size-sm, 0.875rem); }
    .error { color: #a33; font-size: var(--solid-ui-font-size-sm, 0.875rem); }
    ul { display: grid; max-height: min(55vh, 480px); gap: 0; overflow-y: auto; padding: 0; list-style: none; }
    solid-ui-button.folder, solid-ui-button.questionnaire { display: flex; width: 100%; color: #1a2235; font-size: var(--solid-ui-font-size-sm, 0.875rem); text-align: left; }
    solid-ui-button.folder { font-weight: 400; }
    .folder icon-lucide-folder { width: 1rem; height: 1rem; color: #a56a00; }
    .questionnaire icon-lucide-external-link { width: 1.25rem; height: 1.25rem; }
    solid-ui-button.close { display: inline-flex; width: 2.5rem; height: 2.5rem; }
    .close icon-lucide-x { display: block; width: 1.5rem; height: 1.5rem; }
  `

  store!: LiveStore

  storageUrl = ''

  onSelect: ((subject: NamedNode) => void) | undefined
  onClose: (() => void) | undefined

  private currentUrl = ''
  private folderChildren: string[] = []
  private questionnaires: QuestionnaireEntry[] = []
  private loading = false
  private error = ''

  protected firstUpdated (): void {
    this.currentUrl = this.storageUrl
    this.requestUpdate()
    void this.loadCurrentFolder()
  }

  private async loadCurrentFolder (): Promise<void> {
    this.loading = true
    this.error = ''
    this.requestUpdate()
    try {
      if (!this.store.fetcher) throw new Error('Unable to browse your Pod: no Solid fetcher is available.')
      const container = sym(this.currentUrl.endsWith('/') ? this.currentUrl : `${this.currentUrl}/`)
      await this.store.fetcher.load(container.doc())
      this.folderChildren = (this.store.each(container, ldp('contains')) as NamedNode[])
        .filter(term => term.termType === 'NamedNode' && term.uri.endsWith('/'))
        .map(term => term.uri)
        .sort()
      const subjects: NamedNode[] = []
      for (const child of this.folderChildren) {
        const subject = sym(`${child}index.ttl#this`)
        try {
          await this.store.fetcher.load(subject.doc())
          if (this.store.holds(subject, sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), questionnaireClass, subject.doc())) {
            subjects.push(subject)
          }
        } catch {
          // Non-questionnaire folders and unavailable resources remain navigable.
        }
      }

      this.questionnaires = entriesFromSubjects(this.store, subjects, new Map())
    } catch (caught) {
      this.error = caught instanceof Error ? caught.message : 'Unable to browse this Pod folder.'
    } finally {
      this.loading = false
      this.requestUpdate()
    }
  }

  private openQuestionnaire (entry: QuestionnaireEntry): void {
    this.onSelect?.(entry.subject)
    this.finish()
  }

  private finish (): void {
    this.close()
    this.onClose?.()
  }

  protected render () {
    const folders = this.folderChildren.filter(child => !this.questionnaires.some(entry => entry.subject.doc().uri === `${child}index.ttl`))
    return html`
      <solid-ui-dialog>
        <solid-ui-dialog-header slot="header">
          <h1>Choose from my Pod</h1>
          <solid-ui-button class="close" variant="ghost" aria-label="Close" @click=${() => this.finish()}>
            <icon-lucide-x slot="icon"></icon-lucide-x>
          </solid-ui-button>
        </solid-ui-dialog-header>
        <solid-ui-dialog-content>
          ${this.loading ? html`<p class="status">Loading this folder...</p>` : nothing}
          ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
          ${!this.loading && !this.error ? html`
            <ul>
              ${folders.map(folder => html`
                <li><solid-ui-button class="folder" variant="secondary" @click=${() => {
                  this.currentUrl = folder
                  this.requestUpdate()
                  void this.loadCurrentFolder()
                }}><icon-lucide-folder slot="icon" aria-hidden="true"></icon-lucide-folder>${decodeURIComponent(new URL(folder).pathname.split('/').filter(Boolean).pop() ?? '')}</solid-ui-button></li>
              `)}
              ${this.questionnaires.map(entry => html`
                <li>
                  <solid-ui-button class="questionnaire" variant="secondary" @click=${() => this.openQuestionnaire(entry)}>
                    ${entry.title}
                    <icon-lucide-external-link slot="right-icon" aria-hidden="true"></icon-lucide-external-link>
                  </solid-ui-button>
                </li>
              `)}
            </ul>
            ${!folders.length && !this.questionnaires.length ? html`<p class="status">No questionnaire folders or files were found here.</p>` : nothing}
          ` : nothing}
        </solid-ui-dialog-content>
      </solid-ui-dialog>
    `
  }
}

customElements.define('questionaire-pod-dialog', PodQuestionnaireDialog)

export default PodQuestionnaireDialog
