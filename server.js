const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

// Handle socket connections
io.on('connection', (socket) => {
    console.log('New user connected');

    // Handle room creation
    socket.on('create-room', (data, callback) => {
        const roomId = generateRoomId();
        socket.join(roomId);
        console.log(`Room created: ${roomId}`);
        callback(roomId);
    });

    // Handle room joining
    socket.on('join-room', (data, callback) => {
        const { roomId, displayName } = data;
        if (roomId) {
            const room = io.sockets.adapter.rooms.get(roomId);

            if (room) {
                socket.join(roomId);
                console.log(`User joined room: ${roomId}`);
                callback(true);
                socket.to(roomId).emit('user-joined', { id: socket.id, name: displayName });
            } else {
                callback(false);
            }
        } else {
            callback(false);
        }
    });

    // Handle offer
    socket.on('offer', (data) => {
        if (data.to && data.offer) {
            socket.to(data.to).emit('offer', {
                offer: data.offer,
                from: socket.id
            });
        } else {
            console.error('Invalid offer data:', data);
        }
    });

    // Handle answer
    socket.on('answer', (data) => {
        if (data.to && data.answer) {
            socket.to(data.to).emit('answer', {
                answer: data.answer
            });
        } else {
            console.error('Invalid answer data:', data);
        }
    });

    // Handle ICE candidate
    socket.on('candidate', (data) => {
        if (data.to && data.candidate) {
            socket.to(data.to).emit('candidate', {
                candidate: data.candidate
            });
        } else {
            console.error('Invalid candidate data:', data);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Generate a random room ID
function generateRoomId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Start the server
server.listen(3000, () => {
    console.log('Server is listening on port 3000');
});
