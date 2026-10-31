# Icon sources

Inputs for [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets),
which generates every Android launcher icon and splash from these files. Do not
edit the generated resources under `android/app/src/main/res/` by hand.

| File | Size | Purpose |
|------|------|---------|
| `icon-only.png` | 1024×1024 | Legacy launcher icon (`mipmap-*/ic_launcher*.png`) |
| `icon-foreground.png` | 1024×1024, transparent | Adaptive icon foreground |
| `icon-background.png` | 1024×1024, solid `#0D1B2A` | Adaptive icon background |
| `splash.png` | 2732×2732 | Launch screen |
| `splash-dark.png` | 2732×2732 | Launch screen (night mode) |

`public/icon.svg` is the single source of truth for the artwork. The PNGs are
derived from it once and committed so regenerating the Android resources does
not need a rasterizer:

```bash
# Regenerate every Android resource after changing an asset above.
npx @capacitor/assets generate --android
```

The adaptive icon is rendered by Android from `icon-foreground.png` and
`icon-background.png`: the navy layer is separate, so the keyhole's negative
space and the safe's recessed door keep the exact background colour instead of a
baked-in rectangle. Keep the two layers in sync if the logo changes.

The generated PNGs are not optimised by hand, and Android scales the foreground
from its density-specific size into the 72dp safe zone. If the launcher icon ever
looks soft on a device, the alternative is a hand-written `VectorDrawable`
duplicating the paths in `public/icon.svg`; that trades one source of truth for
sharpness at every density.
