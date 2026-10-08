"""Build a self-contained, allowlisted interview submission from the current workspace."""

import hashlib
import json
import plistlib
import re
import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / ".build"
VERSION = json.loads((ROOT / "package.json").read_text())["version"]
NAME = f"Brief-Submission-{VERSION}"
DEST = BUILD / "submission" / NAME
SOURCE = DEST / "source" / "brief"
ARCHIVE = BUILD / f"{NAME}.zip"


def write(relative, text):
    target = DEST / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(
            source,
            target,
            ignore=shutil.ignore_patterns(
                ".DS_Store", ".build", "__pycache__", "*.pyc", ".ruff_cache"
            ),
        )
    else:
        shutil.copy2(source, target)


required = [
    BUILD / f"Brief-{VERSION}-macOS.zip",
    BUILD / "Brief.app/Contents/Info.plist",
    BUILD / "presentation/Brief-15-minute.pdf",
    BUILD / "presentation/index.html",
    BUILD / "submission-evidence/pdf-render/verification.json",
    BUILD / "submission-evidence/source-check.log",
    BUILD / "redesign-final-browser.log",
    BUILD / "brief-test-kit.zip",
]
for file in required:
    if not file.is_file():
        raise SystemExit(f"Missing required artifact: {file.relative_to(ROOT)}")
if plistlib.loads(required[1].read_bytes())["CFBundleShortVersionString"] != VERSION:
    raise SystemExit("App version does not match source version")
subprocess.run(["codesign", "--verify", "--deep", "--strict", str(BUILD / "Brief.app")], check=True)
if "pass 76" not in required[5].read_text():
    raise SystemExit("Expected successful current unit-test evidence")
if "67 passed" not in required[6].read_text():
    raise SystemExit("Expected successful browser evidence")
for relative in ["index.html", "style.css", "sample-metrics.csv"]:
    if digest(ROOT / relative) != digest(BUILD / "Brief.app/Contents/Resources/Web" / relative):
        raise SystemExit(f"App is stale: {relative}")
for folder in ["src", "vendor"]:
    for file in (ROOT / folder).rglob("*"):
        if file.is_file():
            bundled = BUILD / "Brief.app/Contents/Resources/Web" / file.relative_to(ROOT)
            if not bundled.is_file() or digest(file) != digest(bundled):
                raise SystemExit(f"App is stale: {file.relative_to(ROOT)}")

if DEST.exists():
    shutil.rmtree(DEST)
DEST.mkdir(parents=True)
source_items = [
    "src",
    "macos",
    "server",
    "scripts",
    "tests",
    "vendor",
    "docs",
    "public",
    "presentation",
    "demo-data",
    ".github",
    ".gitignore",
    ".prettierignore",
    ".prettierrc.json",
    ".env.example",
    "README.md",
    "package.json",
    "pnpm-lock.yaml",
    "eslint.config.js",
    "playwright.config.js",
    "ruff.toml",
    "requirements-quality.txt",
    "index.html",
    "style.css",
    "sample-metrics.csv",
]
for name in source_items:
    copy(ROOT / name, SOURCE / name)
copy(required[0], DEST / "app/Brief-macOS.zip")
copy(BUILD / "presentation", DEST / "presentation")
copy(ROOT / "demo-data", DEST / "demo-data")
copy(ROOT / "dist", DEST / "web")
copy(ROOT / "docs/SUBMISSION-REQUIREMENTS.md", DEST / "REQUIREMENTS-AUDIT.md")

# Fixtures only: historical test-result claims and desktop metadata are not current evidence.
with zipfile.ZipFile(BUILD / "brief-test-kit.zip") as kit:
    for info in kit.infolist():
        parts = Path(info.filename).parts
        if len(parts) == 3 and parts[1] in {"valid", "invalid", "reference"}:
            file = DEST / "test-kit" / parts[1] / parts[2]
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(kit.read(info))
write(
    "test-kit/README.md",
    """# Synthetic test fixtures

These valid, invalid and reference inputs are fictional. Invalid fixtures deliberately contain malformed data or markup to exercise validation; do not treat them as successful demo inputs. Use ../demo-data for the short presentation.

The maintained manual plan is in ../source/brief/docs/testing/MANUAL-TEST-PLAN.zh-CN.md. That longer plan is in Chinese; the main reviewer guide, assessment audit and presentation are in English. Its expected results are not claims that every manual test has been executed. Current automated evidence is in ../evidence.
""",
)

