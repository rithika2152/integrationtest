/**
 * Camera Kit Web Demo with Recording Feature
 * Created by gowaaa (https://www.gowaaa.com)
 * A creative technology studio specializing in AR experiences
 *
 * @copyright 2025 GOWAAA
 */

import { bootstrapCameraKit, createMediaStreamSource, Transform2D } from "@snap/camera-kit";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import "./styles/index.v3.css";

;(async function () {
    let mediaRecorder: MediaRecorder | null = null;
    let recordedChunks: Blob[] = [];
    let isBackFacing = false;
    let recordPressedCount = 0;

    const ffmpeg = new FFmpeg();
    // Replace with your own api token, lens id, and group id
    const apiToken = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzM0NjkzMzE0LCJzdWIiOiIzMmZhMmZlNC0wYmYxLTQ2N2QtODM4Mi04MTVmNzliMjFkMWJ-U1RBR0lOR35iMWI3YmFjZi01ZGI3LTQxMDAtOWIzNC0zZDEwODJmNmMyYTAifQ.681nZeSjvWHzWBiZbHY-T3Yq6M6qk3j9zgk9nM6I06M';
    const lensID = 'fb6410ff-f10b-438a-a8b0-70cc6012b2b6';
    const groupID = '11cbcba2-1275-47ec-9916-feaa6c52d24b';


    const cameraKit = await bootstrapCameraKit({
        apiToken: apiToken,
    });

    // Add device detection at the start of the async function
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    // Add desktop class to body if not mobile
    if (!isMobile) {
        document.body.classList.add("desktop");
    }

    // Set camera constraints based on device type
    const constraints = {
        video: {
            facingMode: isMobile ? { exact: "user" } : "user",
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        },
        audio: true,
    };

    // Get canvas element for live render target
    const liveRenderTarget = document.getElementById("canvas") as HTMLCanvasElement;
    const captureRenderTarget = document.getElementById("captureCanvas") as HTMLCanvasElement; // Assuming you still want to use a capture canvas.  Make sure this element exists in your HTML.

    // Create camera kit session and assign liveRenderTarget canvas to render out live render target from camera kit
    const session = await cameraKit.createSession({ liveRenderTarget });

    // Request media stream with set camera preference
    let mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    const source = createMediaStreamSource(mediaStream, { cameraType: "user", disableSourceAudio: false });

    // Set up source settings so that it renders out correctly on browser
    await session.setSource(source);
    // only for front camera use
    source.setTransform(Transform2D.MirrorX);
    await source.setRenderSize(window.innerWidth, window.innerHeight);
    await session.setFPSLimit(60);
    await session.play(); // plays live target by default

    // Assign Lens ID (left) and Group ID(Right) to camera kit
    const lens = await cameraKit.lensRepository.loadLens(lensID, groupID);

    await session.applyLens(lens);

    console.log(session);
    console.log(Object.keys(session));

    // Get all elements require to perform logics
    const recordButton = document.getElementById("record-button") as HTMLButtonElement;
    const recordOutline = document.getElementById("outline") as HTMLElement;
    const actionbutton = document.getElementById("action-buttons") as HTMLElement;
    const switchButton = document.getElementById("switch-button") as HTMLButtonElement;
    const loadingIcon = document.getElementById("loading") as HTMLElement;
    const backButtonContainer = document.getElementById("back-button-container") as HTMLElement;


    recordButton.addEventListener("click", async () => {
        //first check if it should start record or stop record
        // even number = start, odd number = stop
        if (recordPressedCount % 2 == 0) {
            //disable live canvas so the capture canvas that is behind live canvas will be shown instead
            // capture canvas z-index is set behind live canvas in css
            liveRenderTarget.style.display = "none";

            //!! IMPORTANT CHANGE: Use the LIVE render target for captureStream, not a separate "capture" render target.
            await session.play();  // Make sure the session is playing. No need to specify "capture"

            //Manage media recorder and start recording
            manageMediaRecorder(session);

            //Show stop record button
            recordButton.style.backgroundImage = "url('./assets/RecordStop.png')";
        } else {
            //hide stop record button
            RecordButtonToggle(false);
            //switch back to record button when recording stopped
            recordButton.style.backgroundImage = "url('./assets/RecordButton.png')";
            //Stop media recording
            if (mediaRecorder) {
                mediaRecorder.stop();
            }
        }
        recordPressedCount += 1;
    });


    switchButton.addEventListener("click", () => {
        // update & switch between front and back camera
        updateCamera(session);
    });

    /*
    ========================================
    Functions
    ========================================
    */

    // To convert recorded video to proper mp4 format that can be shared to social media
    async function fixVideoDuration(blob: Blob): Promise<Blob> {
        console.log(blob);
        // Load FFmpeg.js
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });

        // Write the input video blob to FFmpeg's virtual filesystem
        await ffmpeg.writeFile("input.mp4", await fetchFile(blob));

        // Reprocess the video to ensure metadata is added correctly
        await ffmpeg.exec(["-i", "input.mp4", "-movflags", "faststart", "-c", "copy", "output.mp4"]);

        // Read the fixed video file from the virtual filesystem as a Uint8Array
        const fixedData: Uint8Array = await ffmpeg.readFile("output.mp4") as Uint8Array;

        // Create a new Blob for the fixed video, using the Uint8Array directly
        const fixedBlob = new Blob([fixedData], { type: "video/mp4" });

        // Return the fixed Blob
        return fixedBlob;
    }

    // Function to toggle record button visibility
    function RecordButtonToggle(isVisible: boolean) {
        if (isVisible) {
            recordOutline.style.display = "block";
            recordButton.style.display = "block";
        } else {
            recordOutline.style.display = "none";
            recordButton.style.display = "none";
        }
    }

    // Fucntion to switch camera between front & back
    async function updateCamera(session: any) { //  'session' can be 'any' or 'CameraKitSession' if you import it.
        isBackFacing = !isBackFacing;

        if (mediaStream) {
            session.pause();
            mediaStream.getVideoTracks().forEach(track => track.stop()); // Stop all tracks, not just video.
        }

        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: isBackFacing ? (isMobile ? { exact: "environment" } : "environment") : isMobile ? { exact: "user" } : "user",
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: true, // Re-enable audio here.
        });


        const source = createMediaStreamSource(mediaStream, {
            cameraType: isBackFacing ? "environment" : "user",
            disableSourceAudio: false, // Make sure audio is enabled.
        });

        await session.setSource(source);
        if (!isBackFacing) {
            source.setTransform(Transform2D.MirrorX);
        }
        updateRenderSize();
        await session.play();
    }

    // Function to setup media recorder and start recording
    function manageMediaRecorder(session: any) {
        // Get the canvas stream (video AND audio).  This is the crucial change.
        const canvasStream = session.source.mediaStream; // Get mediaStream directly, and include it in the MediaRecorder

        // Now create the media recorder with both audio and video
        mediaRecorder = new MediaRecorder(canvasStream, { mimeType: "video/webm;codecs=vp9,opus" }); // Use webm for better compatibility with FFmpeg.

        console.log("create media recorder");
        recordedChunks = [];
        // Handle recorded data once it is available
        mediaRecorder.ondataavailable = (event) => {
            console.log("start record");

            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        // Handle recording data when recording stopped
        mediaRecorder.onstop = async () => {
            console.log("stop record");
            //display loading icon while video is being processed
            loadingIcon.style.display = "block";

            const blob = new Blob(recordedChunks, { type: "video/webm" }); // Create a webm blob
            const fixedBlob = await fixVideoDuration(blob); // Use FFmpeg to fix the duration.
            // Generate a URL for the fixed video
            const url = URL.createObjectURL(fixedBlob);
            //hide loading icon once video is done processing
            loadingIcon.style.display = "none";
            displayPostRecordButtons(url, fixedBlob);

            recordedChunks = []; // Clear recorded chunks.
        };
        //Start recording
        mediaRecorder.start();
    }

    function displayPostRecordButtons(url: string, fixedBlob: Blob) {
        actionbutton.style.display = "block";
        backButtonContainer.style.display = "block";
        switchButton.style.display = "none";

        //Logic for when download button is selected
        const downloadButton = document.getElementById("download-button") as HTMLButtonElement
        downloadButton.onclick = () => {
            const a = document.createElement("a");
            a.href = url;
            a.download = "recording.mp4"; //Change downloaded file name here
            a.click();
            a.remove();
        };

        //Logic for when share button is selected
        const shareButton = document.getElementById("share-button") as HTMLButtonElement;
        shareButton.onclick = async () => {
            try {
                const file = new File([fixedBlob], "recording.mp4", { type: "video/mp4" }); // Convert blob to file

                // Check if sharing files is supported
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: "Recorded Video",
                        text: "Check out this recording!",
                    });
                    console.log("File shared successfully");
                } else {
                    console.error("Sharing files is not supported on this device.");
                }
            } catch (error) {
                console.error("Error while sharing:", error);
            }
        };

        const backButton = document.getElementById("back-button") as HTMLButtonElement;
        backButton.addEventListener("click", async () => {

            actionbutton.style.display = "none";
            backButtonContainer.style.display = "none";
            switchButton.style.display = "block";
            //show live render targetcanvas again
            liveRenderTarget.style.display = "block";
            //need to play live target for canvas to show anything
            await session.play();
            RecordButtonToggle(true);
        });
    }

    // Update the updateRenderSize function to handle both mobile and desktop
    function updateRenderSize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        let renderWidth, renderHeight;

        renderWidth = width;
        renderHeight = height;

        liveRenderTarget.style.width = `${renderWidth}px`;
        liveRenderTarget.style.height = `${renderHeight}px`;
        // liveRenderTarget.width = renderWidth * devicePixelRatio; //for high resolution screens
        // liveRenderTarget.height = renderHeight * devicePixelRatio;//for high resolution screens
        source.setRenderSize(renderWidth, renderHeight);
    }

    // Add window resize listener
    window.addEventListener("resize", updateRenderSize);

    // Update initial render size
    updateRenderSize();
})();