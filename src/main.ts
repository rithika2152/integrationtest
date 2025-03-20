import {
    bootstrapCameraKit,
    CameraKitSession,
    createMediaStreamSource,
    Transform2D,
} from '@snap/camera-kit';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';


const liveRenderTarget = document.getElementById('canvas') as HTMLCanvasElement;
const flipButton = document.getElementById('flip-button') as HTMLButtonElement;
const recordButton = document.getElementById('record-button') as HTMLButtonElement;
const progressRing = document.getElementById('progress-ring') as HTMLDivElement;
const progressPath = document.getElementById('progress-path');
const previewModal = document.getElementById('preview-modal') as HTMLDivElement;
const previewVideo = document.getElementById('preview-video') as HTMLVideoElement;
const shareButton = document.getElementById('share-button') as HTMLButtonElement;
const saveButton = document.getElementById('save-button') as HTMLButtonElement;
const closeModalButton = document.getElementById('close-modal-button') as HTMLButtonElement;


let isBackFacing = true;
let mediaStream: MediaStream;
let isFlipping = false;
let currentRotation = 0; // Track the current rotation
let session: CameraKitSession;
//let mediaRecorder: MediaRecorder | null = null; // No longer needed
let downloadUrl: string | null = null;
let recordingStartTime: number | null = null;
const RECORD_DURATION = 60;

// FFmpeg-related variables
let ffmpeg: FFmpeg | null = null;
let isFFmpegLoaded = false;
const ffmpegCoreUrl = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js';


async function init() {
    const cameraKit = await bootstrapCameraKit({
        apiToken: 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzM0NjkzMzE0LCJzdWIiOiIzMmZhMmZlNC0wYmYxLTQ2N2QtODM4Mi04MTVmNzliMjFkMWJ-U1RBR0lOR35iMWI3YmFjZi01ZGI3LTQxMDAtOWIzNC0zZDEwODJmNmMyYTAifQ.681nZeSjvWHzWBiZbHY-T3Yq6M6qk3j9zgk9nM6I06M'
    });
    const devicePixelRatio = window.devicePixelRatio || 1;
    const desiredAspectRatio = 9 / 16; // Example 9:16 ratio (e.g., portrait)

    // Calculate the best fit canvas dimensions based on screen and aspect ratio
    let canvasWidth: number;
    let canvasHeight: number;

    if (window.innerWidth / window.innerHeight > desiredAspectRatio) {
        // If the screen is wider than the desired aspect ratio, set height to match screen
        canvasWidth = window.innerWidth;
        canvasHeight = window.innerWidth / desiredAspectRatio;
    } else {
        //If the screen is taller than the desired aspect ratio, set width to match screen
        canvasHeight = window.innerHeight;
        canvasWidth = window.innerHeight * desiredAspectRatio;
    }

    liveRenderTarget.width = canvasWidth * devicePixelRatio;
    liveRenderTarget.height = canvasHeight * devicePixelRatio;
    liveRenderTarget.style.width = `${canvasWidth}px`;
    liveRenderTarget.style.height = `${canvasHeight}px`;
    liveRenderTarget.style.position = 'fixed';
    liveRenderTarget.style.left = '50%';
    liveRenderTarget.style.top = '50%';
    liveRenderTarget.style.transform = 'translate(-50%, -50%)';


    session = await cameraKit.createSession({ liveRenderTarget });

    mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: isBackFacing ? 'environment' : 'user',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        },
    });

  const source = createMediaStreamSource(mediaStream);

  await session.setSource(source);
    if (!isBackFacing) {
        source.setTransform(Transform2D.MirrorX);
    }

  await session.play();

    const lens = await cameraKit.lensRepository.loadLens(
        "fb6410ff-f10b-438a-a8b0-70cc6012b2b6",
        "11cbcba2-1275-47ec-9916-feaa6c52d24b"
    );
    await session.applyLens(lens);
    bindFlipCamera(session);
    bindRecorder();
    bindModal()
    await loadFFmpeg(); // Load FFmpeg on initialization
}


function bindFlipCamera(session: CameraKitSession) {
    flipButton.style.cursor = 'pointer';

    flipButton.addEventListener('click', () => {
        if (!isFlipping) {
            flipButton.classList.add('animate-flip');
            updateCamera(session);
        }
    });

    updateCamera(session);
}

