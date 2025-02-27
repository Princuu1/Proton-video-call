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

const rooms = new Map(); // Track rooms with their participants

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // Create room with display name
    socket.on('create-room', ({ displayName }, callback) => {
        const roomId = generateRoomId();
        rooms.set(roomId, {
            users: [socket.id],
            displayNames: [displayName]
        });
        socket.join(roomId);
        console.log(`Room created: ${roomId}`);
        callback(roomId);
    });

    // Join existing room
    socket.on('join-room', ({ roomId, displayName }, callback) => {
        const room = rooms.get(roomId);
        if (room) {
            room.users.push(socket.id);
            room.displayNames.push(displayName);
            socket.join(roomId);
            console.log(`User ${displayName} joined room: ${roomId}`);
            
            // Notify existing users in the room
            socket.to(roomId).emit('user-joined', { 
                id: socket.id, 
                name: displayName 
            });
            
            callback(true);
        } else {
            callback(false);
        }
    });

    // WebRTC signaling
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

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up room data
        rooms.forEach((room, roomId) => {
            const index = room.users.indexOf(socket.id);
            if (index !== -1) {
                room.users.splice(index, 1);
                room.displayNames.splice(index, 1);
                if (room.users.length === 0) {
                    rooms.delete(roomId);
                }
            }
        });
    });
});

function generateRoomId() {
    return Math.random().toString(36).substr(2, 9).toUpperCase();
}

server.listen(3000, () => {
    console.log('Server is listening on port 3000');
});
