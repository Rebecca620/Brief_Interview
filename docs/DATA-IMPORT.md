# JSON and JSONL reporting

Attach a `.json`, `.jsonl`, or `.ndjson` file, or use either fictional-data example on the intake page. Select **Numeric data** or **Evaluation results**, choose the record collection and fields, click **Find patterns**, and select the observations to add. Then create the update as usual. Changing analysis settings clears stale findings.

- **Numeric data:** coverage, mean/median/range, optional group means, first-to-last daily change, and unusual values using 1.5×IQR fences when at least eight numeric observations exist. Daily endpoints are not described as a sustained trend.
- **Evaluation results:** score coverage/distribution, optional group means, and a pass rate only when you explicitly choose a threshold and direction. Missing scores are excluded and counted. Scores are not automatically treated as accuracy. Each group uses its own available records; this is not a paired leaderboard.
- **Eval Studio compress:** detects record objects containing `type: "compress"` and a `dialog` array. Evaluation mode extracts candidate records from eligible assistant turns, skipping `loss: false` before reading evaluations. Select an actual candidate metric field such as `/candidate/metrics/human/score`. Ground-truth turn metrics are not included. Original candidate order determines the `x-y-z` evidence coordinate; `turn_index` must match its actual zero-based dialog position. The file hash freezes that coordinate context.

For example, import this JSONL and select `/score`, evaluation mode, and `score ≥ 3`:

```jsonl
{"model":"A","score":3}
{"model":"A","score":1}
{"model":"B","score":null}
```

The result is **1/2 passing (50%)**, with one unscored row excluded. It is not 1/3, and no rubric is inferred from the numbers.

## Supported shapes and limits

JSON supports arrays of objects, scalar arrays (exposed as `/value`), a single object, and arrays inside wrapper objects. JSONL supports one object or scalar per non-empty line. Mixed object/scalar collections are rejected. Invalid JSONL fails the whole import with a physical line number; records are not silently skipped.

Files are limited to 2 MB, collections to 10,000 rows, collection discovery to 20 candidates, and scalar field discovery to 200 fields/12 levels. Arbitrary nested lists are not joined or flattened. The dedicated compress adapter is the exception and retains record/turn/candidate context. Review field samples to choose the intended metric and grouping. Numeric strings require opt-in; booleans, blanks, nulls, unsafe integers, and non-finite numbers are not treated as numeric observations. Date aggregation accepts valid ISO dates or timestamps with an explicit timezone, grouped in UTC.

The report keeps the original data once per source, plus the input SHA-256 hash and analysis configuration. Existing local library storage limits still apply; large imports can exceed the library budget even when individual files are under 2 MB. Export a library backup to preserve source data. Shared report HTML/text includes accepted card content, not the underlying dataset.

## Scope

These are reproducible descriptive observations, not unrestricted AI discovery, causal explanations, statistical significance tests or rubric-based judging. Choose one score dimension/owner per import. Categorical pass labels, free-text remark clustering, arbitrary joins, and Lark publishing are not implemented. A future cloud connector should consume the same accepted findings through a server-side adapter; a browser must not execute the Lark CLI or embed its credentials.

Design references reviewed locally: Eval Studio `skills/statistic-copilot/`, `skills/md-report-skill/recipes/data-analysis/`, and `docs/standards/data-contracts.md`. Its viewer confirmed candidate metric layouts; task-specific score scales were deliberately left configurable.

## Visual reporting and side-by-side comparison

JSON findings now include native HTML data tables, bar charts for group means and threshold outcomes, and daily line charts for up to 40 dates. Each graph and its exact-value table share one structured summary. Chart PNGs are generated locally for report export; tables remain available to keyboard and screen-reader users. Larger daily series retain their endpoint summary without a chart. Group charts show up to eight groups with omitted coverage disclosed.

Select **Side-by-side comparison** to generate a paired score-state transition graph:

1. Choose the score field and use **Group by** for the model field.
2. Choose a unique case/turn **Pair key**. For Eval Studio compress files, `/pair_key` is generated from the record ordinal and real turn index.
3. Enter the exact baseline and candidate model values and the numeric Pass and Fail values from your rubric. For the side-by-side recipe's 1/2/3 scale, enter Pass **3**, Fail **1**; score 2 is then excluded.
4. Review the paired sample count, exclusions, pass-rate change, and four transition counts before adding the card.

Both models must have a mapped score on the same key. Duplicate model/key rows are rejected, not averaged. Missing models, missing keys, other scores, and models outside the selected pair are disclosed separately. No significance or causal claims are generated. This adapts the side-by-side recipe's count/denominator/chart conventions, not its complete taxonomy, case-judging or Lark-publishing pipeline.

## Arrange material before creating the report

