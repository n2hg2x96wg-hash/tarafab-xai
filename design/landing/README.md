# Landing hero images

`public/landing/hero-bitcoin-*.webp` are original renders (no stock photography),
made from `hero-bitcoin-scene.html`: a three.js scene (PBR gold coins, procedural
basalt, warm studio lighting) finished with depth of field, bokeh, vignette and grain.

Desktop framing used: `?w=2560&h=1280&cx=2.0&s2x=-1.0&s2z=0.55`.

Re-render: serve this folder with `three@0.160.0` installed next to it
(`npm i three@0.160.0`), open `hero-bitcoin-scene.html?w=2560&h=1280` in Chromium,
and save `window.__done` (a PNG data URL). Phone framing:
`?w=1200&h=900&camx=1.15&fov=31`. Encode to WebP at quality ~0.8.

To use a licensed photograph instead, replace the three WebP files with images of
the same names and proportions (2:1 wide, 4:3 phone).
