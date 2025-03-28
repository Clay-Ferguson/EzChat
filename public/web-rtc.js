/* import { log } from './util.js'; */

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

    // todo-0: we'll be adding the full implementation here.
}

export default WebRTC;