## History Refactor

Created `lib/useHistory.ts` to handle the undo/redo functionality and all functionality related to storing history

Functionality includes `historyRef`, `redoRef`, `MAX_HISTORY`, `pushHistory`, `setRegionsWithHistory`, `handleUndo`, `handleRedo`, and the `canUndo`/`canRedo` flags were pulled out of `BriformCanvas.tsx` into a standalone hook, `lib/useHistory.ts`.

```ts
import { useCallback, useRef, useState } from "react";
import type { Region } from "./regionOps";

const MAX_HISTORY = 50;

export function useHistory(setRegions: React.Dispatch<React.SetStateAction<Region[]>>) {
	const historyRef = useRef<Region[][]>([]);
	const redoRef = useRef<Region[][]>([]);

	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);

	const pushHistory = useCallback((snapshot: Region[]) => {
		historyRef.current = [
			...historyRef.current.slice(-MAX_HISTORY + 1),
			snapshot.map((r) => ({ ...r })),
		];
		redoRef.current = [];
		setCanUndo(true);
		setCanRedo(false);
	}, []);

	const setRegionsWithHistory = useCallback(
		(current: Region[], updater: (prev: Region[]) => Region[]) => {
			pushHistory(current);
			setRegions((prev) => updater(prev));
		},
		[pushHistory, setRegions]
	);

	const handleUndo = useCallback(() => {
		if (historyRef.current.length === 0) return;
		const prev = historyRef.current[historyRef.current.length - 1];
		historyRef.current = historyRef.current.slice(0, -1);

		setRegions((current) => {
			redoRef.current = [...redoRef.current.slice(-MAX_HISTORY + 1), current.map((r) => ({ ...r }))];
			return prev;
		});
		setCanUndo(historyRef.current.length > 0);
		setCanRedo(true);
	}, [setRegions]);

	const handleRedo = useCallback(() => {
		if (redoRef.current.length === 0) return;
		const next = redoRef.current[redoRef.current.length - 1];
		redoRef.current = redoRef.current.slice(0, -1);

		setRegions((current) => {
			historyRef.current = [...historyRef.current.slice(-MAX_HISTORY + 1), current.map((r) => ({ ...r }))];
			return next;
		});
		setCanUndo(true);
		setCanRedo(redoRef.current.length > 0);
	}, [setRegions]);

	return { pushHistory, setRegionsWithHistory, handleUndo, handleRedo, canUndo, canRedo };
}
```

**How it works:**

- Two stacks live in refs (`historyRef`, `redoRef`), each capped at `MAX_HISTORY` (50) entries to avoid unbounded growth over a long editing session.
- `pushHistory(snapshot)` — called before any mutating edit — deep-copies the current regions onto the undo stack and clears the redo stack (a fresh edit invalidates any previously "undone" future).
- `setRegionsWithHistory(current, updater)` — convenience wrapper that pushes history and then applies the update in one call; this is what all the action handlers (`handleSplit`, `handleMerge`, `handleGroup`, `handleDelete`, `handleColorChange`) use instead of calling `setRegions` directly.
- `handleUndo` / `handleRedo` — pop from one stack, push the current state onto the other, and swap in the popped snapshot.

**Behavior change worth flagging:** in the original code, `canUndo`/`canRedo` were computed inline in the render body as `historyRef.current.length > 0`. Since refs don't trigger re-renders on their own, those booleans only ever appeared current because some other state change (a region edit, a selection change) happened to cause a re-render around the same time — the disabled state on the Undo/Redo buttons was technically stale between those incidental re-renders. `useHistory` now tracks `canUndo`/`canRedo` as real `useState`, updated explicitly alongside every stack mutation, so the buttons' disabled state is always accurate rather than piggybacking on unrelated re-renders.
