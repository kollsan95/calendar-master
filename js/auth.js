// js/auth.js

// ============================================
//  АУТЕНТИФИКАЦИЯ
//  Работа с Firebase Realtime Database
// ============================================

// === ГЛОБАЛЬНЫЕ КОНСТАНТЫ ===
const AUTH_STORAGE_KEY = 'auth_token';
const USER_DATA_KEY = 'user_data';

// Состояние
let currentUser = null;
let isAuthenticated = false;
let authListeners = [];

// ============================================
//  ПРОВЕРКА, ЧТО ФУНКЦИИ ДОСТУПНЫ ГЛОБАЛЬНО
// ============================================

window.isUserAuthenticated = function() {
    const token = localStorage.getItem(AUTH_STORAGE_KEY);
    const userData = localStorage.getItem(USER_DATA_KEY);
    return !!(token && userData);
};

window.getCurrentUser = function() {
    try {
        const data = localStorage.getItem(USER_DATA_KEY);
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {}
    return null;
};

// ============================================
//  УСТАНОВКА ПОЛЬЗОВАТЕЛЯ
// ============================================

function setCurrentUser(user) {
    currentUser = user;
    isAuthenticated = true;
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
    authListeners.forEach(listener => listener(user));
}

// ============================================
//  ВАЛИДАЦИЯ НОМЕРА ТЕЛЕФОНА
// ============================================

function formatPhoneNumber(input) {
    let digits = input.replace(/\D/g, '');
    
    if (digits.startsWith('8') && digits.length === 11) {
        digits = '375' + digits.slice(1);
    }
    
    if (digits.startsWith('375')) {
        // Все хорошо
    } else if (digits.startsWith('80') && digits.length === 11) {
        digits = '375' + digits.slice(2);
    } else {
        if (digits.length === 0) return '+375 ';
        return '+375 ' + digits;
    }
    
    return formatDisplayNumber(digits);
}

function formatDisplayNumber(digits) {
    digits = digits.replace(/\D/g, '');
    
    if (digits.length === 0) return '+375 ';
    
    let result = '+375 ';
    let remaining = digits;
    
    if (digits.startsWith('375')) {
        remaining = digits.slice(3);
        result = '+375 ';
    } else {
        if (digits.length < 3) {
            return '+' + digits;
        }
        result = '+375 ';
    }
    
    if (remaining.length > 0) {
        result += '(' + remaining.slice(0, 2);
        if (remaining.length > 2) {
            result += ') ' + remaining.slice(2, 5);
        }
        if (remaining.length > 5) {
            result += '-' + remaining.slice(5, 7);
        }
        if (remaining.length > 7) {
            result += '-' + remaining.slice(7, 9);
        }
    }
    
    return result;
}

function getCleanPhoneNumber(formatted) {
    let digits = formatted.replace(/\D/g, '');
    
    if (digits.startsWith('8') && digits.length === 11) {
        digits = '375' + digits.slice(1);
    }
    
    if (!digits.startsWith('375') && digits.length > 0) {
        digits = '375' + digits;
    }
    
    return digits;
}

function validatePhoneNumber(phone) {
    let digits = phone.replace(/\D/g, '');
    
    if (digits.startsWith('8') && digits.length === 11) {
        digits = '375' + digits.slice(1);
    }
    
    if (digits.length !== 12) return false;
    if (!digits.startsWith('375')) return false;
    
    const operatorCode = digits.slice(3, 5);
    const validOperators = ['25', '29', '33', '44'];
    if (!validOperators.includes(operatorCode)) return false;
    
    return true;
}

// ============================================
//  ФУНКЦИИ ДЛЯ РАБОТЫ С ТОКЕНОМ
// ============================================

function generateToken(user) {
    const data = {
        id: user.id,
        phone: user.phone,
        name: user.name,
        timestamp: Date.now()
    };
    const jsonString = JSON.stringify(data);
    const encoded = encodeURIComponent(jsonString);
    return btoa(encoded);
}

function verifyToken(token) {
    return new Promise((resolve, reject) => {
        try {
            const decoded = atob(token);
            const jsonString = decodeURIComponent(decoded);
            const userData = JSON.parse(jsonString);
            
            if (userData.id && userData.phone) {
                resolve(userData);
            } else {
                reject(new Error('Invalid token data'));
            }
        } catch (e) {
            reject(e);
        }
    });
}

// ============================================
//  ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ИНИЦИАЛИЗАЦИИ FIREBASE
// ============================================

function ensureFirebaseInitialized() {
    // Проверяем, что Firebase доступен
    if (typeof firebase === 'undefined' || !firebase.database) {
        console.error('❌ Firebase SDK не загружен');
        return false;
    }
    
    try {
        // Проверяем, инициализирован ли Firebase
        const app = firebase.app();
        if (app) {
            console.log('✅ Firebase уже инициализирован');
            return true;
        }
    } catch (e) {
        // Firebase не инициализирован - пробуем инициализировать
        console.log('🔄 Firebase не инициализирован, пробуем инициализировать...');
        
        try {
            // Конфиг из firebase-config.js
            const config = {
                apiKey: "AIzaSyDOuiG6Q5a-5o2jU0s-XlM5W1VljBeV-Cs",
                authDomain: "calendar-master-d7c34.firebaseapp.com",
                databaseURL: "https://calendar-master-d7c34-default-rtdb.europe-west1.firebasedatabase.app",
                projectId: "calendar-master-d7c34",
                storageBucket: "calendar-master-d7c34.appspot.com",
                messagingSenderId: "815197979285",
                appId: "1:815197979285:web:4ee6f687eb29ed5730d19c"
            };
            
            firebase.initializeApp(config);
            console.log('✅ Firebase инициализирован из auth.js');
            
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

// ============================================
//  API ФУНКЦИИ (Firebase Realtime Database)
// ============================================

function checkUserExists(phone) {
    return new Promise((resolve, reject) => {
        // ✅ Убеждаемся, что Firebase инициализирован
        if (!ensureFirebaseInitialized()) {
            reject(new Error('Firebase не инициализирован. Проверьте подключение к интернету.'));
            return;
        }
        
        const usersRef = firebase.database().ref('users');
        usersRef.orderByChild('phone').equalTo(phone).once('value')
            .then(snapshot => {
                resolve(snapshot.exists());
            })
            .catch(error => {
                console.error('❌ Ошибка проверки пользователя:', error);
                reject(new Error('Ошибка подключения к серверу. Проверьте интернет-соединение.'));
            });
    });
}

function registerUser(phone, password, name) {
    return new Promise((resolve, reject) => {
        // ✅ Убеждаемся, что Firebase инициализирован
        if (!ensureFirebaseInitialized()) {
            reject(new Error('Firebase не инициализирован. Проверьте подключение к интернету.'));
            return;
        }
        
        const usersRef = firebase.database().ref('users');
        
        usersRef.orderByChild('phone').equalTo(phone).once('value')
            .then(snapshot => {
                if (snapshot.exists()) {
                    reject(new Error('Этот номер уже зарегистрирован'));
                    return;
                }
                
                const newUserRef = usersRef.push();
                const userData = {
                    id: newUserRef.key,
                    phone: phone,
                    password: password,
                    name: name,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    role: 'master'
                };
                
                return newUserRef.set(userData);
            })
            .then(() => {
                return usersRef.orderByChild('phone').equalTo(phone).once('value');
            })
            .then(snapshot => {
                const user = snapshot.val();
                const key = Object.keys(user)[0];
                resolve({
                    id: key,
                    phone: user[key].phone,
                    name: user[key].name,
                    role: user[key].role
                });
            })
            .catch(error => {
                console.error('❌ Ошибка регистрации:', error);
                if (error.message && error.message.includes('internet')) {
                    reject(error);
                } else {
                    reject(new Error('Ошибка сервера. Попробуйте позже.'));
                }
            });
    });
}

function loginUser(phone, password) {
    return new Promise((resolve, reject) => {
        // ✅ Убеждаемся, что Firebase инициализирован
        if (!ensureFirebaseInitialized()) {
            reject(new Error('Firebase не инициализирован. Проверьте подключение к интернету.'));
            return;
        }
        
        const usersRef = firebase.database().ref('users');
        usersRef.orderByChild('phone').equalTo(phone).once('value')
            .then(snapshot => {
                if (!snapshot.exists()) {
                    reject(new Error('Пользователь не найден'));
                    return;
                }
                
                const user = snapshot.val();
                const key = Object.keys(user)[0];
                const userData = user[key];
                
                if (userData.password !== password) {
                    reject(new Error('Неверный пароль'));
                    return;
                }
                
                resolve({
                    id: key,
                    phone: userData.phone,
                    name: userData.name,
                    role: userData.role
                });
            })
            .catch(error => {
                console.error('❌ Ошибка входа:', error);
                reject(new Error('Ошибка подключения к серверу. Проверьте интернет-соединение.'));
            });
    });
}

// ============================================
//  ОФФЛАЙН-РЕЖИМ
// ============================================

function isOfflineMode() {
    try {
        return localStorage.getItem('offline_mode') === 'true';
    } catch { return false; }
}

function setOfflineMode(enabled) {
    localStorage.setItem('offline_mode', String(enabled));
}

function getOfflineUser() {
    try {
        const data = localStorage.getItem('offline_user');
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

function setOfflineUser(name) {
    const user = {
        id: 'offline_' + Date.now(),
        name: name || 'Мастер',
        phone: '',
        role: 'master',
        isOffline: true
    };
    localStorage.setItem('offline_user', JSON.stringify(user));
    return user;
}

function clearOfflineUser() {
    localStorage.removeItem('offline_user');
}

function loginOffline(name) {
    const user = {
        id: 'offline_' + Date.now(),
        name: name || 'Мастер',
        phone: 'offline',
        role: 'master',
        isOffline: true
    };
    
    setOfflineMode(true);
    setOfflineUser(name);
    
    const token = generateToken(user);
    
    localStorage.setItem(AUTH_STORAGE_KEY, token);
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
    
    currentUser = user;
    isAuthenticated = true;
    
    authListeners.forEach(listener => listener(user));
    
    window.location.href = '/';
}

// ============================================
//  ПОЛЬЗОВАТЕЛЬСКИЕ ФУНКЦИИ
// ============================================

function getCurrentUser() {
    if (currentUser) return currentUser;
    
    try {
        const data = localStorage.getItem(USER_DATA_KEY);
        if (data) {
            currentUser = JSON.parse(data);
            isAuthenticated = true;
            return currentUser;
        }
    } catch (e) {}
    
    return null;
}

function isUserAuthenticated() {
    const token = localStorage.getItem(AUTH_STORAGE_KEY);
    const userData = localStorage.getItem(USER_DATA_KEY);
    return !!(token && userData);
}

function logout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(USER_DATA_KEY);
    currentUser = null;
    isAuthenticated = false;
    
    authListeners.forEach(listener => listener(null));
    
    window.location.href = '/login.html';
}

function onAuthChange(callback) {
    authListeners.push(callback);
    callback(getCurrentUser());
}

// ============================================
//  СОЗДАНИЕ МОДАЛКИ ДЛЯ ОФФЛАЙН-РЕЖИМА
// ============================================

function createOfflineModal() {
    if (document.getElementById('offlineModal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'offlineModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width:400px;">
            <h3 style="margin:0 0 16px 0;text-align:center;">📴 Работа оффлайн</h3>
            <p style="text-align:center;color:#7B8D8E;margin-bottom:16px;font-size:14px;">Введите имя для работы без интернета</p>
            <div class="form-group">
                <label>Имя пользователя</label>
                <input type="text" id="offlineNameInput" class="form-control" placeholder="Введите ваше имя" value="Мастер">
            </div>
            <div style="display:flex;gap:12px;margin-top:16px;">
                <button class="btn btn-cancel" id="offlineCancelBtn" style="flex:1;">Отмена</button>
                <button class="btn btn-primary" id="offlineConfirmBtn" style="flex:1;">Начать</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    console.log('✅ Модалка оффлайн-режима создана');
}

// ============================================
//  ОЧИСТКА ТОКЕНА ПРИ FORCE_ONLINE
// ============================================

function clearAuthForOnlineLogin() {
    // Удаляем старый токен
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(USER_DATA_KEY);
    currentUser = null;
    isAuthenticated = false;
    console.log('🗑️ Токен очищен для входа в облако');
}

// ============================================
//  UI ЛОГИКА ДЛЯ LOGIN.HTML
// ============================================

function initLoginPage() {
    console.log('📱 initLoginPage вызван');
    
    // ✅ Проверяем параметр mode=online в URL
    const urlParams = new URLSearchParams(window.location.search);
    const forceOnline = urlParams.get('mode') === 'online';
    
    // ✅ Также проверяем sessionStorage
    const forceOnlineFromSession = sessionStorage.getItem('force_online') === 'true';
    const syncOnLogin = sessionStorage.getItem('sync_on_login') === 'true';
    
    const isForceOnline = forceOnline || forceOnlineFromSession;
    
    console.log('📱 forceOnline (url):', forceOnline);
    console.log('📱 forceOnline (session):', forceOnlineFromSession);
    console.log('📱 isForceOnline:', isForceOnline);
    console.log('📱 syncOnLogin:', syncOnLogin);
    
    // ✅ Если forceOnline - очищаем старый токен и отключаем оффлайн-режим
    if (isForceOnline) {
        // Очищаем флаги из sessionStorage
        sessionStorage.removeItem('force_online');
        if (syncOnLogin) {
            localStorage.setItem('sync_on_login', 'true');
            sessionStorage.removeItem('sync_on_login');
        }
        
        // Очищаем старый токен
        clearAuthForOnlineLogin();
        
        // Временно отключаем оффлайн-режим
        const wasOffline = localStorage.getItem('offline_mode') === 'true';
        if (wasOffline) {
            localStorage.setItem('offline_mode_temp', 'true');
            localStorage.setItem('offline_mode', 'false');
            console.log('📴 Временно отключен оффлайн-режим для входа в облако');
        }
        
        // ✅ Инициализируем Firebase
        ensureFirebaseInitialized();
    }
    
    // Создаем модалку для оффлайн-режима (только если не forceOnline)
    if (!isForceOnline) {
        createOfflineModal();
    }
    
    // Получаем элементы
    const phoneInput = document.getElementById('phoneInput');
    const nextBtn = document.getElementById('nextBtn');
    const phoneHint = document.getElementById('phoneHint');
    const stepPhone = document.getElementById('stepPhone');
    const stepAuth = document.getElementById('stepAuth');
    const authBtn = document.getElementById('authBtn');
    const passwordInput = document.getElementById('passwordInput');
    const nameInput = document.getElementById('nameInput');
    const nameGroup = document.getElementById('nameGroup');
    const authMessage = document.getElementById('authMessage');
    const passwordLabel = document.getElementById('passwordLabel');
    const passwordHint = document.getElementById('passwordHint');
    const nameHint = document.getElementById('nameHint');
    const networkError = document.getElementById('networkError');
    const networkErrorText = document.getElementById('networkErrorText');
    const retryBtn = document.getElementById('retryBtn');
    const generalError = document.getElementById('generalError');
    
    let phoneNumber = '';
    let isNewUser = false;
    let isChecking = false;
    let retryAction = null;
    
    // ============================================
    //  ПОКАЗАТЬ/СКРЫТЬ ОШИБКИ
    // ============================================
    
    function showNetworkError(message) {
        if (networkErrorText) networkErrorText.textContent = '⚠️ ' + message;
        if (networkError) networkError.classList.remove('hidden');
        if (generalError) generalError.classList.add('hidden');
    }
    
    function hideNetworkError() {
        if (networkError) networkError.classList.add('hidden');
    }
    
    function showGeneralError(message) {
        if (generalError) {
            generalError.textContent = '❌ ' + message;
            generalError.classList.remove('hidden');
        }
        if (networkError) networkError.classList.add('hidden');
    }
    
    function hideGeneralError() {
        if (generalError) generalError.classList.add('hidden');
    }
    
    // ============================================
    //  СОЗДАНИЕ КНОПКИ "РАБОТАТЬ ОФФЛАЙН"
    //  (только если не forceOnline)
    // ============================================
    
    const existingOfflineBtn = document.getElementById('offlineBtn');
    if (!existingOfflineBtn && !isForceOnline) {
        const stepPhoneEl = document.getElementById('stepPhone');
        if (stepPhoneEl) {
            const btn = document.createElement('button');
            btn.id = 'offlineBtn';
            btn.className = 'btn btn-secondary';
            btn.style.cssText = 'width:100%;padding:14px;border:none;border-radius:12px;font-size:16px;font-weight:600;font-family:\'Montserrat\',sans-serif;cursor:pointer;background:#E0F2F1;color:#008080;margin-top:8px;';
            btn.textContent = '📴 Работать оффлайн';
            stepPhoneEl.appendChild(btn);
        }
    }
    
    // ============================================
    //  ИНФОРМАЦИОННОЕ СООБЩЕНИЕ ДЛЯ FORCE_ONLINE
    // ============================================
    
    if (isForceOnline) {
        const stepPhoneEl = document.getElementById('stepPhone');
        if (stepPhoneEl) {
            // Удаляем старое сообщение, если есть
            const oldInfo = document.getElementById('forceOnlineInfo');
            if (oldInfo) oldInfo.remove();
            
            const infoMsg = document.createElement('div');
            infoMsg.id = 'forceOnlineInfo';
            infoMsg.style.cssText = 'background:#E8F5E9;color:#2E7D32;padding:12px;border-radius:8px;margin-bottom:16px;text-align:center;font-weight:500;font-size:14px;border:1px solid #A5D6A7;';
            infoMsg.innerHTML = '☁️ <strong>Подключение к облаку</strong><br><span style="font-weight:400;font-size:13px;">Войдите или зарегистрируйтесь для синхронизации данных</span>';
            stepPhoneEl.prepend(infoMsg);
        }
    }
    
    // ============================================
    //  ОБРАБОТЧИКИ
    // ============================================
    
    // Обработчик кнопки "Работать оффлайн"
    const offlineBtn = document.getElementById('offlineBtn');
    const offlineModal = document.getElementById('offlineModal');
    const offlineNameInput = document.getElementById('offlineNameInput');
    const offlineCancelBtn = document.getElementById('offlineCancelBtn');
    const offlineConfirmBtn = document.getElementById('offlineConfirmBtn');
    
    if (offlineBtn) {
        offlineBtn.addEventListener('click', function() {
            if (offlineModal) {
                offlineModal.style.display = 'flex';
                if (offlineNameInput) {
                    setTimeout(() => {
                        offlineNameInput.focus();
                        offlineNameInput.select();
                    }, 100);
                }
            }
        });
    }
    
    if (offlineCancelBtn) {
        offlineCancelBtn.addEventListener('click', function() {
            if (offlineModal) offlineModal.style.display = 'none';
        });
    }
    
    if (offlineConfirmBtn) {
        offlineConfirmBtn.addEventListener('click', function() {
            const name = offlineNameInput ? offlineNameInput.value.trim() || 'Мастер' : 'Мастер';
            loginOffline(name);
        });
    }
    
    if (offlineNameInput) {
        offlineNameInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (offlineConfirmBtn) offlineConfirmBtn.click();
            }
        });
    }
    
    if (offlineModal) {
        offlineModal.addEventListener('click', function(e) {
            if (e.target === this) {
                offlineModal.style.display = 'none';
            }
        });
    }
    
    // ============================================
    //  ОБРАБОТЧИК ВВОДА ТЕЛЕФОНА
    // ============================================
    
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            hideNetworkError();
            hideGeneralError();
            
            const cursorPos = this.selectionStart;
            const raw = this.value;
            const formatted = formatPhoneNumber(raw);
            
            if (formatted !== raw) {
                this.value = formatted;
                const newPos = cursorPos + (formatted.length - raw.length);
                this.setSelectionRange(newPos, newPos);
            }
            
            const clean = getCleanPhoneNumber(this.value);
            const isValid = validatePhoneNumber(clean);
            
            if (this.value.length > 5 && !isValid) {
                this.className = 'form-control error';
                if (phoneHint) {
                    phoneHint.textContent = '❌ Неверный формат. Пример: +375 (25) 123-45-67';
                    phoneHint.className = 'hint error';
                }
                if (nextBtn) nextBtn.disabled = true;
            } else if (this.value.length > 5 && isValid) {
                this.className = 'form-control success';
                if (phoneHint) {
                    phoneHint.textContent = '✅ Номер корректный';
                    phoneHint.className = 'hint success';
                }
                if (nextBtn) nextBtn.disabled = false;
            } else {
                this.className = 'form-control';
                if (phoneHint) {
                    phoneHint.textContent = 'Введите номер в формате +375 (XX) XXX-XX-XX';
                    phoneHint.className = 'hint';
                }
                if (nextBtn) nextBtn.disabled = true;
            }
        });
    }
    
    // ============================================
    //  ОБРАБОТЧИК КНОПКИ "ДАЛЕЕ"
    // ============================================
    
    if (nextBtn) {
        nextBtn.addEventListener('click', async function() {
            if (nextBtn.disabled || isChecking) return;
            
            const clean = getCleanPhoneNumber(phoneInput ? phoneInput.value : '');
            if (!validatePhoneNumber(clean)) return;
            
            phoneNumber = clean;
            isChecking = true;
            hideNetworkError();
            hideGeneralError();
            nextBtn.disabled = true;
            nextBtn.innerHTML = '<span class="spinner-small"></span> Проверка...';
            
            try {
                const userExists = await checkUserExists(phoneNumber);
                
                if (userExists) {
                    isNewUser = false;
                    if (authMessage) {
                        authMessage.textContent = '✅ Пользователь найден. Введите пароль.';
                        authMessage.style.background = '#E8F5E9';
                        authMessage.style.color = '#2E7D32';
                    }
                    if (passwordLabel) passwordLabel.textContent = 'Пароль';
                    if (passwordHint) {
                        passwordHint.textContent = 'Введите ваш пароль (минимум 4 символа)';
                        passwordHint.className = 'hint';
                    }
                    if (nameGroup) nameGroup.classList.add('hidden');
                    if (authBtn) authBtn.textContent = 'Войти';
                    if (authBtn) authBtn.disabled = true;
                } else {
                    isNewUser = true;
                    if (authMessage) {
                        authMessage.textContent = '🆕 Новый пользователь! Зарегистрируйтесь.';
                        authMessage.style.background = '#FFF3E0';
                        authMessage.style.color = '#E65100';
                    }
                    if (passwordLabel) passwordLabel.textContent = 'Придумайте пароль';
                    if (passwordHint) {
                        passwordHint.textContent = 'Минимум 4 символа';
                        passwordHint.className = 'hint';
                    }
                    if (nameGroup) nameGroup.classList.remove('hidden');
                    if (authBtn) authBtn.textContent = 'Зарегистрироваться и Войти';
                    if (authBtn) authBtn.disabled = true;
                }
                
                if (stepPhone) stepPhone.style.display = 'none';
                if (stepAuth) stepAuth.classList.remove('hidden');
                
                checkPasswordAndName();
                
            } catch (error) {
                console.error('Ошибка проверки:', error);
                
                if (error.message && error.message.includes('интернет')) {
                    showNetworkError('Нет подключения к интернету. Проверьте соединение и попробуйте снова.');
                    retryAction = () => { if (nextBtn) nextBtn.click(); };
                } else {
                    showGeneralError(error.message || 'Ошибка сервера. Попробуйте позже.');
                }
            } finally {
                isChecking = false;
                nextBtn.disabled = false;
                nextBtn.textContent = 'Далее';
            }
        });
    }
    
    // ============================================
    //  ОБРАБОТЧИК RETRY
    // ============================================
    
    if (retryBtn) {
        retryBtn.addEventListener('click', function() {
            if (retryAction) retryAction();
        });
    }
    
    // ============================================
    //  ПРОВЕРКА ПАРОЛЯ И ИМЕНИ
    // ============================================
    
    function checkPasswordAndName() {
        const password = passwordInput ? passwordInput.value : '';
        const name = nameInput ? nameInput.value : '';
        let isValid = true;
        
        if (password.length < 4) {
            if (passwordHint) {
                passwordHint.textContent = '❌ Минимум 4 символа';
                passwordHint.className = 'hint error';
            }
            if (passwordInput) passwordInput.className = 'form-control error';
            isValid = false;
        } else {
            if (passwordHint) {
                passwordHint.textContent = '✅ Пароль подходит';
                passwordHint.className = 'hint success';
            }
            if (passwordInput) passwordInput.className = 'form-control success';
        }
        
        if (isNewUser && nameGroup && !nameGroup.classList.contains('hidden')) {
            if (!name || name.trim().length === 0) {
                if (nameHint) {
                    nameHint.textContent = '❌ Введите имя';
                    nameHint.className = 'hint error';
                }
                if (nameInput) nameInput.className = 'form-control error';
                isValid = false;
            } else {
                if (nameHint) {
                    nameHint.textContent = '✅ Имя заполнено';
                    nameHint.className = 'hint success';
                }
                if (nameInput) nameInput.className = 'form-control success';
            }
        }
        
        if (authBtn) authBtn.disabled = !isValid;
    }
    
    // ============================================
    //  ОБРАБОТЧИКИ ВВОДА ПАРОЛЯ И ИМЕНИ
    // ============================================
    
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            hideNetworkError();
            hideGeneralError();
            checkPasswordAndName();
        });
    }
    
    if (nameInput) {
        nameInput.addEventListener('input', function() {
            hideNetworkError();
            hideGeneralError();
            checkPasswordAndName();
        });
    }
    
    // ============================================
    //  ОБРАБОТЧИК КНОПКИ АВТОРИЗАЦИИ
    // ============================================
    
    if (authBtn) {
        authBtn.addEventListener('click', async function() {
            if (authBtn.disabled || isChecking) return;
            
            const password = passwordInput ? passwordInput.value : '';
            const name = nameInput ? nameInput.value.trim() : '';
            
            if (password.length < 4) return;
            if (isNewUser && (!name || name.length === 0)) return;
            
            isChecking = true;
            hideNetworkError();
            hideGeneralError();
            authBtn.disabled = true;
            authBtn.innerHTML = '<span class="spinner-small"></span> Обработка...';
            
            try {
                let user;
                if (isNewUser) {
                    user = await registerUser(phoneNumber, password, name);
                } else {
                    user = await loginUser(phoneNumber, password);
                }
                
                if (user) {
                    const token = generateToken(user);
                    localStorage.setItem(AUTH_STORAGE_KEY, token);
                    localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
                    currentUser = user;
                    isAuthenticated = true;
                    
                    // ✅ Проверяем, нужно ли синхронизировать локальные записи
                    const syncOnLogin = localStorage.getItem('sync_on_login');
                    if (syncOnLogin === 'true') {
                        localStorage.removeItem('sync_on_login');
                        sessionStorage.setItem('sync_after_login', 'true');
                    }
                    
                    // ✅ Если был включен оффлайн-режим и пользователь вошел в облако
                    // отключаем оффлайн-режим (теперь работаем онлайн)
                    const wasOfflineTemp = localStorage.getItem('offline_mode_temp');
                    if (wasOfflineTemp === 'true') {
                        localStorage.removeItem('offline_mode_temp');
                        localStorage.setItem('offline_mode', 'false');
                        console.log('✅ Оффлайн-режим отключен, работаем онлайн');
                    }
                    
                    // ✅ Если был forceOnline, удаляем временный флаг
                    if (isForceOnline) {
                        const infoMsg = document.getElementById('forceOnlineInfo');
                        if (infoMsg) infoMsg.remove();
                    }
                    
                    window.location.href = '/';
                }
            } catch (error) {
                console.error('Ошибка:', error);
                
                if (error.message && (error.message.includes('интернет') || error.message.includes('сервер'))) {
                    showNetworkError(error.message);
                    retryAction = () => { if (authBtn) authBtn.click(); };
                } else {
                    showGeneralError(error.message || 'Ошибка. Попробуйте позже.');
                }
                
                authBtn.disabled = false;
                authBtn.textContent = isNewUser ? 'Зарегистрироваться' : 'Войти';
            } finally {
                isChecking = false;
            }
        });
    }
    
    // ============================================
    //  ОБРАБОТЧИКИ КЛАВИШ ENTER
    // ============================================
    
    if (phoneInput) {
        phoneInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && nextBtn && !nextBtn.disabled) {
                if (nextBtn) nextBtn.click();
            }
        });
    }
    
    if (passwordInput) {
        passwordInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && authBtn && !authBtn.disabled) {
                if (authBtn) authBtn.click();
            }
        });
    }
    
    if (nameInput) {
        nameInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && authBtn && !authBtn.disabled) {
                if (authBtn) authBtn.click();
            }
        });
    }
    
    console.log('✅ initLoginPage завершен');
}

