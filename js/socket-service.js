// socket-service.js
// Модуль для работы с Socket.io

import { debounce } from './utils.js';

/**
 * Оптимизированная функция логирования
 * @param {string} message - Сообщение для логирования
 * @param {string} level - Уровень логирования (info, warn, error)
 */
function log(message, level = 'info') {
    const isProd = window.location.hostname !== 'localhost';
    // В продакшене логируем только ошибки
    if (isProd && level !== 'error') return;
    
    switch (level) {
        case 'error':
            console.error(`[Socket] ${message}`);
            break;
        case 'warn':
            console.warn(`[Socket] ${message}`);
            break;
        default:
            console.log(`[Socket] ${message}`);
    }
}

/**
 * Класс для работы с сокетами
 */
export class SocketService {
    /**
     * Конструктор класса SocketService
     */
    constructor() {
        this.socket = null;
        this.teamName = '';
        this.teamData = null;
        this.reconnectionAttempts = 0;
        this.maxReconnectionAttempts = 5;
        this.reconnectionDelay = 1000;
        this.isReconnecting = false;
        this.requestTimeouts = {}; // Отслеживание запросов
        this.defaultTimeout = 10000; // 10 секунд таймаут по умолчанию
        this.authListeners = [];
        this.onlineUsersCountListeners = [];
        this.htmlUpdatedListeners = [];
        this.cssUpdatedListeners = [];
        this.cursorMovedListeners = [];
        this.userDisconnectedListeners = [];
        this.codeInitializedListeners = [];
        this.codeResetListeners = [];
        
        // Флаги для отслеживания состояния редактирования текущей командой
        this.isEditingHtml = false;
        this.isEditingCss = false;
        this.editingHtmlTimer = null;
        this.editingCssTimer = null;
        this.lastEditedHtml = '';
        this.lastEditedCss = '';
        this.delayUpdateTime = 5000; // 5 секунд
        
        // Флаги для отслеживания состояния выделения текста
        this.isHtmlSelectionActive = false;
        this.isCssSelectionActive = false;
        
        // Флаги для отслеживания программных обновлений
        this.isProgrammaticallyUpdatingHtml = false;
        this.isProgrammaticallyUpdatingCss = false;
        
        // Сохраняем отложенные обновления от других команд во время редактирования
        this.pendingHtmlUpdates = {};
        this.pendingCssUpdates = {};
        
        // Батчинг для обновлений курсора для снижения трафика
        this.pendingCursorUpdate = null;
        this.cursorUpdateInterval = 50; // 50ms для плавности
        
        // Инициализация сокета
        this.init();
    }
    
    /**
     * Инициализация сокета
     */
    init() {
        try {
            // Проверяем, доступен ли io
            if (typeof io === 'undefined') {
                log('Socket.io не загружен', 'error');
                setTimeout(() => this.handleConnectionError(), 1000);
                return;
            }
            
            // Используем window.location.origin для автоматического определения URL
            this.socket = io(window.location.origin);
            
            // Настраиваем обработчики событий
            this._initSocketEventListeners();
            
            // Настраиваем обработку переподключений
            this.setupReconnection();
            
            log('Socket.io инициализирован');
        } catch (error) {
            log(`Ошибка при инициализации Socket.io: ${error.message}`, 'error');
            this.handleConnectionError();
        }
    }
    
