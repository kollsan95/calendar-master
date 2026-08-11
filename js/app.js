// ============================================
//  ГЛАВНАЯ ЛОГИКА ПРИЛОЖЕНИЯ
// ============================================

// === КОНСТАНТЫ ===
const DEFAULT_COLORS = {
    'Кератин': '#D4AF37',
    'Ботокс': '#4A90E2',
    'Холодное': '#A8D8EA',
    'Полировка': '#7B8D8E',
    'Выходной': '#9E9E9E'
};

const SERVICE_NAMES = {
    'Кератин': 'Кератиновое выпрямление',
    'Ботокс': 'Ботокс для волос',
    'Холодное': 'Холодное восстановление',
    'Полировка': 'Полировка волос',
    'Выходной': 'Выходной день'
};

const WORKING_HOURS = 12;
const GRAY = '#E0E0E0';
const INNER_RADIUS_RATIO = 0.5;
const END_OF_DAY = 21;

const DEFAULT_TEMPLATE = `{{Имя клиента}}, записала Вас:

{{дата записи}} на {{время начала}}

Процедура: {{Процедура}} 

Мастер: {{Мастер}} {{Телефон мастера}}

Адрес: пр.Пушкина 81 вход со стороны проспекта в мой кабинет 

Хорошего дня 💞`;

const DEFAULT_CONFIRM_TEMPLATE = `{{Имя клиента}}, добрый день! Напоминаю о вашей записи. Жду вас {{дата записи}} в {{время начала}}. ПОДТВЕРЖДАЕТЕ ЗАПИСЬ?
Если у вас возникли изменения в планах или вам нужно перенести запись, пожалуйста, свяжитесь с нами. С нетерпением ждем встречи!`;

const STORAGE_KEYS = {
    TEMPLATE_PREFIX: 'windowsTemplate_',
    CLEANUP_DAYS: 'cleanupDays',
    LAST_CLEANUP: 'lastCleanup',
    ADMIN_MODE: 'adminMode'
};

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let COLORS = loadSettings();
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let recordsData = {};
let filterType = 'all';
let isFreeMode = false;
let carouselScrollPos = 0;
let isDragging = false;
let startX = 0;
let startScrollPos = 0;
let notifications = [];
let unreadCount = 0;
let editingRecordId = null;
let templateText = loadTemplate('letterTemplate', DEFAULT_TEMPLATE);
let confirmTemplateText = loadTemplate('confirmLetterTemplate', DEFAULT_CONFIRM_TEMPLATE);
let currentModalTab = 'main';
let editingTemplateType = 'new';
let isAnimating = false;

// === FIREBASE ПЕРЕМЕННЫЕ ===
let firebaseSync = null;
let firebaseInitialized = false;

// ============================================
//  ПРОВЕРКА АВТОРИЗАЦИИ
// ============================================

function checkAuth() {
    const isAuth = isUserAuthenticated();
    const user = getCurrentUser();
    if (!isAuth || !user) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
}

// ============================================
//  НАСТРОЙКА АДМИН
// ============================================

function isAdminMode() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.ADMIN_MODE);
        return saved === 'true';
    } catch { return false; }
}

function setAdminMode(enabled) {
    localStorage.setItem(STORAGE_KEYS.ADMIN_MODE, String(enabled));
}

function toggleAdminMode() {
    const newValue = !isAdminMode();
    setAdminMode(newValue);
    updateAdminSliderUI();
    showToast(newValue ? '👑 Режим администратора включен' : '👑 Режим администратора выключен');
}

function updateAdminSliderUI() {
    const checkbox = document.getElementById('settingsAdminMode');
    const slider = document.getElementById('adminSlider');
    const dot = document.getElementById('adminSliderDot');
    
    if (!checkbox || !slider || !dot) return;
    
    const isEnabled = isAdminMode();
    checkbox.checked = isEnabled;
    slider.style.background = isEnabled ? '#008080' : '#ccc';
    dot.style.transform = isEnabled ? 'translateX(22px)' : 'translateX(0)';
}

// ============================================
//  ЗАГРУЗКА СПИСКА МАСТЕРОВ
// ============================================

async function loadMastersList() {
    try {
        const usersRef = firebase.database().ref('users');
        const snapshot = await usersRef.once('value');
        const users = snapshot.val() || {};
        const masters = [];
        for (const key in users) {
            if (users[key].role === 'master' || users[key].role === 'admin') {
                masters.push({
                    name: users[key].name,
                    phone: users[key].phone || ''
                });
            }
        }
        const currentUser = getCurrentUser();
        if (masters.length === 0 && currentUser && currentUser.name) {
            masters.push({
                name: currentUser.name,
                phone: currentUser.phone || ''
            });
        }
        const select = document.getElementById('modalMasterName');
        if (select) {
            select.innerHTML = '';
            masters.forEach(m => {
                const option = document.createElement('option');
                option.value = m.name;
                option.textContent = m.name + (m.phone ? ' (' + m.phone + ')' : '');
                option.dataset.phone = m.phone || '';
                select.appendChild(option);
            });
            if (currentUser && currentUser.name) {
                const found = Array.from(select.options).find(o => o.value === currentUser.name);
                if (found) {
                    select.value = currentUser.name;
                } else if (masters.length > 0) {
                    select.value = masters[0].name;
                }
            } else if (masters.length > 0) {
                select.value = masters[0].name;
            }
        }
        return masters;
    } catch (error) {
        console.error('❌ Ошибка загрузки мастеров:', error);
        return [];
    }
}

function getMasterPhoneByName(name) {
    const select = document.getElementById('modalMasterName');
    if (!select) return '';
    const option = Array.from(select.options).find(o => o.value === name);
    return option ? option.dataset.phone || '' : '';
}

// ============================================
//  ЗАГРУЗКА ДАННЫХ
// ============================================

function loadSettings() {
    try {
        const saved = localStorage.getItem('serviceColors');
        return saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT_COLORS));
    } catch { return JSON.parse(JSON.stringify(DEFAULT_COLORS)); }
}

function saveSettings(colors) {
    localStorage.setItem('serviceColors', JSON.stringify(colors));
}

function loadTemplate(key, defaultText) {
    try {
        return localStorage.getItem(key) || defaultText;
    } catch { return defaultText; }
}

function saveTemplate(key, text) {
    localStorage.setItem(key, text);
    if (key === 'letterTemplate') templateText = text;
    if (key === 'confirmLetterTemplate') confirmTemplateText = text;
}

// ============================================
//  ФИЛЬТРАЦИЯ ЗАПИСЕЙ
// ============================================

function filterRecordsForUser(records) {
    const user = getCurrentUser();
    const currentUserName = user ? user.name : null;
    
    if (!records) return {};
    
    const result = {};
    for (const [dateKey, dayRecords] of Object.entries(records)) {
        const filtered = dayRecords.filter(record => {
            // Если запись "Выходной" - показываем только если мастер = текущий пользователь
            if (record.serviceType === 'Выходной') {
                return record.master === currentUserName;
            }
            // Обычные записи показываем всем
            return true;
        });
        if (filtered.length > 0) {
            result[dateKey] = filtered;
        }
    }
    return result;
}

// === УТИЛИТЫ ===
function isDayPast(year, month, day) {
    const now = new Date();
    const date = new Date(year, month - 1, day);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (date < today) return true;
    if (date.getTime() === today.getTime()) return now.getHours() >= END_OF_DAY;
    return false;
}

function getMonthName(month) {
    return ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'][month - 1];
}

function getDayName(dateStr) {
    return ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date(dateStr).getDay()];
}

function formatModalDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return getDayName(dateStr) + ', ' + parseInt(day) + ' ' + getMonthName(parseInt(month));
}

function formatDateForLetter(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return String(day).padStart(2, '0') + '.' + String(month).padStart(2, '0') + '.' + year;
}

function generateLetter(record, template) {
    let text = template;
    const fullServiceName = SERVICE_NAMES[record.serviceType] || record.serviceType;
    const masterPhone = getMasterPhoneByName(record.master || '');
    const vars = {
        '{{Имя клиента}}': record.clientName || 'Клиент',
        '{{дата записи}}': formatDateForLetter(record.date),
        '{{время начала}}': String(record.startHour).padStart(2, '0') + ':00',
        '{{Телефон клиента}}': record.clientPhone || '',
        '{{Процедура}}': fullServiceName,
        '{{Мастер}}': record.master || 'Мастер',
        '{{Телефон мастера}}': masterPhone
    };
    for (const [key, val] of Object.entries(vars)) {
        text = text.replace(new RegExp(key, 'g'), val);
    }
    return text;
}

function getMonthKey() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function getCleanupDays() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.CLEANUP_DAYS);
        return saved ? parseInt(saved) : 90;
    } catch { return 90; }
}

// ============================================
//  ИНИЦИАЛИЗАЦИЯ FIREBASE
// ============================================

async function initFirebase() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    
    try {
        if (typeof firebase === 'undefined') {
            console.error('❌ Firebase SDK не загружен');
            return false;
        }
        if (typeof FirebaseSync === 'undefined') {
            console.error('❌ FirebaseSync не загружен');
            return false;
        }
        firebaseSync = new FirebaseSync();
        const data = await firebaseSync.loadAllRecords();
        console.log('📊 Данные загружены:', Object.keys(data).length, 'дней');
        firebaseInitialized = true;
        console.log('✅ Firebase инициализирован');
        return true;
    } catch (error) {
        console.error('❌ Ошибка Firebase:', error);
        firebaseInitialized = false;
        return false;
    }
}

// ============================================
//  ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    if (!checkAuth()) return;
    console.log('🚀 Приложение загружено');
    updateFilterColors();
    loadNotifications();
    setTimeout(loadRecords, 500);
    
    initFilters();
    initNavigation();
    initDetailControls();
    initModal();
    initCarousel();
    initDetailCanvas();
    initSettings();
    initStats();
    initNotifications();
    initTemplateEditor();
    initWindowsEditor();
});

// ============================================
//  ЗАПИСИ (CRUD) - FIREBASE ВЕРСИЯ
// ============================================

async function loadRecords() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    
    if (!firebaseInitialized) {
        const initialized = await initFirebase();
        if (!initialized) {
            setTimeout(loadRecords, 2000);
            return;
        }
    }
    
    try {
        if (firebaseSync) {
            firebaseSync.syncRecords((data) => {
                // ✅ ПРИМЕНЯЕМ ФИЛЬТРАЦИЮ ПРИ ЗАГРУЗКЕ
                recordsData = filterRecordsForUser(data);
                renderCalendar();
                if (document.getElementById('detailContainer').style.display === 'block') {
                    const d = Detail.currentDay, 
                        m = Detail.currentMonth || currentMonth, 
                        y = Detail.currentYear || currentYear;
                    Detail.drawDetailTile(d, m, y, []);
                    Detail.updateRecordsList(d, m, y);
                    Detail.populateCarousel(d, m, y);
                }
                updateBadge();
                console.log('🔄 Данные синхронизированы');
            });
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки:', error);
        setTimeout(loadRecords, 2000);
    }
}

async function saveRecord(date, startHour, endHour, serviceType, clientName, clientPhone, note, openLetter) {
    if (serviceType === 'Выходной') {
        clientName = '';
        clientPhone = '';
    }
    
    const user = getCurrentUser();
    const masterSelect = document.getElementById('modalMasterName');
    const masterName = masterSelect ? masterSelect.value : (user ? user.name : 'Мастер');
    
    const record = {
        date,
        startHour: parseInt(startHour),
        endHour: parseInt(endHour),
        serviceType,
        clientName: clientName || '',
        clientPhone: clientPhone || '',
        note: note || '',
        master: masterName,
        userId: user ? user.id : 'unknown',
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    // Если редактируем существующую запись
    if (editingRecordId) {
        record.id = editingRecordId;
        try {
            await firebaseSync.updateRecord(editingRecordId, date, record);
            // Обновляем локальные данные с фильтрацией
            const allData = await firebaseSync.loadAllRecords();
            recordsData = filterRecordsForUser(allData);
            addNotification('✏️ Обновлена запись: ' + serviceType + ' на ' + date + ' ' + startHour + ':00');
            sendSystemNotification('Запись обновлена', serviceType + ' на ' + date + ' ' + startHour + ':00');
            renderCalendar();
            refreshDetail();
            closeModal();
            showToast('✅ Запись обновлена!');
            editingRecordId = null;
            return;
        } catch (error) {
            console.error('❌ Ошибка обновления:', error);
            showToast('❌ Ошибка обновления', 'error');
            return;
        }
    }
    
    // Новая запись
    try {
        const id = await firebaseSync.addRecord(record);
        record.id = id;
        scheduleReminder(record);
        addNotification('📝 Добавлена запись: ' + serviceType + ' на ' + date + ' ' + startHour + ':00');
        sendSystemNotification('Новая запись', serviceType + ' на ' + date + ' ' + startHour + ':00');
        closeModal();
        showToast('✅ Запись сохранена!');
        // Обновляем данные с фильтрацией
        const allData = await firebaseSync.loadAllRecords();
        recordsData = filterRecordsForUser(allData);
        renderCalendar();
        refreshDetail();
        if (openLetter && serviceType !== 'Выходной') {
            setTimeout(() => openModalWithLetter(record), 300);
        }
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        showToast('❌ Ошибка сохранения в облако', 'error');
    }
}

async function deleteRecordFromDB(id, dateKey, serviceType) {
    if (!confirm('Отменить запись?')) return;
    
    try {
        await firebaseSync.deleteRecord(id, dateKey);
        // Обновляем данные с фильтрацией
        const allData = await firebaseSync.loadAllRecords();
        recordsData = filterRecordsForUser(allData);
        addNotification('🗑️ Удалена запись: ' + serviceType);
        sendSystemNotification('Запись удалена', serviceType + ' удалена');
        renderCalendar();
        refreshDetail();
        closeModal();
        showToast('🗑️ Запись удалена');
    } catch (error) {
        console.error('❌ Ошибка удаления:', error);
        showToast('❌ Ошибка удаления', 'error');
    }
}

function refreshDetail() {
    if (document.getElementById('detailContainer').style.display === 'block') {
        Detail.show(Detail.currentDay, currentMonth, currentYear);
    }
}

function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    editingRecordId = null;
    currentModalTab = 'main';
}

