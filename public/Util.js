class Util {
    constructor() {
        console.log('Util singleton created');
    }

    // New static factory method to replace async constructor
    static getInst() {
        // Create instance if it doesn't exist
        if (!Util.inst) {
            Util.inst = new Util();
        }

        return Util.inst;
    }

    log(message) {
        console.log('[WebRTC Chat] ' + message);
        const statusDiv = document.getElementById('connectionStatus');
        if (statusDiv) {
            statusDiv.textContent = message;
        }
    }

    renderContent(content) {
        return (typeof marked !== 'undefined')
            ? marked.parse(content)
            : content.replace(/\n/g, '<br>')
    }

    // Utility function to get URL parameters
    getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
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

    // Helper function to format file size
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' bytes';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }
}

export default Util;
