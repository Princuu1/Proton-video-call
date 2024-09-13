document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let localStream;
    let peerConnection;
    let screenStream;
    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const roomInput = document.getElementById('roomId');
    const displayNameInput = document.getElementById('displayName');
    const statusMessage = document.getElementById('statusMessage');
    const muteBtn = document.getElementById('mute');
    const muteVideoBtn = document.getElementById('muteVideo');
    const endCallBtn = document.getElementById('endCall');
    const toggleCameraBtn = document.getElementById('toggleCamera');
    const fullscreenBtn = document.getElementById('fullscreen');
    const joinRoomBtn = document.getElementById('joinRoom');
    const createRoomBtn = document.getElementById('createRoom');
    const submitJoinRoomBtn = document.getElementById('submitJoinRoom');
    const displayNameOnVideo = document.getElementById('displayNameOnVideo');

    let isMuted = false;
    let isVideoMuted = false; // Initialize isVideoMuted
    let currentCameraId = null;

    createRoomBtn.addEventListener('click', () => {
        const displayName = displayNameInput.value.trim();
        if (!displayName) {
            alert('Please enter a display name.');
            return;
        }

        socket.emit('create-room', { displayName }, (roomId) => {
            roomInput.value = roomId;
            startCall();
            document.getElementById('joinRoomControls').style.display = 'none';
            document.getElementById('callControls').style.display = 'block';
            statusMessage.textContent = `Room created: ${roomId}`;
        });
    });

    joinRoomBtn.addEventListener('click', () => {
        document.getElementById('joinRoomControls').style.display = 'block';
        document.getElementById('callControls').style.display = 'none';
    });

    submitJoinRoomBtn.addEventListener('click', () => {
        const roomId = roomInput.value.trim();
        const displayName = displayNameInput.value.trim();
        if (!roomId || !displayName) {
            statusMessage.textContent = 'Please enter both Room ID and Display Name.';
            return;
        }

        socket.emit('join-room', { roomId, displayName }, (success) => {
            if (success) {
                startCall();
                document.getElementById('joinRoomControls').style.display = 'none';
                document.getElementById('callControls').style.display = 'block';
                statusMessage.textContent = `Joined room: ${roomId}`;
            } else {
                statusMessage.textContent = 'Room not found. Please check the Room ID and try again.';
            }
        });
    });

    async function startCall() {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        peerConnection = new RTCPeerConnection(configuration);
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', { candidate: event.candidate, to: roomInput.value });
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { offer, to: roomInput.value });
    }

    socket.on('offer', async (data) => {
        peerConnection = new RTCPeerConnection(configuration);
        peerConnection.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
        };
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', { candidate: event.candidate, to: data.from });
            }
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { answer, to: data.from });
    });

    socket.on('answer', async (data) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on('candidate', async (data) => {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    endCallBtn.addEventListener('click', () => {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
        }
        socket.emit('disconnect');
        document.getElementById('callControls').style.display = 'none';
        document.getElementById('joinRoomControls').style.display = 'block';
    });

    toggleCameraBtn.addEventListener('click', async () => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const newCamera = videoDevices.find(device => device.deviceId !== currentCameraId);

        if (newCamera) {
            currentCameraId = newCamera.deviceId;
            localStream.getVideoTracks()[0].stop();
            localStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: currentCameraId }, audio: true });
            localVideo.srcObject = localStream;
        } else {
            alert('No other camera found.');
        }
    });

    muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
        muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    });

    muteVideoBtn.addEventListener('click', () => {
        isVideoMuted = !isVideoMuted; // Use isVideoMuted instead of isMuted
        localStream.getVideoTracks().forEach(track => track.enabled = !isVideoMuted);
        muteVideoBtn.textContent = isVideoMuted ? 'Unmute Video' : 'Mute Video';
    });

    fullscreenBtn.addEventListener('click', () => {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.mozRequestFullScreen) {
            document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
            document.documentElement.msRequestFullscreen();
        }
    });

    // Update display name on video call screen
    socket.on('user-joined', (data) => {
        if (displayNameOnVideo) {
            displayNameOnVideo.textContent = `User: ${data.name}`;
        } else {
            console.error('Element with ID displayNameOnVideo not found.');
        }
    });
});
