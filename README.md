# What does MCV do?

Minecraft Computer Vision (MCV) is a tool for recreating Minecraft player poses from images and video. It lets you label points on a Minecraft world image ~~with edge-detection assistance~~ by drawing lines, pair those points with in-game world coordinates, and then solve the PnP problem (estimating camera pose and focal length from 2D-3D correspondences). This tool was created to assist in collecting evidence for the Dream MCC 11 Parkour cheating controversy, but it can be used for many other applications. For those reasons, it is open source and free for anyone to use.

# Where does it run?

MCV targets both Python and Web and provides maximum flexibility, allowing you to run it entirely online or entirely offline. The web version is a React component that can be embedded in any website, and the Python version is a standalone script that hosts a local Flask server. Both versions have the same core functionality and can be used to label points, solve PnP, and process the data to find positions on tick boundaries and export your findings.

# Applications

- Detecting cheating from gameplay footage by accurately tracking player movements, mainly useful for parkour
- Recreating maps more accurately by using an already recreated section to align camera pose and focal length, then using that alignment to construct the rest of the map very precisely without manually lining up your view.
  - Map recreations are also helpful for seed cracking, and have been used before to find the seeds of PewDiePie's survival world as well as the world from the `pack.png` placeholder texture.

# But what about tick alignment?

Minecraft linearly interpolates player movement between ticks, meaning a single screenshot does not have enough information to determine the location a player actually was on a tick boundary, just a sample along the line they were travelling on.
However, if you have video and the frame rate is at least 40 FPS, this problem can be solved.

To solve this problem, you first need frame-level tick alignment. The best way to extrapolate this data is through animated textures (like fire) and particle effects (like running particles), because those animations swap frames on each tick boundary. MCV can be used to label these frame-change events by drawing a box around the animated texture one tick before and one tick after it changes, so you can show where the data came from. This tells you which two frames a tick occurred between.

From this, you can isolate which frames lie on a line segment between tick locations. By sampling all available points along a line (2 for 40 FPS+, 3 for 60 FPS+, etc.) for two consecutive line segments, you can find the intersection of those line segments to estimate the tick-boundary location with subframe accuracy using a least-squares regression solver.

# Finding the world coordinates

To find the world coordinates of a point, you can use debug mode (`F3`), stand on top of a corner, look straight down, and crouch to align your cursor with the corner. Your player coordinates will then be the world coordinates of that corner. If you cannot stand directly on top of a block because something is above it, you can either break what is above it and replace it later, or measure a different corner and shift it by the appropriate amount to get the coordinates you want.

In the future, I hope to make either a server-side or client-side tool that lets you walk up to a corner and click it to automatically get world coordinates, or a 3D voxel viewer where you can import a world or structure NBT and click corners to get coordinates.

# What's included in the repo?

- /examples
  - /labeled: Some real examples of labeled points and their corresponding world coordinates, along with the original images and ground truths for testing the PnP system.
  - /images: Some random images that can be used for testing the corner selector tool and ~~edge detection~~.
- /python_prototype: My first working prototype of the corner selector tool and PnP solver, written in Python using OpenCV.

# Build

Build uses Node + esbuild.

Install dependencies:

```bash
npm install
```

Build targets:

```bash
npm run build:python
npm run build:web
```

The Python target is a standalone script that hosts a local Flask server using the official OpenCV Python library.
The web target is an embeddable React component that can be used in websites.
The web target depends on OpenCV.js, which is not bundled with the app. You need to build it yourself using `build_opencv_js_single.py` and host it on your website, or use a CDN version.

- `build:web` outputs:
  - `dist/common/app.bundle.js`
  - `dist/common/index.inline.html`
  - `dist/web/index.html`
  - `dist/web/MCV.tsx`
- `build:python` outputs:
  - `dist/common/app.bundle.js`
  - `dist/common/index.inline.html`
  - `dist/python/mcv_standalone.py`

Build config is in `build/config.json`:

- `common`:
  - `media_api`: relative media API path (example: `/mcv/media.json`)
  - `data_api`: relative data API path (example: `/mcv/data`)
  - `website_url`: absolute site base URL for media/data APIs (example: `https://dartjs.com`)
- `web`:
  - `site_root`: root of your website project, all other web paths are relative to this
  - `component_dest`: destination folder for `MCV.tsx`
  - `opencv_dest`: destination folder for `opencv.js` (optional if you don't build it yourself)
  - `opencv_url`: runtime URL used by the app to load OpenCV.js (example: `/opencv.js`)
- `python`:
  - reserved for Python-target settings

Media API behavior:

- Web target uses `common.media_api` and `common.data_api` directly (relative paths, works on localhost/dev).
- Python uses absolute paths constructed by combining `common.website_url` with `common.media_api` and `common.data_api`.
- If either API path is omitted, that API is disabled by default.

Media API schema docs are in `APIs.md`.

## Build OpenCV.js

OpenCV.js is built with the helper script in `build/build_opencv_js_single.py`.

Prereqs:

- Emscripten SDK installed and activated
- CMake
- Ninja

Typical Windows flow:

```bat
C:\dev\build\emsdk\emsdk_env.bat
python build\build_opencv_js_single.py --run
```

Useful flags:

- `--clean` to clean the OpenCV.js build dir
- `--simd` / `--no-simd` to toggle WASM SIMD
- `--cmake-option=...` to pass extra CMake options

Expected output (automatically picked up by the web build):

- `build/opencv_js_mcv_single/bin/opencv.js`

Whitelist used for exported JS bindings:

- `build/opencv_js_mcv_whitelist.py`

# Coming soon

I plan to host a version of the tool on my website, https://dartjs.com, specifically for collecting evidence for the Dream controversy so we can crowdsource data collection and publish the data publicly for anyone to analyze. I also plan to analyze the data myself, publish the results, and share them with YouTubers to present the evidence in an easy-to-understand way.

Let's find out whether or not he cheated together!
