# 📅 Календарь мастера

**PWA-приложение для управления записями клиентов с синхронизацией через Firebase.**

## ✨ Возможности

- 📅 **Календарь** — просмотр месяцев с визуальным отображением занятых слотов  
- ✏️ **Записи** — добавление, редактирование и удаление записей  
- 🔄 **Синхронизация** — данные синхронизируются между устройствами в реальном времени через Firebase  
- 🖼️ **Окошки** — генерация изображений с зачеркнутыми занятыми слотами  
- 📱 **PWA** — работает как отдельное приложение на iOS и Android  
- 🎨 **Шаблоны** — создание и сохранение шаблонов окошек для каждого месяца  
- 📊 **Статистика** — подсчёт записей по типам услуг  
- 🔔 **Уведомления** — локальные уведомления о записях

## 🛠️ Технологии

- HTML / CSS / JavaScript (ванильный стек)  
- Firebase Realtime Database  
- Firebase Authentication (анонимная)  
- Firebase Hosting  
- IndexedDB (для хранения шаблонов)  
- PWA (Progressive Web App)

## 🚀 Демо

👉 [https://calendar-master-d7c34.web.app](https://calendar-master-d7c34.web.app)

## 📋 Установка и запуск

### 1. Клонирование репозитория

```bash
git clone https://github.com/kollsan95/calendar-master.git
cd calendar-master
2. Настройка Firebase
Создайте проект в Firebase Console

Включите Realtime Database

Включите анонимную аутентификацию

Authentication → Sign-in methods → Anonymous → включить

Обновите правила Realtime Database:

json
{
  "rules": {
    "records": {
      ".read": "auth != null",
      ".write": "auth != null",
      ".indexOn": ["date"]
    }
  }
}
Получите конфигурацию Firebase и вставьте её в файл js/firebase-config.js

3. Запуск локально
bash
# Можно использовать любой HTTP-сервер, например:
python3 -m http.server 8000
# или запустить Live Server в VS Code
4. Деплой на Firebase Hosting
bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy --only hosting
📁 Структура проекта
text
calendar-app/
├── index.html              # Главная страница
├── styles.css              # Стили
├── manifest.json           # PWA манифест
├── sw.js                   # Service Worker
├── firebase.json           # Конфигурация Firebase Hosting
├── .firebaserc             # Настройки Firebase проекта
├── README.md               # Документация
├── LICENSE                 # Лицензия
├── icons/                  # Иконки для PWA
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png
│   ├── icon-384.png
│   └── icon-512.png
└── js/
    ├── app.js              # Основная логика
    ├── db.js               # IndexedDB (локальное хранилище)
    ├── notifications.js    # Уведомления
    ├── firebase-config.js  # Конфигурация Firebase
    ├── firebase-sync.js    # Синхронизация с Firebase
    └── template-storage.js # Хранение шаблонов в IndexedDB
📱 Установка PWA на устройство
iOS (iPhone / iPad)
Откройте Safari и перейдите на сайт

Нажмите «Поделиться» → «На экран «Домой»

Назовите приложение и нажмите «Добавить»

Android
Откройте Chrome и перейдите на сайт

Нажмите «...» → «Установить приложение»

Нажмите «Установить»

🤝 Вклад в проект
Форкните репозиторий

Создайте ветку для новой функции:
git checkout -b feature/amazing-feature

Зафиксируйте изменения:
git commit -m 'Add some amazing feature'

Запушьте ветку:
git push origin feature/amazing-feature

Откройте Pull Request

📄 Лицензия
Этот проект распространяется под лицензией MIT.
Подробнее — в файле LICENSE.

👤 Автор
Александр Колосовский — @kollsan95

⭐ Если вам понравился проект — поставьте звезду на GitHub!