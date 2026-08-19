// js/firebase-sync.js

// ============================================
//  СИНХРОНИЗАЦИЯ С FIREBASE
//  С поддержкой оффлайн-режима
// ============================================

class FirebaseSync {
    constructor() {
        if (typeof firebase === 'undefined' || !firebase.database) {
            console.error('❌ Firebase не инициализирован');
            throw new Error('Firebase не инициализирован');
        }
        
        this.db = firebase.database();
        this.recordsRef = this.db.ref('records');
        this.listeners = [];
        this.isOnline = navigator.onLine;
        this.syncCallback = null;
        
        // Слушаем изменения статуса сети
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('🔄 Соединение восстановлено');
            this.forceSync();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('📴 Офлайн режим');
        });
    }
    
    // ============================================
    //  НОРМАЛИЗАЦИЯ ДАННЫХ ИЗ FIREBASE
    // ============================================
    
    normalizeData(data) {
        if (!data) return {};
        
        const result = {};
        for (const [dateKey, dayData] of Object.entries(data)) {
            if (Array.isArray(dayData)) {
                result[dateKey] = dayData;
            } else if (typeof dayData === 'object' && dayData !== null) {
                result[dateKey] = Object.values(dayData);
            } else {
                result[dateKey] = [];
            }
        }
        return result;
    }
    
    // ============================================
    //  ПРОВЕРКА ОФФЛАЙН-РЕЖИМА
    // ============================================
    
    isOfflineMode() {
        return localStorage.getItem('offline_mode') === 'true';
    }
    
    // ============================================
    //  ЗАГРУЗКА ВСЕХ ЗАПИСЕЙ
    // ============================================
    
    async loadAllRecords() {
        // ✅ Проверяем оффлайн-режим
        if (this.isOfflineMode()) {
            console.log('📴 Оффлайн-режим: пропускаем загрузку из Firebase');
            return {};
        }
        
        try {
            const snapshot = await this.recordsRef.once('value');
            const data = snapshot.val() || {};
            const normalizedData = this.normalizeData(data);
            console.log('📥 Загружено записей:', Object.keys(normalizedData).length);
            return normalizedData;
        } catch (error) {
            console.error('❌ Ошибка загрузки:', error);
            return {};
        }
    }
    
    // ============================================
    //  СИНХРОНИЗАЦИЯ В РЕАЛЬНОМ ВРЕМЕНИ
    // ============================================
    
    syncRecords(callback) {
        // ✅ Проверяем оффлайн-режим
        if (this.isOfflineMode()) {
            console.log('📴 Оффлайн-режим: синхронизация отключена');
            return null;
        }
        
        try {
            this.syncCallback = callback;
            
            const listener = this.recordsRef.on('value', (snapshot) => {
                const data = snapshot.val() || {};
                const normalizedData = this.normalizeData(data);
                console.log('🔄 Получено обновление:', Object.keys(normalizedData).length, 'дней с записями');
                callback(normalizedData);
            });
            this.listeners.push(listener);
            return listener;
        } catch (error) {
            console.error('❌ Ошибка синхронизации:', error);
            return null;
        }
    }
    
    // ============================================
    //  ДОБАВЛЕНИЕ ЗАПИСИ
    // ============================================
    
    async addRecord(record) {
        // ✅ Проверяем оффлайн-режим
        if (this.isOfflineMode()) {
            console.log('📴 Оффлайн-режим: запись сохранена локально');
            // Сохраняем локально, если функция доступна
            if (typeof addLocalRecord === 'function') {
                addLocalRecord(record);
            } else {
                // Fallback: сохраняем в localStorage
                try {
                    const localRecords = JSON.parse(localStorage.getItem('local_records') || '{}');
                    const dateKey = record.date;
                    if (!localRecords[dateKey]) localRecords[dateKey] = [];
                    localRecords[dateKey].push({
                        ...record,
                        _localId: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                        _isLocal: true,
                        _synced: false
                    });
                    localStorage.setItem('local_records', JSON.stringify(localRecords));
                } catch (e) {
                    console.warn('⚠️ Не удалось сохранить локально:', e);
                }
            }
            return 'local_' + Date.now();
        }
        
        try {
            const dateKey = record.date;
            const newRecordRef = this.recordsRef.child(dateKey).push();
            
            const recordWithMeta = {
                ...record,
                id: newRecordRef.key,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            };
            
            await newRecordRef.set(recordWithMeta);
            console.log('✅ Запись добавлена:', recordWithMeta.id);
            return newRecordRef.key;
        } catch (error) {
            console.error('❌ Ошибка добавления записи:', error);
            throw error;
        }
    }
    
    // ============================================
    //  ОБНОВЛЕНИЕ ЗАПИСИ
    // ============================================
    
    async updateRecord(recordId, dateKey, data) {
        // ✅ Проверяем оффлайн-режим
        if (this.isOfflineMode()) {
            console.log('📴 Оффлайн-режим: запись обновлена локально');
            // Обновляем локально
            try {
                const localRecords = JSON.parse(localStorage.getItem('local_records') || '{}');
                if (localRecords[dateKey]) {
                    const idx = localRecords[dateKey].findIndex(r => r.id === recordId || r._localId === recordId);
                    if (idx !== -1) {
                        localRecords[dateKey][idx] = { ...localRecords[dateKey][idx], ...data };
                        localStorage.setItem('local_records', JSON.stringify(localRecords));
                    }
                }
            } catch (e) {
                console.warn('⚠️ Не удалось обновить локально:', e);
            }
            return;
        }
        
        try {
            const updateData = {
                ...data,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            };
            await this.recordsRef.child(dateKey).child(recordId).update(updateData);
            console.log('✅ Запись обновлена:', recordId);
        } catch (error) {
            console.error('❌ Ошибка обновления:', error);
            throw error;
        }
    }
    
    // ============================================
    //  УДАЛЕНИЕ ЗАПИСИ
    // ============================================
    
    async deleteRecord(recordId, dateKey) {
        // ✅ Проверяем оффлайн-режим
        if (this.isOfflineMode()) {
            console.log('📴 Оффлайн-режим: запись удалена локально');
            // Удаляем локально
            try {
                const localRecords = JSON.parse(localStorage.getItem('local_records') || '{}');
                if (localRecords[dateKey]) {
                    localRecords[dateKey] = localRecords[dateKey].filter(r => r.id !== recordId && r._localId !== recordId);
                    if (localRecords[dateKey].length === 0) {
                        delete localRecords[dateKey];
                    }
                    localStorage.setItem('local_records', JSON.stringify(localRecords));
                }
            } catch (e) {
                console.warn('⚠️ Не удалось удалить локально:', e);
            }
            return;
        }
        
        try {
            await this.recordsRef.child(dateKey).child(recordId).remove();
            console.log('✅ Запись удалена:', recordId);
        } catch (error) {
            console.error('❌ Ошибка удаления:', error);
            throw error;
        }
    }
    
    // ============================================
    //  ПРИНУДИТЕЛЬНАЯ СИНХРОНИЗАЦИЯ
    // ============================================
    
    async forceSync() {
        // ✅ Проверяем оффлайн-режим
        if (this.isOfflineMode()) {
            console.log('📴 Оффлайн-режим: принудительная синхронизация отключена');
            return;
        }
        
        try {
            await this.recordsRef.once('value');
            console.log('🔄 Принудительная синхронизация выполнена');
        } catch (error) {
            console.error('❌ Ошибка синхронизации:', error);
        }
    }
    
    // ============================================
    //  ПЕРЕПОДКЛЮЧЕНИЕ (при восстановлении сети)
    // ============================================
    
    reconnect() {
        // ✅ Проверяем оффлайн-режим
        if (this.isOfflineMode()) {
            console.log('📴 Оффлайн-режим: переподключение отключено');
            return;
        }
        
        if (this.syncCallback) {
            console.log('🔄 Переподключение синхронизации...');
            this.detach();
            this.syncRecords(this.syncCallback);
        }
    }
    
    // ============================================
    //  ОТКЛЮЧЕНИЕ СИНХРОНИЗАЦИИ
    // ============================================
    
    detach() {
        this.listeners.forEach(listener => {
            this.recordsRef.off('value', listener);
        });
        this.listeners = [];
        console.log('🔌 Синхронизация отключена');
    }
}

// Экспортируем класс для использования в других файлах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FirebaseSync;
}

// Создаем глобальный экземпляр для использования в app.js
// Если он уже существует, используем его
if (typeof window.firebaseSync === 'undefined') {
    window.firebaseSync = null;
}

console.log('✅ firebase-sync.js загружен');