import { log } from './util.js';
import WebRTC from './web-rtc.js';

const rtc = new WebRTC();

// Message storage and persistence functions
function saveRoomMessages(roomId, messages) {
    try {
        // Get existing room data or create a new room object
        const roomData = {
            messages,
            lastUpdated: new Date().toISOString()
        };

        // Save to localStorage with room ID as key
        localStorage.setItem('ezchat_room_' + roomId, JSON.stringify(roomData));
        log('Saved ' + messages.length + ' messages for room: ' + roomId);
    } catch (error) {
        log('Error saving messages to localStorage: ' + error);
    }
}

function loadRoomMessages(roomId) {
    try {
        const roomDataStr = localStorage.getItem('ezchat_room_' + roomId);
        if (roomDataStr) {
            const roomData = JSON.parse(roomDataStr);
            log('Loaded ' + roomData.messages.length + ' messages for room: ' + roomId);
            return roomData.messages || [];
        }
    } catch (error) {
        log('Error loading messages from localStorage: ' + error);
    }
    return [];
}

// Load and display all messages for a room
function displayRoomHistory(roomId) {
    const messages = loadRoomMessages(roomId);

    // Clear the current chat log
    const chatLog = document.getElementById('chatLog');
    chatLog.innerHTML = '';

    // Display system message about history
    if (messages.length > 0) {
        const systemMsg = document.createElement('div');
        systemMsg.classList.add('message', 'system');
        systemMsg.textContent = 'Loading message history...';
        chatLog.appendChild(systemMsg);


        messages.forEach(msg => {
            // print the message to the console
            console.log('Message from ' + msg.sender + ': ' + msg.content + ' at ' + msg.timestamp);
            if (msg.attachments && msg.attachments.length > 0) {
                console.log('Message has ' + msg.attachments.length + ' attachment(s)');
            }

            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message');

            if (msg.sender === rtc.userName) {
                messageDiv.classList.add('local');

                const senderSpan = document.createElement('span');
                senderSpan.textContent = 'You: ';
                messageDiv.appendChild(senderSpan);
            } else {
                messageDiv.classList.add('remote');

                const senderSpan = document.createElement('span');
                senderSpan.textContent = msg.sender + ': ';
                messageDiv.appendChild(senderSpan);
            }

            const messageContent = document.createElement('div');
            messageContent.classList.add('message-content');

            // Render markdown content if there's any text
            if (msg.content && msg.content.trim() !== '') {
                // allow marked to have failed to load, and fall back to just text.
                messageContent.innerHTML = renderContent(msg.content);
            }

            // Handle attachments if any
            if (msg.attachments && msg.attachments.length > 0) {
                const attachmentsDiv = document.createElement('div');
                attachmentsDiv.classList.add('attachments');

                msg.attachments.forEach(attachment => {
                    if (attachment.type.startsWith('image/')) {
                        // Display image inline
                        const img = document.createElement('img');
                        img.src = attachment.data;
                        img.alt = attachment.name;
                        img.classList.add('attachment-image');
                        img.style.maxWidth = '250px';
                        img.style.cursor = 'pointer';
                        img.title = "Click to view full size"; // Add a tooltip

                        // Add this inside displayRoomHistory function where we set up the image click event:
                        img.addEventListener('click', (event) => {
                            event.preventDefault(); // Prevent browser's default action
                            event.stopPropagation(); // Stop event from bubbling up
                            openImageViewer(attachment.data, attachment.name);
                            return false; // Belt and suspenders approach for older browsers
                        });

                        attachmentsDiv.appendChild(img);
                    } else {
                        // Create a download link for non-image files
                        const fileLink = document.createElement('div');
                        fileLink.classList.add('file-attachment');

                        const icon = document.createElement('span');
                        icon.textContent = '📄 ';

                        const link = document.createElement('a');
                        link.href = attachment.data;
                        link.download = attachment.name;
                        link.textContent = `${attachment.name} (${formatFileSize(attachment.size)})`;

                        fileLink.appendChild(icon);
                        fileLink.appendChild(link);
                        attachmentsDiv.appendChild(fileLink);
                    }
                });

                messageContent.appendChild(attachmentsDiv);
            }

            messageDiv.appendChild(messageContent);
            chatLog.appendChild(messageDiv);
        });

        const endMsg = document.createElement('div');
        endMsg.classList.add('message', 'system');
        endMsg.textContent = 'End of message history';
        chatLog.appendChild(endMsg);
    } else {
        const noHistoryMsg = document.createElement('div');
        noHistoryMsg.classList.add('message', 'system');
        noHistoryMsg.textContent = 'No message history for this room';
        chatLog.appendChild(noHistoryMsg);
    }

    // Scroll to bottom
    chatLog.scrollTop = chatLog.scrollHeight;
}

