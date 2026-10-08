# macOS release acceptance

Current assessment status (2026-09-28): the POC submission package is prepared, with 76 unit tests and 67 browser tests passing (one optional fixture skipped). The manual and distribution checks below remain open. They are release-hardening checks, not additional requirements invented for the assessment. See [assessment audit](../SUBMISSION-REQUIREMENTS.md).

Historical release status on 2026-09-27: **not yet cleared for interview distribution**. Automated checks below pass, but the native recording, hosted CI and second-Mac checks remain pending. A source commit or a local signature check does not establish these missing outcomes.

## Evidence so far

| Gate                            | Status  | Evidence                                                                                                                |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| JavaScript lint and formatting  | PASS    | ESLint covers application, server, scripts, tests and JS configuration; Prettier checks supported maintained text files |
| Unit/server regressions         | PASS    | 74 tests                                                                                                                |
| Browser regressions             | PASS    | 59 passed, 1 intentionally skipped private-input case                                                                   |
| Layout repeatability            | PASS    | 40 repeated tests: 10 runs of the four import/layout cases; no retries needed                                           |
| Swift quality                   | PASS    | Strict swift-format lint; release compilation treats warnings as errors                                                 |
| Python fixture tooling          | PASS    | Ruff 0.11.13 lint and format checks                                                                                     |
| Shell scripts                   | PASS    | zsh syntax checks; these scripts do not have a separate shell formatter                                                 |
| Native data/quit checks         | PASS    | Atomic persistence, storage access isolation, failed-save/timeout recovery                                              |
| Actual WebKit smoke             | PASS    | Native report creation, document append, save and quit; `.build/release-evidence/native-smoke.json`                     |
| Recorded native UI acceptance   | BLOCKED | Computer Use still reports pending Accessibility and Screen Recording permissions; no video was produced                |
| Repository push and hosted CI   | BLOCKED | No remote configured; waiting for the user's repository destination                                                     |
| Second-Mac installation/sharing | NOT RUN | No second device available to this session; waiting for tester/device details                                           |
| Developer ID / notarization     | BLOCKED | `security find-identity -v -p codesigning` found zero valid identities                                                  |

The native smoke is programmatic app integration, not a recording of Finder, menus or sharing dialogs. Browser tests exercise the shared engine and mock the native bridge where documented. Do not substitute either for native UI acceptance.

## One recorded native run (about 8 minutes)

Use fictional inputs from `brief-test-kit.zip`. Close unrelated documents and notifications before recording; keep private desktop content out of frame. Record the actual Mac app and the actions below, not a browser recreation.

1. Show the macOS version, chip architecture and Brief build version. Record the ZIP's SHA-256 hash alongside the run.
2. Open Brief from Applications. Confirm the menu bar icon appears and the full capture panel fits the screen.
3. Open Finder; select and drag a supported file into capture. Confirm the panel stays open. Click a different app and confirm capture closes. Reopen it and confirm the file is retained.
4. Add fictional notes and build the report. Verify title, sections, evidence and expected metrics; no raw JSON blob should replace a recognized report.
5. With that report selected in **Add to**, import a DOCX or selectable-text PDF. Complete extraction review. Confirm new cards appear in the same report and earlier cards remain.
6. Start another import and click outside its review dialog. Confirm no partial cards were added and the capture can be retried.
7. Edit a long bilingual title, resize the report window and verify no clipped text. Open settings/editor dialogs and dismiss them by clicking outside.
8. Review a chart and the accessible values/table. Prepare a card image and save it with the native save panel. Cancel one save attempt and confirm recovery.
9. Open native sharing, choose an available Mail/Messages destination and inspect the prepared draft/attachment. Record the app and OS versions. Do not send to someone without an explicitly agreed test recipient.
10. Quit using the visible Quit button. Reopen Brief and confirm saved cards and destination persist.

Mark each step PASS/FAIL/BLOCKED with a timestamp in the recording, actual result and issue reference. A failed step must be fixed and rerun before acceptance. Do not edit a failed recording to imply that it passed.

## Independent second-Mac run

Use a Mac other than the development machine and the exact ZIP that will be submitted. The current build is Apple Silicon and requires macOS 13+. Do not rebuild on the recipient's machine to stand in for testing the download.

1. Download from the intended handoff location; verify SHA-256 against the sender's value.
2. Unzip and move Brief.app to Applications. Open it normally. Record any Gatekeeper or company-policy block verbatim; do not disable security controls to manufacture a pass. The current app is ad-hoc signed and may be blocked.
3. Repeat the native run's capture, append, cancellation, layout and restart checks with fictional inputs.
4. Test available Mail/Messages handoff. Inspect whether the attachment/card is present and readable; a chooser opening alone is insufficient. If no account is configured, mark that destination BLOCKED, not PASS.
5. Separately record download/install, launch, save/relaunch, Mail and Messages outcomes. Keep source-app handoff separate from recipient rendering/delivery; the latter needs an agreed test recipient.

## Run record to complete

| Field                              | Value   |
| ---------------------------------- | ------- |
| Tester / date                      | Pending |
| Mac model, chip, macOS             | Pending |
| App version / source commit        | Pending |
| Download URL / ZIP SHA-256         | Pending |
| Installation result                | NOT RUN |
| Native steps 1–10 / recording path | NOT RUN |
| Mail version / actual result       | NOT RUN |
| Messages version / actual result   | NOT RUN |
| Remaining defects                  | Pending |

## Hosted CI

After a repository destination is supplied, push the reviewed source commit and inspect that exact commit's Actions run. Both `macos` and `verify` jobs must pass. Preserve the run URL and commit SHA here. A workflow file existing locally, or a local successful test run, is not a passing hosted CI run.

CI URL: pending. Commit SHA: pending. Both job results: pending.
