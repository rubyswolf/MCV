from __future__ import annotations

import argparse
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path


def make_parser() -> argparse.ArgumentParser:
    repo_root = Path(__file__).resolve().parents[1]
    default_opencv_dir = repo_root / "build" / "opencv"
    default_output_dir = repo_root / "build" / "opencv_js_mcv_single"
    default_config = repo_root / "build" / "opencv_js_mcv_whitelist.py"

    parser = argparse.ArgumentParser(
        description="Build a single-file OpenCV.js bundle for MCV.",
    )
    parser.add_argument(
        "--opencv-dir",
        type=Path,
        default=default_opencv_dir,
        help="Path to OpenCV source (submodule root).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_output_dir,
        help="Output build directory for OpenCV.js artifacts.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=default_config,
        help="Whitelist config file for OpenCV.js exports.",
    )
    parser.add_argument(
        "--emscripten-dir",
        type=Path,
        default=None,
        help="Path to Emscripten directory (contains emcc.py). Auto-detected if omitted.",
    )
    parser.add_argument(
        "--build-type",
        default="Release",
        choices=["Release", "Debug", "RelWithDebInfo", "MinSizeRel"],
        help="CMake build type.",
    )
    parser.add_argument(
        "--simd",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable WebAssembly SIMD (default: on).",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean output dir before configuring/building.",
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Actually run the OpenCV.js build. Without this flag, only print the command.",
    )
    parser.add_argument(
        "--cmake-exe",
        type=Path,
        default=None,
        help="Path to cmake executable. Auto-detected if omitted.",
    )
    parser.add_argument(
        "--generator",
        default="Ninja",
        choices=["Ninja"],
        help="CMake generator to use (default: Ninja).",
    )
    parser.add_argument(
        "--cmake-option",
        action="append",
        default=[],
        help="Extra CMake option forwarded as --cmake_option=<value>.",
    )
    parser.add_argument(
        "--suppress-deprecated-warnings",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Suppress noisy Emscripten/OpenCV deprecation warnings during build (default: on).",
    )
    return parser


def quote_cmd(cmd: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in cmd)


def validate_paths(opencv_dir: Path, config_path: Path) -> Path:
    build_js = opencv_dir / "platforms" / "js" / "build_js.py"
    if not build_js.exists():
        raise FileNotFoundError(f"OpenCV JS build script not found: {build_js}")
    if not config_path.exists():
        raise FileNotFoundError(f"Whitelist config not found: {config_path}")
    return build_js


def resolve_cmake_exe(explicit: Path | None) -> Path | None:
    candidates: list[Path] = []
    if explicit is not None:
        candidates.append(explicit)

    which_cmake = shutil.which("cmake")
    if which_cmake:
        candidates.append(Path(which_cmake))

    candidates.append(Path("C:/Program Files/CMake/bin/cmake.exe"))
    candidates.append(Path("C:/Program Files (x86)/CMake/bin/cmake.exe"))

    for cand in candidates:
        cand = cand.resolve()
        if cand.exists():
            return cand
    return None


def resolve_emscripten_dir(explicit: Path | None, repo_root: Path) -> Path | None:
    candidates: list[Path] = []
    if explicit is not None:
        candidates.append(explicit)

    env_emscripten = os.environ.get("EMSCRIPTEN")
    if env_emscripten:
        candidates.append(Path(env_emscripten))

    env_emsdk = os.environ.get("EMSDK")
    if env_emsdk:
        candidates.append(Path(env_emsdk) / "upstream" / "emscripten")

    # Common local install path used in this project setup.
    candidates.append(Path("C:/dev/build/emsdk/upstream/emscripten"))
    # Relative fallback near repository root.
    candidates.append((repo_root.parent / "build" / "emsdk" / "upstream" / "emscripten"))
    candidates.append(Path("C:/dev/emsdk/upstream/emscripten"))

    for tool in ("emcc", "em++", "emcc.bat", "em++.bat"):
        tool_path = shutil.which(tool)
        if not tool_path:
            continue
        tool_parent = Path(tool_path).resolve().parent
        candidates.append(tool_parent)
        # If emcc is in upstream/emscripten, include that exact dir explicitly.
        if tool_parent.name.lower() == "emscripten":
            candidates.append(tool_parent)

    for cand in candidates:
        cand = cand.resolve()
        if (cand / "emcc.py").exists() or (cand / "emcc").exists() or (cand / "emcc.bat").exists():
            return cand
    return None


