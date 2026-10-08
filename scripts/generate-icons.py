"""Generate the code-native Vault monogram as PNGs, using only Python stdlib."""
import struct
import zlib
from pathlib import Path

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

def icon(size, target):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            # V monogram contained in the maskable safe area.
            u, v = x / size, y / size
            left = .31 + (v - .3) * .45
            right = .69 - (v - .3) * .45
            white = .30 <= v <= .72 and (abs(u - left) < .045 or abs(u - right) < .045)
            row.extend((255, 255, 255) if white else (185, 28, 28))
        rows.append(b'\x00' + row)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')
    Path(target).write_bytes(png)

root = Path(__file__).resolve().parent.parent / 'public' / 'icons'
root.mkdir(parents=True, exist_ok=True)
for name, size in [('icon-192', 192), ('icon-512', 512), ('maskable-512', 512), ('apple-touch-icon', 180)]:
    icon(size, root / f'{name}.png')
