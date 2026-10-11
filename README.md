# Questionnaire pane and standalone app

This package keeps the Mashlib `PaneDefinition` at `src/index.ts` and also
ships a browser app. Run `npm install`, then `npm run start:standalone` and
open the printed URL. Build the app with `npm run build:standalone`; the
static output is `standalone-dist/`. `npm run build` remains the pane/library
build.

## URL contract

* `?subject=https%3A%2F%2Fpod.example%2Fquestionnaires%2Fq%2Findex.ttl`
  opens an existing questionnaire. Published quizzes and surveys are
  read-only to participants; drafts use the existing editor.
* `?base=https%3A%2F%2Fpod.example%2Fquestionnaires%2F` starts a new
  questionnaire in that Pod container after login. `?baseUrl=` is an alias.

The app uses `solid-logic`'s `authn`/`authSession` and Solid UI's
`initHeader`, so login, logout, account/profile controls, and session changes
use the supported Solid patterns. A base URL without an authenticated WebID
is deliberately read-only and displays a sign-in message.

## Deploying

The included Pages workflow builds `standalone-dist` and publishes it to
GitHub Pages. Set the repository Pages source to **GitHub Actions**. The app
must be served over HTTPS. The Pod must permit the deployed origin with CORS
(`Access-Control-Allow-Origin`) and support authenticated Solid-OIDC requests;
do not put client secrets in this repository.

For local Pod development, use a Pod/server configured to allow the Vite
origin (normally `http://localhost:5173`) and its credentials. A questionnaire
container must grant the logged-in WebID write access for the create flow.
