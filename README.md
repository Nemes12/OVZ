# Совместный редактор кода

Веб-приложение для совместного редактирования HTML и CSS кода в реальном времени с мгновенным предпросмотром результата. Идеально подходит для обучения, парного программирования и совместной работы.

## Возможности

- Совместное редактирование HTML и CSS в реальном времени
- Мгновенный предпросмотр изменений
- Отслеживание курсоров других пользователей
- Автоматическое сохранение кода
- Индикатор статуса синхронизации
- Адаптивный интерфейс

## Технологии

- Socket.IO для обмена данными в реальном времени
- Express.js для серверной части
- SQLite для хранения данных
- Нативный JavaScript для клиентской части
- Редактор кода на основе CodeMirror

## Установка и запуск

### Требования

- Node.js (v14 или выше)
- npm (v6 или выше)

### Установка

```bash
# Клонирование репозитория
git clone https://github.com/ваш-аккаунт/имя-репозитория.git
cd имя-репозитория

# Установка зависимостей
npm install
```

### Запуск

```bash
# Запуск сервера
npm start
```

После запуска приложение будет доступно по адресу: `http://localhost:3000`

## Деплой на Render

1. Зарегистрируйтесь на [Render](https://render.com/)
2. Создайте новый Web Service
3. Свяжите с репозиторием GitHub
4. Настройте:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**: Добавьте `PORT=10000` (или другой порт)

## Структура проекта

- `server.js` - основной файл сервера
- `db.js` - работа с базой данных
- `js/` - клиентские скрипты
  - `app-initializer.js` - инициализация приложения
  - `socket-service.js` - сервис для работы с сокетами
  - `code-editor-manager.js` - управление редакторами кода
  - и другие модули...
- `index.html` - главная страница
- `style.css` - основные стили

## Лицензия

MIT 