function openModalWithLetter(record) {
    currentModalTab = 'letter';
    openModal(parseInt(record.date.split('-')[2]), parseInt(record.date.split('-')[1]), parseInt(record.date.split('-')[0]), null, record.id);
}

// ============================================
//  УВЕДОМЛЕНИЯ
// ============================================

function loadNotifications() {
    try {
        const saved = localStorage.getItem('notifications');
        if (saved) { notifications = JSON.parse(saved); unreadCount = notifications.filter(n => !n.read).length; updateBadge(); }
    } catch { notifications = []; unreadCount = 0; }
}

function saveNotifications() {
    localStorage.setItem('notifications', JSON.stringify(notifications));
    unreadCount = notifications.filter(n => !n.read).length;
    updateBadge();
}

function addNotification(message) {
    notifications.unshift({ id: Date.now(), message, timestamp: new Date().toISOString(), read: false });
    if (notifications.length > 100) notifications = notifications.slice(0, 100);
    saveNotifications();
}

function sendSystemNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(r => r.showNotification(title, {
        body, icon: '/icons/icon-192.png', badge: '/icons/icon-72.png',
        vibrate: [200, 100, 200], tag: 'notification-' + Date.now(), requireInteraction: true
    }));
}

function updateBadge() {
    const badge = document.getElementById('notifBadge');
    if (badge) {
        badge.style.display = unreadCount > 0 ? 'inline' : 'none';
        badge.textContent = unreadCount;
    }
    updateFavicon(unreadCount);
}

function updateFavicon(count) {
    const favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) return;
    const svg = count > 0
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="80">🔔</text><circle cx="80" cy="20" r="18" fill="#C62828"/><text x="72" y="30" font-size="20" fill="#FFF" font-weight="bold">' + count + '</text></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📅</text></svg>';
    favicon.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function showNotificationsList() {
    const modal = document.getElementById('notificationsModal'), list = document.getElementById('notificationsList');
    if (!modal || !list) return;
    let html = notifications.length === 0 
        ? '<p style="color:#7B8D8E;text-align:center;padding:20px;">Нет уведомлений</p>'
        : notifications.map(n => {
            const date = new Date(n.timestamp);
            const isRead = n.read;
            return '<div style="padding:10px 14px;margin-bottom:6px;background:' + (isRead ? 'rgba(245,245,245,0.6)' : '#E0F2F1') + ';border-radius:8px;border-left:3px solid ' + (isRead ? '#B0BEC5' : '#008080') + ';opacity:' + (isRead ? '0.7' : '1') + ';">' +
                '<div style="font-size:14px;color:' + (isRead ? '#7B8D8E' : '#37474F') + ';">' + n.message + '</div>' +
                '<div style="font-size:11px;color:#7B8D8E;margin-top:4px;">' + date.toLocaleDateString() + ' ' + date.toLocaleTimeString() + '</div></div>';
        }).join('');
    list.innerHTML = html;
    modal.style.display = 'flex';
    notifications.forEach(n => n.read = true);
    saveNotifications();
}

// ============================================
//  КАЛЕНДАРЬ
// ============================================

function renderCalendar(direction) {
    const container = document.getElementById('calendarContainer');
    if (!container) return;
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    
    container.innerHTML = '';
    
    if (direction && !isAnimating) {
        isAnimating = true;
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;overflow:hidden;height:auto;';
        container.appendChild(wrapper);
        const oldContent = document.createElement('div');
        oldContent.innerHTML = buildCalendarHTML();
        wrapper.appendChild(oldContent);
        const newContent = document.createElement('div');
        newContent.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
        newContent.style.transform = direction === 'next' ? 'translateX(100%)' : 'translateX(-100%)';
        newContent.style.transition = 'none';
        container.appendChild(newContent);
        newContent.innerHTML = buildCalendarHTML();
        requestAnimationFrame(() => {
            oldContent.style.transition = 'transform 0.3s ease';
            oldContent.style.transform = direction === 'next' ? 'translateX(-100%)' : 'translateX(100%)';
            newContent.style.transition = 'transform 0.3s ease';
            newContent.style.transform = 'translateX(0)';
        });
        setTimeout(() => {
            container.innerHTML = '';
            container.innerHTML = buildCalendarHTML();
            renderCalendarDays(container);
            isAnimating = false;
        }, 350);
        return;
    }
    
    container.innerHTML = buildCalendarHTML();
    renderCalendarDays(container);
}

function buildCalendarHTML() {
    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0 10px;border-bottom:1px solid #E0F2F1;">
            <button id="prevMonth" style="background:none;border:none;font-size:24px;color:#008080;cursor:pointer;padding:0 12px;">‹</button>
            <span style="font-size:18px;font-weight:600;color:#008080;">${new Date(currentYear, currentMonth - 1).toLocaleString('ru', { month: 'long', year: 'numeric' })}</span>
            <button id="nextMonth" style="background:none;border:none;font-size:24px;color:#008080;cursor:pointer;padding:0 12px;">›</button>
        </div>
        <div class="calendar-grid">
    `;
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(day => {
        html += `<div style="text-align:center;font-size:10px;font-weight:600;color:#7B8D8E;padding:2px 0 4px;text-transform:uppercase;">${day}</div>`;
    });
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    for (let i = 1; i < (firstDay.getDay() || 7); i++) {
        html += `<div style="aspect-ratio:1;"></div>`;
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const isPast = isDayPast(currentYear, currentMonth, d);
        html += `<div class="day-cell" style="position:relative;aspect-ratio:1;width:100%;">
            <canvas id="day_${d}" width="120" height="120" style="width:100%;height:100%;cursor:pointer;border-radius:50%;display:block;"></canvas>
            ${isPast ? `<div style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:50%;background:rgba(200,200,200,0.3);pointer-events:none;"></div>` : ''}
        </div>`;
    }
    html += `</div>`;
    return html;
}

function renderCalendarDays(container) {
    const canvases = container.querySelectorAll('canvas[id^="day_"]');
    canvases.forEach(canvas => {
        const day = parseInt(canvas.id.split('_')[1]);
        const isPast = isDayPast(currentYear, currentMonth, day);
        drawTile(canvas, day, isPast);
        canvas.addEventListener('click', () => openDetail(day, currentMonth, currentYear));
    });
}

function drawTile(canvas, day, isPast) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width, cx = size/2, cy = size/2;
    const radius = size/2 - 6, innerRadius = radius * INNER_RADIUS_RATIO;
    ctx.clearRect(0, 0, size, size);
    
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI*2);
    ctx.fillStyle = isPast ? '#F0F0F0' : '#FFFDF9';
    ctx.fill();
    ctx.strokeStyle = '#E0F2F1';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI*2);
    ctx.fillStyle = '#FFFDF9';
    ctx.fill();
    ctx.strokeStyle = '#E0F2F1';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    
    const dateKey = currentYear + '-' + String(currentMonth).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    let dayRecords = recordsData[dateKey] || [];
    if (!Array.isArray(dayRecords)) {
        dayRecords = Object.values(dayRecords);
    }
    if (Array.isArray(dayRecords) && dayRecords.length > 0) {
        const seen = new Set();
        dayRecords = dayRecords.filter(record => {
            if (record.id && !seen.has(record.id)) {
                seen.add(record.id);
                return true;
            }
            return false;
        });
    }
    
    const user = getCurrentUser();
    const currentUserName = user ? user.name : null;
    const hourWidth = (Math.PI*2) / WORKING_HOURS;
    const startAngle = Math.PI;
    
    for (let i = 0; i < WORKING_HOURS; i++) {
        const hour = 9 + i;
        const angleStart = startAngle + i * hourWidth;
        const angleEnd = angleStart + hourWidth;
        let isBooked = false, color = GRAY, serviceType = '', isOwn = false;
        for (const r of dayRecords) {
            if (hour >= r.startHour && hour < r.endHour) {
                isBooked = true;
                serviceType = r.serviceType;
                // Проверяем по полю "master", а не по userId
                isOwn = currentUserName && r.master === currentUserName;
                color = isOwn ? (COLORS[serviceType] || GRAY) : GRAY;
                break;
            }
        }
        const shouldBeGray = isBooked && filterType !== 'all' && serviceType !== filterType;
        const isFree = !isBooked && isFreeMode;
        
        ctx.beginPath();
        ctx.moveTo(cx + innerRadius * Math.cos(angleStart), cy + innerRadius * Math.sin(angleStart));
        ctx.arc(cx, cy, radius, angleStart, angleEnd);
        ctx.arc(cx, cy, innerRadius, angleEnd, angleStart);
        ctx.closePath();
        
        if (isBooked) {
            const alpha = isPast ? '20' : '40';
            const fillColor = isOwn ? color + alpha : GRAY + '40';
            const strokeColor = isOwn ? (isPast ? color + '60' : color) : GRAY;
            ctx.fillStyle = shouldBeGray ? GRAY + '40' : fillColor;
            ctx.fill();
            ctx.strokeStyle = shouldBeGray ? GRAY : strokeColor;
            ctx.lineWidth = 2.5;
            ctx.stroke();
        } else if (isFree && !isPast) {
            ctx.fillStyle = '#4CAF50';
            ctx.fill();
            ctx.strokeStyle = '#388E3C';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else {
            ctx.fillStyle = 'transparent';
            ctx.fill();
            ctx.strokeStyle = isPast ? '#E8E8E8' : '#E0F2F1';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isPast ? '#A0A0A0' : '#37474F';
    ctx.font = '600 ' + (size * 0.32) + 'px Montserrat, sans-serif';
    ctx.fillText(day, cx, cy + 2);
}

// ============================================
//  ФИЛЬТРЫ
// ============================================

function updateFilterColors() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
        const type = chip.dataset.type;
        if (type === 'all' || type === 'free') {
            chip.style.boxShadow = chip.style.background = chip.style.color = '';
            return;
        }
        const color = COLORS[type] || '#008080';
        chip.style.boxShadow = 'inset 0 0 0 3px ' + color;
        if (chip.classList.contains('active')) {
            chip.style.background = color;
            chip.style.color = '#FFFFFF';
            chip.style.borderColor = color;
        } else {
            chip.style.background = '#FFFFFF';
            chip.style.color = '#37474F';
            chip.style.borderColor = '#E0F2F1';
        }
    });
}

function initFilters() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            const type = this.dataset.type;
            if (type === 'all') { filterType = 'all'; isFreeMode = false; }
            else if (type === 'free') { filterType = 'free'; isFreeMode = true; }
            else { filterType = type; isFreeMode = false; }
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            updateFilterColors();
            renderCalendar();
        });
    });
}

// ============================================
//  МОДАЛКА ЗАПИСИ
// ============================================

function openModal(day, month, year, selectedRange, recordId, isReadOnly) {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) return;
    
    loadMastersList();
    
    editingRecordId = recordId || null;
    const dateKey = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const isNew = !recordId;
    const readOnly = isReadOnly || false;
    
    let isDayOff = false;
    if (recordId) {
        const dayRecords = recordsData[dateKey] || [];
        const record = dayRecords.find(r => String(r.id) === String(recordId));
        if (record && record.serviceType === 'Выходной') {
            isDayOff = true;
        }
    }
    
    const letterTab = document.getElementById('modalTabLetter');
    if (letterTab) {
        letterTab.style.pointerEvents = (isNew || isDayOff || readOnly) ? 'none' : 'auto';
        letterTab.style.opacity = (isNew || isDayOff || readOnly) ? '0.5' : '1';
    }
    
    if (isNew) { currentModalTab = 'main'; switchTab('main'); }
    else { switchTab(currentModalTab); }
    
    document.getElementById('modalTitle').textContent = isNew ? '📝 Новая запись' : (readOnly ? '👁️ Просмотр записи' : '✏️ Редактирование записи');
    document.getElementById('modalDate').textContent = formatModalDate(dateKey);
    
    function toggleClientFields(serviceType) {
        const isDayOffField = serviceType === 'Выходной';
        const nameGroup = document.getElementById('modalClientName').closest('.form-group');
        const phoneGroup = document.getElementById('modalClientPhone').closest('.form-group');
        if (isDayOffField || readOnly) {
            document.getElementById('modalClientName').value = '';
            document.getElementById('modalClientPhone').value = '';
            if (nameGroup) nameGroup.style.display = 'none';
            if (phoneGroup) phoneGroup.style.display = 'none';
        } else {
            if (nameGroup) nameGroup.style.display = 'block';
            if (phoneGroup) phoneGroup.style.display = 'block';
        }
    }
    
    if (recordId) {
        const dayRecords = recordsData[dateKey] || [];
        const record = dayRecords.find(r => String(r.id) === String(recordId));
        if (record) {
            document.getElementById('modalService').value = record.serviceType;
            document.getElementById('modalStartHour').value = record.startHour;
            document.getElementById('modalEndHour').value = record.endHour;
            document.getElementById('modalClientName').value = record.clientName || '';
            document.getElementById('modalClientPhone').value = record.clientPhone || '';
            document.getElementById('modalNote').value = record.note || '';
            document.getElementById('modalMasterName').value = record.master || '';
            
            overlay.dataset.deleteId = String(record.id);
            overlay.dataset.deleteDate = record.date;
            overlay.dataset.deleteService = record.serviceType;
            
            if (record.serviceType !== 'Выходной' && !readOnly) {
                renderLetterTemplates(record);
            } else {
                document.getElementById('modalLetterContainer').innerHTML = '<p style="color:#7B8D8E;text-align:center;padding:20px;">Шаблоны не доступны</p>';
            }
            toggleClientFields(record.serviceType);
            
            // Блокируем поля если readOnly
            ['modalService', 'modalStartHour', 'modalEndHour', 'modalClientName', 'modalClientPhone', 'modalNote', 'modalMasterName'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = readOnly;
            });
            document.getElementById('modalSave').style.display = readOnly ? 'none' : 'block';
            document.getElementById('modalDeleteTopBtn').style.display = readOnly ? 'none' : 'block';
            
            // Обновляем список конечного времени
            updateEndHourOptions(parseInt(document.getElementById('modalStartHour').value));
        } else {
            editingRecordId = null;
            document.getElementById('modalService').value = 'Кератин';
            document.getElementById('modalStartHour').value = 9;
            document.getElementById('modalEndHour').value = 10;
            ['modalClientName', 'modalClientPhone', 'modalNote'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('modalLetterContainer').innerHTML = '';
            toggleClientFields('Кератин');
            document.getElementById('modalTitle').textContent = '📝 Новая запись';
            updateEndHourOptions(9);
        }
    } else {
        document.getElementById('modalService').value = 'Кератин';
        document.getElementById('modalStartHour').value = selectedRange ? selectedRange.start : 9;
        document.getElementById('modalEndHour').value = selectedRange ? selectedRange.end : 10;
        ['modalClientName', 'modalClientPhone', 'modalNote'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('modalLetterContainer').innerHTML = '';
        toggleClientFields('Кератин');
        updateEndHourOptions(selectedRange ? selectedRange.start : 9);
        
        const user = getCurrentUser();
        const masterSelect = document.getElementById('modalMasterName');
        if (user && user.name && masterSelect) {
            const options = masterSelect.options;
            let found = false;
            for (let i = 0; i < options.length; i++) {
                if (options[i].value === user.name) {
                    masterSelect.selectedIndex = i;
                    found = true;
                    break;
                }
            }
            if (!found && options.length > 0) {
                const option = document.createElement('option');
                option.value = user.name;
                option.textContent = user.name;
                masterSelect.appendChild(option);
                masterSelect.value = user.name;
            }
        }
    }
    
    document.getElementById('modalLoading').style.display = 'none';
    document.getElementById('modalSave').disabled = readOnly;
    overlay.style.display = 'flex';
    overlay.dataset.date = dateKey;
}

function updateEndHourOptions(startHour) {
    const endSelect = document.getElementById('modalEndHour');
    if (!endSelect) return;
    const currentValue = parseInt(endSelect.value);
    endSelect.innerHTML = '';
    for (let i = Math.max(10, startHour + 1); i <= 21; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = String(i).padStart(2, '0') + ':00';
        endSelect.appendChild(option);
    }
    if (endSelect.options.length > 0) {
        if (currentValue >= startHour + 1 && currentValue <= 21) {
            endSelect.value = currentValue;
        } else {
            endSelect.value = endSelect.options[0].value;
        }
    }
}

function renderLetterTemplates(record) {
    const container = document.getElementById('modalLetterContainer');
    if (!container) return;
    
    const templates = [
        { key: 'new', label: 'Шаблон новой записи', template: templateText },
        { key: 'confirm', label: 'Шаблон подтверждения записи', template: confirmTemplateText }
    ];
    
    let html = '';
    templates.forEach(({key, label, template}) => {
        const letterText = generateLetter(record, template);
        html += `
            <div style="margin-bottom:16px;position:relative;background:#F5F7FA;border-radius:12px;border:1px solid #E0F2F1;padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div style="font-weight:600;font-size:14px;color:#37474F;">${label}</div>
                    <button class="btn btn-primary copy-letter-btn" data-text="${encodeURIComponent(letterText)}" style="padding:4px 12px;font-size:12px;border-radius:8px;">📋 Копировать</button>
                </div>
                <div style="font-size:14px;line-height:1.8;color:#37474F;white-space:pre-wrap;word-break:break-word;">${letterText}</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    container.querySelectorAll('.copy-letter-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const text = decodeURIComponent(this.dataset.text);
            copyLetterText(text);
        });
    });
}

