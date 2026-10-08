# Interview handoff

Use the packaged `START-HERE.md` as the reviewer’s entry point. The current submission is `.build/Brief-Submission-0.5.0.zip`. It includes the current app, full source, a static browser build, synthetic demo/test material, the presentation and verification evidence.

## English presentation

The deck has 12 slides. Open `presentation/index.html` in the submission bundle, or use `presentation/Brief-15-minute.pdf`. Speaker notes and the 15-minute schedule are in `presentation/SPEAKER-NOTES.md`. The talk includes a 2:30 fictional-data demo. The browser deck supports arrows, full screen, notes and a rehearsal timer. Its JSON content and HTML template are included in source.

The deck is HTML/PDF, not a PowerPoint file. The PowerPoint authoring runtime was unavailable in this environment. This does not affect the product’s separate PPTX export feature. A presentation format was not specified by the assessment.

Rehearse once and adjust the script to your speaking pace and your own account of the work. A planned 15-minute duration is not a measured rehearsal.

## Demo

Use `demo-data/README.md`. Lead with native capture if the app runs on the presentation Mac. Use the browser workspace as a fallback, and label it accurately. The screenshots show the shared workspace with fictional inputs. No native video recording is included.

Do not send a real message or calendar invitation during the demo. Prepare the copy/export or native sharing picker and cancel before sending.

## Requirements and limits

Read [the requirements audit](SUBMISSION-REQUIREMENTS.md). The core POC is implemented. Manual accessibility evidence, target-client rendering and the candidate’s rehearsal remain important. The deadline needs confirmation against the invitation date.

The Mac app requires macOS 13+ on Apple Silicon and is ad-hoc signed, not notarized. Source and browser/PDF fallbacks are supplied. Do not disable operating-system security controls to demonstrate a pass.

## Submission

Use the included `SUBMISSION-EMAIL.txt` as an editable draft. No email is sent automatically. The ZIP can be attached if the recipient’s mail limit permits, or uploaded to an approved shared location. No public link or hosted CI run is claimed. A local filesystem link or localhost URL is not a recipient-accessible delivery link.
