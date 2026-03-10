"""
Minimal OpenCV.js whitelist for MCV web tooling.

For .py configs, embindgen expects:
  - module dicts like `core`, `imgproc`, ...
  - final merged flat dict in `white_list`
"""


def makeWhiteList(module_list):
    merged = {}
    for module in module_list:
        for key, values in module.items():
            if key in merged:
                merged[key] += values
            else:
                merged[key] = list(values)
    return merged


core = {
    "": [
        "split",
        "normalize",
    ],
    "Algorithm": [],
}

imgproc = {
    "": [
        "cvtColor",
        "Sobel",
    ],
}

calib3d = {
    "": [
        "Rodrigues",
        "solvePnP",
        "solvePnPRansac",
        "solvePnPRefineLM",
        # Required for world-point reprojection (reproject extension path).
        "projectPoints",
    ],
}

white_list = makeWhiteList([core, imgproc, calib3d])
