# Changelog

## v0.3.0 - 2026-06-17

- Combined attachment and Markdown management into one Storage panel.
- Added Markdown workspace path management with an inline Change Path action.
- Grouped Daily Markdown files under `Daily/YYYY-MM/YYYY-MM-DD.md`.
- Imported legacy flat `Daily/YYYY-MM-DD.md` files before writing the new month-folder layout.
- Added attachment reference expansion with date-based navigation back to the referenced daily note.
- Added a home-page shortcut to open the selected day Markdown file.
- GitHub release notes now come from this changelog instead of a hard-coded workflow body.

## v0.2.8 - 2026-06-16

- Added two-way Daily Markdown sync: external edits are detected from file timestamps and imported back into BuJo.
- Reworked Daily Markdown files into a cleaner human-readable format without internal metadata comments.
- Added a Markdown settings panel in the top-right menu for choosing the project folder used to store Daily Markdown files.
- Simplified the attachment panel copy and removed its bottom refresh control.