function copyLetterText(text) {
    if (!text || !text.trim()) { showToast('❌ Нет текста для копирования', 'error'); return; }
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('✅ Текст скопирован!'))
            .catch(() => copyTextFallback(text));
    } else copyTextFallback(text);
}

function copyTextFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('✅ Текст скопирован!'); } 
    catch { showToast('❌ Не удалось скопировать', 'error'); }
    document.body.removeChild(ta);
}

function switchTab(tab) {
    currentModalTab = tab;
    const mainTab = document.getElementById('modalTabMain');
    const letterTab = document.getElementById('modalTabLetter');
    const mainContent = document.getElementById('modalMainContent');
    const letterContent = document.getElementById('modalLetterContent');
    const saveBtn = document.getElementById('modalSave');
    const deleteTopBtn = document.getElementById('modalDeleteTopBtn');
    
    const isMain = tab === 'main';
    mainTab.classList.toggle('active', isMain);
    mainTab.style.color = isMain ? '#008080' : '#7B8D8E';
    mainTab.style.borderBottomColor = isMain ? '#008080' : 'transparent';
    letterTab.classList.toggle('active', !isMain);
    letterTab.style.color = !isMain ? '#008080' : '#7B8D8E';
    letterTab.style.borderBottomColor = !isMain ? '#008080' : 'transparent';
    mainContent.style.display = isMain ? 'block' : 'none';
    letterContent.style.display = isMain ? 'none' : 'block';
    saveBtn.style.display = isMain ? 'block' : 'none';
    deleteTopBtn.style.display = (isMain && editingRecordId) ? 'block' : 'none';
}

function saveRecordFromModal() {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) return;
    const date = overlay.dataset.date;
    const startHour = document.getElementById('modalStartHour').value;
    const endHour = document.getElementById('modalEndHour').value;
    if (parseInt(startHour) >= parseInt(endHour)) {
        showToast('❌ Время начала должно быть меньше окончания', 'error');
        return;
    }
    document.getElementById('modalLoading').style.display = 'block';
    document.getElementById('modalSave').disabled = true;
    saveRecord(
        date, startHour, endHour,
        document.getElementById('modalService').value,
        document.getElementById('modalClientName').value.trim(),
        document.getElementById('modalClientPhone').value.trim(),
        document.getElementById('modalNote').value,
        !editingRecordId
    );
}

function initModal() {
    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', function(e) { e.preventDefault(); closeModal(); });
    
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.addEventListener('click', function(e) { if (e.target === e.currentTarget) closeModal(); });
    
    const saveBtn = document.getElementById('modalSave');
    if (saveBtn) saveBtn.addEventListener('click', function(e) { e.preventDefault(); saveRecordFromModal(); });
    
    const deleteTopBtn = document.getElementById('modalDeleteTopBtn');
    if (deleteTopBtn) {
        const newDeleteBtn = deleteTopBtn.cloneNode(true);
        deleteTopBtn.parentNode.replaceChild(newDeleteBtn, deleteTopBtn);
        newDeleteBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const overlay2 = document.getElementById('modalOverlay');
            const id = overlay2.dataset.deleteId;
            const dateKey = overlay2.dataset.deleteDate;
            const serviceType = overlay2.dataset.deleteService;
            if (!id || !dateKey) {
                showToast('❌ Ошибка: не найдена запись для удаления', 'error');
                return;
            }
            deleteRecordFromDB(String(id), dateKey, serviceType);
        });
    }
    
    const mainTab = document.getElementById('modalTabMain');
    if (mainTab) mainTab.addEventListener('click', function(e) { e.preventDefault(); switchTab('main'); });
    
    const letterTab = document.getElementById('modalTabLetter');
    if (letterTab) {
        letterTab.addEventListener('click', function(e) {
            e.preventDefault();
            if (this.style.pointerEvents === 'none') return;
            switchTab('letter');
            const overlay2 = document.getElementById('modalOverlay');
            if (overlay2 && overlay2.dataset.date) {
                const dateKey = overlay2.dataset.date;
                const recordId = editingRecordId;
                const dayRecords = recordsData[dateKey] || [];
                const record = dayRecords.find(r => String(r.id) === String(recordId));
                if (record) renderLetterTemplates(record);
            }
        });
    }
    
    const startSelect = document.getElementById('modalStartHour');
    const endSelect = document.getElementById('modalEndHour');
    if (startSelect) {
        startSelect.innerHTML = '';
        for (let i = 9; i <= 20; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = String(i).padStart(2, '0') + ':00';
            startSelect.appendChild(option);
        }
        startSelect.addEventListener('change', function() {
            updateEndHourOptions(parseInt(this.value));
        });
    }
    if (endSelect) {
        endSelect.innerHTML = '';
        for (let i = 10; i <= 21; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = String(i).padStart(2, '0') + ':00';
            endSelect.appendChild(option);
        }
    }
    
    const serviceSelect = document.getElementById('modalService');
    if (serviceSelect) {
        serviceSelect.addEventListener('change', function() {
            const isDayOff = this.value === 'Выходной';
            const nameGroup = document.getElementById('modalClientName').closest('.form-group');
            const phoneGroup = document.getElementById('modalClientPhone').closest('.form-group');
            if (isDayOff) {
                document.getElementById('modalClientName').value = '';
                document.getElementById('modalClientPhone').value = '';
                if (nameGroup) nameGroup.style.display = 'none';
                if (phoneGroup) phoneGroup.style.display = 'none';
            } else {
                if (nameGroup) nameGroup.style.display = 'block';
                if (phoneGroup) phoneGroup.style.display = 'block';
            }
        });
    }
}

function deleteRecordFromModal() {
    const overlay = document.getElementById('modalOverlay');
    const id = overlay.dataset.deleteId;
    const dateKey = overlay.dataset.deleteDate;
    const serviceType = overlay.dataset.deleteService;
    if (!id || !dateKey) {
        showToast('❌ Ошибка: не найдена запись для удаления', 'error');
        return;
    }
    deleteRecordFromDB(String(id), dateKey, serviceType);
}

// ============================================
//  НАСТРОЙКИ
// ============================================

function openSettings() {
    document.getElementById('settingsModal').style.display = 'flex';
    renderSettingsColors();
    renderCleanupSettings();
    renderLogoutButton();
    
    // ✅ ИНИЦИАЛИЗИРУЕМ АДМИН-ПЕРЕКЛЮЧАТЕЛЬ
    updateAdminSliderUI();
    
    const adminCheckbox = document.getElementById('settingsAdminMode');
    if (adminCheckbox) {
        // Удаляем старые обработчики
        const newCheckbox = adminCheckbox.cloneNode(true);
        adminCheckbox.parentNode.replaceChild(newCheckbox, adminCheckbox);
        newCheckbox.addEventListener('change', function() {
            toggleAdminMode();
            // Обновляем UI после переключения
            updateAdminSliderUI();
        });
    }
    
    const editBtn = document.getElementById('settingsTemplateEdit');
    if (editBtn) {
        const newBtn = editBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newBtn, editBtn);
        newBtn.addEventListener('click', () => {
            editingTemplateType = 'new';
            openTemplateEditor('Шаблон новой записи', templateText);
        });
    }
    
    const confirmEditBtn = document.getElementById('settingsConfirmTemplateEdit');
    if (confirmEditBtn) {
        const newBtn = confirmEditBtn.cloneNode(true);
        confirmEditBtn.parentNode.replaceChild(newBtn, confirmEditBtn);
        newBtn.addEventListener('click', () => {
            editingTemplateType = 'confirm';
            openTemplateEditor('Шаблон подтверждения записи', confirmTemplateText);
        });
    }
}

