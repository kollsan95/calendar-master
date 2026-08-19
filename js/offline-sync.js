// offline-sync.js

// ============================================
//  ОФФЛАЙН-РЕЖИМ И СИНХРОНИЗАЦИЯ
// ============================================

const OFFLINE_KEY = 'offline_mode';
const OFFLINE_USER_KEY = 'offline_user';
const LOCAL_RECORDS_KEY = 'local_records';
const CONFLICT_RECORDS_KEY = 'conflict_records';

// ============================================
//  УПРАВЛЕНИЕ ОФФЛАЙН-РЕЖИМОМ
// ============================================

function isOfflineMode() {
    try {
        return localStorage.getItem(OFFLINE_KEY) === 'true';
    } catch { return false; }
}

function setOfflineMode(enabled) {
    localStorage.setItem(OFFLINE_KEY, String(enabled));
}

function getOfflineUser() {
    try {
        const data = localStorage.getItem(OFFLINE_USER_KEY);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

function setOfflineUser(name) {
    const user = {
        id: 'offline_' + Date.now(),
        name: name || 'Оффлайн-пользователь',
        phone: '',
        role: 'master',
        isOffline: true
    };
    localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(user));
    return user;
}

function clearOfflineUser() {
    localStorage.removeItem(OFFLINE_USER_KEY);
}

// ============================================
//  РАБОТА С ЛОКАЛЬНЫМИ ЗАПИСЯМИ
// ============================================

function getLocalRecords() {
    try {
        const data = localStorage.getItem(LOCAL_RECORDS_KEY);
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {
        console.warn('⚠️ Ошибка загрузки локальных записей:', e);
    }
    return {};
}

function saveLocalRecords(records) {
    try {
        localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records));
        return true;
    } catch (e) {
        console.warn('⚠️ Ошибка сохранения локальных записей:', e);
        return false;
    }
}

function addLocalRecord(record) {
    try {
        const records = getLocalRecords();
        const dateKey = record.date;
        if (!records[dateKey]) records[dateKey] = [];
        records[dateKey].push({
            ...record,
            _localId: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            _isLocal: true,
            _synced: false
        });
        saveLocalRecords(records);
        console.log('💾 Запись сохранена локально');
        return true;
    } catch (e) {
        console.warn('⚠️ Не удалось сохранить локально:', e);
        return false;
    }
}

function removeLocalRecord(dateKey, recordId) {
    console.log('🗑️ removeLocalRecord:', { dateKey, recordId });
    try {
        const records = getLocalRecords();
        if (records[dateKey]) {
            const originalLength = records[dateKey].length;
            records[dateKey] = records[dateKey].filter(r => {
                const rId = r.id || r._localId;
                return rId !== recordId;
            });
            
            if (records[dateKey].length === 0) {
                delete records[dateKey];
            }
            
            saveLocalRecords(records);
            console.log('🗑️ Удалено записей:', originalLength - records[dateKey].length);
            return true;
        } else {
            console.warn('⚠️ Нет записей на дату:', dateKey);
            return false;
        }
    } catch (e) {
        console.warn('⚠️ Не удалось удалить локально:', e);
        return false;
    }
}

function updateLocalRecord(record) {
    try {
        const records = getLocalRecords();
        const dateKey = record.date;
        if (records[dateKey]) {
            const idx = records[dateKey].findIndex(r => r.id === record.id || r._localId === record.id);
            if (idx !== -1) {
                records[dateKey][idx] = { ...records[dateKey][idx], ...record };
                saveLocalRecords(records);
                console.log('✏️ Запись обновлена локально');
                return true;
            }
        }
    } catch (e) {
        console.warn('⚠️ Не удалось обновить локально:', e);
        return false;
    }
}

function clearLocalRecords() {
    try {
        localStorage.removeItem(LOCAL_RECORDS_KEY);
        console.log('🗑️ Все локальные записи очищены');
        return true;
    } catch (e) {
        console.warn('⚠️ Ошибка очистки локальных записей:', e);
        return false;
    }
}

// ============================================
//  УПРАВЛЕНИЕ КОНФЛИКТАМИ
// ============================================

function getConflictRecords() {
    try {
        const data = localStorage.getItem(CONFLICT_RECORDS_KEY);
        return data ? JSON.parse(data) : {};
    } catch { return {}; }
}

function saveConflictRecords(records) {
    localStorage.setItem(CONFLICT_RECORDS_KEY, JSON.stringify(records));
}

function addConflictRecord(record) {
    const conflicts = getConflictRecords();
    const dateKey = record.date;
    if (!conflicts[dateKey]) conflicts[dateKey] = [];
    conflicts[dateKey].push({
        ...record,
        _conflictId: 'conflict_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        _isConflict: true
    });
    saveConflictRecords(conflicts);
}