logs = {
    "source-check.log": BUILD / "submission-evidence/source-check.log",
    "browser-tests.log": BUILD / "redesign-final-browser.log",
    "native-tests.log": BUILD / "redesign-native-tests.log",
    "native-build.log": BUILD / "redesign-build.log",
    "native-smoke.json": BUILD / "redesign-smoke.json",
    "native-smoke-relaunch.json": BUILD / "redesign-smoke-relaunch.json",
    "deck-render.log": BUILD / "submission-evidence/deck-render.log",
    "deck-layout.json": BUILD / "submission-evidence/deck/verification.json",
    "pdf-check.log": BUILD / "submission-evidence/pdf-check.log",
    "pdf-verification.json": BUILD / "submission-evidence/pdf-render/verification.json",
}
for name, file in logs.items():
    write(f"evidence/{name}", file.read_text().replace(str(ROOT), "[workspace]"))
write(
    "evidence/README.md",
    """# Verification evidence

76 unit/server tests passed. 67 browser tests passed, with one optional external-fixture test skipped. App runtime files are byte-checked against source by the packaging script. No runtime code changed during submission preparation.

Native logs cover storage/quit behavior and actual isolated WebKit smoke launches. Browser native-host cases use mocks. Presentation checks cover 12 rendered pages, selectable text, speaker notes, navigation and layout. All final PDF pages were visually inspected; this does not imply a PowerPoint review.

Local absolute workspace paths are replaced with [workspace]. These files record local runs. No hosted CI, native video recording, actual message sending, full VoiceOver acceptance or second-Mac result is claimed.
""",
)
write(
    "web/README.md",
    """# Browser fallback

Serve this directory over localhost; opening index.html directly as a file will not run ES modules and secure-context APIs reliably.

With Python 3 available, open a terminal in this web directory and run:

    python3 -m http.server 4174 --bind 127.0.0.1

Then open http://127.0.0.1:4174. Stop with Control-C. Alternatively, with Node.js 22+ available, run `npm start` from ../source/brief and use the URL printed there. No API key is required for the core workflow.

The localhost URL is for the reviewer's own machine, not a public share link. Browser reports remain in that browser's local storage. This fallback does not reproduce the native menu bar or OS dialogs.
""",
)
write(
    "SUBMISSION-EMAIL.txt",
    """Hello,

Please find attached my Project Reporting Builder assessment, Brief.

The ZIP includes the macOS POC, full source and setup instructions, a browser fallback, a 12-slide English presentation with a timed 15-minute script, fictional demo inputs, and test evidence. Please start with START-HERE.md.

The current app build requires Apple Silicon and macOS 13 or later and is ad-hoc signed. The browser version and presentation PDF provide alternatives if installation policy prevents running it.

The requirements audit identifies the remaining manual accessibility and destination-client checks. The cloud section describes a proposed deployment path; no hosted service is claimed.

Thank you for reviewing my work. I look forward to discussing the design and engineering decisions.

Best regards,
[Your name]

--- Candidate note: attach Brief-Submission-0.5.0.zip, or replace the attachment wording with an approved download link. Confirm access and the deadline. This is a draft; no email has been sent.
""",
)
write(
    "START-HERE.md",
    f"""# Brief: Project Reporting Builder

Version {VERSION}. Interview POC submission, prepared September 28, 2026.

## Review in five minutes

1. Read REQUIREMENTS-AUDIT.md for the assessment mapping and remaining qualifications.
2. Open presentation/Brief-15-minute.pdf for the design and engineering overview. For the talk, open presentation/index.html and use presentation/SPEAKER-NOTES.md.
3. On Apple Silicon macOS 13+, unzip app/Brief-macOS.zip and open Brief.app. Find the document icon in the menu bar. It is an ad-hoc signed development build, not notarized. If policy blocks it, use the browser/source fallback instead of disabling security controls.
4. Follow demo-data/README.md using the fictional notes, CSV and image.
5. Inspect source/brief/README.md and evidence/ for implementation and verification.

## Contents

| Folder/file | Contents |
| --- | --- |
| app | Runnable Mac app ZIP |
| source/brief | Full maintained source, vendored runtime libraries/licenses, configs, lockfile, tests, docs and presentation source |
| web | Built static browser workspace with local serving instructions |
| presentation | Offline HTML deck, 12-page PDF, English script and screenshot assets |
| demo-data | Short fictional demo and expected results |
| test-kit | Additional synthetic valid/invalid/reference inputs |
| evidence | Current local test, build, native smoke and deck checks |
| REQUIREMENTS-AUDIT.md | Assessment-by-assessment status |
| SUBMISSION-EMAIL.txt | Editable email draft, not sent |
| MANIFEST.sha256 | Checksums for every payload file |

## Build and test source

From source/brief, with Node.js 22+ and the package manager pinned in package.json:

    pnpm install --frozen-lockfile
    pnpm check
    pnpm exec playwright install chromium
    pnpm test:browser
    pnpm build

On macOS with Swift Command Line Tools:

    npm run test:macos
    npm run build:macos

The generated app will be source/brief/.build/Brief.app. The current artifact targets Apple Silicon; the build script uses the host architecture. Core browser development runs with `npm start` and does not require a provider key. See source/brief/docs/JEV.md only if explicitly enabling optional cloud AI.

Presentation source lives in source/brief/presentation. Run `node scripts/submission/build-presentation.mjs` from source/brief to regenerate HTML and notes. With Playwright's Chromium installed, `node scripts/submission/render-presentation.mjs` creates the PDF. PDFKit verification is a separate macOS script. The deck has no network dependency when opened.

## Scope and readiness

The core POC is implemented. Accessibility has automated evidence but no complete manual conformance result. Rehearse the 15-minute talk and confirm the five-day deadline against the invitation. Notarization, hosted CI and a second-Mac run remain release work; the assignment does not explicitly require those gates.

No presentation PPTX or native video is included. The English deck is provided as HTML/PDF. The app's own report-to-PPTX export is a separate supported feature.

## Package hygiene

This is a complete source snapshot, including uncommitted improvements. It is not a claim that the snapshot corresponds to a published Git commit. Git history, node_modules, compiler caches, developer recovery archives, real local reports and credential files are excluded. Dependencies are reproducible from the lockfile; runtime vendor code and licenses are included. `.env.example` contains configuration placeholders only.

After extraction on macOS/Linux, run `shasum -a 256 -c MANIFEST.sha256` from this directory. The outer ZIP has its own adjacent SHA-256 file. Local file and localhost links cannot be used as recipient download links. No email or public upload has been performed.
""",
)

