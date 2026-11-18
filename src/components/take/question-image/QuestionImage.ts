import { html, type PropertyValues } from 'lit'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import type { LiveStore } from 'rdflib'
import styles from './QuestionImage.styles.css'

type ImageFetcher = Pick<NonNullable<LiveStore['fetcher']>, '_fetch'>

@customElement('questionaire-pane-take-question-image')
export default class QuestionairePaneTakeQuestionImage extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor src = ''

  @property({ attribute: false })
  accessor fetcher: ImageFetcher | null = null

  @state()
  private accessor imageUrl = ''

  @state()
  private accessor loading = false

  @state()
  private accessor failed = false

  private objectUrl = ''
  private requestId = 0
  private hasConnected = false

  connectedCallback () {
    super.connectedCallback()
    if (this.hasConnected && this.src) {
      void this.loadImage()
    }
    this.hasConnected = true
  }

  disconnectedCallback () {
    this.requestId += 1
    this.revokeObjectUrl()
    super.disconnectedCallback()
  }

  protected updated (changed: PropertyValues<this>) {
    if (changed.has('src') || changed.has('fetcher')) {
      void this.loadImage()
    }
  }

  private revokeObjectUrl () {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = ''
    }
  }

  private async loadImage () {
    const requestId = ++this.requestId
    this.revokeObjectUrl()
    this.imageUrl = ''
    this.failed = false

    if (!this.src) {
      this.loading = false
      return
    }

    if (this.src.startsWith('data:') || this.src.startsWith('blob:')) {
      this.imageUrl = this.src
      this.loading = false
      return
    }

    if (!this.fetcher) {
      this.imageUrl = this.src
      this.loading = false
      return
    }

    this.loading = true
    try {
      const response = await this.fetcher._fetch(this.src, {
        method: 'GET',
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error(`Image request failed with status ${response.status}`)
      }

      const objectUrl = URL.createObjectURL(await response.blob())
      if (requestId !== this.requestId) {
        URL.revokeObjectURL(objectUrl)
        return
      }

      this.objectUrl = objectUrl
      this.imageUrl = objectUrl
    } catch (error) {
      if (requestId !== this.requestId) {
        return
      }
      this.failed = true
      console.error('Unable to load questionnaire question image', error)
    } finally {
      if (requestId === this.requestId) {
        this.loading = false
      }
    }
  }

  private handleImageError () {
    this.revokeObjectUrl()
    this.imageUrl = ''
    this.failed = true
    console.error('Unable to render questionnaire question image', this.src)
  }

  render () {
    if (!this.src) {
      return html``
    }
    if (this.loading) {
      return html`<div class="questionaire-pane-question-image-status" role="status">Loading question image...</div>`
    }
    if (this.failed) {
      return html`<div class="questionaire-pane-question-image-status" role="status">Question image could not be loaded.</div>`
    }
    if (!this.imageUrl) {
      return html``
    }

    return html`
      <img
        class="questionaire-pane-question-image"
        src=${this.imageUrl}
        alt="Image for this question"
        referrerpolicy="no-referrer"
        @error=${() => this.handleImageError()}
      />
    `
  }
}