function isConflictRecord(record) {
    return record && record._isConflict === true;
}

// ============================================
//  СИНХРОНИЗАЦИЯ ЛОКАЛЬНЫХ ЗАПИСЕЙ С FIREBASE
// ============================================

async function syncLocalRecordsWithFirebase() {
    console.log('🔄 Начинаем синхронизацию локальных записей...');
    
    // Проверяем, что firebaseSync доступен
    if (!firebaseSync || typeof firebaseSync.loadAllRecords !== 'function') {
        console.error('❌ firebaseSync не инициализирован или не готов');
        throw new Error('Firebase не инициализирован для синхронизации');
    }
    
    const localRecords = getLocalRecords();
    const conflicts = {};
    let syncedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;
    
    // Получаем все записи из Firebase
    console.log('📥 Загружаем записи из Firebase...');
    let firebaseRecords = {};
    try {
        firebaseRecords = await firebaseSync.loadAllRecords();
        console.log('📥 Загружено записей из Firebase:', Object.keys(firebaseRecords).length);
    } catch (error) {
        console.error('❌ Ошибка загрузки из Firebase:', error);
        throw new Error('Не удалось загрузить данные из облака');
    }
    
    const firebaseData = firebaseRecords || {};
    
    // ✅ Получаем текущего пользователя (уже онлайн)
    const user = getCurrentUser();
    const currentUserId = user ? user.id : null;
    const currentUserName = user ? user.name : null;
    
    if (!currentUserId) {
        console.warn('⚠️ Пользователь не найден, синхронизация невозможна');
        throw new Error('Пользователь не авторизован');
    }
    
    console.log('👤 Текущий пользователь (онлайн):', currentUserName, 'ID:', currentUserId);
    
    // ✅ Выводим все локальные записи для отладки
    console.log('📋 Локальные записи для синхронизации:');
    for (const [dateKey, records] of Object.entries(localRecords)) {
        if (!Array.isArray(records)) continue;
        console.log(`  📅 ${dateKey}: ${records.length} записей`);
        for (const r of records) {
            console.log(`    - ${r.startHour}-${r.endHour}, мастер: ${r.master || 'не указан'}, masterId: ${r.masterId || 'не указан'}, сервис: ${r.serviceTypeName}`);
        }
    }
    
    // Перебираем локальные записи
    for (const [dateKey, records] of Object.entries(localRecords)) {
        if (!Array.isArray(records)) continue;
        
        console.log(`📅 Обработка даты ${dateKey}, записей: ${records.length}`);
        
        for (const localRecord of records) {
            if (localRecord._synced) {
                console.log('⏭️ Запись уже синхронизирована, пропускаем');
                continue;
            }
            
            // Получаем записи на эту дату из Firebase
            const dayRecords = firebaseData[dateKey] || [];
            
            // ✅ Для сравнения используем ИМЯ мастера, а не ID
            // Так как оффлайн-записи имеют другой masterId
            const localMasterName = localRecord.master || '';
            
            console.log(`🔍 Проверяем локальную запись:`, {
                date: dateKey,
                start: localRecord.startHour,
                end: localRecord.endHour,
                master: localMasterName,
                masterId: localRecord.masterId,
                service: localRecord.serviceTypeName
            });
            
            // ✅ Проверяем, есть ли запись на это же время у этого же мастера (по ИМЕНИ)
            let foundDuplicate = false;
            let duplicateRecord = null;
            
            for (const fbRecord of dayRecords) {
                // Сравниваем время с округлением до 0.1
                const startMatch = Math.abs(fbRecord.startHour - localRecord.startHour) < 0.1;
                const endMatch = Math.abs(fbRecord.endHour - localRecord.endHour) < 0.1;
                
                if (!startMatch || !endMatch) continue;
                
                // ✅ Сравниваем по ИМЕНИ мастера (не по ID!)
                const fbMasterName = fbRecord.master || '';
                const isSameMaster = fbMasterName === localMasterName && fbMasterName !== '';
                
                console.log(`  ⏰ Найдена запись в Firebase на то же время:`, {
                    fbStart: fbRecord.startHour,
                    fbEnd: fbRecord.endHour,
                    fbMaster: fbMasterName,
                    fbMasterId: fbRecord.masterId,
                    isSameMaster: isSameMaster
                });
                
                if (isSameMaster) {
                    foundDuplicate = true;
                    duplicateRecord = fbRecord;
                    console.log(`  ✅ СОВПАДЕНИЕ: тот же мастер (${localMasterName})`);
                    break;
                } else {
                    console.log(`  ⚠️ Другой мастер: ${fbMasterName} vs ${localMasterName}`);
                }
            }
            
            if (foundDuplicate) {
                // ✅ Запись уже существует в Firebase на это же время у этого же мастера
                console.log(`⏰ ЗАПИСЬ УЖЕ СУЩЕСТВУЕТ В ОБЛАКЕ (ПРОПУСКАЕМ):`, {
                    date: dateKey,
                    startHour: localRecord.startHour,
                    endHour: localRecord.endHour,
                    service: localRecord.serviceTypeName,
                    master: localMasterName,
                    existingId: duplicateRecord.id
                });
                
                // Отмечаем локальную запись как синхронизированную
                localRecord._synced = true;
                localRecord._skipped = true;
                skippedCount++;
                
                addNotification('⏭️ Запись уже существует в облаке: ' + 
                    localRecord.serviceTypeName + ' на ' + dateKey + ' ' + 
                    formatTime(localRecord.startHour) + '-' + formatTime(localRecord.endHour));
                
                continue;
            }
            
            // ✅ Проверяем на конфликт (другой мастер на это же время)
            let hasConflict = false;
            let conflictRecord = null;
            
            for (const fbRecord of dayRecords) {
                const startMatch = Math.abs(fbRecord.startHour - localRecord.startHour) < 0.1;
                const endMatch = Math.abs(fbRecord.endHour - localRecord.endHour) < 0.1;
                
                if (!startMatch || !endMatch) continue;
                
                const fbMasterName = fbRecord.master || '';
                const isDifferentMaster = fbMasterName !== localMasterName && fbMasterName !== '';
                
                if (isDifferentMaster) {
                    hasConflict = true;
                    conflictRecord = fbRecord;
                    console.log(`  ⚠️ КОНФЛИКТ: другой мастер (${fbMasterName}) на это же время`);
                    break;
                }
            }
            
            if (hasConflict) {
                // Конфликт - другой мастер на это же время
                console.log(`⚠️ ОБНАРУЖЕН КОНФЛИКТ:`, {
                    date: dateKey,
                    startHour: localRecord.startHour,
                    endHour: localRecord.endHour,
                    localMaster: localMasterName,
                    firebaseMaster: conflictRecord.master
                });
                
                if (!conflicts[dateKey]) conflicts[dateKey] = [];
                conflicts[dateKey].push({
                    ...localRecord,
                    _firebaseId: conflictRecord.id,
                    _conflict: true,
                    _existingMaster: conflictRecord.master
                });
                conflictCount++;
                continue;
            }
            
            // ✅ Нет такой записи в Firebase - создаем новую
            try {
                console.log(`📝 СОЗДАЕМ НОВУЮ ЗАПИСЬ В ОБЛАКЕ:`, {
                    date: dateKey,
                    startHour: localRecord.startHour,
                    endHour: localRecord.endHour,
                    service: localRecord.serviceTypeName,
                    master: currentUserName,
                    masterId: currentUserId
                });
                
                const newRecord = {
                    ...localRecord,
                    // ✅ Используем текущего пользователя (онлайн) как мастера
                    userId: currentUserId,
                    master: currentUserName,
                    masterId: currentUserId
                };
                delete newRecord._localId;
                delete newRecord._isLocal;
                delete newRecord._synced;
                
                await firebaseSync.addRecord(newRecord);
                localRecord._synced = true;
                syncedCount++;
                
                addNotification('📤 Синхронизирована локальная запись: ' + 
                    localRecord.serviceTypeName + ' на ' + dateKey + ' ' + 
                    formatTime(localRecord.startHour) + '-' + formatTime(localRecord.endHour));
            } catch (error) {
                console.error('❌ Ошибка синхронизации записи:', error);
            }
        }
    }
    
    // Сохраняем конфликты
    if (Object.keys(conflicts).length > 0) {
        saveConflictRecords(conflicts);
        showToast('⚠️ Обнаружены конфликты записей (' + conflictCount + '). Проверьте их в календаре.', 'error');
    }
    
    // Сохраняем обновленные локальные записи
    saveLocalRecords(localRecords);
    
    // Очищаем локальные записи после успешной синхронизации
    const remainingRecords = {};
    let remainingCount = 0;
    for (const [dateKey, records] of Object.entries(localRecords)) {
        const unsynced = records.filter(r => !r._synced);
        if (unsynced.length > 0) {
            remainingRecords[dateKey] = unsynced;
            remainingCount += unsynced.length;
        }
    }
    
    if (remainingCount === 0) {
        clearLocalRecords();
        console.log('🗑️ Все локальные записи очищены (синхронизация завершена)');
    } else {
        saveLocalRecords(remainingRecords);
        console.log('📦 Осталось несинхронизированных записей:', remainingCount);
    }
    
    // Обновляем кеш
    try {
        const allData = await firebaseSync.loadAllRecords();
        saveRecordsToCache(allData);
    } catch (error) {
        console.warn('⚠️ Не удалось обновить кеш:', error);
    }
    
    // Показываем итоговое уведомление
    let summaryMessage = '✅ Синхронизация завершена';
    if (syncedCount > 0) summaryMessage += '. Добавлено: ' + syncedCount;
    if (skippedCount > 0) summaryMessage += '. Пропущено (уже есть): ' + skippedCount;
    if (conflictCount > 0) summaryMessage += '. Конфликтов: ' + conflictCount;
    
    showToast(summaryMessage);
    
    console.log('✅ Синхронизация завершена:', {
        synced: syncedCount,
        skipped: skippedCount,
        conflicts: conflictCount
    });
    
    return { syncedCount, skippedCount, conflictCount };
}