Use **Place this file in** to assign all its cards to Progress, Needs a decision, Needs discussion, or Next steps. Expand **Review & arrange** to exclude individual cards or choose different sections. Pasted notes have their own destination selector; explicit section labels still work. The right-hand preview now shows your actual staged content as you work. After creation, every card has a section dropdown alongside Edit.

HTML import extracts text and rectangular tables into Brief's own cards. It never executes imported scripts or mounts the source page. Tables support up to 200 data rows and 12 columns; merged cells are rejected. Arbitrary interactive HTML/SVG graphs are not embedded. Import a PNG/JPG/WebP preview and add a hosted HTTP(S) URL using **Edit → Related report / interactive chart URL**. Readers open the interactive original separately. Word and PDF parsing are not supported.

## Slides and meetings

Under **Share update** or **Share card**, choose:

- **Put cards into slides:** select cards and download `.pptx`. Text and data tables are editable; charts/images are embedded raster images. Short takeaways share the chart slide, while long content continues onto additional slides. Exact chart data is provided on a following table slide. Table cells may continue across rows/pages; table headings above 80 characters require shortening. Speaker notes contain the selected card's source/method, not the complete raw dataset. Export uses a pinned, local PptxGenJS bundle and works without a cloud account or CDN. See [PptxGenJS browser export](https://gitbrent.github.io/PptxGenJS/docs/usage-saving/).
- **Create meeting draft:** review the discussion/decision agenda, enter start/end and location, and download `.ics`. Times use the device timezone and serialize to UTC. Open the file in your calendar app, add attendees, then send there. Brief does not create an online meeting link, schedule a server-side event, or send invitations. The calendar serialization follows the text escaping and UTF-8 line folding in [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).

## Case-report quick import and simpler field choices

A JSON object with `detection`, `case_review`, and `retry_root_cause_analysis` is recognized as a case-report artifact when its flag and locator fields match the supported schema. It opens directly as suggested cards, with no metric mapping required:

- Source-attributed case observation → Needs discussion.
- Retry correctness chart, calculated from boolean `trial_assessments[].is_correct` → Progress.
- Unavailable evidence, conflicting totals, source uncertainty and unverified causal claims → Needs discussion.
- Source recommendation titles/rationales → Next steps.

The importer does not execute embedded prompt appendices, call tools described in the file, or endorse the source's diagnosis. A small retry set is not presented as an independently validated benchmark. If original token scores are unavailable, zero counters in that block do not become performance measurements. Meaningful zero outcomes, such as zero incorrect retries, remain in the outcome chart. Conflicting summary totals are disclosed; individual boolean assessments determine the chart.

Each suggested card can be deselected or reassigned before import. **Advanced analysis → Choose fields manually** retains access to the generic workflow. Recognition is deliberately narrow; unfamiliar JSON schemas still use field mapping rather than an invented interpretation.

In manual mode, collection/field labels are readable, likely outcome collections are prioritized, and technical identifiers, constant fields and all-zero measures are hidden from the default metric list. **Show technical and constant fields (advanced)** reveals them with explanations. Fields whose ancestor blocks are consistently marked unavailable are disabled. Measured zero values remain included when a metric is selected. Group choices prioritize short categorical values rather than conversation text or numeric counters.

## Collections without usable numeric fields

The review no longer displays an empty numeric/score selector. Collections with no recommended measures default to Record cards; collections with no available numeric values also disable numeric analysis modes. Technical and constant numbers remain available through the advanced checkbox. Record cards preserve field labels and source values as editable content under Needs discussion, with no inferred scores or conclusions. Review and select records before adding them. This path supports up to 100 records per collection; larger inputs require a smaller collection or split file. Numeric collections retain chart and comparison controls.

## PDF and Word uploads

PDF.js 5.6.205 extracts PDF text in a local worker; JSZip 3.10.1 reads bounded Word `.docx` document-body XML. The upload chooser accepts both formats. A document review dialog discloses extraction limitations, allows selection/exclusion, and sets the initial report section. Cards can be edited and moved afterward.

PDF: up to 60 pages, 2 MB file size, 100,000 extracted characters. Pages with no text are explicitly listed; all-textless PDFs fail with OCR guidance. Password-protected files require an unlocked copy. Images, graphs, visual layout and reliable multi-column/table reconstruction are not extracted. No PDF scripting/viewer is enabled.

Word: `.docx` only; older `.doc` requires conversion. Body paragraphs and table-cell text are extracted; tracked deletions are excluded and insertions included. Tables become text, not inferred metrics or guaranteed rectangular tables. Headers, footers, comments and embedded images are excluded. Grouped paragraphs become up to 100 editable cards. ZIP directory sizes are checked before decompression (16 MB declared expansion), XML is bounded and entity declarations rejected. External relationships are not fetched. Backups preserve extracted text, not the source binary file.