function renderLogoutButton() {
    const container = document.getElementById('settingsLogoutContainer');
    if (!container) return;
    const user = getCurrentUser();
    container.innerHTML = `
        <div style="padding:12px 0;border-top:1px solid #E0F2F1;margin-top:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <div>
                    <div style="font-weight:500;color:#37474F;">👤 ${user ? user.name : 'Пользователь'}</div>
                    <div style="font-size:12px;color:#7B8D8E;">${user ? user.phone : ''}</div>
                </div>
                <button id="settingsLogoutBtn" class="btn btn-danger" style="padding:6px 16px;background:#C62828;color:#FFF;border:none;border-radius:8px;cursor:pointer;">🚪 Выйти</button>
            </div>
        </div>
    `;
    const logoutBtn = document.getElementById('settingsLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
                logout();
            }
        });
    }
}

function renderSettingsColors() {
    const container = document.getElementById('settingsColorsContainer');
    if (!container) return;
    let html = '';
    const services = ['Кератин', 'Ботокс', 'Холодное', 'Полировка', 'Выходной'];
    for (const service of services) {
        const color = COLORS[service] || '#9E9E9E';
        const fullName = SERVICE_NAMES[service] || service;
        html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">' +
            '<label style="flex:1;font-size:13px;font-weight:500;">' + service + ' (' + fullName + ')</label>' +
            '<input type="color" value="' + color + '" data-service="' + service + '" style="width:44px;height:36px;border:none;padding:0;cursor:pointer;border-radius:6px;">' +
            '</div>';
    }
    html += '<button class="btn btn-save" id="settingsColorsSave" style="width:100%;margin-top:8px;padding:8px;">Сохранить цвета</button>';
    container.innerHTML = html;
    const saveBtn = document.getElementById('settingsColorsSave');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            container.querySelectorAll('input[type="color"]').forEach(inp => COLORS[inp.dataset.service] = inp.value);
            saveSettings(COLORS);
            renderCalendar();
            refreshDetail();
            updateFilterColors();
            showToast('✅ Цвета сохранены!');
        });
    }
}

