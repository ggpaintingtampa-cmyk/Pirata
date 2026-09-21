# September 19 Figma review

Implemented the supplied Figma screens in the existing private app. See
[screen mapping and verification](web/FIGMA-IMPLEMENTATION.md) and
[responsive screenshots](web/artifacts/figma-20260919/).

Reviewed phone, tablet and desktop captures in Chromium and WebKit. Final polish
removes duplicate project headings and double phone gutters, keeps calendar mode
labels on one line, fixes WebKit file-picker overflow, and preserves horizontal
file-recovery controls. All test screenshots use disposable fixture data.
Physical iPhone/Safari hardware remains untested.

---

# Morgan el Pirata — redesign QA, September 18, 2026

**Final result: passed** (visual review; browser and deployment results are recorded separately in `web/deploy/deployed-release.json`).

## Evidence and comparison setup

- Source direction: `web/artifacts/redesign/design-reference.png` (Studio Ledger, generated 853 × 1844 pixels).
- Actual implementation: `web/artifacts/redesign/after/work-curated-390.png` (390 × 844 pixels; 390 × 844 CSS viewport, density 1). Captured and inspected through Codex's in-app browser against the isolated real API harness.
- Combined input: `web/artifacts/redesign/comparison-390.png`; reproducible page `web/artifacts/redesign/comparison.html`. Both images were rendered together at 390 CSS pixels wide: source 390 × 843; implementation 390 × 844. This is a browser-rendered comparison of existing screenshots, not an app implementation made from a screenshot.
- State: dark theme, owner, Work route, two equally weighted goals, 25% completion, identical goal/subtask fractions. The source depicts a running timer and illustrative project; implementation evidence depicts an idle timer and disposable test records. Owner names differ because the isolated fixture uses Owner. Production records were not changed to match the mock.
- Desktop: `web/artifacts/redesign/after/work-curated-1280.png` (1280 × 960, density 1).
- Focused action review: `before/04-task-files-390.png` and `after/task-files-chromium-{320,390}.png` were opened together, then inspected at readable scale. Playwright Pixel 7 screenshots use 2.625 density (390 CSS pixels → 1024 image pixels); these must be displayed at their named CSS widths, not compared as 1:1 source pixels. WebKit screenshots use the iPhone 13 profile's density.
- Other reviewed evidence: `after/menu-curated-390.png`, responsive Work/Menu/Projects/Ask/Tasks captures at 320/390/768/1280; `web/artifacts/screenshots/redesign/project-{overview,files}-*.png`; calendar hour/month captures in `web/tests/modules/tasks-time/artifacts/`.

## Audit findings and fixes

1. **P1, fixed — Photos & PDFs recovery action collapsed into a column of letters.** `before/04-task-files-390.png` reproduces the user's screenshot. A broad dialog-header selector imposed the 44px close-button width on nested file controls. Dedicated outer-header classes isolate that rule. The action stays over 120px wide and at most 52px high across all four test widths; upload and camera actions wrap as intact controls.
2. **P1, fixed — Important pages were difficult to discover.** `before/02-menu-390.png` shows the old undifferentiated button wall. Projects, Calendar and Tasks are now direct phone shortcuts, with a grouped searchable Menu and desktop sidebar. Secondary pages keep Menu selected on phones.
3. **P2, fixed — Work used too much space before useful actions.** `before/01-work-390.png` showed oversized sections and competing scrollbars. The revised layout uses a compact goals block, one content scroll area, an idle timer without an oversized zero clock, and bounded previews with routes to all tasks/projects. The two-goal phone screenshot shows Start and Finish above navigation.
4. **P2, fixed — Project actions disappeared down a long page.** Sticky section links now jump to Tasks, Notes, Files, Activity and owner-only Purchases. Actions and project completion remain visible near the title.
5. **P2, fixed — Task details buried common actions below files.** Start/Finish, Edit, Schedule, Time entries and Add subtask now appear before checklists/files. Optional capture fields remain available through More task details.
6. **P1, fixed — A successful settings save could leave the page permanently busy.** A successful acknowledged settings save now remounts that form; uncertain saves retain their existing safe retry path. Repeated save/navigation regression added.
7. **P1, fixed — Dialog replacement could hide pending uploads.** Replacements respect pending-save and dirty-input guards. Completed uploads do not falsely dirty a task dialog. Failed uploads expose retry and explicit dismissal, retaining the same upload identity on retry.
8. **P2, fixed — Nested Cancel/Back events affected the outer dialog.** Events are scoped to their owning dialog and Back selects the topmost open dialog. Dirty child drafts retain discard protection; clean child forms return without extra prompts.
9. **P2, fixed — New ivory action color exposed legacy contrast mistakes.** Demo Add and collaboration danger controls now use the correct foreground tokens. Primary actions have dark text on ivory; danger actions use light danger text on dark red.

