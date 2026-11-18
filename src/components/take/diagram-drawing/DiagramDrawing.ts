import { html, type PropertyValues } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import styles from './DiagramDrawing.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { readQuestionValue } from '../../../service/questionAccessors'
import { loadQuizAiService } from '../../../service/quizAiService'
import type { DrawingEvaluation } from '../../../service/diagramDrawingSidecarClient'
import { renderFormattedText } from '../../shared/formatting'

interface DrawingPoint {
  x: number
  y: number
}

interface DrawingStroke {
  color: string
  width: number
  points: DrawingPoint[]
}

interface DrawingValue {
  version: 1
  strokes: DrawingStroke[]
}

@customElement('questionaire-pane-take-question-diagram-drawing')
export default class QuestionairePaneTakeQuestionDiagramDrawing extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @property({ attribute: false })
  accessor answer: string | null = null

  @state()
  private accessor imageUrl = ''

  @state()
  private accessor strokes: DrawingStroke[] = []

  @state()
  private accessor evaluation: DrawingEvaluation | null = null

  @state()
  private accessor evaluationStatus: 'idle' | 'checking' | 'error' = 'idle'

  @state()
  private accessor evaluationError = ''

  private canvas: HTMLCanvasElement | null = null
  private drawing = false
  private currentStroke: DrawingStroke | null = null
  private objectUrl = ''
  private loadedQuestionUri: string | null = null
  private requestId = 0

  protected willUpdate () {
    const question = this.question
    const store = this.questionaire?.store
    if (!question || !store || this.loadedQuestionUri === question.uri) {
      return
    }

    this.loadedQuestionUri = question.uri
    this.strokes = this.parseAnswer(this.answer)
    this.evaluation = null
    this.evaluationStatus = 'idle'
    this.evaluationError = ''
    void this.loadImage(readQuestionValue(store, question, 'image'))
  }

  protected updated (_changed: PropertyValues<this>) {
    this.canvas = this.renderRoot.querySelector('canvas')
    this.drawCanvas()
  }

  disconnectedCallback () {
    this.requestId += 1
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = ''
    }
    super.disconnectedCallback()
  }

  private parseAnswer (answer: string | null) {
    if (!answer) {
      return []
    }

    try {
      const value = JSON.parse(answer) as Partial<DrawingValue>
      return Array.isArray(value.strokes)
        ? value.strokes.filter((stroke): stroke is DrawingStroke =>
            Boolean(stroke) &&
            typeof stroke === 'object' &&
            Array.isArray(stroke.points) &&
            stroke.points.length > 0
          )
        : []
    } catch {
      return []
    }
  }

  private async loadImage (src: string) {
    const requestId = ++this.requestId
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = ''
    }
    this.imageUrl = ''
    if (!src) {
      return
    }

    if (src.startsWith('data:') || src.startsWith('blob:')) {
      this.imageUrl = src
      return
    }

    const fetcher = this.questionaire?.store?.fetcher
    if (!fetcher) {
      this.imageUrl = src
      return
    }

    try {
      const response = await fetcher._fetch(src, { method: 'GET', credentials: 'include' })
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
      console.error('Unable to load diagram drawing image', error)
    }
  }

  private getPoint (event: PointerEvent) {
    const canvas = this.canvas
    if (!canvas) {
      return null
    }
    const bounds = canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) {
      return null
    }
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    }
  }

  private handlePointerDown (event: PointerEvent) {
    const point = this.getPoint(event)
    if (!point || !this.canvas) {
      return
    }
    this.drawing = true
    this.currentStroke = { color: '#6c5ce7', width: 4, points: [point] }
    this.strokes = [...this.strokes, this.currentStroke]
    this.canvas.setPointerCapture(event.pointerId)
    this.syncAnswer()
  }

  private handlePointerMove (event: PointerEvent) {
    if (!this.drawing || !this.currentStroke) {
      return
    }
    const point = this.getPoint(event)
    if (!point) {
      return
    }
    this.currentStroke.points = [...this.currentStroke.points, point]
    this.strokes = [...this.strokes.slice(0, -1), this.currentStroke]
    this.syncAnswer()
  }

  private handlePointerUp () {
    this.drawing = false
    this.currentStroke = null
  }

  private clearDrawing () {
    this.strokes = []
    this.evaluation = null
    this.evaluationStatus = 'idle'
    this.syncAnswer()
  }

  private captureDrawingDataUrl () {
    const image = this.renderRoot.querySelector('img')
    if (!image || !image.naturalWidth || !image.naturalHeight) {
      return null
    }

    const output = document.createElement('canvas')
    output.width = image.naturalWidth
    output.height = image.naturalHeight
    const context = output.getContext('2d')
    if (!context) {
      return null
    }
    context.drawImage(image, 0, 0)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    for (const stroke of this.strokes) {
      context.strokeStyle = stroke.color
      context.lineWidth = stroke.width * (image.naturalWidth / Math.max(image.clientWidth, 1))
      context.beginPath()
      stroke.points.forEach((point, index) => {
        const x = point.x * image.naturalWidth
        const y = point.y * image.naturalHeight
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()
    }
    return output.toDataURL('image/png')
  }

  private async evaluateDrawing () {
    const question = this.question
    const store = this.questionaire?.store
    if (!question || !store || this.strokes.length === 0 || !this.imageUrl) {
      return
    }

    const image = this.renderRoot.querySelector('img')
    const answerImage = this.captureDrawingDataUrl()
    if (!image || !answerImage) {
      this.evaluationStatus = 'error'
      this.evaluationError = 'The diagram is not ready to evaluate.'
      return
    }

    this.evaluationStatus = 'checking'
    this.evaluationError = ''
    try {
      const service = await loadQuizAiService()
      this.evaluation = await service.evaluateDiagramDrawing({
        question: readQuestionValue(store, question, 'title'),
        referenceImage: await this.imageToDataUrl(image),
        answerImage
      })
      this.evaluationStatus = 'idle'
    } catch (error) {
      this.evaluationStatus = 'error'
      this.evaluationError = error instanceof Error ? error.message : 'AI drawing evaluation is unavailable.'
      console.error('Unable to evaluate diagram drawing', error)
    }
  }

  private async imageToDataUrl (image: HTMLImageElement) {
    const output = document.createElement('canvas')
    output.width = image.naturalWidth
    output.height = image.naturalHeight
    const context = output.getContext('2d')
    if (!context) {
      throw new Error('Unable to prepare the diagram for evaluation.')
    }
    context.drawImage(image, 0, 0)
    return output.toDataURL('image/png')
  }

  private syncAnswer () {
    if (!this.question) {
      return
    }
    const value: DrawingValue = { version: 1, strokes: this.strokes }
    this.dispatchEvent(new CustomEvent('questionaire-answer-changed', {
      bubbles: true,
      composed: true,
      detail: {
        questionUri: this.question.uri,
        answer: this.strokes.length > 0 ? JSON.stringify(value) : null
      }
    }))
  }

  private drawCanvas () {
    const canvas = this.canvas
    if (!canvas) {
      return
    }
    const bounds = canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) {
      return
    }
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(bounds.width * dpr)
    canvas.height = Math.round(bounds.height * dpr)
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, bounds.width, bounds.height)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    for (const stroke of this.strokes) {
      context.strokeStyle = stroke.color
      context.lineWidth = stroke.width
      context.beginPath()
      stroke.points.forEach((point, index) => {
        const x = point.x * bounds.width
        const y = point.y * bounds.height
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()
    }
  }

  render () {
    const title = this.question && this.questionaire?.store
      ? readQuestionValue(this.questionaire.store, this.question, 'title')
      : ''

    return html`
      <section class="questionaire-pane-take-question-diagram-drawing">
        <div class="questionaire-pane-take-question-diagram-drawing-type">Diagram Drawing</div>
        <h2>${renderFormattedText(title || 'Draw on the diagram')}</h2>
        ${this.imageUrl
          ? html`
            <div class="questionaire-pane-take-question-diagram-drawing-stage">
              <img src=${this.imageUrl} alt="Diagram for drawing" @load=${() => this.drawCanvas()} />
              <canvas
                aria-label="Draw your answer on the diagram"
                @pointerdown=${this.handlePointerDown}
                @pointermove=${this.handlePointerMove}
                @pointerup=${this.handlePointerUp}
                @pointercancel=${this.handlePointerUp}
              ></canvas>
            </div>
            <div class="questionaire-pane-take-question-diagram-drawing-actions">
              <button type="button" @click=${this.clearDrawing} ?disabled=${this.strokes.length === 0}>Clear drawing</button>
              <button type="button" @click=${() => { void this.evaluateDrawing() }} ?disabled=${this.strokes.length === 0 || this.evaluationStatus === 'checking'}>
                ${this.evaluationStatus === 'checking' ? 'Checking drawing…' : 'Check with AI'}
              </button>
            </div>
            ${this.evaluation
              ? html`
                <aside class="questionaire-pane-take-question-diagram-drawing-evaluation" role="status">
                  <strong>${this.evaluation.decision === 'possibly-correct' ? 'Possibly correct' : this.evaluation.decision.replace('-', ' ')}</strong>
                  <span>${this.evaluation.feedback}</span>
                  <small>AI confidence: ${Math.round(this.evaluation.confidence * 100)}%. ${this.evaluation.needsReview ? 'Human review is recommended.' : 'This is assistance, not a definitive grade.'}</small>
                </aside>
              `
              : html``}
            ${this.evaluationError ? html`<p class="questionaire-pane-take-question-diagram-drawing-error" role="alert">${this.evaluationError}</p>` : ''}
          `
          : html`<p role="status">This question does not have a diagram image yet.</p>`}
      </section>
    `
  }
}