function clearChatHistory() {
    if (confirm(`Are you sure you want to clear all chat history for room "${rtc.roomId}"?`)) {
        // Remove the localStorage item for this room
        localStorage.removeItem('ezchat_room_' + rtc.roomId);

        // Clear the chat log display
        const chatLog = document.getElementById('chatLog');
        chatLog.innerHTML = '';

        // Display a system message
        const systemMsg = document.createElement('div');
        systemMsg.classList.add('message', 'system');
        systemMsg.textContent = 'Chat history has been cleared';
        chatLog.appendChild(systemMsg);

        log('Cleared chat history for room: ' + rtc.roomId);
    }
}

function updateParticipantsList() {
    const list = document.getElementById('participantsList');
    if (rtc.participants.size === 0) {
        list.textContent = 'EzChat: No participants yet';
    } else {
        list.textContent = 'EzChat with: ' + Array.from(rtc.participants).join(', ');
    }
}

function renderContent(content) {
    return (typeof marked !== 'undefined')
        ? marked.parse(content)
        : content.replace(/\n/g, '<br>')
}

function updateConnectionStatus() {
    // Enable input if we have at least one open data channel or we're connected to the signaling server
    const hasOpenChannel = Array.from(rtc.dataChannels.values()).some(channel => channel.readyState === 'open');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const attachButton = document.getElementById('attachButton');

    if (hasOpenChannel || rtc.isSignalConnected) {
        messageInput.disabled = false;
        sendButton.disabled = false;
        attachButton.disabled = false;
        document.getElementById('connectionStatus').textContent = hasOpenChannel ?
            'Connected via WebRTC' : 'Connected via server';
    } else {
        messageInput.disabled = true;
        sendButton.disabled = true;
        attachButton.disabled = true;
        document.getElementById('connectionStatus').textContent = 'Disconnected';
    }
}

