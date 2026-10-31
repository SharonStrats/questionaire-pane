export function isDraftButtonClick (event: Event) {
  const button = event.composedPath().find((target): target is HTMLButtonElement => target instanceof HTMLButtonElement)
  return Boolean(button &&
    !button.disabled &&
    !button.closest('questionaire-pane-create-question-footer, questionaire-pane-create-question-header'))
}
