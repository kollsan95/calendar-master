// js/auth.js

// ============================================
//  АУТЕНТИФИКАЦИЯ
//  Работа с Firebase Realtime Database
// ============================================

// ============================================
//  ГЛОБАЛЬНЫЕ КОНСТАНТЫ
// ============================================

const AUTH_STORAGE_KEY = 'auth_token';
const USER_DATA_KEY = 'user_data';

// Состояние
let currentUser = null;
let isAuthenticated = false;
let authListeners = [];

// ============================================
//  ПРОВЕРКА, ЧТО ФУНКЦИИ ДОСТУПНЫ ГЛОБАЛЬНО
// ============================================

// Убеждаемся, что функции доступны до загрузки app.js
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
//  ВАЛИДАЦИЯ НОМЕРА ТЕЛЕФОНА
// ============================================

function formatPhoneNumber(input) {
    // Убираем все нецифровые символы
    let digits = input.replace(/\D/g, '');
    
    // Если начинается с 8, заменяем на +375
    if (digits.startsWith('8') && digits.length === 11) {
        digits = '375' + digits.slice(1);
    }
    
    // Если есть +375 в начале, оставляем только цифры после +375
    if (digits.startsWith('375')) {
        // Все хорошо
    } else if (digits.startsWith('80') && digits.length === 11) {
        digits = '375' + digits.slice(2);
    } else {
        // Если номер не полный, просто показываем как есть
        if (digits.length === 0) return '+375 ';
        return '+375 ' + digits;
    }
    
    // Форматируем для отображения
    return formatDisplayNumber(digits);
}

function formatDisplayNumber(digits) {
    // Убираем все кроме цифр
    digits = digits.replace(/\D/g, '');
    
    if (digits.length === 0) return '+375 ';
    
    // Если начинается с 375, это белорусский номер
    let result = '+375 ';
    let remaining = digits;
    
    if (digits.startsWith('375')) {
        remaining = digits.slice(3);
        result = '+375 ';
    } else {
        // Если пользователь начал вводить с +375, но не ввел полностью
        if (digits.length < 3) {
            return '+' + digits;
        }
        result = '+375 ';
    }
    
    // Форматируем: +375 (XX) XXX-XX-XX
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
    // Убираем все кроме цифр
    let digits = formatted.replace(/\D/g, '');
    
    // Если начинается с 8, заменяем на 375
    if (digits.startsWith('8') && digits.length === 11) {
        digits = '375' + digits.slice(1);
    }
    
    // Если номер не содержит 375, добавляем
    if (!digits.startsWith('375') && digits.length > 0) {
        digits = '375' + digits;
    }
    
    return digits;
}

function validatePhoneNumber(phone) {
    // Убираем все кроме цифр
    let digits = phone.replace(/\D/g, '');
    
    // Если начинается с 8, заменяем на 375
    if (digits.startsWith('8') && digits.length === 11) {
        digits = '375' + digits.slice(1);
    }
    
    // Проверяем: должно быть 12 цифр (375 + 9 цифр)
    if (digits.length !== 12) return false;
    if (!digits.startsWith('375')) return false;
    
    // Проверяем код оператора (25, 29, 33, 44)
    const operatorCode = digits.slice(3, 5);
    const validOperators = ['25', '29', '33', '44'];
    if (!validOperators.includes(operatorCode)) return false;
    
    return true;
}

// ============================================
//  API ФУНКЦИИ (Firebase Realtime Database)
// ============================================

function checkUserExists(phone) {
    return new Promise((resolve, reject) => {
        const usersRef = firebase.database().ref('users');
        usersRef.orderByChild('phone').equalTo(phone).once('value')
            .then(snapshot => {
                resolve(snapshot.exists());
            })
            .catch(error => {
                reject(new Error('Ошибка подключения к серверу. Проверьте интернет-соединение.'));
            });
    });
}

function registerUser(phone, password, name) {
    return new Promise((resolve, reject) => {
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
                reject(new Error('Ошибка подключения к серверу. Проверьте интернет-соединение.'));
            });
    });
}

