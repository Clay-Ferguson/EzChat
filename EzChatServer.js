const WebSocket = require('ws');
const process = require('process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i += 2) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
        argMap[args[i].substring(2)] = args[i + 1];
    }
}

// Set configuration with priority: command line args > environment variables > defaults
const HOST = argMap.host || process.env.EZCHAT_HOST || 'localhost';
const PORT = parseInt(argMap.port || process.env.EZCHAT_PORT || '8080', 10);
const HTTP_PORT = parseInt(argMap.httpPort || process.env.EZCHAT_HTTP_PORT || '8000', 10);

// Create HTTP server to serve static files
const server = http.createServer((req, res) => {
    // Parse the URL to separate path from query parameters
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = urlObj.pathname;

    // Handle requests for files in the public directory
    if (pathname.startsWith('/public/')) {
        const filePath = path.join(__dirname, pathname);

        // Get file extension to set correct content type
        const extname = path.extname(filePath);
        let contentType = 'text/html';

        switch (extname) {
            case '.js':
                contentType = 'text/javascript';
                break;
            case '.css':
                contentType = 'text/css';
                break;
            case '.json':
                contentType = 'application/json';
                break;
            case '.png':
                contentType = 'image/png';
                break;
            case '.jpg':
                contentType = 'image/jpg';
                break;
            case '.jpeg':
                contentType = 'image/jpeg';
                break;
        }

        // Read and serve the file
        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    // File not found
                    res.writeHead(404);
                    res.end('File not found');
                } else {
                    // Server error
                    res.writeHead(500);
                    res.end('Server Error: ' + err.code);
                }
                return;
            }

            // Success - send the file
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
            console.log(`Served static file: ${pathname}`);
        });
    } else if (pathname === '/') {
        // Serve the EzChat.html file
        const filePath = path.join(__dirname, 'EzChat.html');
        fs.readFile(filePath, 'utf-8', (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading EzChat.html');
                console.error('Error serving EzChat.html:', err);
                return;
            }

            // Replace placeholders with actual values
            content = content.replace(/{{HOST}}/g, HOST)
                .replace(/{{PORT}}/g, PORT.toString());

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content, 'utf-8');
            console.log('Served EzChat.html with dynamic values');
        });
    } else {
        // Handle 404 for other routes
        res.writeHead(404);
        res.end('Page not found');
    }
});

// Start HTTP server
server.listen(HTTP_PORT, HOST, () => {
    console.log(`HTTP server running on http://${HOST}:${HTTP_PORT}`);
});

// Create WebSocket server (separate from HTTP)
const wss = new WebSocket.Server({
    host: HOST,
    port: PORT
});

console.log(`Signaling server running on ws://${HOST}:${PORT}`);

// Track client connections with more information
const clients = new Map(); // Map of WebSocket -> {room, name}
const rooms = new Map();   // Map of roomId -> Set of client names in the room

wss.on('connection', (ws) => {
    console.log("New client connected.");

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log("Received message:", data);

            // Handle join message
            if (data.type === 'join') {
                const room = data.room;
                const name = data.name || `user-${Math.floor(Math.random() * 10000)}`;

                // Store client info
                clients.set(ws, { room, name });

                // Update room participants
                if (!rooms.has(room)) {
                    rooms.set(room, new Set());
                }
                rooms.get(room).add(name);

                console.log(`Client ${name} joined room: ${room}`);

                // Send the current participants list to the new client
                const participants = Array.from(rooms.get(room));
                ws.send(JSON.stringify({
                    type: 'room-info',
                    participants: participants.filter(p => p !== name),
                    room
                }));

                // Notify others about the new participant
                wss.clients.forEach((client) => {
                    if (client !== ws &&
                        client.readyState === WebSocket.OPEN &&
                        clients.get(client)?.room === room) {
                        client.send(JSON.stringify({
                            type: 'user-joined',
                            name: name,
                            room
                        }));
                    }
                });
            }

            // For WebRTC signaling messages (offer, answer, ice-candidate)
            if ((data.type === 'offer' || data.type === 'answer' || data.type === 'ice-candidate') && data.target) {
                const client = clients.get(ws);

                if (client) {
                    const room = client.room;
                    const sender = client.name;

                    // Add sender info to the message
                    data.sender = sender;
                    data.room = room;

                    // Find the target client and send the message
                    wss.clients.forEach((client) => {
                        const clientInfo = clients.get(client);
                        if (client.readyState === WebSocket.OPEN &&
                            clientInfo &&
                            clientInfo.room === room &&
                            clientInfo.name === data.target) {
                            console.log(`Sending ${data.type} from ${sender} to ${data.target} in room ${room}`);
                            client.send(JSON.stringify(data));
                        }
                    });
                } else {
                    console.log("Received signaling message but client not in a room");
                }
            }
            // Handle broadcast messages to everyone in a room
            else if (data.type === 'broadcast' && data.room) {
                const client = clients.get(ws);
                if (client) {
                    data.sender = client.name;
                    wss.clients.forEach((c) => {
                        const clientInfo = clients.get(c);
                        if (c !== ws &&
                            c.readyState === WebSocket.OPEN &&
                            clientInfo &&
                            clientInfo.room === data.room) {
                            console.log(`Broadcasting message in room ${data.room} from ${client.name}`);
                            c.send(JSON.stringify(data));
                        }
                    });
                }
            }

        } catch (error) {
            console.error("Error parsing message:", error);
        }
    });

    ws.on('close', () => {
        const client = clients.get(ws);
        if (client) {
            const { room, name } = client;
            console.log(`Client ${name} disconnected from room: ${room}`);

            // Remove from room participants
            if (rooms.has(room)) {
                rooms.get(room).delete(name);

                // If room is empty, remove it
                if (rooms.get(room).size === 0) {
                    rooms.delete(room);
                } else {
                    // Notify others about the participant leaving
                    wss.clients.forEach((c) => {
                        if (c.readyState === WebSocket.OPEN &&
                            clients.get(c)?.room === room) {
                            c.send(JSON.stringify({
                                type: 'user-left',
                                name: name,
                                room
                            }));
                        }
                    });
                }
            }

            clients.delete(ws);
        }
    });

    ws.on('error', (error) => {
        console.error("WebSocket error:", error);
    });
});