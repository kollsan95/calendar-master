// ============================================
//  ОБЩИЕ ФУНКЦИИ И ДАННЫЕ ДЛЯ ВСЕХ СТРАНИЦ
// ============================================

// === ПРОЦЕДУРЫ (единая структура) ===
const SERVICES = {
    'Кератин': {
        id: 'service_1',
        name: 'Кератин',
        displayName: 'Кератиновое выпрямление',
        color: '#D4AF37'
    },
    'Ботокс': {
        id: 'service_2',
        name: 'Ботокс',
        displayName: 'Ботокс для волос',
        color: '#4A90E2'
    },
    'Холодное': {
        id: 'service_3',
        name: 'Холодное',
        displayName: 'Холодное восстановление',
        color: '#A8D8EA'
    },
    'Полировка': {
        id: 'service_4',
        name: 'Полировка',
        displayName: 'Полировка волос',
        color: '#7B8D8E'
    },
    'Выходной': {
        id: 'service_5',
        name: 'Выходной',
        displayName: 'Выходной день',
        color: '#9E9E9E'
    }
};

const SERVICE_KEYS = Object.keys(SERVICES);

// === МАППИНГИ ДЛЯ БЫСТРОГО ДОСТУПА ===
const SERVICE_BY_ID = {};
const SERVICE_BY_NAME = {};

SERVICE_KEYS.forEach(key => {
    const service = SERVICES[key];
    SERVICE_BY_ID[service.id] = service;
    SERVICE_BY_NAME[service.name] = service;
});

// === СИСТЕМНЫЕ ЦВЕТА ===
const UI_COLORS = {
    'Чужие записи': {
        displayName: 'Записи других мастеров',
        color: '#E0E0E0'
    },
    'Свободные слоты': {
        displayName: 'Свободные временные слоты',
        color: '#4CAF50'
    }
};

// ============================================
//  ФУНКЦИИ ДЛЯ РАБОТЫ С УСЛУГАМИ
// ============================================

function getServiceById(id) {
    return SERVICE_BY_ID[id] || null;
}

function getServiceByName(name) {
    return SERVICE_BY_NAME[name] || null;
}

function getServiceIdByName(name) {
    const service = getServiceByName(name);
    return service ? service.id : null;
}

function getServiceNameById(id) {
    const service = getServiceById(id);
    return service ? service.name : null;
}

function getServiceDisplayNameById(id) {
    const service = getServiceById(id);
    return service ? service.displayName : null;
}

function getServiceColor(serviceType) {
    // Сначала ищем по ключу
    if (SERVICES[serviceType]) {
        return SERVICES[serviceType].color;
    }
    // Потом по имени
    for (const key of SERVICE_KEYS) {
        if (SERVICES[key].name === serviceType) {
            return SERVICES[key].color;
        }
    }
    // По ID
    if (SERVICE_BY_ID[serviceType]) {
        return SERVICE_BY_ID[serviceType].color;
    }
    return '#E0E0E0';
}

function getUIColor(key) {
    if (UI_COLORS[key]) {
        return UI_COLORS[key].color;
    }
    return '#E0E0E0';
}

// ============================================
//  ЗАГРУЗКА ЦВЕТОВ ИЗ LOCALSTORAGE
// ============================================

function loadColorsFromStorage() {
    try {
        const saved = localStorage.getItem('serviceColors');
        if (saved) {
            const colors = JSON.parse(saved);
            
            // Загружаем цвета процедур
            if (colors.services) {
                Object.keys(colors.services).forEach(key => {
                    if (SERVICES[key]) {
                        SERVICES[key].color = colors.services[key];
                    }
                });
            }
            
            // Загружаем системные цвета
            if (colors.ui) {
                Object.keys(colors.ui).forEach(key => {
                    if (UI_COLORS[key]) {
                        UI_COLORS[key].color = colors.ui[key];
                    }
                });
            }
            
            console.log('🎨 Цвета загружены из localStorage');
            return true;
        }
    } catch (e) {
        console.warn('⚠️ Ошибка загрузки цветов:', e);
    }
    return false;
}

function saveColorsToStorage() {
    try {
        const colors = {
            services: {},
            ui: {}
        };
        
        SERVICE_KEYS.forEach(key => {
            colors.services[key] = SERVICES[key].color;
        });
        
        Object.keys(UI_COLORS).forEach(key => {
            colors.ui[key] = UI_COLORS[key].color;
        });
        
        localStorage.setItem('serviceColors', JSON.stringify(colors));
        console.log('🎨 Цвета сохранены в localStorage');
        return true;
    } catch (e) {
        console.warn('⚠️ Ошибка сохранения цветов:', e);
        return false;
    }
}

// ============================================
//  РЕНДЕРИНГ НАСТРОЕК ЦВЕТОВ
// ============================================