function createPeerConnection(peerName, isInitiator) {
    log('Creating peer connection with ' + peerName + (isInitiator ? ' (as initiator)' : ''));

    // Create a new peer connection for this peer
    const pc = new RTCPeerConnection();

    rtc.peerConnections.set(peerName, pc);

    // Set up ICE candidate handling
    pc.onicecandidate = event => {
        if (event.candidate) {
            rtc.signalingSocket.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate,
                target: peerName,
                room: rtc.roomId
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
        setupDataChannel(event.channel, peerName);
    };

    // If we're the initiator, create a data channel
    if (isInitiator) {
        try {
            log('Creating data channel as initiator for ' + peerName);
            const channel = pc.createDataChannel('chat');
            setupDataChannel(channel, peerName);

            // Create and send offer
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    rtc.signalingSocket.send(JSON.stringify({
                        type: 'offer',
                        offer: pc.localDescription,
                        target: peerName,
                        room: rtc.roomId
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

function setupDataChannel(channel, peerName) {
    log('Setting up data channel for ' + peerName);

    rtc.dataChannels.set(peerName, channel);

    channel.onopen = function () {
        log('Data channel open with ' + peerName);
        updateConnectionStatus();
    };

    channel.onclose = function () {
        log('Data channel closed with ' + peerName);
        rtc.dataChannels.delete(peerName);
        updateConnectionStatus();
    };

    channel.onmessage = function (event) {
        log('onMessage. Received message from ' + peerName);
        try {
            const messageData = JSON.parse(event.data);
            persistMessage(messageData);
            displayMessage(messageData);
        } catch (error) {
            log('Error parsing message: ' + error);
        }
    };

    channel.onerror = function (error) {
        log('Data channel error with ' + peerName + ': ' + error);
        updateConnectionStatus();
    };
}

function initWebRTC() {
    log('Starting WebRTC connection setup...');

    // Create WebSocket connection to signaling server. These RTC_ vars are defined by the HTML where the values
    // in the HTML are injected by the server by substitution.
    let socketUrl = 'ws://' + RTC_HOST + ':' + RTC_PORT;
    console.log('Connecting to signaling server at ' + socketUrl);
    rtc.signalingSocket = new WebSocket(socketUrl);

    rtc.signalingSocket.onopen = function () {
        log('Connected to signaling server.');
        rtc.isSignalConnected = true;
        updateConnectionStatus();

        // Join a room with user name
        rtc.signalingSocket.send(JSON.stringify({
            type: 'join',
            room: rtc.roomId,
            name: rtc.userName
        }));
        log('Joining room: ' + rtc.roomId + ' as ' + rtc.userName);
    };

    rtc.signalingSocket.onmessage = function (event) {
        const message = JSON.parse(event.data);

        // Handle room information (received when joining)
        if (message.type === 'room-info') {
            log('Room info received with participants: ' + message.participants.join(', '));

            // Update our list of participants
            rtc.participants = new Set(message.participants);
            updateParticipantsList();

            // For each participant, create a peer connection and make an offer
            message.participants.forEach(participant => {
                if (!rtc.peerConnections.has(participant)) {
                    createPeerConnection(participant, true);
                }
            });
        }

        // Handle user joined event
        else if (message.type === 'user-joined') {
            log('User joined: ' + message.name);
            rtc.participants.add(message.name);
            updateParticipantsList();

            messageData = createMessage(message.name + ' joined the chat', 'system');
            displayMessage(messageData);

            // Create a connection with the new user (we are initiator)
            if (!rtc.peerConnections.has(message.name)) {
                createPeerConnection(message.name, true);
            }
        }

        // Handle user left event
        else if (message.type === 'user-left') {
            log('User left: ' + message.name);
            rtc.participants.delete(message.name);
            updateParticipantsList();

            messageData = createMessage(message.name + ' left the chat', 'system');
            displayMessage(messageData);

            // Clean up connections
            if (rtc.peerConnections.has(message.name)) {
                rtc.peerConnections.get(message.name).close();
                rtc.peerConnections.delete(message.name);
            }

            if (rtc.dataChannels.has(message.name)) {
                rtc.dataChannels.delete(message.name);
            }

            updateConnectionStatus();
        }

        // Handle WebRTC signaling messages
        else if (message.type === 'offer' && message.sender) {
            log('Received offer from ' + message.sender);

            // Create a connection if it doesn't exist
            let pc;
            if (!rtc.peerConnections.has(message.sender)) {
                pc = createPeerConnection(message.sender, false);
            } else {
                pc = rtc.peerConnections.get(message.sender);
            }

            pc.setRemoteDescription(new RTCSessionDescription(message.offer))
                .then(() => pc.createAnswer())
                .then(answer => pc.setLocalDescription(answer))
                .then(() => {
                    rtc.signalingSocket.send(JSON.stringify({
                        type: 'answer',
                        answer: pc.localDescription,
                        target: message.sender,
                        room: rtc.roomId
                    }));
                    log('Sent answer to ' + message.sender);
                })
                .catch(error => log('Error creating answer: ' + error));
        }

        else if (message.type === 'answer' && message.sender) {
            log('Received answer from ' + message.sender);
            if (rtc.peerConnections.has(message.sender)) {
                rtc.peerConnections.get(message.sender)
                    .setRemoteDescription(new RTCSessionDescription(message.answer))
                    .catch(error => log('Error setting remote description: ' + error));
            }
        }

        else if (message.type === 'ice-candidate' && message.sender) {
            log('Received ICE candidate from ' + message.sender);
            if (rtc.peerConnections.has(message.sender)) {
                rtc.peerConnections.get(message.sender)
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

    rtc.signalingSocket.onerror = function (error) {
        log('WebSocket error: ' + error);
        rtc.isSignalConnected = false;
        updateConnectionStatus();
    };

    rtc.signalingSocket.onclose = function () {
        log('Disconnected from signaling server');
        rtc.isSignalConnected = false;

        // Clean up all connections
        rtc.peerConnections.forEach(pc => pc.close());
        rtc.peerConnections.clear();
        rtc.dataChannels.clear();

        updateConnectionStatus();
    };
}

// Send message function
function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (message || rtc.selectedFiles.length > 0) {
        log('Sending message with ' + rtc.selectedFiles.length + ' attachment(s)');

        const messageData = createMessage(message, rtc.userName, rtc.selectedFiles);
        persistMessage(messageData);
        displayMessage(messageData);

        // Try to send through data channels first
        let channelsSent = 0;
        rtc.dataChannels.forEach((channel, peer) => {
            if (channel.readyState === 'open') {
                channel.send(JSON.stringify(messageData));
                channelsSent++;
            }
        });

        // If no channels are ready or no peers, send through signaling server
        if ((channelsSent === 0 || rtc.participants.size === 0) &&
            rtc.signalingSocket && rtc.signalingSocket.readyState === WebSocket.OPEN) {
            rtc.signalingSocket.send(JSON.stringify({
                type: 'broadcast',
                messageData,
                room: rtc.roomId
            }));
            log('Sent message via signaling server');
        }

        input.value = '';
        clearAttachments();
    }
}

function createMessage(content, sender, attachments = []) {
    const messageData = {
        timestamp: new Date().toISOString(),
        sender,
        content,
        attachments: attachments || []
    };
    return messageData;
}

function persistMessage(messageData) {
    // Get current messages, add new one, and save
    // todo-0: need to only READ messages one time.
    const messages = loadRoomMessages(rtc.roomId);

    // messages will be objects having timestamp, sender, and content
    // We need to scan all 'messages' and if the message is already there, we return from this method
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].timestamp === messageData.timestamp && //
            messages[i].sender === messageData.sender && //
            messages[i].content === messageData.content) {
            return false; // Message already exists, do not save again
        }
    }

    messages.push(messageData);
    saveRoomMessages(rtc.roomId, messages);
    return true;
}

function connect() {
    const usernameInput = document.getElementById('username');
    const name = usernameInput.value.trim();

    // Get the room ID from the input field
    const roomInput = document.getElementById('roomId');
    const newRoomId = roomInput.value.trim() || 'default-room';

    if (name) {
        const oldName = rtc.userName;
        rtc.userName = name;
        rtc.roomId = newRoomId; // Set the room ID from the input

        // Save username and room to localStorage
        localStorage.setItem('ezchat_username', rtc.userName);
        localStorage.setItem('ezchat_room', rtc.roomId);

        log('Name changed from ' + oldName + ' to ' + rtc.userName);
        log('Joining room: ' + rtc.roomId);

        // Display message history for this room
        displayRoomHistory(rtc.roomId);

        // If already connected, reset connection with new name and room
        if (rtc.signalingSocket && rtc.signalingSocket.readyState === WebSocket.OPEN) {
            // Clean up all connections
            rtc.peerConnections.forEach(pc => pc.close());
            rtc.peerConnections.clear();
            rtc.dataChannels.clear();

            // Rejoin with new name and room
            rtc.signalingSocket.send(JSON.stringify({
                type: 'join',
                room: rtc.roomId,
                name: rtc.userName
            }));
            log('Joining room: ' + rtc.roomId + ' as ' + rtc.userName);
        } else {
            // Initialize connection with new name
            initWebRTC();
        }

        // Disable inputs and enable disconnect
        roomInput.disabled = true;
        usernameInput.disabled = true;
        document.getElementById('connectButton').disabled = true;
        document.getElementById('disconnectButton').disabled = false;
        document.getElementById('clearButton').disabled = false;
    }
}

// Initialize the form with saved values when page loads
function initForm() {
    // Set the input fields with the values from localStorage
    const usernameInput = document.getElementById('username');
    const roomInput = document.getElementById('roomId');

    document.getElementById('clearButton').disabled = true;

    usernameInput.value = rtc.userName;
    roomInput.value = rtc.roomId;
}

// Convert file to base64 for storage
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            data: reader.result
        });
        reader.onerror = error => reject(error);
    });
}

function handleFileSelect() {
    const fileInput = document.getElementById('fileInput');
    fileInput.click();
}

// File input change handler
async function handleFiles() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length > 0) {
        rtc.selectedFiles = [];

        // Convert files to the format we need
        for (let i = 0; i < fileInput.files.length; i++) {
            try {
                const fileData = await fileToBase64(fileInput.files[i]);
                rtc.selectedFiles.push(fileData);
            } catch (error) {
                log('Error processing file: ' + error);
            }
        }

        // Update UI to show files are attached
        const attachButton = document.getElementById('attachButton');
        attachButton.textContent = `📎(${rtc.selectedFiles.length})`;
        attachButton.title = `${rtc.selectedFiles.length} file(s) attached`;
    }
}