// ============================================
//  DOM CONTENT LOADED
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM загружен');
    console.log('📍 Текущий URL:', window.location.href);
    console.log('📍 Путь:', window.location.pathname);
    
    // ✅ Проверяем параметр mode=online в URL
    const urlParams = new URLSearchParams(window.location.search);
    const forceOnlineFromUrl = urlParams.get('mode') === 'online';
    
    // ✅ Проверяем sessionStorage
    const forceOnlineFromSession = sessionStorage.getItem('force_online') === 'true';
    const syncOnLogin = sessionStorage.getItem('sync_on_login') === 'true';
    
    const forceOnline = forceOnlineFromUrl || forceOnlineFromSession;
    
    console.log('📋 Параметры URL:', urlParams.toString());
    console.log('📋 forceOnline (url):', forceOnlineFromUrl);
    console.log('📋 forceOnline (session):', forceOnlineFromSession);
    console.log('📋 forceOnline (итог):', forceOnline);
    console.log('📋 syncOnLogin:', syncOnLogin);
    
    // ✅ Если мы на странице входа с параметром mode=online или флагом из sessionStorage
    if (window.location.pathname.includes('login.html') && forceOnline) {
        console.log('🔵 forceOnline режим активирован');
        
        // Очищаем флаги из sessionStorage
        sessionStorage.removeItem('force_online');
        if (syncOnLogin) {
            localStorage.setItem('sync_on_login', 'true');
            sessionStorage.removeItem('sync_on_login');
        }
        
        // Очищаем токен, чтобы не было автоматического входа
        clearAuthForOnlineLogin();
        
        // Отключаем оффлайн-режим
        if (localStorage.getItem('offline_mode') === 'true') {
            localStorage.setItem('offline_mode_temp', 'true');
            localStorage.setItem('offline_mode', 'false');
            console.log('📴 Временно отключен оффлайн-режим для входа в облако');
        }
        
        // ✅ Инициализируем Firebase
        ensureFirebaseInitialized();
        
        // Инициализируем страницу входа
        initLoginPage();
        return;
    }
    
    // Проверяем, есть ли уже авторизованный пользователь (только если не forceOnline)
    const savedToken = localStorage.getItem(AUTH_STORAGE_KEY);
    if (savedToken) {
        verifyToken(savedToken)
            .then(user => {
                if (user) {
                    currentUser = user;
                    isAuthenticated = true;
                    localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
                    
                    if (window.location.pathname.includes('login.html')) {
                        window.location.href = '/';
                    }
                }
            })
            .catch(() => {
                localStorage.removeItem(AUTH_STORAGE_KEY);
                localStorage.removeItem(USER_DATA_KEY);
                if (localStorage.getItem('offline_mode_temp') === 'true') {
                    localStorage.setItem('offline_mode', 'true');
                    localStorage.removeItem('offline_mode_temp');
                }
            });
    }
    
    // Если мы на странице входа - инициализируем логику
    if (window.location.pathname.includes('login.html')) {
        initLoginPage();
    }
});

// ============================================
//  ЭКСПОРТ
// ============================================

window.auth = {
    getCurrentUser: getCurrentUser,
    isUserAuthenticated: isUserAuthenticated,
    logout: logout,
    onAuthChange: onAuthChange,
    validatePhoneNumber: validatePhoneNumber,
    formatPhoneNumber: formatPhoneNumber,
    getCleanPhoneNumber: getCleanPhoneNumber,
    setCurrentUser: setCurrentUser,
    loginOffline: loginOffline,
    isOfflineMode: isOfflineMode,
    getOfflineUser: getOfflineUser,
    setOfflineMode: setOfflineMode,
    clearAuthForOnlineLogin: clearAuthForOnlineLogin,
    ensureFirebaseInitialized: ensureFirebaseInitialized
};

console.log('✅ Auth.js загружен');