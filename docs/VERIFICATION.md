# Verification

## Current 0.5 verification - September 28, 2026

76 unit/server tests and 67 browser tests passed. One optional external-fixture browser case was skipped. JavaScript lint/format, strict Swift formatting, native storage/quit tests, release compilation and ad-hoc signature verification passed. Two isolated native WebKit launches verified creation, append, persistence and recovery of the prior library.

The following records are historical and do not replace the current counts.

## Submission hardening — 2026-09-27

The title now observes its actual container width, includes border height and refits after fonts are ready. The previous immediate test assertion now waits for the observable layout result; its deadline was not increased. A new regression checks container-only width changes and repeated viewport changes. All four import/layout tests passed ten consecutive runs (40 tests), followed by a clean full browser run: 59 passed, one private-file test skipped, no failures or retries. All 74 unit/server tests passed.

ESLint now covers maintained JS/MJS in the server, tooling, tests and configuration as well as the frontend. Strict Swift formatting, Python Ruff lint/format and shell syntax checks passed and are wired into CI. The Mac release build passes with compiler warnings treated as errors. Version metadata is derived from package.json. Native persistence/quit checks and actual WebKit import/append/save/quit smoke checks passed again.

The [release acceptance record](testing/RELEASE-ACCEPTANCE.md) tracks the missing evidence explicitly: native recording is blocked by pending Computer Use permissions, hosted CI awaits a repository destination, and second-Mac installation/sharing has not been performed. No valid Developer ID signing identity is installed. None of these outcomes is implied by the local automated results.

## Commands

```sh
node scripts/check.mjs
scripts/test-macos.sh
BRIEF_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' pnpm test:browser
scripts/build-macos.sh
codesign --verify --deep --strict .build/Brief.app
```

`check.mjs` runs lint, formatting and all `tests/*.test.mjs` files. Browser tests exercise the shared engine. Native checks run with Command Line Tools; the XCTest target additionally requires a full Xcode environment here.

## Verified after repository cleanup

After the macOS-first repository cleanup, 74 unit/server tests and 54 browser tests passed, with one private-input test intentionally skipped. Lint and formatting passed. Coverage includes imports, cancellation, evidence preservation, report validation, charts, layouts, output payloads, persistence failures, risk review and browser accessibility scans. Browser native-host tests use a mock bridge.

Native checks cover atomic persistence, rejected-write preservation, authenticated loopback assets/storage, cross-origin and traversal rejection. Quit checks cover successful saves, timeout recovery, cancellation/retry, repeated requests and late callbacks. A real bundled WKWebView smoke run generated five cards, saved the report, recovered data after relaunch and exited normally through the save/quit path.

The screen-bounded capture panel and explicit dismissal changes compile and pass signature verification. Compilation does not establish real Finder drag/drop or VoiceOver behavior.

The cleaned native build also passed a real WKWebView import/save/quit smoke run using temporary isolated data and the direct `src/app.js` entry point. Native persistence and quit checks passed again. CI now includes a Mac build/check job in addition to the shared-engine checks; the hosted CI job itself has not been run in this session.

## Native append and dialog dismissal follow-up

The menu bar report list now updates on repository changes, successful capture retains the destination report, and an existing destination uses an explicit Add to report action. Native imports read the latest report after document review to preserve intervening edits. Outside clicks close webpage dialogs through their existing cancellation handlers.

74 unit/server tests passed. The full browser run passed 57 cases and skipped one private case; one mobile title-height assertion failed, then all three report-file import tests passed on targeted rerun (58 browser cases covered across runs). Four new cases verify report-title synchronization, native Word/PDF append into one report with reload, outside-click cancellation/retry, and settings/editor dismissal without applying unsaved card edits. The actual native WKWebView smoke run created one report, appended a TXT file for six total cards, retained its destination, saved and quit successfully. Native Finder interaction remains a manual acceptance check.

## Required manual acceptance

Capture dismissal now exempts Finder and capture/file-picker controls, dismisses on another app's activation or outside click, and dismisses when the report workspace is clicked. Event observers are removed when capture closes. The release build and signature verification passed; real cross-app clicking/dragging still requires manual acceptance because Computer Use permissions are unavailable.

- Finder drag/drop while switching apps; capture panel remains visible and all controls fit the screen.
- Keyboard and VoiceOver flow through native capture and the report workspace.
- Real save/print dialogs, cancellation, PDF layout and Mail/Messages attachment rendering.
- Opening a downloaded signed/notarized package on another Mac before broad distribution.
- User testing of time to a correct, shareable report before claiming productivity gains.

Computer Use permissions were unavailable during development, so native UI interaction was not automatically verified. No actual email/message/invitation was sent. Jev provider accuracy has not been evaluated live, and Jev is disabled in the Mac shell. No public cloud deployment is verified.

The synthetic [manual test plan](testing/MANUAL-TEST-PLAN.zh-CN.md) separates expected outcomes from performed checks. Generate fixtures with the scripts in `scripts/testing/`; transient screenshots and build/test outputs are deliberately excluded from source. Historical detailed verification notes are preserved in the private cleanup archive under `.build/recovery/`.
