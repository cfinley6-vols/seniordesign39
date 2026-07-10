// src/app/(briform)/components/ui/PlayheadHandle.tsx

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
