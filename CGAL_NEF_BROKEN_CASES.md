# CGAL Nef-probe "broken" cases — for manual investigation

Calibration run: 2026-05-20T04:53:24.169Z  (160 steps total, 9.3 min wall time)

These 56 of 160 test-case steps had their Manifold-rendered STL flagged
by CGAL's Nef-conversion probe (`ERROR: The given mesh is not closed!`).
This is the same probe we considered for an auto-warning dialog. At 35% of
all cases, the false-positive risk is too high to ship the auto-check —
but the list below identifies every case for which CGAL disagrees with
admesh's `disconnected==0` verdict, so each one is worth checking by hand:

1. Render the listed preset through native OpenSCAD (`scripts/render.sh` or
   manual `openscad -o ... -P "<preset>" keyguard.scad`).
2. Load the resulting STL into a slicer.
3. Classify:
   - **Genuinely broken**: visible membranes, holes, floating pieces — like TC57.
     These point at additional Manifold UB shapes worth fixing at the .scad level.
   - **CGAL-strict false positive**: looks normal in slicer (no membranes, prints fine).
     CGAL refuses to certify the STL but the mesh is functionally OK.

TC57 step 1 is in this list and IS genuinely broken — the canonical case
that started this whole investigation. It serves as the calibration anchor:
whatever the failure mode TC57 has, the other 55 are probably worth ranking
against it.

| # | Case | Step | Preset | Label |
|---|---|---|---|---|
| 1 | Test Case 1 | 1 | `Test Case 1` | starting view |
| 2 | Test Case 2 | 1 | `Test Case 2` | starting view |
| 3 | Test Case 12 | 2 | `Test Case 12a` | increase the keyguard thickness |
| 4 | Test Case 12 | 3 | `Test Case 12b` | increase the ridge height |
| 5 | Test Case 12 | 4 | `Test Case 12c` | increase the ridge thickness |
| 6 | Test Case 13 | 1 | `Test Case 13` | laser-cut view |
| 7 | Test Case 13 | 2 | `Test Case 13a` | 3D-printed view |
| 8 | Test Case 17 | 1 | `Test Case 17` | shelf |
| 9 | Test Case 17 | 2 | `Test Case 17a` | vary shelf thickness, depth, and corner radius |
| 10 | Test Case 17 | 3 | `Test Case 17b` | vary keyguard and frame thickness |
| 11 | Test Case 17 | 4 | `Test Case 17c` | raised tabs |
| 12 | Test Case 17 | 6 | `Test Case 17e` | generate keyguard,snap-in tab on bottom edge of keyguard - no |
| 13 | Test Case 17 | 7 | `Test Case 17f` | keyguard v/h tightness of fit - -1 |
| 14 | Test Case 17 | 8 | `Test Case 17g` | keyguard v/h tightness of fit - 1 |
| 15 | Test Case 17 | 9 | `Test Case 17h` | vertical raised tabs only |
| 16 | Test Case 17 | 10 | `Test Case 17i` | horizontal and vertical raised tabs |
| 17 | Test Case 17 | 11 | `Test Case 17j` | vertical raised tabs only - plain keyguard |
| 18 | Test Case 17 | 12 | `Test Case 17k` | horizontal and vertical raised tabs - plain keyguard |
| 19 | Test Case 18 | 2 | `Test Case 18a` | suction cups |
| 20 | Test Case 20 | 3 | `Test Case 20b` | bar corner radius 5 |
| 21 | Test Case 21 | 1 | `Test Case 21` | base view |
| 22 | Test Case 21 | 2 | `Test Case 21a` | set cell height to 25 |
| 23 | Test Case 21 | 3 | `Test Case 21a` | The cell height has been adjusted to 15 mm (or 193 px) in order to fit properly. |
| 24 | Test Case 23 | 3 | `Test Case 23b` | cell corner radius - 8 |
| 25 | Test Case 25 | 1 | `Test Case 25` | upper left |
| 26 | Test Case 25 | 2 | `Test Case 25a` | lower left |
| 27 | Test Case 28 | 2 | `Test Case 28a` | lower left |
| 28 | Test Case 29 | 1 | `Test Case 29` | upper left |
| 29 | Test Case 30 | 1 | `Test Case 30` | upper left |
| 30 | Test Case 30 | 2 | `Test Case 30a` | lower left |
| 31 | Test Case 31 | 1 | `Test Case 31` | upper left |
| 32 | Test Case 31 | 2 | `Test Case 31a` | lower left |
| 33 | Test Case 32 | 1 | `Test Case 32` | upper left |
| 34 | Test Case 33 | 2 | `Test Case 33a` | lower left |
| 35 | Test Case 34 | 1 | `Test Case 34` | upper left |
| 36 | Test Case 34 | 2 | `Test Case 34a` | lower left |
| 37 | Test Case 35 | 1 | `Test Case 35` | upper left |
| 38 | Test Case 35 | 2 | `Test Case 35a` | lower left |
| 39 | Test Case 40 | 2 | `Test Case 40a` | frame |
| 40 | Test Case 44-1 | 1 | `Test Case 44-1` | base model |
| 41 | Test Case 44-2 | 1 | `Test Case 44-2` | base model |
| 42 | Test Case 44-3 | 1 | `Test Case 44-3` | base model |
| 43 | Test Case 46 | 2 | `Test Case 46a` | rotate 180 degrees=no |
| 44 | Test Case 47 | 1 | `Test Case 47` | base model |
| 45 | Test Case 47 | 2 | `Test Case 47a` | change text depth to +2 |
| 46 | Test Case 47 | 3 | `Test Case 47b` | change text depth to -3 |
| 47 | Test Case 47 | 4 | `Test Case 47b` | render |
| 48 | Test Case 48 | 1 | `Test Case 48` | base model |
| 49 | Test Case 48 | 2 | `Test Case 48a` | change text depth to -5 |
| 50 | Test Case 48 | 3 | `Test Case 48a` | render |
| 51 | Test Case 52 | 1 | `Test Case 52` | full view |
| 52 | Test Case 52 | 2 | `Test Case 52` | close-up on centre opening chamfer |
| 53 | Test Case 53 | 1 | `Test Case 53` | top view |
| 54 | Test Case 54 | 1 | `Test Case 54` | top view |
| 55 | Test Case 54 | 2 | `Test Case 54` | bottom view |
| 56 | Test Case 57 | 1 | `Test Case 57` | top-down view |

Source: `output/cgal-probe-calibration.json` (full bucket data including
the 62 "clean", 31 "inconclusive", and 11 "renderFailed" cases).
