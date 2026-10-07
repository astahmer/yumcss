import base64
import json
from pathlib import Path

yums = Path(__file__).parent.parent
sources = {
    svg.stem: "data:image/svg+xml;base64," + base64.b64encode(svg.read_bytes()).decode()
    for svg in sorted((yums / "svg").glob("*.svg"))
}
template = (Path(__file__).parent / "preview-template.html").read_text()
(yums / "preview.html").write_text(template.replace("__SVG_SOURCES__", json.dumps(sources)))
