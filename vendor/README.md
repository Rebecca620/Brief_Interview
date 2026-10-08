# Browser PowerPoint exporter

PptxGenJS **4.0.1**, unmodified `dist/pptxgen.bundle.js`, copied from the installed runtime package. Loaded on demand from the same origin; no CDN request or user data upload. Upstream: https://github.com/gitbrent/PptxGenJS/tree/v4.0.1 . The bundle includes JSZip; license notices are retained alongside it. This is a vendored runtime dependency, separate from application code. Update by replacing the pinned upstream bundle, reviewing its licenses, and rerunning slide export/browser tests.

## Document import

Mozilla PDF.js 5.6.205 (`pdf.mjs`, `pdf.worker.mjs`, character maps and standard fonts) and JSZip 3.10.1 (`jszip.min.js`) are unmodified files copied from the installed runtime packages. PDF.js uses Apache-2.0; its license and asset licenses are retained in `pdfjs/`. JSZip's existing MIT notice is retained here. Both load from the same origin only when needed. PDF text is extracted through the PDF.js API without a viewer or scripting layer. Word import reads bounded `word/document.xml`; it does not fetch external relationships or execute macros. Review upstream releases and rerun document import tests when updating.
