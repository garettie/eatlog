# Eatlog store artwork

The launcher and feature-graphic exports derive from `assets/icon.png`, the canonical opaque 1024×1024 flat-white egg mask. The mask, red indicator, and scale marks are unchanged. Those variants change only canvas size, format, background, and padding.

The two plan icons have reusable vector sources in `source/tier-eatlog.svg` and `source/tier-omelette.svg`. Generation copies those SVGs to the website and renders the two product icons. Both free internal states use the Eatlog egg; the one-time purchase uses the omelette. Internal store identifiers remain unchanged for purchase restoration.

Run:

```bash
npm run store:artwork:generate
npm run store:artwork:check
```

Generation requires the local `rsvg-convert` executable. Validation uses Node only; app and EAS builds do not depend on the artwork generator.

Generated upload candidates:

- `export/google-play-icon-512.png`: 512×512, 32-bit RGBA PNG, fully opaque, at most 1024 KB.
- `export/google-play-feature-graphic-1024x500.png`: 1024×500, 24-bit RGB PNG with no alpha. The full canonical egg is centered inside the focal area; there is no text, price, badge, rating, award, or claim.
- `export/apple-app-store-icon-1024.png`: 1024×1024, 24-bit RGB PNG with no alpha and pixel-equivalent color content to the canonical icon. The release binary continues to use `assets/icon.png`; the store export is review material, not a replacement app asset.
- `export/eatlog-free-product-icon-1024.png` and `export/eatlog-omelette-product-icon-1024.png`: 1024×1024 RGBA product artwork generated from the two plan SVGs.

The existing adaptive and monochrome Android assets remain the launcher sources in `app.json`. Do not redraw, trace, mask, round, recolor, or feed the egg artwork through a generative image tool.

Feature-graphic alt text: “Eatlog white egg-shaped nutrition scale mark centered on a dark background.”

References: [Google Play preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en) and [Apple app icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons/).
