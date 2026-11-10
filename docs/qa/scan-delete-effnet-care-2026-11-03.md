# Scan removal and EffNet care actions — November 3, 2026

The result screen offers Delete check beside Start another check after saving.
An inline confirmation explains permanent removal of the record, photos,
recommendations and any research contribution. Cancel receives initial focus;
Cancel and Escape close the panel and return focus to the trigger. Removal
disables duplicate actions and cancels active recommendation requests. Failures
retain the result and offer a retry; success returns to the first scan step.

Recommendation prompt `pineapple-care-v4-effnet` uses the confirmed original
EffNet output index/label pairs and classifier scores. The current four-class
path does not use YOLO labels or confidence, manual observations or a modified
summary in place of the regional classifier output. Invalid/incomplete regions
remain inconclusive. Historical classes keep their reviewed reference mapping.
See [the exact prompt](../recommendation-prompt.md).

Reviewed standard actions now appear immediately on a saved result, without
AI opt-in or a provider call. Optional AI can explain and prioritize these
actions after consent. Current private configuration, cooldowns and daily quotas
remain in effect. Reading advice changes no scan record, reserves no quota and
writes no advice sidecar. Previously validated historical advice remains readable.

Verification:

- 60 frontend tests, 70 service tests, the function syntax checks, production
  build and whitespace check pass. The existing bundle-size warning remains.
- Six new service tests cover each current class from the supplied metrics,
  relevant basic actions, mixed regions, source attribution, excluded private
  fields, separate detector scores and malformed classifier metadata.
- Twelve live checks passed through the actual local service. One real Gemini
  request for an EffNet Fruit Rot fixture returned three validated actions:
  inspect damage/decay, handle separately during assessment, and seek local
  agricultural advice if symptoms persist or spread. The test used the normal
  quota/consent path and changed no real user's records. Deleting its scan also
  removed the advice sidecar; reading that advice afterward returned 404.
- Browser testing uses a disposable account on a separate Vite origin (5174),
  preserving the signed-in account on the main origin (5173). A real upload,
  paired inference, autosave and standard basic-action display were verified.
  Inline Cancel preserves the result and restores trigger focus. The 390-pixel
  phone layout keeps controls and confirmation readable. An account lock forced
  a failed deletion and verified the result/error/retry state.
  Successful confirmation then removed a fresh test result and returned the
  scanner to the upload step with the growing area retained. Escape cancellation
  and focus restoration also passed. The disposable account, remaining test
  records/photos, fixture credential file, temporary browser tabs and extra
  Vite listener were cleaned up; the main pilot remains available on 5173.

Evidence is under `output/scan-care-2026-11-03/`, including the real provider
response from the synthetic fixture and screenshots. These checks establish
feature behavior, not the classifier's accuracy on field images. Public hosting
was not changed.