async function updateCamera(session: CameraKitSession) {
    isFlipping = true;
    flipButton.disabled = true;
  isBackFacing = !isBackFacing;

  if (mediaStream) {
      session.pause();
      mediaStream.getVideoTracks()[0].stop();
  }

    mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: isBackFacing ? 'environment' : 'user',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        },
    });


  const source = createMediaStreamSource(mediaStream);

  await session.setSource(source);

    if (!isBackFacing) {
        source.setTransform(Transform2D.MirrorX);
    }

  session.play();

      currentRotation += 180; // Update current rotation
      flipButton.style.setProperty('--current-rotation', `${currentRotation}deg`);
  setTimeout(() => {
    isFlipping = false;
    flipButton.disabled = false;
      flipButton.classList.remove('animate-flip');
  }, 500)
}

function bindRecorder() {
    recordButton.addEventListener('click', async () => {
        if (recordButton.classList.contains('recording')) {
            await stopRecording(); // Await stopRecording
        } else {
            await startRecording(); // Await startRecording
        }
    });
}

async function loadFFmpeg() {
   try {
    ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      console.log(message); // Log FFmpeg messages
    });
     await ffmpeg.load({
            coreURL: await toBlobURL(ffmpegCoreUrl, 'text/javascript'),
        });
    isFFmpegLoaded = true;
    console.log("FFmpeg loaded successfully");
  } catch (error) {
    console.error("Failed to load FFmpeg:", error);
    alert("Failed to load FFmpeg: " + error); // Notify the user
    isFFmpegLoaded = false;
  }
}



// Modify startRecording to capture frames and use FFmpeg
let intervalId: number | null = null;
const frameRate = 30; // Target frame rate
const frameInterval = 1000 / frameRate;
const frames: Uint8Array[] = [];

async function startRecording() {
    if (!isFFmpegLoaded) {
        alert("FFmpeg is not loaded yet. Please wait.");
        return;
    }

    recordButton.classList.add('recording');
    progressRing.style.display = 'block';
    frames.length = 0; // Clear previous frames
    recordingStartTime = Date.now();
     intervalId = window.setInterval(() => {
       captureFrame();
    }, frameInterval);
    updateProgress(); // Start updating the progress
}
function captureFrame() {
     if (!recordingStartTime) return;

    const ctx = liveRenderTarget.getContext('2d');
    if (!ctx) {
        console.error("Could not get 2D context from canvas");
        return;
    }

    // Draw the current canvas state to an offscreen canvas
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = liveRenderTarget.width;
    offscreenCanvas.height = liveRenderTarget.height;
    const offscreenCtx = offscreenCanvas.getContext('2d');
    if (!offscreenCtx) {
      console.error("Could not create offscreen context");
      return;
    }
    offscreenCtx.drawImage(liveRenderTarget, 0, 0);

    // Get the pixel data from the offscreen canvas
    const imageData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    // Convert ImageData to Uint8Array and store it
      frames.push(new Uint8Array(imageData.data.buffer));

}

async function stopRecording() {
  recordButton.classList.remove('recording');
    progressRing.style.display = 'none';
    if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
    recordingStartTime = null;
    if (progressPath instanceof SVGPathElement) {
        progressPath.style.strokeDashoffset = String(188);
    }

    if (frames.length > 0 && ffmpeg) {
         try {
           await encodeVideoWithFFmpeg(); // Encode using FFmpeg
         } catch (error)
         {
            console.error("FFmpeg encoding failed: ", error);
            alert("FFmpeg encoding failed: " + error);
         }

    } else {
        console.warn("No frames to encode or FFmpeg not loaded.");
         alert("No frames to encode or FFmpeg not loaded.");
    }

    frames.length = 0; // Reset frames after processing

}


