export function scrollQuestionEditorToTop (root: ParentNode) {
  const editor = root.querySelector<HTMLElement>('.questionaire-pane-create-question-area-view-editor')
  editor?.scrollIntoView({ block: 'start', inline: 'nearest' })
}
