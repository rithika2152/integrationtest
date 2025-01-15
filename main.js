import { bootstrapCameraKit } from '@snap/camera-kit';

(async function () {
  try {
     bootstrapCameraKit({
      apiToken: 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzI2NTY1MzEwLCJzdWIiOiIyN2NmNDQwYy04YjBkLTQ5ZDEtYTM2MC04YjdkODQ5OTM3ZWJ-UFJPRFVDVElPTn5kZTg3ZmFmMy0yY2M3LTRmNzMtYjY5ZS0zZTgzOTZkYmZkYjYifQ.eftt1t2swdSw2TTML523oX7-PEX0hJgUN_6CSgog8U0'
    }).then( async (cameraKit) => {
       
        const liveRenderTarget = document.getElementById('canvas');
        const aspectRatio = window.innerWidth / window.innerHeight;
        liveRenderTarget.width = window.innerWidth;
        liveRenderTarget.height = window.innerHeight;

        const session = await cameraKit.createSession({ liveRenderTarget });

        const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
        });

        await session.setSource(mediaStream);
        await session.play();

        const lens = await cameraKit.lensRepository.loadLens(
            '77b918f0-930f-423c-be8b-05c1ccd96747',
            '11cbcba2-1275-47ec-9916-feaa6c52d24b'
        );

        await session.applyLens(lens);
      });
    } catch (error) {
        console.error('Error initializing Camera Kit:', error);
       if (error instanceof Error) {
          alert(`Error initializing Camera Kit:\n${error.message}`);
         }
    }
})();