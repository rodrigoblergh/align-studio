# Align Studio

Compact alignment and distribution tools for Adobe After Effects on Windows.

## Install

1. Download **Align-Studio-v1.zip** from the latest stable release.
2. Extract the complete ZIP into a folder.
3. Save your project and close After Effects.
4. Run **InstallAlignStudio.exe** and choose **Install Align Studio 1.0**.
5. Open After Effects → Window → Extensions → Align Studio.

The installer works for your Windows account. No administrator prompt or developer-mode change is required. Keep the full extracted package together until installation completes.

## Updates

Open **Options → Updates** in the panel. Update checks run quietly after the panel opens. Automatic downloading is optional and off by default. Install when AE is closed; the updater never closes your project. Downloads are checked against signed release metadata and SHA-256 hashes.

Stable and beta channels are separate. You can restore the preceding installation with the updater. Restoring a pre-release development build can remove its updater; run the current public installer again to return to the public release. Panel preferences are preserved.

## First public release

**v1 / 1.0** is the first public Align Studio release. Earlier local 1.x builds were development versions. This release includes the approved compact icons, text/null/expression support, spacing steppers and the optimized 2D alignment path.

Supported release target: Windows, After Effects 2026. This package is signed as an Adobe CEP extension. The Windows installer is not Authenticode-signed; Windows may identify it as an unrecognized app.

Validation includes offline engine, launcher, updater, installation/recovery and signature checks. Live responsiveness varies with the composition; offline measurement-call reductions are not an AE timing benchmark.

Font Awesome 4.7 is bundled under the SIL Open Font License; its full notice is included in the package.
