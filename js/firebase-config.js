// js/firebase-config.js

// ============================================
//  КОНФИГУРАЦИЯ FIREBASE
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyDOuiG6Q5a-5o2jU0s-XlM5W1VljBeV-Cs",
    authDomain: "calendar-master-d7c34.firebaseapp.com",
    databaseURL: "https://calendar-master-d7c34-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "calendar-master-d7c34",
    storageBucket: "calendar-master-d7c34.appspot.com",
    messagingSenderId: "815197979285",
    appId: "1:815197979285:web:4ee6f687eb29ed5730d19c"
};

// ============================================
//  ПРОВЕРКА ОФФЛАЙН-РЕЖИМА
// ============================================

let isOffline = localStorage.getItem('offline_mode') === 'true';

// ✅ Функция для принудительной инициализации Firebase
function initFirebaseApp() {
    // Проверяем, что Firebase доступен
    if (typeof firebase === 'undefined' || !firebase.initializeApp) {
        console.error('❌ Firebase SDK не загружен');
        return false;
    }
    
    // Проверяем, не инициализирован ли уже
    try {
        const app = firebase.app();
        if (app) {
            console.log('✅ Firebase уже инициализирован');
            return true;
        }
    } catch (e) {
        // Firebase не инициализирован - инициализируем
        try {
            firebase.initializeApp(firebaseConfig);
            console.log('✅ Firebase инициализирован из config');
            
            // Включаем офлайн-кэширование
            try {
                if (typeof firebase.database().setPersistenceEnabled === 'function') {
                    firebase.database().setPersistenceEnabled(true)
                        .then(() => console.log('✅ Офлайн-кэширование включено'))
                        .catch(err => console.warn('⚠️ Ошибка кэширования:', err.message));
                }
            } catch (e) {
                console.warn('⚠️ Ошибка включения кэширования:', e.message);
            }
            
            return true;
        } catch (error) {
            console.error('❌ Ошибка инициализации Firebase:', error);
            return false;
        }
    }
}

// ✅ Функция для переключения режима онлайн/оффлайн
function setFirebaseOnlineMode(enabled) {
    isOffline = !enabled;
    localStorage.setItem('offline_mode', String(!enabled));
    
    if (enabled) {
        // Включаем онлайн-режим - инициализируем Firebase
        const result = initFirebaseApp();
        if (result) {
            console.log('☁️ Firebase активирован для онлайн-режима');
        }
        return result;
    } else {
        // Выключаем онлайн-режим - отключаем Firebase
        console.log('📴 Переход в оффлайн-режим');
        return true;
    }
}

// ============================================
//  ИНИЦИАЛИЗАЦИЯ (ТОЛЬКО ЕСЛИ НЕ ОФФЛАЙН)
// ============================================

// ✅ Инициализируем Firebase, если не оффлайн-режим
if (!isOffline) {
    initFirebaseApp();
} else {
    console.log('📴 Оффлайн-режим: Firebase не инициализирован');
}

// Экспортируем
if (typeof window !== 'undefined') {
    window.firebaseConfig = {
        initFirebaseApp: initFirebaseApp,
        setFirebaseOnlineMode: setFirebaseOnlineMode,
        isOffline: isOffline
    };
}