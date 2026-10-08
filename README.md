# Brief for macOS

## Interview review

Brief is a macOS menu bar tool for collecting project material and turning it into editable, shareable reports. The native capture panel uses SwiftUI/AppKit; the report editor uses a shared HTML/CSS/JavaScript workspace in WKWebView.

- **[Download the Mac app](https://github.com/Rebecca620/Brief_Interview/raw/refs/heads/main/downloads/Brief-0.5.0-macOS.zip)** — version 0.5.0, Apple Silicon, macOS 13 or later. Extract the ZIP, open `Brief.app`, then click its document icon in the menu bar. The packaged app needs no Node.js installation or separate server.
- **[Try the sample inputs](demo-data/README.md)** · **[Architecture](docs/ARCHITECTURE.md)** · **[Accessibility](docs/ACCESSIBILITY.md)**

The app is an ad-hoc signed development build, not notarized. If your Mac or organization blocks it, use the browser development instructions below to run the shared workspace. The downloadable binary is Apple Silicon only.

This repository contains the macOS app, source, sample inputs and verification evidence. Interview presentations are shared separately.

---

A menu bar tool for turning project notes, metrics and documents into structured, shareable report cards. Collect material while working in other apps, build a draft, review its evidence, then export or hand it to a sharing app.

## Run the Mac app

Open `.build/Brief.app` and click the document icon in the menu bar. Choose **Try an example** or drop files into the capture panel, then **Build report draft**. The panel stays open while switching to Finder; **×** closes capture and **Quit** exits Brief.

Build from source on macOS 13+ with Swift Command Line Tools and Node.js 22+:

```sh
npm run build:macos
open .build/Brief.app
```

The built app needs no Node server. It uses SwiftUI/AppKit for capture and native dialogs, with the shared report workspace in WKWebView. The current Apple Silicon build is ad-hoc signed, not notarized for public distribution. See [native setup and limitations](docs/MACOS-POC.md).

## What it supports

- Inputs: pasted text, TXT/Markdown, CSV metrics, JSON/JSONL/NDJSON, selectable-text PDF, DOCX, supported HTML tables, PNG/JPEG/WebP.
- Workspace: searchable report library, recoverable Trash, document-first editing, undo/redo and recoverable inspector drafts.
- Reports: editable cards, sections, evidence, charts, weekly-update and retrospective layouts, owners and next steps.
- Review: conservative automatic data analysis, explicit review for ambiguous inputs, and local rule-based project risk suggestions.
- Outputs: formatted clipboard, HTML, PNG, native print/Save as PDF, PPTX, and reviewed calendar-event files. Available sharing destinations depend on installed apps; users choose recipients and send there.

Files are limited to 2 MB each, 20 per capture; the report library has a 256 MiB serialized-memory budget. Attachments are stored separately from report records. Browser disk quota can impose a lower limit. There is no OCR, legacy `.doc` import, shared cloud database or automatic message sending. Numbers do not establish business meaning. Review extracted content and proposed findings before sharing.

Reports and capture are stored in `~/Library/Application Support/BriefPOC/`, separate from this repository. Back up important reports through the report workspace. The optional Jev integration is retained for browser development and is disabled in the Mac shell.

See [the 0.5 redesign notes](docs/REDESIGN.md) for changes, checks and remaining limits.

## Code map

| Location                     | Responsibility                                                        |
| ---------------------------- | --------------------------------------------------------------------- |
| `macos/`                     | Native menu bar, capture, WebKit bridge, local storage and OS dialogs |
| `src/features/`              | Import, report editing, analysis, sharing and other feature UI        |
| `src/domain/`                | Report contracts, validation, calculations and rendering rules        |
| `src/data/`, `src/platform/` | Repository and native/browser adapters                                |
| `src/shared/`                | Shared UI controls, icons and styling                                 |
| `tests/`                     | Unit, integration and browser regression tests                        |
| `scripts/`                   | Build, verification and synthetic test-kit generation                 |
| `server/`                    | Optional browser-development server and Jev adapter                   |
| `vendor/`                    | Required PDF, ZIP and slide libraries, including licenses             |
| `docs/`                      | Architecture, acceptance, input formats and interview handoff         |

`index.html` and `style.css` are the shared workspace shell. `src/app.js` is its single JavaScript entry point. Feature behavior stays with its owning feature; do not merge unrelated features merely to reduce file count.

## Development checks

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:macos
pnpm exec playwright install chromium
pnpm test:browser
```

Quality gates also cover maintained Swift, Python and shell scripts:

```sh
pnpm lint:swift
pnpm lint:shell
python3 -m venv .build/quality-tools
.build/quality-tools/bin/python -m pip install -r requirements-quality.txt
PATH="$PWD/.build/quality-tools/bin:$PATH" pnpm lint:python
```

CI enforces these checks. `pnpm format:swift` formats maintained Swift; Ruff formats the synthetic Python fixture generator. Vendor and generated files are excluded. Shell checks validate syntax, not a separate formatting standard. The app version comes from `package.json`; release Swift builds reject compiler warnings.

For installed Chrome on macOS, run `BRIEF_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' pnpm test:browser`.

The optional browser development workspace runs with `pnpm start` at `http://127.0.0.1:4174`. `pnpm build` bundles the shared engine into `dist/` for the Mac app or a secondary static website. This does not publish a website.

## Documentation

- [Architecture and maintenance](docs/ARCHITECTURE.md)
- [macOS setup and local persistence](docs/MACOS-POC.md)
- [JSON/data import](docs/DATA-IMPORT.md)
- [Verification and remaining acceptance checks](docs/VERIFICATION.md)
- [Accessibility](docs/ACCESSIBILITY.md)
- [Manual test plan and synthetic fixtures](docs/testing/MANUAL-TEST-PLAN.zh-CN.md)
- [Recorded native and second-Mac acceptance](docs/testing/RELEASE-ACCEPTANCE.md)
- [Interview delivery and demo](docs/INTERVIEW.md)
- [Cloud options](docs/CLOUD.md) · [Optional Jev adapter](docs/JEV.md)

Generated artifacts belong in ignored `dist/` and `.build/`, not source folders. Keep the latest app/test-kit packages only. `.build/recovery/` and `.build/brief-recovery-*/` contain preserved historical material and must not be included in a public release.
