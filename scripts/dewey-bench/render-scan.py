# Text → an image-only PDF that looks scanned (no text layer: Dewey must OCR it). Dewey benchmark, P3/P4/N4.
# usage: render-scan.py in.txt out.pdf [--quality clean|bad|blank] [--max-pages N] [--seed S]
import sys, random, textwrap, argparse
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--quality', default='clean'); ap.add_argument('--max-pages', type=int, default=40); ap.add_argument('--seed', type=int, default=1)
a = ap.parse_args()
random.seed(a.seed)
FONTS = ['/System/Library/Fonts/Supplemental/Times New Roman.ttf', '/System/Library/Fonts/Supplemental/Courier New.ttf', '/Library/Fonts/Arial Unicode.ttf']
dpi = 150 if a.quality == 'clean' else 100
W, H, M = int(8.5 * dpi), int(11 * dpi), int(0.9 * dpi)
size = int(dpi * (11 / 72) * (1.4 if a.quality == 'bad' else 1.25))
font = ImageFont.truetype(FONTS[1] if a.quality == 'bad' else FONTS[0], size)   # 'bad' = a typewritten look
text = open(a.src, encoding='utf-8').read()
chars = max(30, int((W - 2 * M) / (size * (0.62 if a.quality == 'bad' else 0.5))))
lines = []
for p in text.split('\n\n'):
    lines += textwrap.wrap(' '.join(p.split()), chars) + ['']
per = int((H - 2 * M) / (size * 1.35))
pages = []
for k in range(0, min(len(lines), per * a.max_pages), per):
    img = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(img)
    if a.quality != 'blank':
        for i, ln in enumerate(lines[k:k + per]):
            d.text((M, M + i * size * 1.35), ln, fill=random.randint(0, 40) if a.quality == 'bad' else 0, font=font)
    if a.quality in ('bad', 'blank'):
        img = img.rotate(random.uniform(-1.6, 1.6), fillcolor=255, expand=False)
        px = img.load()
        for _ in range(W * H // (60 if a.quality == 'bad' else 25)):
            x, y = random.randrange(W), random.randrange(H)
            px[x, y] = random.choice([0, 90, 160])
        img = img.filter(ImageFilter.GaussianBlur(0.8 if a.quality == 'bad' else 1.2))
    pages.append(img.convert('RGB'))
    if a.quality == 'blank' and len(pages) >= 3: break
pages[0].save(a.out, save_all=True, append_images=pages[1:], resolution=dpi)
print(len(pages))
