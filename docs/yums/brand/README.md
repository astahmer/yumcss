# YumCSS brand assets

Frozen. Change these only on an explicit request.

Yums, the tuxedo cat, comes from the 17 approved mascot SVGs in [`../svg/`](../svg/). Those files are the only source for Yums' artwork. Never trace or redraw from older screenshots or brand boards: wherever they differ, the approved SVGs win.

## Canonical assets

| File                                                 | Use                                                                                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logo-mark.svg`                                      | Primary mark. The approved Peek pose, tightly framed, on a transparent background. Use it next to the product name, in headers and in docs.                                             |
| `app-icon.svg`                                       | Peek on the orange rounded square (corner radius 115 of 512). Use it for app and PWA icons, social avatars and store listings.                                                          |
| `favicon.svg`                                        | The favicon: the approved Peek artwork on the orange tile, cropped to the face and paw tips (`FAVICON_CROP` in `build-brand.py`). One file serves every size; nothing in it is redrawn. |
| `favicon-16.png`, `favicon-32.png`, `favicon-48.png` | Raster favicons rendered from `favicon.svg`.                                                                                                                                            |
| `apple-touch-icon.png`                               | 180×180 with square corners, because iOS applies its own rounding.                                                                                                                      |
| `icon-192.png`, `icon-512.png`                       | Web app manifest icons, rendered from `app-icon.svg`.                                                                                                                                   |

The favicons are always on the orange tile. There is no cream variant. A transparent variant has not been made yet.

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
<link rel="icon" href="/favicon-16.png" sizes="16x16" type="image/png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

## Colors

| Name     | Hex       | Role                                             |
| -------- | --------- | ------------------------------------------------ |
| Orange   | `#F59E42` | Canonical brand color: app icon and favicon tile |
| Coral    | `#EF4444` | Secondary accent                                 |
| Cream    | `#FEF7ED` | Light surfaces                                   |
| Charcoal | `#1F1F1F` | Dark surfaces                                    |

## Using Yums on the website

Mascot poses are standalone SVGs. Build every surrounding UI element in HTML/CSS and never bake it into the artwork: code windows, cards, backgrounds, type, buttons and loaders. Compositions this setup supports:

- Peek overlapping a real code window (`peek.svg` positioned over the window's top edge)
- Sleepy inside an empty-state card
- Play next to a loading/building indicator
- Poses extending beyond card boundaries (`overflow: visible`, with negative offsets)
- A large Peek beside marketing copy

There is no final wordmark yet. "YumCSS" next to the mark in the preview is placeholder system type.

## Regenerating

Everything in this folder except this README is generated from `../svg/peek.svg`. The script also copies the favicon set and `apple-touch-icon.png` into `docs/public/`:

```bash
python3 yums/tools/build-brand.py
```

The script needs `rsvg-convert` on `PATH` (`nix shell nixpkgs#librsvg`). Open `preview.html` to review every asset on its intended backgrounds and at actual size.
