# MCV Controls and Usage Guide

This document explains how to use the MCV annotation tool, including every current mode, keybinding, and major interaction.

## 1. What the tool does

MCV lets you:

- Load media from a Media API, direct URL, or uploaded file.
- For videos, seek to an exact frame and extract a still image.
- Draw directed axis lines (`x`, `y`, `z`) on the image.
- Add anchors with world coordinates.
- Solve derived structure vertices from anchors + known edge lengths.
- Run pose solve (PnL/PnP-based backend solve) and get a `/tp` command.
- Save and reload full state using SVG (image + layers + JSON data).

## 2. Basic workflow

1. Pick media source:
   - `Videos` tab: choose a video from Media API.
   - `Images` tab: choose an image from Media API.
   - `Upload` tab: upload local image/video/SVG.
2. If video: set timestamp and click `Analyze!` to extract the current frame.
3. Annotate in draw mode (`1/2/3` or `Q/W/E`).
4. Add anchors in anchor mode (`A`) and enter world coordinates.
5. Run vertex solve (`S`) to propagate vertices through known lengths.
6. Run pose solve (`D`) from successful vertex solve.
7. Save with `Ctrl+S` to export SVG state.

Search/URL box behavior:

- Typing filters entries by name/id/url (and `youtube_id` for videos).
- Press `Enter` on a URL:
  - YouTube URL: resolves by video ID against Media API entries.
  - Non-YouTube URL:
    - If URL matches an API entry, opens that entry.
    - Else opens as raw direct media URL.

If a YouTube URL is not provided by Media API, the tool shows:

- `video is not provided by the Media API, please download the video yourself and upload it.`

## 3. Video viewer controls

Video panel includes:

- Native video controls.
- `HH:MM:SS|F` input (frame suffix `|F`, 0-indexed frame).
- `Copy link` button.
- `Open in YT` button (when `youtube_id` is available).
- `Analyze!` button (extract current frame).

Time input parsing supports:

- Plain seconds: `100`, `100.5`
- `MM:SS`: `1:24`
- `HH:MM:SS`: `1:24:10`
- YouTube-style units: `1h24m10s`
- Optional frame suffix in input: `...|F` (example: `1:24|12`)

Keyboard while video is active and no text field is focused:

- `,` = previous frame (`-1 frame`, based on detected video FPS)
- `.` = next frame (`+1 frame`, based on detected video FPS)
- `Left Arrow` = `-5s`
- `Right Arrow` = `+5s`
- `J` = `-10s`
- `L` = `+10s`

Frame-base note:

- `|F` is also interpreted with the detected video frame base (for example, 60 FPS uses `0..59`).
- If FPS cannot be inferred yet, the tool temporarily falls back to 30 FPS.

Unsaved-change protection:

- If annotations are unsaved, first click of `Analyze!` becomes confirmation (`Confirm overwrite`, red state).
- If annotations are unsaved, first click of `Back` becomes confirmation (`Confirm discarding changes`).
- Browser unload warning is enabled while unsaved changes exist.

## 4. Annotation modes

Modes:

- `draw` (default)
- `anchor`
- `edit`
- `vertexSolve`
- `poseSolve`

Switching modes:

- `A` -> anchor mode
- `4` -> edit mode
  - Exception: if an anchor is currently selected, `4` is treated as anchor text input and does not switch modes.
- `S` -> vertex solve mode
- `D` -> pose solve mode (only from successful vertex solve)
- `1/2/3/Q/W/E` -> return to draw mode from `anchor`, `edit` (if nothing selected), `vertexSolve`, or `poseSolve`

## 5. Draw mode controls

Axis/direction selection:

- `1` = `x` axis forward
- `2` = `y` axis forward
- `3` = `z` axis forward
- `Q` = `x` axis backward
- `W` = `y` axis backward
- `E` = `z` axis backward

The axes are coloured red, green, and blue respectively, the same as the debug menu crosshair colours in Minecraft.

Drawing:

- Left-click drag to draw a directed line, this line must be directed pointing in the positive direction of the axis.
- `Tab` while drawing flips arrow direction.
- Line is only committed if length is at least 2 pixels.

Edge length labeling:

- New lines start unlabeled (no `length` key).
- While drawing:
  - `Right-click` increments draft length.
  - `Arrow Up`, `=`, `+` increment length.
  - `Arrow Down`, `-`, `_` decrement length.
- Length `0` removes label.

Undo/redo (draw mode only):

- `Ctrl+Z` undo
- `Ctrl+Y` redo

Cancel current draft:

- `Esc` or `Enter` cancels current in-progress line.

## 6. Edit mode controls (`4`)

In edit mode:

- Closest line to cursor is highlighted.
- Left-click selects highlighted line.
- Selected line stays highlighted.

With a selected line:

