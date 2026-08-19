// js/stats.js

// ============================================
//  СТАТИСТИКА С ГРУППИРОВКОЙ ПО МАСТЕРАМ
// ============================================

const Stats = {
    // Состояние раскрытых групп (по умолчанию все закрыты)
    expandedMasters: {},
    currentData: null,
    
    // DOM элементы (инициализируются при вызове init)
    modal: null,
    closeBtn: null,
    dateFrom: null,
    dateTo: null,
    content: null,
    statsBtn: null,
    
    // ============================================
    //  ИНИЦИАЛИЗАЦИЯ
    // ============================================
    
    init: function() {
        console.log('📊 Инициализация статистики...');
        
        // Получаем DOM элементы
        this.modal = document.getElementById('statsModal');
        this.closeBtn = document.getElementById('statsCloseBtn');
        this.dateFrom = document.getElementById('statsDateFrom');
        this.dateTo = document.getElementById('statsDateTo');
        this.content = document.getElementById('statsContent');
        this.statsBtn = document.getElementById('statsBtn');
        
        if (!this.modal || !this.statsBtn) {
            console.warn('⚠️ Элементы статистики не найдены');
            return;
        }
        
        // Добавляем обработчики
        this.statsBtn.addEventListener('click', this.show.bind(this));
        this.closeBtn.addEventListener('click', this.hide.bind(this));
        this.modal.addEventListener('click', function(e) {
            if (e.target === this) {
                Stats.hide();
            }
        });
        this.dateFrom.addEventListener('change', this.render.bind(this));
        this.dateTo.addEventListener('change', this.render.bind(this));
        
        console.log('✅ Статистика инициализирована');
    },
    
    // ============================================
    //  ПОКАЗАТЬ / СКРЫТЬ
    // ============================================
    
    show: function() {
        if (!this.modal) return;
        
        // Устанавливаем даты на текущий месяц
        const now = new Date();
        this.dateFrom.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        this.dateTo.value = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        
        // ✅ Сбрасываем состояние раскрытых групп (все закрыты)
        this.expandedMasters = {};
        
        this.modal.style.display = 'flex';
        this.render();
    },
    
    hide: function() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    },
    
    // ============================================
    //  ПРОВЕРКА АДМИНА
    // ============================================
    
    isAdmin: function() {
        try {
            return localStorage.getItem('adminMode') === 'true';
        } catch {
            return false;
        }
    },
    
    // ============================================
    //  ПОЛУЧЕНИЕ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
    // ============================================
    
    getCurrentUser: function() {
        try {
            const userData = localStorage.getItem('user_data');
            if (userData) {
                return JSON.parse(userData);
            }
        } catch (e) {}
        return null;
    },
    
    // ============================================
    //  ПОЛУЧЕНИЕ ДАННЫХ ЗАПИСЕЙ
    // ============================================
    
    getRecordsData: function() {
        let data = window.recordsData || {};
        
        if (Object.keys(data).length === 0) {
            try {
                const cached = localStorage.getItem('cached_records');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Object.keys(parsed).length > 0) {
                        console.log('📦 Загружено из кеша для статистики:', Object.keys(parsed).length, 'дней');
                        data = parsed;
                    }
                }
            } catch (e) {
                console.warn('⚠️ Ошибка загрузки из кеша:', e);
            }
        }
        
        return data;
    },
    
    // ============================================
    //  ОБНОВЛЕНИЕ ДАННЫХ ИЗ APP
    // ============================================
    
    updateData: function(recordsData) {
        console.log('🔄 Статистика: данные обновлены');
        if (this.modal && this.modal.style.display === 'flex') {
            this.render();
        }
    },
    
    // ============================================
    //  ПОЛУЧЕНИЕ ВСЕХ МАСТЕРОВ
    // ============================================
    
    getAllMasters: function(recordsData) {
        const masters = new Set();
        
        for (const records of Object.values(recordsData)) {
            if (!Array.isArray(records)) continue;
            for (const record of records) {
                if (record.master) {
                    masters.add(record.master);
                }
            }
        }
        
        return masters;
    },
    
    // ============================================
    //  РЕНДЕРИНГ
    // ============================================
    
    render: function() {
        if (!this.content) return;
        
        const from = this.dateFrom.value;
        const to = this.dateTo.value;
        
        if (!from || !to) {
            this.content.innerHTML = '<p style="color:#7B8D8E;text-align:center;padding:20px;">Выберите период</p>';
            return;
        }
        
        const fromDate = new Date(from);
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        
        // Собираем статистику по мастерам и услугам
        const stats = this.collectStats(fromDate, toDate);
        
        if (Object.keys(stats).length === 0) {
            this.content.innerHTML = `
                <div style="text-align:center;padding:30px 20px;color:#7B8D8E;">
                    <div style="font-size:40px;margin-bottom:12px;">📭</div>
                    <p style="font-size:16px;font-weight:500;">Нет записей за выбранный период</p>
                    <p style="font-size:13px;margin-top:4px;">Попробуйте выбрать другой период</p>
                </div>
            `;
            return;
        }
        
        // Сохраняем данные
        this.currentData = stats;
        
        // Рендерим HTML
        this.content.innerHTML = this.buildHTML(stats);
        
        // Добавляем обработчики для раскрывающихся групп
        this.addToggleHandlers();
    },
    
    // ============================================
    //  СБОР СТАТИСТИКИ
    // ============================================
    
    collectStats: function(fromDate, toDate) {
        const stats = {};
        let totalAllRecords = 0;
        
        const recordsData = this.getRecordsData();
        
        const currentUser = this.getCurrentUser();
        const currentUserId = currentUser ? currentUser.id : null;
        const currentUserName = currentUser ? currentUser.name : null;
        
        const isAdmin = this.isAdmin();
        
        // ✅ Получаем всех мастеров
        const allMasters = this.getAllMasters(recordsData);
        
        // Инициализируем статистику для всех мастеров с 0
        for (const master of allMasters) {
            stats[master] = {
                total: 0,
                services: {}
            };
        }
        
        // Если админ - показываем всех, иначе только свои записи
        const showAllMasters = isAdmin;
        
        for (const [dateKey, records] of Object.entries(recordsData)) {
            const d = new Date(dateKey);
            if (d >= fromDate && d <= toDate) {
                if (!Array.isArray(records)) continue;
                
                for (const record of records) {
                    // Пропускаем выходные
                    const serviceName = record.serviceTypeName || record.serviceType || '';
                    if (serviceName === 'Выходной') continue;
                    
                    // Если не админ - показываем только свои записи
                    if (!showAllMasters) {
                        const recordMasterId = record.masterId || '';
                        const recordMasterName = record.master || '';
                        
                        const isOwnRecord = (currentUserId && recordMasterId === currentUserId) ||
                                           (currentUserName && recordMasterName === currentUserName);
                        
                        if (!isOwnRecord) {
                            continue;
                        }
                    }
                    
                    const masterName = record.master || 'Без мастера';
                    
                    if (!stats[masterName]) {
                        stats[masterName] = {
                            total: 0,
                            services: {}
                        };
                    }
                    
                    stats[masterName].total++;
                    totalAllRecords++;
                    
                    if (!stats[masterName].services[serviceName]) {
                        stats[masterName].services[serviceName] = 0;
                    }
                    stats[masterName].services[serviceName]++;
                }
            }
        }
        
        // ✅ Удаляем мастеров у которых 0 записей, если это не админ
        if (!isAdmin) {
            for (const master of Object.keys(stats)) {
                if (stats[master].total === 0 && master !== currentUserName) {
                    delete stats[master];
                }
            }
        }
        
        stats._totalAllRecords = totalAllRecords;
        stats._isAdmin = isAdmin;
        stats._currentUser = currentUserName;
        
        return stats;
    },
    
    // ============================================
    //  ПОСТРОЕНИЕ HTML
    // ============================================
    
    buildHTML: function(stats) {
        const totalAllRecords = stats._totalAllRecords || 0;
        const isAdmin = stats._isAdmin || false;
        const currentUser = stats._currentUser || '';
        delete stats._totalAllRecords;
        delete stats._isAdmin;
        delete stats._currentUser;
        
        // Сортируем мастеров по количеству записей (по убыванию)
        const sortedMasters = Object.keys(stats).sort((a, b) => stats[b].total - stats[a].total);
        
        let html = `
            <div style="margin-bottom:16px;text-align:center;font-size:14px;color:#37474F;padding:8px;background:#E0F2F1;border-radius:8px;">
                ${isAdmin ? '👑 Админ: ' : ''}Всего записей: <strong style="color:#008080;">${totalAllRecords}</strong>
                ${!isAdmin ? ' <span style="font-size:12px;color:#7B8D8E;display:block;margin-top:2px;">(только ваши записи)</span>' : ''}
                <span style="font-size:11px;color:#7B8D8E;display:block;margin-top:2px;">
                    ${this.dateFrom.value} — ${this.dateTo.value}
                </span>
            </div>
        `;
        
        for (const masterName of sortedMasters) {
            const masterStats = stats[masterName];
            // ✅ По умолчанию все группы закрыты
            const isExpanded = this.expandedMasters[masterName] === true;
            
            const masterColor = this.getMasterColor(masterName);
            const isCurrentUser = masterName === currentUser;
            const hasRecords = masterStats.total > 0;
            
            html += `
                <div class="stats-master-group" style="margin-bottom:12px;border:1px solid #E0F2F1;border-radius:12px;overflow:hidden;">
                    <div class="stats-master-header" data-master="${this.escapeHtml(masterName)}" style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        padding:12px 16px;
                        background:${isCurrentUser ? masterColor + '15' : '#FAFAFA'};
                        cursor:pointer;
                        user-select:none;
                        transition:background 0.2s, border-bottom 0.2s;
                        border-bottom:${isExpanded && hasRecords ? '1px solid #E0F2F1' : 'none'};
                        ${isCurrentUser ? 'border-left:4px solid ' + masterColor + ';' : ''}
                        ${!hasRecords ? 'opacity:0.7;' : ''}
                    ">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span class="stats-toggle" style="
                                display:inline-block;
                                transition:transform 0.3s;
                                transform:${isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'};
                                font-size:12px;
                                color:#008080;
                            ">▼</span>
                            <span style="font-weight:600;font-size:15px;color:#37474F;">
                                👤 ${this.escapeHtml(masterName)}
                                ${isCurrentUser ? ' <span style="font-size:11px;color:' + masterColor + ';font-weight:400;">(вы)</span>' : ''}
                                ${!hasRecords ? ' <span style="font-size:11px;color:#7B8D8E;font-weight:400;">(нет записей)</span>' : ''}
                            </span>
                        </div>
                        <span style="
                            font-size:14px;
                            font-weight:600;
                            color:#37474F;
                            min-width:30px;
                            text-align:center;
                        ">${masterStats.total}</span>
                    </div>
            `;
            
            // ✅ Показываем тело только если есть записи
            if (hasRecords) {
                html += `
                    <div class="stats-master-body" style="
                        display:${isExpanded ? 'block' : 'none'};
                        padding:12px 16px;
                        background:#FAFAFA;
                    ">
                `;
                
                const sortedServices = Object.keys(masterStats.services).sort((a, b) => masterStats.services[b] - masterStats.services[a]);
                const maxCount = Math.max(...Object.values(masterStats.services));
                
                for (const serviceName of sortedServices) {
                    const count = masterStats.services[serviceName];
                    const percent = maxCount > 0 ? (count / maxCount * 100) : 0;
                    const color = this.getServiceColor(serviceName);
                    
                    html += `
                        <div style="margin-bottom:8px;">
                            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:500;margin-bottom:2px;">
                                <span style="color:#37474F;">${this.escapeHtml(serviceName)}</span>
                                <span style="color:#008080;font-weight:600;">${count}</span>
                            </div>
                            <div style="height:20px;background:#F0F0F0;border-radius:10px;overflow:hidden;">
                                <div style="height:100%;width:${percent}%;background:${color};border-radius:10px;transition:width 0.5s ease;"></div>
                            </div>
                        </div>
                    `;
                }
                
                html += `
                    </div>
                `;
            } else {
                // Если нет записей, тело скрыто
                html += `
                    <div class="stats-master-body" style="display:none;"></div>
                `;
            }
            
            html += `</div>`;
        }
        
        return html;
    },
    
    // ============================================
    //  ОБРАБОТЧИКИ ДЛЯ РАСКРЫТИЯ ГРУПП
    // ============================================
    
    addToggleHandlers: function() {
        const headers = this.content.querySelectorAll('.stats-master-header');
        
        headers.forEach(header => {
            const newHeader = header.cloneNode(true);
            header.parentNode.replaceChild(newHeader, header);
            
            newHeader.addEventListener('click', function(e) {
                const masterName = this.dataset.master;
                const body = this.nextElementSibling;
                const toggle = this.querySelector('.stats-toggle');
                
                if (!body) return;
                
                // Проверяем, есть ли записи у мастера
                const hasRecords = body.children.length > 0;
                if (!hasRecords) return; // Не открываем если нет записей
                
                const isExpanded = body.style.display !== 'none';
                body.style.display = isExpanded ? 'none' : 'block';
                
                if (toggle) {
                    toggle.style.transform = isExpanded ? 'rotate(-90deg)' : 'rotate(0deg)';
                }
                
                this.style.borderBottom = isExpanded ? 'none' : '1px solid #E0F2F1';
                Stats.expandedMasters[masterName] = !isExpanded;
            });
            
            newHeader.addEventListener('mouseenter', function() {
                const masterName = this.dataset.master;
                const color = Stats.getMasterColor(masterName);
                this.style.background = color + '15';
            });
            
            newHeader.addEventListener('mouseleave', function() {
                const masterName = this.dataset.master;
                const color = Stats.getMasterColor(masterName);
                const isCurrentUser = masterName === Stats.getCurrentUser()?.name;
                this.style.background = isCurrentUser ? color + '15' : '#FAFAFA';
            });
        });
    },
    
    // ============================================
    //  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ============================================
    
    getMasterColor: function(masterName) {
        if (!masterName) return '#008080';
        
        let hash = 0;
        for (let i = 0; i < masterName.length; i++) {
            hash = masterName.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 55%, 45%)`;
    },
    
    getServiceColor: function(serviceName) {
        if (typeof window.getServiceColor === 'function') {
            return window.getServiceColor(serviceName);
        }
        
        const defaultColors = {
            'Кератин': '#D4AF37',
            'Ботокс': '#4A90E2',
            'Холодное': '#A8D8EA',
            'Полировка': '#7B8D8E'
        };
        return defaultColors[serviceName] || '#9E9E9E';
    },
    
    escapeHtml: function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ============================================
//  ПОДПИСКА НА ОБНОВЛЕНИЕ ДАННЫХ ИЗ APP
// ============================================

window.updateStatsData = function(recordsData) {
    if (typeof Stats.updateData === 'function') {
        Stats.updateData(recordsData);
    }
};

// ============================================
//  ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ
// ============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        Stats.init();
    });
} else {
    Stats.init();
}

console.log('✅ stats.js загружен');