function verifyToken(token) {
    return new Promise((resolve, reject) => {
        try {
            // Декодируем base64 в JSON с поддержкой UTF-8
            const decoded = atob(token);
            const jsonString = decodeURIComponent(decoded);
            const userData = JSON.parse(jsonString);
            
            // Проверяем, что данные валидны
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

function generateToken(user) {
    // Используем encodeURIComponent для поддержки кириллицы
    const data = {
        id: user.id,
        phone: user.phone,
        name: user.name,
        timestamp: Date.now()
    };
    
    // Кодируем JSON в base64 с поддержкой UTF-8
    const jsonString = JSON.stringify(data);
    const encoded = encodeURIComponent(jsonString);
    // btoa работает с латиницей, а encodeURIComponent дает латиницу
    return btoa(encoded);
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
    
    // Уведомляем слушателей
    authListeners.forEach(listener => listener(null));
    
    window.location.href = '/login.html';
}

function onAuthChange(callback) {
    authListeners.push(callback);
    // Сразу вызываем с текущим пользователем
    callback(getCurrentUser());
}

// ============================================
//  UI ЛОГИКА (для login.html)
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Проверяем, есть ли уже авторизованный пользователь
    const savedToken = localStorage.getItem(AUTH_STORAGE_KEY);
    if (savedToken) {
        verifyToken(savedToken)
            .then(user => {
                if (user) {
                    currentUser = user;
                    isAuthenticated = true;
                    localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
                    // Если уже на странице входа - редирект на главную
                    if (window.location.pathname.includes('login.html')) {
                        window.location.href = '/';
                    }
                }
            })
            .catch(() => {
                localStorage.removeItem(AUTH_STORAGE_KEY);
                localStorage.removeItem(USER_DATA_KEY);
            });
    }
    
    // Если мы на странице входа - инициализируем логику
    if (window.location.pathname.includes('login.html')) {
        initLoginPage();
    }
});

function initLoginPage() {
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
    
    let currentStep = 'phone';
    let phoneNumber = '';
    let isNewUser = false;
    let isChecking = false;
    let lastValidPhone = '';
    let retryAction = null;
    
    // Функция показа ошибки сети
    function showNetworkError(message) {
        networkErrorText.textContent = '⚠️ ' + message;
        networkError.classList.remove('hidden');
        generalError.classList.add('hidden');
    }
    
    function hideNetworkError() {
        networkError.classList.add('hidden');
    }
    
    function showGeneralError(message) {
        generalError.textContent = '❌ ' + message;
        generalError.classList.remove('hidden');
        networkError.classList.add('hidden');
    }
    
    function hideGeneralError() {
        generalError.classList.add('hidden');
    }
    
    // Форматирование номера при вводе
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
        
        // Валидация
        const clean = getCleanPhoneNumber(this.value);
        const isValid = validatePhoneNumber(clean);
        
        if (this.value.length > 5 && !isValid) {
            this.className = 'form-control error';
            phoneHint.textContent = '❌ Неверный формат. Пример: +375 (25) 123-45-67';
            phoneHint.className = 'hint error';
            nextBtn.disabled = true;
        } else if (this.value.length > 5 && isValid) {
            this.className = 'form-control success';
            phoneHint.textContent = '✅ Номер корректный';
            phoneHint.className = 'hint success';
            nextBtn.disabled = false;
            lastValidPhone = clean;
        } else {
            this.className = 'form-control';
            phoneHint.textContent = 'Введите номер в формате +375 (XX) XXX-XX-XX';
            phoneHint.className = 'hint';
            nextBtn.disabled = true;
        }
    });
    
    // Кнопка "Далее"
    nextBtn.addEventListener('click', async function() {
        if (nextBtn.disabled || isChecking) return;
        
        const clean = getCleanPhoneNumber(phoneInput.value);
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
                authMessage.textContent = '✅ Пользователь найден. Введите пароль.';
                authMessage.style.background = '#E8F5E9';
                authMessage.style.color = '#2E7D32';
                passwordLabel.textContent = 'Пароль';
                passwordHint.textContent = 'Введите ваш пароль (минимум 4 символа)';
                nameGroup.classList.add('hidden');
                authBtn.textContent = 'Войти';
                authBtn.disabled = true;
            } else {
                isNewUser = true;
                authMessage.textContent = '🆕 Новый пользователь! Зарегистрируйтесь.';
                authMessage.style.background = '#FFF3E0';
                authMessage.style.color = '#E65100';
                passwordLabel.textContent = 'Придумайте пароль';
                passwordHint.textContent = 'Минимум 4 символа';
                nameGroup.classList.remove('hidden');
                authBtn.textContent = 'Зарегистрироваться и Войти';
                authBtn.disabled = true;
            }
            
            // Переключаем шаги
            stepPhone.style.display = 'none';
            stepAuth.classList.remove('hidden');
            currentStep = 'auth';
            
            // Проверяем пароль
            checkPasswordAndName();
            
        } catch (error) {
            console.error('Ошибка проверки:', error);
            
            if (error.message && error.message.includes('интернет')) {
                showNetworkError('Нет подключения к интернету. Проверьте соединение и попробуйте снова.');
                retryAction = () => {
                    nextBtn.click();
                };
            } else {
                showGeneralError(error.message || 'Ошибка сервера. Попробуйте позже.');
            }
        } finally {
            isChecking = false;
            nextBtn.disabled = false;
            nextBtn.textContent = 'Далее';
        }
    });
    
    // Кнопка "Повторить"
    retryBtn.addEventListener('click', function() {
        if (retryAction) {
            retryAction();
        }
    });
    
    // Проверка пароля и имени
    function checkPasswordAndName() {
        const password = passwordInput.value;
        const name = nameInput ? nameInput.value : '';
        
        let isValid = true;
        
        // Проверка пароля
        if (password.length < 4) {
            passwordHint.textContent = '❌ Минимум 4 символа';
            passwordHint.className = 'hint error';
            passwordInput.className = 'form-control error';
            isValid = false;
        } else {
            passwordHint.textContent = '✅ Пароль подходит';
            passwordHint.className = 'hint success';
            passwordInput.className = 'form-control success';
        }
        
        // Проверка имени (для нового пользователя)
        if (isNewUser && nameGroup.classList.contains('hidden') === false) {
            if (!name || name.trim().length === 0) {
                nameHint.textContent = '❌ Введите имя';
                nameHint.className = 'hint error';
                nameInput.className = 'form-control error';
                isValid = false;
            } else {
                nameHint.textContent = '✅ Имя заполнено';
                nameHint.className = 'hint success';
                nameInput.className = 'form-control success';
            }
        }
        
        authBtn.disabled = !isValid;
    }
    
    passwordInput.addEventListener('input', function() {
        hideNetworkError();
        hideGeneralError();
        checkPasswordAndName();
    });
    
    if (nameInput) {
        nameInput.addEventListener('input', function() {
            hideNetworkError();
            hideGeneralError();
            checkPasswordAndName();
        });
    }
    
    // Кнопка авторизации / регистрации
    authBtn.addEventListener('click', async function() {
        if (authBtn.disabled || isChecking) return;
        
        const password = passwordInput.value;
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
                
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Ошибка:', error);
            
            if (error.message && (error.message.includes('интернет') || error.message.includes('сервер'))) {
                showNetworkError(error.message);
                retryAction = () => {
                    authBtn.click();
                };
            } else {
                showGeneralError(error.message || 'Ошибка. Попробуйте позже.');
            }
            
            authBtn.disabled = false;
            authBtn.textContent = isNewUser ? 'Зарегистрироваться' : 'Войти';
        } finally {
            isChecking = false;
        }
    });
    
    // Обработка Enter
    phoneInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !nextBtn.disabled) {
            nextBtn.click();
        }
    });
    
    passwordInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !authBtn.disabled) {
            authBtn.click();
        }
    });
    
    if (nameInput) {
        nameInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !authBtn.disabled) {
                authBtn.click();
            }
        });
    }
}

// ============================================
//  ЭКСПОРТ ДЛЯ ИСПОЛЬЗОВАНИЯ В ДРУГИХ ФАЙЛАХ
// ============================================

// Экспортируем функции в глобальную область
window.auth = {
    getCurrentUser: getCurrentUser,
    isUserAuthenticated: isUserAuthenticated,
    logout: logout,
    onAuthChange: onAuthChange,
    validatePhoneNumber: validatePhoneNumber,
    formatPhoneNumber: formatPhoneNumber,
    getCleanPhoneNumber: getCleanPhoneNumber
};

console.log('✅ Auth.js загружен');