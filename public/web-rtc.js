import { log } from './util.js';

/**
 * WebRTC class for handling WebRTC connections
 * Designed as a singleton that can be instantiated once and reused
 */
class WebRTC {
    peerConnections = new Map();
    dataChannels = new Map();
    signalingSocket = null;
    roomId = localStorage.getItem('ezchat_room') || 'default-room'; // Load from localStorage or use default
    userName = localStorage.getItem('ezchat_username') || 'user-' + Math.floor(Math.random() * 10000); // Load from localStorage or generate
    participants = new Set();
    isSignalConnected = false;
    selectedFiles = [];

    constructor() {
        // If an instance already exists, return it
        if (WebRTC.instance) {
            return WebRTC.instance;
        }

        // Store the instance
        WebRTC.instance = this;
        console.log('WebRTC singleton created');
    }

    init(updateConnectionStatus, updateParticipantsList, persistMessage, displayMessage) {
        log('Starting WebRTC connection setup...');

        // Create WebSocket connection to signaling server. These RTC_ vars are defined by the HTML where the values
        // in the HTML are injected by the server by substitution.
        let socketUrl = 'ws://' + RTC_HOST + ':' + RTC_PORT;
        console.log('Connecting to signaling server at ' + socketUrl);
        this.signalingSocket = new WebSocket(socketUrl);

        this.signalingSocket.onopen = () => {
            log('Connected to signaling server.');
            this.isSignalConnected = true;
            updateConnectionStatus();

            // Join a room with user name
            this.signalingSocket.send(JSON.stringify({
                type: 'join',
                room: this.roomId,
                name: this.userName
            }));
            log('Joining room: ' + this.roomId + ' as ' + this.userName);
        };

        this.signalingSocket.onmessage = (event) => {
            const message = JSON.parse(event.data);

            // Handle room information (received when joining)
            if (message.type === 'room-info') {
                log('Room info received with participants: ' + message.participants.join(', '));

                // Update our list of participants
                this.participants = new Set(message.participants);
                updateParticipantsList();

                // For each participant, create a peer connection and make an offer
                message.participants.forEach(participant => {
                    if (!this.peerConnections.has(participant)) {
                        this.createPeerConnection(participant, true, updateConnectionStatus, persistMessage, displayMessage);
                    }
                });
            }

            // Handle user joined event
            else if (message.type === 'user-joined') {
                log('User joined: ' + message.name);
                this.participants.add(message.name);
                updateParticipantsList();

                messageData = createMessage(message.name + ' joined the chat', 'system');
                displayMessage(messageData);

                // Create a connection with the new user (we are initiator)
                if (!this.peerConnections.has(message.name)) {
                    this.createPeerConnection(message.name, true, updateConnectionStatus, persistMessage, displayMessage);
                }
            }

            // Handle user left event
            else if (message.type === 'user-left') {
                log('User left: ' + message.name);
                this.participants.delete(message.name);
                updateParticipantsList();

                messageData = createMessage(message.name + ' left the chat', 'system');
                displayMessage(messageData);

                // Clean up connections
                if (this.peerConnections.has(message.name)) {
                    this.peerConnections.get(message.name).close();
                    this.peerConnections.delete(message.name);
                }

                if (this.dataChannels.has(message.name)) {
                    this.dataChannels.delete(message.name);
                }

                updateConnectionStatus();
            }

            // Handle WebRTC signaling messages
            else if (message.type === 'offer' && message.sender) {
                log('Received offer from ' + message.sender);

                // Create a connection if it doesn't exist
                let pc;
                if (!this.peerConnections.has(message.sender)) {
                    pc = this.createPeerConnection(message.sender, false, updateConnectionStatus, persistMessage, displayMessage);
                } else {
                    pc = this.peerConnections.get(message.sender);
                }

                pc.setRemoteDescription(new RTCSessionDescription(message.offer))
                    .then(() => pc.createAnswer())
                    .then(answer => pc.setLocalDescription(answer))
                    .then(() => {
                        this.signalingSocket.send(JSON.stringify({
                            type: 'answer',
                            answer: pc.localDescription,
                            target: message.sender,
                            room: this.roomId
                        }));
                        log('Sent answer to ' + message.sender);
                    })
                    .catch(error => log('Error creating answer: ' + error));
            }

            else if (message.type === 'answer' && message.sender) {
                log('Received answer from ' + message.sender);
                if (this.peerConnections.has(message.sender)) {
                    this.peerConnections.get(message.sender)
                        .setRemoteDescription(new RTCSessionDescription(message.answer))
                        .catch(error => log('Error setting remote description: ' + error));
                }
            }

            else if (message.type === 'ice-candidate' && message.sender) {
                log('Received ICE candidate from ' + message.sender);
                if (this.peerConnections.has(message.sender)) {
                    this.peerConnections.get(message.sender)
                        .addIceCandidate(new RTCIceCandidate(message.candidate))
                        .catch(error => log('Error adding ICE candidate: ' + error));
                }
            }

            // Handle broadcast messages
            else if (message.type === 'broadcast' && message.sender) {
                log('broadcast. Received broadcast message from ' + message.sender);
                persistMessage(message.messageData);
                displayMessage(message.messageData);
            }
        };

        this.signalingSocket.onerror = (error) => {
            log('WebSocket error: ' + error);
            this.isSignalConnected = false;
            updateConnectionStatus();
        };

        this.signalingSocket.onclose = () => {
            log('Disconnected from signaling server');
            this.isSignalConnected = false;

            // Clean up all connections
            this.peerConnections.forEach(pc => pc.close());
            this.peerConnections.clear();
            this.dataChannels.clear();

            updateConnectionStatus();
        };
    }

