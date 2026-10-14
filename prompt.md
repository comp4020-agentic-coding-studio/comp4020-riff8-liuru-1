# Pod 1: Paper Planes — detailed recreation specification

Build a working, visually faithful recreation of <https://paperplanes.world/> in **`comp4020-agentic-coding-studio/comp4020-riff8-liuru-1`**, with four deliberate changes:

1. Replace the six-theme idea with **six colours of paper plane**.
2. Make the complete experience usable in a **desktop web browser**, as well as on a phone.
3. Let people **choose a region label themselves**, rather than requiring their physical location.
4. Let people **write a message on their plane**. When someone catches it, that same message must be visible on the paper itself and fully readable.

Keep the reference's visual composition and central experience as close as practical: a shared world, folded paper planes, catching, unfolding, region stamps, journey history, and sending planes onward. This is a functioning multiplayer application, not a landing page, animation-only demo, or collection of UI mockups. Complete it in one unattended run; make reasonable decisions where this brief leaves details open.

## Repository and assignment context

This is the **liuru-1** pod repository. Its current product is **六如**, a shared wall of short traces tagged dream, illusion, bubble, shadow, dew, or lightning, with one-level answers, six filters, optional sound, and real-time SSE delivery. This brief deliberately replaces those six themed choices in the new primary experience with six equal paper-plane colours. It supersedes the earlier prompt's proposed six different visibility/expiry rules: do not implement popping, evaporation, hidden words, or disappearing messages as colour behaviours. Work only in this pod repository and its Fly app, `comp4020-riff8-liuru-1`. The original `comp4020-final-liuru` repository and all other pod repositories/deployments are out of scope.

Read the root `CLAUDE.md`, `README.md`, the relevant `PROCESS.md` sections, application source, database code, deployment configuration, and tests first. Keep the top pod-riff block in `CLAUDE.md` intact. Its permission to change tests for a different brief applies: adapt theme/filter expectations deliberately for the new plane experience, preserve meaningful validation, ownership, persistence and live-delivery coverage, explain the changes, and keep `spec/invariants.test.ts` green. Update the README's product argument and any conflicting lower-level product rules together with the redesign, explicitly explaining the move from six similes to six colours. Keep `/readme/` publishing the actual README. Do not let old wall-specific presentation rules prevent the requested experience.

Preserve stored traces, answers, their original kinds, timestamps, and ownership relationships through an additive migration. Keep the old wall and its existing conversations readable through a discreet archive link, outside the new primary flow. Do not invent region stamps or flight histories for legacy traces. Reuse the persistent `visitor` cookie, plain Node/TypeScript server, `better-sqlite3` database on the Fly volume, validation, and SSE infrastructure where suitable. Retain the single-machine deployment assumption unless an actual infrastructure change is separately authorised. A maintained 3D rendering library is appropriate; a wholesale backend rewrite is not required. New plane messages retain this project's **240-character** cap; existing archived answers retain their 140-character cap.

Keep implementation tests and write-based playtests local, using a throwaway `DATA_DIR`; do not post test planes or stamps to the production app. Preserve inherited `PROCESS.md`, `reflections/`, `agent/`, course tags, CI secrets, and `fly.toml` machine settings. Record new product/permission decisions in README and a new decision record under `docs/decisions/`. Keep `pnpm check:evidence` passing on inherited evidence. Use the established CI deployment workflow and report honestly which production checks were read-only and which behaviours were verified locally.

Continue to satisfy the operational purpose of [Crit 10: Fly by instruments](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/): two independent browsers can act on shared state, the server distinguishes them and enforces their permissions, and someone can narrate their actions from server logs alone. The pod exemption from graded reflections and compulsory process entries still applies. Document the new permission model and implementation decisions in the repo without inventing a grading obligation.

## Reference and visual fidelity

