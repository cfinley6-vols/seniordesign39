## UI Refactor

### New File Structure

For this part of the refactor, we have adjusted the file organization to the following:

```
./components
├── BriformCanvas.tsx
├── BriformNavbar.tsx
├── PlaybackTimeline.tsx
├── ProjectWorkspace.tsx
├── YouTubeEmbedWithSearch.tsx
├── lib
│   └── regionOps.ts
└── ui
    ├── PlayheadHandle.tsx
    └── colorPalette.ts
```

### A Look At `colorPalette.ts` and `PlayheadHandle.tsx`

This functionality is fairly simple, but worth moving outside of `BriformCanvas.tsx` for the sake of organization, keeping in mind, the whole purpose of this refactor is to get this code back to being organized and readable

`/src/app/(briform)/components/ui/colorPalette.ts`
```ts
// Preset palette — name + base hex + selected (darker) hex + border hex
export const COLOR_PALETTE: { name: string; base: string; selected: string; border: string }[] = [
    { name: "Blue",   base: "#3b82f6", selected: "#2563eb", border: "#93c5fd" },
    { name: "Purple", base: "#a855f7", selected: "#9333ea", border: "#d8b4fe" },
    { name: "Green",  base: "#22c55e", selected: "#16a34a", border: "#86efac" },
    { name: "Red",    base: "#ef4444", selected: "#dc2626", border: "#fca5a5" },
    { name: "Orange", base: "#f97316", selected: "#ea580c", border: "#fdba74" },
    { name: "Yellow", base: "#eab308", selected: "#ca8a04", border: "#fde047" },
    { name: "Pink",   base: "#ec4899", selected: "#db2777", border: "#f9a8d4" },
    { name: "Teal",   base: "#14b8a6", selected: "#0d9488", border: "#5eead4" },
];
```

`src/app/(briform)/components/ui/PlayheadHandle.tsx`
```tsx
// SVG dimensions — keep in sync with usage in BriformCanvas
export const PLAYHEAD_SVG_W = 12;
export const PLAYHEAD_SVG_H = 26;
// The triangle point (tip) is at y=25 in a 26-tall SVG, i.e. 1px from the bottom.
// We want the tip to sit exactly on top of the red line at the top of the timeline.
// PLAYHEAD_OFFSET_Y: how many px above the timeline top edge the handle sits.
// tip_y_in_svg = 25, so the tip is (SVG_H - 25) = 1px from the SVG bottom.
// We want the SVG bottom - 1px to be flush with the timeline top, so offset = SVG_H - 1.
const PLAYHEAD_TIP_FROM_BOTTOM = PLAYHEAD_SVG_H - 25; // 1px
export const PLAYHEAD_OFFSET_Y = PLAYHEAD_SVG_H - PLAYHEAD_TIP_FROM_BOTTOM; // = 25px above timeline top

export function PlayheadHandle({ dragging }: { dragging: boolean }) {
    return (
        <svg
            width={PLAYHEAD_SVG_W}
            height={PLAYHEAD_SVG_H}
            viewBox={`0 0 ${PLAYHEAD_SVG_W} ${PLAYHEAD_SVG_H}`}
            style={{ display: "block", filter: dragging ? "brightness(0.8)" : "none" }}
        >
            <rect x="1" y="1" width="10" height="16" rx="2" ry="2" fill="#ef4444" stroke="#fca5a5" strokeWidth="0.75" />
            {[3.5, 7.5].map((cx) =>
                [4, 8, 12].map((cy) => (
                    <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.2" fill="#b91c1c" opacity="0.75" />
                ))
            )}
            {[3.5, 7.5].map((cx) =>
                [4, 8, 12].map((cy) => (
                    <circle key={`hl-${cx}-${cy}`} cx={cx - 0.4} cy={cy - 0.4} r="0.5" fill="#fca5a5" opacity="0.55" />
                ))
            )}
            <polygon points="1,17 11,17 6,25" fill="#ef4444" stroke="#fca5a5" strokeWidth="0.5" strokeLinejoin="round" />
        </svg>
    );
}
```