// ✅ Функция для дедупликации локальных записей перед синхронизацией
function deduplicateLocalRecords() {
    const records = getLocalRecords();
    let removedCount = 0;
    
    for (const [dateKey, dayRecords] of Object.entries(records)) {
        if (!Array.isArray(dayRecords)) continue;
        
        const seen = new Map();
        const unique = [];
        
        for (const record of dayRecords) {
            // Используем имя мастера для сравнения
            const masterName = record.master || '';
            const key = record.startHour + '_' + record.endHour + '_' + masterName;
            
            if (seen.has(key)) {
                console.log(`🗑️ Удаляем дубликат локальной записи:`, {
                    date: dateKey,
                    start: record.startHour,
                    end: record.endHour,
                    master: masterName
                });
                removedCount++;
            } else {
                seen.set(key, true);
                unique.push(record);
            }
        }
        
        records[dateKey] = unique;
    }
    
    if (removedCount > 0) {
        saveLocalRecords(records);
        console.log(`🗑️ Удалено дубликатов локальных записей: ${removedCount}`);
    }
    
    return removedCount;
}

// ============================================
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function findMatchingRecord(firebaseData, dateKey, localRecord) {
    const dayRecords = firebaseData[dateKey] || [];
    if (!Array.isArray(dayRecords)) return null;
    
    return dayRecords.find(r => {
        const sameMaster = r.masterId === localRecord.masterId || r.master === localRecord.master;
        const sameTime = Math.abs(r.startHour - localRecord.startHour) < 0.5 && 
                        Math.abs(r.endHour - localRecord.endHour) < 0.5;
        return sameMaster && sameTime;
    }) || null;
}

