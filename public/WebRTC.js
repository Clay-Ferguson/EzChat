import Utils from './Util.js';
const util = Utils.getInst();

/**
 * WebRTC class for handling WebRTC connections
 * Designed as a singleton that can be instantiated once and reused
 * 
 * todo-0: We're in the of a refactor right now, where DOM manipulation code was dragged into this class
 * but we'll be removing that and making this a clean class that just handles WebRTC connections.
 */
class WebRTC {
    peerConnections = new Map();
    dataChannels = new Map();
    socket = null;
    roomId = "";
    userName = "";
    participants = new Set();
    isSignalConnected = false;
    storage = null;
    app = null;

    constructor() {
        console.log('WebRTC singleton created');
    }

    // New static factory method to replace async constructor
    static async getInst(storage, app) {
        // Create instance if it doesn't exist
        if (!WebRTC.inst) {
            WebRTC.inst = new WebRTC();
            await WebRTC.inst.init(storage, app);
        }

        return WebRTC.inst;
    }

    async init(storage, app) {
        this.storage = storage;
        this.app = app;

        this.roomId = await WebRTC.inst.storage.getItem('ezchat_room');
        if (!this.roomId) {
            this.roomId = '';
        }
        this.userName = await WebRTC.inst.storage.getItem('ezchat_username');
        if (!this.userName) {
            this.userName = '';
        }
    }

    initRTC() {
        util.log('Starting WebRTC connection setup...');

        // Create WebSocket connection to signaling server. These RTC_ vars are defined by the HTML where the values
        // in the HTML are injected by the server by substitution.
        let socketUrl = 'ws://' + RTC_HOST + ':' + RTC_PORT;
        console.log('Connecting to signaling server at ' + socketUrl);
        this.socket = new WebSocket(socketUrl);

        this.socket.onopen = () => {
            util.log('Connected to signaling server.');
            this.isSignalConnected = true;
            this.app._updateConnectionStatus();

            // Join a room with user name
            this.socket.send(JSON.stringify({
                type: 'join',
                room: this.roomId,
                name: this.userName
            }));
            util.log('Joining room: ' + this.roomId + ' as ' + this.userName);
        };

        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);

            // Handle room information (received when joining)
            if (message.type === 'room-info') {
                util.log('Room info received with participants: ' + message.participants.join(', '));

                // Update our list of participants
                this.participants = new Set(message.participants);
                this.app._updateParticipantsList();

                // For each participant, create a peer connection and make an offer
                message.participants.forEach(participant => {
                    if (!this.peerConnections.has(participant)) {
                        this.createPeerConnection(participant, true);
                    }
                });
            }

            // Handle user joined event
            else if (message.type === 'user-joined') {
                util.log('User joined: ' + message.name);
                this.participants.add(message.name);
                this.app._updateParticipantsList();

                // todo-: these messages are not being displayed
                const messageData = this.createMessage(message.name + ' joined the chat', 'system');
                this.app._displayMessage(messageData);

                // Create a connection with the new user (we are initiator)
                if (!this.peerConnections.has(message.name)) {
                    this.createPeerConnection(message.name, true);
                }
            }

            // Handle user left event
            else if (message.type === 'user-left') {
                util.log('User left: ' + message.name);
                this.participants.delete(message.name);
                this.app._updateParticipantsList();

                const messageData = this.createMessage(message.name + ' left the chat', 'system');
                this.app._displayMessage(messageData);

                // Clean up connections
                if (this.peerConnections.has(message.name)) {
                    this.peerConnections.get(message.name).close();
                    this.peerConnections.delete(message.name);
                }

                if (this.dataChannels.has(message.name)) {
                    this.dataChannels.delete(message.name);
                }

                this.app._updateConnectionStatus();
            }

            // Handle WebRTC signaling messages
            else if (message.type === 'offer' && message.sender) {
                util.log('Received offer from ' + message.sender);

                // Create a connection if it doesn't exist
                let pc;
                if (!this.peerConnections.has(message.sender)) {
                    pc = this.createPeerConnection(message.sender, false);
                } else {
                    pc = this.peerConnections.get(message.sender);
                }

                pc.setRemoteDescription(new RTCSessionDescription(message.offer))
                    .then(() => pc.createAnswer())
                    .then(answer => pc.setLocalDescription(answer))
                    .then(() => {
                        this.socket.send(JSON.stringify({
                            type: 'answer',
                            answer: pc.localDescription,
                            target: message.sender,
                            room: this.roomId
                        }));
                        util.log('Sent answer to ' + message.sender);
                    })
                    .catch(error => util.log('Error creating answer: ' + error));
            }

            else if (message.type === 'answer' && message.sender) {
                util.log('Received answer from ' + message.sender);
                if (this.peerConnections.has(message.sender)) {
                    this.peerConnections.get(message.sender)
                        .setRemoteDescription(new RTCSessionDescription(message.answer))
                        .catch(error => util.log('Error setting remote description: ' + error));
                }
            }

            else if (message.type === 'ice-candidate' && message.sender) {
                util.log('Received ICE candidate from ' + message.sender);
                if (this.peerConnections.has(message.sender)) {
                    this.peerConnections.get(message.sender)
                        .addIceCandidate(new RTCIceCandidate(message.candidate))
                        .catch(error => util.log('Error adding ICE candidate: ' + error));
                }
            }

