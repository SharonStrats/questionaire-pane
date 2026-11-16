import { css, html } from 'lit'
import { DialogComponent } from 'solid-ui'
import 'solid-ui/components/dialog'
import 'solid-ui/components/dialog-content'
import 'solid-ui/components/dialog-header'
import 'solid-ui/components/button'
import '~icons/lucide/x'

class StudyCardConfirmDialog extends DialogComponent<void> {
  static styles = css`
    solid-ui-dialog-content { display: block; min-width: min(390px, 80vw); }
    solid-ui-dialog-header h1 { font-size: 1rem; }
    p { margin: 0; color: #475467; font-size: .85rem; line-height: 1.45; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
    .actions solid-ui-button { --solid-ui-button-font-size: .75rem; }
    label { display: grid; gap: 6px; margin-bottom: 10px; color: #344054; font-size: .75rem; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; padding: 9px 10px; border: 1px solid #c8cedb; border-radius: 8px; color: #344054; font: inherit; }
    solid-ui-button.close { display: inline-flex; width: 2rem; height: 2rem; }
  `

  initialTitle = ''
  onConfirm: ((title: string) => void) | undefined
  onClose: (() => void) | undefined

  private finish (confirm: boolean): void {
    const title = this.renderRoot.querySelector<HTMLInputElement>('input')?.value.trim() ?? ''
    if (confirm && title) this.onConfirm?.(title)
    this.close()
    this.onClose?.()
  }

  protected render () {
    return html`
      <solid-ui-dialog>
        <solid-ui-dialog-header slot="header">
          <h1>Save accepted study cards?</h1>
          <solid-ui-button class="close" variant="ghost" aria-label="Close" @click=${() => this.finish(false)}>
            <icon-lucide-x slot="icon"></icon-lucide-x>
          </solid-ui-button>
        </solid-ui-dialog-header>
        <solid-ui-dialog-content>
          <label>Deck name
            <input value=${this.initialTitle} placeholder="Study cards" @keydown=${(event: KeyboardEvent) => {
              if (event.key === 'Enter') this.finish(true)
            }}>
          </label>
          <p>This will create a new study deck in your Pod.</p>
          <div class="actions">
            <solid-ui-button variant="secondary" @click=${() => this.finish(false)}>Cancel</solid-ui-button>
            <solid-ui-button variant="primary" @click=${() => this.finish(true)}>Save cards</solid-ui-button>
          </div>
        </solid-ui-dialog-content>
      </solid-ui-dialog>
    `
  }
}

customElements.define('questionaire-study-card-confirm-dialog', StudyCardConfirmDialog)

export default StudyCardConfirmDialog
