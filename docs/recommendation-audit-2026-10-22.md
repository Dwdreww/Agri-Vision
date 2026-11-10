# Recommendation reliability audit — 2026-10-22

All seven supported classes and one mixed-result case returned a real, validated Gemini response with prompt `pineapple-care-v3`. Calls used synthetic model metadata only. No private records/photos were used by the audit, and it did not reset account preferences or daily application counters.

## Live results

| Case | Final result | HTTP | Observations |
| --- | --- | --- | --- |
| Crown Rot Disease | Passed | 200 | Initial connection failure; explicit recheck passed |
| Fruit Fasciation Disorder | Passed | 200 | Passed on first call |
| Fruit Rot Disease | Passed | 200 | Passed on first call |
| Mealybug Wilt Disease | Passed | 200 | Passed on first call |
| Multiple Crown Disorder | Passed | 200 | Passed on first call |
| No Disease | Passed | 200 | Initial Google HTTP 503; explicit recheck passed |
| Root Rot Disease | Passed | 200 | Passed on first call |
| Mixed: No Disease + Crown Rot Disease | Passed | 200 | Passed on first call |

The initial run made eight sequential requests. Two explicitly targeted follow-up calls checked the transient failures, for ten requests total. The audit helper does not retry automatically. The initial failures remain in the raw reports:

- [Initial run](qa/recommendations-live-2026-10-22.json)
- [Targeted follow-up](qa/recommendations-live-followup-2026-10-22.json)

These direct synthetic provider checks are separate from per-account generation and its quota ledger. They are not a load test, model-accuracy evaluation, or guarantee of future provider availability.

## Refinements

- Instructions distinguish pathological disease, physiological growth/shape disorders, No Disease, and mixed detections. Every reported supported class receives its own reviewed guidance.
- Gemini must select distinct action texts from reviewed steps, enforced in its output schema and again on the server. It explains and prioritizes those steps instead of inventing new treatment actions.
- Ordinary negated diagnosis/infection wording, smart apostrophes, and a list of unsupported assessments in a disclaimer no longer trigger the reproduced false positives. Each field is checked separately so a negation cannot hide a positive claim in another field.
- Unreported conditions/pathogens, affirmative diagnosis/certainty claims, numerical assessments, destructive instructions, chemical treatments, URLs, duplicate steps, oversized fields and extra fields are rejected.
- Unknown labels and incomplete/no-detection results stay inconclusive and use clearly labeled standard guidance without calling Gemini.
- Provider output is bounded to 64 KiB while streaming. Non-JSON, malformed envelopes, missing final text, thinking-only output, blocked generation, truncation and timeouts produce specific safe errors.
- Provider configuration problems, rate limits, temporary outages, network failures and storage failures have distinct feedback. Neither raw provider output nor credentials appear in those messages.
- Valid saved v2 advice remains readable after the prompt upgrade, with no extra generation or quota. Failed regeneration retains good saved advice. Failed guidance/quota writes leave the saved scan intact and provide safe fallback.
- Consent, ownership, authentication, account deletion/edit races, one concurrent provider slot, persistent daily/cooldown limits, and secret isolation remain enforced.

## Automated verification

63 backend tests and 54 frontend tests pass. Backend syntax checks, production build, and whitespace checks pass. Coverage includes all seven class contracts, nine disclaimer forms across every class, malformed/oversized responses, ordinary and streaming response paths, timeout/cancellation, retry hints, extra/duplicate steps, private-data exclusion, mixed results, cached advice, storage/quota failures, and existing ownership/consent/race tests.

The production build retains an existing warning about a large workspace JavaScript chunk. No dependency or framework migration was made.

## Repeating the live audit

```sh
node scripts/check-ai-recommendations.mjs --live --output=report.json
node scripts/check-ai-recommendations.mjs --live '--only=Crown Rot Disease|No Disease' --output=followup.json
```

Use the local pilot's Node 22 runtime and private key configuration. Running without `--live` only shows usage. Every selected case makes one real provider request and may consume the Google project's quota. The helper does not enable billing.

## Remaining limits

Natural-language validation cannot enumerate every possible wording, and a single successful response per category does not establish error-free behavior under all future responses. Provider downtime, network interruption and quota exhaustion can still happen. The app handles these with labeled fallback/retry feedback; it cannot make the external provider always available. Free-text explanations and the original model classification can still be wrong and should be compared with the plant in person.

Read the [exact prompt](recommendation-prompt.md). Output structure and provider error handling follow Google's [structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output) and [troubleshooting guidance](https://ai.google.dev/gemini-api/docs/troubleshooting).
