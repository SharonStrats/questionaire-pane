# Questionnaire pane and standalone app

This package keeps the Mashlib `PaneDefinition` at `src/index.ts` and also
ships a browser app. Run `npm install`, then `npm run start:standalone` and
open the printed URL. To use the standard local questionnaire port, run
`npm run start:standalone:4200` and open `http://localhost:4200/standalone/`.
For live-reload development, use `npm run watch:standalone:4200`; it opens the
same URL automatically.
In standalone Vite development, short-answer sidecar grading is explicitly
configured to `http://localhost:5001` by default. Override it with
`VITE_SOLID_APP_SERVICES_ENDPOINT` (or the legacy
`VITE_QUIZ_SIDECAR_ENDPOINT`), for example:

```sh
VITE_SOLID_APP_SERVICES_ENDPOINT=http://localhost:5000 npm run watch:standalone:4200
```

The standalone home can expose live multiplayer quizzes when
`VITE_QUIZ_GAME_ENDPOINT` points to the Socket.IO realtime service:

```sh
VITE_QUIZ_GAME_ENDPOINT=http://localhost:5100 npm run watch:standalone:4200
```

The realtime service is a prototype and currently keeps lobby state in memory.
It should be run with an origin allow-list that includes the standalone app.
Do not use it for public games until authenticated connection tickets,
authoritative scoring, reconnect handling, rate limits, room expiry, and Pod
result persistence are implemented.

Start the sidecar separately from `extrarepos/solid-ai-sidecar`. Configure its
`CORS_ORIGINS` to include `http://localhost:4200`, the questionnaire standalone
origin. The browser client sends no provider API key; credentials remain
server-side.
Build the app with `npm run build:standalone`; the static output is
`standalone-dist/`. `npm run build` remains the pane/library build.

## Personal study sessions

Opening a saved deck first lets the learner choose a session size (up to the
deck size) and all/new/needs-practice mode. The player keeps first-answer and
reveal state when moving backwards. Incorrect answers and revealed answers
(including the answer-revealing hint) are tracked for review; only correct
answers without revealing earn 2 XP. Progress is saved after each card, with
visible errors and a retry button. Session completion offers another set and
opens any pending Pokémon reward.

`src/service/studyLearningProgress.ts` supplies per-user, per-deck learning
history without changing the player's existing points calculation:

* `loadStudyLearningProgress(store, user, storageUrl, deckUri)` loads history.
  Pass the signed-in user's Pod storage root, **not the saved deck owner's
  root**. Deck and card identities are their saved RDF resource URIs, including
  fragments. History is stored at
  `study-progress/<SHA-256(WebID)>/<SHA-256(deckUri)>.ttl` under that root.
  Containers inherit the Pod's access policy; use a private storage root.
* `selectStudySession(cards, progress, { mode, count }, now?)` returns up to
  `count` distinct cards without modifying the deck. Modes are `all`, `new`
  (no history), and `needs-practice` (last answer incorrect/revealed or review
  due). All mode orders struggling cards, due cards, new cards, then future
  reviews; equal priorities retain deck order.
* `recordStudyCardOutcome(store, progress, cardUri, outcome, now?)` persists
  one final outcome (`correct`, `incorrect`, or `revealed`) per answer and
  returns updated history. Await it and replace the in-memory progress.
  Correct streaks schedule reviews after 1, 3, 7, 14, then 30 days;
  incorrect/revealed answers reset the streak and schedule a 10-minute review.
  Record a revealed answer instead of an additional incorrect answer.

Import `src/components/standalone/study-session-setup/StudySessionSetup.ts`
to register `<questionaire-study-session-setup>`. Set its `cards`
(`{ uri, front, back }[]`), `progress`, `loading`, and `error` properties.
Its bubbling/composed `study-session-start` event carries
`{ cards, options }`; **cards is already the selected session**, not the full
deck. Start the existing player from those cards and retain their URIs when
recording answers. Reuse existing points awarding only once per answer.

