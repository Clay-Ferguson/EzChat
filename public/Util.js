class Util {
    constructor() {
        console.log('Util singleton created');
    }

    // New static factory method to replace async constructor
    static getInst(storage) {
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
}

export default Util;