Inspect the live reference and its available screenshots before building. The original's desktop presentation currently displays the globe and asks visitors to join on a phone; **our desktop version must expose all interactions directly**. For the original interaction sequence, consult [Active Theory's project case study](https://medium.com/active-theory/paper-planes-6b0008c56c17) and the [official One Show project record](https://www.oneclub.org/awards/theoneshow/-award/25379/paper-planes/). If the mobile interaction cannot be accessed, use those records and the explicit requirements below; do not stall or claim to have observed unavailable screens.

Match the reference's defining scene: a full-window pastel sky, a prominent slowly rotating low-poly globe, softly lit folded planes moving around it, and sparse interface controls. Preserve its sense of scale, depth, soft colour, gentle movement, and playful catching/throwing. Use locally implemented geometry, animation, and UI; identify this as a student recreation in a small About panel with a reference link, without claiming an official affiliation.

Use lilac, pale blue, blush, and teal for the atmospheric background and faceted globe. Give planes a recognisable pointed nose, central fold, two wings, thin paper edges, and subtle fold shadows. Avoid replacing the scene with a flat map, paper-plane emoji, generic dashboard, large card grid, or conventional hero-and-feature landing page. Keep controls legible over the scene and ensure the globe never blocks a form or readable message.

The six available plane colours are **Coral `#F27D8A`, Orange `#F6A66B`, Yellow `#F2D46B`, Mint `#81C8AB`, Blue `#7CAFE5`, and Lavender `#AE94D8`**. These are six equal paper options, not the old dream/illusion/bubble/shadow/dew/lightning categories. Apply the choice to the actual plane material, including folded and unfolded views. Keep its inner writing surface pale enough for dark, readable ink. Colour never indicates authorship, popularity, or permissions. Pair swatches with names and a selected indicator.

## Detailed reproduction blueprint

The dimensions, durations, camera parameters, and UI placements below are **implementation targets for this adaptation, not measured or claimed original source values**. Match the reference's observed appearance first and use these values to remove ambiguity. Minor adjustments are allowed to prevent clipping and improve readability; do not use that flexibility to change the art direction. The desktop controls, coloured paper, editable message, and manual region selector are our explicit additions. Keep the rest of the visual experience close to the reference.

### A. Full-screen composition and interface chrome

- Use one continuous scene filling `100dvh`, with a safe `100vh` fallback. On a desktop home screen there should be no document scrollbar. Forms and open-paper content can scroll within their own area when needed, particularly with the mobile keyboard open.
- At a 1440 × 900 viewport, place the globe near `(50% width, 46% height)` and make its apparent diameter about 62–70% of the shorter viewport dimension. Surround it with ample sky and a few closer planes crossing the foreground. At 390 × 844, start around `(50%, 41%)` with a diameter about 86–94% of the viewport width; reserve a clear lower area for primary actions. Reframe when the keyboard appears rather than letting it cover the writing controls.
- Use a full-bleed gradient with broad, soft colour transitions, not distinct stripes: pale blue `#AFCBE9`, lilac `#BCB4DE`, and a muted blush `#D5BBDB`, with a restrained light centre behind the planet. A slow 25–40 second colour drift is acceptable. Use a fixed gradient when reduced motion is enabled.
- Keep the identity small at the top left: a folded-plane symbol and **Paper Planes**, approximately 20–24px, with a quiet **Six colours. One shared sky.** subtitle. Top right holds **Your planes**, **Sound off / on**, and **About**. Use 28–36px desktop edge insets and 16–20px phone insets, plus safe areas. On phones, put secondary controls in a compact, labelled menu without hiding Create or Catch.
- Place **Create a plane** and **Catch a plane** together near the bottom centre, above the safe area, with at least 12px between them. Use 48px minimum control height, rounded ends, a light paper-like surface, dark ink text, and subtle shadows. The surrounding scene remains visually dominant. Keep secondary actions smaller and quieter, but with 44px touch targets.
- Use a light, friendly sans serif for scene labels and controls, with reliable CJK fallbacks. Controls are generally 14–16px; scene instruction text is 16–20px. Use dark ink `#27364B` on paper and high-contrast text/backplates over the sky. Do not place pale text over a similarly pale patch without a local contrast treatment.
- When a real launch arrives, a brief location caption such as **A plane just left Canberra, Australia** may fade in near the globe for about 2.5 seconds. Derive it from an actual committed event, coalesce bursts, and never interrupt editing or reading. Never display fake global statistics or invented place announcements to make the scene look busy.

### B. Globe, camera, light, and flying scene

- Build a genuinely three-dimensional, triangulated globe with geographically recognisable continents. Use simplified, locally bundled geographic geometry with its required attribution. A plain sphere with random triangles or noise patches is not an adequate substitute for a world map.
- Use a planet radius of 1 scene unit as a convenient working scale. Start with a perspective camera around 35–42 degrees vertical field of view, then set camera distance to achieve the framing above. Recompute aspect ratio and framing on resize without recreating all application state.
- Use flat-shaded facets, pale blue/lilac ocean tones, slightly raised teal/mint land shapes, a broad soft highlight, and a restrained teal rim. Avoid satellite imagery, photorealistic clouds, dark space, neon bloom, harsh outlines, or a wireframe globe. A soft atmospheric halo must not obscure planes or labels.
- Idle rotation should be slow, roughly 0.6–1 degree per second, with a slightly tilted axis. Dragging empty sky may rotate the globe; distinguish this from a plane throw and disable it while editing, catching with the net, or reading. Do not introduce unlimited zoom that loses the scene. Resume idle rotation gently after pointer release.
- Flying planes follow curved paths in a shell around the globe, with a mixture of front and rear passes. Use a small number of orbit/flocking bands with slightly different inclinations and speeds. Bank their wings into turns and align the nose with travel direction. Avoid identical evenly spaced circles and synchronised bobbing. Planes behind the globe must be occluded correctly.
- Use size and depth to create three layers: tiny distant silhouettes, mid-distance planes around the planet, and occasional larger near passes. Near-plane projected sizes should be roughly 18–48px during ordinary flight; do not fill the screen with huge message labels. Keep object identity stable when changing level of detail or frame quality.
- Every catchable rendered instance must map to one actual available plane ID. Sample a bounded set when the database is large; the **Catch an available plane** button must still query all eligible server records. Aim for approximately 60fps on a typical laptop and a stable 30fps on a phone, adapting detail and instance count before dropping core functionality. Report the actual tested environment rather than promising universal frame rates.

### C. Paper construction and where the writing belongs

- Use the same paper object through writing, folding, throwing, catching, and unfolding. A rectangular sheet should visibly become a recognisable dart-shaped paper plane, not disappear and be replaced with an unrelated icon.
- The open sheet is approximately portrait A-series proportion, width:height `1:1.414`. Use a pale tint derived from the chosen colour for its inner surface, stronger colour on the outer wings, fine fold creases, and a soft contact shadow. Texture should be subtle; no heavy crumpling, torn edges, glossy plastic, or thick cardboard.
- Construct foldable panels with pivots on their creases. Animate the upper corners inward, the centre fold, and the two wings outward in sequence. The finished plane needs an actual central ridge and two visible angled wings. Preserve panel continuity through the transition; a whole-object spin, fade, or scale alone does not count as folding.
- Use a consistent paper-space coordinate system. Reserve the upper 12% for a small origin label, the middle 58–64% for message text, and the lower 20–24% for stamps, with an outer margin around 7%. A longer message can use a scrollable writing window within this middle region. Its full text must remain available at a readable size.
- In composition, the textarea visually belongs to the paper. In reading mode, render plain text in that same area. The editable layer must use real input semantics, support IME composition, and not fight text selection. Do not mirror a textarea's text underneath it and accidentally make each letter look doubled.
- On the folded plane, show a short first-line preview on a visible wing and a compact origin mark on the opposite wing. This preview is derived from the original body, not an editable second message. The complete body remains on the open sheet. The preview may omit characters for space but must never mutate the stored body.
- Use panel UV mappings, a canvas-generated text texture, or a DOM layer transformed with the paper so the ink remains attached during rotation and folding. Clip ink to its panel; give back faces the correct orientation and prevent reversed lettering, z-fighting, or text bleeding across edges. Generate textures after relevant fonts are ready. Dispose obsolete textures when changing messages or colours.
- A captured plane should occupy about 36–48% of desktop viewport width, capped around 620px, or 78–88% of phone width. Present it at a shallow three-quarter angle so one wing's written preview can be read. Stop bobbing while a visitor inspects it. Upon unfolding, settle the writing face almost parallel to the screen; reading should not require rotating a 3D object into just the right angle.

### D. Composer layout and selection controls

- On desktop, centre the paper and place a narrow 260–300px control rail beside it, with a 24–32px gap. Keep the overall group within approximately 1000px. Fit the sheet to the available height; keep a single coherent paper surface rather than a rectangular modal full of unrelated cards.
- On phones, the paper uses `calc(100vw - 32px)` width. Stack controls beneath it, with the action row reachable above the keyboard or by normal scrolling. If the portrait sheet cannot fit, crop neither the text nor the controls: let this foreground layer scroll while the background scene remains fixed.
- Organise the interaction as **Write → Colour & region → Fold → Throw**, with a quiet progress indicator. Desktop may show writing and settings together, but the button labels must make the next step clear. Moving backward preserves every field. Do not require a full-screen onboarding tour.
- Default to Blue on the first draft. Show all six colour options together: six swatches in one row on desktop and a 3 × 2 grid where needed on phones. Each swatch has a 32px visual colour circle inside at least a 44px target, its name, and an explicit checked state. Selection updates the paper immediately without changing its text.
- Region search opens a labelled combobox/popover. Search by display name and supported aliases; show a scrollable list, an empty-result state, keyboard navigation, Enter-to-select, and Escape-to-close. A country/region alone is valid; changing it clears any previously selected city that no longer belongs to it. Save canonical IDs, and derive labels and approximate coordinates from server-validated catalogue data.
- A region stamp preview appears on the paper as soon as a valid choice is made. Use the caption **Choose the place your plane represents — it does not have to be where you are.** Do not request location permission behind this control.
- The counter sits just outside the writing area as `123 / 240`. Choose Unicode code-point counting consistently, normalise line endings, and treat whitespace-only input as empty without trimming valid submitted leading/trailing whitespace. During CJK IME composition, avoid rejecting intermediate composition text. Show errors next to the relevant field and keep Fold unavailable until the draft validates.
- Keep draft text, colour, and selected region in tab-scoped session storage where available; clear only after confirmed creation. A close action returns to the world and preserves the draft. Label the create entry **Continue your plane** when a saved draft exists. No browser-storage failure may prevent ordinary form submission.

### E. Motion choreography and desktop gesture rules

Treat this as a timeline, not a set of arbitrary CSS effects. Use smooth acceleration/deceleration, with no elastic bouncing on text-heavy surfaces. Timing targets below exclude network waiting. All successful animations run once per committed event, not again whenever a component rerenders.

| Transition | Target duration | Required visible movement and end state |
| --- | --- | --- |
| World → composer | 450–650ms | Slow the globe, ease it backward/aside, and bring the open sheet from the lower foreground into its reading position. Fade in settings after the paper settles. |
| Sheet → folded preview | 1000–1400ms | Fold the two upper corners, close the centre fold, then set the wings. Ink and the region mark follow their paper panels. End with the nose pointed up/away, ready to throw. |
| Back to edit | 800–1100ms | Reverse the fold sequence and restore the same text selection/input state where practical; do not clear the draft. |
| Committed throw | 900–1300ms | Lift the nose, accelerate away from the camera along a curved path toward the globe, bank into the flock, then restore ordinary world controls. |
| Successful catch | 650–950ms | Remove the caught ID from ordinary circulation and bring that plane along a curved approach into the close-up position; decelerate to a still, readable pose. |
| Caught plane → readable sheet | 900–1200ms | Open the wings and centre seam into the same paper, rotating its writing face toward the viewer. Reveal complete text and stamp history when settled. |
| Stamp preview | 220–350ms | A region stamp gently presses into its reserved area with a small shadow/opacity change. Keep it explicitly a preview until the server commits it. |
| Confirmed onward flight | 1500–2100ms | Fold the caught sheet, then launch the same plane into the sky. Keep original message and colour throughout. |
| Open journey view | 500–750ms | Move the open paper aside and frame the relevant globe hemisphere; reveal route segments in chronological order without a rapid globe spin. |

For a desktop throw gesture, begin only on the ready plane, capture that pointer, and move the preview a limited distance with the drag. A starting threshold is an upward displacement of at least 80 CSS pixels on desktop or 60 on touch, with upward displacement greater than 1.2 times horizontal displacement. Below threshold or on pointer cancellation, return to the ready pose without submitting. Keep **Throw plane** as an equal, always available action. Disable competing controls while a request is pending and show **Sending…** on the still-visible plane. Do not require pointer speed, a flick sensor, or a precise timing window.

In catching mode, render a fine circular net/target approximately 100–140px across that follows the scene pointer with a light easing. Outline the nearest eligible plane within the target; a click requests that ID rather than silently catching a different object. Increase the effective hit area to at least 44px. On touch, allow direct tapping of planes and the large catch-any button instead of making users drag a cursor. If another visitor wins the catch, briefly show **That plane has already been caught. Try another.** and stay in catching mode. Escape or **Back to sky** cancels catching without creating an event.

For reduced motion, use a short fade of no more than about 150ms or an immediate state change. Retain every control, success/error message, and network action. Do not make users wait through an invisible animation timer.

### F. Stamps, routes, and returning to your planes

- Stamp artwork is typographic and passport-like: a circular or softly rectangular outline, a simple plane/globe mark, the chosen region, optional city, and a compact date. Use muted ink related to the plane's colour while maintaining contrast. Stamps are not flags and do not replace the message.
- The origin stamp is first and immutable. Subsequent stamps have a stable server-assigned sequence, region, public actor handle, and timestamp. Use the preview date while drafting and the authoritative event time after commit. Releasing without a stamp must not append a blank or hidden stamp.
- Lay stamps out in a deliberate grid in their own paper region. If there are too many to fit, show a few with **View all N stamps**, opening a scrollable continuation sheet/history. Never shrink the body text or paint stamps over it to fit a long history.
- Journey view pairs a globe with an ordered list such as `1 Canberra, Australia → 2 Tokyo, Japan`. Use great-circle arcs raised slightly above the globe, small endpoint dots, and a clear distinction for the selected leg. Selecting a stamp highlights its matching point/leg; handle the international date line and duplicate adjacent coordinates without drawing a line through the planet.
- Derive distance from the same catalogue coordinates used by the displayed route. Display **Approximate virtual distance** near the figure. The authoritative history is the ordered event list, not a client-side animation path.
- **Your planes** opens a light side drawer on desktop, up to about 360px wide, and a full-width sheet on mobile. Each row has the actual coloured plane thumbnail, a message excerpt, origin label, creation date, stamp count, and **View journey**. Use newest-created-first order with pagination/loading for a large history. Opening it reads the current state; it must not catch or lock a plane.
- Retain an open inspector while new stamps arrive, updating only the relevant history. Avoid turning this view into an activity feed, notification centre, or leaderboard. Explain that access to **Your planes** is tied to this anonymous browser, without implying account-based synchronisation.

### G. Explicit state transitions and recovery

Maintain one explicit foreground interaction state instead of several independent booleans that can show incompatible screens together. This table defines the product states; adapt names to the framework.

| State | Primary action | Back, close, or failure behaviour |
| --- | --- | --- |
| `world` | Create, catch, or inspect your planes | Background reconnects without replacing the screen. |
| `editing` | Validate and fold | Closing saves the local draft; validation errors remain beside fields. |
| `folded_ready` | Throw by button or gesture | Back unfolds the same draft; cancelling a small drag stays ready. |
| `launch_pending` | Await one idempotent create request | Keep the plane visible; on uncertainty reuse the same request key to reconcile. Never discard the draft or issue an unrelated second create. |
| `launching` | Play the confirmed departure | The plane already exists on the server; interruption goes to the reconciled world, never recreates it. |
| `catching` | Request a highlighted ID or catch any | Cancel returns to world; no available planes gives a clear empty state. |
| `catch_pending` | Await atomic acquisition | Failure/conflict returns to catching with a reason, not a fabricated catch animation. |
| `caught_folded` | Open the paper | Back to sky releases the hold without a stamp; do not strand a plane because a dialog closed. |
| `reading_held` | Read, preview a region stamp, then send | Release without stamping is always available. Losing the lease keeps the text readable but disables mutation. |
| `relaunch_pending` | Await atomic stamp/release | Preserve the draft stamp on a retryable failure. Mark it committed only after success. Reconcile uncertain outcomes using the same request key. |
| `journey_readonly` | Read route/history | Back restores the previous world/drawer context; no catch is acquired. |

Separate `connection` state from the foreground state. Show a restrained **Reconnecting…** indicator when needed. Reading and drafting remain usable while disconnected; actions requiring a confirmed server mutation must give clear unavailable/pending feedback. A timeout must never be reported as success. Do not publish queued content later without the visitor's explicit retry.

## The complete interaction

### 1. Enter the shared world

Open directly into the globe scene with discoverable **Create a plane**, **Catch a plane**, and **Your planes** controls, a small sound toggle, and a short first-use instruction. No account, installation, QR code, second device, or sensor permission is needed. Keep the scene visible through transitions, but dim or slow it when reading or writing needs attention.

Render real circulating planes when data exists. Any ambient decorative planes must be visually secondary, non-catchable, and excluded from activity, messages, and counts. An empty world must give an honest invitation to create the first plane, not fabricated visitors or journeys.

### 2. Write, choose a colour, and add a region

Show a large open sheet of paper in the foreground. Provide a real, accessible textarea aligned with its writing area and a live preview of the ink on the paper. Accept Chinese, English, emoji, spaces, and line breaks. Preserve the existing 240-character limit, use the code-point counting rule specified above on client and server, display a counter, and reject empty or over-limit submissions without silent truncation. Render all messages as plain text, never executable markup.

Show the six colour choices and a searchable **Country / region** selector with an optional city selector where curated city data is available. Do not require a city. Use a local, stable catalogue with canonical IDs and display labels, covering global regions; derive approximate map coordinates from the selected entry. Examples include Australia / Canberra and Japan / Tokyo. The label is freely chosen and is not a verified claim about the visitor's location. Explain this briefly beside the selector. Do not ask for GPS, infer a compulsory region from IP, or make a paid geocoding service necessary.

Preview the chosen region as a stamp printed on the sheet. Require a valid colour, region, and message before launch. Changing any field updates the preview without losing the draft. Allow **Fold** and **Back to edit** before submission. The folded preview must already show some of the written text on a visible wing; its text should move and rotate with the paper.

### 3. Fold and launch

Animate the sheet folding into the selected coloured plane. On desktop, support dragging the plane forward/upward and releasing it, plus a prominent **Throw plane** button. On touch devices, support an upward swipe and the same button. Optional motion controls must never be the only way to launch.

Commit the plane to the server once. Only after confirmed success should it leave the foreground and join the shared sky. Preserve the draft on failure and show an understandable retry state. Repeated clicks, gesture/button overlap, and an uncertain network retry must not create duplicate planes; use a server-backed idempotency mechanism.

Every other connected browser should receive the committed plane within about one second without refreshing. Its ID, colour, message, author handle, and origin stamp must agree across browsers. Do not mistake a local animation for successful publication.

### 4. Catch a real plane

Click **Catch a plane** to enter a catching mode with a clear pointer-controlled net/target. A desktop visitor can click a visible eligible plane; a touch visitor can tap one. Also provide an accessible **Catch an available plane** button so catching does not depend on precision, vision, dragging, or animation.

Select a real persisted plane that is currently available. Prefer someone else's plane when possible. If only the visitor's own plane is available, allow a clearly labelled self-catch; if none is available, show an honest empty state. A successful catch brings that exact plane toward the camera and holds it still for inspection. Never substitute a random canned message or another plane's metadata.

### 5. Read the words on the paper

**The captured plane itself must display the message written by its sender.** This is a central acceptance condition, not an optional tooltip or separate text card.

In the close-up folded view, show real ink on the visible wing. Provide **Open / Unfold** to animate it into a readable sheet containing the complete original message, colour identity, origin stamp, and subsequent region stamps. Text should appear attached to the paper surface through an appropriate texture or correctly transformed DOM layer; a screen-fixed label floating beside the plane is insufficient. Keep an accessible HTML representation of the same full message.

Long messages must wrap within the paper, including CJK and unbroken strings. In the unfolded view use readable type, at least 16px at normal mobile sizing; allow the writing area to scroll if necessary rather than shrinking everything to illegibility. Preserve line breaks. A shortened preview on a distant/folded plane is acceptable only when the full original text is available immediately on opening it. Do not cover the message with stamps or clip it behind folds.

The catcher can read the message but **cannot rewrite the original text, change its colour, replace its origin region, or impersonate its author**.

### 6. Stamp and send onward

While holding a plane, let the catcher choose their own country/region, preview a new stamp, and use **Stamp & send onward**. Append the new stamp and release the same plane in one successful transaction. Retain its original ID, message, colour, author, origin stamp, and all earlier stamps. Offer **Release without stamping** as well. Folding and rethrowing should feel like a continuation of the reference experience.

Show the ordered stamp history with a small globe route connecting the chosen regions. Any distance is an approximate distance between selected region centres, explicitly labelled as a virtual journey; do not imply GPS tracking or verified travel. Adjacent identical locations should not produce a spurious flight segment.

**Your planes** lets the current anonymous browser reopen planes it created and inspect their current stamp history and virtual routes. This is a quiet retrieval view, without public rankings, likes, follower counts, chat, or notifications.

## Real shared state and permissions

Persist each plane's ID, immutable original body, colour, origin-region ID, creator reference, creation time, ordered stamp events, and current availability. Keep secrets separate from public records. Local storage may hold preferences and unfinished drafts, but cannot be the shared database or authority for permissions.

Implement a clear server-owned state model: local draft → available in flight → temporarily caught → available again. Acquire catches atomically. If two visitors try to catch the same plane, exactly one obtains it and the other receives useful feedback. Use a 120-second server-timed catch lease, renewing around every 30 seconds while the holder is actively viewing the held plane. If renewal fails, show a quiet warning during the final 30 seconds. Release abandoned/expired holds so a closed tab cannot strand a plane permanently. Explicit Back to sky/close should attempt a normal release; expiration remains the dependable recovery when a tab disappears. On a refreshed page reconcile ownership before restoring the held view. Expiration affects availability, never the stored message or history.

Only the current lease holder can stamp/release that held plane. Validate the anonymous session together with the specific current lease ID/version, so an old request cannot act on a later catch of the same plane. Treat any lease credential as private. Validate colour enum, region IDs, text length, and request size on the server, including forged direct requests. Make repeat stamp/release requests idempotent and associate each request key with the same actor and operation; reuse with a different payload must be rejected. Keep chronological history stable under concurrency. Do not trust an author ID or owner flag sent by the client. Inspect rather than assume existing request-origin, cookie, and write-limit protections: retain implemented protections, add same-origin write checks and bounded request bodies where absent, handle malformed cookies safely, and document proportionate visitor-based rate limits for the new write operations.

Preserve real-time updates and reconnect recovery. After refresh, reconnect, or server restart, committed messages, colours, and stamps must remain; the UI reconciles with server state without duplicated planes, lost stamps, or animation storms. Incoming activity must not replace an open message, reset an in-progress draft, or steal focus.

## Desktop, mobile, and accessibility

The full loop must work with a mouse and ordinary buttons on a laptop, with keyboard controls alone, and with touch on a phone. Desktop is an interactive client, not merely the original's spectator screen. Use responsive layouts at 390px, 768px, and 1440px with no horizontal overflow. Accommodate the mobile software keyboard and safe-area insets.

Provide visible focus, accessible names, labelled fields, inline validation, modal focus restoration, and Escape-to-close where appropriate. Do not capture typing keystrokes as global shortcuts. Respect reduced motion, avoid flashing, and keep sound off until explicitly enabled. Sound can be a small folding, throwing, or catching cue; it must not be required to understand success.

Use adaptive rendering quality, a bounded number of displayed planes, and efficient rendering for the flying flock. Pause decorative work in background tabs. Avoid allocating full-resolution text textures for every distant plane. If WebGL is unavailable, provide a simple paper-based 2D view with real create/catch/read/stamp/release operations. Retain a server-rendered reading and form-based interaction fallback with JavaScript disabled, following the repo's progressive-enhancement principle.

## Crit 10: identifiable actions and useful logs

Give each anonymous browser a stable, non-secret public handle that can be matched between the page and logs. Derive it from the existing persistent visitor identity using a one-way construction with enough collision-resistant differentiation; do not use one of the six plane colours as identity. Show the visitor's own handle quietly and attribute messages/stamps where appropriate. Explain this product decision in README and the lower app-specific rules. Do not expose a roster of viewers, presence counts, or secret cookie tokens.

Emit structured server-side stdout events for visitor issuance, plane creation, catch, stamp/relaunch, unstamped release, lease expiration, stream open/close, and validation/permission refusals. Include timestamp, request/event ID, action, outcome, public actor handle, plane ID when applicable, and a concise reason for failures. Record committed mutations after success. Never log message bodies, raw tokens, cookies, full IP addresses, or unvalidated request payloads.

Document who may read and change each resource and where the server enforces the rule. Demonstrate two separate browser profiles creating and exchanging planes locally, and verify that the resulting stdout lets an observer distinguish who created, caught, stamped, and released each plane without operating the UI. The same logging must be available in production through `flyctl logs -a comp4020-riff8-liuru-1`; explain how to read it without generating synthetic production activity.

## Acceptance and delivery

Create a small reference/comparison set before declaring the visual work finished. Capture the live reference's available desktop world view, record which interactions were actually observed, and distinguish these from our specified adaptations. Capture the implementation in the following states at matching viewport sizes: world, paper with entered text, six-colour/region selection, folded ready plane, caught close-up with wing text, unfolded readable paper, and multi-stamp journey. At minimum check 1440 × 900 and 390 × 844. Inspect these images for missing folds, incorrect depth, plain-sphere geography, unreadable text, clipping, overlapping stamps, and unrelated dashboard styling. Fix identified defects before delivery; merely producing screenshots is not verification.

Use this concrete two-browser walkthrough against the local build with a throwaway `DATA_DIR` and separate cookies/storage. Use read-only checks for the deployed app:

- Browser A chooses Blue and Canberra, Australia, then types `从堪培拉寄来的一句话。` followed by a newline and `Hope this finds you well ✈️`. Verify the live paper text, fold it, and throw it using the desktop button. Confirm a single persisted plane ID and a matching creation log.
- Browser B sees that plane without refreshing, enters catch mode, and catches it. A concurrent attempt by another independent session must lose cleanly. Inspect the written wing, then unfold and compare the complete message character-for-character, including the newline and emoji.
- B selects Tokyo, Japan and sends it onward. A opens Your planes and sees the same plane ID, Blue material, unchanged message, origin stamp, new Japan stamp, and the two-point virtual route. The logs name A as creator and B as catcher/stamper.
- Refresh both browsers and restart the test server with the same database. Verify that the text, colour, origin, and stamp sequence survive. In a controlled test, close a browser while it holds a plane and verify its eventual availability after lease expiration.
- Repeat the UI path once on a phone-sized viewport and once using keyboard/buttons without gestures. Exercise a 240-code-point multiline message, an over-limit message, HTML-looking text, CJK composition, a very long unbroken word, and a region change after choosing a city. Ensure text never executes as markup and all valid content remains readable on the paper.

1. Visually compare the result against Paper Planes: the immersive pastel globe, folded geometry, flying scene, close-up paper, and transitions should be recognisably faithful. Do not stop at a generic themed form.
2. On desktop, create a Blue plane with a multiline Chinese/English/emoji message and an Australia region stamp. In an independent browser, catch that exact plane, read the same text **on its surface**, unfold it, add a Japan stamp, and send it onward. In the first browser, see the added stamp and route with the original text and colour unchanged.
3. Verify all six colours, manual region selection without location permission, long-message layout, empty/invalid submissions, keyboard operation, mobile sizing, reduced motion, and the rendering fallback.
4. Test two simultaneous catches, forged author/lease requests, duplicate launch/release requests, abandoned leases, and reconnect/restart persistence. Prove that a catcher cannot modify another person's original message or earlier stamps.
5. Check logs across independent cookie jars: correct public actors and plane IDs, clear refused actions, and no credentials or message bodies. Use focused automated tests for these shared-state and permission boundaries, plus browser checks for the visual loop.
6. Run the repository's required checks, including `pnpm check` and `pnpm check:evidence`, retain the general invariant tests, and explain any adaptation of theme-specific tests. Update README with the new behaviour, permissions, setup, rendering fallback, reference attribution, and known limitations.
7. Deploy only `comp4020-riff8-liuru-1` through the existing CI deployment workflow. Verify local two-browser exchange and logs, and perform available read-only production checks. Report the production URL, confirmed deployment status, and actual verification results; distinguish a queued deployment from a confirmed one. Follow the top pod block's instruction to delete `prompt.md` in the implementation run's final commit.

Prioritise the complete, persistent, multi-user paper-plane loop and visible written messages first; polish the reference's visual fidelity around that working interaction. Finish with a usable application, not an implementation proposal.
