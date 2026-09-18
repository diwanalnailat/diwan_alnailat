"""Add isolated Arabic presentation aliases for jsPDF. Original font stays unchanged."""
from fontTools.ttLib import TTFont
import unicodedata
font=TTFont('public/tajawal.ttf')
cmap=font.getBestCmap()
for code in range(0xfe80,0xfefd):
    ch=chr(code)
    base=unicodedata.normalize('NFKC',ch)
    if code not in cmap and len(base)==1 and ord(base) in cmap and 'ISOLATED FORM' in unicodedata.name(ch,''):
        glyph=cmap[ord(base)]
        for table in font['cmap'].tables:
            if table.isUnicode(): table.cmap[code]=glyph
for record in font['name'].names:
    names={1:'DiwanTajawalPDF',2:'Regular',3:'DiwanTajawalPDF Regular 1.0',4:'DiwanTajawalPDF Regular',6:'DiwanTajawalPDF-Regular'}
    if record.nameID in names:
        record.string=names[record.nameID].encode(record.getEncoding())
font.save('public/tajawal-pdf.ttf')