Only HTTP 404 initializes empty history. Other load/save failures must be
shown to the learner. Writes reload fresh RDF, queue within a store, and use
conditional PUT (`If-Match` or `If-None-Match`) to prevent lost updates.
Existing documents require an exposed ETag response header. Missing ETags,
conflicts and malformed/mismatched history reject rather than overwrite.

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

The included `.github/workflows/deploy-pages.yml` workflow builds
`standalone-dist` and publishes it to GitHub Pages. Set the repository Pages
source to **GitHub Actions**. The app must be served over HTTPS. The Pod must
permit the deployed origin with CORS (`Access-Control-Allow-Origin`) and
support authenticated Solid-OIDC requests; do not put client secrets in this
repository.

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
the deployed app, use the HTTPS URL of the Pivot server. The workflow derives
the asset base from the repository name (currently `/questionaire-pane/`) and
passes it as `VITE_BASE_PATH`, so entrypoint assets and lazy-loaded chunks work
on the project site. Local standalone development continues to use `/`; set
`VITE_BASE_PATH` explicitly only when serving the standalone app below another
local path.

For local Pod development, use a Pod/server configured to allow the Vite
origin (normally `http://localhost:3200`) and its credentials. A questionnaire
container must grant the logged-in WebID write access for the create flow.

## Hosting the standalone app on a droplet

The standalone app is a static site; Caddy can serve its build and reverse
proxy the Solid App Services API running on the same droplet. Point a DNS record
such as `quiz.example.com` at the droplet and use HTTPS. The app-service
process should remain bound to `127.0.0.1:5000`; do not expose port 5000
directly. Keep provider API keys in the service environment, never in the
frontend build. Install Node 22, Git, npm, and Caddy; allow Caddy to bind ports
80 and 443, and ensure the non-root deploy user owns `/opt/solidos`.

### Build with selected `solid-logic` and `solid-ui` branches

The standalone Vite config expects `questionaire-pane` and `solid-ui` to be
sibling checkouts under `workspaces/`. It imports the built `solid-ui/dist`,
and `solid-ui` itself needs the local `solid-logic` and `pane-registry`
packages. On a fresh droplet, clone the app and dependencies into that layout.
Replace each `<branch>` with the branch you intend to deploy, and run all
commands as the same non-root user so `npm link` uses one consistent npm
prefix:

```sh
mkdir -p /opt/solidos/workspaces
cd /opt/solidos/workspaces
git clone --single-branch --branch <questionaire-pane-branch> https://github.com/SharonStrats/questionaire-pane.git questionaire-pane
git clone --single-branch --branch <solid-logic-branch> https://github.com/SolidOS/solid-logic.git solid-logic
git clone https://github.com/SolidOS/pane-registry.git pane-registry
git clone --single-branch --branch <solid-ui-branch> https://github.com/SolidOS/solid-ui.git solid-ui

cd solid-logic
npm install --legacy-peer-deps
npm run build
npm link

cd ../pane-registry
npm install --legacy-peer-deps
npm link solid-logic
npm link

cd ../solid-ui
npm install --legacy-peer-deps
npm link solid-logic pane-registry
npm run build
npm link

cd ../questionaire-pane
npm install --legacy-peer-deps
npm link solid-logic pane-registry solid-ui
VITE_BASE_PATH=/ \
VITE_SOLID_APP_SERVICES_ENDPOINT=https://quiz.example.com \
npm run build:standalone
mv standalone-dist/standalone/index.html standalone-dist/index.html
rmdir standalone-dist/standalone
```

`solid-logic` is built before `solid-ui`, and the standalone app is built last,
so the selected branch code is included in the generated assets. Repeat the
build steps after updating either dependency branch. `VITE_BASE_PATH=/` serves
the app at the subdomain root. `VITE_SOLID_APP_SERVICES_ENDPOINT` is a
build-time, public URL; for a same-origin setup it should match the frontend
origin. The commands above use the app and dependency repository URLs currently
declared by this workspace.

