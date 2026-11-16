import { customElement, DialogComponent } from 'solid-ui'
import { html } from 'lit'
import { property, state } from 'lit/decorators.js'
import { authn, solidLogicSingleton, type DirectoryEntry } from 'solid-logic'
import { sym, type LiveStore } from 'rdflib'
import {
  sendQuestionnaireShareNotification,
  sendStudyDeckShareNotification
} from '../../../standalone/library'
import styles from './QuestionnaireShareDialog.styles.css'
import 'solid-ui/components/button'
import 'solid-ui/components/dialog'
import 'solid-ui/components/dialog-content'
import 'solid-ui/components/dialog-footer'
import 'solid-ui/components/dialog-header'

@customElement('questionaire-questionnaire-share-dialog')
export default class QuestionnaireShareDialog extends DialogComponent<void> {
  static styles = styles

  @property({ attribute: false })
  accessor subjectUri = ''

  @property({ attribute: false })
  accessor resourceType: 'questionnaire' | 'study-deck' = 'questionnaire'

  @property({ attribute: false })
  accessor store!: LiveStore

  @state()
  private accessor recipient = ''

  @state()
  private accessor accessRole: 'Viewer' | 'Editor' = 'Viewer'

  @state()
  private accessor saving = false

  @state()
  private accessor error = ''

  @state()
  private accessor people: DirectoryEntry[] = []

  @state()
  private accessor peopleLoading = false

  private peopleLoaded = false

  private async loadPeople (): Promise<void> {
    if (this.peopleLoaded || this.peopleLoading) return
    const user = authn.currentUser()
    if (!user) return

    this.peopleLoading = true
    try {
      const entries = await solidLogicSingleton.directory.search({
        user,
        sources: ['contacts', 'friends'],
        maxFoafDistance: 1
      })
      this.people = entries.filter(entry => entry.kind === 'person')
      this.peopleLoaded = true
    } catch (caught) {
      this.error = caught instanceof Error ? caught.message : 'Unable to load your contacts and friends.'
    } finally {
      this.peopleLoading = false
    }
  }

  private selectPerson (person: DirectoryEntry): void {
    this.recipient = person.uri
  }

  private async share (): Promise<void> {
    const recipient = this.recipient.trim()
    if (!/^https?:\/\//i.test(recipient)) {
      this.error = 'Enter the recipient’s WebID URL.'
      return
    }

    this.saving = true
    this.error = ''
    try {
      const target = sym(recipient)
      const sender = authn.currentUser()
      if (!sender) throw new Error('You must be signed in to share this resource.')
      const role = this.resourceType === 'study-deck' ? 'Viewer' : this.accessRole
      const modes = solidLogicSingleton.acl.modesFromRole(role)
      const plan = await solidLogicSingleton.acl.planGrant(this.subjectUri, { type: 'agent', iri: target.uri }, modes)
      await solidLogicSingleton.acl.applyPlan(plan)
      try {
        if (this.resourceType === 'study-deck') {
          await sendStudyDeckShareNotification(this.store, sender, target, sym(this.subjectUri))
        } else {
          await sendQuestionnaireShareNotification(this.store, sender, target, sym(this.subjectUri))
        }
      } catch (notificationError) {
        const detail = notificationError instanceof Error
          ? notificationError.message
          : 'Unknown notification error.'
        this.error = `Access was granted, but notification delivery failed: ${detail}`
        return
      }
      this.close()
    } catch (caught) {
      this.error = caught instanceof Error
        ? caught.message
        : 'Unable to share this resource.'
    } finally {
      this.saving = false
    }
  }

  protected render () {
    return html`
      <solid-ui-dialog>
        <solid-ui-dialog-header slot="header">
          <h1>${this.resourceType === 'study-deck' ? 'Share study cards' : 'Share questionnaire'}</h1>
        </solid-ui-dialog-header>
        <solid-ui-dialog-content>
          <p>${this.resourceType === 'study-deck'
            ? 'Share these study cards and notify the recipient.'
            : 'Share this published questionnaire and notify the recipient.'}</p>
          <label>
            Recipient WebID
            <input type="text" .value=${this.recipient} @focus=${() => void this.loadPeople()} @input=${(event: InputEvent) => {
              this.recipient = (event.target as HTMLInputElement).value
            }} placeholder="https://pod.example/profile/card#me">
          </label>
          ${this.peopleLoading ? html`<p class="status">Finding your contacts and friends…</p>` : ''}
          ${this.people.length > 0 && !this.people.some(person => person.uri === this.recipient) ? html`
            <div class="people" aria-label="Contacts and friends">
              ${this.people
                .filter(person => {
                  const query = this.recipient.trim().toLowerCase()
                  return !query || person.label.toLowerCase().includes(query) || person.uri.toLowerCase().includes(query)
                })
                .map(person => html`
                  <solid-ui-button class="person" variant="secondary" @click=${() => this.selectPerson(person)}>
                    ${person.label}
                    <small>${person.relationshipLabel} · ${person.uri}</small>
                  </solid-ui-button>
                `)}
            </div>
          ` : ''}
          <label>
            Access
            ${this.resourceType === 'study-deck' ? html`<span>Can view</span>` : html`
              <select .value=${this.accessRole} @change=${(event: Event) => {
                this.accessRole = (event.target as HTMLSelectElement).value as 'Viewer' | 'Editor'
              }}>
                <option value="Viewer">Can view</option>
                <option value="Editor">Can edit</option>
              </select>
            `}
          </label>
          ${this.error ? html`<p class="error">${this.error}</p>` : html`<p class="status">The recipient must have an inbox that accepts notifications.</p>`}
        </solid-ui-dialog-content>
        <solid-ui-dialog-footer slot="footer">
          <solid-ui-button variant="secondary" @click=${() => this.close()}>Cancel</solid-ui-button>
          <solid-ui-button variant="primary" ?disabled=${this.saving} @click=${() => void this.share()}>
            ${this.saving ? 'Sharing…' : 'Share'}
          </solid-ui-button>
        </solid-ui-dialog-footer>
      </solid-ui-dialog>
    `
  }
}
