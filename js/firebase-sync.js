// js/firebase-sync.js

class FirebaseSync {
    constructor() {
        // Проверяем, что Firebase инициализирован
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
    //  Преобразует { date: { id: record } } в { date: [record] }
    // ============================================
    normalizeData(data) {
        if (!data) return {};
        
        const result = {};
        for (const [dateKey, dayData] of Object.entries(data)) {
            if (Array.isArray(dayData)) {
                // Уже массив - оставляем как есть
                result[dateKey] = dayData;
            } else if (typeof dayData === 'object' && dayData !== null) {
                // Объект { id: record } -> преобразуем в массив [record]
                result[dateKey] = Object.values(dayData);
            } else {
                result[dateKey] = [];
            }
        }
        return result;
    }
    
    // ============================================
    //  ЗАГРУЗКА ВСЕХ ЗАПИСЕЙ
    // ============================================
    async loadAllRecords() {
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
        try {
            // Сохраняем callback для переподключения
            this.syncCallback = callback;
            
            const listener = this.recordsRef.on('value', (snapshot) => {
                const data = snapshot.val() || {};
                
                // Нормализуем данные перед отправкой
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
        try {
            const dateKey = record.date;
            const newRecordRef = this.recordsRef.child(dateKey).push();
            
            // Добавляем метаданные
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
        try {
            console.log('🗑️ Удаление из Firebase:', { recordId, dateKey });
            
            // Проверяем, что запись существует
            const snapshot = await this.recordsRef.child(dateKey).child(recordId).once('value');
            if (!snapshot.exists()) {
                console.warn('⚠️ Запись не найдена в Firebase:', recordId);
                return;
            }
            
            await this.recordsRef.child(dateKey).child(recordId).remove();
            console.log('✅ Запись удалена из Firebase:', recordId);
        } catch (error) {
            console.error('❌ Ошибка удаления из Firebase:', error);
            throw error;
        }
    }
    
    // ============================================
    //  ПРИНУДИТЕЛЬНАЯ СИНХРОНИЗАЦИЯ
    // ============================================
    async forceSync() {
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