def resolve_ninja_exe() -> Path | None:
    candidates: list[Path] = []

    which_ninja = shutil.which("ninja")
    if which_ninja:
        candidates.append(Path(which_ninja))

    candidates.append(Path("C:/Program Files/CMake/bin/ninja.exe"))
    candidates.append(
        Path(
            "C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/"
            "Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe"
        )
    )
    candidates.append(
        Path(
            "C:/Program Files/Microsoft Visual Studio/2022/Community/"
            "Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe"
        )
    )

    for cand in candidates:
        cand = cand.resolve()
        if cand.exists():
            return cand
    return None


def resolve_emscripten_version(emscripten_dir: Path | None) -> str | None:
    if emscripten_dir is None:
        return None

    candidates = [
        emscripten_dir / "emcc.bat",
        emscripten_dir / "emcc",
    ]
    emcc = next((cand for cand in candidates if cand.exists()), None)
    if emcc is None:
        return None

    try:
        result = subprocess.run(
            [str(emcc), "--version"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return None

    version_text = (result.stdout or "") + "\n" + (result.stderr or "")
    match = re.search(r"\b(\d+\.\d+\.\d+)\b", version_text)
    if match:
        return match.group(1)
    return None


def main() -> None:
    parser = make_parser()
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    opencv_dir = args.opencv_dir.resolve()
    output_dir = args.output_dir.resolve()
    config_path = args.config.resolve()
    build_js = validate_paths(opencv_dir, config_path)
    emscripten_dir = resolve_emscripten_dir(args.emscripten_dir, repo_root)
    emscripten_version = resolve_emscripten_version(emscripten_dir)
    cmake_exe = resolve_cmake_exe(args.cmake_exe)
    ninja_exe = resolve_ninja_exe()

    if cmake_exe is None:
        raise RuntimeError(
            "Could not find CMake. Install CMake and reopen the shell.\n"
            "Quick check after install: cmake --version"
        )

    cmd = [
        sys.executable,
        str(build_js),
        str(output_dir),
        "--opencv_dir",
        str(opencv_dir),
        "--emscripten_dir",
        str(emscripten_dir) if emscripten_dir is not None else "",
        "--build_wasm",
        "--config",
        str(config_path),
        "--config_only",
        f"--cmake_option=-DCMAKE_BUILD_TYPE={args.build_type}",
        "--cmake_option=-DCMAKE_CXX_STANDARD=17",
        "--cmake_option=-DBUILD_LIST=core,imgproc,calib3d,js",
        "--cmake_option=-DBUILD_TESTS=OFF",
        "--cmake_option=-DBUILD_PERF_TESTS=OFF",
        "--cmake_option=-DBUILD_EXAMPLES=OFF",
        "--cmake_option=-DBUILD_DOCS=OFF",
    ]
    if args.generator == "Ninja":
        if ninja_exe is None:
            raise RuntimeError(
                "Ninja generator requested, but ninja.exe was not found. "
                "Install Ninja or pass --cmake-option=-G<other-generator> manually."
            )
        cmd.append("--cmake_option=-GNinja")
        cmd.append(f"--cmake_option=-DCMAKE_MAKE_PROGRAM={ninja_exe}")
    if emscripten_dir is not None:
        toolchain = (emscripten_dir / "cmake" / "Modules" / "Platform" / "Emscripten.cmake").resolve()
        cmd.append(f"--cmake_option=-DCMAKE_TOOLCHAIN_FILE={toolchain}")
        cmd.append(f"--cmake_option=-DCMAKE_C_COMPILER={(emscripten_dir / 'emcc.bat').resolve()}")
        cmd.append(f"--cmake_option=-DCMAKE_CXX_COMPILER={(emscripten_dir / 'em++.bat').resolve()}")
        if emscripten_version is not None:
            # Ensure OpenCV JS CMake logic knows the SDK version and can skip deprecated flags.
            cmd.append(f"--cmake_option=-DEMSCRIPTEN_VERSION={emscripten_version}")
    for opt in args.cmake_option:
        cmd.append(f"--cmake_option={opt}")
    if args.simd:
        cmd.append("--simd")
    if args.suppress_deprecated_warnings:
        cmd.append(
            "--build_flags=-Wno-deprecated-declarations -Wno-deprecated-pragma -Wno-unused-command-line-argument"
        )
    if args.clean:
        cmd.append("--clean_build_dir")

    # Remove unresolved placeholder if no emscripten dir was found.
    if emscripten_dir is None:
        cmd = [x for x in cmd if x != "--emscripten_dir" and x != ""]

    print("Prepared OpenCV.js single-file build command:")
    print(quote_cmd(cmd))
    print()
    print("Notes:")
    print(f"- Using cmake at: {cmake_exe}")
    if ninja_exe is not None:
        print(f"- Using ninja at: {ninja_exe}")
    if emscripten_dir is not None:
        print(f"- Using emscripten at: {emscripten_dir}")
        if emscripten_version is not None:
            print(f"- Detected emscripten version: {emscripten_version}")
        else:
            print("- Could not parse emscripten version from emcc --version.")
    else:
        print("- Emscripten path was not auto-detected.")
    print("- This command builds single-file output (no --disable_single_file).")
    if args.suppress_deprecated_warnings:
        print(
            "- Warning spam is suppressed "
            "(-Wno-deprecated-declarations -Wno-deprecated-pragma -Wno-unused-command-line-argument)."
        )
    print("- Expected output file: <output-dir>/bin/opencv.js")

    build_cmd = [
        str(cmake_exe),
        "--build",
        str(output_dir),
        "--config",
        args.build_type,
        "--parallel",
    ]
    print()
    print("Build step base command:")
    print(quote_cmd(build_cmd))
    print("Build target: opencv_js")

    if not args.run:
        print()
        print("Dry run only. Re-run with --run to execute.")
        return

    if emscripten_dir is None:
        raise RuntimeError(
            "Could not find Emscripten. Make sure an SDK is installed and activated, then run "
            "emsdk_env.bat in this shell, or pass --emscripten-dir <path-to-emsdk/upstream/emscripten>."
        )

    env = os.environ.copy()
    cmake_bin = str(cmake_exe.parent)
    env["PATH"] = cmake_bin + os.pathsep + env.get("PATH", "")
    emsdk_root = emscripten_dir.parents[1]
    env["EMSCRIPTEN"] = str(emscripten_dir)
    env["EMSCRIPTEN_ROOT"] = str(emscripten_dir)
    env["EMSDK"] = str(emsdk_root)
    env["CC"] = str((emscripten_dir / "emcc.bat").resolve())
    env["CXX"] = str((emscripten_dir / "em++.bat").resolve())
    env["AR"] = str((emscripten_dir / "emar.bat").resolve())
    env["RANLIB"] = str((emscripten_dir / "emranlib.bat").resolve())
    env["PATH"] = str(emscripten_dir) + os.pathsep + str(emsdk_root) + os.pathsep + env["PATH"]
    for var in ("CL", "_CL_", "VisualStudioVersion", "VSINSTALLDIR", "VCINSTALLDIR"):
        env.pop(var, None)
    subprocess.run(cmd, cwd=str(repo_root), check=True, env=env)

    subprocess.run(build_cmd + ["--target", "opencv_js"], cwd=str(repo_root), check=True, env=env)


if __name__ == "__main__":
    main()
