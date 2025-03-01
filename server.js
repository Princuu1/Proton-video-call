require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Load TURN credentials from environment variables
const turnUsername = process.env.TURN_USERNAME;
const turnCredential = process.env.TURN_CREDENTIAL;

const turnConfiguration = {
    iceServers: [
        {
            urls: ["stun:ss-turn2.xirsys.com"]
        },
        {
            username: turnUsername,
            credential: turnCredential,
            urls: [
                "turn:ss-turn2.xirsys.com:80?transport=udp",
                "turn:ss-turn2.xirsys.com:3478?transport=udp",
                "turn:ss-turn2.xirsys.com:80?transport=tcp",
                "turn:ss-turn2.xirsys.com:3478?transport=tcp",
                "turns:ss-turn2.xirsys.com:443?transport=tcp",
                "turns:ss-turn2.xirsys.com:5349?transport=tcp"
            ]
        }
    ]
};

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Endpoint to securely provide TURN credentials to clients
app.get('/getTurnCredentials', (req, res) => {
    res.json(turnConfiguration);
});

// Map to track rooms and their participants
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // Create a new room with a display name
    socket.on('create-room', ({ displayName }, callback) => {
        try {
            const roomId = generateRoomId();
            rooms.set(roomId, {
                users: [socket.id],
                displayNames: [displayName]
            });
            socket.join(roomId);
            console.log(`Room created: ${roomId}`);
            callback(roomId);
        } catch (error) {
            console.error("Error creating room:", error);
            callback(null);
        }
    });

    // Join an existing room
    socket.on('join-room', ({ roomId, displayName }, callback) => {
        const room = rooms.get(roomId);
        if (room) {
            room.users.push(socket.id);
            room.displayNames.push(displayName);
            socket.join(roomId);
            console.log(`User ${displayName} joined room: ${roomId}`);
            
            // Notify existing users in the room about the new participant
            socket.to(roomId).emit('user-joined', { 
                id: socket.id, 
                name: displayName 
            });
            callback(true);
        } else {
            console.warn(`Room not found: ${roomId}`);
            callback(false);
        }
    });

    // WebRTC signaling: offer, answer, and candidate events
    socket.on('offer', ({ offer, to, displayName }) => {
        socket.to(to).emit('offer', { 
            offer, 
            from: socket.id,
            displayName 
        });
    });

    socket.on('answer', ({ answer, to, displayName }) => {
        socket.to(to).emit('answer', { 
            answer, 
            from: socket.id,
            displayName 
        });
    });

    socket.on('candidate', ({ candidate, to }) => {
        socket.to(to).emit('candidate', { 
            candidate, 
            from: socket.id 
        });
    });

    // Cleanup when a user disconnects
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const [roomId, room] of rooms) {
            const index = room.users.indexOf(socket.id);
            if (index !== -1) {
                room.users.splice(index, 1);
                room.displayNames.splice(index, 1);
                socket.to(roomId).emit('user-left', { id: socket.id });
                if (room.users.length === 0) {
                    rooms.delete(roomId);
                    console.log(`Room deleted: ${roomId}`);
                }
            }
        }
    });
});

// Helper function to generate a unique room ID
function generateRoomId() {
    return Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
