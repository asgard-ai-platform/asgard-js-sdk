# BUILD-030 Unify the composer's attachment previews into one chip

## Meta

- Task ID: `BUILD-030`
- Status: `done`
- Issue: — (direct report; no PM issue)
- Source spec: — (follow-up to BUILD-028, agreed in-session)
- Complexity: `S`
- Version: `0.3.21 → 0.3.22`

---

## Brief

BUILD-028 kept two different shapes for pending attachments: images rendered as a 100×80 thumbnail grid, documents as chat-kit chips. Each shape carried its own remove control — a filled 20×20 square with a dark backdrop overlaying the thumbnail's corner, versus a bare `×` glyph inside the chip — and the two sat in separate rows because `.preview` was a `flex-direction: column`.

With one image and one document attached, the result reads as **two unrelated close buttons** of different weight, and the heavier one (overlaying the picture) looks like it dismisses the whole preview area rather than removing that single file.

Collapse both kinds into the same chip. An image chip differs from a document chip only in its leading glyph — a 20×20 thumbnail instead of the paperclip — so there is one visual language and one remove affordance. The zoom modal survives: clicking the thumbnail still opens the full-size view, which is what the large grid was actually for.

**Already exists:**

- `packages/react/src/components/chatbot/chatbot-footer/attachment-preview.tsx` — the two-lane renderer (`images.map` thumbnails + `documents.map` chips), `StatusOverlay`, zoom modal.
- `packages/react/src/components/chatbot/chatbot-footer/attachment-preview.module.scss` — `.thumbnails` / `.thumbnail` / `.thumbnail_image` / `.overlay` / `.spinner` / `.remove_button` for the image lane; `.chips` / `.chip` / `.chip_icon` / `.chip_remove` for the document lane.
- `use-attachment-upload.ts` — supplies `AttachmentItem` with `kind`, `status`, `previewUrl`; unchanged by this task.

---

## Design decisions

1. **Option A of the three considered** (A: everything becomes a chip; B: keep the grid, only unify the remove button; C: shrink the thumbnail into the chip). A was chosen — one shape end to end, single row that wraps, least space.
2. **The thumbnail stays, at 20×20 inside the chip.** Dropping the picture entirely would make a pasted screenshot unidentifiable; keeping it as the chip's leading glyph preserves recognition without a second layout.
3. **Upload state moves from overlay to chip.** `uploading` dims the chip (existing `.chip__uploading`) instead of covering the thumbnail with a spinner; `error` tints the border (existing `.chip__error`). This removes `.overlay` / `.spinner` / `.error_icon` and keeps every attachment one row high.
4. **Zoom modal unchanged** — still reached by clicking the image, now the 20×20 thumbnail.

---

## Relevant Rules

| §    | Rule (summary)                                                                       |
| ---- | ------------------------------------------------------------------------------------ |
| §1.1 | No `any` / `as any`                                                                  |
| §1.2 | No `@ts-ignore` / `eslint-disable` to bypass type or lint errors                     |
| §3.1 | Exported functions / components declare explicit return types                        |
| §4.1 | React component props fully typed                                                    |
| §4.2 | No hardcoded color values — theme via CSS variables / theme tokens                   |
| §6   | Remove now-dead styles rather than leaving them orphaned                             |
| §7   | No dead commented code                                                               |
| a11y | Every remove button keeps its `aria-label`; the zoom modal keeps its own close label |

---

## Acceptance Criteria

- `R1` When any attachment is pending, the system shall render it as a chip carrying a leading glyph, the file name, the formatted size and a remove button, regardless of whether it is an image or a document. → T1, T2
- `R2` When the attachment is an image with a preview, the chip's leading glyph shall be a 20×20 thumbnail of that image; otherwise it shall be the paperclip icon. → T1, T2
- `R3` When the user clicks an image chip's thumbnail, the system shall open the existing zoom modal at full size; the modal's close button keeps its own accessible label. → T1
- `R4` All chips shall expose exactly one remove control each, sharing a single style (`.chip_remove`); the former overlaying square (`.remove_button`) shall no longer exist. → T1, T2
- `R5` When an upload is in flight the chip shall dim, and when it fails the chip's border shall turn to the error colour — with no overlay or spinner, so every chip stays one row high. → T1, T2
- `R6` Chips shall flow in a single wrapping row (`flex-wrap`), so a mixed image + document selection no longer occupies two separate lanes. → T2
- `R7` (Smoke check) `npm run build:core && npm run build:react`, `npm run lint:packages`, `npm run format:check` and `npm run test:react` shall pass, and `/composer` in react-demo shall show the unified chips in the browser with no console errors; capture before/after screenshots. → T3

---

## Implementation Tasks

- [x] T1 (R1, R2, R3, R4, R5): Rewrite `attachment-preview.tsx` to map over `items` once, emitting one chip per attachment; image chips get a clickable `chip_thumb`, others the paperclip. Drop the `images` / `documents` split and the `StatusOverlay` component.
- [x] T2 (R1, R2, R4, R5, R6): Rewrite `attachment-preview.module.scss` — `.preview` becomes a wrapping flex row; add `.chip_thumb`; delete `.thumbnails`, `.thumbnail`, `.thumbnail__error`, `.thumbnail_image`, `.overlay`, `.overlay__error`, `.error_icon`, `.spinner`, its keyframes and reduced-motion block, and `.remove_button`.
- [x] T3 (R7): Run build / lint / format / tests; drive `/composer` in the browser with one image + one document attached; capture before and after.

---

## Coverage

Files:

- `packages/react/src/components/chatbot/chatbot-footer/attachment-preview.tsx` (single-pass chip renderer; `StatusOverlay` removed)
- `packages/react/src/components/chatbot/chatbot-footer/attachment-preview.module.scss` (wrapping row; image-lane styles removed; `.chip_thumb` added)

---

## Behavior notes (intended changes under 0.3.22)

- Pending images no longer render as 100×80 thumbnails in their own row; they become chips with a 20×20 thumbnail, alongside document chips in the same wrapping row.
- Every attachment now has exactly one remove control, all sharing the chip style. The dark overlaying square on thumbnails is gone.
- Upload progress and failure are expressed on the chip itself (dim / error border) rather than as an overlay with a spinner or error glyph.
- The zoom modal is unchanged — still opened by clicking the image.

---

## Execution Log / Change Log

- 2026-07-27: Reported from a screenshot showing one image + one document attached — the two differently-weighted `×` controls read as two unrelated close buttons. Option A chosen from three proposals; branch `fix/unify-attachment-chips` (Status: `in-progress`).
