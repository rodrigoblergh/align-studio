#!/bin/bash
set -euo pipefail
# Per-user initial installation. The signed updater owns later updates.
HERE="$(cd "$(dirname "$0")" && pwd -P)"
SOURCE="$HERE/Align Studio"
TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/com.alignstudio.wheel"
STATE="$HOME/Library/Application Support/AlignStudio/installer/v1"
safe_ancestors() {
    local path="$1"
    while [[ "$path" != / && -n "$path" ]]; do
        [[ ! -L "$path" ]] || { echo 'Linked installation paths are not supported.' >&2; return 1; }
        path="$(dirname "$path")"
    done
}
ae_closed() {
    if /usr/bin/pgrep -x 'After Effects' >/dev/null || /usr/bin/pgrep -x AfterFX >/dev/null; then
        echo 'Save your work and close After Effects, then run this installer again.' >&2
        return 1
    fi
}
safe_ancestors "$TARGET"
safe_ancestors "$STATE"
safe_ancestors "$SOURCE"
ae_closed
for required in CSXS/manifest.xml META-INF/signatures.xml mimetype VERSION.txt update.js platform.js updater/AlignStudioUpdater.app/Contents/MacOS/AlignStudioUpdater; do
    [[ -f "$SOURCE/$required" ]] || { echo "Incomplete package: $required" >&2; exit 1; }
done
# A plain Swift app needs no internal symlinks. Reject links before copying.
[[ -z "$(/usr/bin/find "$SOURCE" -type l -print -quit)" ]] || { echo 'Linked package files are not supported.' >&2; exit 1; }
mkdir -p "$STATE" "$(dirname "$TARGET")"
LOCK="$STATE/install.lock"
mkdir "$LOCK" 2>/dev/null || { echo 'Another installation is active, or an interrupted installation needs review.' >&2; exit 1; }
JOB="$(/usr/bin/mktemp -d "$STATE/transaction.XXXXXXXX")"
OLD="$JOB/previous"
NEW="$JOB/new"
MOVED=0
PUBLISHED=0
finish() {
    local status=$?
    if [[ $status -ne 0 ]]; then
        # Restore only the transaction this invocation owns. Keep evidence.
        if [[ $PUBLISHED -eq 1 && -d "$TARGET" ]]; then /bin/mv "$TARGET" "$JOB/failed-payload"; fi
        if [[ $MOVED -eq 1 && -d "$OLD" && ! -e "$TARGET" ]]; then /bin/mv "$OLD" "$TARGET"; fi
        printf 'FAILED\nPrevious extension preserved or restored. Transaction: %s\n' "$JOB" > "$STATE/last-operation.txt"
    fi
    /bin/rmdir "$LOCK" 2>/dev/null || true
    exit "$status"
}
trap finish EXIT
/usr/bin/ditto "$SOURCE" "$NEW"
[[ -x "$NEW/updater/AlignStudioUpdater.app/Contents/MacOS/AlignStudioUpdater" ]] || { echo 'Updater executable permissions are missing.' >&2; exit 1; }
/usr/bin/codesign --verify --strict --deep "$NEW/updater/AlignStudioUpdater.app"
safe_ancestors "$TARGET"
ae_closed
if [[ -e "$TARGET" ]]; then /bin/mv "$TARGET" "$OLD"; MOVED=1; fi
/bin/mv "$NEW" "$TARGET"
PUBLISHED=1
printf 'SUCCESS\nAlign Studio installed. Reopen After Effects.\nBackup: %s\n' "$OLD" > "$STATE/last-operation.txt"
echo 'Align Studio installed. Reopen After Effects, then choose Window > Extensions > Align Studio.'
echo 'Preferences outside the extension were preserved. No CEP debug settings were changed.'