function renderCleanupSettings() {
    const container = document.getElementById('settingsCleanupContainer');
    if (!container) return;
    const days = getCleanupDays();
    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <label style="font-size:13px;color:#7B8D8E;flex-shrink:0;">Очищать историю через (дней):</label>
            <input type="number" id="settingsCleanupDays" class="form-control" style="width:80px;padding:6px 10px;" value="${days}" min="1" max="365">
            <button id="settingsCleanupNow" class="btn btn-danger" style="padding:6px 16px;background:#C62828;color:#FFF;border:none;border-radius:8px;cursor:pointer;">Очистить сейчас</button>
        </div>
        <div style="font-size:11px;color:#7B8D8E;margin-top:4px;">Будут удалены записи, шаблоны окошек и уведомления старше указанного количества дней</div>
    `;
    const daysInput = document.getElementById('settingsCleanupDays');
    if (daysInput) {
        daysInput.addEventListener('change', function() {
            const val = parseInt(this.value);
            if (val > 0 && val <= 365) {
                localStorage.setItem(STORAGE_KEYS.CLEANUP_DAYS, String(val));
                showToast('✅ Срок очистки сохранен: ' + val + ' дней');
            } else {
                this.value = getCleanupDays();
                showToast('❌ Введите число от 1 до 365', 'error');
            }
        });
    }
    const nowBtn = document.getElementById('settingsCleanupNow');
    if (nowBtn) {
        nowBtn.addEventListener('click', function() {
            if (confirm('Удалить все записи, шаблоны и уведомления старше ' + getCleanupDays() + ' дней?')) {
                performCleanup();
                showToast('🧹 Очистка запущена!');
                closeSettings();
            }
        });
    }
}

function performCleanup() {
    const days = getCleanupDays();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffTime = cutoff.getTime();
    getAllRecords().then(records => {
        const toDelete = records.filter(r => new Date(r.date).getTime() < cutoffTime);
        toDelete.forEach(r => deleteRecord(r.id));
        for (const [key, recs] of Object.entries(recordsData)) {
            recordsData[key] = recs.filter(r => new Date(r.date).getTime() >= cutoffTime);
            if (recordsData[key].length === 0) delete recordsData[key];
        }
        const monthKey = getMonthKey();
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith(STORAGE_KEYS.TEMPLATE_PREFIX) && key !== STORAGE_KEYS.TEMPLATE_PREFIX + monthKey) {
                const m = key.replace(STORAGE_KEYS.TEMPLATE_PREFIX, '');
                const [y, mo] = m.split('-').map(Number);
                if (new Date(y, mo - 1, 1).getTime() < cutoffTime) {
                    localStorage.removeItem(key);
                }
            }
        }
        renderCalendar();
        updateBadge();
        showToast('✅ Очистка завершена');
    });
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

function openTemplateEditor(title, text) {
    closeSettings();
    document.getElementById('templateEditorTitle').textContent = '✏️ ' + title;
    document.getElementById('templateEditorText').value = text;
    document.getElementById('templateEditorModal').style.display = 'flex';
}

function closeTemplateEditor() {
    document.getElementById('templateEditorModal').style.display = 'none';
}

function saveTemplateFromEditor() {
    const text = document.getElementById('templateEditorText').value;
    const key = editingTemplateType === 'new' ? 'letterTemplate' : 'confirmLetterTemplate';
    saveTemplate(key, text);
    closeTemplateEditor();
    showToast('✅ Шаблон сохранен!');
}

function insertVariable(varName) {
    const ta = document.getElementById('templateEditorText');
    const start = ta.selectionStart;
    const text = ta.value;
    const variable = '{{' + varName + '}}';
    ta.value = text.substring(0, start) + variable + text.substring(start);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + variable.length;
}

function initSettings() {
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('settingsCloseBtn').addEventListener('click', closeSettings);
    document.getElementById('settingsModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeSettings(); });
}

function initTemplateEditor() {
    document.getElementById('templateEditorClose').addEventListener('click', closeTemplateEditor);
    document.getElementById('templateEditorCancel').addEventListener('click', closeTemplateEditor);
    document.getElementById('templateEditorSave').addEventListener('click', saveTemplateFromEditor);
    document.getElementById('templateEditorModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeTemplateEditor(); });
    document.querySelectorAll('[data-var]').forEach(btn => {
        btn.addEventListener('click', () => insertVariable(btn.dataset.var));
    });
}

// ============================================
//  СТАТИСТИКА
// ============================================

function showStats() {
    const modal = document.getElementById('statsModal');
    if (!modal) return;
    const now = new Date();
    document.getElementById('statsDateFrom').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    document.getElementById('statsDateTo').value = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    modal.style.display = 'flex';
    renderStats();
}

function renderStats() {
    const container = document.getElementById('statsContent');
    if (!container) return;
    const from = document.getElementById('statsDateFrom').value;
    const to = document.getElementById('statsDateTo').value;
    if (!from || !to) { container.innerHTML = '<p style="color:#7B8D8E;text-align:center;padding:20px;">Выберите период</p>'; return; }
    const fromDate = new Date(from), toDate = new Date(to);
    toDate.setHours(23,59,59,999);
    const stats = {'Кератин':0,'Ботокс':0,'Холодное':0,'Полировка':0};
    let total = 0;
    for (const [dateKey, records] of Object.entries(recordsData)) {
        const d = new Date(dateKey);
        if (d >= fromDate && d <= toDate) {
            records.forEach(r => {
                if (stats[r.serviceType] !== undefined && r.serviceType !== 'Выходной') {
                    stats[r.serviceType]++;
                    total++;
                }
            });
        }
    }
    if (total === 0) { container.innerHTML = '<p style="color:#7B8D8E;text-align:center;padding:20px;">Нет данных</p>'; return; }
    const maxCount = Math.max(...Object.values(stats));
    let html = '<div style="margin-bottom:12px;text-align:center;font-size:14px;color:#37474F;">Всего записей: <strong>' + total + '</strong></div>';
    for (const [service, count] of Object.entries(stats)) {
        const percent = maxCount > 0 ? (count / maxCount * 100) : 0;
        const color = COLORS[service] || '#008080';
        html += '<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:500;margin-bottom:3px;"><span>' + service + '</span><span>' + count + '</span></div>' +
            '<div style="height:24px;background:#F0F0F0;border-radius:12px;overflow:hidden;"><div style="height:100%;width:' + percent + '%;background:' + color + ';border-radius:12px;transition:width 0.5s ease;"></div></div></div>';
    }
    container.innerHTML = html;
}

function initStats() {
    document.getElementById('statsBtn').addEventListener('click', showStats);
    document.getElementById('statsCloseBtn').addEventListener('click', () => document.getElementById('statsModal').style.display = 'none');
    document.getElementById('statsModal').addEventListener('click', e => { if (e.target === e.currentTarget) e.target.style.display = 'none'; });
    document.getElementById('statsDateFrom').addEventListener('change', renderStats);
    document.getElementById('statsDateTo').addEventListener('change', renderStats);
}

// ============================================
//  ДЕТАЛЬНЫЙ РЕЖИМ
// ============================================

const Detail = {
    currentDay: null, currentMonth: null, currentYear: null,
    isInitialized: false, lastMonth: null, lastYear: null,
    
    show(day, month, year) {
        this.currentDay = day;
        this.currentMonth = month;
        this.currentYear = year;
        document.getElementById('calendarContainer').style.display = 'none';
        document.getElementById('bottomPanel').style.display = 'none';
        document.getElementById('filtersContainer').style.display = 'none';
        document.getElementById('detailContainer').style.display = 'block';
        document.getElementById('appHeader').style.display = 'none';
        this.updateHeader(month, year);
        if (!this.isInitialized || this.lastMonth !== month || this.lastYear !== year) {
            this.populateCarousel(day, month, year);
            this.lastMonth = month;
            this.lastYear = year;
            this.isInitialized = true;
        }
        this.drawDetailTile(day, month, year, []);
        this.updateRecordsList(day, month, year);
        setTimeout(() => this.focusOnDate(day, month, year), 150);
    },
    
    focusOnDate(day, month, year) {
        const track = document.getElementById('carouselTrack');
        if (!track) return;
        const items = track.children;
        let targetIndex = -1;
        for (let i = 0; i < items.length; i++) {
            const el = items[i];
            if (parseInt(el.dataset.day) === day && parseInt(el.dataset.month) === month && parseInt(el.dataset.year) === year) {
                targetIndex = i;
                break;
            }
        }
        if (targetIndex === -1) {
            this.populateCarousel(day, month, year);
            this.lastMonth = month;
            this.lastYear = year;
            setTimeout(() => this.focusOnDate(day, month, year), 50);
            return;
        }
        const containerWidth = track.parentElement.offsetWidth || 300;
        const itemWidth = 58;
        carouselScrollPos = -(targetIndex * itemWidth - containerWidth/2 + itemWidth/2);
        track.style.transition = 'transform 0.4s ease';
        track.style.transform = 'translateX(' + carouselScrollPos + 'px)';
        track.querySelectorAll('.day-tile').forEach((tile, idx) => tile.classList.toggle('active', idx === targetIndex));
        setTimeout(() => this.updateHeaderFromCarousel(), 100);
    },
    
    updateHeader(month, year) {
        document.getElementById('detailHeader').textContent = 
            ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][month-1] + ' ' + year;
    },
    
    updateHeaderFromCarousel() {
        const track = document.getElementById('carouselTrack');
        if (!track) return;
        const containerWidth = track.parentElement.offsetWidth;
        const items = track.children;
        let closestIdx = 0, closestDist = Infinity;
        const centerX = -carouselScrollPos + containerWidth/2;
        for (let i = 0; i < items.length; i++) {
            const dist = Math.abs(i * 58 + 29 - centerX);
            if (dist < closestDist) { closestDist = dist; closestIdx = i; }
        }
        if (items[closestIdx]) {
            const m = parseInt(items[closestIdx].dataset.month);
            const y = parseInt(items[closestIdx].dataset.year);
            this.updateHeader(m, y);
            this.currentMonth = m;
            this.currentYear = y;
        }
    },
    
    populateCarousel: function(day, month, year) {
        const track = document.getElementById('carouselTrack');
        if (!track) return;
        const months = [
            { m: month === 1 ? 12 : month - 1, y: month === 1 ? year - 1 : year },
            { m: month, y: year },
            { m: month === 12 ? 1 : month + 1, y: month === 12 ? year + 1 : year }
        ];
        track.innerHTML = '';
        const daysOfWeek = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
        const user = getCurrentUser();
        const currentUserName = user ? user.name : null;
        
        months.forEach(({m, y}) => {
            for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
                const wrapper = document.createElement('div');
                wrapper.className = 'carousel-item';
                wrapper.dataset.day = d;
                wrapper.dataset.month = m;
                wrapper.dataset.year = y;
                const tile = document.createElement('div');
                tile.className = 'day-tile';
                const isPast = isDayPast(y, m, d);
                if (isPast) { tile.style.background = '#F5F5F5'; tile.style.borderRadius = '50%'; }
                
                const canvas = document.createElement('canvas');
                canvas.width = 120;
                canvas.height = 120;
                canvas.style.cssText = 'width:100%;height:100%;display:block;border-radius:50%;';
                const ctx = canvas.getContext('2d');
                const size = canvas.width, cx = size/2, cy = size/2;
                const radius = size/2 - 6, innerRadius = radius * INNER_RADIUS_RATIO;
                ctx.clearRect(0, 0, size, size);
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI*2);
                ctx.fillStyle = isPast ? '#F5F5F5' : '#FFFDF9';
                ctx.fill();
                ctx.strokeStyle = '#E0F2F1';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx, cy, innerRadius, 0, Math.PI*2);
                ctx.fillStyle = '#FFFDF9';
                ctx.fill();
                ctx.strokeStyle = '#E0F2F1';
                ctx.lineWidth = 0.5;
                ctx.stroke();
                
                const dateKey = y + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
                let dayRecords = recordsData[dateKey] || [];
                if (!Array.isArray(dayRecords)) {
                    dayRecords = Object.values(dayRecords);
                }
                
                const hourWidth = (Math.PI*2) / WORKING_HOURS;
                const startAngle = Math.PI;
                for (let i = 0; i < WORKING_HOURS; i++) {
                    const hour = 9 + i;
                    const angleStart = startAngle + i * hourWidth;
                    const angleEnd = angleStart + hourWidth;
                    let isBooked = false, color = GRAY, isOwn = false;
                    for (const r of dayRecords) {
                        if (hour >= r.startHour && hour < r.endHour) {
                            isBooked = true;
                            // Проверяем по полю "master", а не по userId
                            isOwn = currentUserName && r.master === currentUserName;
                            color = isOwn ? (COLORS[r.serviceType] || GRAY) : GRAY;
                            break;
                        }
                    }
                    ctx.beginPath();
                    ctx.moveTo(cx + innerRadius * Math.cos(angleStart), cy + innerRadius * Math.sin(angleStart));
                    ctx.arc(cx, cy, radius, angleStart, angleEnd);
                    ctx.arc(cx, cy, innerRadius, angleEnd, angleStart);
                    ctx.closePath();
                    if (isBooked) {
                        const fillColor = isOwn ? color + '40' : GRAY + '40';
                        const strokeColor = isOwn ? (isPast ? color + '60' : color) : GRAY;
                        ctx.fillStyle = isPast ? color + '20' : fillColor;
                        ctx.fill();
                        ctx.strokeStyle = isPast ? color + '60' : strokeColor;
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = 'transparent';
                        ctx.fill();
                        ctx.strokeStyle = isPast ? '#E8E8E8' : '#E0F2F1';
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = isPast ? '#A0A0A0' : '#37474F';
                ctx.font = '600 ' + (size * 0.35) + 'px Montserrat, sans-serif';
                ctx.fillText(d, cx, cy + 2);
                
                tile.appendChild(canvas);
                const label = document.createElement('div');
                label.className = 'day-label';
                label.textContent = daysOfWeek[new Date(y, m - 1, d).getDay()];
                wrapper.appendChild(tile);
                wrapper.appendChild(label);
                
                tile.addEventListener('click', () => {
                    currentMonth = m;
                    currentYear = y;
                    this.show(d, m, y);
                });
                track.appendChild(wrapper);
            }
        });
    },
    
    drawDetailTile: function(day, month, year, highlightHours) {
        const canvas = document.getElementById('detailCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const size = canvas.width, cx = size/2, cy = size/2;
        const radius = size/2 - 20;
        const innerRadius = radius * INNER_RADIUS_RATIO;
        ctx.clearRect(0, 0, size, size);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI*2);
        ctx.fillStyle = '#FFFDF9';
        ctx.fill();
        ctx.strokeStyle = '#E0F2F1';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, innerRadius, 0, Math.PI*2);
        ctx.fillStyle = '#FFFDF9';
        ctx.fill();
        ctx.strokeStyle = '#E0F2F1';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        const dateKey = year + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
        let dayRecords = recordsData[dateKey] || [];
        if (!Array.isArray(dayRecords)) {
            dayRecords = Object.values(dayRecords);
        }
        const user = getCurrentUser();
        const currentUserName = user ? user.name : null;
        const hourWidth = (Math.PI*2) / WORKING_HOURS;
        const startAngle = Math.PI;
        const isPast = isDayPast(year, month, day);
        
        for (let i = 0; i < WORKING_HOURS; i++) {
            const hour = 9 + i;
            const angleStart = startAngle + i * hourWidth;
            const angleEnd = angleStart + hourWidth;
            let isBooked = false, color = GRAY, serviceType = '', isOwn = false;
            for (const r of dayRecords) {
                if (hour >= r.startHour && hour < r.endHour) {
                    isBooked = true;
                    serviceType = r.serviceType;
                    // Проверяем по полю "master", а не по userId
                    isOwn = currentUserName && r.master === currentUserName;
                    color = isOwn ? (COLORS[serviceType] || GRAY) : GRAY;
                    break;
                }
            }
            const isHighlighted = highlightHours.indexOf(hour) !== -1;
            ctx.beginPath();
            ctx.moveTo(cx + innerRadius * Math.cos(angleStart), cy + innerRadius * Math.sin(angleStart));
            ctx.arc(cx, cy, radius, angleStart, angleEnd);
            ctx.arc(cx, cy, innerRadius, angleEnd, angleStart);
            ctx.closePath();
            if (isBooked) {
                const fillColor = isOwn ? color + '40' : GRAY + '40';
                const strokeColor = isOwn ? (isPast ? color + '60' : color) : GRAY;
                ctx.fillStyle = isPast ? color + '20' : fillColor;
                ctx.fill();
                ctx.strokeStyle = isHighlighted ? '#008080' : (isPast ? strokeColor : strokeColor);
                ctx.lineWidth = isHighlighted ? 4 : 2.5;
                ctx.stroke();
            } else if (isHighlighted) {
                ctx.fillStyle = 'rgba(0,128,128,0.15)';
                ctx.fill();
                ctx.strokeStyle = '#008080';
                ctx.lineWidth = 3;
                ctx.stroke();
            } else {
                ctx.fillStyle = 'transparent';
                ctx.fill();
                ctx.strokeStyle = isPast ? '#E8E8E8' : '#E0F2F1';
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }
        const labelRadius = radius + 28;
        for (let i = 0; i < WORKING_HOURS; i++) {
            const hour = 9 + i;
            const angleStart = startAngle + i * hourWidth;
            const lx = cx + labelRadius * Math.cos(angleStart);
            const ly = cy + labelRadius * Math.sin(angleStart);
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isPast ? '#A0A0A0' : '#37474F';
            ctx.font = 'bold 18px Montserrat, sans-serif';
            ctx.fillText(String(hour).padStart(2,'0'), lx, ly);
            ctx.restore();
        }
    },
    
    updateRecordsList = function(day, month, year) {
        const dateKey = year + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
        let dayRecords = recordsData[dateKey] || [];
        if (!Array.isArray(dayRecords)) {
            dayRecords = Object.values(dayRecords);
        }
        const user = getCurrentUser();
        const currentUserName = user ? user.name : null;
        const list = document.getElementById('detailRecordsList');
        list.innerHTML = '';
        if (dayRecords.length === 0) {
            list.innerHTML = '<li style="background:none;color:#7B8D8E;font-size:13px;padding:8px 0;text-align:center;">Нет записей</li>';
            return;
        }
        dayRecords.sort((a,b) => a.startHour - b.startHour);
        dayRecords.forEach(record => {
            const isOwn = currentUserName && record.master === currentUserName;
            // ✅ ЕСЛИ АДМИН - ВСЕ ЗАПИСИ ОТКРЫВАЮТСЯ В РЕЖИМЕ РЕДАКТИРОВАНИЯ
            const isAdmin = isAdminMode();
            const canEdit = isOwn || isAdmin;
            
            const color = canEdit ? (COLORS[record.serviceType] || '#008080') : GRAY;
            const borderColor = canEdit ? color : GRAY;
            const bgColor = canEdit ? color + '30' : GRAY + '20';
            const li = document.createElement('li');
            li.style.cssText = `padding:8px 12px;margin-bottom:4px;background:${bgColor};border-radius:8px;cursor:pointer;transition:background 0.2s;border-left:4px solid ${borderColor};`;
            const start = String(record.startHour).padStart(2,'0') + ':00';
            const end = String(record.endHour).padStart(2,'0') + ':00';
            let info = '<strong>' + start + ' — ' + end + '</strong>';
            info += ' <span style="color:' + (canEdit ? '#008080' : '#7B8D8E') + ';font-weight:500;margin-left:6px;">' + record.serviceType + '</span>';
            if (canEdit && record.serviceType !== 'Выходной') {
                if (record.clientName) info += ' <span style="margin-left:8px;font-size:12px;color:#37474F;">' + record.clientName + '</span>';
                if (record.clientPhone) info += ' <span style="margin-left:8px;font-size:12px;color:#7B8D8E;">' + record.clientPhone + '</span>';
            }
            if (record.master) {
                info += ' <span style="margin-left:8px;font-size:11px;color:#7B8D8E;">👤 ' + record.master + '</span>';
            }
            if (canEdit && record.note) info += '<br><span style="font-size:11px;color:#7B8D8E;margin-left:6px;">📝 ' + record.note + '</span>';
            li.innerHTML = info;
            li.addEventListener('click', () => {
                // ✅ АДМИН МОЖЕТ РЕДАКТИРОВАТЬ ЛЮБЫЕ ЗАПИСИ
                if (canEdit) {
                    openModal(day, month, year, null, record.id, false);
                } else {
                    openModal(day, month, year, null, record.id, true);
                }
            });
            li.addEventListener('mouseenter', function() { this.style.background = canEdit ? color + '50' : GRAY + '30'; });
            li.addEventListener('mouseleave', function() { this.style.background = canEdit ? color + '30' : GRAY + '20'; });
            list.appendChild(li);
        });
    }
};

function openDetail(day, month, year) { Detail.show(day, month, year); }

// ============================================
//  НАВИГАЦИЯ
// ============================================

function initNavigation() {
    const container = document.getElementById('calendarContainer');
    let touchStartX = 0;
    let touchEndX = 0;
    if (container) {
        container.addEventListener('touchstart', function(e) {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        container.addEventListener('touchend', function(e) {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            if (Math.abs(diff) > 50) {
                const direction = diff > 0 ? 'next' : 'prev';
                if (diff > 0) {
                    if (currentMonth === 12) { currentMonth = 1; currentYear++; }
                    else { currentMonth++; }
                } else {
                    if (currentMonth === 1) { currentMonth = 12; currentYear--; }
                    else { currentMonth--; }
                }
                renderCalendar(direction);
            }
        }, { passive: true });
    }
    document.addEventListener('click', e => {
        if (e.target.id === 'prevMonth') {
            if (currentMonth === 1) { currentMonth = 12; currentYear--; }
            else { currentMonth--; }
            renderCalendar('prev');
        }
        if (e.target.id === 'nextMonth') {
            if (currentMonth === 12) { currentMonth = 1; currentYear++; }
            else { currentMonth++; }
            renderCalendar('next');
        }
    });
}

function initDetailControls() {
    document.getElementById('detailBackBtn').addEventListener('click', () => {
        document.getElementById('detailContainer').style.display = 'none';
        document.getElementById('calendarContainer').style.display = 'block';
        document.getElementById('bottomPanel').style.display = 'flex';
        document.getElementById('filtersContainer').style.display = 'block';
        document.getElementById('appHeader').style.display = 'flex';
        renderCalendar();
    });
    document.getElementById('detailAddBtn').addEventListener('click', () => {
        if (Detail.currentDay) openModal(Detail.currentDay, currentMonth, currentYear);
    });
}

// ============================================
//  КАРУСЕЛЬ
// ============================================

function initCarousel() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    track.addEventListener('mousedown', e => { isDragging = true; startX = e.clientX; startScrollPos = carouselScrollPos; track.style.transition = 'none'; });
    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        carouselScrollPos = startScrollPos + (e.clientX - startX);
        track.style.transform = 'translateX(' + carouselScrollPos + 'px)';
    });
    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        track.style.transition = 'transform 0.4s ease';
        const itemWidth = 58;
        carouselScrollPos = Math.round(carouselScrollPos / itemWidth) * itemWidth;
        track.style.transform = 'translateX(' + carouselScrollPos + 'px)';
        setTimeout(() => Detail.updateHeaderFromCarousel(), 100);
    });
    track.addEventListener('touchstart', e => { isDragging = true; startX = e.touches[0].clientX; startScrollPos = carouselScrollPos; track.style.transition = 'none'; }, { passive: true });
    track.addEventListener('touchmove', e => {
        if (!isDragging) return;
        carouselScrollPos = startScrollPos + (e.touches[0].clientX - startX);
        track.style.transform = 'translateX(' + carouselScrollPos + 'px)';
    }, { passive: true });
    track.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        track.style.transition = 'transform 0.4s ease';
        const itemWidth = 58;
        carouselScrollPos = Math.round(carouselScrollPos / itemWidth) * itemWidth;
        track.style.transform = 'translateX(' + carouselScrollPos + 'px)';
        setTimeout(() => Detail.updateHeaderFromCarousel(), 100);
    }, { passive: true });
    track.addEventListener('wheel', e => {
        e.preventDefault();
        carouselScrollPos += (e.deltaY > 0 ? -1 : 1) * 58;
        track.style.transform = 'translateX(' + carouselScrollPos + 'px)';
        setTimeout(() => Detail.updateHeaderFromCarousel(), 50);
    }, { passive: false });
}

// ============================================
//  ДЕТАЛЬНЫЙ CANVAS (ВЫДЕЛЕНИЕ ДИАПАЗОНА)
// ============================================

function initDetailCanvas() {
    const canvas = document.getElementById('detailCanvas');
    if (!canvas) return;
    let rangeStart = null, rangeHours = [], isRangeDragging = false;
    let singleClickTimeout = null;
    let lastHighlightedHour = null;
    
    function getHourFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY);
        if (clientX === undefined || clientY === undefined) return null;
        const x = (clientX - rect.left) / rect.width * canvas.width;
        const y = (clientY - rect.top) / rect.height * canvas.height;
        const cx = canvas.width/2, cy = canvas.height/2;
        const dist = Math.sqrt((x - cx)**2 + (y - cy)**2);
        const radiusPx = canvas.width/2 - 20;
        const innerRadiusPx = radiusPx * INNER_RADIUS_RATIO;
        if (dist < innerRadiusPx || dist > radiusPx) return null;
        const angle = Math.atan2(y - cy, x - cx);
        let rawHour = Math.floor((angle - Math.PI) / ((Math.PI*2)/WORKING_HOURS));
        if (rawHour < 0) rawHour += WORKING_HOURS;
        return 9 + rawHour % WORKING_HOURS;
    }
    
    function getHourCenterAngle(hour) {
        const startAngle = Math.PI;
        const hourWidth = (Math.PI*2) / WORKING_HOURS;
        return startAngle + (hour - 9) * hourWidth + hourWidth / 2;
    }
    
    function getAngleFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY);
        if (clientX === undefined || clientY === undefined) return null;
        const x = (clientX - rect.left) / rect.width * canvas.width;
        const y = (clientY - rect.top) / rect.height * canvas.height;
        const cx = canvas.width/2, cy = canvas.height/2;
        const dist = Math.sqrt((x - cx)**2 + (y - cy)**2);
        const radiusPx = canvas.width/2 - 20;
        const innerRadiusPx = radiusPx * INNER_RADIUS_RATIO;
        if (dist < innerRadiusPx || dist > radiusPx) return null;
        return Math.atan2(y - cy, x - cx);
    }
    
    function getBookedHours(dateKey) {
        const bookedHours = new Set();
        let dayRecords = recordsData[dateKey] || [];
        if (!Array.isArray(dayRecords)) {
            dayRecords = Object.values(dayRecords);
        }
        for (const r of dayRecords) {
            for (let h = r.startHour; h < r.endHour; h++) {
                bookedHours.add(h);
            }
        }
        return bookedHours;
    }
    
    function getRecordAtHour(dateKey, hour) {
        const dayRecords = recordsData[dateKey] || [];
        if (!Array.isArray(dayRecords)) {
            return null;
        }
        for (const r of dayRecords) {
            if (hour >= r.startHour && hour < r.endHour) {
                return r;
            }
        }
        return null;
    }
    
    function handleStart(e) {
        e.preventDefault();
        const hour = getHourFromEvent(e);
        if (hour === null) return;
        
        const dateKey = currentYear + '-' + String(currentMonth).padStart(2,'0') + '-' + String(Detail.currentDay || 1);
        const user = getCurrentUser();
        const currentUserName = user ? user.name : null;
        
        const existingRecord = getRecordAtHour(dateKey, hour);
        if (existingRecord) {
            const isOwn = currentUserName && existingRecord.master === currentUserName;
            // ✅ АДМИН МОЖЕТ РЕДАКТИРОВАТЬ ЛЮБЫЕ ЗАПИСИ
            const isAdmin = isAdminMode();
            const canEdit = isOwn || isAdmin;
            
            if (canEdit) {
                openModal(Detail.currentDay, currentMonth, currentYear, null, existingRecord.id, false);
            } else {
                openModal(Detail.currentDay, currentMonth, currentYear, null, existingRecord.id, true);
            }
            return;
        }
        
        const bookedHours = getBookedHours(dateKey);
        if (bookedHours.has(hour)) {
            showToast('⏰ Это время уже занято', 'error');
            return;
        }
        
        isRangeDragging = true;
        rangeStart = hour;
        rangeHours = [hour];
        lastHighlightedHour = hour;
        Detail.drawDetailTile(Detail.currentDay, currentMonth, currentYear, rangeHours);
        
        if (singleClickTimeout) clearTimeout(singleClickTimeout);
        singleClickTimeout = setTimeout(() => {
            if (isRangeDragging && rangeHours.length === 1) {
                const start = rangeHours[0];
                const end = start + 1;
                isRangeDragging = false;
                rangeHours = [];
                Detail.drawDetailTile(Detail.currentDay, currentMonth, currentYear, []);
                currentModalTab = 'main';
                // ✅ НОВАЯ ЗАПИСЬ ВСЕГДА ДОБАВЛЯЕТСЯ В РЕЖИМЕ РЕДАКТИРОВАНИЯ
                openModal(Detail.currentDay, currentMonth, currentYear, { start, end }, null, false);
            }
            singleClickTimeout = null;
        }, 300);
    }
    
    function handleMove(e) {
        e.preventDefault();
        if (!isRangeDragging) return;
        if (singleClickTimeout) { clearTimeout(singleClickTimeout); singleClickTimeout = null; }
        
        const angle = getAngleFromEvent(e);
        if (angle === null) return;
        
        const dateKey = currentYear + '-' + String(currentMonth).padStart(2,'0') + '-' + String(Detail.currentDay || 1);
        const bookedHours = getBookedHours(dateKey);
        const start = rangeStart;
        const startAngleCenter = getHourCenterAngle(start);
        let targetHour = null;
        
        // Определяем, в каком секторе находится курсор по углу
        const hourWidth = (Math.PI*2) / WORKING_HOURS;
        let rawAngle = angle - Math.PI;
        if (rawAngle < 0) rawAngle += Math.PI * 2;
        const index = Math.floor(rawAngle / hourWidth);
        targetHour = 9 + (index % WORKING_HOURS);
        if (targetHour < 9) targetHour += WORKING_HOURS;
        if (targetHour > 20) targetHour = 20;
        
        if (targetHour === null || targetHour === lastHighlightedHour) return;
        
        // Проверяем, пересек ли курсор середину целевого сектора
        const targetAngleCenter = getHourCenterAngle(targetHour);
        let angleDiff = angle - targetAngleCenter;
        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        const threshold = hourWidth * 0.5;
        
        if (Math.abs(angleDiff) > threshold) return;
        
        lastHighlightedHour = targetHour;
        const end = targetHour;
        
        let newRange = [];
        if (start <= end) {
            for (let h = start; h <= end; h++) {
                if (!bookedHours.has(h) && h < 21) {
                    newRange.push(h);
                } else if (h > start) {
                    break;
                }
            }
        } else {
            for (let h = start; h >= end; h--) {
                if (!bookedHours.has(h) && h >= 9) {
                    newRange.unshift(h);
                } else if (h < start) {
                    break;
                }
            }
        }
        
        if (newRange.length > 0) {
            rangeHours = newRange;
            Detail.drawDetailTile(Detail.currentDay, currentMonth, currentYear, rangeHours);
        }
    }
    
    function handleEnd(e) {
        e.preventDefault();
        if (!isRangeDragging) return;
        if (singleClickTimeout) { clearTimeout(singleClickTimeout); singleClickTimeout = null; }
        isRangeDragging = false;
        lastHighlightedHour = null;
        
        if (rangeHours.length >= 1) {
            const start = Math.min(...rangeHours);
            const end = Math.max(...rangeHours) + 1;
            rangeHours = [];
            Detail.drawDetailTile(Detail.currentDay, currentMonth, currentYear, []);
            currentModalTab = 'main';
            openModal(Detail.currentDay, currentMonth, currentYear, { start, end }, null, false);
        }
        rangeHours = [];
        Detail.drawDetailTile(Detail.currentDay, currentMonth, currentYear, []);
    }
    
    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('mouseleave', () => {});
    canvas.addEventListener('touchstart', handleStart, { passive: false });
    canvas.addEventListener('touchmove', handleMove, { passive: false });
    canvas.addEventListener('touchend', handleEnd, { passive: false });
}

// ============================================
//  TOAST
// ============================================

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
        padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 500;
        background: ${type === 'error' ? '#C62828' : '#008080'};
        color: #FFF; z-index: 9999; max-width: 90%; text-align: center;
        animation: slideUp 0.3s ease; opacity: 0; transition: opacity 0.3s ease;
        font-family: 'Montserrat', sans-serif;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.style.opacity = '1', 50);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ============================================
//  УВЕДОМЛЕНИЯ (ИНИЦИАЛИЗАЦИЯ)
// ============================================

function initNotifications() {
    document.getElementById('notificationsBtn').addEventListener('click', showNotificationsList);
    document.getElementById('notificationsCloseBtn').addEventListener('click', () => document.getElementById('notificationsModal').style.display = 'none');
    document.getElementById('notificationsModal').addEventListener('click', e => { if (e.target === e.currentTarget) e.target.style.display = 'none'; });
}

// ============================================
//  ОКОШКИ (ВНУТРЕННЯЯ СТРАНИЦА)
// ============================================

function initWindowsEditor() {
    console.log('🔧 Инициализация окошек...');
    
    const windowsPage = document.getElementById('windowsPage');
    const windowsPageCloseBtn = document.getElementById('windowsPageCloseBtn');
    const windowsPageEditBtn = document.getElementById('windowsPageEditBtn');
    const windowsPageViewBtn = document.getElementById('windowsPageViewBtn');
    const windowsPageSaveBtn = document.getElementById('windowsPageSaveBtn');
    const windowsPageResetBtn = document.getElementById('windowsPageResetBtn');
    const windowsPageAddBgBtn = document.getElementById('windowsPageAddBgBtn');
    const windowsPageFileInput = document.getElementById('windowsPageFileInput');
    const windowsPageCanvas = document.getElementById('windowsPageCanvas');
    const windowsPagePreview = document.getElementById('windowsPagePreview');
    const windowsPageHint = document.getElementById('windowsPageHint');
    const windowsPageSpinner = document.getElementById('windowsPageSpinner');
    const windowsPageBadge = document.getElementById('windowsPageBadge');
    const windowsPageFooterText = document.getElementById('windowsPageFooterText');
    const windowsPageContainer = document.getElementById('windowsPageContainer');
    
    const windowsState = {
        mode: 'view',
        background: null,
        cachedImage: null,
        textBlock: { x: 100, y: 200, width: 600, height: 1350 },
        hasChanges: false,
        previewImageData: null,
        isDragging: false,
        isResizing: false,
        dragOffset: { x: 0, y: 0 },
        resizeCorner: null,
        startPos: { x: 0, y: 0 },
        selected: false,
        recordsData: {},
        showWeekends: true
    };
    
    const W = 1080;
    const H = 1920;
    const TIMES = ['09:00', '12:00', '15:00', '18:00 (19:00)'];
    const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    let ctx = windowsPageCanvas.getContext('2d');
    let hintTimeout = null;
    
    // Создаем галочку для выходных
    const checkboxContainer = document.createElement('div');
    checkboxContainer.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-shrink:0;';
    checkboxContainer.innerHTML = `
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#37474F;cursor:pointer;">
            <input type="checkbox" id="windowsShowWeekends" checked style="width:18px;height:18px;cursor:pointer;">
            С моими выходными
        </label>
    `;
    const footer = document.getElementById('windowsPageFooter');
    if (footer) {
        footer.parentNode.insertBefore(checkboxContainer, footer);
    }
    
    const weekendsCheckbox = document.getElementById('windowsShowWeekends');
    if (weekendsCheckbox) {
        weekendsCheckbox.addEventListener('change', function() {
            windowsState.showWeekends = this.checked;
            generatePreviewImageForWindows();
            renderForWindows();
        });
    }
    
    function loadRecordsForWindows() {
        try {
            // ✅ ИСПОЛЬЗУЕМ УЖЕ ОТФИЛЬТРОВАННЫЕ ДАННЫЕ
            windowsState.recordsData = recordsData || {};
        } catch (e) {}
    }
    
    function loadTemplateForWindows() {
        try {
            const key = 'windowsTemplate_' + currentYear + '-' + String(currentMonth).padStart(2, '0');
            const data = localStorage.getItem(key);
            if (data) {
                const t = JSON.parse(data);
                windowsState.background = t.background || null;
                windowsState.textBlock = t.textBlock || { x: 100, y: 200, width: 600, height: 1350 };
                if (windowsState.background) {
                    const img = new Image();
                    img.onload = function() {
                        windowsState.cachedImage = this;
                        windowsState.hasChanges = false;
                        autoFitWidthForWindows();
                        generatePreviewImageForWindows();
                        renderForWindows();
                        hideSpinnerForWindows();
                    };
                    img.onerror = function() {
                        windowsState.cachedImage = null;
                        renderForWindows();
                        hideSpinnerForWindows();
                    };
                    img.src = windowsState.background;
                    return;
                }
            } else {
                windowsState.background = null;
                windowsState.cachedImage = null;
                windowsState.textBlock = { x: 100, y: 200, width: 600, height: 1350 };
                windowsState.previewImageData = null;
            }
            renderForWindows();
            hideSpinnerForWindows();
        } catch (e) {
            console.error('❌ Ошибка загрузки шаблона:', e);
            renderForWindows();
            hideSpinnerForWindows();
        }
    }
    
    function autoFitWidthForWindows() {
        if (!windowsState.background || !windowsState.textBlock) return;
        const lines = generateTextForEditorWindows();
        if (!lines || !lines.length) return;
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        let maxWidth = 0;
        const fontSize = 32;
        tempCtx.font = 'bold ' + fontSize + 'px Montserrat, sans-serif';
        for (let i = 0; i < lines.length; i++) {
            const clean = lines[i].replace(/~~/g, '');
            const metrics = tempCtx.measureText(clean);
            if (metrics.width > maxWidth) {
                maxWidth = metrics.width;
            }
        }
        const padding = 20;
        let newWidth = maxWidth + padding * 2;
        if (newWidth < 400) newWidth = 400;
        if (newWidth > 880) newWidth = 880;
        windowsState.textBlock.width = Math.floor(newWidth);
        const maxX = W - newWidth - 20;
        if (windowsState.textBlock.x > maxX) {
            windowsState.textBlock.x = Math.max(20, maxX);
        }
    }
    
    function isWeekend(day) {
        const date = new Date(currentYear, currentMonth - 1, day);
        const dayOfWeek = date.getDay();
        return dayOfWeek === 0 || dayOfWeek === 6;
    }
    
    function generateTextForWindows() {
        const now = new Date();
        const year = currentYear;
        const month = currentMonth;
        const days = new Date(year, month, 0).getDate();
        const today = now.getDate();
        const todayYear = now.getFullYear();
        const todayMonth = now.getMonth() + 1;
        const todayHour = now.getHours();
        const lines = [];
        const showWeekends = windowsState.showWeekends;
        const currentUser = getCurrentUser();
        const currentUserName = currentUser ? currentUser.name : null;
        
        for (let d = 1; d <= days; d++) {
            const date = new Date(year, month - 1, d);
            const ds = String(d).padStart(2, '0') + '.' + String(month).padStart(2, '0');
            const dateKey = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            
            let isPastDay = false;
            if (month < todayMonth && year <= todayYear) {
                isPastDay = true;
            } else if (month > todayMonth) {
                isPastDay = false;
            } else if (month === todayMonth && year === todayYear) {
                if (d < today) {
                    isPastDay = true;
                } else if (d === today && todayHour >= 21) {
                    isPastDay = true;
                }
            } else if (year < todayYear) {
                isPastDay = true;
            }
            
            const booked = new Set();
            const weekendSlots = new Set();
            const dayRecords = windowsState.recordsData[dateKey] || [];
            
            for (let r = 0; r < dayRecords.length; r++) {
                const record = dayRecords[r];
                
                // ✅ ПРОПУСКАЕМ ЗАПИСИ "Выходной", если они не принадлежат текущему пользователю
                if (record.serviceType === 'Выходной' && record.master !== currentUserName) {
                    continue;
                }
                
                for (let t = 0; t < TIMES.length; t++) {
                    let hour = parseInt(TIMES[t].split(':')[0]);
                    if (TIMES[t].includes('(')) {
                        hour = 18;
                    }
                    if (hour >= record.startHour && hour < record.endHour) {
                        // Если запись "Выходной" - добавляем в weekendSlots
                        if (record.serviceType === 'Выходной') {
                            weekendSlots.add(TIMES[t]);
                        } else {
                            // Обычная запись - всегда зачеркиваем
                            booked.add(TIMES[t]);
                        }
                    }
                }
            }
            
            const timeParts = [];
            for (let t = 0; t < TIMES.length; t++) {
                let shouldStrike = booked.has(TIMES[t]) || isPastDay;
                
                // ✅ ЗАЧЕРКИВАЕМ "Выходной" ТОЛЬКО если галочка активна
                if (showWeekends && weekendSlots.has(TIMES[t])) {
                    shouldStrike = true;
                }
                
                timeParts.push(shouldStrike ? '~~' + TIMES[t] + '~~' : TIMES[t]);
            }
            lines.push(ds + '(' + WEEKDAYS[date.getDay()] + ') - ' + timeParts.join(', '));
        }
        return lines;
    }
    
    function generateTextForEditorWindows() {
        const year = currentYear;
        const month = currentMonth;
        const days = new Date(year, month, 0).getDate();
        const lines = [];
        for (let d = 1; d <= days; d++) {
            const date = new Date(year, month - 1, d);
            const ds = String(d).padStart(2, '0') + '.' + String(month).padStart(2, '0');
            const timeParts = TIMES.map(function(t) { return t; });
            lines.push(ds + '(' + WEEKDAYS[date.getDay()] + ') - ' + timeParts.join(', '));
        }
        return lines;
    }
    
    function calcFontSizeForWindows(lines, maxWidth, maxHeight) {
        const c = document.createElement('canvas');
        const cx = c.getContext('2d');
        for (let s = 32; s > 14; s--) {
            cx.font = 'bold ' + s + 'px Montserrat, sans-serif';
            let maxW = 0;
            for (let i = 0; i < lines.length; i++) {
                const clean = lines[i].replace(/~~/g, '');
                const w = cx.measureText(clean).width;
                if (w > maxW) maxW = w;
            }
            const totalH = lines.length * s * 1.4;
            if (maxW <= maxWidth && totalH <= maxHeight) {
                return s;
            }
        }
        return 14;
    }
    
    function drawLineForWindows(ctx, line, x, y, fontSize) {
        const parts = [];
        let current = '';
        let strike = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '~' && line[i+1] === '~') {
                if (current) { parts.push({ text: current, strike: strike }); current = ''; }
                strike = !strike;
                i++;
            } else {
                current += line[i];
            }
        }
        if (current) parts.push({ text: current, strike: strike });
        let cx = x;
        ctx.font = 'bold ' + fontSize + 'px Montserrat, sans-serif';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        for (let p = 0; p < parts.length; p++) {
            const w = ctx.measureText(parts[p].text).width;
            ctx.fillStyle = '#000000';
            ctx.fillText(parts[p].text, cx, y);
            if (parts[p].strike) {
                ctx.save();
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = Math.max(4, fontSize / 4);
                ctx.lineCap = 'round';
                ctx.beginPath();
                const centerY = y + fontSize / 2;
                ctx.moveTo(cx - 2, centerY);
                ctx.lineTo(cx + w + 2, centerY);
                ctx.stroke();
                ctx.restore();
            }
            cx += w;
        }
    }
    
    function generatePreviewImageForWindows() {
        if (!windowsState.background) {
            windowsState.previewImageData = null;
            windowsPagePreview.style.display = 'none';
            windowsPagePreview.src = '';
            windowsPageCanvas.style.display = 'block';
            hideHintForWindows();
            return;
        }
        const bg = windowsState.background;
        const tb = windowsState.textBlock;
        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = W;
        renderCanvas.height = H;
        const renderCtx = renderCanvas.getContext('2d');
        const img = new Image();
        img.onload = function() {
            renderCtx.drawImage(img, 0, 0, W, H);
            const b = tb;
            const padding = 20;
            const lines = generateTextForWindows();
            if (lines && lines.length) {
                const fontSize = calcFontSizeForWindows(lines, b.width - padding * 2, b.height - padding * 2);
                const lineHeight = fontSize * 1.4;
                const totalHeight = lines.length * lineHeight;
                const startY = b.y + padding + (b.height - padding * 2 - totalHeight) / 2;
                renderCtx.textAlign = 'left';
                renderCtx.textBaseline = 'top';
                for (let i = 0; i < lines.length; i++) {
                    const yPos = startY + i * lineHeight;
                    drawLineForWindows(renderCtx, lines[i], b.x + padding, yPos, fontSize);
                }
            }
            renderCtx.save();
            renderCtx.globalAlpha = 0.2;
            renderCtx.fillStyle = '#666';
            renderCtx.font = '20px Montserrat, sans-serif';
            renderCtx.textAlign = 'right';
            renderCtx.textBaseline = 'bottom';
            renderCtx.fillText('Окошки ' + currentYear + '-' + String(currentMonth).padStart(2, '0'), W - 20, H - 20);
            renderCtx.restore();
            windowsState.previewImageData = renderCanvas.toDataURL('image/png');
            if (windowsState.mode === 'view') {
                windowsPagePreview.src = windowsState.previewImageData;
                windowsPagePreview.style.display = 'block';
                windowsPageCanvas.style.display = 'none';
                showHintForWindows();
            }
        };
        img.onerror = function() {
            windowsState.previewImageData = null;
            windowsPagePreview.style.display = 'none';
            windowsPagePreview.src = '';
            windowsPageCanvas.style.display = 'block';
        };
        img.src = bg;
    }
    
    function renderForWindows() {
        if (windowsState.mode === 'view' && windowsState.previewImageData && windowsState.background) {
            windowsPagePreview.src = windowsState.previewImageData;
            windowsPagePreview.style.display = 'block';
            windowsPageCanvas.style.display = 'none';
            return;
        }
        windowsPagePreview.style.display = 'none';
        windowsPageCanvas.style.display = 'block';
        ctx.clearRect(0, 0, W, H);
        drawCheckerboardForWindows();
        if (windowsState.background && windowsState.cachedImage) {
            try {
                ctx.drawImage(windowsState.cachedImage, 0, 0, W, H);
                if (windowsState.mode === 'edit') {
                    drawTextBlockEditorForWindows();
                } else {
                    drawTextBlockForWindows();
                }
                if (windowsState.mode === 'edit' && (windowsState.selected || windowsState.isDragging || windowsState.isResizing)) {
                    drawSelectionForWindows();
                }
                return;
            } catch (e) {}
        }
        if (windowsState.background && !windowsState.cachedImage) {
            const img = new Image();
            img.onload = function() {
                windowsState.cachedImage = this;
                renderForWindows();
            };
            img.onerror = function() {
                drawPlaceholderForWindows();
            };
            img.src = windowsState.background;
            return;
        }
        drawPlaceholderForWindows();
    }
    
    function drawCheckerboardForWindows() {
        const size = 40;
        for (let y = 0; y < H; y += size) {
            for (let x = 0; x < W; x += size) {
                ctx.fillStyle = (Math.floor(x/size) + Math.floor(y/size)) % 2 === 0 ? '#FFFFFF' : '#E8E8E8';
                ctx.fillRect(x, y, size, size);
            }
        }
    }
    
    function drawPlaceholderForWindows() {
        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#B0BEC5';
        ctx.font = '40px Montserrat, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📷 Нет шаблона', W/2, H/2 - 40);
        ctx.font = '24px Montserrat, sans-serif';
        ctx.fillText('Нажмите ✏️ для редактирования', W/2, H/2 + 40);
        if (windowsState.mode === 'edit') {
            ctx.fillStyle = '#008080';
            ctx.font = '20px Montserrat, sans-serif';
            ctx.fillText('и добавьте подложку', W/2, H/2 + 80);
        }
    }
    
    function drawTextBlockForWindows() {
        const b = windowsState.textBlock;
        const padding = 20;
        const lines = generateTextForWindows();
        if (!lines || !lines.length) return;
        const fontSize = calcFontSizeForWindows(lines, b.width - padding * 2, b.height - padding * 2);
        const lineHeight = fontSize * 1.4;
        const totalHeight = lines.length * lineHeight;
        const startY = b.y + padding + (b.height - padding * 2 - totalHeight) / 2;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (let i = 0; i < lines.length; i++) {
            const yPos = startY + i * lineHeight;
            drawLineForWindows(ctx, lines[i], b.x + padding, yPos, fontSize);
        }
    }
    
    function drawTextBlockEditorForWindows() {
        const b = windowsState.textBlock;
        const padding = 20;
        const lines = generateTextForEditorWindows();
        if (!lines || !lines.length) return;
        const fontSize = calcFontSizeForWindows(lines, b.width - padding * 2, b.height - padding * 2);
        const lineHeight = fontSize * 1.4;
        const totalHeight = lines.length * lineHeight;
        const startY = b.y + padding + (b.height - padding * 2 - totalHeight) / 2;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#000000';
        ctx.font = 'bold ' + fontSize + 'px Montserrat, sans-serif';
        for (let i = 0; i < lines.length; i++) {
            const yPos = startY + i * lineHeight;
            ctx.fillText(lines[i], b.x + padding, yPos);
        }
    }
    
    function drawSelectionForWindows() {
        const b = windowsState.textBlock;
        const size = 50;
        ctx.save();
        ctx.strokeStyle = '#008080';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(b.x, b.y, b.width, b.height);
        ctx.restore();
        const corners = [
            { x: b.x, y: b.y },
            { x: b.x + b.width, y: b.y + b.height }
        ];
        for (let c = 0; c < corners.length; c++) {
            ctx.save();
            ctx.fillStyle = '#008080';
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(corners[c].x, corners[c].y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 22px Montserrat, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('↕', corners[c].x, corners[c].y);
            ctx.restore();
        }
    }
    
    function isOnResizeCornerForWindows(x, y) {
        const b = windowsState.textBlock;
        const size = 80;
        if (Math.abs(x - b.x) < size && Math.abs(y - b.y) < size) return 'tl';
        if (Math.abs(x - (b.x + b.width)) < size && Math.abs(y - (b.y + b.height)) < size) return 'br';
        return null;
    }
    
    function isInTextBlockForWindows(x, y) {
        const b = windowsState.textBlock;
        const padding = 20;
        return x >= b.x - padding && x <= b.x + b.width + padding && 
               y >= b.y - padding && y <= b.y + b.height + padding;
    }
    
    function getCoordsForWindows(e) {
        const rect = windowsPageCanvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        if (clientX === undefined || clientY === undefined) return { x: 0, y: 0 };
        return {
            x: Math.max(0, Math.min(W, (clientX - rect.left) * (windowsPageCanvas.width / rect.width))),
            y: Math.max(0, Math.min(H, (clientY - rect.top) * (windowsPageCanvas.height / rect.height)))
        };
    }
    
    function onPointerDownForWindows(e) {
        if (windowsState.mode !== 'edit' || !windowsState.background) return;
        e.preventDefault();
        const pos = getCoordsForWindows(e);
        const corner = isOnResizeCornerForWindows(pos.x, pos.y);
        if (corner) {
            windowsState.isResizing = true;
            windowsState.resizeCorner = corner;
            windowsState.startPos = { x: pos.x, y: pos.y };
            return;
        }
        if (isInTextBlockForWindows(pos.x, pos.y)) {
            windowsState.isDragging = true;
            windowsState.selected = true;
            windowsState.dragOffset = { x: pos.x - windowsState.textBlock.x, y: pos.y - windowsState.textBlock.y };
            renderForWindows();
        } else {
            windowsState.selected = false;
            renderForWindows();
        }
    }
    
    function onPointerMoveForWindows(e) {
        if (windowsState.mode !== 'edit') return;
        e.preventDefault();
        if (!windowsState.isDragging && !windowsState.isResizing) {
            const pos = getCoordsForWindows(e);
            const corner = isOnResizeCornerForWindows(pos.x, pos.y);
            if (corner === 'tl') windowsPageCanvas.style.cursor = 'nwse-resize';
            else if (corner === 'br') windowsPageCanvas.style.cursor = 'nesw-resize';
            else if (isInTextBlockForWindows(pos.x, pos.y)) windowsPageCanvas.style.cursor = 'move';
            else windowsPageCanvas.style.cursor = 'default';
            return;
        }
        if (windowsState.isDragging) {
            const pos = getCoordsForWindows(e);
            const b = windowsState.textBlock;
            b.x = Math.max(0, Math.min(W - b.width, pos.x - windowsState.dragOffset.x));
            b.y = Math.max(0, Math.min(H - b.height, pos.y - windowsState.dragOffset.y));
            windowsState.hasChanges = true;
            renderForWindows();
            return;
        }
        if (windowsState.isResizing) {
            const pos = getCoordsForWindows(e);
            const b = windowsState.textBlock;
            const dx = pos.x - windowsState.startPos.x;
            const dy = pos.y - windowsState.startPos.y;
            if (windowsState.resizeCorner === 'br') {
                b.width = Math.min(W - b.x, Math.max(200, b.width + dx));
                b.height = Math.min(H - b.y, Math.max(200, b.height + dy));
            } else if (windowsState.resizeCorner === 'tl') {
                let newX = Math.max(0, b.x + dx);
                let newY = Math.max(0, b.y + dy);
                let newW = Math.max(200, b.width - dx);
                let newH = Math.max(200, b.height - dy);
                if (newX + newW > W) newW = W - newX;
                if (newY + newH > H) newH = H - newY;
                b.x = newX;
                b.y = newY;
                b.width = newW;
                b.height = newH;
            }
            windowsState.startPos = { x: pos.x, y: pos.y };
            windowsState.hasChanges = true;
            renderForWindows();
        }
    }
    
    function onPointerUpForWindows(e) {
        windowsState.isDragging = false;
        windowsState.isResizing = false;
        windowsState.resizeCorner = null;
        windowsPageCanvas.style.cursor = 'default';
    }
    
    function loadBackgroundForWindows(file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = W;
                tempCanvas.height = H;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0, W, H);
                const compressedDataUrl = tempCanvas.toDataURL('image/jpeg', 0.7);
                windowsState.background = compressedDataUrl;
                const cached = new Image();
                cached.onload = function() {
                    windowsState.cachedImage = this;
                    windowsState.hasChanges = true;
                    autoFitWidthForWindows();
                    generatePreviewImageForWindows();
                    renderForWindows();
                    showToastForWindows('✅ Подложка добавлена');
                };
                cached.onerror = function() {
                    windowsState.cachedImage = null;
                    renderForWindows();
                    showToastForWindows('⚠️ Ошибка загрузки подложки', 'error');
                };
                cached.src = compressedDataUrl;
            };
            img.onerror = function() {
                showToastForWindows('❌ Не удалось загрузить изображение', 'error');
            };
            img.src = event.target.result;
        };
        reader.onerror = function() {
            showToastForWindows('❌ Ошибка чтения файла', 'error');
        };
        reader.readAsDataURL(file);
    }
    
    function saveTemplateForWindows() {
        if (!windowsState.background) {
            showToastForWindows('⚠️ Сначала добавьте подложку', 'error');
            return;
        }
        const key = 'windowsTemplate_' + currentYear + '-' + String(currentMonth).padStart(2, '0');
        localStorage.setItem(key, JSON.stringify({
            background: windowsState.background,
            textBlock: windowsState.textBlock
        }));
        windowsState.hasChanges = false;
        generatePreviewImageForWindows();
        showToastForWindows('✅ Шаблон сохранен для ' + currentYear + '-' + String(currentMonth).padStart(2, '0'));
    }
    
    function resetAllForWindows() {
        if (windowsState.hasChanges && !confirm('Есть несохраненные изменения. Сбросить?')) return;
        windowsState.background = null;
        windowsState.cachedImage = null;
        windowsState.textBlock = { x: 100, y: 200, width: 600, height: 1350 };
        windowsState.hasChanges = false;
        windowsState.selected = false;
        windowsState.isDragging = false;
        windowsState.isResizing = false;
        windowsState.previewImageData = null;
        windowsPagePreview.style.display = 'none';
        windowsPagePreview.src = '';
        windowsPageCanvas.style.display = 'block';
        hideHintForWindows();
        const key = 'windowsTemplate_' + currentYear + '-' + String(currentMonth).padStart(2, '0');
        localStorage.removeItem(key);
        renderForWindows();
        showToastForWindows('↺ Шаблон сброшен');
    }
    
    function showHintForWindows() {
        windowsPageHint.classList.add('show');
        clearTimeout(hintTimeout);
        hintTimeout = setTimeout(function() {
            windowsPageHint.classList.remove('show');
        }, 5000);
    }
    
    function hideHintForWindows() {
        windowsPageHint.classList.remove('show');
        clearTimeout(hintTimeout);
    }
    
    function showToastForWindows(message, type) {
        type = type || 'info';
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 500;
            background: ${type === 'error' ? '#C62828' : '#008080'};
            color: #FFF; z-index: 9999; max-width: 90%; text-align: center;
            animation: slideUp 0.3s ease; opacity: 0; transition: opacity 0.3s ease;
            font-family: 'Montserrat', sans-serif;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(function() { toast.style.opacity = '1'; }, 50);
        setTimeout(function() { 
            toast.style.opacity = '0'; 
            setTimeout(function() { toast.remove(); }, 300); 
        }, 3000);
    }
    
    function hideSpinnerForWindows() {
        windowsPageSpinner.style.display = 'none';
    }
    
    function setModeForWindows(mode) {
        windowsState.mode = mode;
        if (mode === 'view') {
            windowsPageBadge.textContent = '👁️ Просмотр';
            windowsPageBadge.className = 'mode-badge view';
            windowsPageFooterText.textContent = '👁️ Просмотр · Нажмите ✏️ для редактирования';
            windowsPageEditBtn.style.display = 'inline-block';
            windowsPageViewBtn.style.display = 'none';
            windowsPageSaveBtn.style.display = 'none';
            windowsPageResetBtn.style.display = 'none';
            windowsPageAddBgBtn.style.display = 'none';
            windowsPageFileInput.style.display = 'none';
            windowsState.selected = false;
            if (windowsState.previewImageData && windowsState.background) {
                windowsPagePreview.src = windowsState.previewImageData;
                windowsPagePreview.style.display = 'block';
                windowsPageCanvas.style.display = 'none';
                showHintForWindows();
            } else {
                windowsPagePreview.style.display = 'none';
                windowsPagePreview.src = '';
                windowsPageCanvas.style.display = 'block';
                hideHintForWindows();
            }
        } else {
            windowsPageBadge.textContent = '✏️ Редактирование';
            windowsPageBadge.className = 'mode-badge';
            windowsPageFooterText.textContent = '✏️ Редактирование · Перетаскивайте блок за текст';
            windowsPageEditBtn.style.display = 'none';
            windowsPageViewBtn.style.display = 'inline-block';
            windowsPageSaveBtn.style.display = 'inline-block';
            windowsPageResetBtn.style.display = 'inline-block';
            windowsPageAddBgBtn.style.display = 'inline-block';
            windowsPageFileInput.style.display = 'block';
            windowsState.selected = true;
            if (windowsState.background) {
                autoFitWidthForWindows();
            }
            windowsPagePreview.style.display = 'none';
            windowsPagePreview.src = '';
            windowsPageCanvas.style.display = 'block';
            hideHintForWindows();
        }
        renderForWindows();
    }
    
    function openWindowsPage() {
        windowsPage.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        loadRecordsForWindows();
        loadTemplateForWindows();
        setModeForWindows('view');
        resizeCanvasForWindows();
    }
    
    function closeWindowsPage() {
        if (windowsState.hasChanges && !confirm('Есть несохраненные изменения. Закрыть?')) return;
        windowsPage.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    function resizeCanvasForWindows() {
        const containerWidth = windowsPageContainer.clientWidth - 16;
        const containerHeight = windowsPageContainer.clientHeight - 16;
        if (containerWidth <= 0 || containerHeight <= 0) {
            setTimeout(resizeCanvasForWindows, 100);
            return;
        }
        const aspect = W / H;
        let width = Math.min(containerWidth, containerHeight * aspect);
        let height = width / aspect;
        if (height > containerHeight) {
            height = containerHeight;
            width = height * aspect;
        }
        windowsPageCanvas.style.width = Math.floor(width) + 'px';
        windowsPageCanvas.style.height = Math.floor(height) + 'px';
    }
    
    // === Инициализация ===
    function init() {
        document.getElementById('windowsBtn').addEventListener('click', function() {
            localStorage.setItem('recordsData', JSON.stringify(recordsData));
            openWindowsPage();
        });
        
        windowsPageCloseBtn.addEventListener('click', function(e) {
            e.preventDefault();
            closeWindowsPage();
        });
        
        windowsPageEditBtn.addEventListener('click', function(e) {
            e.preventDefault();
            setModeForWindows('edit');
        });
        
        windowsPageViewBtn.addEventListener('click', function(e) {
            e.preventDefault();
            setModeForWindows('view');
            if (windowsState.background) {
                generatePreviewImageForWindows();
            }
        });
        
        windowsPageSaveBtn.addEventListener('click', function(e) {
            e.preventDefault();
            saveTemplateForWindows();
        });
        
        windowsPageResetBtn.addEventListener('click', function(e) {
            e.preventDefault();
            resetAllForWindows();
        });
        
        windowsPageFileInput.addEventListener('change', function(e) {
            const file = this.files[0];
            if (file) {
                loadBackgroundForWindows(file);
            }
            this.value = '';
        });
        
        windowsPageCanvas.addEventListener('mousedown', onPointerDownForWindows);
        document.addEventListener('mousemove', onPointerMoveForWindows);
        document.addEventListener('mouseup', onPointerUpForWindows);
        windowsPageCanvas.addEventListener('touchstart', onPointerDownForWindows, { passive: false });
        windowsPageCanvas.addEventListener('touchmove', onPointerMoveForWindows, { passive: false });
        windowsPageCanvas.addEventListener('touchend', onPointerUpForWindows, { passive: false });
        window.addEventListener('resize', resizeCanvasForWindows);
        console.log('✅ Внутренние окошки инициализированы');
    }
    
    init();
}