    /**
     * Инициализирует все обработчики событий сокета
     * @private
     */
    _initSocketEventListeners() {
        if (!this.socket) return;

        // Авторизация успешна
        this.socket.on('auth_success', (data) => {
            this.teamName = data.teamName;
            this.teamData = data.teamData;
      
      // Сохраняем данные в localStorage
            localStorage.setItem('teamName', this.teamName);
            localStorage.setItem('teamData', JSON.stringify(this.teamData));
            
            // Уведомляем всех подписчиков о успешной авторизации
            this.authListeners.forEach(listener => listener(data));
            
            // Запрашиваем инициализацию кода
            this.socket.emit('initialize_code');
        });
        
        // Обновлено количество пользователей онлайн
        this.socket.on('online_users_count', (count) => {
            this.onlineUsersCountListeners.forEach(listener => listener(count));
        });
        
        // Обновлен HTML код
        this.socket.on('html_updated', (data) => {
            this.htmlUpdatedListeners.forEach(listener => listener(data));
        });
        
        // Обновлен CSS код
        this.socket.on('css_updated', (data) => {
            this.cssUpdatedListeners.forEach(listener => listener(data));
        });
        
        // Перемещен курсор другого пользователя
        this.socket.on('cursor_moved', (data) => {
            this.cursorMovedListeners.forEach(listener => listener(data));
        });
        
        // Пользователь отключился
        this.socket.on('user_disconnected', (data) => {
            this.userDisconnectedListeners.forEach(listener => listener(data));
        });
        
        // Код инициализирован
        this.socket.on('code_initialized', () => {
            log('Код инициализирован');
            this.codeInitializedListeners.forEach(listener => listener());
        });
        
        // Сброс кода
        this.socket.on('code_reset', () => {
            log('Код сброшен к начальным значениям');
            this.codeResetListeners.forEach(listener => listener());
        });

        // Обработка переподключения
        this.socket.on('connect', () => {
            if (this.isReconnecting) {
                log('Переподключение успешно');
                this.isReconnecting = false;
                this.reconnectionAttempts = 0;
                
                // Повторная авторизация после переподключения
                if (this.teamName) {
                    this.authorize(this.teamName);
                }
            }
        });

        // Обработка отключения
        this.socket.on('disconnect', () => {
            log('Соединение с сервером потеряно');
            this._handleDisconnect();
        });

        // Обработка ошибок
        this.socket.on('connect_error', (error) => {
            log('Ошибка соединения:', error.message);
            this._handleDisconnect();
        });
    }
    
    /**
     * Настройка обработки переподключений
     */
    setupReconnection() {
        // Событие отключения
        this.socket.on('disconnect', () => {
            log('Соединение с сервером потеряно. Попытка переподключения...');
            document.dispatchEvent(new CustomEvent('socket_disconnected'));
        });
        
        // Событие переподключения
        this.socket.on('reconnect', () => {
            log('Переподключение успешно');
            
            // Восстанавливаем авторизацию
            const savedTeamName = localStorage.getItem('teamName');
            if (savedTeamName) {
                this.authorize(savedTeamName);
            }
            
            document.dispatchEvent(new CustomEvent('socket_reconnected'));
        });
        
        // Ошибка переподключения
        this.socket.on('reconnect_error', () => {
            log('Ошибка переподключения');
            this.handleConnectionError();
        });
    }
    
    /**
     * Обработка ошибки подключения
     */
    handleConnectionError() {
        this.reconnectionAttempts++;
        
        if (this.reconnectionAttempts < this.maxReconnectionAttempts) {
            log(`Повторная попытка подключения ${this.reconnectionAttempts} из ${this.maxReconnectionAttempts}...`);
            
            // Увеличиваем задержку с каждой попыткой (экспоненциальная задержка)
            const delay = this.reconnectionDelay * Math.pow(2, this.reconnectionAttempts - 1);
            
            setTimeout(() => {
                this.init();
            }, delay);
        } else {
            log('Превышено максимальное количество попыток подключения');
            document.dispatchEvent(new CustomEvent('socket_connection_failed'));
        }
    }
    
    /**
     * Подключение к серверу
     */
    connect() {
        if (!this.socket) {
            this.init();
        }
    }

    /**
     * Проверка авторизации
     * @return {boolean} - Авторизован ли пользователь
     */
    isAuthorized() {
        return !!this.teamName;
    }

    /**
     * Авторизация пользователя
     * @param {string} teamName - Имя команды
     */
    authorize(teamName) {
        if (!this.socket) {
            log('Socket не инициализирован');
            return;
        }
        
        this.socket.emit('auth', { teamName });
    }
    
    /**
     * Обработчик обновления HTML кода
     * @param {Function} listener - Функция-обработчик
     */
    onHtmlUpdated(listener) {
        // Создаем обертку для слушателя
        const wrappedListener = (data) => {
            // Добавляем отметку времени к обновлению
            data.timestamp = Date.now();
            
            // Если текущая команда редактирует HTML или имеет выделение текста,
            // сохраняем обновление для последующего применения (только если оно от другой команды)
            if ((this.isEditingHtml || this.isHtmlSelectionActive) && data.teamName !== this.teamName) {
                log(`Отложено обновление HTML от ${data.teamName}, так как редактируется или выделен текст локально`);
                this.pendingHtmlUpdates[data.teamName] = data;
                return; // Важно! Прерываем обработку, чтобы не вызывать оригинальный обработчик
            }
            
            // Запускаем обработчик в любом другом случае
            listener(data);
        };
        
        // Помечаем обертку для последующей идентификации
        wrappedListener.isWrapper = true;
        wrappedListener.originalHandler = listener;
        
        this.htmlUpdatedListeners.push(wrappedListener);
    }
    
