import { html } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import { property, state } from 'lit/decorators.js'
import { customElement, DialogComponent } from 'solid-ui'
import type { LiveStore, NamedNode } from 'rdflib'
import { choosePokemonCompanion, deferPokemonChoice, type PokemonProgress } from '../../../service/pokemonProgress'
import { pokemonSpriteUrl } from '../../../data/pokemonLevels'
import styles from './PokemonLevelUpDialog.styles.css'
import 'solid-ui/components/dialog'
import 'solid-ui/components/dialog-content'
import 'solid-ui/components/dialog-header'
import 'solid-ui/components/button'

@customElement('questionaire-pokemon-level-up-dialog')
export default class PokemonLevelUpDialog extends DialogComponent<PokemonProgress> {
  static styles = styles

  @property({ attribute: false })
  accessor store!: LiveStore

  @property({ attribute: false })
  accessor user!: NamedNode

  @property({ attribute: false })
  accessor progress!: PokemonProgress

  @state()
  private accessor saving = false

  @state()
  private accessor error = ''

  onProgress?: (progress: PokemonProgress) => void
  onDone?: (progress: PokemonProgress) => void
  private finished = false

  disconnectedCallback (): void {
    super.disconnectedCallback()
    if (!this.saving) this.finish()
  }

  protected async firstUpdated (): Promise<void> {
    const dialog = this.renderRoot.querySelector('solid-ui-dialog') as HTMLElement & { updateComplete: Promise<unknown> }
    await dialog?.updateComplete
    const native = dialog?.shadowRoot?.querySelector('dialog')
    native?.addEventListener('cancel', event => {
      event.preventDefault()
      if (!this.saving) this.finish()
    })
    native?.addEventListener('close', () => {
      if (!this.saving) this.finish()
    })
  }

  private finish (): void {
    if (this.finished || this.saving) return
    this.finished = true
    this.close(this.progress)
    this.onDone?.(this.progress)
    this.remove()
  }

  private get nextChoice () {
    return this.progress?.pendingChoices.find(choice => !this.progress.deferredChoiceLevels.includes(choice.level))
  }

  private async choose (pokedexId: number): Promise<void> {
    const pending = this.nextChoice
    if (this.saving || !pending) return
    this.saving = true
    this.error = ''
    try {
      this.progress = await choosePokemonCompanion(this.store, this.user, pending.level, pokedexId)
      this.dispatchEvent(new CustomEvent('pokemon-progress-changed', {
        detail: this.progress, bubbles: true, composed: true
      }))
      this.onProgress?.(this.progress)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Your companion could not be saved. Please try again.'
    } finally {
      this.saving = false
    }
    if (!this.isConnected || (!this.error && !this.nextChoice)) this.finish()
  }

  private async deferChoice (): Promise<void> {
    const pending = this.nextChoice
    if (this.saving || !pending) return
    this.saving = true
    this.error = ''
    let deferred = false
    try {
      this.progress = await deferPokemonChoice(this.store, this.user, pending.level)
      this.dispatchEvent(new CustomEvent('pokemon-progress-changed', {
        detail: this.progress, bubbles: true, composed: true
      }))
      this.onProgress?.(this.progress)
      deferred = true
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Your choice could not be deferred. Please try again.'
    } finally {
      this.saving = false
    }
    if (deferred && !this.nextChoice) this.finish()
  }

  protected render () {
    const pending = this.nextChoice
    if (!pending) return html``
    return html`
      <solid-ui-dialog>
        <solid-ui-dialog-header slot="header">
          <h1>Level ${pending.level} unlocked!</h1>
        </solid-ui-dialog-header>
        <solid-ui-dialog-content>
          ${keyed(pending.level, html`<div class="celebration" aria-hidden="true">
            ${[0, 1, 2, 3].map(burst => html`
              <div class="firework" style=${`--burst: ${burst}`}>
                ${Array.from({ length: 12 }, (_, particle) => html`
                  <span style=${`--angle: ${particle * 30}deg; --color: ${['#7858e8', '#f5ae32', '#ed628f', '#22a6a1'][particle % 4]}`}></span>
                `)}
              </div>`)}
            `)}
          </div>
          <p role="status">You earned ${this.progress.totalPoints} points. Choose your new Pokémon companion!</p>
          <div class="choices" aria-label="Eligible Pokémon" aria-busy=${this.saving}>
            ${pending.options.map(option => html`
              <solid-ui-button variant="secondary" ?disabled=${this.saving}
                aria-label=${`Choose ${option.pokemon}`}
                @click=${() => void this.choose(option.pokedexId)}>
                <img src=${pokemonSpriteUrl(option.pokedexId)} alt="" width="96" height="96">
                <span>${option.pokemon}</span>
              </solid-ui-button>
            `)}
          </div>
          ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : ''}
          <p class="hint">Your choice is saved to your Pod and appears on Home.</p>
          <div class="actions">
            ${this.saving ? html`<span role="status">Saving companion…</span>` : ''}
            <solid-ui-button variant="ghost" ?disabled=${this.saving} @click=${() => void this.deferChoice()}>Choose later</solid-ui-button>
          </div>
        </solid-ui-dialog-content>
      </solid-ui-dialog>
    `
  }
}

const activeDialogs = new Map<string, {
  dialog: PokemonLevelUpDialog
  result: Promise<PokemonProgress>
  callbacks: Set<(progress: PokemonProgress) => void>
}>()

/** Resume pending choices after a quiz/study award or a fresh Pod progress load. */
export function showPokemonLevelUp (
  store: LiveStore,
  user: NamedNode,
  progress: PokemonProgress,
  onProgress?: (progress: PokemonProgress) => void
): Promise<PokemonProgress> {
  if (!progress.pendingChoices.some(choice => !progress.deferredChoiceLevels.includes(choice.level))) return Promise.resolve(progress)
  const active = activeDialogs.get(user.uri)
  if (active) {
    if (progress.totalPoints > active.dialog.progress.totalPoints) active.dialog.progress = progress
    if (onProgress) active.callbacks.add(onProgress)
    return active.result
  }
  const dialog = document.createElement('questionaire-pokemon-level-up-dialog') as PokemonLevelUpDialog
  const callbacks = new Set<(progress: PokemonProgress) => void>()
  if (onProgress) callbacks.add(onProgress)
  const result = new Promise<PokemonProgress>(resolve => {
    dialog.store = store
    dialog.user = user
    dialog.progress = progress
    dialog.onProgress = updated => callbacks.forEach(callback => callback(updated))
    dialog.onDone = resolve
    document.body.append(dialog)
  })
  activeDialogs.set(user.uri, { dialog, result, callbacks })
  void result.finally(() => activeDialogs.delete(user.uri))
  return result
}
