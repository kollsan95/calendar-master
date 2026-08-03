// auth.js - для защиты данных

class FirebaseAuth {
    // Анонимная авторизация (простой вариант)
    async signInAnonymously() {
        try {
            const result = await firebase.auth().signInAnonymously();
            return result.user;
        } catch (error) {
            console.error('Ошибка авторизации:', error);
            throw error;
        }
    }
    
    // Авторизация по email (если нужна)
    async signIn(email, password) {
        try {
            const result = await firebase.auth().signInWithEmailAndPassword(email, password);
            return result.user;
        } catch (error) {
            console.error('Ошибка входа:', error);
            throw error;
        }
    }
}