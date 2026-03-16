import os
import tempfile
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import yt_dlp
from basic_pitch.inference import predict_and_save
from basic_pitch import ICASSP_2022_MODEL_PATH
import traceback

app = FastAPI()

# Allow Next.js to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class YouTubeRequest(BaseModel):
    url: str

def download_audio(url: str, output_dir: str) -> str:
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(output_dir, 'audio.%(ext)s'),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
        'quiet': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    return os.path.join(output_dir, 'audio.wav')

# Note: Using 'def' instead of 'async def' so FastAPI runs this in a threadpool, 
# preventing the heavy ML task from blocking the server.
# Currently does not function as designed
@app.post("/api/convert")
def convert_to_midi(request: YouTubeRequest):
    try:
        temp_dir = "./audio"
        
        # Download
        wav_path = download_audio(request.url, temp_dir)
        
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
        
        # Basic pitch names the output like this:
        generated_midi = os.path.join(temp_dir, 'audio_basic_pitch.mid')
        
        if not os.path.exists(generated_midi):
            raise Exception("MIDI generation failed.")
            
        return FileResponse(
            path=generated_midi, 
            media_type='audio/midi', 
            filename="transcription.mid"
        )
        
    except Exception as e:
        print("\n" + "="*50)
        print("PYTHON CRASH LOG")
        traceback.print_exc() 
        print("="*50 + "\n")
        raise HTTPException(status_code=500, detail=str(e))
    
# uvicorn main:app --reload