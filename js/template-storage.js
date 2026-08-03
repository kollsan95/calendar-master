// js/template-storage.js

class TemplateStorage {
    constructor() {
        this.dbName = 'TemplatesDB';
        this.storeName = 'templates';
        this.db = null;
        this.ready = false;
    }
    
    async open() {
        if (this.ready && this.db) {
            return this.db;
        }
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.ready = true;
                resolve(this.db);
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }
    
    async save(key, data) {
        try {
            await this.open();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put({ id: key, data: data });
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.warn('⚠️ Ошибка сохранения в IndexedDB, пробуем localStorage:', error);
            // Fallback на localStorage
            try {
                localStorage.setItem(key, JSON.stringify(data));
                return;
            } catch (e) {
                console.error('❌ Ошибка сохранения:', e);
                throw e;
            }
        }
    }
    
    async load(key) {
        try {
            await this.open();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    resolve(request.result ? request.result.data : null);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.warn('⚠️ Ошибка загрузки из IndexedDB, пробуем localStorage:', error);
            // Fallback на localStorage
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : null;
            } catch (e) {
                console.error('❌ Ошибка загрузки:', e);
                return null;
            }
        }
    }
    
    async remove(key) {
        try {
            await this.open();
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.delete(key);
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.warn('⚠️ Ошибка удаления из IndexedDB, пробуем localStorage:', error);
            try {
                localStorage.removeItem(key);
            } catch (e) {
                console.error('❌ Ошибка удаления:', e);
            }
        }
    }
}

// Создаем глобальный экземпляр
window.templateStorage = new TemplateStorage();
console.log('📦 TemplateStorage инициализирован');