function isRecordConflict(firebaseRecord, localRecord) {
    if (firebaseRecord.masterId !== localRecord.masterId && 
        firebaseRecord.master !== localRecord.master) {
        return true;
    }
    
    if (firebaseRecord.startHour !== localRecord.startHour || 
        firebaseRecord.endHour !== localRecord.endHour) {
        return true;
    }
    
    return false;
}

function mergeRecords(firebaseRecord, localRecord) {
    const merged = { ...firebaseRecord };
    
    const fieldsToMerge = ['clientName', 'clientPhone', 'note', 'serviceTypeName'];
    for (const field of fieldsToMerge) {
        if (!merged[field] && localRecord[field]) {
            merged[field] = localRecord[field];
        }
    }
    
    if (!merged.masterId && localRecord.masterId) {
        merged.masterId = localRecord.masterId;
    }
    
    return merged;
}

function formatTime(value) {
    if (value === undefined || value === null) return '00:00';
    const hours = Math.floor(value);
    const minutes = Math.round((value - hours) * 60);
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

// ✅ Функция для очистки всех локальных данных при переходе в онлайн
function clearAllOfflineData() {
    console.log('🗑️ Очистка всех оффлайн-данных...');
    
    // Очищаем локальные записи
    clearLocalRecords();
    
    // Очищаем конфликты
    localStorage.removeItem(CONFLICT_RECORDS_KEY);
    
    // Очищаем пользователя оффлайн
    clearOfflineUser();
    
    // Отключаем оффлайн-режим
    setOfflineMode(false);
    
    // Удаляем временные флаги
    localStorage.removeItem('offline_mode_temp');
    
    console.log('✅ Все оффлайн-данные очищены');
}

// Экспортируем функции
window.getLocalRecords = getLocalRecords;
window.saveLocalRecords = saveLocalRecords;
window.addLocalRecord = addLocalRecord;
window.removeLocalRecord = removeLocalRecord;
window.updateLocalRecord = updateLocalRecord;
window.clearLocalRecords = clearLocalRecords;
window.syncLocalRecordsWithFirebase = syncLocalRecordsWithFirebase;
window.clearAllOfflineData = clearAllOfflineData;

console.log('✅ offline-sync.js загружен');