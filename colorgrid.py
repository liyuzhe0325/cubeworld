import sys
from PIL import Image

for path in sys.argv[1:]:
    im = Image.open(path).convert('RGB')
    w, h = 24, 10
    small = im.resize((w, h))
    print(f"== {path} ==")
    for y in range(h):
        row = []
        for x in range(w):
            r, g, b = small.getpixel((x, y))
            row.append(f"{r:02x}{g:02x}{b:02x}")
        print(' '.join(row))
    print()
