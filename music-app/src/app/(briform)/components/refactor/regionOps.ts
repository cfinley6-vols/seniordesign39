// src/app/(briform)/components/refactor/regionOps.ts

export type Region = {
	id: string;
	start: number;
	end: number;
	label: string;
	layer: number;
	parentId?: string;
	color?: string;
};

export function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n));
}

export const MIN_WIDTH = 0.25;
export const ADJACENCY_TOLERANCE = 0.5;

// Syncronization

export const syncParents = (regions: Region[]): Region[] => {
	const sorted = [...regions].sort((a, b) => a.layer - b.layer);
	const map = new Map(sorted.map((r) => [r.id, { ...r }]));

	for (const r of sorted) {
		const children = [...map.values()].filter((c) => c.parentId === r.id);
		if (children.length === 0) continue;
		const updated = map.get(r.id)!;
		updated.start = Math.min(...children.map((c) => c.start));
		updated.end = Math.max(...children.map((c) => c.end));
		map.set(r.id, updated);
	}

	return [...map.values()];
};

export const cleanOrphanedParents = (regions: Region[]): Region[] => {
	return regions.filter((r) => {
		const childCount = regions.filter((c) => c.parentId === r.id).length;
		const isParent = regions.some((c) => c.parentId === r.id);
		return !isParent || childCount >= 2;
	});
};

export const syncRegions = (regions: Region[]): Region[] => {
	const cleaned = cleanOrphanedParents(regions);
	const validIds = new Set(cleaned.map((r) => r.id));
	const deOrphaned = cleaned.map((r) => 
		r.parentId && !validIds.has(r.parentId) ? { ...r, parentId: undefined } : r
	);
	return syncParents(deOrphaned);
};

export const clampBorders = (regions: Region[], duration: number): Region[] => {
	if (duration <= 0) return regions;
	const layer0 = regions.filter((r) => r.layer === 0);
	if (layer0.length === 0) return regions;
	const minStart = Math.min(...layer0.map((r) => r.start));
	const maxEnd = Math.max(...layer0.map((r) => r.end));
	return regions.map((r) => {
		if (r.layer !== 0) return r;
		const updated = { ...r };
		if (r.start === minStart) updated.start = 0;
		if (r.end === maxEnd) updated.end = duration;
		return updated;
	});
};

export const fullSync = (regions: Region[], duration: number): Region[] => {
	return syncRegions(clampBorders(regions, duration));
};

export const cascadeDeleteGroups = (regions: Region[]): Region[] => {
	let current = [...regions];
	let changed = true;

	while (changed) {
		changed = false;

		const underPopulated = current.filter((r) => {
			const isParent = current.some((c) => c.parentId === r.id);
			if (!isParent) return false;
			return current.filter((c) => c.parentId === r.id).length < 2;
		});

		if (underPopulated.length === 0) break;

		const getAncestorChain = (id: string): string[] => {
			const chain: string[] = [id];
			let r = current.find((x) => x.id === id);
			while (r?.parentId) {
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
					toDeleteIds.add(id);
				} else {
					break;
				}
			}
		}

		if (toDeleteIds.size === 0) break;

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

		changed = true;
	}

	return current;
};

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

	if (dragMode === "resize-end") {
		const isRightmost = activeIdx === layerSorted.length - 1;
		if (isRightmost) return regions;

		const target = clamp(t, 0, duration);

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
					toDelete.push(neighbor.id);
					cursor = neighbor.end;
				} else if (cursor > neighbor.start) {
					updated.find((r) => r.id === neighbor.id)!.start = cursor;
					break;
				} else {
					break;
				}
			}

			updated = updated.filter((r) => !toDelete.includes(r.id));
			const a = updated.find((r) => r.id === activeId)!;
			a.end = cursor > clampedTarget ? cursor : clampedTarget;
			const newSorted = updated.filter((r) => r.layer === layer).sort((a, b) => a.start - b.start);
			const newActiveIdx = newSorted.findIndex((r) => r.id === activeId);
			const immediateRight = newActiveIdx < newSorted.length - 1 ? newSorted[newActiveIdx + 1] : null;
			if (immediateRight && immediateRight.start !== a.end) immediateRight.start = a.end;
		}
	} else {
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

	updated = cascadeDeleteGroups(updated);
    return fullSync(updated, duration);
}
