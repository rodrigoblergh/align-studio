Align Studio 1.0.1 - macOS Apple Silicon candidate

This separate CEP panel port is awaiting native Mac acceptance. See ../README.txt in the source tree for build/validation details. The alignment engine is unchanged from the Windows source; actual Mac AE and font behavior remain unverified.

Open after installation: After Effects > Window > Extensions > Align Studio. Hover or focus icons for labels. Select a target, then align or distribute. Options exposes bounds, text, animation and depth controls; scroll anywhere to reach them. Null controllers use anchor points. Existing Position expressions receive continuous offsets. Each operation is one Undo step (Cmd+Z on Mac).

Updates launches the bundled AlignStudioUpdater.app using native CEP arguments, with separate Mac release feeds. No Windows executable, shell-command interpolation or CEP debug-mode change is needed. Preferences outside the extension are preserved by installation.

Standard icons use bundled Font Awesome under assets/fontawesome/LICENSE.txt; alignment and distribution glyphs are custom. Missing fonts retain visible local SVG fallbacks.