# Changelog — Keyguard Designer (web)

Clinician-facing notes of what changed in each release. Internal test,
build, and quality-tooling changes are intentionally left out — this list
covers only what you can see or do differently in the app.

The release number shown here matches the one on **Settings → About**.

## Unreleased (next release)

## Release 16

### New features

- **Undo and redo your Customizer changes.** Undo and redo buttons in the command bar (next to Settings) let you step back and forward through changes you've made in the Customizer. You can also use the keyboard: Ctrl/Cmd+Z to undo, and Ctrl/Cmd+Shift+Z (or Ctrl+Y) to redo — so you can experiment freely and back out a change without starting over.

- **See what's new after an app update.** When the app updates itself to a newer version, it now shows a short "What's new" summary of the features and fixes you've just received, so you always know what changed.

## Release 15

### Fixes

- **Keyguard-frame presets now work correctly.** Opening a saved configuration set to generate a keyguard *frame* could pop up a false "Have a keyguard frame is set to no" message and refuse to build it, even when the configuration did include a frame. Keyguard frames now render and export normally.

## Release 14

### Fixes

- **Open Project no longer gets stuck on a wrong first pick.** If your first folder choice didn't contain a keyguard program (`.scad` file), the app warned you but then kept reopening that same folder instead of letting you choose another. It now returns you to the folder picker so you can select the right project.

## Release 13

### New features

- **The app keeps your keyguard program up to date.** When you open a project, if a newer version of `keyguard.scad` has been published, the app offers to download it for you — replacing your old file and carrying your saved presets forward. You can update now, be reminded in a week, or skip. The notice lists what changed in the new version so you can decide whether you need it.

- **The app updates itself automatically.** You no longer need to hard-refresh (Ctrl+Shift+R) to get the newest version of the app. When a new version is published, the app refreshes to it on its own the next time you open it or open a project.

## Release 12

### Improvements

- **Skill level selector is easier to find.** The Beginner / Intermediate / Advanced selector has moved from the Settings panel to the top of the Customizer, so you can switch skill levels without opening Settings.

- **Clearer export-preset icon.** The preset-export button now uses a download-tray icon instead of a floppy disk, making it easier to distinguish from save.

- **3D viewport recovers from graphics interruptions.** If the browser's graphics context is lost (for example, after waking from sleep or a GPU driver hiccup), the 3D viewport now recovers automatically instead of going blank.

## Release 11

### New features

- **Open and import preset files.** Two new buttons next to the preset save (💾) button let you work with preset JSON files from anywhere on your computer. The **📂 Open** button switches to a different preset file — all add, delete, save, and reset actions then apply to that file. The **📂⁺ Import** button merges presets from another file into the current one; duplicate names are automatically renamed with a "(1)" suffix.

- **Export preset button always available.** The 💾 export button is now enabled as soon as you make a change, without needing to save first.

### Improvements

- **Export buttons are now text labels.** The export toolbar shows **STL**, **STL\***, **SVG**, and **PNG** as compact text buttons instead of icons, making them easier to identify and leaving room for future formats.

- **Grid adapts to background colour.** The reference grid now uses colours that contrast with whatever background you've chosen — lighter lines on dark backgrounds, darker lines on light ones. Major (50 mm) lines are drawn visibly thicker than minor (10 mm) lines.

- **Toolbar no longer overflows into the Customizer.** When the browser window is narrow, the viewport toolbar clips cleanly instead of the export control sliding over the settings panel.

### Bug fixes

- **Saving a preset no longer drops hidden parameters.** Presets saved at Beginner or Intermediate skill level previously lost any parameter values that were hidden by the skill filter (such as "App Layout in px" settings). All parameter values are now preserved regardless of skill level.

- **Imported advanced presets keep their values at lower skill levels.** Dropdown values from an advanced preset that aren't visible at the current skill level (such as specific mounting methods or tablet types) are now held in place so they round-trip correctly through save and reload.

## Release 9

### Bug fixes

- **Trackpad scrolling in the Customizer panel now feels natural.** On devices with a trackpad (such as a MacBook), scrolling the settings list previously jumped too far with each gesture. It now scrolls smoothly and proportionally, matching the feel of any other scrollable panel.

- **Pinch-to-zoom now works in the 3D viewport.** Pinching or spreading on a trackpad to zoom the 3D view previously produced almost no movement, even with zoom sensitivity set to maximum. Pinch and spread now zoom in and out at a natural pace.

### Improvements

- **Scroll and zoom setting names are now input-device neutral.** "Customizer mouse-wheel step" is now **Customizer scroll step** and "Mouse-wheel zoom amount" is now **Zoom sensitivity**. The descriptions confirm that these settings apply to all pointing devices, not just a mouse wheel.

## Release 8

### New features

- **Skill level setting.** A new **Skill level** option in **Settings → General** filters the Customizer to show only the settings relevant to your experience. **Beginner** shows the essentials for a basic grid keyguard. **Intermediate** adds grid opening, mounting, and split-keyguard options. **Advanced** shows everything, including pixel measurements, frames, and engraved text.

### Improvements

- **Wider rotation and zoom slider ranges.** The rotation sensitivity and zoom speed sliders in **Settings → Viewport** now reach further in both directions, making it easier to dial in very slow or very fast viewport controls.

## Release 7

### Improvements

- **SVG/laser-cut export now shows clear error messages for unsupported combinations.** Trying to export an SVG for clips, cell inserts, split keyguards, or a keyguard with a frame now shows a plain-language alert explaining what the problem is and what to do instead, rather than producing no output or a confusing error.

- **Exported filenames include what was generated.** The downloaded file is now named to include the *Generate* setting (for example, `…-frame.stl` or `…-cell-insert.stl`), making it easier to tell files apart when you have exported several things from the same design.

- **3D preview appearance now matches OpenSCAD more closely.** A new OpenSCAD-style lighting mode uses camera-relative lighting that closely matches what you see in the desktop OpenSCAD application. Background colour and item colour have also been adjusted to match OpenSCAD's defaults.

- **Settings panel is draggable and has clearer labels.** The settings panel can now be moved anywhere on screen by dragging. Colour and lighting option labels have been renamed to be more descriptive.

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