async function encodeVideoWithFFmpeg() {
     if (!ffmpeg) {
        console.error("FFmpeg instance is null.");
        return;
    }
    const fileName = 'input.data';
    const outputFileName = 'output.mp4';
    const canvasWidth = liveRenderTarget.width;
    const canvasHeight = liveRenderTarget.height;
    // Combine all frames into a single Uint8Array.
    const totalLength = frames.reduce((acc, frame) => acc + frame.length, 0);
    const combinedFrames = new Uint8Array(totalLength);
    let offset = 0;
    for (const frame of frames) {
      combinedFrames.set(frame, offset);
       offset += frame.length;
    }

      //Write the combined frames data.
     await ffmpeg.writeFile(fileName, combinedFrames);

    // FFmpeg command
    // -f rawvideo: Specifies input format is raw video.
    // -pix_fmt rgba: Specifies input pixel format is RGBA.
    // -s ${canvasWidth}x${canvasHeight}: Sets input resolution.
    // -r ${frameRate}: Sets input frame rate.
    // -i ${fileName}: Specifies the input file (our raw frame data).
    // -c:v libx264: Encodes the video using the H.264 codec (libx264).
    // -pix_fmt yuv420p: Sets output pixel format to YUV420P (very common for H.264).  This is important for compatibility.
    // -preset veryfast:  Sets encoding speed/quality tradeoff.  "veryfast" gives good speed.  You can try others like "ultrafast", "superfast", "fast", "medium", "slow", "slower", "veryslow".
    // -crf 23: Sets the Constant Rate Factor (CRF).  Lower values = higher quality, larger files.  Higher values = lower quality, smaller files.  23 is a good default.  Range is 0-51.
    // -an: Disables audio (since we don't have audio in this case).
    // ${outputFileName}: Specifies the output file name.

     try {
         await ffmpeg.exec([
        '-f', 'rawvideo',
        '-pix_fmt', 'rgba',
        '-s', `${canvasWidth}x${canvasHeight}`,
        '-r', `${frameRate}`,
        '-i', fileName,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'veryfast',
        '-crf', '23',
        '-an',
        outputFileName
    ]);

    } catch (error)
     {
         console.log(error);
    }


    const data = await ffmpeg.readFile(outputFileName);
    const blob = new Blob([data], { type: 'video/mp4' });
    downloadUrl = URL.createObjectURL(blob);

    // Update preview
    previewVideo.src = downloadUrl;
    previewModal.style.display = 'flex';
    previewModal.classList.add('show');
    await ffmpeg.deleteFile(fileName);
    await ffmpeg.deleteFile(outputFileName);

}

function updateProgress() {
  if (!recordingStartTime) {
    return;
  }
  const elapsedTime = Date.now() - recordingStartTime;
  const progressPercentage = Math.min(100, (elapsedTime / 1000 / RECORD_DURATION) * 100);
  const circumference = 2 * Math.PI * 30;
  const dashOffset = circumference * (1 - progressPercentage / 100);

    if(progressPath instanceof SVGPathElement)
    {
       progressPath.style.strokeDashoffset = String(dashOffset);
    }

  if (elapsedTime / 1000 >= RECORD_DURATION) {
      stopRecording(); // Trigger stopRecording when time limit is reached
  } else {
    // Continue updating progress if recording is still ongoing
       if (recordButton.classList.contains('recording')) {
           requestAnimationFrame(updateProgress);
       }

  }
}
function bindModal() {
    closeModalButton.addEventListener('click', () => {
        previewModal.style.display = 'none';
        previewModal.classList.remove('show');
        previewVideo.pause();
        previewVideo.currentTime = 0;
        if (downloadUrl) {
          URL.revokeObjectURL(downloadUrl); //Clean the download URL
          downloadUrl = null;
        }
    });

    shareButton.addEventListener('click', async () => {
        if (downloadUrl) {
            try {
                const response = await fetch(downloadUrl);
                if (!response.ok) {
                  throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
                }
                const blob = await response.blob();

                // Explicitly create a Blob with the correct MIME type.
                const videoBlob = new Blob([blob], { type: 'video/mp4' });

                // Create a File object with the correct name and type.
                const videoFile = new File([videoBlob], 'video.mp4', { type: 'video/mp4' });

                //Check for share and then share it.
                if (navigator.canShare && navigator.canShare({ files: [videoFile] })) {
                    await navigator.share({
                        files: [videoFile],
                        title: 'Camera Kit Recording', // Optional: Add a title
                    });
                } else {
                    console.error('Sharing not supported or file is incompatible.');
                     alert('Sharing not supported in this browser or the file type is incompatible.');
                }
            } catch (error) {
                console.error('Error sharing video:', error);
                alert(`Error sharing video: ${error}`);
            }
        }
    });

    saveButton.addEventListener('click', () => {
        if (downloadUrl) {
            const link = document.createElement('a');
            link.setAttribute('style', 'display: none');
            link.href = downloadUrl;
            link.download = 'camera-kit-web-recording.mp4';
            link.click();
            link.remove();
        }
    });
}

init();