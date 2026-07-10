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

### Tree Refactor Thoughts

Personally, as it is right now, I think it would be best to refactor this as a tree and refactor the existing functionality accordingly.  While the existing code works (though, not flawlessly), the most optimal way to store these `Region` types would be through a tree.

Though, it's possible that a tree refactor would be unproductive for a number of reasons:
- A relationship between two neighboring bubbles doesn't exist structurally in the tree
- In order to get neighboring relationships, we would have to flatten the layer into an array, which is just undoing the tree into an array and adding extra overhead
- In order to render the tree, it still has to be flattened into a list, which would get quite expensive

Conclusively, I am going to leave it as a flat array, but comment these functions thoroughly in the code for the sake of understanding.

### Full `regionOps.ts` Refactor

```ts
// src/app/(briform)/components/refactor/regionOps.ts

// Region type definition used in BriformCanvas and related components
export type Region = {
	id: string;
	start: number;
	end: number;
	label: string;
	layer: number;
	parentId?: string;
	color?: string;
};

// 
export function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n));
}

export const MIN_WIDTH = 0.25;
export const ADJACENCY_TOLERANCE = 0.5;

// Syncronization Functions

// Function syncs the start and end times of parent regions based on their child regions
export const syncParents = (regions: Region[]): Region[] => {
	// Sort regions by layer and create a map of region IDs to their corresponding region objects
	// Process layer 0 first so parents see already-updated children values
	const sorted = [...regions].sort((a, b) => a.layer - b.layer);
	const map = new Map(sorted.map((r) => [r.id, { ...r }]));

	for (const r of sorted) {
		const children = [...map.values()].filter((c) => c.parentId === r.id);
		if (children.length === 0) continue; // no children, no need to update parent
		const updated = map.get(r.id)!;
		// parent's bounds are derived, not set directly - stretch to fit children
		updated.start = Math.min(...children.map((c) => c.start));
		updated.end = Math.max(...children.map((c) => c.end));
		map.set(r.id, updated);
	}

	return [...map.values()];
};

// Function removes parent regions that have fewer than 2 child regions
export const cleanOrphanedParents = (regions: Region[]): Region[] => {
	return regions.filter((r) => {
		const childCount = regions.filter((c) => c.parentId === r.id).length;
		const isParent = regions.some((c) => c.parentId === r.id);
		return !isParent || childCount >= 2;
	});
};

// Synchronizes regions by cleaning orphaned parents, removing invalid parent 
// references, and syncing parent regions based on their children
export const syncRegions = (regions: Region[]): Region[] => {
	const cleaned = cleanOrphanedParents(regions); // drop underpopulated groups
	const validIds = new Set(cleaned.map((r) => r.id));
	const deOrphaned = cleaned.map((r) => 
		// clear parentId if it points to a non-existent region
		r.parentId && !validIds.has(r.parentId) ? { ...r, parentId: undefined } : r
	);
	return syncParents(deOrphaned); // rederive parent bounds based on children
};

// Clamps start and end times of base layer to ensure they span the full duration
// of the media, preventing float drift from repeated drags
export const clampBorders = (regions: Region[], duration: number): Region[] => {
	if (duration <= 0) return regions;
	const layer0 = regions.filter((r) => r.layer === 0);
	if (layer0.length === 0) return regions;
	const minStart = Math.min(...layer0.map((r) => r.start));
	const maxEnd = Math.max(...layer0.map((r) => r.end));
	return regions.map((r) => {
		if (r.layer !== 0) return r; // only base layer must span full duration
		const updated = { ...r };
		// snap to exact 0/duration to fix float drift from repeated drags
		if (r.start === minStart) updated.start = 0;
		if (r.end === maxEnd) updated.end = duration;
		return updated;
	});
};

// Full sync function that clamps borders and synchronizes regions
export const fullSync = (regions: Region[], duration: number): Region[] => {
	return syncRegions(clampBorders(regions, duration));
};

// Cascading delete function that removes underpopulated groups and their ancestors
export const cascadeDeleteGroups = (regions: Region[]): Region[] => {
	let current = [...regions];
	let changed = true;

	while (changed) { // repeat until no more groups need deleting
		changed = false;

		// Identify underpopulated groups (parents with fewer than 2 children)
		const underPopulated = current.filter((r) => {
			const isParent = current.some((c) => c.parentId === r.id);
			if (!isParent) return false;
			return current.filter((c) => c.parentId === r.id).length < 2;
		});

		if (underPopulated.length === 0) break; // tree is stable, no more groups to delete

		// Function to get the ancestor chain of a region by walking up the parentId pointers
		const getAncestorChain = (id: string): string[] => {
			const chain: string[] = [id];
			let r = current.find((x) => x.id === id);
			while (r?.parentId) { // walk upward through parentId pointers
				const parent = current.find((x) => x.id === r!.parentId);
				if (!parent) break;
				chain.push(parent.id);
				r = parent;
			}
			return chain;
		};

		const toDeleteIds = new Set<string>();
		for (const g of underPopulated) {
			const chain = getAncestorChain(g.id);
			for (const id of chain) {
				const parent = current.find((x) => x.id === id);
				if (!parent) continue;
				const childCount = current.filter((c) => c.parentId === id).length;
				if (childCount < 2) {
					toDeleteIds.add(id); // this ancestor is also stranded, delete it too
				} else {
					break; // this ancestor still has enough children, stop climbing
				}
			}
		}

		if (toDeleteIds.size === 0) break;
		
		// Delete highest layer first to avoid orphaning children before their parents are gone
		const sortedToDelete = [...toDeleteIds].sort((a, b) => {
			const layerA = current.find((r) => r.id === a)?.layer ?? 0;
			const layerB = current.find((r) => r.id === b)?.layer ?? 0;
			return layerB - layerA;
		});

		for (const id of sortedToDelete) {
			current = current
				.filter((r) => r.id !== id)
				.map((r) => (r.parentId === id ? { ...r, parentId: undefined } : r));
		}

		changed = true; // loop again in case this created a new underpopulated group
	}

	return current;
};

// Function to apply resizing of a region while considering its neighbors
export function applyResizeWithNeighbor(
	regions: Region[],
	activeId: string,
	dragMode: "resize-start" | "resize-end",
	t: number,
	duration: number
): Region[] {
	const layer = regions.find((r) => r.id === activeId)?.layer ?? 0;
	let updated = regions.map((r) => ({ ...r }));

	const getSortedLayer = () =>
		updated.filter((r) => r.layer === layer).sort((a, b) => a.start - b.start);

	const active = updated.find((r) => r.id === activeId);
	if (!active) return regions;

	const layerSorted = getSortedLayer();
	const activeIdx = layerSorted.findIndex((r) => r.id === activeId);

	// Drag deletion logic: if the user drags a region past its minimum width,
	// it will be deleted and the neighboring region will be extended to fill the gap.
	if (dragMode === "resize-end") {
		const isRightmost = activeIdx === layerSorted.length - 1;
		if (isRightmost) return regions; // nothing to the right, no-op

		const target = clamp(t, 0, duration);

		// dragged past our own min width toward the left - delete self, extend left neighbor
		if (target <= active.start + MIN_WIDTH && layer !== 0) {
			const leftNeighbor = activeIdx > 0 ? layerSorted[activeIdx - 1] : null;
			updated = updated.filter((r) => r.id !== activeId);
			if (leftNeighbor) {
				const n = updated.find((r) => r.id === leftNeighbor.id);
				if (n) n.end = active.end;
			}
			return fullSync(cascadeDeleteGroups(updated), duration);
		}

		const clampedTarget = clamp(target, active.start + MIN_WIDTH, duration);
		const bubblesToRight = layerSorted.slice(activeIdx + 1);

		if (bubblesToRight.length === 0) {
			updated.find((r) => r.id === activeId)!.end = clampedTarget;
		} else {
			let cursor = clampedTarget;
			const toDelete: string[] = [];

			for (const neighbor of bubblesToRight) {
				if (cursor >= neighbor.end - MIN_WIDTH) {
					// dragged all the way through this neighbor - consume it, keep going
					toDelete.push(neighbor.id);
					cursor = neighbor.end;
				} else if (cursor > neighbor.start) {
					// partially overlapping - push neighbor's start to match, stop here
					updated.find((r) => r.id === neighbor.id)!.start = cursor;
					break;
				} else {
					break; // no overlap, nothing further to do
				}
			}

			updated = updated.filter((r) => !toDelete.includes(r.id));
			const a = updated.find((r) => r.id === activeId)!;
			a.end = cursor > clampedTarget ? cursor : clampedTarget;
			// recheck immediate right neighbor in case consumption changed adjacency
			const newSorted = updated.filter((r) => r.layer === layer).sort((a, b) => a.start - b.start);
			const newActiveIdx = newSorted.findIndex((r) => r.id === activeId);
			const immediateRight = newActiveIdx < newSorted.length - 1 ? newSorted[newActiveIdx + 1] : null;
			if (immediateRight && immediateRight.start !== a.end) immediateRight.start = a.end;
		}
	} else {
		// mirror of resize-end, but toward the left
		const isLeftmost = activeIdx === 0;
		if (isLeftmost) return regions;

		const target = clamp(t, 0, duration);

		if (target >= active.end - MIN_WIDTH && layer !== 0) {
			const rightNeighbor = activeIdx < layerSorted.length - 1 ? layerSorted[activeIdx + 1] : null;
			updated = updated.filter((r) => r.id !== activeId);
			if (rightNeighbor) {
				const n = updated.find((r) => r.id === rightNeighbor.id);
				if (n) n.start = active.start;
			}
			return fullSync(cascadeDeleteGroups(updated), duration);
		}

		const clampedTarget = clamp(target, 0, active.end - MIN_WIDTH);
		const bubblesToLeft = layerSorted.slice(0, activeIdx).reverse();

		if (bubblesToLeft.length === 0) {
			updated.find((r) => r.id === activeId)!.start = clampedTarget;
		} else {
			let cursor = clampedTarget;
			const toDelete: string[] = [];

			for (const neighbor of bubblesToLeft) {
				if (cursor <= neighbor.start + MIN_WIDTH) {
					toDelete.push(neighbor.id);
					cursor = neighbor.start;
				} else if (cursor < neighbor.end) {
					updated.find((r) => r.id === neighbor.id)!.end = cursor;
					break;
				} else {
					break;
				}
			}

			updated = updated.filter((r) => !toDelete.includes(r.id));
            const a = updated.find((r) => r.id === activeId)!;
            a.start = cursor < clampedTarget ? cursor : clampedTarget;
            const newSorted = updated.filter((r) => r.layer === layer).sort((a, b) => a.start - b.start);
            const newActiveIdx = newSorted.findIndex((r) => r.id === activeId);
            const immediateLeft = newActiveIdx > 0 ? newSorted[newActiveIdx - 1] : null;
            if (immediateLeft && immediateLeft.end !== a.start) immediateLeft.end = a.start;
		}
	}

	updated = cascadeDeleteGroups(updated); // a squeeze-out may have stranded a group
    return fullSync(updated, duration);
}
```
