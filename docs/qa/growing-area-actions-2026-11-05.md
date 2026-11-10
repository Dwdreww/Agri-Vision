# Growing-area action labels and tooltips — 5 November 2026

The growing-area photo action now reads **Add pineapple photo**, with an
image-plus icon and an accessible label identifying the destination area.
It keeps the existing photo workflow and preselected growing area.

The farm edit/archive icons now have themed tooltips on hover and keyboard
focus. Edit explains that it changes the farm name/notes; archive explains that
it removes the farm from the active list while keeping its history. Escape
dismisses a tooltip. Accessible names retain each farm's name, and descriptions
are linked with `aria-describedby`.

The tooltip is anchored to the action row so it stays inside the card on narrow
screens. English and Filipino copy are included. The matching legacy area-detail
photo action also uses the updated label and icon.

Verified in the browser at desktop and 390px mobile width: pointer hover, both
tooltip descriptions, keyboard focus, Escape dismissal, no horizontal overflow,
and photo navigation with the correct growing area selected. The edit action
opens its form and was cancelled without saving.

The demo guest farm was inadvertently archived while testing its confirmation.
The archived-farm list previously had no restore action. Added **Restore farm**
there for browser and signed-in workspaces, then restored the same demo farm
through the deployed UI. The farm retained its ID, name and growing area; its
archive flag was cleared. Signed-in account records, photos, observations and
tasks were not modified during this check. No photos were uploaded.

Production build, ten browser-storage/language checks and `git diff --check`
passed. Restoration was verified live by the active farm, its growing area,
and the Farm restored confirmation.

Screenshots and the deployment receipt are in ignored
`output/ui/growing-area-actions-2026-11-05/`.