    /**
     * Обработчик обновления CSS кода
     * @param {Function} listener - Функция-обработчик
     */
    onCssUpdated(listener) {
        // Создаем обертку для слушателя
        const wrappedListener = (data) => {
            // Добавляем отметку времени к обновлению
            data.timestamp = Date.now();
            
            // Если текущая команда редактирует CSS или имеет выделение текста,
            // сохраняем обновление для последующего применения (только если оно от другой команды)
            if ((this.isEditingCss || this.isCssSelectionActive) && data.teamName !== this.teamName) {
                log(`Отложено обновление CSS от ${data.teamName}, так как редактируется или выделен текст локально`);
                this.pendingCssUpdates[data.teamName] = data;
                return; // Важно! Прерываем обработку, чтобы не вызывать оригинальный обработчик
            }
            
            // Запускаем обработчик в любом другом случае
            listener(data);
        };
        
        // Помечаем обертку для последующей идентификации
        wrappedListener.isWrapper = true;
        wrappedListener.originalHandler = listener;
        
        this.cssUpdatedListeners.push(wrappedListener);
    }
    
    /**
     * Обновление позиции курсора
     * @param {Object} position - Объект с координатами позиции курсора
     */
    updateCursorPosition(position) {
        if (!this.socket || !this.teamName) {
            log('Socket не инициализирован или пользователь не авторизован');
            return;
        }
        
        // Сохраняем текущую позицию курсора
        this.pendingCursorUpdate = position;
        
        // Если таймер батчинга не установлен, создаем его
        if (!this._cursorUpdateTimer) {
            this._cursorUpdateTimer = setTimeout(() => {
                this._sendCursorPosition();
                this._cursorUpdateTimer = null;
            }, this.cursorUpdateInterval);
        }
    }
    
    /**
     * Отправляет позицию курсора на сервер
     * @private
     */
    _sendCursorPosition() {
        if (!this.pendingCursorUpdate) return;
        
        const { x, y } = this.pendingCursorUpdate;
        this.socket.emit('cursor_position', { x, y, teamName: this.teamName });
        this.pendingCursorUpdate = null;
    }
    
    /**
     * Инициализация кода (только для админа)
     */
    initializeCode() {
        if (!this.socket) {
            log('Socket не инициализирован');
            return;
        }
        
    log('Отправка события инициализации кода');
        this.socket.emit('initialize_code');
    }
    
    /**
     * Получение имени команды
     * @returns {string} Имя текущей команды
     */
    getTeamName() {
        return this.teamName;
    }
    
    /**
     * Получение данных команды
     * @return {Object|null} - Данные команды
     */
    getTeamData() {
        return this.teamData;
    }

    /**
     * Добавляет обработчик для события инициализации кода
     * @param {Function} listener - Функция-обработчик события
     */
    onCodeInitialized(listener) {
        if (typeof listener === 'function') {
            this.codeInitializedListeners.push(listener);
        }
    }
    
    /**
     * Добавляет обработчик для события сброса кода
     * @param {Function} listener - Функция-обработчик события
     */
    onCodeReset(listener) {
        if (typeof listener === 'function') {
            this.codeResetListeners.push(listener);
        }
    }

    /**
     * Добавляет обработчик для события авторизации
     * @param {Function} listener - Функция-обработчик события
     */
    onAuth(listener) {
        if (typeof listener === 'function') {
            this.authListeners.push(listener);
        }
    }
    
    /**
     * Добавляет обработчик для события обновления количества пользователей
     * @param {Function} listener - Функция-обработчик события
     */
    onOnlineUsersCount(listener) {
        if (typeof listener === 'function') {
            this.onlineUsersCountListeners.push(listener);
        }
    }
    
    /**
     * Добавляет обработчик для события отключения пользователя
     * @param {Function} listener - Функция-обработчик события
     */
    onUserDisconnected(listener) {
        if (typeof listener === 'function') {
            this.userDisconnectedListeners.push(listener);
        }
    }

