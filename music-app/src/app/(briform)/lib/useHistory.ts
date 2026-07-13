// src/app/(briform)/lib/useHistory.ts

import { useCallback, useRef, useState } from "react";
import type { Region } from "./regionOps";

// stack depth cap so a long editing session doesn't grow this unbounded
const MAX_HISTORY = 50;

export function useHistory(setRegions: React.Dispatch<React.SetStateAction<Region[]>>) {
	// stacks live in refs, not state - we don't want a re-render every time we push/pop history
	const historyRef = useRef<Region[][]>([]);
	const redoRef = useRef<Region[][]>([]);

	// we only want to trigger a re-render when canUndo/canRedo flip
	// these are real state, since they drive disabled= on the undo/redo buttons and
	// need to trigger a re-render when they change
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);

	const pushHistory = useCallback((snapshot: Region[]) => {
		historyRef.current = [
			...historyRef.current.slice(-MAX_HISTORY + 1), // drop oldest once over the cap
			snapshot.map((r) => ({ ...r })), // deep-copy so future mutations don't leak into this snapshot
		];
		redoRef.current = []; // a fresh edit invalidates any previously undone future
		setCanUndo(true);
		setCanRedo(false);
	}, []);

	// convenience wrapper used by every action handler - snapshot the pre-edit state, then apply the edit, in one call
	const setRegionsWithHistory = useCallback(
		(current: Region[], updater: (prev: Region[]) => Region[]) => {
			pushHistory(current);
			setRegions((prev) => updater(prev));
		},
		[pushHistory, setRegions]
	);

	const handleUndo = useCallback(() => {
		if (historyRef.current.length === 0) return; // nothing to undo
		const prev = historyRef.current[historyRef.current.length - 1];
		historyRef.current = historyRef.current.slice(0, -1); // pop

		setRegions((current) => {
			// push what we're leaving onto redo, so it can be restored later
			redoRef.current = [...redoRef.current.slice(-MAX_HISTORY + 1), current.map((r) => ({ ...r }))];
			return prev; // restore the popped snapshot
		});
		setCanUndo(historyRef.current.length > 0);
		setCanRedo(true);
	}, [setRegions]);

	const handleRedo = useCallback(() => {
		if (redoRef.current.length === 0) return; // nothing to redo
		const next = redoRef.current[redoRef.current.length - 1];
		redoRef.current = redoRef.current.slice(0, -1); // pop

		setRegions((current) => {
			// push what we're leaving back onto undo, so redo can be undone again
			historyRef.current = [...historyRef.current.slice(-MAX_HISTORY + 1), current.map((r) => ({ ...r }))];
			return next; // restore the popped snapshot
		});
		setCanUndo(true);
		setCanRedo(redoRef.current.length > 0);
	}, [setRegions]);

	return { pushHistory, setRegionsWithHistory, handleUndo, handleRedo, canUndo, canRedo };
}
