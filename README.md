# Questionnaire pane and standalone app

This package keeps the Mashlib `PaneDefinition` at `src/index.ts` and also
ships a browser app. Run `npm install`, then `npm run start:standalone` and
open the printed URL. To use the standard local questionnaire port, run
`npm run start:standalone:3200` and open `http://localhost:3200/standalone/`.
For live-reload development, use `npm run watch:standalone:3200`; it opens the
same URL automatically.
Build the app with `npm run build:standalone`; the static output is
`standalone-dist/`. `npm run build` remains the pane/library build.

## URL contract

* `?subject=https%3A%2F%2Fpod.example%2Fquestionnaires%2Fq%2Findex.ttl`
  opens an existing questionnaire. Published quizzes and surveys are
  read-only to participants; drafts use the existing editor.
* `?base=https%3A%2F%2Fpod.example%2Fquestionnaires%2F` starts a new
  questionnaire in that Pod container after login. `?baseUrl=` is an alias.

The app uses `solid-logic`'s `authn`/`authSession` and Solid UI's account
component, so login, logout, account/profile controls, and session changes use
the supported Solid patterns. A base URL without an authenticated WebID is
deliberately read-only and displays a sign-in message.

## Published sharing

After publishing, the editor's **Share** action uses the immutable published
snapshot (`published/<version>/index.ttl#this`) as the response link; it never
shares the editable questionnaire root or draft. Confirming **Add public
sharing** grants public `Read` to that snapshot and its published question
documents, and public `Append` to the matching
`published/<version>/responses/` container. The response container is created
alongside every published snapshot so its ACL is distinct from the published
content ACL. ACL failures are shown in the dialog and do not report success.

For specific sharing, the dialog accepts a WebID or existing Solid group URL,
classifies it with Solid Logic's ACL helpers, and grants that subject the same
published-content read and response-container append permissions. Unknown
absolute URLs are treated as WebIDs; unknown non-URL values fail visibly rather
than creating an ambiguous ACL grant.

## Deploying

The included Pages workflow builds `standalone-dist` and publishes it to
GitHub Pages. Set the repository Pages source to **GitHub Actions**. The app
must be served over HTTPS. The Pod must permit the deployed origin with CORS
(`Access-Control-Allow-Origin`) and support authenticated Solid-OIDC requests;
do not put client secrets in this repository.

For the `SharonStrats/questionaire-pane` repository, the deployed app URL is:

```text
https://sharonstrats.github.io/questionaire-pane/
```

To create and edit a questionnaire with a Pivot identity, open the deployed app
with the destination Pod container in the `base` query parameter:

```text
https://sharonstrats.github.io/questionaire-pane/?base=https%3A%2F%2Fyour-pod.example%2Fquestionnaires%2F
```

Use the header's **Log In** control and enter the Pivot issuer URL. The
questionnaire container must already grant that Pivot WebID write permission.
For a locally running Pivot server, the issuer is `http://localhost:3100/`; for
the deployed app, use the HTTPS URL of the Pivot server. The GitHub Actions
build sets the `/questionaire-pane/` asset base automatically, so local
standalone development continues to use `/`.

For local Pod development, use a Pod/server configured to allow the Vite
origin (normally `http://localhost:3200`) and its credentials. A questionnaire
container must grant the logged-in WebID write access for the create flow.
