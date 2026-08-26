import sys
from PIL import Image

def ascii_art(path, w=100):
    im = Image.open(path).convert('RGB')
    # 统计
    px = list(im.resize((64, 36)).getdata())
    n = len(px)
    avg = tuple(sum(c[i] for c in px) // n for i in range(3))
    white = sum(1 for c in px if c[0] > 235 and c[1] > 235 and c[2] > 235) / n
    black = sum(1 for c in px if c[0] < 20 and c[1] < 20 and c[2] < 20) / n
    print(f"{path}: avg_rgb={avg} white%={white*100:.0f} black%={black*100:.0f}")
    # ASCII
    h = int(w * im.height / im.width * 0.5)
    im2 = im.resize((w, h)).convert('L')
    chars = " .:-=+*#%@"
    data = list(im2.getdata())
    for y in range(h):
        row = data[y*w:(y+1)*w]
        print(''.join(chars[min(9, v * 10 // 256)] for v in row))

for p in sys.argv[1:]:
    ascii_art(p)
    print()
