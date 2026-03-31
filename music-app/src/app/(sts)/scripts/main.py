# music-app/src/app/(sts)/scripts/main.py
import os
import sys
import tempfile
import argparse
import traceback
import subprocess
from concurrent.futures import ProcessPoolExecutor, as_completed

import yt_dlp
import pretty_midi
import librosa
import numpy as np

from basic_pitch.inference import predict
from basic_pitch import ICASSP_2022_MODEL_PATH

# ─────────────────────────────────────────────────────────────────────────────
# General MIDI program numbers for each stem
# ─────────────────────────────────────────────────────────────────────────────
STEM_CONFIG = {
    "vocals": (52,  False, "Vocals"),
    "bass":   (32,  False, "Bass"),
    "other":  (48,  False, "Other"),
    "drums":  ( 0,  True,  "Drums"),
}

DEMUCS_STEMS = ["vocals", "bass", "drums", "other"]


# ─────────────────────────────────────────────────────────────────────────────
# 1. Download
# ─────────────────────────────────────────────────────────────────────────────
def download_audio(url: str, output_dir: str) -> str:
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(output_dir, "audio.%(ext)s"),
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "192",
        }],
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    return os.path.join(output_dir, "audio.wav")


# ─────────────────────────────────────────────────────────────────────────────
# 2. Stem separation via Demucs
# ─────────────────────────────────────────────────────────────────────────────
def separate_stems(wav_path: str, output_dir: str) -> dict[str, str]:
    cmd = [
        sys.executable, "-m", "demucs",
        "-n", "htdemucs",       # 4-stem model — faster than htdemucs_6s
        "--device", "cpu",      # :(
        "--jobs", "4",           # parallelize on CPU since MPS isn't working for some reason
        "--out", output_dir,
        wav_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Demucs failed:\n{result.stderr}")

    stem_dir = os.path.join(output_dir, "htdemucs", "audio")
    stems = {}
    for stem in DEMUCS_STEMS:
        p = os.path.join(stem_dir, f"{stem}.wav")
        if os.path.exists(p):
            stems[stem] = p
        else:
            print(f"  [warn] stem not found: {p}", file=sys.stderr)

    return stems


# ─────────────────────────────────────────────────────────────────────────────
# 3. Beat tracking — run on the full mix for the most accurate grid
# ─────────────────────────────────────────────────────────────────────────────
def get_tempo_and_beats(wav_path: str) -> tuple[float, np.ndarray]:
    y, sr = librosa.load(wav_path, sr=None)
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)

    bpm = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
    while bpm < 60:
        bpm *= 2
    while bpm > 180:
        bpm /= 2

    return bpm, beat_times


# ─────────────────────────────────────────────────────────────────────────────
# 4. Build a 16th-note grid — extrapolates backwards so early notes aren't lost
# ─────────────────────────────────────────────────────────────────────────────
def build_grid(beat_times: np.ndarray, subdivisions: int = 4, pre_roll_seconds: float = 30.0) -> np.ndarray:
    # Use median of first 16 beats — more robust than mean against outliers
    avg_beat_interval = float(np.median(np.diff(beat_times[:16])))
    step = avg_beat_interval / subdivisions

    # Forward grid interpolated from real beat positions
    forward_points = []
    for i in range(len(beat_times) - 1):
        t0, t1 = beat_times[i], beat_times[i + 1]
        for sub in range(subdivisions):
            forward_points.append(t0 + (t1 - t0) * sub / subdivisions)
    forward_points.append(beat_times[-1])

    # Backward grid extrapolated from first beat — covers intros librosa missed
    backward_points = []
    t = beat_times[0] - step
    while t > -pre_roll_seconds:
        backward_points.append(t)
        t -= step

    all_points = sorted(set(backward_points + forward_points))
    return np.array(all_points)


def snap_to_grid(t: float, grid: np.ndarray) -> float:
    snapped = float(grid[int(np.argmin(np.abs(grid - t)))])
    return max(0.0, snapped)  # never return negative time


# ─────────────────────────────────────────────────────────────────────────────
# 5. Transcribe one stem → PrettyMIDI (Basic Pitch)
#    Runs as a worker so stems can be parallelized
# ─────────────────────────────────────────────────────────────────────────────
RMS_SILENCE_THRESHOLD = 0.01

def is_silent(wav_path: str) -> bool:
    y, _ = librosa.load(wav_path, sr=None)
    return float(np.sqrt(np.mean(y ** 2))) < RMS_SILENCE_THRESHOLD

def transcribe_stem_worker(args: tuple[str, str]):
    """Standalone function (not a method) so ProcessPoolExecutor can pickle it."""
    stem_name, wav_path = args
    if is_silent(wav_path):
        return stem_name, None
    _, midi_data, _ = predict(wav_path, ICASSP_2022_MODEL_PATH)
    return stem_name, midi_data


