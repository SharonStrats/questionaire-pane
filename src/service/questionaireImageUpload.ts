import * as UI from 'solid-ui'
import type { LiveStore, NamedNode } from 'rdflib'

function questionnaireBaseUrl (question: NamedNode): string {
  const questionsMarker = '/draft/questions/'
  const markerIndex = question.doc().uri.indexOf(questionsMarker)
  if (markerIndex < 0) {
    throw new Error(`Question is not in a questionnaire draft: ${question.doc().uri}`)
  }
  return question.doc().uri.slice(0, markerIndex + 1)
}

/**
 * Uploads an image through the same authenticated fetcher used by the folder
 * pane. The returned URL is suitable for storing as disco:image.
 */
export function uploadQuestionImage (store: LiveStore, question: NamedNode, file: File): Promise<string> {
  const fetcher = store.fetcher
  if (!fetcher) {
    return Promise.reject(new Error('Missing fetcher on questionnaire store'))
  }

  const imagesUrl = `${questionnaireBaseUrl(question)}images/`
  return new Promise((resolve, reject) => {
    try {
      UI.widgets.uploadFiles(fetcher, [file], imagesUrl, imagesUrl, (_uploadedFile, uploadedUri) => {
        resolve(uploadedUri)
      })
    } catch (error) {
      reject(error)
    }
  })
}
