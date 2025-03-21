import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import { Transform2D, bootstrapCameraKit, createMediaStreamSource, } from '@snap/camera-kit';
const liveRenderTarget = document.getElementById('canvas');
const flipButton = document.getElementById('flip-button');
const recordButton = document.getElementById('record-button');
const progressRing = document.getElementById('progress-ring');
const progressPath = document.getElementById('progress-path');
const previewModal = document.getElementById('preview-modal');
const previewVideo = document.getElementById('preview-video');
const shareButton = document.getElementById('share-button');
const saveButton = document.getElementById('save-button');
const closeModalButton = document.getElementById('close-modal-button');
let isBackFacing = true;
let mediaStream;
let isFlipping = false;
let currentRotation = 0;
let session;
let mediaRecorder = null;
let downloadUrl = null;
let recordingStartTime = null;
const RECORD_DURATION = 60;
// Later in your FFmpeg processing logic
const data = ffmpeg.FS('readFile', 'output.mp4');
mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
if (!mp4Blob) {
    throw new Error("Failed to create MP4 Blob");
}

// FFmpeg.wasm setup
const ffmpeg = createFFmpeg({ log: true });
let ffmpegLoaded = false;
async function loadFFmpeg() {
    if (ffmpegLoaded)
        return;
    try {
        await ffmpeg.load();
        ffmpegLoaded = true;
        console.log('FFmpeg.wasm loaded!');
    }
    catch (error) {
        console.error('Error loading FFmpeg.wasm:', error);
        alert('Failed to load FFmpeg.wasm. Conversion will not work.');
    }
}
async function init() {
    const cameraKit = await bootstrapCameraKit({
        apiToken: 'YOUR_API_TOKEN' //Replace with your API TOKEN
    });
    const devicePixelRatio = window.devicePixelRatio || 1;
    const desiredAspectRatio = 9 / 16;
    let canvasWidth;
    let canvasHeight;
    if (window.innerWidth / window.innerHeight > desiredAspectRatio) {
        canvasWidth = window.innerWidth;
        canvasHeight = window.innerWidth / desiredAspectRatio;
    }
    else {
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
    try {
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
        const lens = await cameraKit.lensRepository.loadLens("fb6410ff-f10b-438a-a8b0-70cc6012b2b6", "11cbcba2-1275-47ec-9916-feaa6c52d24b");
        await session.applyLens(lens);
        await loadFFmpeg();
        bindFlipCamera(session);
        bindRecorder();
        bindModal();
    }
    catch (error) {
        console.error("Error initializing CameraKit:", error);
        alert("Failed to initialize CameraKit. Check console for details.");
    }
}
function bindFlipCamera(session) {
    flipButton.style.cursor = 'pointer';
    flipButton.addEventListener('click', () => {
        if (!isFlipping) {
            flipButton.classList.add('animate-flip');
            updateCamera(session);
        }
    });
    updateCamera(session);
}
async function updateCamera(session) {
    if (isFlipping)
        return; // Prevent multiple flips at once
    isFlipping = true;
    flipButton.disabled = true;
    try {
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
        await session.play();
        currentRotation += 180;
        flipButton.style.setProperty('--current-rotation', `${currentRotation}deg`);
    }
    catch (error) {
        console.error("Error updating camera:", error);
        alert("Failed to update camera. Check console for details.");
    }
    finally {
        setTimeout(() => {
            isFlipping = false;
            flipButton.disabled = false;
            flipButton.classList.remove('animate-flip');
        }, 500);
    }
}
function bindRecorder() {
    recordButton.addEventListener('click', () => {
        if (mediaRecorder?.state === 'recording') {
            stopRecording();
        }
        else {
            startRecording();
        }
    });
}
let mp4Blob = new Blob([], { type: 'video/mp4' });
async function startRecording() {
    recordButton.classList.add('recording');
    progressRing.style.display = 'block';
    try {
        const mediaStream = liveRenderTarget.captureStream(30);
        mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm' });
        const chunks = [];
        mediaRecorder.addEventListener('dataavailable', (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        });
        mediaRecorder.addEventListener('stop', async () => {
            console.log("Recording stopped!");
            const blob = new Blob(chunks, { type: 'video/webm' });
            const videoFilename = 'recording.webm';
            const outputFilename = 'recording.mp4';
            let mp4Blob; // Declare mp4Blob outside the try block
            try {
                if (!ffmpegLoaded) {
                    throw new Error('FFmpeg not loaded. Cannot convert.');
                }
                ffmpeg.FS('writeFile', videoFilename, await fetchFile(blob));
                console.log("Running ffmpeg conversion...");
                await ffmpeg.run('-i', videoFilename, '-c:v', 'libx264', '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov', outputFilename);
                console.log("FFmpeg conversion complete!");
                const data = ffmpeg.FS('readFile', outputFilename);
                mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
                console.log("MP4 Blob created successfully");
            }
            catch (ffmpegError) {
                console.error('Error converting video with FFmpeg:', ffmpegError);
                alert(`Error converting video: ${ffmpegError}`);
                mp4Blob = blob; // Fallback to original WebM blob
            }
            finally {
                try {
                    downloadUrl = window.URL.createObjectURL(mp4Blob);
                    previewVideo.src = downloadUrl;
                    previewVideo.load(); // Force reload of video
                    previewVideo.onloadedmetadata = () => {
                        console.log("Video metadata loaded");
                        previewVideo.muted = true; // Mute the video
                        previewVideo.play().catch(error => console.error("Error playing video:", error)); // Autoplay
                        previewModal.style.display = 'flex';
                        previewModal.classList.add('show');
                        recordButton.classList.remove('recording');
                        progressRing.style.display = 'none';
                    };
                    console.log("Preview modal shown");
                }
                catch (previewError) {
                    console.error("Error setting up preview:", previewError);
                }
                try {
                    ffmpeg.FS('unlink', videoFilename);
                    ffmpeg.FS('unlink', outputFilename);
                }
                catch (unlinkError) {
                    console.warn("Error unlinking files:", unlinkError);
                }
            }
        });
        mediaRecorder.start();
        recordingStartTime = Date.now();
        updateProgress();
    }
    catch (error) {
        console.error("Error starting recording:", error);
        alert("Failed to start recording. Check console for details.");
        recordButton.classList.remove('recording');
        progressRing.style.display = 'none';
    }
}
function updateProgress() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording' || !recordingStartTime) {
        return;
    }
    const elapsedTime = Date.now() - recordingStartTime;
    const progressPercentage = Math.min(100, (elapsedTime / 1000 / RECORD_DURATION) * 100);
    const circumference = 2 * Math.PI * 30;
    const dashOffset = circumference * (1 - progressPercentage / 100);
    if (progressPath instanceof SVGPathElement) {
        progressPath.style.strokeDashoffset = String(dashOffset);
    }
    if (elapsedTime / 1000 >= RECORD_DURATION) {
        stopRecording();
    }
    else {
        requestAnimationFrame(updateProgress);
    }
}
async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    recordingStartTime = null;
    if (progressPath instanceof SVGPathElement) {
        progressPath.style.strokeDashoffset = String(188);
    }
    recordButton.classList.remove('recording');
    progressRing.style.display = 'none';
}
function bindModal() {
    closeModalButton.addEventListener('click', () => {
        previewModal.style.display = 'none';
        previewModal.classList.remove('show');
        previewVideo.pause();
        previewVideo.currentTime = 0;
    });
    shareButton.addEventListener('click', async () => {
        if (downloadUrl) {
            try {
                const response = await fetch(downloadUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
                }
                const blob = await response.blob();
                const videoBlob = new Blob([blob], { type: 'video/mp4' });
                const videoFile = new File([videoBlob], 'video.mp4', { type: 'video/mp4' });
                if (navigator.canShare && navigator.canShare({ files: [videoFile] })) {
                    await navigator.share({
                        files: [videoFile],
                        title: 'Camera Kit Recording',
                    });
                }
                else {
                    console.error('Sharing not supported or file is incompatible.');
                    alert('Sharing not supported in this browser or the file type is incompatible.');
                }
            }
            catch (error) {
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
