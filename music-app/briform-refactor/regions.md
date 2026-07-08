## Region Refactor (`regionOps.ts`)

### Notable Bugs

#### `handleMouseDown` on a bubble (JSX)

changing this...
```tsx
onMouseDown={(e) => {
    e.stopPropagation();
    if ((r.layer || 0) === 0) startDrag(r.id, "move");
}}
```

to this...
```tsx
onMouseDown={(e) => {
    e.stopPropagation();
    if (r.layer === 0) startDrag(r.id, "move");
}}
```

Wait — this one's actually a suspicious guard. It says "only start a `move` drag if the bubble IS on layer 0," but `handleTimelineMouseUp` above treats `layer !== 0` as the case where a moved bubble might get auto-deleted, implying move-dragging is meant for non-base bubbles. Worth double-checking this isn't an existing bug rather than something to preserve — flag it, don't just silently port it forward. I'll leave the logic exactly as-is for this refactor pass so we don't mix concerns, but note it below.

### Region Type

```ts
export type Region = {
	id: string;
	start: number;
	end: number;
	label: string;
	layer?: number;
	parentId?: string;
	color?: string;
};
```

The entire file revolved around this data shape.  Every bubble on the timeline, whether base sections or group wrappers is a `Region`.

- `id` - unique, always a `crypto.randomUUID()`
- `start`/`end` - in *seconds*, not pixels or percent; all timeline-position math happens elsewhere; regions themselves only know time
- `label` - the text shown inside the bubble ("Section 1", "Grouped Section", or whatever the user renames it to)
- `layer` - which horizontal row it's drawn on
- `parentId` - if set, this region is a child of the region with that id. This is the only thing that encodes the group hierarchy; there's no explicit tree structure, just the one pointer per node
- `color`- optional override; if unset, a default is picked based on whether the bubble is a parent or not (purple vs. blue)

Key thing to internalize: this is a *flat array*, not a tree. regions: `Region[]`. Parent/child relationships are reconstructed on the fly by scanning for `parentId` matches whenever needed (e.g. `regions.filter(c => c.parentId === r.id)`). There's no nested data structure to keep in sync — which is exactly why `regionOps.ts` exists: flat arrays with implicit relationships need a "re-validate everything" pass after every edit, since nothing enforces the invariants automatically the way a real tree structure might.

Personally, as it is right now, I think it would be best to refactor this as a tree and refactor the existing functionality accordingly.  While the existing code works (though, not flawlessly), the most optimal way to store these `Region` types would be through a tree.

Though, it's possible that a tree refactor would be unproductive for a number of reasons:
- A relationship between two neighboring bubbles doesn't exist structurally in the tree
- In order to get neighboring relationships, we would have to flatten the layer into an array, which is just undoing the tree into an array and adding extra overhead
- In order to render the tree, it still has to be flattened into a list, which would get quite expensive