// Clear attachments after sending
function clearAttachments() {
    rtc.selectedFiles = [];
    const attachButton = document.getElementById('attachButton');
    attachButton.textContent = '📎';
    attachButton.title = 'Attach files';
    const fileInput = document.getElementById('fileInput');
    fileInput.value = '';
}

// Modified display message function to handle attachments
function displayMessage(messageData) {
    console.log("(B) Displaying message from " + messageData.sender + ": " + messageData.content);
    const chatLog = document.getElementById('chatLog');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');

    if (messageData.sender === 'system') {
        messageDiv.classList.add('system');
        messageDiv.textContent = messageData.content;
    } else {
        // Create container for rendered markdown
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');

        if (messageData.sender === rtc.userName) {
            messageDiv.classList.add('local');

            // Add sender prefix
            const senderSpan = document.createElement('span');
            senderSpan.textContent = 'You: ';
            messageDiv.appendChild(senderSpan);
        } else {
            messageDiv.classList.add('remote');

            // Add sender prefix
            const senderSpan = document.createElement('span');
            senderSpan.textContent = messageData.sender + ': ';
            messageDiv.appendChild(senderSpan);
        }

        // Render markdown content if there's any text message
        if (messageData.content && messageData.content.trim() !== '') {
            messageContent.innerHTML = renderContent(messageData.content);
        }

        // Handle attachments if any
        if (messageData.attachments && messageData.attachments.length > 0) {
            const attachmentsDiv = document.createElement('div');
            attachmentsDiv.classList.add('attachments');

            messageData.attachments.forEach(attachment => {
                if (attachment.type.startsWith('image/')) {
                    // Display image inline
                    const imgContainer = document.createElement('div');
                    imgContainer.classList.add('attachment-container');

                    const img = document.createElement('img');
                    img.src = attachment.data;
                    img.alt = attachment.name;
                    img.classList.add('attachment-image');
                    img.style.maxWidth = '250px';
                    img.style.cursor = 'pointer';
                    img.title = "Click to view full size";

                    // View full size on click
                    img.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openImageViewer(attachment.data, attachment.name);
                        return false;
                    });

                    // Add download button for images
                    const downloadBtn = document.createElement('button');
                    downloadBtn.classList.add('download-button', 'image-download');
                    downloadBtn.innerHTML = '⬇️';
                    downloadBtn.title = `Download ${attachment.name}`;
                    downloadBtn.onclick = function (event) {
                        event.stopPropagation();
                        downloadAttachment(attachment.data, attachment.name);
                    };

                    imgContainer.appendChild(img);
                    imgContainer.appendChild(downloadBtn);
                    attachmentsDiv.appendChild(imgContainer);
                } else {
                    // Create a download button for non-image files
                    const fileContainer = document.createElement('div');
                    fileContainer.classList.add('file-attachment');

                    const fileIcon = document.createElement('span');
                    fileIcon.textContent = '📄 ';
                    fileContainer.appendChild(fileIcon);

                    const fileName = document.createElement('span');
                    fileName.textContent = `${attachment.name} (${formatFileSize(attachment.size)})`;
                    fileContainer.appendChild(fileName);

                    const downloadButton = document.createElement('button');
                    downloadButton.classList.add('download-button');
                    downloadButton.textContent = 'Download';
                    downloadButton.title = `Download ${attachment.name}`;
                    downloadButton.onclick = function () {
                        downloadAttachment(attachment.data, attachment.name);
                    };

                    fileContainer.appendChild(downloadButton);
                    attachmentsDiv.appendChild(fileContainer);
                }
            });

            messageContent.appendChild(attachmentsDiv);
        }

        messageDiv.appendChild(messageContent);
    }

    chatLog.appendChild(messageDiv);
    chatLog.scrollTop = chatLog.scrollHeight;
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// Add this function to create and manage the image viewer modal
function createImageViewerModal() {
    // Create modal elements if they don't exist
    if (!document.getElementById('image-viewer-modal')) {
        const modal = document.createElement('div');
        modal.id = 'image-viewer-modal';
        modal.classList.add('image-viewer-modal');

        const modalContent = document.createElement('div');
        modalContent.classList.add('modal-content');

        const closeBtn = document.createElement('span');
        closeBtn.classList.add('close-modal');
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Close (Esc)';
        closeBtn.onclick = closeImageViewer;

        const imageElement = document.createElement('img');
        imageElement.id = 'modal-image';
        imageElement.classList.add('modal-image');

        modalContent.appendChild(closeBtn);
        modalContent.appendChild(imageElement);
        modal.appendChild(modalContent);

        // Add click handler to close when clicking outside the image
        modal.addEventListener('click', function (event) {
            if (event.target === modal) {
                closeImageViewer();
            }
        });

        // Add keyboard handler for Escape key
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && modal.style.display === 'flex') {
                closeImageViewer();
            }
        });

        document.body.appendChild(modal);
    }
}

