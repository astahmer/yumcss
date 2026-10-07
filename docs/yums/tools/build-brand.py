import shutil
import subprocess
import sys
from pathlib import Path

yums = Path(__file__).parent.parent
brand = yums / "brand"
rsvg = sys.argv[1] if len(sys.argv) > 1 else "rsvg-convert"

ORANGE = "#f59e42"
APP_ICON_SIZE = 512
APP_ICON_RADIUS = 115
PEEK_FRAME = (31, 21, 276, 205)  # peek.svg content bounds (incl. fur stroke) + 3px padding
FAVICON_SIZE = 32
FAVICON_RADIUS = 7
FAVICON_CROP = (62, 18, 214, 205)  # Face and paw tips of peek.svg; the sides of the paws fall outside the tile.

peek = (yums / "svg" / "peek.svg").read_text()
peek_layers = peek[peek.index("</title>") + len("</title>"):peek.rindex("</svg>")]
frame_x, frame_y, frame_width, frame_height = PEEK_FRAME

(brand / "logo-mark.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{frame_x} {frame_y} {frame_width} {frame_height}" '
    f'width="{frame_width}" height="{frame_height}">\n  <title>YumCSS logo mark</title>{peek_layers}</svg>\n'
)

mascot_width = APP_ICON_SIZE * 0.88
mascot_height = mascot_width * frame_height / frame_width
mascot_x = (APP_ICON_SIZE - mascot_width) / 2
mascot_y = APP_ICON_SIZE * 0.9 - mascot_height


def app_icon(radius: float) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {APP_ICON_SIZE} {APP_ICON_SIZE}" '
        f'width="{APP_ICON_SIZE}" height="{APP_ICON_SIZE}">\n  <title>YumCSS app icon</title>\n'
        f'  <rect id="tile" width="{APP_ICON_SIZE}" height="{APP_ICON_SIZE}" rx="{radius}" fill="{ORANGE}"/>\n'
        f'  <svg id="yums" x="{mascot_x:.1f}" y="{mascot_y:.1f}" width="{mascot_width:.1f}" height="{mascot_height:.1f}" '
        f'viewBox="{frame_x} {frame_y} {frame_width} {frame_height}">{peek_layers}</svg>\n</svg>\n'
    )


(brand / "app-icon.svg").write_text(app_icon(APP_ICON_RADIUS))
# iOS masks apple-touch-icon itself; transparent rounded corners would render black there.
full_bleed = brand / ".app-icon-full-bleed.svg"
full_bleed.write_text(app_icon(0))

crop_x, crop_y, crop_width, crop_height = FAVICON_CROP
favicon_mascot_height = FAVICON_SIZE * crop_height / crop_width
(brand / "favicon.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {FAVICON_SIZE} {FAVICON_SIZE}" '
    f'width="{FAVICON_SIZE}" height="{FAVICON_SIZE}">\n  <title>YumCSS favicon</title>\n'
    f'  <rect id="tile" width="{FAVICON_SIZE}" height="{FAVICON_SIZE}" rx="{FAVICON_RADIUS}" fill="{ORANGE}"/>\n'
    f'  <svg id="yums" y="{FAVICON_SIZE - favicon_mascot_height:.2f}" width="{FAVICON_SIZE}" '
    f'height="{favicon_mascot_height:.2f}" viewBox="{crop_x} {crop_y} {crop_width} {crop_height}">{peek_layers}</svg>\n</svg>\n'
)

renders = [
    ("favicon.svg", 16, "favicon-16.png"),
    ("favicon.svg", 32, "favicon-32.png"),
    ("favicon.svg", 48, "favicon-48.png"),
    (full_bleed.name, 180, "apple-touch-icon.png"),
    ("app-icon.svg", 192, "icon-192.png"),
    ("app-icon.svg", 512, "icon-512.png"),
]
for source, size, output in renders:
    subprocess.run([rsvg, "-w", str(size), "-h", str(size), str(brand / source), "-o", str(brand / output)], check=True)
full_bleed.unlink()

site_public = yums.parent / "public"
for name in ("favicon.svg", "favicon-16.png", "favicon-32.png", "apple-touch-icon.png"):
    shutil.copyfile(brand / name, site_public / name)

template = (Path(__file__).parent / "brand-preview-template.html").read_text()
(brand / "preview.html").write_text(template)
