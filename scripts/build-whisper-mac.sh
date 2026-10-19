#!/usr/bin/env bash
# Builds the local speech-recognition engine bundled in the Mac app:
# whisper.cpp's `whisper-server`, pinned to a release, as ONE static binary
# that links only macOS system frameworks (no Homebrew libraries), CPU-only
# with AVX2 (every Mac that runs macOS 13+ has it; Apple Silicon runs it
# through Rosetta 2). Output: electron/vendor/whisper/whisper-server.
# The model itself is NOT bundled — the app downloads it once on first use.
set -euo pipefail
cd "$(dirname "$0")/.."
TAG=v1.9.5
SRC=.cache/whisper.cpp
OUT=electron/vendor/whisper
if [ -x "$OUT/whisper-server" ] && [ "${1:-}" != "--force" ]; then
  echo "whisper-server already built ($OUT/whisper-server)"
  exit 0
fi
command -v cmake >/dev/null || { echo "cmake is required (brew install cmake)"; exit 1; }
mkdir -p .cache "$OUT"
if [ ! -d "$SRC" ]; then
  git clone --depth 1 --branch "$TAG" https://github.com/ggml-org/whisper.cpp "$SRC"
fi
cmake -S "$SRC" -B "$SRC/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_SDL2=OFF \
  -DGGML_METAL=OFF -DGGML_BLAS=ON -DGGML_NATIVE=OFF \
  -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON \
  -DCMAKE_OSX_ARCHITECTURES=x86_64 -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0
cmake --build "$SRC/build" -j4 --target whisper-server
cp "$SRC/build/bin/whisper-server" "$OUT/whisper-server"
chmod +x "$OUT/whisper-server"
cp "$SRC/LICENSE" "$OUT/LICENSE-whisper.cpp.txt"
echo "built $OUT/whisper-server ($TAG)"
