#!/usr/bin/env python3
"""生成站点图标：favicon.ico / favicon.svg / apple-touch-icon.png

设计：品牌绿圆角方块 + 三条白色文字条（标题 + 两行正文），
16px 下仍能读成「一篇文章」，和排版器的用途对得上。
纯标准库手写 PNG/ICO 编码，不引入 Pillow 之类的依赖。

用法：python3 tools/make-icons.py
"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 品牌绿（与页面 --main / --main2 同色系）
TOP = (0x1F, 0xBF, 0x85)
BOTTOM = (0x04, 0x78, 0x57)

# 16 单位坐标系里的文字条：(x0, y0, x1, y1, 圆角, 不透明度)
BARS = [
    (3.4, 3.4, 12.6, 6.0, 1.30, 1.00),   # 标题：短而粗
    (3.4, 7.7, 12.6, 9.3, 0.80, 0.86),   # 正文第一行
    (3.4, 11.0, 10.4, 12.6, 0.80, 0.70),  # 正文第二行（略短，暗示段落收尾）
]
# 16/24px 下三根细线会糊成一片，减到两根、加粗，缩到标签页尺寸才认得出来
BARS_SMALL = [
    (3.2, 4.1, 12.8, 7.1, 1.50, 1.00),
    (3.2, 9.1, 11.2, 11.9, 1.40, 0.92),
]


def inside_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r


def render_rgba(size, radius=3.7, scale=1.0):
    """返回 size×size 的 RGBA 字节串，超采样后平均，边缘自然抗锯齿。"""
    ss = 32 if size <= 48 else 8
    bars = BARS_SMALL if size <= 24 else BARS
    cx0 = (16 - 16 * scale) / 2          # 内容整体缩放后居中
    out = bytearray(size * size * 4)
    for py in range(size):
        for px in range(size):
            ar = ag = ab = aa = 0
            for sy in range(ss):
                for sx in range(ss):
                    u = (px + (sx + 0.5) / ss) / size * 16
                    v = (py + (sy + 0.5) / ss) / size * 16
                    if radius > 0 and not inside_round_rect(u, v, 0, 0, 16, 16, radius):
                        continue
                    # 底：斜向渐变
                    t = (u / 16) * 0.35 + (v / 16) * 0.65
                    r = TOP[0] + (BOTTOM[0] - TOP[0]) * t
                    g = TOP[1] + (BOTTOM[1] - TOP[1]) * t
                    b = TOP[2] + (BOTTOM[2] - TOP[2]) * t
                    # 白条：按不透明度覆盖
                    cu, cv = (u - cx0) / scale, (v - cx0) / scale
                    for (x0, y0, x1, y1, br, op) in bars:
                        if inside_round_rect(cu, cv, x0, y0, x1, y1, br):
                            r = r + (255 - r) * op
                            g = g + (255 - g) * op
                            b = b + (255 - b) * op
                            break
                    ar += r
                    ag += g
                    ab += b
                    aa += 255
            n = ss * ss
            i = (py * size + px) * 4
            if aa == 0:
                out[i:i + 4] = b"\0\0\0\0"
            else:
                # 颜色按实际覆盖的采样数平均，alpha 按覆盖比例
                cover = aa / 255
                out[i] = round(ar / cover)
                out[i + 1] = round(ag / cover)
                out[i + 2] = round(ab / cover)
                out[i + 3] = round(aa / n)
    return bytes(out)


def png_bytes(size, **kw):
    rgba = render_rgba(size, **kw)
    raw = b"".join(b"\x00" + rgba[y * size * 4:(y + 1) * size * 4] for y in range(size))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def ico_bytes(entries):
    """多尺寸 ICO：每个条目直接放 PNG 数据（Vista 起通用）。"""
    head = struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    dirs, data = b"", b""
    for size, png in entries:
        dim = 0 if size >= 256 else size
        dirs += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(png), offset + len(data))
        data += png
    return head + dirs + data


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" role="img" aria-label="公众号文章排版器">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2=".35" y2="1">
      <stop offset="0" stop-color="#1fbf85"/>
      <stop offset="1" stop-color="#047857"/>
    </linearGradient>
  </defs>
  <rect width="16" height="16" rx="3.7" fill="url(#g)"/>
  <rect x="3.4" y="3.4" width="9.2" height="2.6" rx="1.3" fill="#fff"/>
  <rect x="3.4" y="7.7" width="9.2" height="1.6" rx=".8" fill="#fff" opacity=".86"/>
  <rect x="3.4" y="11" width="7" height="1.6" rx=".8" fill="#fff" opacity=".7"/>
</svg>
"""


def main():
    # 浏览器标签页：16/32/48 三档一把梭
    ico = ico_bytes([(s, png_bytes(s)) for s in (16, 32, 48)])
    open(os.path.join(ROOT, "favicon.ico"), "wb").write(ico)
    # 现代浏览器优先用矢量版，任意倍屏都清晰
    open(os.path.join(ROOT, "favicon.svg"), "w", encoding="utf-8").write(SVG)
    # iOS「添加到主屏幕」只认 PNG，且会被系统裁圆角 → 满幅、内容缩到 82%
    open(os.path.join(ROOT, "apple-touch-icon.png"), "wb").write(
        png_bytes(180, radius=0, scale=0.86))
    print("已生成 favicon.ico / favicon.svg / apple-touch-icon.png")


if __name__ == "__main__":
    main()
