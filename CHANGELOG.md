# Changelog — Keyguard Designer (web)

Clinician-facing notes of what changed in each release. Internal test,
build, and quality-tooling changes are intentionally left out — this list
covers only what you can see or do differently in the app.

The release number shown here matches the one on **Settings → About**.

## Unreleased (next release)

### New features

- **Dark mode for the side panels.** The Customizer (right) and Console
  (bottom) panels can be switched between light and dark in
  **Settings → Colors → Panel theme**. The 3D view keeps its own
  background setting.
- **Mouse-wheel zoom amount.** A new slider in **Settings → Viewport**
  controls how far each wheel notch zooms in or out.
- **Choose how the model rotates.** **Settings → Viewport** offers
  rotation styles (free tumble, guided tumble, classic turntable) and a
  rotation-sensitivity slider.
- **"Export STL (precision)".** A new Export-menu option produces a
  cleaner, verified STL for the occasional design where the normal fast
  export leaves small surface artifacts. Slower, but reliable.
- **Exports no longer freeze the app.** STL/SVG exports run in the
  background: the app stays responsive (no more "Page unresponsive"
  message), a progress window shows elapsed time, and you can **Cancel** a
  long precision export at any time.
- **Viewport appearance settings.** Set the keyguard color, the 3D
  background color, and the Customizer text size in **Settings**.
- **Build-plate grid, Settings, and About.** A configurable reference grid
  you can match to your printer's build plate, a Settings (gear) panel, and
  an About tab.
- **Automatic screenshot handling.** When you add, replace, or remove the
  screenshot image in your project folder, the app detects the change and
  updates the underlay automatically.

### Improvements

- **Better default framing.** The keyguard fits snugly in the view and is
  shown at the same angle as OpenSCAD; the view re-fits when you change the
  display angle.
- **Reference grid sits below the model** instead of cutting through it.
- **New-preset name is pre-filled** when you add a preset, so it's quicker
  to save a variation.

### Bug fixes

- **Removed a small box artifact** that appeared in the upper-left of the
  3D view on dark backgrounds.
- **Fixed top-down view buttons** that rotated the model 90° the wrong way.
- **Fixed the app getting stuck** when a previously-opened project folder
  was missing or its access was denied — it now recovers and prompts you to
  pick the folder again.

## Release 2

The first widely-shared release. (Changes prior to this changelog being
started are not itemized here.)
