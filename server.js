const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Store room information
const rooms = {};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join room
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    
    // Initialize room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: {},
        screenSharing: null
      };
    }
    
    // Add user to room
    rooms[roomId].users[userId] = {
      socketId: socket.id,
      userName: `User ${Object.keys(rooms[roomId].users).length + 1}`,
      isAudioOn: true,
      isVideoOn: true
    };

    // Notify existing users about new user
    socket.to(roomId).emit('user-connected', userId);

    // Send existing users to new user
    const existingUsers = Object.keys(rooms[roomId].users).filter(id => id !== userId);
    socket.emit('existing-users', existingUsers);

    // Handle WebRTC signaling
    socket.on('offer', (offer, targetUserId) => {
      socket.to(rooms[roomId].users[targetUserId]?.socketId).emit('offer', offer, userId);
    });

    socket.on('answer', (answer, targetUserId) => {
      socket.to(rooms[roomId].users[targetUserId]?.socketId).emit('answer', answer, userId);
    });

    socket.on('ice-candidate', (candidate, targetUserId) => {
      socket.to(rooms[roomId].users[targetUserId]?.socketId).emit('ice-candidate', candidate, userId);
    });

    // Handle media controls
    socket.on('toggle-audio', (isAudioOn) => {
      if (rooms[roomId] && rooms[roomId].users[userId]) {
        rooms[roomId].users[userId].isAudioOn = isAudioOn;
        socket.to(roomId).emit('user-audio-toggle', userId, isAudioOn);
      }
    });

    socket.on('toggle-video', (isVideoOn) => {
      if (rooms[roomId] && rooms[roomId].users[userId]) {
        rooms[roomId].users[userId].isVideoOn = isVideoOn;
        socket.to(roomId).emit('user-video-toggle', userId, isVideoOn);
      }
    });

    // Handle screen sharing
    socket.on('start-screen-share', () => {
      if (rooms[roomId]) {
        rooms[roomId].screenSharing = userId;
        socket.to(roomId).emit('screen-share-started', userId);
      }
    });

    socket.on('stop-screen-share', () => {
      if (rooms[roomId]) {
        rooms[roomId].screenSharing = null;
        socket.to(roomId).emit('screen-share-stopped', userId);
      }
    });

    // Handle chat messages
    socket.on('chat-message', (message) => {
      const userName = rooms[roomId]?.users[userId]?.userName || 'Unknown User';
      io.to(roomId).emit('chat-message', {
        userId,
        userName,
        message,
        timestamp: new Date().toISOString()
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      
      if (rooms[roomId] && rooms[roomId].users[userId]) {
        delete rooms[roomId].users[userId];
        
        // If user was sharing screen, stop it
        if (rooms[roomId].screenSharing === userId) {
          rooms[roomId].screenSharing = null;
          socket.to(roomId).emit('screen-share-stopped', userId);
        }
        
        // Clean up empty room
        if (Object.keys(rooms[roomId].users).length === 0) {
          delete rooms[roomId];
        }
        
        socket.to(roomId).emit('user-disconnected', userId);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Share this link with friends to join meetings!`);
});