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
//  ИНИЦИАЛИЗАЦИЯ FIREBASE
// ============================================

if (typeof firebase !== 'undefined' && firebase.initializeApp) {
    try {
        firebase.initializeApp(firebaseConfig);
        console.log('✅ Firebase инициализирован из config');
    } catch (error) {
        console.error('❌ Ошибка инициализации Firebase:', error);
    }
} else {
    console.error('❌ Firebase SDK не загружен. Проверьте подключение скриптов.');
}

// Экспортируем для использования
if (typeof module !== 'undefined' && module.exports) {
    module.exports = firebase;
}