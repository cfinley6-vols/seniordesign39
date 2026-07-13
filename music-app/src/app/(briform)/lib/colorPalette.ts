// src/app/(briform)/components/ui/colorPalette.ts

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
