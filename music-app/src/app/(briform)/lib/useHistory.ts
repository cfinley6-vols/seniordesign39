// src/app/(briform)/components/lib/useHistory.ts

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
