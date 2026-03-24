// music-app/src/app/api/convert/route.js
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { promises as fs } from 'fs';

// This lets us use standard async/await with Node's exec function
const execPromise = util.promisify(exec);

export async function POST(request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return new Response(JSON.stringify({ error: "No URL provided" }), { status: 400 });
    }

    // 1. Define the exact paths to your Python environment and script
    // NOTE: If you deploy this, you will need to update these paths to match your server!
    const projectRoot = process.cwd(); 
    const pythonExecutable = path.join(projectRoot, 'venv', 'bin', 'python'); 
    const scriptPath = path.join(projectRoot, 'src', 'app', '(sts)', 'scripts', 'main.py');

    console.log(`Starting conversion for: ${url}`);

    // 2. Run the command in the background
    // This literally types: `/path/to/venv/bin/python /path/to/main.py "https://youtube.com/..."`
    const { stdout, stderr } = await execPromise(`"${pythonExecutable}" "${scriptPath}" "${url}"`);

    // 3. Check what the Python script printed out
    if (stdout.includes("SUCCESS:")) {
      
      // Extract the file path we printed in Python
      const filePath = stdout.split("SUCCESS:")[1].trim();
      
      // Read the literal .mid file from the hard drive into memory
      const fileBuffer = await fs.readFile(filePath);

      // 4. Send the file back to the browser
      return new Response(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'audio/midi',
          'Content-Disposition': 'attachment; filename="transcription.mid"',
        },
      });

    } else {
      console.error("Python Output Error:", stderr);
      return new Response(JSON.stringify({ error: "Conversion failed on the backend." }), { status: 500 });
    }

  } catch (error) {
    console.error("Node.js Execution Error:", error);
    return new Response(JSON.stringify({ error: "Failed to run the Python script." }), { status: 500 });
  }
}