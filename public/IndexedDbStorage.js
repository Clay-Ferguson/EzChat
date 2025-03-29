/**
 * IndexedDB Storage wrapper class
 * Provides a Promise-based API for using IndexedDB
 */
class IndexedDBStorage {
    constructor() {
        this.DB_NAME = 'ezChatDB';
        this.STORE_NAME = 'ezChatStore';
        this.DB_VERSION = 1;
        console.log('IndexedDBStorage singleton created');
    }

    // New static factory method to replace async constructor
    static async getInst() {
        // Create instance if it doesn't exist
        if (!IndexedDBStorage.inst) {
            IndexedDBStorage.inst = new IndexedDBStorage();

            console.log("Waiting for DB")
            await IndexedDBStorage.inst.initDB();
            console.log("DB ready")
        }

        return IndexedDBStorage.inst;
    }

    /**
     * Initialize the IndexedDB database
     */
    async initDB() {
        const dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME);
                }
            };
        });

        this.db = await dbPromise;
    }

    /**
     * Store a value in the database
     * @param {string} key - The key to store the value under
     * @param {any} value - The value to store
     * @returns {Promise} Promise that resolves when the operation is complete
     */
    async setItem(key, value) {
        this.checkDB(); 
        try {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.put(value, key);

                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);

                transaction.oncomplete = () => resolve();
                transaction.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            console.error('Error in setItem:', error);
            throw error;
        }
    }

    /**
     * Retrieve a value from the database
     * @param {string} key - The key to retrieve
     * @returns {Promise<any>} Promise that resolves with the retrieved value
     */
    async getItem(key) {
        this.checkDB(); 
        try {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.get(key);

                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            console.error('Error in getItem:', error);
            throw error;
        }
    }

    /**
     * Remove a value from the database
     * @param {string} key - The key to remove
     * @returns {Promise} Promise that resolves when the operation is complete
     */
    async removeItem(key) {
        this.checkDB(); 
        try {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.delete(key);

                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);

                transaction.oncomplete = () => resolve();
                transaction.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            console.error('Error in removeItem:', error);
            throw error;
        }
    }

    /**
     * Clear all data from the store
     * @returns {Promise} Promise that resolves when the operation is complete
     */
    async clear() {
        this.checkDB(); 
        try {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(this.STORE_NAME, 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.clear();

                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);

                transaction.oncomplete = () => resolve();
                transaction.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            console.error('Error in clear:', error);
            throw error;
        }
    }

    /**
     * Get all keys in the store
     * @returns {Promise<Array<string>>} Promise that resolves with an array of keys
     */
    async keys() {
        this.checkDB(); 
        try {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.getAllKeys();

                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            console.error('Error in keys:', error);
            throw error;
        }
    }

    checkDB() {
        if (!this.db) {
            throw new Error('Database not initialized. Call initDB() first, and inside getInstance() only.');
        }
    }
}

export default IndexedDBStorage;