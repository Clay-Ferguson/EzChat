const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

console.log("Signaling server running on ws://localhost:8080");

// Track client connections by room - moved outside connection handler to be shared
const clientRooms = new Map();

wss.on('connection', (ws) => {
    console.log("New client connected.");

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log("Received message:", data);

            // Handle join message
            if (data.type === 'join') {
                const room = data.room;
                clientRooms.set(ws, room);
                console.log(`Client joined room: ${room}`);
            }

            // For WebRTC signaling messages (offer, answer, ice-candidate)
            if (data.type === 'offer' || data.type === 'answer' || data.type === 'ice-candidate') {
                const room = clientRooms.get(ws);
                if (room) {
                    // Add room to the message for routing
                    data.room = room;
                    // Broadcast to other clients in the same room
                    wss.clients.forEach((client) => {
                        if (client !== ws && 
                            client.readyState === WebSocket.OPEN && 
                            clientRooms.get(client) === room) {
                            console.log(`Sending ${data.type} to client in room ${room}`);
                            client.send(JSON.stringify(data));
                        }
                    });
                } else {
                    console.log("Received signaling message but client not in a room");
                }
            }
            // Handle messages with explicit room property
            else if (data.room) {
                wss.clients.forEach((client) => {
                    if (client !== ws && 
                        client.readyState === WebSocket.OPEN && 
                        clientRooms.get(client) === data.room) {
                        console.log(`Sending message to room ${data.room}:`, data);
                        client.send(JSON.stringify(data));
                    }
                });
            }

        } catch (error) {
            console.error("Error parsing message:", error);
        }
    });

    ws.on('close', () => {
        const room = clientRooms.get(ws);
        if (room) {
            console.log(`Client disconnected from room: ${room}`);
            clientRooms.delete(ws);
        }
    });

    ws.on('error', (error) => {
        console.error("WebSocket error:", error);
    });
});