// Function to open the image viewer
function openImageViewer(imageSrc, altText) {
    createImageViewerModal(); // Ensure modal exists

    const modal = document.getElementById('image-viewer-modal');
    const modalImg = document.getElementById('modal-image');

    modalImg.src = imageSrc;
    modalImg.alt = altText || 'Full-size image';

    // Display the modal with a fade-in effect
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);
}

// Function to close the image viewer
function closeImageViewer() {
    const modal = document.getElementById('image-viewer-modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300); // Match this with CSS transition duration
    }
}

function disconnect() {
    // Close the signaling socket
    if (rtc.signalingSocket && rtc.signalingSocket.readyState === WebSocket.OPEN) {
        rtc.signalingSocket.close();
    }

    // Clean up all connections
    rtc.peerConnections.forEach(pc => pc.close());
    rtc.peerConnections.clear();
    rtc.dataChannels.clear();

    // Reset participants
    rtc.participants.clear();
    updateParticipantsList();

    // Clear the chat log
    const chatLog = document.getElementById('chatLog');
    chatLog.innerHTML = '';

    // Re-enable form inputs
    document.getElementById('username').disabled = false;
    document.getElementById('roomId').disabled = false;
    document.getElementById('connectButton').disabled = false;
    document.getElementById('disconnectButton').disabled = true;
    document.getElementById('clearButton').disabled = true;

    // Disable message controls
    document.getElementById('messageInput').disabled = true;
    document.getElementById('sendButton').disabled = true;
    document.getElementById('attachButton').disabled = true;

    // Reset connection status
    rtc.isSignalConnected = false;
    updateConnectionStatus();
    document.getElementById('connectionStatus').textContent = 'Disconnected';

    // Clear any selected files
    clearAttachments();

    log('Disconnected from chat');
}

// Function to handle downloading a file attachment
function downloadAttachment(dataUrl, fileName) {
    // Create a temporary anchor element
    const downloadLink = document.createElement('a');
    downloadLink.href = dataUrl;
    downloadLink.download = fileName;

    // Append to body, trigger click, then remove
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

function initApp() {
    // Event listeners
    document.getElementById('connectButton').addEventListener('click', connect);
    document.getElementById('disconnectButton').addEventListener('click', disconnect);
    document.getElementById('sendButton').addEventListener('click', sendMessage);
    document.getElementById('attachButton').addEventListener('click', handleFileSelect);
    document.getElementById('fileInput').addEventListener('change', handleFiles);
    document.getElementById('clearButton').addEventListener('click', clearChatHistory);

    // Initialize the form when page loads
    initForm();
}

document.addEventListener('DOMContentLoaded', function () {
    console.log("calling initApp")
    initApp();
});