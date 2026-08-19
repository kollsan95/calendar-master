// js/cache.js

// ============================================
//  КЕШИРОВАНИЕ ЗАПИСЕЙ
// ============================================

// === СОХРАНЕНИЕ В КЕШ ===
function saveRecordsToCache(data) {
    try {
        localStorage.setItem('cached_records', JSON.stringify(data));
        console.log('💾 Данные сохранены в кеш');
        return true;
    } catch (e) {
        console.warn('⚠️ Ошибка сохранения кеша:', e);
        return false;
    }
}

// === ЗАГРУЗКА ИЗ КЕША ===
function loadRecordsFromCache() {
    try {
        const data = localStorage.getItem('cached_records');
        if (data) {
            const parsed = JSON.parse(data);
            console.log('📦 Загружено из кеша:', Object.keys(parsed).length, 'дней');
            return parsed;
        }
    } catch (e) {
        console.warn('⚠️ Ошибка чтения кеша:', e);
    }
    return null;
}

// === ОЧИСТКА КЕША ===
function clearRecordsCache() {
    try {
        localStorage.removeItem('cached_records');
        console.log('🗑️ Кеш очищен');
        return true;
    } catch (e) {
        console.warn('⚠️ Ошибка очистки кеша:', e);
        return false;
    }
}

console.log('✅ cache.js загружен');