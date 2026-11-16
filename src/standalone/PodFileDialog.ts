import { css, html, nothing } from 'lit'
import { DialogComponent } from 'solid-ui'
import { Namespace, sym } from 'rdflib'
import type { LiveStore, NamedNode } from 'rdflib'
import 'solid-ui/components/dialog'
import 'solid-ui/components/dialog-content'
import 'solid-ui/components/dialog-header'
import 'solid-ui/components/button'
import '~icons/lucide/file'
import '~icons/lucide/folder'
import '~icons/lucide/x'

const ldp = Namespace('http://www.w3.org/ns/ldp#')

class PodFileDialog extends DialogComponent<void> {
  static styles = css`
    solid-ui-dialog-content { display: block; min-width: min(620px, 80vw); overflow: visible; }
    solid-ui-dialog-header h1 { font-size: var(--solid-ui-font-size-lg, 1.125rem); }
    .status { color: #6b7280; font-size: var(--solid-ui-font-size-xs, 0.75rem); }
    .error { color: #a33; font-size: var(--solid-ui-font-size-xs, 0.75rem); }
    ul { max-height: min(55vh, 480px); margin: 12px 0 0; overflow-y: auto; padding: 0; border-top: 1px solid #e5e7eb; list-style: none; }
    li { display: block; border-bottom: 1px solid #e5e7eb; }
    solid-ui-button.item {
      --solid-ui-button-font-weight: 400;
      --solid-ui-font-size-md: var(--solid-ui-font-size-xs, 0.75rem);
      --solid-ui-button-border-color: transparent;
      --solid-ui-button-justify-content: flex-start;
      --solid-ui-button-text-align: left;
      display: flex;
      width: 100%;
      color: #1a2235;
      font-size: var(--solid-ui-font-size-xs, 0.75rem);
      text-align: left;
    }
    .item icon-lucide-folder, .item icon-lucide-file {
      width: 1rem;
      height: 1rem;
      color: var(--solid-ui-color-gray-500, #6a7282);
    }
    solid-ui-button.close { display: inline-flex; width: 2.5rem; height: 2.5rem; }
    .close icon-lucide-x { display: block; width: 1.5rem; height: 1.5rem; }
  `

  store!: LiveStore
  storageUrl = ''
  onSelect: ((uri: string) => void) | undefined
  onClose: (() => void) | undefined

  private currentUrl = ''
  private folderChildren: NamedNode[] = []
  private loading = false
  private error = ''

  protected firstUpdated (): void {
    this.currentUrl = this.storageUrl.endsWith('/') ? this.storageUrl : `${this.storageUrl}/`
    void this.loadCurrentFolder()
  }

  private async loadCurrentFolder (): Promise<void> {
    this.loading = true
    this.error = ''
    this.requestUpdate()
    try {
      if (!this.store.fetcher) throw new Error('Unable to browse your Pod: no Solid fetcher is available.')
      const container = sym(this.currentUrl)
      await this.store.fetcher.load(container.doc())
      this.folderChildren = (this.store.each(container, ldp('contains')) as NamedNode[])
        .filter(term => term.termType === 'NamedNode')
        .sort((left, right) => left.uri.localeCompare(right.uri))
    } catch (caught) {
      this.error = caught instanceof Error ? caught.message : 'Unable to browse this Pod folder.'
    } finally {
      this.loading = false
      this.requestUpdate()
    }
  }

  private finish (): void {
    this.close()
    this.onClose?.()
  }

  protected render () {
    return html`
      <solid-ui-dialog>
        <solid-ui-dialog-header slot="header">
          <h1>Open from my Pod</h1>
          <solid-ui-button class="close" variant="ghost" aria-label="Close" @click=${() => this.finish()}>
            <icon-lucide-x slot="icon"></icon-lucide-x>
          </solid-ui-button>
        </solid-ui-dialog-header>
        <solid-ui-dialog-content>
          ${this.loading ? html`<p class="status">Loading files...</p>` : nothing}
          ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
          ${!this.loading && !this.error ? html`
            <ul>
              ${this.folderChildren.map(child => {
                const folder = child.uri.endsWith('/')
                const label = decodeURIComponent(new URL(child.uri).pathname.split('/').filter(Boolean).pop() ?? child.uri)
                return html`
                  <li>
                    <solid-ui-button class="item" variant="secondary" @click=${() => {
                      if (folder) {
                        this.currentUrl = child.uri
                        void this.loadCurrentFolder()
                      } else {
                        this.onSelect?.(child.uri)
                        this.finish()
                      }
                    }}>
                      ${folder
                        ? html`<icon-lucide-folder slot="icon" aria-hidden="true"></icon-lucide-folder>`
                        : html`<icon-lucide-file slot="icon" aria-hidden="true"></icon-lucide-file>`}
                      ${label}
                    </solid-ui-button>
                  </li>
                `
              })}
            </ul>
            ${!this.folderChildren.length ? html`<p class="status">This folder is empty.</p>` : nothing}
          ` : nothing}
        </solid-ui-dialog-content>
      </solid-ui-dialog>
    `
  }
}

customElements.define('questionaire-pod-file-dialog', PodFileDialog)

export default PodFileDialog