- `Tab` flips direction.
- `1/2/3/Q/W/E` changes axis/direction.
- `Right-click`, `Arrow Up`, `=`, `+` increments length.
- `Arrow Down`, `-`, `_` decrements length.
- `Delete` removes selected line.
- `Esc` or `Enter` deselects line.

If no line is selected:

- `1/2/3/Q/W/E` exits edit mode to draw mode and sets axis.

## 7. Optical Optimizer (OPOP)

OPOP refines drawn lines using directional Sobel-based edge attraction plus straight-line regularization.

When it runs:

- After you release a newly drawn line (in draw mode), if OPOP is enabled.
- Refinement uses per-image Sobel caches:
  - Web target: cache in browser runtime.
  - Python target: cache in backend session.
- Cache is cleared on viewer exit/back and unload.

UI location:

- `Optical Optimisation` card under the media title section and above the annotation canvas.

Controls in that card:

- `Enabled` checkbox: master on/off.
- `Alignment strength`: how strongly points move toward detected edge response.
- `Straightness strength`: how strongly points are projected toward a best-fit line.
- `Whisker mode`:
  - `Pixels per whisker` (spacing-based), or
  - `Whiskers per line` (fixed count).
- `Whisker opacity`: overlay opacity for whiskers.
- `Normal search radius (px)`: whisker half-length / search distance from line (default `2px`).
- `Iterations`: number of optimizer update passes.
- `Include endpoints`: allows whiskers exactly at line endpoints when enabled.
- `Image smoothing`: toggles image rendering from pixelated (default off) to smooth interpolation.

Preview keys/layers:

