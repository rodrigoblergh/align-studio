#!/bin/bash
set -euo pipefail
# Run on macOS. Credentials are supplied by the release runner, never committed.
# Usage: package.sh updater.app output-directory
[[ "$(uname -s)" == Darwin ]] || { echo 'Build this package on macOS.' >&2; exit 1; }
[[ $# -eq 2 ]] || { echo 'Usage: package.sh AlignStudioUpdater.app output-directory' >&2; exit 1; }
: "${ZXPSIGNCMD:?Path to official Adobe ZXPSignCmd is required}"
: "${CEP_CERTIFICATE:?CEP signing certificate path is required}"
: "${CEP_CERTIFICATE_PASSWORD:?CEP signing password is required}"
HERE="$(cd "$(dirname "$0")" && pwd -P)"
APP="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"
[[ -d "$APP" && "$(basename "$APP")" == AlignStudioUpdater.app ]] || { echo 'Expected AlignStudioUpdater.app.' >&2; exit 1; }
[[ -f "$APP/Contents/MacOS/AlignStudioUpdater" ]] || { echo 'Missing updater executable.' >&2; exit 1; }
/usr/bin/codesign --verify --strict --deep "$APP"
/usr/bin/lipo -verify_arch arm64 "$APP/Contents/MacOS/AlignStudioUpdater"
# Product signing/notarization occurs before this step; do not alter app bytes here.
mkdir -p "$2"
OUT="$(cd "$2" && pwd -P)"
STAGE="$(/usr/bin/mktemp -d "$OUT/align-stage.XXXXXXXX")"
PAYLOAD="$STAGE/unsigned"
SIGNED="$STAGE/Align Studio"
mkdir "$PAYLOAD"
/usr/bin/ditto "$HERE/../panel" "$PAYLOAD"
mkdir -p "$PAYLOAD/updater"
/usr/bin/ditto "$APP" "$PAYLOAD/updater/AlignStudioUpdater.app"
[[ -z "$(/usr/bin/find "$PAYLOAD" -name '*.exe' -o -name '*tests*' -o -name '*.cjs')" ]] || { echo 'Unexpected Windows or test artifacts in payload.' >&2; exit 1; }
"$ZXPSIGNCMD" -sign "$PAYLOAD" "$STAGE/Align-Studio.zxp" "$CEP_CERTIFICATE" "$CEP_CERTIFICATE_PASSWORD"
"$ZXPSIGNCMD" -verify "$STAGE/Align-Studio.zxp"
mkdir "$SIGNED"
/usr/bin/ditto -x -k "$STAGE/Align-Studio.zxp" "$SIGNED"
"$ZXPSIGNCMD" -verify "$SIGNED"
[[ -f "$SIGNED/META-INF/signatures.xml" && -f "$SIGNED/mimetype" ]] || { echo 'Missing CEP signature artifacts.' >&2; exit 1; }
VERSION="$(tr -d '\r\n' < "$SIGNED/VERSION.txt")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || { echo 'Invalid product version.' >&2; exit 1; }
RELEASE="$OUT/Align-Studio-$VERSION-macOS-arm64.zip"
INITIAL="$OUT/Align-Studio-$VERSION-macOS-arm64-Install.zip"
[[ ! -e "$RELEASE" && ! -e "$INITIAL" ]] || { echo 'Refusing to overwrite release artifacts.' >&2; exit 1; }
# UpdateKit requires the signed CEP tree at the update ZIP root.
/usr/bin/ditto -c -k --norsrc "$SIGNED" "$RELEASE"
WRAPPER="$STAGE/initial-install"
mkdir "$WRAPPER"
/usr/bin/ditto "$SIGNED" "$WRAPPER/Align Studio"
/bin/cp "$HERE/Install Align Studio.command" "$WRAPPER/Install Align Studio.command"
/bin/chmod 755 "$WRAPPER/Install Align Studio.command"
/usr/bin/ditto -c -k --norsrc "$WRAPPER" "$INITIAL"
/usr/bin/shasum -a 256 "$RELEASE" "$INITIAL"
printf 'Candidate only: sign a macOS-specific update manifest after testing. No feed is published by this script.\n'
