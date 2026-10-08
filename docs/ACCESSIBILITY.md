# Accessibility evidence

The app uses native controls, semantic headings, named dialogs, a route-safe skip link, visible focus, text-based validation, image descriptions, reduced-motion styling, and light/dark themes. Image cards require an asset and a non-blank description for formatted sharing. The content checklist does not certify accessibility compliance.

Automated browser tests run axe-core against the home page, intake, report editor, card-edit dialog, and sharing dialog. Home and report scans include light and dark themes. These scans check actual rendered styles rather than a copied palette alone. Tests also verify the skip link preserves the report route and check horizontal reflow at 320, 375 and 768 CSS pixels.

See [verification](VERIFICATION.md) for the actual run record. Automated scans do not establish WCAG conformance.

Before claiming conformance, complete:

- A full VoiceOver walkthrough: library, intake, editor, mentions, sharing, errors, restore.
- A keyboard-only end-to-end walkthrough, including dialog focus return after save/delete.
- Browser zoom at 200% and 400%, operating-system contrast modes, and target device checks.
- A review of whether each image description communicates the relevant information.
- Pasting into the intended email/messaging clients and reviewing exported HTML with assistive technology.

Manual evidence must record browser, OS/client, steps, result, and date. Do not mark an unperformed check as passing.
