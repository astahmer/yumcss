import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.draw import polygon
from skimage.morphology import convex_hull_image

SCALE = 8
POTRACE = sys.argv[4] if len(sys.argv) > 4 else "potrace"

PALETTE = {
    "fur": "#2e2724",
    "fur-dark": "#1b1614",
    "outline": "#080606",
    "bib": "#fcf3e7",
    "bib-shade": "#ebcfba",
    "pad": "#f4a3a5",
    "mouth": "#7e1b24",
    "pink": "#f4545e",
    "pink-shade": "#c92c40",
    "iris": "#c6cf5c",
    "pupil": "#120d0c",
    "highlight": "#ffffff",
    "detail": "#1a1513",
    "chin-spot": "#120d0c",
}


def classify(rgba):
    rgb = rgba[..., :3].astype(float)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    alpha = rgba[..., 3] > 60
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    sat = rgb.max(-1) - rgb.min(-1)
    pink = alpha & (r > 150) & (g < 140) & (r - g > 90)
    pink_shade = pink & (r < 215) & (g < 75)
    green = alpha & (g > 70) & (b < 0.7 * g) & (r < 245) & (g - b > 50) & ~pink
    light = alpha & (lum > 165) & ~pink & ~green
    shade = light & (lum < 215) & (r - b > 30)
    dark = alpha & (lum < 85) & ~green
    mouth = alpha & (r > 90) & (r - g > 60) & (lum < 100) & ~pink
    pad = alpha & (r > 200) & (g > 120) & (g < 205) & (r - g > 40) & ~pink
    return dict(lum=lum, alpha=alpha, pink=pink, pink_shade=pink_shade, green=green, light=light, shade=shade, dark=dark,
                mouth=mouth, pad=pad)


def smooth(mask, sigma, threshold):
    big = ndimage.zoom(mask.astype(float), SCALE, order=1)
    big = ndimage.gaussian_filter(big, sigma)
    return big > threshold


def trace(mask, turdsize, alphamax=1.2):
    height, width = mask.shape
    flipped = mask[::-1]
    pbm = b"P4\n%d %d\n" % (width, height) + np.packbits(flipped, axis=1).tobytes()
    out = subprocess.run([POTRACE, "-b", "svg", "-u", "1", "-t", str(turdsize), "-a", str(alphamax), "-O", "1.0",
                          "--flat", "-o", "-", "-"], input=pbm, capture_output=True, check=True).stdout.decode()
    paths = re.findall(r'<path d="([^"]+)"', out)
    return " ".join(rescale(d) for d in paths)


def rescale(d):
    def number(match):
        value = float(match.group()) / SCALE
        return f"{value:.1f}".rstrip("0").rstrip(".")
    return re.sub(r"-?\d+(\.\d+)?", number, d.replace("\n", " "))


def reflect_mask(mask, axis):
    """Mirror a mask across the face centerline: a line through (x, y) tilted `angle` degrees from vertical."""
    height, width = mask.shape
    axis_x, axis_y, angle = axis
    ux, uy = np.sin(np.radians(angle)), np.cos(np.radians(angle))
    yy, xx = np.mgrid[:height, :width].astype(float)
    along = (xx - axis_x) * ux + (yy - axis_y) * uy
    source_x = np.rint(2 * (axis_x + along * ux) - xx).astype(int)
    source_y = np.rint(2 * (axis_y + along * uy) - yy).astype(int)
    inside = (source_x >= 0) & (source_x < width) & (source_y >= 0) & (source_y < height)
    mirrored = np.zeros_like(mask)
    mirrored[inside] = mask[source_y[inside], source_x[inside]]
    return mirrored


