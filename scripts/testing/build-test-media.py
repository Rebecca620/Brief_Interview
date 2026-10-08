"""Run with the bundled document runtime Python. Synthetic import fixtures only."""

import sys
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".build/brief-test-kit")
valid = root / "valid"
valid.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
im = Image.new("RGB", (1000, 560), "white")
d = ImageDraw.Draw(im)
d.text((56, 38), "Fictional pilot readiness", font=font, fill="#1d1d1f")
d.text((56, 90), "Devices ready / target: 80 / 100", font=small, fill="#64646b")
for i, (label, value) in enumerate([("IT", 80), ("Operations", 20), ("Unassigned", 0)]):
    y = 180 + i * 100
    d.text((56, y), label, font=small, fill="#1d1d1f")
    d.rectangle((245, y, 245 + max(value * 7, 1), y + 38), fill="#0066cc")
    d.text((245 + value * 7 + 15, y), str(value), font=small, fill="#1d1d1f")
d.text((56, 500), "Synthetic test data. Not a real project.", font=small, fill="#64646b")
for ext in ["png", "jpg", "webp"]:
    im.save(valid / f"16-chart.{ext}")

doc = Document()
doc.sections[0].top_margin = Inches(0.8)
doc.sections[0].bottom_margin = Inches(0.8)
doc.styles["Normal"].font.name = "Arial"
doc.styles["Normal"].font.size = Pt(11)
for style_name in ["Normal", "Title", "Heading 1"]:
    style = doc.styles[style_name]
    style.font.color.rgb = RGBColor(0, 0, 0)
    style.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), "PingFang SC")
for element in doc.styles.element.iter(qn("w:pBdr")):
    element.getparent().remove(element)
doc.add_paragraph("Project report import test", "Title")
doc.add_paragraph(
    "This fictional document tests body text, headings and table cell extraction. Review extracted text before adding it to your report."
)
for heading, body in [
    ("Progress", "The pilot covers 80 of 100 devices."),
    ("Discussion", "Approval is pending. Confirm the rollout owner before the next release."),
    ("Next steps", "Review the sample definition and confirm the remaining deployment window."),
]:
    doc.add_heading(heading, level=1)
    doc.add_paragraph(body)
table = doc.add_table(rows=1, cols=2)
table.style = "Light Shading Accent 1"
table.rows[0].cells[0].text = "Team"
table.rows[0].cells[1].text = "Devices ready"
for team, value in [("IT", "80"), ("Operations", "20")]:
    cells = table.add_row().cells
    cells[0].text = team
    cells[1].text = value
doc.add_paragraph("END OF TEST")
for paragraph in doc.paragraphs:
    for run in paragraph.runs:
        run.font.color.rgb = RGBColor(0, 0, 0)
        run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), "PingFang SC")
doc.save(valid / "17-project-brief.docx")

pdfmetrics.registerFont(
    TTFont("BriefCJK", "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=0)
)


def text_page(c, title, lines):
    c.setFont("BriefCJK", 22)
    c.drawString(50, 770, title)
    c.setFont("BriefCJK", 13)
    for i, line in enumerate(lines):
        c.drawString(50, 710 - i * 28, line)
    c.setFont("BriefCJK", 10)
    c.drawString(50, 60, "Fictional test data · Brief upload fixture")


c = canvas.Canvas(str(valid / "18-selectable-text.pdf"), pagesize=(595, 842))
text_page(
    c,
    "Project review 项目复盘",
    [
        "Progress: 80 of 100 devices are ready.",
        "中文测试：试点已完成首轮部署。",
        "This PDF contains selectable text.",
    ],
)
c.showPage()
text_page(
    c,
    "Next steps 下一步行动",
    [
        "Approval is pending for the remaining devices.",
        "Confirm the owner and the review date.",
        "END OF TEST",
    ],
)
c.save()
c = canvas.Canvas(str(valid / "19-mixed-pages.pdf"), pagesize=(595, 842))
text_page(
    c,
    "Mixed PDF page one",
    ["This page contains selectable text.", "Page two contains only a chart image."],
)
c.showPage()
c.drawImage(str(valid / "16-chart.png"), 30, 370, width=535, height=300)
c.save()
c = canvas.Canvas(str(root / "invalid/20-image-only.pdf"), pagesize=(595, 842))
c.drawImage(str(valid / "16-chart.png"), 30, 370, width=535, height=300)
c.save()
print("Created PNG/JPG/WebP, one DOCX and three PDF fixtures.")
