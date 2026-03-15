import os
import tempfile
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import yt_dlp
from basic_pitch.inference import predict_and_save

app = FastAPI()

# Allow Next.js to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Your Next.js URL
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
@app.post("/api/convert")
def convert_to_midi(request: YouTubeRequest):
    try:
        temp_dir = tempfile.mkdtemp()
        
        # 1. Download
        wav_path = download_audio(request.url, temp_dir)
        
        # 2. Transcribe
        predict_and_save(
            audio_path_list=[wav_path],
            output_directory=temp_dir,
            save_midi=True,
            sonify_midi=False,
            save_model_outputs=False,
            save_notes=False
        )
        
        # Basic pitch names the output like this:
        generated_midi = os.path.join(temp_dir, 'audio_basic_pitch.mid')
        
        if not os.path.exists(generated_midi):
            raise HTTPException(status_code=500, detail="MIDI generation failed.")
            
        return FileResponse(
            path=generated_midi, 
            media_type='audio/midi', 
            filename="transcription.mid"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
# uvicorn main:app --reload