The `npm link` commands override the app's version-pinned dependencies with
local `node_modules` symlinks; they do not change the app's package manifest or
lockfile. Re-run the link commands after installing dependencies or switching
checkouts.

### Serve the build and proxy the service

For example, configure Caddy with the built directory and proxy only the API
and health check to the loopback-bound service:

```caddyfile
quiz.example.com {
	handle /api/* {
		reverse_proxy 127.0.0.1:5000
	}
	handle /health {
		reverse_proxy 127.0.0.1:5000
	}
	handle {
		root * /opt/solidos/workspaces/questionaire-pane/standalone-dist
		try_files {path} /index.html
		file_server
	}
}
```

Configure the service's `CORS_ORIGINS` as the exact frontend origin
(`https://quiz.example.com`), even when using the same-origin proxy. Confirm
that `https://quiz.example.com/` serves the app and
`https://quiz.example.com/health` reaches the service. Solid Pod access still
depends on the logged-in Pod allowing the frontend origin and credentials.

## Subscript and superscript

Question creators can select text in a question editor and use the compact
**Subscript** or **Superscript** buttons directly below that editor. The buttons
only act on an existing selection, so they never accidentally switch into a
persistent formatting mode. Formatting is stored as safe plain-text markers
(`[[sub:text]]` and `[[sup:text]]`) in the existing RDF literal fields. Creator
and taker views render those markers as native `<sub>` and `<sup>` elements; the
app never evaluates stored text as HTML.

## Pokémon companions

Quiz and study points share cumulative progress in the questionnaire workspace's
`quiz-progress/index.ttl`. Each newly crossed level unlocks three companion
choices. The same document records the current and longest consecutive study
streak and the last study date. A quiz or study-card completion counts as one
study day, while repeated retries of the same attempt do not increase the
streak. The Home sidebar shows the current streak and resets it after a missed
day; the longest streak remains available in `PokemonProgress`.
The level-up dialog includes a short fireworks animation, disabled when the
device requests reduced motion. **Choose later** leaves the choice pending in
the Pod; saved companions remain selected as more points are earned.
Multiple unlocked levels are offered in order. Existing progress documents keep
their companion and do not reopen historical levels.

Integration API:

* `updatePokemonProgress(store, points, attempt, source, user)` counts a stable
  attempt URI once. Use the same URI when retrying a quiz/study award.
* `loadPokemonProgress(store, user)` restores the companion, `pendingChoices`,
  and streak fields (`currentStreak`, `longestStreak`, `lastStudyDate`).
* `showPokemonLevelUp(store, user, progress, onProgress?)` from
  `src/components/standalone/pokemon-level-up/PokemonLevelUpDialog.ts` resumes
  pending choices and resolves with progress when selected or deferred.
* `choosePokemonCompanion(store, user, level, pokedexId)` validates and persists
  the oldest pending choice for non-dialog callers.

Set Home's `pokemonProgress` to the loaded/returned progress and update it in
`onProgress`. The standalone app invokes the dialog on Home reload and study
session completion. Quiz result saving already opens it. The dialog and quiz taker emit a
bubbling, composed `pokemon-progress-changed` event whose `detail` is the updated
`PokemonProgress`; listen on `document` because the dialog is mounted on the body.

## Friend group chat

The toolbar chat dialog supports several selected friends, existing
conversations, online indicators, unread badges, and opt-in browser
notifications. Invitations and new-message notices also appear in the Solid
Inbox section. Drag the title to move the native modal surface within the
viewport. Participant chips use names from the loaded friend list when available.
Recipient inboxes must advertise `ldp:inbox` and permit the
sender to append notifications; failures remain visible after chat delivery.
Browser notifications work only while the app is connected and permission is
granted. Messages remain in the realtime service's temporary memory, not in
the Pod. WebIDs are currently self-reported, not verified server-side: this is
a prototype and must not be used for sensitive conversations. See the realtime
service README for deployment, routing, history limits, and protocol details.
