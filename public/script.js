const socket = io();
let localStream;
let peerConnection;
let configuration;

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

// Copy Room ID to clipboard
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
    
    socket.emit('create-room', { displayName }, async (roomId) => {
        if (roomId) {
            currentRoomId = roomId;
            elements.roomId.value = roomId;
            await startCall();
        } else {
            alert('Error creating room.');
        }
    });
});

elements.joinRoom.addEventListener('click', () => {
    const roomId = elements.roomId.value.trim();
    const displayName = elements.displayName.value.trim();
    if (!roomId || !displayName) return alert('Please fill all fields');

    socket.emit('join-room', { roomId, displayName }, async (success) => {
        if (success) {
            currentRoomId = roomId;
            await startCall();
        } else {
            alert('Room not found');
        }
    });
});

// Fetch TURN credentials from backend
async function getTurnCredentials() {
    try {
        const response = await fetch('/getTurnCredentials');
        const config = await response.json();
        return config;
    } catch (error) {
        console.error('Failed to fetch TURN credentials:', error);
        // Fallback configuration (only a STUN server)
        return {
            iceServers: [
                { urls: ["stun:stun.l.google.com:19302"] }
            ]
        };
    }
}

async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        elements.localVideo.srcObject = localStream;
        // Get TURN configuration from the server
        configuration = await getTurnCredentials();
        setupPeerConnection();
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Could not access camera or microphone.');
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

    // Create an offer if initiating the call
    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
            socket.emit('offer', { 
                offer: peerConnection.localDescription, 
                to: currentRoomId,
                displayName: elements.displayName.value
            });
        })
        .catch(error => {
            console.error('Error creating offer:', error);
        });
}

// WebRTC Signaling Handlers
socket.on('offer', async (data) => {
    elements.remoteName.textContent = data.displayName;
    
    // If configuration is not set, fetch it
    if (!configuration) {
        configuration = await getTurnCredentials();
    }

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
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
        console.error('Error adding received ICE candidate', error);
    }
});

// Media Control Handlers
elements.toggleMic.addEventListener('click', () => {
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
    elements.toggleMic.innerHTML = `<i class="fas fa-microphone${isMuted ? '-slash' : ''}"></i>`;
});

elements.toggleVideo.addEventListener('click', () => {
    isVideoMuted = !isVideoMuted;
    localStream.getVideoTracks().forEach(track => track.enabled = !isVideoMuted);
    elements.toggleVideo.innerHTML = `<i class="fas fa-video${isVideoMuted ? '-slash' : ''}"></i>`;
});

elements.endCall.addEventListener('click', () => {
    if (!currentRoomId) return; // Prevent if no active call

    peerConnection?.close();
    localStream?.getTracks().forEach(track => track.stop());
    socket.emit('leave-room', currentRoomId);
    elements.remoteVideo.srcObject = null;

    elements.remoteName.textContent = `Disconnected`;
    elements.remoteName.classList.add('disconnected');

    currentRoomId = null;
});

// When a user connects
socket.on('user-connected', (userId) => {
    elements.remoteName.textContent = userId;
    elements.remoteName.classList.remove('disconnected');
});

// Fullscreen Toggle
elements.fullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        elements.fullscreen.innerHTML = `<i class="fas fa-compress"></i>`;
    } else {
        document.exitFullscreen();
        elements.fullscreen.innerHTML = `<i class="fas fa-expand"></i>`;
    }
});

// Enhanced Mobile Sidebar Toggle
elements.menuToggle.addEventListener('click', () => {
    elements.sidebar.classList.toggle('active');
    elements.mainContent.classList.toggle('menu-active');
});

elements.closeSidebar.addEventListener('click', () => {
    elements.sidebar.classList.remove('active');
    elements.mainContent.classList.remove('menu-active');
});

document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
        if (!elements.sidebar.contains(e.target) && !elements.menuToggle.contains(e.target)) {
            elements.sidebar.classList.remove('active');
            elements.mainContent.classList.remove('menu-active');
        }
    }
});

// Swipe to close sidebar on mobile
let touchStartX = 0;
document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
});
document.addEventListener('touchend', e => {
    if (window.innerWidth <= 768) {
        const touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 50) { // Swipe left to close
            elements.sidebar.classList.remove('active');
            elements.mainContent.classList.remove('menu-active');
        }
    }
});
