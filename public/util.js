export function log(message) {
    console.log('[WebRTC Chat] ' + message);
    const statusDiv = document.getElementById('connectionStatus');
    if (statusDiv) {
        statusDiv.textContent = message;
    }
}
