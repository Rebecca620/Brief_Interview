# Brief for macOS — menu bar POC

Brief now has a native capture surface in the macOS menu bar. Collect project material without first navigating a website, then review the assembled report in a larger workspace. The report engine remains shared with the web app.

## Try the app

Open `.build/Brief.app`. Look for the document icon in the menu bar; Brief deliberately has no Dock icon. Click it, or drag files/text onto it. The panel also offers **Choose files…**, **Paste**, and a fictional **Try an example**.

1. Collect notes and supported files. Pick **New report** or an existing report.
2. Optionally name the report and choose Weekly update or Project retrospective.
3. Choose **Build report draft**. Simple material creates cards automatically. Ambiguous datasets and extracted PDF/Word text open a review dialog in the report workspace.
4. Review headings, evidence, charts and action cards. Existing editing, risk review and exports remain available.
5. Use visual sharing to prepare card images and open the macOS sharing picker. Available destinations depend on installed apps. You choose the recipient and send in the destination app. Export uses the native save panel; PDF uses the native print dialog and its PDF menu.

After a successful capture, **Add to** retains that report. Collect more files and choose **Add to report** to append them. The report list refreshes when reports are edited, created, restored or removed. PDF/Word still require **Add selected cards** in the extraction review; while waiting, **Review in report window…** brings the review forward. Clicking outside a webpage dialog cancels that review without committing its cards and keeps the native capture for retry. Clicking inside a dialog does not dismiss it.

Closing the report window keeps Brief in the menu bar. Use the capture panel’s visible **Quit** button or Command-Q while Brief is active. Command-N opens New Report; Command-Comma opens Settings, and Command-E opens Export while Brief is active; it is not a system-wide shortcut. Quit flushes pending report edits while the normal app event loop remains active. If the editor does not confirm within five seconds, a visible prompt offers **Keep working** or **Quit anyway**; only the latter can discard unsaved edits.

The capture panel is capped at 600 points and shrinks to fit the menu bar display's available height. Its header and build action stay visible while the input area scrolls, including additional files and long error messages.

The capture panel stays open while you use Finder (including the Finder desktop), so you can collect files across multiple drags. Clicking another app or the report workspace dismisses it. Capture controls and the native file picker remain usable. You can also close it with the header's **×** button or Brief's menu bar icon. Dismissal preserves your capture and does not quit Brief. Mouse/activation observers are installed only while the panel is visible; no keystrokes are monitored or clicks recorded.

Dropping material collects it; **Build report draft** starts processing. This explicit step lets users combine multiple sources before generating, without producing a separate report for each file. Automatic background generation is not included.

## Supported input and automatic decisions

- TXT/Markdown and pasted text: retain wording, split paragraphs and honor explicit section labels.
- CSV: the existing `title,value,target` metric format.
- JSON/JSONL/NDJSON: recognized case artifacts, text records, or one unambiguous recommended numeric field can be drafted automatically. Multiple collections, uncertain fields, numeric strings and evaluation score mapping require review. Zero remains a valid measurement.
- Report JSON backups: preview and restore a separate copy, rather than flattening the report into raw text. Open a backup alone before appending other material.
- PDF and DOCX: extract supported text, then review section placement. No OCR or legacy `.doc` support.
- PNG/JPEG/WebP and supported HTML tables: reuse the existing import pipeline. Images need a useful description before formatted sharing.

Limits remain 20 files per capture, 2 MB per file, 2 MB of notes, and a 256 MiB serialized-memory library budget (approximately 128 MiB of JSON text). Large enterprise datasets are outside this POC. Cancellation retains captured material and commits no partial report cards. Parsing is deterministic; the app does not infer business meaning or claim universal document understanding.

## Build and check

Requires macOS 13+, Swift Command Line Tools and Node.js 22+ for bundling. Recipients running the built app do not need Node or a running development server.

```sh
scripts/build-macos.sh
open .build/Brief.app
scripts/test-macos.sh
node scripts/check.mjs
```

The build uses the host architecture. The current artifact was built for Apple Silicon. `swift test --package-path macos --scratch-path .build/macos-swift` runs the XCTest target where full Xcode provides XCTest; this machine has Command Line Tools only, so `scripts/test-macos.sh` runs persistence and native HTTP integration assertions without XCTest.

An app-owned WebKit smoke mode creates fictional report cards and writes a result file, without sharing or reading the clipboard:

```sh
BRIEF_SMOKE_OUTPUT="$PWD/.build/macos-smoke-result.json" \
  .build/Brief.app/Contents/MacOS/BriefMac \
  --data-dir "$PWD/.build/macos-smoke-data" --smoke-test
```

Run again with the same data directory to check report recovery across launches. All smoke data is isolated from normal user reports.

## Architecture and persistence

```text
SwiftUI capture panel / AppKit menu bar and drop target
    → capture payload (notes, file bytes, report destination)
    → WKWebView bridge
    → shared JS import → analysis → report DTO → renderer
    → native atomic file storage / save / share / print
```

- `macos/Sources/BriefMac/CaptureModel.swift` owns captured material and local draft recovery; `CaptureView.swift` owns panel presentation.
- `ReportWindow.swift` owns the WebKit boundary and native file/share/print dialogs.
- `AssetServer.swift` serves bundled assets on an ephemeral loopback-only port. A per-launch session cookie protects assets, and storage also requires a bridge token and same-origin requests. Static paths are allowlisted; there is no general filesystem endpoint.
- `LocalStore.swift` owns atomic manifest commits, validated content-addressed object keys and conflict checks.
- `src/features/native-capture/` orchestrates imports and conservative automatic analysis. Shared domain code remains independent of AppKit.
- `src/platform/desktop.js` selects native persistence/export adapters. Browser reports use IndexedDB with transactional conflict checks; legacy localStorage is migrated on first successful save.

Normal data lives in `~/Library/Application Support/BriefPOC/`: `library.json`, content-addressed report and attachment records under `Objects/`, `capture.json`, and `appearance.txt`. A legacy `reports.json` is preserved during migration. Native reports are separate from browser-local reports; use a report backup to transfer existing work. Capture files are copied into the local draft, so the original files are not modified. Files prepared for sharing remain in `ShareCache/`; this POC does not yet expire that cache automatically. Local files are not encrypted by Brief.

Report edits use asynchronous, debounced saves; capture encoding and file reads run off the main actor; quitting explicitly flushes pending report edits. Failed persistence produces an error and keeps capture material. A corrupt saved library is protected from overwrite. The app does not watch folders or continuously read the clipboard.

## POC boundaries and acceptance

The capture panel is native SwiftUI; the full report editor is the shared web interface in WebKit. This is not a complete native rewrite. Jev is disabled in this shell because the optional Node provider endpoint is not bundled; no API keys are embedded and no report content is sent to a model automatically.

The app is ad-hoc signed for local testing, not Developer ID signed or notarized. Download-and-open distribution to other Macs requires a proper signing/notarization release workflow. An Intel or universal build must also be produced and tested if required. The existing web build remains the link-based demonstration option; native packaging does not deploy a public website or add cloud sync.

Before calling this release-ready, manually verify menu bar drag/drop, VoiceOver and keyboard focus, small-screen panel sizing, save cancellation, PDF output, and real Mail/Messages attachment handoff. A sharing picker handoff is not confirmation of delivery. Automated native UI inspection was unavailable in this session because Computer Use permissions were not granted.

For a hiring demonstration, use the fictional example to show capture → report → inspect evidence → prepare a visual share. Explain the deliberate split between quick collection and a reviewable report. Measure time to a correct, shareable update against the previous web workflow before claiming productivity gains.
