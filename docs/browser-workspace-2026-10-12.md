# Browser workspace — October 12, 2026

The user requested browser-saved history on the existing Vercel site, then
clarified that the login screen should remain with an option to enter without
typing credentials. **Continue as guest** opens that saved browser workspace.
The existing interface and features remain intact; sample diagnoses are not used.

## Behavior

- The existing guided scan, Overview, Farms, plot detail, Activity, health guide,
  help, themes, and expandable reports remain in place.
- Farms, plots, observations, care tasks, completion/archive changes, and saved
  photo/scan records use IndexedDB. Photo blobs are stored with their records in
  one transaction. Failed writes surface a readable error; retry is idempotent.
- A first guest visit creates a starter farm and plot, with no fabricated scan results.
- Guest entry is explicit and survives refresh in the current tab. New visits
  show sign-in unless an account session or guest entry is remembered. The menu
  offers **Return to sign in**, which keeps all guest records and photos.
- Session storage remembers guest entry. If storage is blocked, `?guest=1`
  provides entry; `?guest=0` overrides an uncleared marker on return to sign-in.
  These flags grant access only to the local guest store, never account data.
- Reloads and new tabs on the same origin retain the records and photos. A
  BroadcastChannel refreshes other tabs after a committed change. Writes read
  the latest workspace in a serialized transaction, avoiding lost updates.
- The public real-model and Gemini services were already pending deployment.
  Their availability remains explicit. Users may save a photo for later without
  inventing classifications, confidence scores, detections, or AI advice.
- Settings supports a browser display name, themes, importing the earlier local
  summary history once, a JSON export containing records and photo data URLs,
  and confirmed clearing of this browser workspace.
- Records do not sync across sites, browsers, or devices. Clearing site data,
  private browsing, or browser storage eviction can remove them. The interface
  states this and offers a separate backup export.

## Account implementation

Sign-in is the default, including remembered Firebase account sessions. The
original Firestore/Storage/Functions implementation is retained in `cloud-data.js`;
`data.js` selects the browser adapter only after explicit guest entry. Browser
mode does not initialize Firebase, subscribe to account records, or send API requests. Existing Firebase
accounts and records, backend token verification, and security rules are intact.
Normal account use requires the existing Firebase configuration and an
appropriate `VITE_WORKSPACE_MODE` value. `VITE_ACCOUNT_MODE` is no longer used.
The existing IndexedDB namespace `agri-vision-browser-v1` is unchanged.

The local persistence tests cover reopened stores, photo bytes, concurrent
writes, atomic rollback, idempotent retries, deletion, reset, complete backups,
unavailable storage, and isolation from account photo paths.

## Original browser persistence verification

- All 29 frontend tests pass, including five browser persistence/transaction
  tests. Both browser and account-mode production builds pass.
- In a separate localhost origin without login, the browser review covered
  photo upload/preview, saving an unanalyzed photo, its expanded report,
  observations, care-task creation and completion, farm/plot creation, and a
  workspace-name change. Reloading retained the records and the actual photo.
- A second tab retained the history and received a name change through the
  local update channel. The JSON backup was downloaded and read back; it
  contained the records, a completed task, and the JPEG photo data URL.
- Desktop (1280), tablet (768), and phone (375) layouts fit without horizontal
  overflow. All five primary destinations were checked on a phone.
- No model or Gemini result was simulated, and no existing Firebase records
  were modified during these checks.

## Guest-entry correction verification

- All 35 frontend tests pass, including six guest-session checks for explicit
  entry, refresh detection, returning to sign-in, blocked or silently failing
  storage, sign-in override precedence, and unrelated URL/storage preservation.
  The production build passes.
- The restored login was reviewed at desktop (1280×900) and phone (375×812)
  sizes; the phone has no horizontal overflow. Registration and password-reset
  navigation still display their original fields. No account credentials were
  submitted or account records changed during this correction's UI checks.
- Guest entry with empty credential fields reopened the existing localhost
  workspace: three activity records, including the completed task, observation,
  and real saved photo. Returning to sign-in, refreshing there, reentering guest,
  and refreshing guest retained those records and loaded the photo bytes.
- Before public deployment, a real test photo was saved as Not analyzed in this
  browser on the existing production origin for the release retention check.
  This does not upload a photo to Firebase or run model inference.
