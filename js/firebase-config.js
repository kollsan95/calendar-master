// js/firebase-config.js

// ============================================
//  КОНФИГУРАЦИЯ FIREBASE
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyDOuiG6Q5a-5o2jU0s-XlM5W1VljBeV-Cs",
  authDomain: "calendar-master-d7c34.firebaseapp.com",
  databaseURL: "https://calendar-master-d7c34-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "calendar-master-d7c34",
  storageBucket: "calendar-master-d7c34.firebasestorage.app",
  messagingSenderId: "815197979285",
  appId: "1:815197979285:web:4ee6f687eb29ed5730d19c"
};

// ============================================
//  ИНИЦИАЛИЗАЦИЯ FIREBASE
// ============================================

try {
    firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase инициализирован из config');
} catch (error) {
    console.error('❌ Ошибка инициализации Firebase:', error);
}

// ============================================
//  ВКЛЮЧЕНИЕ ОФЛАЙН-КЭШИРОВАНИЯ
// ============================================

try {
    if (firebase.database && typeof firebase.database().setPersistenceEnabled === 'function') {
        firebase.database().setPersistenceEnabled(true)
            .then(() => {
                console.log('✅ Офлайн-кэширование включено');
            })
            .catch((error) => {
                console.warn('⚠️ Ошибка включения кэширования:', error.message);
            });
    } else {
        console.log('ℹ️ setPersistenceEnabled не поддерживается в этой версии SDK');
    }
} catch (error) {
    console.warn('⚠️ Ошибка включения кэширования:', error.message);
}

// ============================================
//  АНОНИМНАЯ АУТЕНТИФИКАЦИЯ
// ============================================

// Пытаемся авторизоваться анонимно
if (firebase.auth && typeof firebase.auth().signInAnonymously === 'function') {
    firebase.auth().signInAnonymously()
        .then((userCredential) => {
            const user = userCredential.user;
            console.log('✅ Анонимная аутентификация успешна');
            console.log('🆔 User ID:', user.uid);
        })
        .catch((error) => {
            // Обработка ошибок аутентификации
            console.warn('⚠️ Ошибка аутентификации:', error.code, error.message);
            
            if (error.code === 'auth/configuration-not-found') {
                console.error('❌ Анонимная аутентификация не включена в Firebase Console');
                console.info('ℹ️ Перейдите в Firebase Console → Authentication → Sign-in methods → включите Anonymous');
            } else if (error.code === 'auth/network-request-failed') {
                console.warn('ℹ️ Проверьте подключение к интернету');
            } else {
                console.warn('ℹ️ Продолжаем работу без аутентификации');
            }
        });
} else {
    console.log('ℹ️ Анонимная аутентификация не поддерживается в этой версии SDK');
}

// Экспортируем для использования
if (typeof module !== 'undefined' && module.exports) {
    module.exports = firebase;
}