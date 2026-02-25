import math

def quantize(value, grid):
    return round(value / grid) * grid


def detect_grid(notes, tempo, subdivision=4):
    """
    subdivision=4 → 16th notes
    subdivision=2 → 8th notes
    subdivision=1 → quarter notes
    """
    beat = 60 / tempo
    return beat / subdivision


def remove_tiny_notes(notes, grid):
    """Remove notes too short to be musically meaningful"""
    min_duration = grid * 0.6
    return [n for n in notes if (n.end - n.start) >= min_duration]


def quantize_notes(notes, grid):
    """Snap notes to rhythmic grid"""
    for n in notes:
        n.start = quantize(n.start, grid)
        n.end   = quantize(n.end, grid)
        if n.end <= n.start:
            n.end = n.start + grid * 0.5
    return notes


def should_merge(a, b, grid):
    """
    Decide if two notes should be merged.
    Much smarter than simple gap check.
    """

    if a.pitch != b.pitch:
        return False

    gap = b.start - a.end
    overlap = b.start <= a.end

    velocity_close = abs(a.velocity - b.velocity) < 15

    # would merging produce cleaner rhythm?
    merged_duration = b.end - a.start
    units = merged_duration / grid
    rhythmic = abs(units - round(units)) < 0.18

    return (gap < grid * 0.25 or overlap) and velocity_close and rhythmic


def merge_fragments(notes, grid):
    """Merge notes only when musically justified"""

    if not notes:
        return notes

    notes = sorted(notes, key=lambda n: (n.pitch, n.start))
    merged = [notes[0]]

    for note in notes[1:]:
        last = merged[-1]

        if should_merge(last, note, grid):
            last.end = max(last.end, note.end)
            last.velocity = max(last.velocity, note.velocity)
        else:
            merged.append(note)

    return merged


def smooth_velocities(notes):
    """Smooth velocity spikes"""
    if len(notes) < 3:
        return notes

    for i in range(1, len(notes)-1):
        avg = (notes[i-1].velocity + notes[i+1].velocity)/2
        notes[i].velocity = int((notes[i].velocity + avg)/2)

    return notes


def clean_notes(notes, tempo, subdivision=4):
    """
    Main entry point.
    Call this from your pipeline.
    """

    grid = detect_grid(notes, tempo, subdivision)
    print(grid)
    grid = grid[0]

    notes = remove_tiny_notes(notes, grid)
    notes = quantize_notes(notes, grid)
    # notes = merge_fragments(notes, grid)
    notes = smooth_velocities(notes)

    return sorted(notes, key=lambda n: n.start)