    createPeerConnection(peerName, isInitiator, updateConnectionStatus, persistMessage, displayMessage) {
        log('Creating peer connection with ' + peerName + (isInitiator ? ' (as initiator)' : ''));

        const pc = new RTCPeerConnection();
        this.peerConnections.set(peerName, pc);

        // Set up ICE candidate handling
        pc.onicecandidate = event => {
            if (event.candidate) {
                this.signalingSocket.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    target: peerName,
                    room: this.roomId
                }));
                log('Sent ICE candidate to ' + peerName);
            }
        };

        // Connection state changes
        pc.onconnectionstatechange = () => {
            log('Connection state with ' + peerName + ': ' + pc.connectionState);
            if (pc.connectionState === 'connected') {
                log('WebRTC connected with ' + peerName + '!');
                updateConnectionStatus();
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                log('WebRTC disconnected from ' + peerName);
                updateConnectionStatus();
            }
        };

        // Handle incoming data channels
        pc.ondatachannel = event => {
            log('Received data channel from ' + peerName);
            this.setupDataChannel(event.channel, peerName, updateConnectionStatus, persistMessage, displayMessage);
        };

        // If we're the initiator, create a data channel
        if (isInitiator) {
            try {
                log('Creating data channel as initiator for ' + peerName);
                const channel = pc.createDataChannel('chat');
                this.setupDataChannel(channel, peerName, updateConnectionStatus, persistMessage, displayMessage);

                // Create and send offer
                pc.createOffer()
                    .then(offer => pc.setLocalDescription(offer))
                    .then(() => {
                        this.signalingSocket.send(JSON.stringify({
                            type: 'offer',
                            offer: pc.localDescription,
                            target: peerName,
                            room: this.roomId
                        }));
                        log('Sent offer to ' + peerName);
                    })
                    .catch(error => log('Error creating offer: ' + error));
            } catch (err) {
                log('Error creating data channel: ' + err);
            }
        }

        return pc;
    }

    // Underscore at front of method indicates it's permanently locked to 'this' and thus callable from event handlers.
    _connect = (displayRoomHistory, updateConnectionStatus, updateParticipantsList, persistMessage, displayMessage) => {
        // todo-0: pass name in as arg
        const usernameInput = document.getElementById('username');
        const name = usernameInput.value.trim();

        // Get the room ID from the input field (todo-0: make this stuff an arg)
        const roomInput = document.getElementById('roomId');
        const newRoomId = roomInput.value.trim() || 'default-room';

        if (name) {
            const oldName = this.userName;
            this.userName = name;
            this.roomId = newRoomId; // Set the room ID from the input

            // Save username and room to localStorage
            localStorage.setItem('ezchat_username', this.userName);
            localStorage.setItem('ezchat_room', this.roomId);

            log('Name changed from ' + oldName + ' to ' + this.userName);
            log('Joining room: ' + this.roomId);

            // Display message history for this room
            displayRoomHistory(this.roomId);

            // If already connected, reset connection with new name and room
            if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
                // Clean up all connections
                this.peerConnections.forEach(pc => pc.close());
                this.peerConnections.clear();
                this.dataChannels.clear();

                // Rejoin with new name and room
                this.signalingSocket.send(JSON.stringify({
                    type: 'join',
                    room: this.roomId,
                    name: this.userName
                }));
                log('Joining room: ' + this.roomId + ' as ' + this.userName);
            } else {
                // Initialize connection with new name
                this.init(updateConnectionStatus, updateParticipantsList, persistMessage, displayMessage);
            }

            // Disable inputs and enable disconnect
            // todo-0: need a 'stateChange' method for handling all kinds of stuff like this
            roomInput.disabled = true;
            usernameInput.disabled = true;
            document.getElementById('connectButton').disabled = true;
            document.getElementById('disconnectButton').disabled = false;
            document.getElementById('clearButton').disabled = false;
        }
    }

    setupDataChannel(channel, peerName, updateConnectionStatus, persistMessage, displayMessage) {
        log('Setting up data channel for ' + peerName);
    
        this.dataChannels.set(peerName, channel);
    
        channel.onopen = () => {
            log('Data channel open with ' + peerName);
            updateConnectionStatus();
        };
    
        channel.onclose = () => {
            log('Data channel closed with ' + peerName);
            this.dataChannels.delete(peerName);
            updateConnectionStatus();
        };
    
        channel.onmessage = (event) => {
            log('onMessage. Received message from ' + peerName);
            try {
                const messageData = JSON.parse(event.data);
                persistMessage(messageData);
                displayMessage(messageData);
            } catch (error) {
                log('Error parsing message: ' + error);
            }
        };
    
        channel.onerror = (error) => {
            log('Data channel error with ' + peerName + ': ' + error);
            updateConnectionStatus();
        };
    }
}

export default WebRTC;