function renderSettingsColors() {
    const container = document.getElementById('settingsColorsContainer');
    if (!container) return;
    
    let html = '';
    SERVICE_KEYS.forEach(key => {
        const service = SERVICES[key];
        html += `
            <div class="color-row">
                <label>${service.displayName}</label>
                <input type="color" class="color-input" value="${service.color}" data-service-key="${key}">
            </div>
        `;
    });
    container.innerHTML = html;
    
    const uiContainer = document.getElementById('settingsUIColorsContainer');
    if (uiContainer) {
        let uiHtml = '';
        Object.entries(UI_COLORS).forEach(([key, data]) => {
            uiHtml += `
                <div class="color-row">
                    <label>${data.displayName}</label>
                    <input type="color" class="color-input" value="${data.color}" data-ui-key="${key}">
                </div>
            `;
        });
        uiContainer.innerHTML = uiHtml;
    }
}

function saveAllColors() {
    document.querySelectorAll('#settingsColorsContainer input[type="color"]').forEach(inp => {
        const key = inp.dataset.serviceKey;
        if (key && SERVICES[key]) {
            SERVICES[key].color = inp.value;
        }
    });
    
    document.querySelectorAll('#settingsUIColorsContainer input[type="color"]').forEach(inp => {
        const key = inp.dataset.uiKey;
        if (key && UI_COLORS[key]) {
            UI_COLORS[key].color = inp.value;
        }
    });
    
    saveColorsToStorage();
    showToast('✅ Все цвета сохранены!');
}

// ============================================
//  АДМИН-РЕЖИМ
// ============================================

function isAdminMode() {
    try {
        const saved = localStorage.getItem('adminMode');
        return saved === 'true';
    } catch { return false; }
}

function setAdminMode(enabled) {
    localStorage.setItem('adminMode', String(enabled));
}

function updateAdminSliderUI() {
    const checkbox = document.getElementById('settingsAdminMode');
    if (!checkbox) return;
    const isEnabled = isAdminMode();
    checkbox.checked = isEnabled;
    const slider = document.querySelector('.toggle .slider');
    if (slider) {
        slider.style.background = isEnabled ? '#008080' : '#ccc';
    }
}

// ============================================
//  ОЧИСТКА
// ============================================

function getCleanupDays() {
    try {
        const saved = localStorage.getItem('cleanupDays');
        return saved ? parseInt(saved) : 90;
    } catch { return 90; }
}

function renderCleanupSettings() {
    const container = document.getElementById('settingsCleanupContainer');
    if (!container) return;
    const days = getCleanupDays();
    container.innerHTML = `
        <div class="cleanup-row">
            <label style="font-size:13px;color:#7B8D8E;">Очищать через (дней):</label>
            <input type="number" id="settingsCleanupDaysInput" min="1" max="365" value="${days}">
            <button class="btn-cleanup" id="settingsCleanupNow">Очистить сейчас</button>
        </div>
        <div class="hint">Будут удалены записи, шаблоны окошек и уведомления старше указанного количества дней</div>
    `;
    const input = document.getElementById('settingsCleanupDaysInput');
    if (input) {
        input.addEventListener('change', function() {
            const val = parseInt(this.value);
            if (val > 0 && val <= 365) {
                localStorage.setItem('cleanupDays', String(val));
                showToast('✅ Срок очистки сохранен: ' + val + ' дней');
            } else {
                this.value = getCleanupDays();
                showToast('❌ Введите число от 1 до 365', 'error');
            }
        });
    }
}

function performCleanup() {
    if (typeof window.performCleanup === 'function' && window.performCleanup !== performCleanup) {
        window.performCleanup();
        return;
    }
    const days = getCleanupDays();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffTime = cutoff.getTime();
    const keysToRemove = [];
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith('windowsTemplate_')) {
            const m = key.replace('windowsTemplate_', '');
            const [y, mo] = m.split('-').map(Number);
            if (new Date(y, mo - 1, 1).getTime() < cutoffTime) {
                keysToRemove.push(key);
            }
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    try {
        const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
        const filtered = notifications.filter(n => new Date(n.timestamp).getTime() >= cutoffTime);
        localStorage.setItem('notifications', JSON.stringify(filtered));
    } catch {}
    showToast('✅ Очистка завершена');
}

// ============================================
//  TOAST
// ============================================

let toastTimer = null;

function showToast(message, type) {
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
        window.showToast(message, type);
        return;
    }
    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }
    const existingToast = document.querySelector('.custom-toast');
    if (existingToast) existingToast.remove();
    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.style.cssText = `
        position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
        padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 500;
        background: ${type === 'error' ? '#C62828' : '#008080'};
        color: #FFF; z-index: 9999; max-width: 90%; text-align: center;
        animation: slideUp 0.3s ease; opacity: 0; transition: opacity 0.3s ease;
        font-family: 'Montserrat', sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        pointer-events: none;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    toastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
            toastTimer = null;
        }, 300);
    }, 3000);
}

// ============================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================

function initCommon() {
    loadColorsFromStorage();
    console.log('✅ common.js инициализирован');
}

// Вызываем сразу
initCommon();