def find_spot(m, swap):
    """The original chin marking's contour; `complete_hidden` restores the part the tongue covers."""
    height, width = m["alpha"].shape
    yy, xx = np.ogrid[:height, :width]
    cx, cy, rx, ry = swap["search"]
    search = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
    dark = m["alpha"] & (m["lum"] < 90) & ~m["mouth"] & search
    blob = ndimage.binary_opening(dark, structure=np.ones((3, 3)), iterations=swap.get("line_width", 1))
    labels, count = ndimage.label(blob)
    sizes = ndimage.sum(blob, labels, range(1, count + 1))
    old_spot = ndimage.binary_fill_holes(labels == int(np.argmax(sizes)) + 1)
    if not swap.get("complete_hidden"):
        return old_spot, old_spot
    ys, xs = np.nonzero(old_spot)
    eigenvalues, eigenvectors = np.linalg.eigh(np.cov(np.vstack([xs, ys])))
    offsets = np.stack([xx - xs.mean() + 0 * yy, yy - ys.mean() + 0 * xx], axis=-1) @ eigenvectors
    fitted = ((offsets / (2.1 * np.sqrt(eigenvalues))) ** 2).sum(-1) <= 1
    covered_by_mouth = ndimage.binary_dilation(m["pink"] | ((m["lum"] < 135) & ~old_spot), iterations=2)
    hidden = fitted & covered_by_mouth & ndimage.binary_dilation(old_spot, iterations=5)
    return old_spot, ndimage.binary_fill_holes(old_spot | hidden)


def borrowed_spot(template, shape):
    """Another pose's moved marking, scaled and placed at this pose's mouth junction (for hidden-mouth poses)."""
    poses = json.loads((Path(__file__).parent / "poses.json").read_text())
    template_swap = poses[template["pose"]]["spot_swap"]
    template_rgba = np.array(Image.open(Path(__file__).parent.parent / "split" / f"{template['pose']}.png").convert("RGBA"))
    _, template_spot = find_spot(classify(template_rgba), template_swap)
    template_spot = reflect_mask(template_spot, template_swap["axis"])
    source_x, source_y = template_swap["axis"][:2]
    target_x, target_y = template["at"]
    scale = template["scale"]
    return ndimage.affine_transform(template_spot.astype(float), [1 / scale, 1 / scale],
                                    offset=[source_y - target_y / scale, source_x - target_x / scale],
                                    output_shape=shape, order=1) > 0.5


def swap_spot(m, swap):
    """Move the chin marking to Yums' other anatomical side, keeping its organic contour."""
    if swap.get("template"):
        empty = np.zeros_like(m["alpha"])
        old_spot, new_spot, bulge = empty, borrowed_spot(swap["template"], m["alpha"].shape), empty
    else:
        old_spot, full_spot = find_spot(m, swap)
        mirror = swap.get("mirror", True)
        new_spot = reflect_mask(full_spot, swap["axis"]) if mirror else full_spot
        bulge = old_spot & ~reflect_mask(m["alpha"], swap["axis"]) if mirror else np.zeros_like(old_spot)
    shift_x, shift_y = swap.get("shift", [0, 0])
    new_spot = np.roll(new_spot, (shift_y, shift_x), axis=(0, 1))
    full_size = new_spot.sum()
    for seed_x, seed_y in swap.get("in_front", []):
        regions, _ = ndimage.label(m["light"] & ~ndimage.binary_dilation(m["alpha"] & (m["lum"] < 135), iterations=1))
        new_spot &= ~ndimage.binary_dilation(regions == regions[seed_y, seed_x], iterations=1)
    if swap.get("in_front_outline"):
        xs, ys = zip(*swap["in_front_outline"])
        rows, cols = polygon(ys, xs, shape=new_spot.shape)
        new_spot[rows, cols] = False
    if swap.get("keep_top_edge"):
        rows = np.arange(old_spot.shape[0])[:, None]
        top = np.where(old_spot.any(0), old_spot.argmax(0), old_spot.shape[0])
        mouth_line = (rows < top + swap["keep_top_edge"]) & (rows < top.min() + 2 * swap["keep_top_edge"])
        old_spot = old_spot & ~mouth_line
    print(f"chin marking visible: {new_spot.sum() / max(full_size, 1):.0%}", file=sys.stderr)
    return old_spot, new_spot, bulge


