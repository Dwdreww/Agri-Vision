# AgriVision

## Purpose and audience

A mobile web system for pineapple growers to keep photographs, independent field observations, and planned care together over time. Desktop and phone use are equally important. Farm sizes and field connectivity constraints remain unconfirmed.

## Current design brief

On 4 November 2026 the user requested a complete new interface and then a pineapple-related palette with fewer functions and buttons in everyday navigation. Duplicate image entry actions, confusing organization, layout, and color were the adviser's main concerns. The user expressly excluded the Taste and Impeccable skills for this rebuild.

Home, Photo check, and Records are the three everyday destinations. Photos, Field notes, and Care tasks are categories inside Records. Growing areas and account utilities remain available as secondary tools. One device picker serves camera/library selection where supported. Photo preview and save/check share one screen.

## Product boundaries

Preserve existing records, private photo loading, farms and growing areas, archives, dates, search and filters, task completion, account/guest entry, English/Filipino, light/dark themes, settings, and backup/export. The interface reorganization does not remove these underlying capabilities.

Guest records stay in the browser. Guest photographs remain Not analyzed. Signed-in model checks use existing authentication, service availability, and saving behavior. Demo results remain unsaved. Optional external AI advice keeps existing consent and provider checks. Human observations, model suggestions, and photographed evidence remain distinct. No crop-health outcome or usage statistics are invented.

## Delivery

The November 4 design and private cloud workspace are deployed at https://agri-vision-eosin.vercel.app/. Current migration, layout, import and model checks are documented in `docs/cloud-workspace-2026-11-04.md`.
