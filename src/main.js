import { fetchFile } from '@ffmpeg/util';
import { Transform2D, bootstrapCameraKit, createMediaStreamSource } from '@snap/camera-kit';

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

// FFmpeg.wasm setup
const ffmpeg = createFFmpeg({ log: true });
let ffmpegLoaded = false;

async function loadFFmpeg() {
    if (ffmpegLoaded) return;
    try {
        await ffmpeg.load();
        ffmpegLoaded = true;
        console.log('FFmpeg.wasm loaded!');
    } catch (error) {
        console.error('Error loading FFmpeg.wasm:', error);
        alert('Failed to load FFmpeg.wasm. Conversion might not work.');
    }
}

async function init() {
    try {
        const cameraKit = await bootstrapCameraKit({
            apiToken: 'YOUR_API_TOKEN' // Replace with your API TOKEN
        });

        const devicePixelRatio = window.devicePixelRatio || 1;
        const desiredAspectRatio = 9 / 16;
        let canvasWidth;
        let canvasHeight;

        if (window.innerWidth / window.innerHeight > desiredAspectRatio) {
            canvasWidth = window.innerWidth;
            canvasHeight = window.innerWidth / desiredAspectRatio;
        } else {
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
        } catch (error) {
            console.error("Error getting user media:", error);
            alert("Failed to access camera. Please ensure camera access is allowed.");
            return; // IMPORTANT: Stop if camera access fails
        }


        const source = createMediaStreamSource(mediaStream);
        await session.setSource(source);

        if (!isBackFacing) {
            source.setTransform(Transform2D.MirrorX);
        }

        try {
            await session.play();
        } catch (error) {
            console.error("Error starting camera session:", error);
            alert("Failed to start camera session. Check console for details.");
            return;
        }


        const lens = await cameraKit.lensRepository.loadLens("fb6410ff-f10b-438a-a8b0-70cc6012b2b6", "11cbcba2-1275-47ec-9916-feaa6c52d24b");
        await session.applyLens(lens);

        await loadFFmpeg();
        bindFlipCamera(session);
        bindRecorder();
        bindModal();

        // Debug: Check if canvas is drawing
        setInterval(() => {
            console.log("Canvas Data URL:", liveRenderTarget.toDataURL().substring(0, 50)); // Print only the beginning
        }, 3000);

    } catch (error) {
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
    if (isFlipping) return;
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
    } catch (error) {
        console.error("Error updating camera:", error);
        alert("Failed to update camera. Check console for details.");
    } finally {
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
        } else {
            startRecording();
        }
    });
}

async function startRecording() {
    recordButton.classList.add('recording');
    progressRing.style.display = 'block';
    recordingStartTime = Date.now();

    try {
        const mediaStream = liveRenderTarget.captureStream(30);
        console.log("MediaStream obtained:", mediaStream);

        mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm;codecs=vp9' }); // Use vp9
        console.log("MediaRecorder initialized:", mediaRecorder);

        const chunks = [];
        mediaRecorder.addEventListener('dataavailable', (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
                console.log("Chunk received:", event.data.size);
            }
        });

        mediaRecorder.addEventListener('stop', async () => {
            console.log("Recording stopped! Total Chunks:", chunks.length);
            const blob = new Blob(chunks, { type: 'video/webm' }); // Keep as webm
            const videoFilename = 'recording.webm';
            const outputFilename = 'recording.mp4';
            let mp4Blob;

            try {
                if (!ffmpegLoaded) {
                    throw new Error('FFmpeg not loaded. Cannot convert.');
                }
                ffmpeg.FS('writeFile', videoFilename, await fetchFile(blob));
                console.log("Running ffmpeg conversion...");
                try {
                    await ffmpeg.run(
                        '-i',
                        videoFilename,
                        '-c:v',
                        'libx264',
                        '-preset',
                        'ultrafast',
                        '-c:a',
                        'aac',
                        '-ac',
                        '2',
                        '-movflags',
                        'frag_keyframe+empty_moov',
                        outputFilename
                    );
                    console.log("FFmpeg conversion complete!");
                } catch (error) {
                    console.error("FFMPEG Conversion Error", error)
                }

                const data = ffmpeg.FS('readFile', outputFilename);
                mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
                console.log("MP4 Blob created successfully", mp4Blob.size);

            } catch (ffmpegError) {
                console.error('Error converting video with FFmpeg:', ffmpegError);
                alert(`Error converting video: ${ffmpegError}`);
                mp4Blob = blob; // Fallback to original WebM blob.  Important for viewing
            } finally {
                try {
                    downloadUrl = window.URL.createObjectURL(mp4Blob);
                    previewVideo.src = downloadUrl;
                    previewVideo.load();
                    previewVideo.onloadedmetadata = () => {
                        console.log("Video metadata loaded. Duration:", previewVideo.duration);
                        previewVideo.muted = true;
                        previewVideo.play().then(() => {
                            console.log("Video playback started");
                            previewModal.style.display = 'flex';
                            previewModal.classList.add('show');
                            recordButton.classList.remove('recording');
                            progressRing.style.display = 'none';
                        }).catch(e => {
                            console.error("Playback error", e)
                        });

                    };
                    previewVideo.onerror = (e) => {
                        console.error("Error loading video for preview", e);
                        alert("Failed to load video for preview.");
                        previewModal.style.display = 'none';
                        recordButton.classList.remove('recording');
                        progressRing.style.display = 'none';
                    }
                    console.log("Preview modal setup");
                } catch (previewError) {
                    console.error("Error setting up preview:", previewError);
                    alert("Failed to setup video preview.");
                    recordButton.classList.remove('recording');
                    progressRing.style.display = 'none';
                }

                try {
                    ffmpeg.FS('unlink', videoFilename);
                    ffmpeg.FS('unlink', outputFilename);
                } catch (unlinkError) {
                    console.warn("Error unlinking files:", unlinkError);
                }
            }
        });

        mediaRecorder.onerror = (event) => {
            console.error("MediaRecorder Error:", event.error);
            alert("MediaRecorder error. Check console for details.");
            stopRecording();
        };

        mediaRecorder.start();
        console.log("MediaRecorder started");
        updateProgress();

    } catch (error) {
        console.error("Error starting recording:", error);
        alert("Failed to start recording. Check console for details.");
        recordButton.classList.remove('recording');
        progressRing.style.display = 'none';
        recordingStartTime = null; //reset
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
    } else {
        requestAnimationFrame(updateProgress);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        console.log("MediaRecorder stopped");
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
        if (downloadUrl) { //clean up
            URL.revokeObjectURL(downloadUrl);
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
                const videoBlob = new Blob([blob], { type: 'video/mp4' });
                const videoFile = new File([videoBlob], 'video.mp4', { type: 'video/mp4' });

                if (navigator.canShare && navigator.canShare({ files: [videoFile] })) {
                    await navigator.share({
                        files: [videoFile],
                        title: 'Camera Kit Recording',
                    });
                    console.log("Shared successfully");
                } else {
                    console.error('Sharing not supported or file is incompatible.');
                    alert('Sharing not supported in this browser or the file type is incompatible. Will download instead.');
                    //download
                    const link = document.createElement('a');
                    link.setAttribute('style', 'display: none');
                    link.href = downloadUrl;
                    link.download = 'camera-kit-web-recording.mp4';
                    link.click();
                    link.remove();

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