    /**
     * Добавляет обработчик для события движения курсора
     * @param {Function} listener - Функция-обработчик события
     */
    onCursorMoved(listener) {
        if (typeof listener === 'function') {
            this.cursorMovedListeners.push(listener);
        }
    }

    /**
     * Обработка отключения
     * @private
     */
    _handleDisconnect() {
        this.teamName = '';
        this.teamData = null;
        localStorage.removeItem('teamName');
        localStorage.removeItem('teamData');
        this.reconnectionAttempts = 0;
        this.isReconnecting = true;
        
        // Очищаем все таймеры
        this._clearAllTimers();
        
        document.dispatchEvent(new CustomEvent('socket_disconnected'));
    }
    
    /**
     * Очищает все таймеры и ресурсы
     * @private
     */
    _clearAllTimers() {
        // Очищаем таймер обновления курсора
        if (this._cursorUpdateTimer) {
            clearTimeout(this._cursorUpdateTimer);
            this._cursorUpdateTimer = null;
        }
        
        // Очищаем все таймауты запросов
        Object.keys(this.requestTimeouts).forEach(key => {
            clearTimeout(this.requestTimeouts[key]);
            delete this.requestTimeouts[key];
        });
    }

    /**
     * Установка флага выделения HTML текста
     * @param {boolean} isActive - Активно ли выделение
     */
    setHtmlSelectionActive(isActive) {
        this.isHtmlSelectionActive = isActive;
        
        // Если выделение снято, и мы не редактируем код, 
        // применяем все отложенные обновления HTML
        if (!isActive && !this.isEditingHtml) {
            setTimeout(() => this._applyPendingHtmlUpdates(), 100);
        }
    }
    
    /**
     * Установка флага выделения CSS текста
     * @param {boolean} isActive - Активно ли выделение
     */
    setCssSelectionActive(isActive) {
        this.isCssSelectionActive = isActive;
        
        // Если выделение снято, и мы не редактируем код, 
        // применяем все отложенные обновления CSS
        if (!isActive && !this.isEditingCss) {
            setTimeout(() => this._applyPendingCssUpdates(), 100);
        }
    }

    /**
     * Отправка сообщения об отложенных обновлениях на сервер
     * @private
     */
    _socketEmit(event, data) {
        if (!this.socket || !this.isAuthorized()) {
            log(`Не удалось отправить событие ${event}: соединение не установлено или не авторизовано`, 'error');
            return;
        }
        
        try {
            log(`Отправка события ${event} на сервер`);
            this.socket.emit(event, data);
        } catch (error) {
            log(`Ошибка при отправке события ${event}: ${error.message}`, 'error');
        }
    }
    
    /**
     * Обработчик обновления HTML кода
     * @param {string} html - Новый HTML код
     */
    updateHtml(html) {
        // Сохраняем время последнего редактирования
        this.isEditingHtml = true;
        this.lastEditedHtml = html;
        
        // Отправляем обновление на сервер НЕМЕДЛЕННО
        this._socketEmit('update_html', { html, teamName: this.teamName });
        
        // Сбрасываем таймер редактирования
        if (this.editingHtmlTimer) {
            clearTimeout(this.editingHtmlTimer);
        }
        
        // Устанавливаем новый таймер на 5 секунд
        this.editingHtmlTimer = setTimeout(() => {
            log(`Снят флаг редактирования HTML, прошло ${this.delayUpdateTime}ms`);
            this.isEditingHtml = false;
            this.editingHtmlTimer = null;
            
            // Применяем отложенные обновления, если они есть
            this._applyPendingHtmlUpdates();
        }, this.delayUpdateTime);
    }
    
    /**
     * Обновление HTML-кода на сервере
     * @param {string} html - HTML-код для отправки
     * @private
     */
    _updateHtml(html) {
        this._socketEmit('update_html', { html, teamName: this.teamName });
    }
    
