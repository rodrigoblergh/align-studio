#!/bin/bash
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'macOS is required.' >&2; exit 1; }
ARCH="$(uname -m)"
[[ "$ARCH" == arm64 || "$ARCH" == x86_64 ]] || { echo 'Unsupported development architecture.' >&2; exit 1; }
[[ $# -eq 1 ]] || { echo 'Usage: development-artifact.sh output-directory' >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd -P)"
KIT="$HERE/../../UpdateKit"
BINARY="$(cd "$KIT" && swift build --configuration release --show-bin-path)/StudioUpdater"
[[ -x "$BINARY" ]] || { echo 'Build StudioUpdater first.' >&2; exit 1; }
mkdir -p "$1"
OUT="$(cd "$1" && pwd -P)"
STAGE="$(mktemp -d "$OUT/development.XXXXXXXX")"
PAYLOAD="$STAGE/Align Studio - DEVELOPMENT ONLY"
mkdir "$PAYLOAD"
ditto "$HERE/../panel" "$PAYLOAD"
APP="$PAYLOAD/updater/AlignStudioUpdater.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BINARY" "$APP/Contents/MacOS/AlignStudioUpdater"
chmod 755 "$APP/Contents/MacOS/AlignStudioUpdater"
cp "$HERE/../update-config.development.json" "$APP/Contents/Resources/update-config.json"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.alignstudio.updater.development</string>
<key>CFBundleName</key><string>Align Studio Updates - Development</string>
<key>CFBundleExecutable</key><string>AlignStudioUpdater</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0.1</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
plutil -lint "$APP/Contents/Info.plist"
lipo "$APP/Contents/MacOS/AlignStudioUpdater" -verify_arch "$ARCH"
# Ad-hoc identity is sufficient for build validation, never a distribution claim.
codesign --force --sign - "$APP"
codesign --verify --strict --deep "$APP"
cat > "$STAGE/DEVELOPMENT-ONLY.txt" <<'NOTICE'
DEVELOPMENT ARTIFACT — NOT A STABLE RELEASE OR INSTALLER

The native updater was compiled and its offline tests executed on the architecture
named in this artifact. Settings/download/install/rollback implementation is present
but live update and AE acceptance remain unverified. Mac feeds may not exist yet.

The app is ad-hoc signed, not Developer ID signed or notarized. The CEP panel is
not Adobe-signed in this artifact. Do not replace a working installation with it.
No installer is included and no CEP security setting is changed. Live AE behavior,
proper release signing, updater installation and rollback still require validation.
NOTICE
printf '\nActual compiled architecture: %s\n' "$ARCH" >> "$STAGE/DEVELOPMENT-ONLY.txt"
ZIP="$OUT/Align-Studio-macOS-$ARCH-DEVELOPMENT.zip"
[[ ! -e "$ZIP" ]] || { echo 'Refusing to overwrite existing artifact.' >&2; exit 1; }
ditto -c -k --norsrc "$STAGE" "$ZIP"
shasum -a 256 "$ZIP"