- Hold backquote (`` ` ``): preview OPOP layer.
- Hold backquote + `Shift` (either key order): preview original annotation layer.
- Default render uses solved `structure` lines, built from OPOP where available and raw annotations as fallback.

Shift-drag no-go masking (new):

- While actively drawing a line, holding `Shift` paints no-go sections along the current line span.
- Whiskers are not spawned in those sections during the initial OPOP solve.
- Multiple separated no-go sections are supported in one draw.
- Tape-measure behavior:
  - Extending while holding `Shift` adds masked span.
  - Rotating without changing length keeps existing mask placement along the span.
  - Retracting trims mask from the tip side.
  - Retracted mask does not come back unless repainted by extending with `Shift` again.

## 8. Anchor mode controls (`A`)

Anchor mode purpose:

- Attach world coordinates to structure vertices.

Behavior:

- Arrowheads and length labels are hidden for clarity.
- Nearest structure vertex is highlighted (yellow dot).
- Related lines are lightened.
- Left-click:
  - Select existing anchor at that vertex, or
  - Create new anchor + linked vertex.

Anchor label editing (selected anchor only):

- Digits `0-9` append numeric text.
- `-` allowed at start of current token.
- `,` inserts separator `", "` (max 3 coordinate tokens).
- `Backspace` deletes one char or full separator token.
- `Space` is ignored.
- `Esc` or `Enter` deselects anchor.
- `Delete` deletes selected anchor (and corresponding anchor-linked vertex).

Coordinate mapping:

- Label `()` <-> no `x,y,z`.
- `(1)` <-> `x=1`
- `(1, 2)` <-> `x=1, y=2`
- `(1, 2, 3)` <-> `x=1, y=2, z=3`

## 9. Vertex solve mode (`S`)

What it does:

- Uses anchors as seeds.
- Runs BFS across connected lines with known length labels.
- Infers additional vertices in structure space.

Rendering in vertex solve:

- All lines shown white by default.
- Traversed known-length lines shown green.
- Anchors shown as green dots.
- Generated vertices shown as green dots.
- Conflict vertex shown red if inconsistent inference occurs.
- Nearest topology vertex to cursor shows coordinate label:
  - Normal: `(x, y, z)` with unknowns as `?`
  - Conflict vertex: `(x1, y1, z1) vs (x2, y2, z2)`

Important:

- Exiting solve mode purges generated non-anchor vertices.
- Anchor-linked vertices are preserved.

## 10. Pose solve mode (`D`)

Enter with:

- `D` from vertex solve mode when there is no vertex conflict.

Behavior:

- Replaces image view with pose result card.
- Shows `/tp` command (with `@s`) and copy button.
- Shows solve stats including:
  - Point counts/inliers
  - Initial/optimized focal + FOV
  - Reprojection RMSE
  - Camera position
  - Player position (`camera_y - 1.62`)
  - Yaw/pitch
- Includes reference input `x y z yaw pitch` with live error stats.
- Press `D` again in pose solve mode to rerun solve.

### Reprojection mode (`R`)

Enter with:

- `R` from pose solve mode after a successful solve.

Behavior:

- Solved lines render in axis colors.
- Unsolved lines render white.
- Nearest selectable vertex highlights as a yellow dot.
- Selected vertex shows blue.

Extensions:

- Click a vertex to select it as the extension start.
- Use keys to extend in world axes:
  - `1` / `Q` -> `+X` / `-X`
  - `2` / `W` -> `+Y` / `-Y`
  - `3` / `E` -> `+Z` / `-Z`
- Repeated keypresses in the same direction increase segment length.
- Opposite keypresses reduce length and remove empty segments.
- `Escape` clears selection and extension chain.

Anchoring from extension:

- While an extension is active, clicking any vertex anchors that vertex at the extension tip world position.
- This works for unknown and already-known vertices.
- After anchoring, MCV switches to anchor mode with that anchor selected for editing.

## 11. View navigation (pan/zoom)

General behavior:

- Cursor is `crosshair` normally.
- Hold `Ctrl` to enable movement mode (`move` cursor).
- While grabbing, cursor is `grabbing`.

Pan:

- Hold `Ctrl` + left drag on image to pan.
- While drawing a line, pressing/holding `Ctrl` temporarily grabs view for panning, then resumes line drawing when released.

Zoom:

- `Ctrl` + mouse wheel zooms around cursor.
- Wheel without `Ctrl` scrolls page normally.

Reset behavior:

- Resize window re-renders current view with fit sizing.

## 12. Structure and snapping behavior

MCV maintains two related line sets:

- `annotations`: raw user-drawn lines.
- `structure.lines`: auto-linked/refined lines used for solving/rendering.

Connection rules:

- Endpoints only connect across different axes.
- Proximity threshold is relative:
  - `threshold = clamp(median_line_length * 0.08, 2, 10)`

Geometry refinement:

- Connected endpoint components are solved from raw annotation lines each rebuild.
- 2-line component: infinite-line intersection (fallback to least squares).
- 3+ lines: least-squares intersection point.
- Structure endpoints in the component snap to that solved point.

## 13. Save and load state (SVG)

Save:

- `Ctrl+S` exports `<title>_state.svg`.
- Includes:
  - Embedded base image.
  - Inkscape layers: `base`, `annotations`, `opop`, `structure`, `anchors`, and optional `vertices`.
  - JSON state in `<script id="mcv-data" type="application/json">...</script>`.

Vertices layer export condition:

- Included only if currently in vertex solve mode and solve has no conflict.

Load:

- Uploading an MCV SVG restores:
  - Image
  - `MCV_DATA` annotations/structure/source
- If source is video and resolvable via Media API, the full video panel is mounted above the image and seeks to saved timestamp.

## 14. URL launch parameters

Supported query parameters:

- `?id=<media_id>&t=<seconds_or_time>&f=<frame>&fps=<frames_per_second>`
- `?yt=<youtube_id>&t=<seconds_or_time>&f=<frame>&fps=<frames_per_second>`

Examples:

- `?id=mcc11&t=100&f=30&fps=60`
- `?yt=jXfJpIQEIIg&t=1:24&f=0&fps=120`

Notes:

- `id` is preferred over `yt` when building share links.
- `f` is interpreted using `fps` when provided, otherwise using the current FPS input value.

## 15. Console APIs

Global objects:

- `window.MCV_API`
- `window.MCV_DATA`

`MCV_API` currently exposes:

- `MCV_API.media.available()`
- `MCV_API.media.fetch()`
- `MCV_API.media.url`
- `MCV_API.data.available()`
- `MCV_API.data.url`
- `MCV_API.mcv.call(...)`
- `MCV_API.mcv.runImagePipeline(...)` (exposed, currently not used by UI flow)
- `MCV_API.mcv.runPoseSolve(...)`
- `MCV_API.mcv.runOpopRefineLine(...)`
- `MCV_API.mcv.prepareSobelCache(...)`
- `MCV_API.mcv.clearSobelCache(...)`
- `MCV_API.mcv.opop.getSettings()`
- `MCV_API.mcv.opop.setSettings(...)`
- `MCV_API.mcv.backend` (`"web"` or `"python"`)

`MCV_DATA` shape:

- `annotations: Array<{ from:{x,y}, to:{x,y}, axis:'x'|'y'|'z', length?:number }>`
- `opop: Array<({ from:{x,y}, to:{x,y}, axis:'x'|'y'|'z', length?:number } | null)>`
- `structure:`
  - `lines: Array<{ from:{x,y,from[],to[],anchor?,vertex?}, to:{...}, axis, length? }>`
  - `anchors: Array<{ from:number[], to:number[], vertex:number, x?,y?,z? }>`
  - `vertices: Array<{ from:number[], to:number[], anchor?, x?,y?,z? }>`
- `source?`:
  - Media API source: `{ type:'video'|'image', id, name, url, youtube_id?, seconds?, frames?, fps? }`
  - Uploaded video source: `{ type:'video', filename, seconds, frames, fps? }`