The normalized design-direction comparison was performed after these audit corrections. No further actionable P0/P1/P2 visual finding remained in that comparison. Source layout is a direction, not a demand to copy illustrative records or fabricated timer values.

## Required visual surfaces

- **Typography:** consistent system sans-serif with platform fallbacks; strong compact headings, legible task titles and subdued metadata. The generated source has no authoritative font asset. System typography intentionally avoids an added font download. Text wraps by words; touch controls remain usable at 320px.
- **Spacing/layout:** consistent phone gutters and charcoal surfaces; grouped daily goals; primary timer actions; desktop two-column focus area and persistent sidebar. The working task selector and safe action controls require more room than the mock. Direct Projects access is intentionally retained at the top instead of inventing a project preview to force the same fold.
- **Colors/tokens:** near-black `#0b0c0d`, charcoal `#191a1c`, ivory `#f4f2ed`, readable muted `#a6aaae`; visible focus and restrained semantic status colors. No unrelated color theme or bright decorative gradients.
- **Assets/icons:** existing Lucide vector family retained, including anchor identity and navigation symbols. No decorative photo, logo raster, hero illustration, or bespoke imagery is required by the selected direction. The generated screenshot is review evidence only and is not bundled into the application.
- **Copy/content:** plain task and business labels, encouraging Progress/Completion language, truthful empty states and percentages. No rankings or fake production records. Optional detail and upload error copy explains the next available action.
- **Accessibility/states:** semantic buttons/links/labels, visible focus, native dialogs, reduced-motion styling, dirty-input protection, persistent primary navigation, success/error states, pending upload guards and retry controls. Browser regressions cover navigation, repeated settings saves, rapid capture, filters, nested dialogs and file controls.

## Intentional differences and remaining limits

- Work progress and goals share one card; source separates them. This reduces repeated headings and groups the selected daily plan clearly.
- Date is shortened on phones. The business timezone remains America/New_York; repeating the location is unnecessary.
- Work retains real task selection, time correction, completion and cleanup functions. These controls are not removed for screenshot fidelity.
- Desktop uses a sidebar instead of stretching the phone's bottom bar.
- Responsive Chromium and Playwright WebKit evidence is separate from a physical iPhone/Safari device test. No physical device was available.
- Screenshots show isolated fixture records, not private production business data.

## Implementation checklist

- [x] Correct nested file-control sizing and verify narrow phones.
- [x] Add direct routes, page search, desktop navigation and browser history.
- [x] Improve Work, task capture, projects, calendar, updates and Ask hierarchy.
- [x] Preserve dirty input and confirmed/uncertain save semantics.
- [x] Inspect phone/tablet/desktop captures and combined design evidence.
- [x] Preserve server contracts, authorization and business data.
- [x] Verify a complete private backup by restoring into a separate directory.

Final result: passed

## Final WebKit positioning iteration

**P1, fixed:** Visual inspection of the first populated-suite 320px WebKit Work
capture revealed a clipped header and Add partly covered by navigation. A focused
empty-data check did not reproduce it. Repeating the populated suite with geometry
assertions reproduced `scrollY=38`, header `y=-38`, navigation `y=737`, Add bottom
`761`, and document height `1323` in an 844px viewport. This was a root document
focus-scroll issue, despite `overflow:hidden`.

A first fixed-shell correction solved WebKit root movement, but the Chromium
regression then caught a 19px scroll inside the shell itself. The final shell is
pinned with `position:fixed; inset:0`; root and shell use `overflow:clip` to
prevent programmatic scrolling, while the content pane remains independently
scrollable. Dialog focus restoration also uses `preventScroll`. The full populated WebKit suite
passed again with header `y=0`, document/viewport height `844`, scrollY `0`,
navigation top `775` and Add bottom `761` at both 320px and 390px. Tablet/desktop
bounds also pass. Fresh `after/work-webkit-320.png` was reopened and inspected:
the complete brand/header, Add, and bottom bar remain visible. The repeated
responsive test now enforces this geometry rather than merely checking width.

The final populated redesign suite passed all eight cases separately in Chromium
and WebKit after this correction. The final 390px WebKit Work and task-file
captures were reopened and inspected. Production release
`20260918T155018Z-e47e98e6` passed the same persistent-control bounds at all four
widths in the read-only live check; no business records were changed.

Final result: passed
