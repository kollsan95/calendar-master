// ============================================
//  ЛОКАЛЬНЫЕ УВЕДОМЛЕНИЯ
// ============================================

// === ЗАПРОС РАЗРЕШЕНИЯ ===
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('⚠️ Уведомления не поддерживаются');
        return;
    }
    
    if (Notification.permission === 'granted') {
        console.log('✅ Разрешение на уведомления уже есть');
        return;
    }
    
    Notification.requestPermission().then(function(permission) {
        if (permission === 'granted') {
            console.log('✅ Разрешение на уведомления получено');
        } else {
            console.warn('⚠️ Разрешение на уведомления отклонено');
        }
    });
}

// === ОТПРАВИТЬ УВЕДОМЛЕНИЕ ЧЕРЕЗ SERVICE WORKER ===
function sendNotification(title, body, delay = 0) {
    if (!('serviceWorker' in navigator)) {
        console.warn('⚠️ Service Worker не поддерживается');
        return;
    }
    
    navigator.serviceWorker.ready.then(function(registration) {
        if (delay > 0) {
            // Отправляем сообщение в SW для планирования
            registration.active.postMessage({
                type: 'scheduleNotification',
                title: title,
                body: body,
                delay: delay
            });
            console.log('📅 Уведомление запланировано через ' + (delay / 1000) + ' сек');
        } else {
            // Показываем сразу
            registration.showNotification(title, {
                body: body,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-72.png',
                vibrate: [200, 100, 200],
                tag: 'reminder-' + Date.now(),
                requireInteraction: true
            });
        }
    });
}

// === НАПОМИНАНИЕ О ЗАПИСИ ===
function scheduleReminder(record) {
    const now = Date.now();
    const recordTime = new Date(record.date + 'T' + record.startHour + ':00:00').getTime();
    const delay = recordTime - now - 30 * 60 * 1000; // за 30 минут
    
    if (delay > 0) {
        sendNotification(
            '⏰ Напоминание о записи',
            'У вас запись на ' + record.serviceType + ' в ' + record.startHour + ':00',
            delay
        );
    }
}

// === ЗАПРОС РАЗРЕШЕНИЯ ПРИ ЗАГРУЗКЕ ===
document.addEventListener('DOMContentLoaded', function() {
    requestNotificationPermission();
});