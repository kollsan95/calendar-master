// js/settings.js

// ============================================
//  НАСТРОЙКИ - ОТДЕЛЬНАЯ СТРАНИЦА
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('⚙️ Страница настроек загружена');
    
    if (typeof isUserAuthenticated === 'undefined' || !isUserAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }
    
    initSettingsPage();
});

// ============================================
//  ОСНОВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ
// ============================================

function initSettingsPage() {
    console.log('🔧 Инициализация настроек...');
    
    // === ПОЛЬЗОВАТЕЛЬ ===
    const user = getCurrentUser ? getCurrentUser() : null;
    const userNameEl = document.getElementById('settingsUserName');
    const userPhoneEl = document.getElementById('settingsUserPhone');
    
    if (user) {
        if (userNameEl) {
            userNameEl.textContent = user.name || 'Пользователь';
        }
        if (userPhoneEl) {
            userPhoneEl.textContent = user.phone || '';
        }
        console.log('👤 Пользователь загружен:', user.name);
    } else {
        console.warn('⚠️ Пользователь не найден');
        if (userNameEl) {
            userNameEl.textContent = 'Не авторизован';
        }
    }
    
    // === КНОПКА ПОДКЛЮЧЕНИЯ К ОБЛАКУ ===
    createCloudConnectButton();
    
    // === ЦВЕТА ===
    if (typeof renderSettingsColors === 'function') {
        renderSettingsColors();
        console.log('🎨 Цвета отрендерены');
    }
    
    // === ОЧИСТКА ===
    if (typeof renderCleanupSettings === 'function') {
        renderCleanupSettings();
    }
    
    // === АДМИН ===
    if (typeof updateAdminSliderUI === 'function') {
        updateAdminSliderUI();
    }
    
    // === ОБРАБОТЧИКИ ===
    initHandlers();
    
    console.log('✅ Настройки инициализированы');
}

// ============================================
//  СОЗДАНИЕ КНОПКИ ПОДКЛЮЧЕНИЯ К ОБЛАКУ
// ============================================

function createCloudConnectButton() {
    const container = document.getElementById('settingsLogoutContainer');
    if (!container) return;
    
    // Проверяем, есть ли уже кнопка
    if (document.getElementById('settingsConnectBtn')) return;
    
    // Проверяем, в оффлайн-режиме ли пользователь
    const isOffline = typeof isOfflineMode === 'function' ? isOfflineMode() : false;
    
    if (!isOffline) return;
    
    // Находим блок с пользователем
    const userInfoDiv = container.querySelector('div:first-child');
    if (!userInfoDiv) return;
    
    // Создаем кнопку подключения
    const connectBtn = document.createElement('button');
    connectBtn.id = 'settingsConnectBtn';
    connectBtn.className = 'btn btn-outline';
    connectBtn.style.cssText = 'padding:6px 12px;border-radius:8px;font-size:13px;border:none;cursor:pointer;background:#E0F2F1;color:#008080;font-weight:600;font-family:"Montserrat",sans-serif;';
    connectBtn.innerHTML = '☁️ Подключиться к облаку';
    connectBtn.title = 'Подключиться к облаку и синхронизировать данные';
    
    // Добавляем кнопку в контейнер
    const btnContainer = container.querySelector('div:last-child') || container;
    btnContainer.appendChild(connectBtn);
    
    // Обработчик
    connectBtn.addEventListener('click', function() {
        if (confirm('Перейти на страницу входа для подключения к облаку?\nЛокальные записи будут синхронизированы после входа.')) {
            // Сохраняем флаг, что нужно синхронизировать после входа
            localStorage.setItem('sync_on_login', 'true');
            
            // ✅ ПЕРЕДАЕМ ПАРАМЕТР mode=online В URL
            // Используем полный URL с параметром
            const loginUrl = '/login.html?mode=online';
            console.log('🔗 Переход на:', loginUrl);
            window.location.href = loginUrl;
        }
    });
    
    console.log('☁️ Кнопка подключения к облаку создана');
}

// ============================================
//  ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ
// ============================================

function initHandlers() {
    // === НАЗАД ===
    const backBtn = document.getElementById('settingsBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = '/';
        });
    }
    
    // === АДМИН ===
    const adminCheckbox = document.getElementById('settingsAdminMode');
    if (adminCheckbox) {
        adminCheckbox.addEventListener('change', function() {
            if (typeof setAdminMode === 'function') {
                setAdminMode(this.checked);
                if (typeof updateAdminSliderUI === 'function') {
                    updateAdminSliderUI();
                }
                showToast(this.checked ? '👑 Режим администратора включен' : '👑 Режим администратора выключен');
            }
        });
    }
    
    // === ВЫХОД ===
    const logoutBtn = document.getElementById('settingsLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
                if (typeof logout === 'function') {
                    logout();
                } else {
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('user_data');
                    window.location.href = '/login.html';
                }
            }
        });
    }
    
    // === ШАБЛОНЫ ===
    const templateEditBtn = document.getElementById('settingsTemplateEdit');
    if (templateEditBtn) {
        templateEditBtn.addEventListener('click', function() {
            window.location.href = '/template-editor.html?type=new';
        });
    }
    
    const confirmTemplateBtn = document.getElementById('settingsConfirmTemplateEdit');
    if (confirmTemplateBtn) {
        confirmTemplateBtn.addEventListener('click', function() {
            window.location.href = '/template-editor.html?type=confirm';
        });
    }
    
    // === ВКЛАДКИ ===
    const tabGeneral = document.getElementById('settingsTabGeneral');
    if (tabGeneral) {
        tabGeneral.addEventListener('click', function() {
            switchSettingsTab('general');
        });
    }
    
    const tabColors = document.getElementById('settingsTabColors');
    if (tabColors) {
        tabColors.addEventListener('click', function() {
            switchSettingsTab('colors');
        });
    }
    
    // === СОХРАНЕНИЕ ЦВЕТОВ ===
    const saveColorsBtn = document.getElementById('settingsColorsSave');
    if (saveColorsBtn) {
        saveColorsBtn.addEventListener('click', function() {
            if (typeof saveAllColors === 'function') {
                saveAllColors();
            }
        });
    }
    
    // === ОЧИСТКА ===
    const cleanupBtn = document.getElementById('settingsCleanupNow');
    if (cleanupBtn) {
        cleanupBtn.addEventListener('click', function() {
            const days = typeof getCleanupDays === 'function' ? getCleanupDays() : 90;
            if (confirm('Удалить все записи, шаблоны окошек и уведомления старше ' + days + ' дней?')) {
                if (typeof performCleanup === 'function') {
                    performCleanup();
                    showToast('🧹 Очистка запущена!');
                }
            }
        });
    }
}

// ============================================
//  ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ============================================

function switchSettingsTab(tab) {
    const tabGeneral = document.getElementById('settingsTabGeneral');
    const tabColors = document.getElementById('settingsTabColors');
    const contentGeneral = document.getElementById('settingsTabGeneralContent');
    const contentColors = document.getElementById('settingsTabColorsContent');
    
    if (!tabGeneral || !tabColors || !contentGeneral || !contentColors) return;
    
    if (tab === 'general') {
        tabGeneral.className = 'settings-tab active';
        tabColors.className = 'settings-tab';
        contentGeneral.style.display = 'block';
        contentColors.style.display = 'none';
    } else {
        tabGeneral.className = 'settings-tab';
        tabColors.className = 'settings-tab active';
        contentGeneral.style.display = 'none';
        contentColors.style.display = 'block';
    }
}