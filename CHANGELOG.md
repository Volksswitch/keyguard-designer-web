# Changelog — Keyguard Designer (web)

Clinician-facing notes of what changed in each release. Internal test,
build, and quality-tooling changes are intentionally left out — this list
covers only what you can see or do differently in the app.

The release number shown here matches the one on **Settings → About**.

## Unreleased (next release)

_Nothing yet._

## Release 6

### New features

- **Recent Projects and quick project switching.** The app now remembers the folders you have recently opened. When no project is loaded, a "Recent projects" dropdown lets you reopen a folder in one click. When a project is already open, the Change Project button shows a short list of other known folders alongside a "Pick a different folder…" option — no need to navigate through the file browser each time. Stale entries (folders that have been moved or deleted) remove themselves automatically.

- **Sliders for adjustable settings.** Settings that accept a range of values now show a draggable slider alongside the number box. You can drag the slider or type a number — both stay in sync.

- **Save a preset as a file.** A new save button (💾) lets you export the current preset's settings to a standalone file. Useful for backing up a design configuration or sharing it with a colleague.

- **Mouse wheel speed setting.** A new "Customizer mouse-wheel step" setting (in General settings) controls how many rows the mouse wheel advances at a time. Default is 3 rows per notch.

- **Bold and italic text style options.** Settings → Text tab now has checkboxes to make section headings and setting labels bold or italic.

### Improvements

- **3D preview shading matches printed output more closely.** The highlight and shadow contrast in the 3D view has been tuned to better match what OpenSCAD renders, making the preview a more reliable guide to the final keyguard appearance.

- **Numeric fields show the right number of decimal places.** Number inputs now display the appropriate decimal places for their step size (e.g. a 0.1-step field shows "4.0" rather than "4"), matching the behaviour of the OpenSCAD Customizer.

### Bug fixes

- **Mouse wheel no longer gets stuck when all sections are collapsed.** Scrolling the settings panel now works correctly even when every section is closed.

- **Dropdown values no longer go blank.** Dropdown settings no longer showed a blank value when the current setting was very close to — but not exactly matching — a valid option. This affected some preset values that use non-round numbers.

- **Expanding a section no longer scrolls it off screen.** Clicking a section header to open it now keeps that header visible at the top of the panel.

- **Cell openings with no corner rounding now cut all the way through.** In some keyguards where the cell corner rounding was set to zero, cells could have a very thin film of material left across the opening. This has been fixed.

- **Sloped cell edges no longer incorrectly trimmed.** When a cell opening had sides that angle inward (an undercut slope), the bridge of plastic behind the opening was incorrectly cutting into the angled wall. The slope is now preserved correctly.

- **Six presets with a dovetail split line now render the dovetail correctly.** A typographical error in six saved presets meant the dovetail joint setting was silently ignored, producing a flat split instead. This has been corrected.

## Release 5

### New features

- **Orientation gizmo.** A small OpenSCAD-style corner navigator (red X / green Y / blue Z)
  sits in the lower-left of the 3D view and rotates with the model so you always know which
  way the keyguard is facing.

### Improvements

- **Pane sizes are remembered.** The Customizer panel width and console height are saved
  between sessions and restored on reload.
- **Project and preset shown in console.** The current project folder name and preset are
  logged to the console when you click Render, making it easier to track which design is
  which in a long session.

### Bug fixes

- **File replacements now detected reliably.** Swapping in a same-name
  `openings_and_additions.txt` or screenshot image (same filename, different contents) no
  longer leaves the app rendering against the old file. The watchers now check file contents,
  not just timestamps — a common pitfall with OneDrive sync and batch-copied files.
- **Non-printable generate options blocked from STL export.** Choosing a 2D or diagnostic
  option from the Generate dropdown and then exporting now shows a clear message instead of
  silently downloading a 0-byte file.
- **2D generate option hidden from dropdown.** The "first layer for SVG/DXF file" option
  (only reachable via Export → SVG) has been removed from the Generate dropdown to prevent
  the above confusion.

## Release 4

### New features

- **Screenshot picker.** When a project folder holds more than one image and
  the screenshot overlay is on, a picker appears at the top-right of the 3D
  view so you can choose which image shows through the cutouts.

### Bug fixes

- **Multiple screenshot images no longer misbehave.** With two or more images
  in the folder, the app could spam the console with an endless "Screenshot:
  using …" loop and pop a false "no image found" message. The app now picks
  images consistently and the messages are correct.

## Release 3

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
