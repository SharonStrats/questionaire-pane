/*   Questionnaire pane
 **
 **  This allows a user to build and publish a questionnaire
 */
import { literal, Store } from 'rdflib'
import { icons, ns } from 'solid-ui'
import { createQuestionaireLogic } from './service/questionaireLogic'
import { questionairePredicates } from './service/questionairePredicates'
import { disco } from './namespaces'
import './components/provider/QuestionaireProvider'
import './components/create/questionaire-pane-create-main-view/QuestionairePaneCreateMainView'
import './components/take/questionaire-pane-take-main-view/QuestionairePaneTakeMainView'
import './questionairePane.css'

export default {
  icon: icons.iconBase + 'noun_Document_998605.svg',
  name: 'questionaire',

  mintClass: disco('Questionnaire'),

  // Create a new questionnaire
  mintNew: async function (context, newPaneOptions) {
    const store = context.session.store as Store
    if (newPaneOptions.me && !newPaneOptions.me.uri) {
      throw new Error('questionaire mintNew:  Invalid userid')
    }

    const questionaireLogic = createQuestionaireLogic(store)
    const structure = await questionaireLogic.createQuestionnaireStructure({
      baseUrl: newPaneOptions.newBase,
      title: newPaneOptions.title || 'Untitled Questionaire',
      author: newPaneOptions.me ?? null,
      created: new Date()
    })
    newPaneOptions.newInstance = structure.index

    return newPaneOptions
  },

  label: function (subject, context) {
    const kb = context.session.store
    if (kb.holds(subject, ns.rdf('type'), disco('Questionnaire'))) {
      return 'Questionnaire'
    }
    if (kb.holds(subject, ns.rdf('type'), questionairePredicates.questionnaire.quizType) &&
        kb.holds(subject, questionairePredicates.questionnaire.status, literal('Published'))) {
      return 'Quiz'
    }
    if (kb.holds(subject, ns.rdf('type'), questionairePredicates.questionnaire.surveyType) &&
        kb.holds(subject, questionairePredicates.questionnaire.status, literal('Published'))) {
      return 'Survey'
    }
    return null
  },

  render: function (subject, context) {
    const dom = context.dom
    const kb = context.session.store
    const div = dom.createElement('div')
    div.classList.add('questionaire-pane')

    const provider = dom.createElement('questionaire-provider') as unknown as HTMLElement & { store?: Store | null, subject?: typeof subject | null }
    provider.store = context.session.store as Store
    provider.subject = subject

    const isPublished = (
      kb.holds(subject, ns.rdf('type'), questionairePredicates.questionnaire.quizType) ||
      kb.holds(subject, ns.rdf('type'), questionairePredicates.questionnaire.surveyType)
    ) &&
      kb.holds(subject, questionairePredicates.questionnaire.status, literal('Published'))
    const mainView = isPublished
      ? dom.createElement('questionaire-pane-take-main-view')
      : dom.createElement('questionaire-pane-create-main-view')
    provider.appendChild(mainView)
    div.appendChild(provider)

    return div
  }
}
