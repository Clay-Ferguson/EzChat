import WebRTC from './WebRTC.js';
import IndexedDBStorage from './IndexedDbStorage.js';

import Utils from './Util.js';
const util = Utils.getInst();

class EzChat {
    storage = null;
    rtc = null;

    // Message storage and persistence functions
    saveRoomMessages(roomId, messages) {
        try {
            // Get existing room data or create a new room object
            const roomData = {
                messages,
                lastUpdated: new Date().toISOString()
            };

            this.storage.setItem('ezchat_room_' + roomId, roomData);
            util.log('Saved ' + messages.length + ' messages for room: ' + roomId);
        } catch (error) {
            util.log('Error saving messages: ' + error);
        }
    }

    async loadRoomMessages(roomId) {
        try {
            const roomData = await this.storage.getItem('ezchat_room_' + roomId);
            if (roomData) {
                util.log('Loaded ' + roomData.messages.length + ' messages for room: ' + roomId);
                return roomData.messages || [];
            }
        } catch (error) {
            util.log('Error loading messages from storage: ' + error);
        }
        return [];
    }

    // Load and display all messages for a room
    _displayRoomHistory = async (roomId) => {
        const messages = await this.loadRoomMessages(roomId);

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

                if (msg.sender === this.rtc.userName) {
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
                    messageContent.innerHTML = this.renderContent(msg.content);
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
                                this.openImageViewer(attachment.data, attachment.name);
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

    _clearChatHistory = () => {
        if (confirm(`Are you sure you want to clear all chat history for room "${this.rtc.roomId}"?`)) {
            this.storage.removeItem('ezchat_room_' + this.rtc.roomId);

            // Clear the chat log display
            const chatLog = document.getElementById('chatLog');
            chatLog.innerHTML = '';

            // Display a system message
            const systemMsg = document.createElement('div');
            systemMsg.classList.add('message', 'system');
            systemMsg.textContent = 'Chat history has been cleared';
            chatLog.appendChild(systemMsg);

            util.log('Cleared chat history for room: ' + this.rtc.roomId);
        }
    }

    _updateParticipantsList = () => {
        const list = document.getElementById('participantsList');
        if (this.rtc.participants.size === 0) {
            list.textContent = 'EzChat: No participants yet';
        } else {
            list.textContent = 'EzChat with: ' + Array.from(this.rtc.participants).join(', ');
        }
    }

    renderContent(content) {
        return (typeof marked !== 'undefined')
            ? marked.parse(content)
            : content.replace(/\n/g, '<br>')
    }

    _updateConnectionStatus = () => {
        // Enable input if we have at least one open data channel or we're connected to the signaling server
        const hasOpenChannel = Array.from(this.rtc.dataChannels.values()).some(channel => channel.readyState === 'open');

        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const attachButton = document.getElementById('attachButton');

        if (hasOpenChannel || this.rtc.isSignalConnected) {
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

    _persistMessage = async (messageData) => {
        // Get current messages, add new one, and save
        // todo-0: need to only READ messages one time.
        const messages = await this.loadRoomMessages(this.rtc.roomId);

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
        this.saveRoomMessages(this.rtc.roomId, messages);
        return true;
    }

    // Utility function to get URL parameters
    getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    // Initialize the form with saved values when page loads
    initForm() {
        const usernameInput = document.getElementById('username');
        const roomInput = document.getElementById('roomId');

        document.getElementById('clearButton').disabled = true;

        // Check for 'user' parameter in URL first, fallback to this.rtc.userName
        const userFromUrl = this.getUrlParameter('user');
        usernameInput.value = userFromUrl || this.rtc.userName;

        const roomFromUrl = this.getUrlParameter('room');
        roomInput.value = roomFromUrl || this.rtc.roomId;

        // if userFromUrl and rootFromUrl are both non-empty then wait a half second and then call _connect
        // todo-0: need document this automatic connection in the README
        if (userFromUrl && roomFromUrl) {
            setTimeout(() => {
                this.rtc.userName = usernameInput.value;
                this.rtc.roomId = roomInput.value;
                document.getElementById('connectButton').click();
            }, 500);
        }
    }

    // Convert file to base64 for storage
    fileToBase64(file) {
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

    _handleFileSelect = () => {
        const fileInput = document.getElementById('fileInput');
        fileInput.click();
    }

    // File input change handler
    _handleFiles = async () => {
        const fileInput = document.getElementById('fileInput');
        if (fileInput.files.length > 0) {
            this.rtc.selectedFiles = [];

            // Convert files to the format we need
            for (let i = 0; i < fileInput.files.length; i++) {
                try {
                    const fileData = await this.fileToBase64(fileInput.files[i]);
                    this.rtc.selectedFiles.push(fileData);
                } catch (error) {
                    util.log('Error processing file: ' + error);
                }
            }

            // Update UI to show files are attached
            const attachButton = document.getElementById('attachButton');
            attachButton.textContent = `📎(${this.rtc.selectedFiles.length})`;
            attachButton.title = `${this.rtc.selectedFiles.length} file(s) attached`;
        }
    }

    // Clear attachments after sending
    clearAttachments() {
        this.rtc.selectedFiles = [];
        const attachButton = document.getElementById('attachButton');
        attachButton.textContent = '📎';
        attachButton.title = 'Attach files';
        const fileInput = document.getElementById('fileInput');
        fileInput.value = '';
    }

    // Modified display message function to handle attachments
    _displayMessage = (messageData) => {
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

            if (messageData.sender === this.rtc.userName) {
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
                messageContent.innerHTML = this.renderContent(messageData.content);
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
                            this.openImageViewer(attachment.data, attachment.name);
                            return false;
                        });

                        // Add download button for images
                        const downloadBtn = document.createElement('button');
                        downloadBtn.classList.add('download-button', 'image-download');
                        downloadBtn.innerHTML = '⬇️';
                        downloadBtn.title = `Download ${attachment.name}`;
                        downloadBtn.onclick = (event) => {
                            event.stopPropagation();
                            this.downloadAttachment(attachment.data, attachment.name);
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
                        downloadButton.onclick = () => {
                            this.downloadAttachment(attachment.data, attachment.name);
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
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' bytes';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // Add this function to create and manage the image viewer modal
    createImageViewerModal() {
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
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    this.closeImageViewer();
                }
            });

            // Add keyboard handler for Escape key
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && modal.style.display === 'flex') {
                    this.closeImageViewer();
                }
            });

            document.body.appendChild(modal);
        }
    }