            // Handle broadcast messages
            else if (message.type === 'broadcast' && message.sender) {
                util.log('broadcast. Received broadcast message from ' + message.sender);
                this.app._persistMessage(message.messageData);
                this.app._displayMessage(message.messageData);
            }
        };

        this.socket.onerror = (error) => {
            util.log('WebSocket error: ' + error);
            this.isSignalConnected = false;
            this.app._updateConnectionStatus();
        };

        this.socket.onclose = () => {
            util.log('Disconnected from signaling server');
            this.isSignalConnected = false;

            // Clean up all connections
            this.peerConnections.forEach(pc => pc.close());
            this.peerConnections.clear();
            this.dataChannels.clear();

            this.app._updateConnectionStatus();
        };
    }

    createPeerConnection(peerName, isInitiator) {
        util.log('Creating peer connection with ' + peerName + (isInitiator ? ' (as initiator)' : ''));

        const pc = new RTCPeerConnection();
        this.peerConnections.set(peerName, pc);

        // Set up ICE candidate handling
        pc.onicecandidate = event => {
            if (event.candidate) {
                this.socket.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    target: peerName,
                    room: this.roomId
                }));
                util.log('Sent ICE candidate to ' + peerName);
            }
        };

        // Connection state changes
        pc.onconnectionstatechange = () => {
            util.log('Connection state with ' + peerName + ': ' + pc.connectionState);
            if (pc.connectionState === 'connected') {
                util.log('WebRTC connected with ' + peerName + '!');
                this.app._updateConnectionStatus();
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                util.log('WebRTC disconnected from ' + peerName);
                this.app._updateConnectionStatus();
            }
        };

        // Handle incoming data channels
        pc.ondatachannel = event => {
            util.log('Received data channel from ' + peerName);
            this.setupDataChannel(event.channel, peerName);
        };

        // If we're the initiator, create a data channel
        if (isInitiator) {
            try {
                util.log('Creating data channel as initiator for ' + peerName);
                const channel = pc.createDataChannel('chat');
                this.setupDataChannel(channel, peerName);

                // Create and send offer
                pc.createOffer()
                    .then(offer => pc.setLocalDescription(offer))
                    .then(() => {
                        this.socket.send(JSON.stringify({
                            type: 'offer',
                            offer: pc.localDescription,
                            target: peerName,
                            room: this.roomId
                        }));
                        util.log('Sent offer to ' + peerName);
                    })
                    .catch(error => util.log('Error creating offer: ' + error));
            } catch (err) {
                util.log('Error creating data channel: ' + err);
            }
        }
        return pc;
    }

    // Underscore at front of method indicates it's permanently locked to 'this' and thus callable from event handlers.
    _connect = async (userName, roomId) => {
        this.userName = userName;
        this.roomId = roomId;

        await this.storage.setItem('ezchat_username', this.userName);
        await this.storage.setItem('ezchat_room', this.roomId);
        await this.app._displayRoomHistory(this.roomId);

        // If already connected, reset connection with new name and room
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            // Clean up all connections
            this.peerConnections.forEach(pc => pc.close());
            this.peerConnections.clear();
            this.dataChannels.clear();

            // Rejoin with new name and room
            this.socket.send(JSON.stringify({
                type: 'join',
                room: this.roomId,
                name: this.userName
            }));
            util.log('Joining room: ' + this.roomId + ' as ' + this.userName);
        } else {
            // Initialize connection
            this.initRTC();
        }
    }

    _disconnect = () => {
        // Close the signaling socket
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }

        // Clean up all connections
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        this.dataChannels.clear();

        // Reset participants
        this.participants.clear();
        this.isSignalConnected = false;
    }

    setupDataChannel(channel, peerName) {
        util.log('Setting up data channel for ' + peerName);
        this.dataChannels.set(peerName, channel);

        channel.onopen = () => {
            util.log('Data channel open with ' + peerName);
            this.app._updateConnectionStatus();
        };

        channel.onclose = () => {
            util.log('Data channel closed with ' + peerName);
            this.dataChannels.delete(peerName);
            this.app._updateConnectionStatus();
        };

        channel.onmessage = (event) => {
            util.log('onMessage. Received message from ' + peerName);
            try {
                const messageData = JSON.parse(event.data);
                this.app._persistMessage(messageData);
                this.app._displayMessage(messageData);
            } catch (error) {
                util.log('Error parsing message: ' + error);
            }
        };

        channel.onerror = (error) => {
            util.log('Data channel error with ' + peerName + ': ' + error);
            this.app._updateConnectionStatus();
        };
    }

    createMessage(content, sender, attachments = []) {
        const messageData = {
            timestamp: new Date().toISOString(),
            sender,
            content,
            attachments: attachments || []
        };
        return messageData;
    }

    // Send message function (fat arrow makes callable from event handlers)
    _sendMessage = (message, selectedFiles) => {
        if (message || selectedFiles.length > 0) {
            util.log('Sending message with ' + selectedFiles.length + ' attachment(s)');

            const messageData = this.createMessage(message, this.userName, selectedFiles);
            this.app._persistMessage(messageData);
            this.app._displayMessage(messageData);

            // Try to send through data channels first
            let channelsSent = 0;
            this.dataChannels.forEach((channel, peer) => {
                if (channel.readyState === 'open') {
                    channel.send(JSON.stringify(messageData));
                    channelsSent++;
                }
            });

            // If no channels are ready or no peers, send through signaling server
            if ((channelsSent === 0 || this.participants.size === 0) &&
                this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    type: 'broadcast',
                    messageData,
                    room: this.roomId
                }));
                util.log('Sent message via signaling server');
            }
        }
    }
}

export default WebRTC;