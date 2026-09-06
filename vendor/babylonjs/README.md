# Vendored Babylon.js

`babylon.js` is the global-script (UMD-style, `window.BABYLON`) build of
Babylon.js **9.25.0**, obtained via `npm pack babylonjs@9.25.0` (the
legacy monolithic `babylonjs` package, which still publishes this build
alongside the modern scoped `@babylonjs/*` ES-module packages) and
copied in unmodified. MIT licensed, © Babylon.js contributors.

Vendored (rather than loaded from a CDN) so `index.html` keeps working
fully offline with no build step — see NOTES.md's "3D panel redesign"
section for why this engine/build was chosen over Three.js.

To update: `npm pack babylonjs@<version>` and replace `babylon.js` with
`package/babylon.js` from the resulting tarball.