# ─────────────────────────────────────────────────────────────────────────────
# 6. Quantize + copy a single stem's notes into the output PrettyMIDI
# ─────────────────────────────────────────────────────────────────────────────
def add_stem_to_output(
    out_pm: pretty_midi.PrettyMIDI,
    source_midi: pretty_midi.PrettyMIDI,
    program: int,
    is_drum: bool,
    name: str,
    grid: np.ndarray,
    bpm: float,
    subdivisions: int,
    grid_offset_steps: int,
    first_snapped: float,
):
    step_sec = (60.0 / bpm) / subdivisions
    offset_sec = grid_offset_steps * step_sec

    out_inst = pretty_midi.Instrument(program=program, is_drum=is_drum, name=name)

    for src_inst in source_midi.instruments:
        for note in src_inst.notes:
            raw_start = snap_to_grid(note.start, grid) - first_snapped + offset_sec
            raw_end   = snap_to_grid(note.end,   grid) - first_snapped + offset_sec

            q_start = max(0.0, round(raw_start / step_sec) * step_sec)
            raw_dur = max(step_sec, raw_end - snap_to_grid(note.start, grid))
            q_dur   = max(step_sec, round(raw_dur / step_sec) * step_sec)

            out_inst.notes.append(pretty_midi.Note(
                velocity=note.velocity,
                pitch=note.pitch,
                start=q_start,
                end=q_start + q_dur,
            ))

    out_inst.notes.sort(key=lambda n: n.start)
    if out_inst.notes:
        out_pm.instruments.append(out_inst)


# ─────────────────────────────────────────────────────────────────────────────
# 7. Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="YouTube → multi-track quantized MIDI")
    parser.add_argument("url")
    parser.add_argument("--offset",       type=int, default=0,
                        help="Shift grid by N 16th-note steps")
    parser.add_argument("--subdivisions", type=int, default=4,
                        help="Grid resolution (4=16th, 3=triplet, 2=8th)")
    parser.add_argument("--stems", nargs="+", default=list(STEM_CONFIG.keys()),
                        choices=list(STEM_CONFIG.keys()),
                        help="Which stems to include (default: all)")
    args = parser.parse_args()

    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_dir = os.path.join(script_dir, "audio")
        os.makedirs(output_dir, exist_ok=True)

        with tempfile.TemporaryDirectory() as temp_dir:

            # ── 1. Download ──────────────────────────────────────────────────
            print("Downloading audio…", file=sys.stderr)
            wav_path = download_audio(args.url, temp_dir)

            # ── 2. Beat tracking on full mix ─────────────────────────────────
            print("Analysing tempo and beats…", file=sys.stderr)
            bpm, beat_times = get_tempo_and_beats(wav_path)
            print(f"  Detected BPM: {bpm:.1f}", file=sys.stderr)
            grid = build_grid(beat_times, args.subdivisions)

            # ── 3. Stem separation (MPS accelerated) ─────────────────────────
            print("Separating stems with Demucs…", file=sys.stderr)
            stems = separate_stems(wav_path, temp_dir)

            # ── 4. Transcribe all stems in parallel ──────────────────────────
            print("Transcribing stems (parallel)…", file=sys.stderr)
            stem_pairs = [
                (name, path) for name, path in stems.items()
                if name in args.stems
            ]

            stem_midis: dict[str, pretty_midi.PrettyMIDI] = {}
            all_first_notes = []

            with ProcessPoolExecutor(max_workers=min(len(stem_pairs), os.cpu_count())) as executor:
                futures = {
                    executor.submit(transcribe_stem_worker, pair): pair[0]
                    for pair in stem_pairs
                }
                for future in as_completed(futures):
                    stem_name, midi = future.result()
                    if midi is None:
                        print(f"  ({stem_name}: silent, skipped)", file=sys.stderr)
                        continue
                    stem_midis[stem_name] = midi
                    notes = [n for inst in midi.instruments for n in inst.notes]
                    if notes:
                        all_first_notes.append(min(n.start for n in notes))
                    print(f"  ✓ {stem_name}", file=sys.stderr)

            if not all_first_notes:
                raise RuntimeError("No notes detected in any stem.")

            # ── 5. Build output MIDI ─────────────────────────────────────────
            global_first  = min(all_first_notes)
            first_snapped = snap_to_grid(global_first, grid)
            out_pm        = pretty_midi.PrettyMIDI(initial_tempo=bpm)

            for stem_name, midi in stem_midis.items():
                program, is_drum, name = STEM_CONFIG[stem_name]
                add_stem_to_output(
                    out_pm, midi,
                    program=program,
                    is_drum=is_drum,
                    name=name,
                    grid=grid,
                    bpm=bpm,
                    subdivisions=args.subdivisions,
                    grid_offset_steps=args.offset,
                    first_snapped=first_snapped,
                )

            # ── 6. Write ─────────────────────────────────────────────────────
            final_path = os.path.join(output_dir, "transcription.mid")
            out_pm.write(final_path)
            print(f"SUCCESS:{final_path}")

    except Exception as e:
        print(f"ERROR:{str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()