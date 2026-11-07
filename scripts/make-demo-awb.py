from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

root = Path(__file__).resolve().parents[1]
out = root / 'public/demo/awb-a6.pdf'
out.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('DemoSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DemoBold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
c = canvas.Canvas(str(out), pagesize=(105*mm, 148*mm), invariant=1)
c.setTitle('DEMÓ AWB - Nem érvényes fuvarlevél')
c.setAuthor('Spice Laboratory')
w, height = 105*mm, 148*mm
def txt(x, y, value, size=9, bold=False):
    c.setFont('DemoBold' if bold else 'DemoSans', size)
    c.drawString(x*mm, y*mm, value)
c.setFillColorRGB(0,0,0)
c.rect(5*mm, 126*mm, 95*mm, 17*mm, fill=1, stroke=0)
c.setFillColorRGB(1,1,1)
txt(9, 135, 'DEMÓ AWB', 20, True)
txt(9, 129, 'NEM ÉRVÉNYES FUVARLEVÉL', 8, True)
c.setFillColorRGB(0,0,0)
txt(7, 117, 'SPICE LABORATORY', 12, True)
txt(7, 111, 'A6 nyomtatási próba · 105 × 148 mm', 8)
c.line(7*mm,107*mm,98*mm,107*mm)
txt(7, 101, 'RENDELÉS', 7, True)
txt(7, 93, 'SL-DEMO-001', 15, True)
txt(7, 82, 'CÍMZETT - KITALÁLT TESZTADATOK', 7, True)
txt(7, 75, 'Minta Vásárló', 12, True)
txt(7, 68, '1111 Budapest, Minta utca 12.', 9)
txt(7, 62, 'Magyarország · demo@example.com', 8)
c.line(7*mm,57*mm,98*mm,57*mm)
txt(7, 50, '1 doboz · 3 üveg · 850 g (minta)', 9, True)
txt(7, 43, 'Teszthivatkozás: DEMO-NEM-FELADHATO', 8)
c.setDash(3,3)
c.rect(7*mm, 21*mm, 91*mm, 15*mm, stroke=1, fill=0)
c.setDash()
txt(13, 29, 'NINCS ÉRVÉNYES VONALKÓD', 9, True)
txt(13, 24, 'GLS-feladásra nem használható.', 8)
txt(7, 12, 'Csak elrendezési és nyomtatási teszt.', 8, True)
txt(7, 7, 'Nem GLS által kibocsátott címke.', 7)
c.showPage()
c.save()
print(out)
