> UI update (2026-09-26): the entry point is now **Check decisions & blockers**, visible only when the API is configured. Select up to 10 text updates and explicitly request review. Findings appear beside each selected source; probabilities are in Model details. The adapter and evaluation contract below remain unchanged. The public static demo does not enable this endpoint.

# Optional Jev review

Jev is used for bounded decisions about a selected text card. It does not rewrite a report, calculate metrics, inspect images, invent an owner, or send a message. The creative feature is helping an author notice a pending decision or obstacle inside material that otherwise looks like an ordinary update.

## What is implemented

A **Jev review** button on progress and decision cards opens a preview of the title and text. Nothing is sent until the user selects **Send this text to TypeSafe**. The UI displays purpose probabilities, model confidence, and two separate model estimates: leadership action needed and unresolved blocker present.

If both the selected category probability and confidence are at least 0.8, the UI can offer a progress/decision type change. Every change still requires the user's click and can be undone. These thresholds are initial product policy, not evaluated accuracy guarantees. Blocker, mixed-topic, and unclear classifications provide review guidance rather than a new unsupported card type. Guidance text comes from our application, not model-generated explanations.

The request includes only the selected card title and body. A body may contain names or other sensitive information; users see that exact text before sending. The original source, report library, images, metrics and people records are not included. The backend does not log request text or API keys. Reviews are session-only and not added to backups. Applied card types persist normally.

## Local setup

The browser never receives the API key. Obtain access through the official [TypeSafe console](https://console.typesafe.ai/).

1. Stop any generic file server serving this repository. The optional backend serves only an explicit runtime-file allowlist; it never serves `.env` or server source.
2. Copy `.env.example` to `.env`, then edit the key **locally**. Do not paste a key into chat, source code, a browser field, or a public repository. `.env` is ignored by Git.
3. Start the server:

```sh
node --env-file=.env server/start.mjs
```

4. Open <http://127.0.0.1:4174>. The server is bound to loopback and intended for a local POC.
5. Create a text card, open Jev review, and inspect the transmission preview.

You can instead configure `TYPESAFE_API_KEY` and optional `TYPESAFE_MODEL` in the process environment and run `node server/start.mjs`. Default model: `jev-1.13.0`, pinned for reproducibility. The default port is 4174. A different origin/port has separate browser storage; export and restore your existing reports if moving from the old port 4173.

With no key, the app shows AI as unavailable and keeps manual reporting fully functional. A static `dist/` deployment also remains usable; it needs a separately configured same-origin backend before AI review will work. There is no fake model fallback.

## Architecture

```text
features/ai-review/ai-review.js     Consent preview, suggestions, apply/undo
features/ai-review/contract.js      Input/output DTO validation and UI policy
server/app.mjs                    Local HTTP boundary, limits and static allowlist
server/jev-client.mjs             Official API request and response mapping
```

The provider adapter makes one request per reviewed card to `POST https://api.typesafe.ai/v1/systemone`, using one Choice and two Noul questions. It enforces an eight-second upstream timeout, validates response shapes and probabilities, and returns friendly errors without reflecting the provider's raw error body. It does not automatically retry paid requests. The local server limits review frequency, rejects foreign origins, and keeps the API key server-side. Its loopback-only design is not an authenticated production service.

A public deployment requires authenticated users, per-user authorization and rate limits, managed server secrets, HTTPS, and an explicit vendor data-handling review. Do not expose this local server publicly. TypeSafe describes no training on customer requests; that does not imply zero retention for every account. Confirm the terms applicable to the intended account before sending enterprise content.

## Evidence and limitations

The integration has deterministic adapter, HTTP boundary, and browser tests with explicitly stubbed provider responses. Those tests prove the application workflow, not Jev's accuracy. No live TypeSafe response, measured latency, or model quality result has been obtained in this session.

A small hand-authored evaluation set includes pending versus completed approvals, current versus resolved blockers, mixed content, missing context, an instruction-injection attempt, and two Chinese examples. To run it against the actual model, after configuring a key:

```sh
node --env-file=.env scripts/evaluate-jev.mjs
```

This makes paid API requests using the fictional fixture text. It reports classifications, confidence, version, latency, completed-case accuracy, decision precision/recall, and the offered-change rate/accuracy. Expand the dataset with representative project notes and hold out cases before tuning thresholds. Even a perfect result on this small set would not establish production accuracy or probability calibration.

Type-safe output constrains the result format, not semantic correctness. Keep arithmetic and date comparison in code. A source can contain misleading or adversarial language. Precise criteria and a review step reduce risk but do not eliminate model mistakes.

## Interview demonstration

Use this fictional text: “Please approve two additional support engineers before the final rollout.” Keep it initially as an update card. Open Jev review, show what will be sent, request a result, and inspect the suggestion. Apply a decision type only if the returned result supports it, then show the owner/deadline checks and Undo.

Next try “The manager approved the engineers yesterday; rollout has resumed.” Compare the actual result rather than assuming Jev will succeed. An uncertain or incorrect output is an opportunity to explain the review boundary and evaluation plan.

Interview framing: “I use a decision model to help authors notice actions hidden in reporting text. The original wording stays intact, and the author controls any change.”

The existing 15-minute presentation describes the core POC. When demonstrating AI, replace one minute of its live workflow with the sequence above and mention the optional server/data flow. Do not repeat the old core-only statement that the app never makes remote requests when AI review is enabled.

## Official references checked September 25, 2026

- [Introduction](https://docs.typesafe.ai/introduction): decision primitives rather than generated prose.
- [API reference](https://docs.typesafe.ai/api): endpoint, authentication and response schemas.
- [Models](https://docs.typesafe.ai/models): pinned version, text-only input, data-handling pointers.
- [Confidence](https://docs.typesafe.ai/confidence): confidence differs from the selected option's probability.
- [Known limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13): arithmetic, indirection and adversarial-content limitations.
- [Legal documents](https://docs.typesafe.ai/legal): account-specific terms and data handling.
