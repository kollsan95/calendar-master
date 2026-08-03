// ============================================
//  РАБОТА С INDEXEDDB
// ============================================

const DB_NAME = 'CalendarDB';
const DB_VERSION = 1;
const STORE_NAME = 'records';

let db = null;
let dbReady = false;
let dbQueue = [];

// === ОТКРЫТИЕ БАЗЫ ===
function openDB() {
    return new Promise(function(resolve, reject) {
        if (db && dbReady) {
            resolve(db);
            return;
        }
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                console.log('📦 Создано хранилище:', STORE_NAME);
            }
        };
        
        request.onsuccess = function(event) {
            db = event.target.result;
            dbReady = true;
            console.log('✅ IndexedDB открыта');
            
            // Обрабатываем очередь запросов
            while (dbQueue.length > 0) {
                const cb = dbQueue.shift();
                cb(db);
            }
            
            resolve(db);
        };
        
        request.onerror = function(event) {
            console.error('❌ Ошибка открытия IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

// === ОЖИДАНИЕ БАЗЫ ===
function waitForDB(callback) {
    if (db && dbReady) {
        callback(db);
    } else {
        dbQueue.push(callback);
        if (!db) {
            openDB().catch(function(err) {
                console.error('❌ Ошибка открытия БД:', err);
            });
        }
    }
}

// === ДОБАВИТЬ ЗАПИСЬ ===
function addRecord(record) {
    return new Promise(function(resolve, reject) {
        waitForDB(function(db) {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(record);
            
            request.onsuccess = function() {
                resolve(request.result);
            };
            request.onerror = function() {
                reject(request.error);
            };
        });
    });
}

// === ПОЛУЧИТЬ ВСЕ ЗАПИСИ ===
function getAllRecords() {
    return new Promise(function(resolve, reject) {
        waitForDB(function(db) {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            
            request.onsuccess = function() {
                resolve(request.result || []);
            };
            request.onerror = function() {
                reject(request.error);
            };
        });
    });
}

// === УДАЛИТЬ ЗАПИСЬ ===
function deleteRecord(id) {
    return new Promise(function(resolve, reject) {
        waitForDB(function(db) {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);
            
            request.onsuccess = function() {
                resolve();
            };
            request.onerror = function() {
                reject(request.error);
            };
        });
    });
}

// === ОБНОВИТЬ ЗАПИСЬ ===
function updateRecord(record) {
    return new Promise(function(resolve, reject) {
        waitForDB(function(db) {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(record);
            
            request.onsuccess = function() {
                resolve(request.result);
            };
            request.onerror = function() {
                reject(request.error);
            };
        });
    });
}

// === ИНИЦИАЛИЗАЦИЯ ===
openDB().catch(function(err) {
    console.error('❌ Ошибка инициализации БД:', err);
});