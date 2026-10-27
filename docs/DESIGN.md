# Interface design ledger

ChangeReceipt is a working comparison tool, not a marketing landing page. Its visual idea is a handoff ledger: a calm green step rail, a white work surface, and source-to-result evidence that stays readable as the task gets more complicated.

## Tokens

| Role                          | Value     |
| ----------------------------- | --------- |
| Navigation and primary action | `#123c36` |
| Selected/supporting green     | `#e9f4e6` |
| App canvas                    | `#f3f6f5` |
| Work surface                  | `#ffffff` |
| Main text                     | `#172e2a` |
| Secondary text                | `#5d706b` |
| Attention/ambiguity           | `#b16e13` |

The primary interface family is Segoe UI with system sans-serif fallbacks. A restrained Georgia display heading gives the ledger a recognisable voice; form labels, values, and controls stay in the sans-serif family. Dynamic totals use tabular numerals. Body line lengths remain compact enough to scan.

## Workflow and hierarchy

The three numbered stages reflect an actual sequence: Sources, Mapping, and Review. The rail orients the user while the current step owns the primary action. Sources show the role, filename, parse result, and bounded preview. Mapping makes the key and field pairs explicit. Review puts incomplete or ambiguous evidence ahead of the ordinary change list and keeps export close to the scope description.

Source text is never an image. Controls and table cells remain semantic, selectable HTML. State labels explain the result in words so colour is supporting evidence. Error states say what failed and how to replace the input. The receipt is a downloadable artifact, not a claim of certification.

The mobile layout moves the step context above the task, stacks paired controls, and permits bounded horizontal scrolling only inside data tables. A narrow viewport must still expose the primary action and every field mapping.

## Motion and accessibility

The motion character is calm and functional: approximately 160 ms for press/state feedback and 240 ms for an infrequent step change, with `cubic-bezier(0.2, 0, 0, 1)` and no overshoot. Motion is limited to transforms, opacity, and colour; it does not carry the only evidence of a state change. Reduced-motion preference removes transitional movement. There is no ambient or looping animation in the ledger.

Keyboard focus must remain visible. Native buttons, selects, file inputs, and disclosure controls support keyboard use. Status messages and errors need accessible announcements; field mappings need persistent names; tables need headers and a readable empty/missing value distinction. Touch actions should have at least a 44 px target where practical.

No raster assets are needed: the subject matter is source data and a trustworthy review flow. A compact receipt mark and a consistent outline icon vocabulary are sufficient.

## Acceptance criteria

- The complete import, mapping, review, and export path works from an empty session.
- Duplicate identifier groups and invalid identifiers are visible, excluded from ordinary matches, and explained in the receipt.
- Editing either source or the mapping invalidates the previous comparison.
- Cancel/reset cannot bring stale imported data or a stale result back into the session.
- Desktop, mobile, keyboard, and reduced-motion states remain usable.
- Source text, JSON evidence, and comparison scope agree; no UI copy claims more than the implementation measured.

These notes define the intended direction. Final screenshots and the verification report are the evidence for the implemented result; the notes alone do not establish that a browser check passed.
