# Line Rules

This file tracks the current routing rules for diagram connector lines.

## Layering

- Lines render above table-group backgrounds.
- Lines render below all table cards and object/card foreground content.
- Lines may pass through empty group space behind tables.
- Lines must not render over table surfaces.

## Endpoints

- Field references terminate on the owning table border, not inside row content.
- Field rows expose multiple anchor points on the same side.
- Unused anchors on the same row/side are preferred before reusing a busy anchor.
- When multiple lines target the same row-side, they should spread across the available row anchors.
- The first horizontal segment after leaving a table border, and the last horizontal segment before arriving at a table border, must move outward from that border instead of re-entering the table face.
- If a routed lane ends up on the opposite side of a table from the initially chosen anchor, the endpoint should flip sides instead of backtracking through the table surface.
- Table-level impacts may terminate on the table shell when no specific field target exists.

## Group Behavior

- Lines must not use the top side of a table group as a routing lane.
- Lines must avoid the table-group header band.
- Every table-group header band acts as a routing obstacle for vertical line segments, even when the line belongs to another group or object.
- Shared-group lanes should stay in the empty space of the group and not run along the group border.
- External grouped lanes should stay outside the group shell with visible clearance from the border.
- Lines should not run along a table-group border segment.
- If a nominal vertical lane would cross a group header, the router should move that lane to the nearest clear x-position with visible clearance, even if that requires a larger detour than the default lane offset.

## Shape And Bends

- Orthogonal routing is preferred.
- If two endpoints already share an axis, do not add unnecessary bends.
- Mixed-orientation routes should prefer a single corner.
- Opposing-side routes may use a shared lane with two corners.
- The first bend should stay visually close to the source/target table edge.
- Same-group reference lanes should avoid large “jut out” distances before the first turn.

## Overlap Handling

- When vertical segments would overlap on the same lane, later lines should nudge horizontally so both remain visible.
- Vertical nudging should be small and stable so lines still read as belonging to the same lane family.
- Overlap nudging should not push lines into table surfaces or the table-group header.
- Header avoidance takes precedence over small overlap nudges; a line may move farther than the normal overlap pattern if that is required to clear a header band.

## Stability

- Route choices should be deterministic for the same geometry.
- Small layout changes should not cause unnecessary anchor churn.
- Viewport-only changes such as zoom and pan must not change routing choices.
- When multiple endpoint-side candidates are viable, prefer the settled route with no inward table-face re-entry before considering shorter length or fewer forced side overrides.
- Snap-to-grid is on by default for node movement.
