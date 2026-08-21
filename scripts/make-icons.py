"""Draw the app icons: a chord diagram (nut, strings, frets, finger dots) on a
blue-violet gradient. Pure stdlib — no image library is installed and none is
worth adding for four static files. Rendered at 4x and box-filtered down, which
is what keeps the thin string lines from crawling."""
import os
import struct
import zlib

SS = 4  # supersampling factor

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

TOP = (10, 132, 255)     # --accent (dark) #0A84FF
BOTTOM = (94, 92, 230)   # #5E5CE6

def rounded_rect_alpha(x, y, w, h, r, px, py):
    """1 if the point is inside the rounded rect, else 0 (sampling is done by SS)."""
    if px < x or py < y or px > x + w or py > y + h:
        return False
    cx = min(max(px, x + r), x + w - r)
    cy = min(max(py, y + r), y + h - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r

def draw(size, *, maskable=False, opaque_square=False):
    S = size * SS
    # RGBA float accumulation buffer at supersampled resolution
    buf = bytearray(S * S * 4)

    if maskable:
        # Maskable icons are cropped to a circle of 80% width by the launcher,
        # so the artwork shrinks and the background bleeds to every edge.
        content_scale = 0.54
        radius = 0.0
        bg_x = bg_y = 0.0
        bg_w = bg_h = float(S)
    elif opaque_square:
        # iOS applies its own mask to apple-touch-icon; a square, fully opaque
        # tile is what it expects.
        content_scale = 0.68
        radius = 0.0
        bg_x = bg_y = 0.0
        bg_w = bg_h = float(S)
    else:
        content_scale = 0.66
        radius = S * 0.225   # iOS-ish squircle approximation
        bg_x = bg_y = 0.0
        bg_w = bg_h = float(S)

    # --- background -------------------------------------------------------
    for y in range(S):
        col = lerp(TOP, BOTTOM, y / max(1, S - 1))
        row = y * S * 4
        for x in range(S):
            if radius and not rounded_rect_alpha(bg_x, bg_y, bg_w, bg_h, radius, x + 0.5, y + 0.5):
                continue
            i = row + x * 4
            buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = 255

    def blend(x, y, rgb, a):
        if x < 0 or y < 0 or x >= S or y >= S or a <= 0:
            return
        i = (y * S + x) * 4
        da = buf[i + 3] / 255.0
        for c in range(3):
            buf[i + c] = round(buf[i + c] * (1 - a) + rgb[c] * a)
        buf[i + 3] = round(255 * (da + (1 - da) * a))

    def rect(x0, y0, w, h, rgb, a=1.0, r=0.0):
        for y in range(int(y0 - 1), int(y0 + h + 2)):
            for x in range(int(x0 - 1), int(x0 + w + 2)):
                if rounded_rect_alpha(x0, y0, w, h, r, x + 0.5, y + 0.5):
                    blend(x, y, rgb, a)

    def disc(cx, cy, rad, rgb, a=1.0):
        for y in range(int(cy - rad - 1), int(cy + rad + 2)):
            for x in range(int(cx - rad - 1), int(cx + rad + 2)):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad:
                    blend(x, y, rgb, a)

    # --- chord diagram ----------------------------------------------------
    W = S * content_scale                    # artwork box
    ox = (S - W) / 2
    oy = (S - W) / 2
    strings, frets = 5, 4                    # 5 vertical strings, 4 fret rows
    gap_x = W / (strings - 1)
    gap_y = W / frets
    line = max(1.0, S * 0.016)
    white = (255, 255, 255)

    nut_h = line * 2.6
    rect(ox - line / 2, oy - nut_h, W + line, nut_h, white, 1.0, r=line)

    for i in range(strings):                 # strings
        rect(ox + i * gap_x - line / 2, oy, line, W, white, 0.62)
    for j in range(1, frets + 1):            # frets
        rect(ox - line / 2, oy + j * gap_y - line / 2, W + line, line, white, 0.42)

    dot_r = gap_x * 0.30
    # An A-shape-ish fingering: three dots on the second fret row.
    for i in (1, 2, 3):
        disc(ox + i * gap_x, oy + gap_y * 1.5, dot_r, white, 1.0)

    # --- downsample -------------------------------------------------------
    out = bytearray(size * size * 4)
    n = SS * SS
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for dy in range(SS):
                base = ((y * SS + dy) * S + x * SS) * 4
                for dx in range(SS):
                    i = base + dx * 4
                    al = buf[i + 3]
                    r += buf[i] * al; g += buf[i + 1] * al; b += buf[i + 2] * al; a += al
            o = (y * size + x) * 4
            if a:
                out[o] = round(r / a); out[o + 1] = round(g / a); out[o + 2] = round(b / a)
            out[o + 3] = round(a / n)
    return bytes(out)

def write_png(path, size, pixels):
    raw = b''.join(b'\x00' + pixels[y * size * 4:(y + 1) * size * 4] for y in range(size))
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(f'{path}  {size}x{size}  {len(png)} bytes')

DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, 'public')
write_png(f'{DEST}/pwa-192.png', 192, draw(192))
write_png(f'{DEST}/pwa-512.png', 512, draw(512))
write_png(f'{DEST}/pwa-maskable-512.png', 512, draw(512, maskable=True))
write_png(f'{DEST}/apple-touch-icon.png', 180, draw(180, opaque_square=True))
write_png(f'{DEST}/favicon-32.png', 32, draw(32))
