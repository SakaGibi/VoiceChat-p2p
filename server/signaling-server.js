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

const PORT = 3000;

io.on('connection', (socket) => {
    console.log('Yeni kullanıcı bağlandı:', socket.id);

    socket.on('offer', (data) => {
        console.log('Offer iletildi:', data);
        io.to(data.target).emit('offer', {
            sdp: data.sdp,
            sender: socket.id
        });
    });

    socket.on('answer', (data) => {
        console.log('Answer iletildi:', data);
        io.to(data.target).emit('answer', {
            sdp: data.sdp,
            sender: socket.id
        });
    });

    socket.on('ice-candidate', (data) => {
        console.log('ICE Candidate iletildi:', data);
        io.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            sender: socket.id
        });
    });

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`${socket.id} ${roomId} odasına katıldı.`);
        socket.to(roomId).emit('user-joined', socket.id);
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        io.emit('user-left', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Signaling server çalışıyor: http://localhost:${PORT}`);
});