# Check for accidental private files and recognizable credential material without printing values.
for file in SOURCE.rglob("*"):
    if not file.is_file():
        continue
    relative = file.relative_to(SOURCE)
    if file.name == ".env" or ".git" in relative.parts or "node_modules" in relative.parts:
        raise SystemExit(f"Forbidden source path: {relative}")
    if "vendor" not in relative.parts and file.suffix in {
        ".js",
        ".mjs",
        ".json",
        ".md",
        ".swift",
        ".txt",
        ".yml",
    }:
        text = file.read_text(errors="ignore")
        patterns = [
            r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
            r"\bgh[pousr]_[A-Za-z0-9]{36,}\b",
            r"\bsk-[A-Za-z0-9_-]{40,}\b",
        ]
        if any(re.search(pattern, text) for pattern in patterns):
            raise SystemExit(f"Possible credential requires review: {relative}")

files = sorted(file for file in DEST.rglob("*") if file.is_file())
write(
    "MANIFEST.sha256",
    "".join(f"{digest(file)}  {file.relative_to(DEST).as_posix()}\n" for file in files),
)
with zipfile.ZipFile(ARCHIVE, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as package:
    for file in sorted(DEST.rglob("*")):
        if file.is_file():
            package.write(file, f"{NAME}/{file.relative_to(DEST).as_posix()}")
with zipfile.ZipFile(ARCHIVE) as package:
    if package.testzip() is not None:
        raise SystemExit("ZIP integrity failed")
    if len(package.namelist()) != len(files) + 1:
        raise SystemExit("Archive file count mismatch")
(BUILD / f"{NAME}.zip.sha256").write_text(f"{digest(ARCHIVE)}  {ARCHIVE.name}\n")
print(
    json.dumps(
        {
            "archive": str(ARCHIVE),
            "bytes": ARCHIVE.stat().st_size,
            "payloadFiles": len(files),
            "sha256": digest(ARCHIVE),
        },
        indent=2,
    )
)
