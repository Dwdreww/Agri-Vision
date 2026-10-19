# Farmer guidance — October 19, 2026

The user asked for farmers to understand the system and use it independently,
while keeping the existing visual layout. The design interview settled on:

- Overview after normal sign-in and explicit guest entry.
- A first-visit focus, with returning users seeing their records and tasks.
- An optional, resumable checklist using real actions: name a farm, name/add a
  growing area, and save a first photo check.
- English by default, with a selectable Filipino interface.
- Plain labels: History, Field note, Growing area, and Check pineapple.

## Learning while doing

Overview explains the purpose of the app and provides task shortcuts. The setup
checklist derives progress from saved, active locations and actual photo/check
records. Pausing the checklist is a separate per-account browser preference; it
never deletes a record. Unassigned imports do not complete the photo step.

Existing guest starter records are named in place rather than duplicated. Their
IDs, photo references, and the IndexedDB namespace remain unchanged. Deliberately
saving the original starter names also counts as location setup. New accounts
continue to use the existing authenticated farm and growing-area forms.

Farm and growing-area forms explain why the information is requested. A saved
location offers the next action. Field notes explain that they record the user's
own observations; care tasks explain the due date and do not promise phone
notifications. History explains search, filters, details, and completion.

Help is visible in the main header on phones and desktops. It links to real
pages and explains photos, notes, tasks, results, backups, and unavailable
analysis. Each working page has expandable guidance. The introduction is an
optional Help action; it no longer interrupts the first account visit.

## Language and data

The sign-in screen, Settings, and workspace menu offer English / Filipino.
`agriVisionLanguage` stores the preference in this browser; blocked preference
storage does not prevent switching for the current visit. The default is always
English, rather than an automatic browser-language choice. The document language
and date formatting follow the selection.

Translations apply to interface copy, guidance, standard statuses, accessible
labels, and known errors. Saved farm names, growing-area names, notes, task
text, record IDs, and canonical model fields are retained. History searches both
original and translated condition labels. Model classification uses original
labels before translating the display. Detailed backend model text and generated
AI advice can remain in English; the Filipino language setting explains this.

Normal account authentication, guest history separation, model service checks,
consent, research access, and deletion rules are unchanged. Guest photo saving
remains explicitly Not analyzed. This revision does not deploy or activate the
model or Gemini services and does not simulate a result.

## Verification

- All 45 frontend tests pass. The new checks cover default/blocked language
  preferences, interpolation, preserved names, Filipino History searches,
  starter setup, actual saved-check progress, archived/unassigned records, and
  per-account guide preferences. The production build and diff checks pass.
- Fresh localhost UI testing covered naming the starter locations without
  duplicates, resuming the checklist after refresh, actual photo preparation,
  saving the photo, setup completion, History search/details, a field note, and
  a task appearing on Overview on its due date.
- English and Filipino switching was tested on sign-in, Settings, and workspace
  screens. Returning to sign-in retained the preference. Switching language
  preserved typed sign-in input, location names, field notes, and actual photos.
- Desktop (1280px) and phone (375px and 320px) layouts were reviewed. All five
  primary screens plus Help and the health guide fit the 320px viewport without
  horizontal overflow. The full trained-model path and live account submissions
  were not repeated; those services were not changed.
- The existing production bundle-size warning remains. Farmer comprehension and
  translation wording still need feedback from the intended testers; the UI
  checks do not claim to replace that user testing.
