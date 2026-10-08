# Copilot Instructions for questionaire-pane

This file is the shared working note for how to develop the questionnaire pane in this workspace.

## General guidance

- Prefer small, surgical changes that keep the pane working end-to-end.
- Keep the questionnaire vocabulary flexible while it is still being designed.
- Use `dct:` for title, creator, created, and related document metadata.
- Keep the initial questionnaire title editable after creation.
- Default new questionnaires to `Untitled Questionaire` unless the user chooses a different title.
- When building or editing questionnaire services, always consult and update [DataManipulationBestStrategy.md](/Users/sharon/2026Dev/solidos/mydocs/DataManipulationBestStrategy.md) for document creation, patching, prefix handling, and any new data-manipulation edge cases discovered while working.
- Register the `disco` prefix explicitly in the questionnaire service so Turtle serializes with `disco:` instead of the fallback `dis:` prefix.
- For icons, use Lucide via the `~icons/lucide/...` imports and the Lucide icon catalog at [lucide.dev/icons](https://lucide.dev/icons/). If a pane uses Lucide icons, make sure the package declares `@iconify-json/lucide` and the generated icon web-component types.
- When choosing or refining questionnaire vocabulary, check these sources first:
  - [schema.org](https://schema.org/)
  - [Disco / DDI-RDF Discovery Vocabulary](https://rdf-vocabulary.ddialliance.org/discovery.html)
  - [SKOS namespace](https://www.w3.org/2004/02/skos/core#) and [SKOS reference](https://www.w3.org/TR/skos-reference/)
  - [The Survey Ontology](https://cefriel.github.io/survey-ontology/)
  - [Dublin Core Terms](https://purl.org/dc/terms/)
  Prefer existing terms from those vocabularies before inventing new ones.
- When creating or updating [extrarepos/vocab](/Users/sharon/2026Dev/solidos/extrarepos/vocab), use [solid/vocab](https://github.com/solid/vocab) as the reference for how vocabularies are structured and written.

## Questionnaire structure

When minting a questionnaire:

- create the base container
- create `index.ttl`
- create `draft.ttl`
- create `draft/questions/`
- keep the canonical metadata on `index.ttl` and the editable question graph in `draft.ttl`
- keep the canonical title/creator/created metadata on `index.ttl`
- keep `draft.ttl` focused on the editable question graph and question links

When adding questions:

- create a separate question document under `draft/questions/`
- link the new question back into the draft
- keep the predicate and class definitions easy to change as the vocabulary evolves

## UI notes

- The create header should stay close to the screenshot the user provided.
- The title pencil should edit the stored questionnaire title.
- If a title is displayed, it should come from RDF first and fall back to the default title.

## Editing notes

- The service helpers in `src/service/` are the source of truth for create/update behavior.
- If new predicates or classes are needed, add them in a way that makes future vocabulary changes easy.
- Keep the instructions file updated as the questionnaire workflow changes.
- Keep the take flow and create flow structurally aligned where practical so shared vocabulary and card rendering stay easy to reason about.
