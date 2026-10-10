# Pineapple Health field journal design

The subsequent [layout and workflow revision](layout-ux-revision-2026-10-08.md)
keeps this identity and replaces the original Overview arrangement described below.

The October 8 redesign gives the full frontend an illustrated farm-notebook
identity. Warm paper, forest ink, terracotta actions, and pineapple-yellow accents
replace the previous uniform dashboard treatment. Serif headings are paired with
readable system sans-serif text; no remote font download is needed.

Original vector artwork in `src/FieldArt.jsx` supplies the pineapple identity and
field illustrations. It is decorative and does not represent actual field maps,
weather, plant health, or measured information. The overview's counts still come
from the signed-in account's real records.

`src/field-journal.css` defines the visual system across sign-in, the application
shell, overview, farms and plots, scanning, Activity, Settings, health guidance,
help, introductions, dialogs, research tables, and recommendation cards. The
existing feature styles remain the structural foundation. The five main
destinations retain their names; Activity presents its records as a farm journal.

The overview combines a clear scan entry point, a ruled summary of actual counts,
illustrated plot entries, and care tasks. Other screens use friendlier headings,
larger field labels, plain action language, and consistent controls. Scan results,
standard guidance, optional AI advice, and personal observations remain distinct.
Unavailable confidence is still explicit. Unavailable image-preparation data now
reads “Not saved” instead of an incomplete percentage.

## Verification

- The production frontend build and all 24 frontend checks pass.
- All 11 live disposable-account checks pass, including real inference, private
  photos and records, research isolation, recommendation fallback, and deletion.
- Browser review covered desktop (1280px), tablet (768px), and phones (375px and
  320px), with light and dark themes. All five main destinations fit the tested
  phone widths without horizontal page overflow. Tablet scan cards stack.
- Introduction dismissal, form focus trapping/restoration, mobile-menu Escape
  dismissal/restoration, navigation focus, help, all seven condition references,
  and imported results with cached standard advice were checked in the browser.
- Existing reduced-motion behavior is retained. The artwork has no animation and
  is hidden from assistive technology. Audible screen-reader output was not
  independently tested.

Verification used a disposable account, which is removed after review. No existing
user's records or appearance preferences were changed for testing. There are no
backend, database, model, API-key, billing, or deployment changes in this redesign.
Gemini activation still requires the private configuration described in
[AI recommendations](ai-recommendations.md).
