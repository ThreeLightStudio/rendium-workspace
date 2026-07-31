# OSS Contest Release Scope

## Product Identity

Rendium is a local-first desktop video creation tool powered by an open-source media rendering engine.

For the OSS Contest release, Rendium should not be positioned as a full professional video editor, AI editing suite, cloud collaboration platform, or workflow marketplace. The strongest product identity is a focused local creation loop: import local media, edit it on a timeline, preview it through the engine, and export a local MP4.

## Goal

Ship the smallest contest-ready release that demonstrates a complete, reliable, local-first video creation workflow.

The goal is not to complete every visible feature. The goal is to make the core demo sharp, repeatable, and easy for judges and open-source contributors to understand.

## Golden Path

The contest demo should show this scenario in under three minutes.

### 1. Import

- Start from a clean Desktop Studio project.
- Import one verified demo image or video asset from local disk. A verified H.264 macOS screen-recording MOV is a supported video input.
- Confirm the asset appears in the project and is available for placement.

### 2. Edit

- Add the imported media to the timeline.
- Add one text layer.
- Select a layer and adjust basic transform or text properties in the inspector.
- Optionally move one layer on the timeline if the build is stable.

### 3. Preview

- Scrub or seek the timeline.
- Press play and confirm the canvas preview updates.
- Show that the timeline, layer panel, inspector, and preview stay in sync.

### 4. Export

- Open export settings.
- Use the default MP4 export profile.
- Start export and show progress.
- Do not demonstrate advanced export tuning unless already verified.

### 5. Result

- Confirm export completes successfully.
- Open or locate the generated MP4 file.
- State that the workflow ran locally without account, cloud sync, or server rendering.

## Must Have

- [ ] Desktop Studio launches reliably on the contest machine.
- [ ] A clean default project opens without manual setup.
- [ ] A verified demo image or video can be imported from local disk.
- [ ] Imported assets remain available after local persistence writes complete.
- [ ] Media can be placed on the timeline.
- [ ] A text layer can be added.
- [ ] Layer selection works from the timeline or layer panel.
- [ ] Basic inspector edits work for the demo layer types.
- [ ] Timeline seek and scrub update the preview.
- [ ] Playback works for the demo project.
- [ ] Undo and redo work for at least one Golden Path edit.
- [ ] Save or autosave preserves the Golden Path project state.
- [ ] Reload restores the Golden Path project state and referenced assets.
- [ ] Default MP4 export completes with the verified demo asset.
- [ ] Export progress, success, and failure states are visible.
- [ ] The exported MP4 opens and visually matches the preview closely enough for judging.
- [ ] README explains the contest demo path clearly.
- [ ] Engine and Studio test commands are documented.
- [ ] No out-of-scope feature is required to complete the demo.

## Should Have

- [ ] Video with linked audio works in the demo project.
- [ ] Basic timeline layer dragging is stable.
- [ ] Basic trim or split works if it does not risk the demo.
- [ ] Export cancellation works without corrupting later exports.
- [ ] Asset missing or invalid states produce understandable messages.
- [ ] Keyboard shortcuts for playback and save work.
- [ ] Storybook or component examples are available for maintainers.
- [ ] Architecture docs clearly explain the Engine and Studio boundary.
- [ ] Tests cover the core engine, timeline, export hook, and asset persistence paths.

## Could Have

- [ ] Spectrum visualizer demo.
- [ ] Advanced audio controls.
- [ ] Asset metadata editing.
- [ ] Asset search and filtering polish.
- [ ] AI chat panel demo.
- [ ] AI action preview demo.
- [ ] AI asset recommendation demo.
- [ ] Additional export presets beyond the default contest profile.
- [ ] Full bilingual polish for every UI string.
- [ ] Storybook coverage for every visible component.

## Out Of Scope

- AI editing as a core contest feature.
- AI monetization or provider setup as a contest requirement.
- Cloud sync.
- Collaboration.
- User accounts.
- Team workspaces.
- Multi-project dashboard.
- Template marketplace.
- Workflow marketplace.
- Plugin marketplace.
- Cloud rendering.
- Social publishing.
- Mobile app support.
- 4K or 8K optimization claims.
- Professional NLE feature parity.
- Advanced audio workstation features.
- General QuickTime/MOV compatibility beyond the verified H.264 macOS screen-recording path, and unsupported-codec transcoding.
- Enterprise administration or security features.
- Any new feature that is not required for Import → Edit → Preview → Export → Result.

## Release Blocking Bugs

A bug blocks the OSS Contest release if it prevents the Golden Path from completing on the contest machine.

- [ ] Desktop Studio cannot launch.
- [ ] Demo asset import fails.
- [ ] Imported asset is lost after save, autosave, or reload.
- [ ] Timeline placement fails for the verified demo asset.
- [ ] Preview does not render the demo timeline.
- [ ] Playback cannot start or visibly desynchronizes the demo.
- [ ] Inspector edits do not apply to the selected demo layer.
- [ ] Undo or redo corrupts the Golden Path project.
- [ ] MP4 export fails with the default demo profile.
- [ ] Exported MP4 cannot be opened by a standard media player.
- [ ] Exported MP4 is empty, black, silent when audio is expected, or materially different from preview.
- [ ] Save → Reload breaks the demo project or its asset references.
- [ ] Any out-of-scope UI becomes necessary to complete the demo.

## Definition of Done

The OSS Contest release is done when all of the following are true:

- [ ] Golden Path succeeds 10 consecutive times on the contest machine.
- [ ] Default MP4 export succeeds 10 consecutive times with the verified demo project.
- [ ] Save → Reload succeeds 10 consecutive times with the verified demo project.
- [ ] Demo asset package is finalized and stored in a predictable local path.
- [ ] Demo project uses only Must Have features.
- [ ] No Could Have or Out Of Scope feature is required during the demo.
- [ ] README contains the exact demo flow and setup commands.
- [ ] Release notes clearly state known limitations and out-of-scope areas.
- [ ] Narrow tests for engine, timeline, asset persistence, and export hook pass.
- [ ] Manual QA records the operating system, app build, demo asset, export profile, and result file.
- [ ] A fresh clone can install, build, and run the documented path.
- [ ] The final demo can be explained in one sentence: import local media, edit it locally, preview it through the engine, export MP4 locally.