def main():
    source, output, config_json = sys.argv[1], sys.argv[2], sys.argv[3]
    config = json.loads(config_json)
    name = Path(output).stem
    rgba = np.array(Image.open(source).convert("RGBA"))
    height, width = rgba.shape[:2]
    m = classify(rgba)

    eyes = np.zeros_like(m["alpha"])
    labels, count = ndimage.label(ndimage.binary_closing(m["green"], iterations=1))
    sizes = ndimage.sum(m["green"], labels, range(1, count + 1))
    for index, size in enumerate(sizes, start=1):
        if size >= config.get("min_eye", 12):
            eyes |= convex_hull_image(labels == index)
    eyes = ndimage.binary_dilation(eyes, iterations=1) & m["alpha"]

    light_region = ndimage.binary_fill_holes(ndimage.binary_closing(m["light"] & ~eyes, iterations=1))
    old_spot = np.zeros_like(m["alpha"])
    new_spot = np.zeros_like(m["alpha"])
    swap = config.get("spot_swap")
    if swap:
        old_spot, new_spot, bulge = swap_spot(m, swap)
        m["alpha"] = (m["alpha"] & ~bulge) | new_spot
        old_area = ndimage.binary_dilation(old_spot, iterations=2)
        light_region = ndimage.binary_fill_holes(light_region | old_area)
    face_dark = m["alpha"] & (m["lum"] < 135) & ~m["pink"] & ~m["mouth"] & light_region & ~eyes
    if swap:
        line_ink = face_dark & ~old_spot & (~old_area | (m["lum"] < 70))
        labels, count = ndimage.label(line_ink, structure=np.ones((3, 3)))
        lines_leaving_spot = np.unique(labels[(labels > 0) & ~old_area])
        face_dark = np.isin(labels, lines_leaving_spot[lines_leaving_spot > 0])
        mouth_ink = face_dark & (m["lum"] < 70) & ~m["pink"]
        if swap.get("restore_mouth", True):
            face_dark |= reflect_mask(mouth_ink, swap["axis"]) & old_area
    bib = light_region & m["alpha"] & ~eyes
    mouth = m["mouth"] & ~old_spot
    labels, count = ndimage.label(mouth)
    sizes = ndimage.sum(mouth, labels, range(1, count + 1))
    mouth = np.isin(labels, 1 + np.nonzero(sizes >= 15)[0])

    eye_pupil = m["dark"] & eyes
    eye_highlight = m["light"] & eyes & ~m["green"]

    layers = [
        ("fur", smooth(m["alpha"], 2.8, 0.42), 40),
        ("fur-dark", smooth(ndimage.binary_opening(m["alpha"] & (m["lum"] < 23) & ~bib, iterations=1), 5.0, 0.5), 300),
        ("outline", smooth(m["alpha"] & (m["lum"] < 11) & ~bib & ~eyes, 3.2, 0.42), 250),
        ("bib", smooth(bib, 3.2, 0.5), 60),
        ("bib-shade", smooth(m["shade"] & bib, 1.6, 0.45), 30),
        ("pad", smooth(m["pad"] & bib, 1.8, 0.5), 30),
        ("chin-spot", smooth(new_spot, 5.0, 0.5), 30),
        ("mouth", smooth(mouth, 2.2, 0.5), 30),
        ("pink", smooth(m["pink"], 2.8, 0.45), 30),
        ("pink-shade", smooth(m["pink_shade"], 2.8, 0.5), 40),
        ("iris", smooth(eyes, 2.6, 0.5), 30),
        ("pupil", smooth(eye_pupil, 2.6, 0.5), 30),
        ("highlight", smooth(eye_highlight, 1.4, 0.5), 10),
        ("detail", smooth(face_dark, 2.2, 0.27), 60),
    ]
    groups = []
    for layer in layers:
        layer_name, mask, turdsize = layer
        d = trace(mask, turdsize)
        if d.strip():
            stroke = f' stroke="{PALETTE["outline"]}" stroke-width="2" stroke-linejoin="round"' if layer_name == "fur" else ""
            groups.append(f'  <path id="{layer_name}" fill="{PALETTE[layer_name]}"{stroke} d="{d}"/>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" '
           f'height="{height}">\n  <title>yums-{name}</title>\n' + "\n".join(groups) + "\n</svg>\n")
    Path(output).write_text(svg)


main()
