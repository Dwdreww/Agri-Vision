# Browser workspace — October 12, 2026

The user requested a temporary static version that opens without an account,
saves history in the browser, and is deployed to the existing Vercel site. They
clarified that the existing interface and features should remain intact; sample
diagnoses are not used.

## Behavior

- The existing guided scan, Overview, Farms, plot detail, Activity, health guide,
  help, themes, and expandable reports remain in place.
- Farms, plots, observations, care tasks, completion/archive changes, and saved
  photo/scan records use IndexedDB. Photo blobs are stored with their records in
  one transaction. Failed writes surface a readable error; retry is idempotent.
- A first visit creates a starter farm and plot, with no fabricated scan results.
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

Browser mode is the default unless `VITE_ACCOUNT_MODE=required`. The original
Firestore/Storage/Functions data implementation is retained in `cloud-data.js`;
`data.js` selects the appropriate adapter. Browser mode does not initialize
Firebase, subscribe to account records, or send API requests. Existing Firebase
accounts and records, backend token verification, and security rules are intact.
Restoring account mode requires the existing Firebase configuration and an
appropriate `VITE_WORKSPACE_MODE` value.

The local persistence tests cover reopened stores, photo bytes, concurrent
writes, atomic rollback, idempotent retries, deletion, reset, complete backups,
unavailable storage, and isolation from account photo paths.

## Verification

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