    /**
     * Применяет отложенные обновления HTML после окончания редактирования
     * @private
     */
    _applyPendingHtmlUpdates() {
        const pendingTeams = Object.keys(this.pendingHtmlUpdates);
        if (pendingTeams.length === 0) return;
        
        // Применяем последнее обновление от каждой команды
        log(`Применение отложенных HTML обновлений от ${pendingTeams.length} команд`);
        
        // Находим самое последнее обновление
        let latestTeam = pendingTeams[0];
        let latestUpdate = this.pendingHtmlUpdates[latestTeam];
        
        pendingTeams.forEach(team => {
            const update = this.pendingHtmlUpdates[team];
            if (update.timestamp > latestUpdate.timestamp) {
                latestTeam = team;
                latestUpdate = update;
            }
        });
        
        // Применяем самое последнее обновление
        log(`Применение отложенного HTML обновления от команды ${latestTeam}`);
        
        // Важно! Оборачиваем в try-catch для отладки
        try {
            // Временно устанавливаем флаг программного обновления,
            // чтобы другие обработчики не реагировали циклически
            const wasProgrammaticallyUpdating = this.isProgrammaticallyUpdatingHtml;
            this.isProgrammaticallyUpdatingHtml = true;
            
            // Вызываем оригинальные обработчики напрямую, минуя обертки
            this.htmlUpdatedListeners.forEach(listener => {
                if (listener.isWrapper && listener.originalHandler) {
                    listener.originalHandler(latestUpdate);
                }
            });
            
            // Восстанавливаем состояние
            this.isProgrammaticallyUpdatingHtml = wasProgrammaticallyUpdating;
        } catch (error) {
            log(`Ошибка при применении отложенных HTML обновлений: ${error.message}`, 'error');
        }
        
        // Очищаем отложенные обновления
        this.pendingHtmlUpdates = {};
    }
    
    /**
     * Обработчик обновления CSS кода
     * @param {string} css - Новый CSS код
     */
    updateCss(css) {
        // Сохраняем время последнего редактирования
        this.isEditingCss = true;
        this.lastEditedCss = css;
        
        // Отправляем обновление на сервер НЕМЕДЛЕННО
        this._socketEmit('update_css', { css, teamName: this.teamName });
        
        // Сбрасываем таймер редактирования
        if (this.editingCssTimer) {
            clearTimeout(this.editingCssTimer);
        }
        
        // Устанавливаем новый таймер на 5 секунд
        this.editingCssTimer = setTimeout(() => {
            log(`Снят флаг редактирования CSS, прошло ${this.delayUpdateTime}ms`);
            this.isEditingCss = false;
            this.editingCssTimer = null;
            
            // Применяем отложенные обновления, если они есть
            this._applyPendingCssUpdates();
        }, this.delayUpdateTime);
    }
    
    /**
     * Обновление CSS-кода на сервере
     * @param {string} css - CSS-код для отправки
     * @private
     */
    _updateCss(css) {
        this._socketEmit('update_css', { css, teamName: this.teamName });
    }
    
    /**
     * Применяет отложенные обновления CSS после окончания редактирования
     * @private
     */
    _applyPendingCssUpdates() {
        const pendingTeams = Object.keys(this.pendingCssUpdates);
        if (pendingTeams.length === 0) return;
        
        // Применяем последнее обновление от каждой команды
        log(`Применение отложенных CSS обновлений от ${pendingTeams.length} команд`);
        
        // Находим самое последнее обновление
        let latestTeam = pendingTeams[0];
        let latestUpdate = this.pendingCssUpdates[latestTeam];
        
        pendingTeams.forEach(team => {
            const update = this.pendingCssUpdates[team];
            if (update.timestamp > latestUpdate.timestamp) {
                latestTeam = team;
                latestUpdate = update;
            }
        });
        
        // Применяем самое последнее обновление
        log(`Применение отложенного CSS обновления от команды ${latestTeam}`);
        
        // Важно! Оборачиваем в try-catch для отладки
        try {
            // Временно устанавливаем флаг программного обновления,
            // чтобы другие обработчики не реагировали циклически
            const wasProgrammaticallyUpdating = this.isProgrammaticallyUpdatingCss;
            this.isProgrammaticallyUpdatingCss = true;
            
            // Вызываем оригинальные обработчики напрямую, минуя обертки
            this.cssUpdatedListeners.forEach(listener => {
                if (listener.isWrapper && listener.originalHandler) {
                    listener.originalHandler(latestUpdate);
                }
            });
            
            // Восстанавливаем состояние
            this.isProgrammaticallyUpdatingCss = wasProgrammaticallyUpdating;
        } catch (error) {
            log(`Ошибка при применении отложенных CSS обновлений: ${error.message}`, 'error');
        }
        
        // Очищаем отложенные обновления
        this.pendingCssUpdates = {};
    }
}

// Экспортируем только класс, экземпляр будет создаваться в app-initializer.js
export default SocketService;