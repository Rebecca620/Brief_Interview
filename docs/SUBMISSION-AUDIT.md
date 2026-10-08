# Assessment audit: Project Reporting Builder

Audit date: September 28, 2026. Product: Brief 0.5.0. Scope: the assessment supplied by the candidate, not an App Store release checklist.

**Verdict:** the functional POC and engineering deliverables address the assessment. An English presentation and timed script are included. Full accessibility compliance is not yet established, and the five-day deadline cannot be verified without the invitation date. Do not describe every requirement as unconditionally passed.

| Assessment item                              | Status               | Evidence and qualification                                                                                                                                                                |
| -------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POC Web or macOS tool                        | Met                  | Runnable Apple Silicon macOS app; responsive shared browser workspace and full source. macOS 13+; app is ad-hoc signed.                                                                   |
| Lightweight, responsive project reporting    | Met for POC scope    | Local workflow, no required cloud account or app runtime Node server; 320/375/768-pixel reflow tests. No enterprise-scale performance claim.                                              |
| Raw text ingestion                           | Met                  | Pasted notes, TXT and Markdown; explicit sections, preserved source, direct editing.                                                                                                      |
| Metric data ingestion                        | Met                  | Metric CSV, JSON/JSONL review, exact values, configurable analysis, visual cards.                                                                                                         |
| Image assets                                 | Met                  | PNG/JPEG/WebP, source preservation, descriptions and image export. 2 MB per input file.                                                                                                   |
| Modular Snippet Cards                        | Met                  | Text, metric, decision and image cards; reordering, sections, single-card sharing and report export.                                                                                      |
| Visually polished cards and styled UI        | Implemented          | Coherent workspace, light/dark themes, document-first editor, previews. Quality is ultimately a reviewer judgment.                                                                        |
| Accessibility-compliant                      | Partially evidenced  | Semantic UI, focus/keyboard tests, image-description gating and axe checks pass. Manual VoiceOver, zoom and target-client checks remain. No WCAG certification claim.                     |
| Instantly copy or export for email/messaging | Met at POC level     | HTML/plain-text clipboard, HTML/PNG/PDF/PPTX, native sharing handoff. Destination rendering/actual delivery not fully verified; no message was sent.                                      |
| English deck with 15-minute speech           | Prepared             | 12-slide offline HTML deck, PDF copy and approximately 1,559-word script; schedule totals 15:00 including a 2:30 demo. Candidate must rehearse; actual speaking duration is not measured. |
| Engineering excellence                       | Demonstrated locally | Architecture/docs, configuration, lockfile, coding conventions, automated tests, release build, CI configuration, storage recovery and input validation. Hosted CI has not run.           |
| Cloud technology choices (good to have)      | Addressed            | Static HTTPS deployment plan and enterprise extension tradeoffs in CLOUD.md. No public deployment or cloud sync.                                                                          |
| Surprise and delight (good to have)          | Implemented          | Native capture, recoverable drafts, Trash/undo, conservative risk review, PowerPoint export and reviewed meeting files.                                                                   |
| Five-day timeline                            | Not verifiable       | The invitation/start date was not provided. Check the deadline reminder.                                                                                                                  |
| Email deliverables and links                 | Package prepared     | Submission ZIP, source and offline artifacts included; editable email draft included. Nothing has been emailed or publicly uploaded.                                                      |

## Current verification

- 76 unit/server tests passed, including asynchronous save drain and recovery.
- 67 browser tests passed; one optional case needing an external local fixture was intentionally skipped.
- Native storage/quit checks and two isolated WebKit smoke launches passed.
- Strict Swift formatting, warning-free release build, JavaScript lint/format, shell syntax and ad-hoc signature verification passed.
- Presentation verification checks page count, text, navigation, image loading and layout; rendered slides are inspected before packaging.

The package includes the original test output for these claims. The app smoke tests use isolated fictional data. Browser tests of native handoff mock that boundary; they are not real Mail/Messages acceptance evidence.

## Before sending

1. Rehearse the English deck with its timer. Replace first-person wording where needed so it accurately describes your own work and decisions.
2. Complete a manual VoiceOver and keyboard walkthrough if you want to claim accessibility compliance. Record failures rather than assuming automated coverage is sufficient.
3. Try the exact app ZIP on the reviewer’s target Mac if possible. The Apple Silicon development build may be blocked by distribution policy. The browser/source/PDF paths are included as alternatives.
4. Confirm the deadline and attach the submission ZIP, or upload it to an approved location and insert its accessible link. Local filesystem and localhost links will not work for the recipient.

Notarization, a native video recording, hosted CI and second-Mac testing are useful release evidence. The stated assignment does not explicitly require them, so they are not treated as new mandatory assessment gates.
