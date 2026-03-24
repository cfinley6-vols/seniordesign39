# music-app/src/app/(sts)/scripts/main.py
# music-app/src/app/(sts)/scripts/main.py
import os
import sys
import tempfile
import shutil
import argparse
import yt_dlp
import traceback
from basic_pitch.inference import predict_and_save
from basic_pitch import ICASSP_2022_MODEL_PATH

def download_audio(url: str, output_dir: str) -> str:
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(output_dir, 'audio.%(ext)s'),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
        'quiet': True, # Keeps the terminal clean so Next.js doesn't get confused
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    return os.path.join(output_dir, 'audio.wav')

def main():
    # 1. Set up the terminal command arguments
    parser = argparse.ArgumentParser(description="Convert YouTube audio to MIDI.")
    parser.add_argument("url", help="The YouTube URL to convert")
    args = parser.parse_args()

    try:
        # We'll save the final output in a dedicated 'outputs' folder next to this script
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_dir = os.path.join(script_dir, "audio")
        os.makedirs(output_dir, exist_ok=True)
        
        # Create a secure temporary directory for the downloading/processing phase
        with tempfile.TemporaryDirectory() as temp_dir:
            
            # Download
            wav_path = download_audio(args.url, temp_dir)
            
            # Transcribe
            predict_and_save(
                audio_path_list=[wav_path],
                output_directory=temp_dir,
                save_midi=True,
                sonify_midi=False,
                save_model_outputs=False,
                save_notes=False,
                model_or_model_path=ICASSP_2022_MODEL_PATH
            )
            
            generated_midi = os.path.join(temp_dir, 'audio_basic_pitch.mid')
            
            if not os.path.exists(generated_midi):
                raise Exception("MIDI generation failed inside basic_pitch.")
            
            # Move the finished file from the temp folder to our permanent outputs folder
            final_path = os.path.join(output_dir, "transcription.mid")
            
            if os.path.exists(final_path):
                os.remove(final_path) # Overwrite the old one if it exists
                
            shutil.move(generated_midi, final_path)
            
            # 2. THE MOST IMPORTANT PART: Print the exact path for Next.js to read
            print(f"SUCCESS:{final_path}")
            
    except Exception as e:
        # If it crashes, print ERROR so Next.js knows to tell the user
        print(f"ERROR:{str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
        
# uvicorn main:app --reload