    // Function to open the image viewer
    openImageViewer(imageSrc, altText) {
        this.createImageViewerModal(); // Ensure modal exists

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
    closeImageViewer() {
        const modal = document.getElementById('image-viewer-modal');
        if (modal) {
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300); // Match this with CSS transition duration
        }
    }

    // Function to handle downloading a file attachment
    downloadAttachment(dataUrl, fileName) {
        // Create a temporary anchor element
        const downloadLink = document.createElement('a');
        downloadLink.href = dataUrl;
        downloadLink.download = fileName;

        // Append to body, trigger click, then remove
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }

    async initApp() {
        console.log("EzChat initApp");
        this.storage = await IndexedDBStorage.getInst();
        this.rtc = await WebRTC.getInst(this.storage);

        // Event listeners
        document.getElementById('connectButton').addEventListener('click', () => {
            console.log("Connecting to room: " + this.rtc.roomId);
            this.rtc._connect(this);
        });
        document.getElementById('disconnectButton').addEventListener('click', () => this.rtc._disconnect(this));
        document.getElementById('sendButton').addEventListener('click', () => {
            this.rtc._sendMessage(this);
            this.clearAttachments();
        });

        document.getElementById('attachButton').addEventListener('click', this._handleFileSelect);
        document.getElementById('fileInput').addEventListener('change', this._handleFiles);
        document.getElementById('clearButton').addEventListener('click', this._clearChatHistory);

        // Initialize the form when page loads
        this.initForm();
    }
}

document.addEventListener('DOMContentLoaded', function () {
    console.log("calling initApp");
    const ezChat = new EzChat();
    ezChat.initApp();
});