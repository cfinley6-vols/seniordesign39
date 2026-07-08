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
