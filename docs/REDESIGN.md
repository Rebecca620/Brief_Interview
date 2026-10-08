# Brief 0.5 — workspace redesign

Implemented against the product review, using the Apple design skill and Emil Kowalski’s `emil-design-eng` guidance. The downloaded skill is project-local under `.build/ui-skills/`; it is not a runtime dependency.

| Before                                                             | After                                                                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Creation and saved reports competed on one screen                  | Dedicated searchable library, creation route and recoverable Trash                             |
| Import controls dominated report editing                           | Document-first canvas with an optional material panel                                          |
| Every wording change required a dialog                             | Direct title/body editing; inspector retains structured fields                                 |
| Escape discarded unfinished inspector text                         | Autosaved inspector drafts restore on reopen and relaunch                                      |
| Destructive changes were hard to reverse                           | Document undo/redo, deletion undo and report restore                                           |
| Long inspector forms hid their main action                         | Sticky action footer, optional fields behind disclosure                                        |
| The example promised a different output than the importer          | Example and pasted notes use the same heading/body pipeline                                    |
| Sharing mixed file formats, clipboard and scheduling               | Focused Share, Export and Meeting entry points, with content previews                          |
| Data imports exposed configuration immediately                     | Suggested summary first; field mapping under Adjust fields & analysis                          |
| Risk review encouraged duplicate discussion cards                  | Update the original owner/deadline, mark reviewed, or explicitly add a risk card               |
| Generic native identity and limited commands                       | Document icon, current report window title, File/Edit/Window menus and sharing anchor          |
| A 4 MB whole-library budget conflicted with accepted images        | Separate report/asset records, asynchronous saves, 256 MiB logical budget and legacy migration |
| Capture file processing and encoding ran on the UI actor           | Background file reads and queued capture persistence                                           |
| Theme, focus and narrow-window behavior lacked consistent coverage | Shared tokens, visible focus, reduced-motion behavior and browser accessibility checks         |

## Persistence and recovery

Native data remains under `~/Library/Application Support/BriefPOC/`. A versioned `library.json` references immutable records in `Objects/`. Browser reports use IndexedDB. The original native `reports.json` or browser localStorage library is preserved during migration. Backups still contain portable, complete reports and attachments.

Saves compare the previous manifest before committing. Conflicts and disk errors retain session edits, show an error, and offer Retry save or Back up reports. Native quit waits for pending saves, including edits made while a prior save is in flight. Startup validates the manifest and its current references before reclaiming unreachable autosave objects. Trash remains part of the library and backups.

## Verification

Verified on this Mac on September 28, 2026: 76 unit tests passed; 67 browser tests passed, with one optional local-fixture test skipped. Native storage/quit checks, two isolated WebKit smoke launches, strict Swift lint, shell syntax, source formatting and ad-hoc signature verification passed. The second smoke launch recovered the first saved report before creating the next.

- JavaScript lint, formatting and unit tests, including asynchronous save drain and retry.
- Browser workflows cover imports, edits, draft recovery, Trash, legacy migration, near-limit attachments, exports, clipboard fallbacks, AI disclosure, native bridge behavior, themes and narrow widths.
- Native tests cover persistence, stale/invalid batch rejection, legacy preservation, authenticated loopback serving and quit recovery.
- Release Swift compilation treats warnings as errors. The app is ad-hoc signed for local use.

## Remaining limits

This is a rebuilt local application, not an App Store release. Distribution signing/notarization, a second-Mac acceptance pass, manual VoiceOver evaluation and destination-specific print/share checks remain release work. Automated accessibility checks do not replace those checks.

Input limits remain 2 MB per file and 20 files per capture. There is no OCR, cloud sync, collaboration or automatic message sending. Browser disk quotas may be lower than the logical library budget. Undo history is session-local and bounded; inspector drafts and Trash persist. Temporary autosave versions can consume additional disk space until the next launch. PowerPoint shows a content preview; final pagination is determined by the exporter, and PDF pagination is reviewed in the system print preview.
