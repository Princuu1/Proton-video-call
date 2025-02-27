const socket = io();
let localStream;
let peerConnection;
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const elements = {
    sidebar: document.getElementById('sidebar'),
    mainContent: document.getElementById('mainContent'),
    menuToggle: document.getElementById('menuToggle'),
    closeSidebar: document.getElementById('closeSidebar'),
    displayName: document.getElementById('displayName'),
    localVideo: document.getElementById('localVideo'),
    remoteVideo: document.getElementById('remoteVideo'),
    remoteName: document.getElementById('remoteName'),
    roomId: document.getElementById('roomId'),
    createRoom: document.getElementById('createRoom'),
    joinRoom: document.getElementById('joinRoom'),
    copyRoomId: document.getElementById('copyRoomId'),
    toggleMic: document.getElementById('toggleMic'),
    toggleVideo: document.getElementById('toggleVideo'),
    endCall: document.getElementById('endCall'),
    fullscreen: document.getElementById('fullscreen')
};

let isMuted = false;
let isVideoMuted = false;
let currentRoomId = null;

// Sidebar Toggle
elements.menuToggle.addEventListener('click', () => {
    elements.sidebar.classList.toggle('closed');
    elements.mainContent.classList.toggle('expanded');
});

elements.closeSidebar.addEventListener('click', () => {
    elements.sidebar.classList.add('closed');
    elements.mainContent.classList.add('expanded');
});

// Copy Room ID
elements.copyRoomId.addEventListener('click', () => {
    if (currentRoomId) {
        navigator.clipboard.writeText(currentRoomId);
        alert('Room ID copied to clipboard!');
    }
});

// Room Management
elements.createRoom.addEventListener('click', async () => {
    const displayName = elements.displayName.value.trim();
    if (!displayName) return alert('Please enter display name');
    
    socket.emit('create-room', { displayName }, (roomId) => {
        currentRoomId = roomId;
        elements.roomId.value = roomId;
        startCall();
    });
});

elements.joinRoom.addEventListener('click', () => {
    const roomId = elements.roomId.value.trim();
    const displayName = elements.displayName.value.trim();
    if (!roomId || !displayName) return alert('Please fill all fields');

    socket.emit('join-room', { roomId, displayName }, (success) => {
        if (success) {
            currentRoomId = roomId;
            startCall();
        } else {
            alert('Room not found');
        }
    });
});

async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        elements.localVideo.srcObject = localStream;
        setupPeerConnection();
    } catch (error) {
        console.error('Error accessing media devices:', error);
    }
}

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    
    localStream.getTracks().forEach(track => 
        peerConnection.addTrack(track, localStream)
    );

    peerConnection.ontrack = event => {
        elements.remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('candidate', { 
                candidate: event.candidate, 
                to: currentRoomId 
            });
        }
    };

    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
            socket.emit('offer', { 
                offer: peerConnection.localDescription, 
                to: currentRoomId,
                displayName: elements.displayName.value
            });
        });
}

// WebRTC Handlers
socket.on('offer', async (data) => {
    elements.remoteName.textContent = data.displayName;
    
    peerConnection = new RTCPeerConnection(configuration);
    peerConnection.ontrack = event => {
        elements.remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('candidate', { 
                candidate: event.candidate, 
                to: data.from 
            });
        }
    };

    await peerConnection.setRemoteDescription(data.offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    socket.emit('answer', { 
        answer, 
        to: data.from,
        displayName: elements.displayName.value
    });
});

socket.on('answer', async (data) => {
    elements.remoteName.textContent = data.displayName;
    await peerConnection.setRemoteDescription(data.answer);
});

socket.on('candidate', async (data) => {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
});

// Control Handlers
elements.toggleMic.addEventListener('click', () => {
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
    elements.toggleMic.innerHTML = `
        <i class="fas fa-microphone${isMuted ? '-slash' : ''}"></i>
        <span>${isMuted ? 'Unmute' : 'Mute'}</span>
    `;
});

elements.toggleVideo.addEventListener('click', () => {
    isVideoMuted = !isVideoMuted;
    localStream.getVideoTracks().forEach(track => track.enabled = !isVideoMuted);
    elements.toggleVideo.innerHTML = `
        <i class="fas fa-video${isVideoMuted ? '-slash' : ''}"></i>
        <span>${isVideoMuted ? 'Show' : 'Hide'}</span>
    `;
});

elements.endCall.addEventListener('click', () => {
    peerConnection?.close();
    localStream?.getTracks().forEach(track => track.stop());
    socket.emit('leave-room', currentRoomId);
    elements.remoteVideo.srcObject = null;
    elements.remoteName.textContent = 'Disconnected';
    currentRoomId = null;
});

elements.fullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});
