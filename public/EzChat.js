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
    document.getElementById('connectButton').addEventListener('click', () => rtc._connect(displayRoomHistory, updateConnectionStatus, updateParticipantsList, persistMessage, displayMessage));
    document.getElementById('disconnectButton').addEventListener('click', disconnect);
    document.getElementById('sendButton').addEventListener('click', () => {
        rtc._sendMessage(persistMessage, displayMessage);
        clearAttachments();
    });
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