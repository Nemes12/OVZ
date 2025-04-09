// socket-service.js
// Модуль для работы с Socket.io

import { debounce, safeJSONParse } from './utils.js';

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
 * Функция для создания дифференциального патча между двумя текстами
 * @param {string} originalText - Исходный текст
 * @param {string} newText - Новый текст
 * @return {Object} Патч, содержащий различия между текстами
 */
function createDiffPatch(originalText, newText) {
    // Простейшая реализация патча (в продакшене можно использовать библиотеку diff-match-patch)
    return {
        original: originalText,
        new: newText
    };
}

/**
 * Функция для применения патча к тексту
 * @param {string} text - Текст для изменения
 * @param {Object} patch - Патч с изменениями
 * @return {string} Обновленный текст
 */
function applyDiffPatch(text, patch) {
    // Примитивный алгоритм слияния изменений
    // Если текущий текст совпадает с оригинальным из патча, просто возвращаем новый
    if (text === patch.original) {
        return patch.new;
    }
    
    // Иначе нужно попытаться слить изменения
    return mergeDiffs(text, patch.original, patch.new);
}

/**
 * Функция для слияния изменений
 * @param {string} currentText - Текущий текст пользователя
 * @param {string} originalText - Исходный текст, с которого создавался патч
 * @param {string} newText - Новый текст после применения патча
 * @return {string} Результат слияния
 */
function mergeDiffs(currentText, originalText, newText) {
    // В простейшем случае, если текст местами совпадает с исходным или новым
    if (currentText === originalText) return newText;
    if (currentText === newText) return currentText;
    
    // Слияние блоками - разбиваем текст на строки и сравниваем
    const currentLines = currentText.split('\n');
    const originalLines = originalText.split('\n');
    const newLines = newText.split('\n');
    
    // Результирующий массив строк
    const resultLines = [];
    
    // Обходим все строки и применяем изменения
    for (let i = 0; i < Math.max(currentLines.length, originalLines.length, newLines.length); i++) {
        const currentLine = i < currentLines.length ? currentLines[i] : '';
        const originalLine = i < originalLines.length ? originalLines[i] : '';
        const newLine = i < newLines.length ? newLines[i] : '';
        
        // Если строка не изменилась в оригинале, но изменилась в новой версии
        if (currentLine === originalLine && originalLine !== newLine) {
            resultLines.push(newLine);
        }
        // Если строка изменилась локально, но не изменилась в общей версии
        else if (currentLine !== originalLine && originalLine === newLine) {
            resultLines.push(currentLine);
        }
        // Если строка изменилась и локально, и в общей версии
        else if (currentLine !== originalLine && originalLine !== newLine) {
            // Здесь можно добавить более сложную логику слияния
            // Например, если изменения в разных частях строки
            if (currentLine !== newLine) {
                // Попытка умного слияния
                resultLines.push(smartMergeLines(currentLine, originalLine, newLine));
            } else {
                resultLines.push(currentLine);
            }
        }
        // Если строки совпадают во всех версиях
        else {
            resultLines.push(currentLine || newLine);
        }
    }
    
    return resultLines.join('\n');
}

/**
 * Умное слияние изменений в одной строке
 * @param {string} currentLine - Текущая строка пользователя
 * @param {string} originalLine - Исходная строка
 * @param {string} newLine - Новая строка от другого пользователя
 * @return {string} Результат слияния
 */
function smartMergeLines(currentLine, originalLine, newLine) {
    // Если изменения в разных частях строки - пытаемся их объединить
    // Примитивно: если начало изменилось у нас, а конец у других
    if (currentLine.startsWith(originalLine.substring(0, 3)) && newLine.endsWith(originalLine.substring(originalLine.length - 3))) {
        return newLine.substring(0, newLine.length - 3) + currentLine.substring(3);
    } 
    // Если конец изменился у нас, а начало у других
    else if (currentLine.endsWith(originalLine.substring(originalLine.length - 3)) && newLine.startsWith(originalLine.substring(0, 3))) {
        return newLine.substring(0, newLine.length - 3) + currentLine.substring(3);
    }
    // Иначе приоритет локальным изменениям
    return currentLine;
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
        
        // Состояние для дифференциальных обновлений
        this.lastSyncedHtml = '';
        this.lastSyncedCss = '';
        this.localHtmlVersion = 0;
        this.localCssVersion = 0;
        this.remoteHtmlVersion = 0;
        this.remoteCssVersion = 0;
        
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
     * @param {string} html - Новый HTML код
     */
    updateHtml(html) {
        // Если мы уже редактируем, то сначала отменим предыдущий таймер сброса флага
        if (this.editingHtmlTimer) {
            clearTimeout(this.editingHtmlTimer);
            // Если у нас уже был таймер, значит мы продолжаем редактирование
            // Отправляем немедленное обновление для других пользователей
            this._socketEmit('update_html', { 
                html, 
                teamName: this.teamName,
                version: this.localHtmlVersion,
                isContinuousEdit: true
            });
        } else {
            // Устанавливаем флаг редактирования
            this.isEditingHtml = true;
            // Увеличиваем версию
            this.localHtmlVersion++;
            // Отправляем обновление на сервер НЕМЕДЛЕННО
            this._socketEmit('update_html', { 
                html, 
                teamName: this.teamName,
                version: this.localHtmlVersion
            });
        }
        
        // Сохраняем время последнего редактирования
        this.lastEditedHtml = html;
        
        // Устанавливаем новый таймер на заданное время
        this.editingHtmlTimer = setTimeout(() => {
            log(`Снят флаг редактирования HTML, прошло ${this.delayUpdateTime}ms`);
            this.isEditingHtml = false;
            this.editingHtmlTimer = null;
            
            // При снятии флага обновляем последнюю синхронизированную версию
            this.lastSyncedHtml = html;
            
            // Отправляем финальное обновление
            this._socketEmit('update_html', { 
                html, 
                teamName: this.teamName,
                version: this.localHtmlVersion,
                isFinalEdit: true
            });
        }, this.delayUpdateTime);
    }
    
    /**
     * Обработчик обновления CSS кода
     * @param {string} css - Новый CSS код
     */
    updateCss(css) {
        // Если мы уже редактируем, то сначала отменим предыдущий таймер сброса флага
        if (this.editingCssTimer) {
            clearTimeout(this.editingCssTimer);
            // Если у нас уже был таймер, значит мы продолжаем редактирование
            // Отправляем немедленное обновление для других пользователей
            this._socketEmit('update_css', { 
                css, 
                teamName: this.teamName,
                version: this.localCssVersion,
                isContinuousEdit: true
            });
        } else {
            // Устанавливаем флаг редактирования
            this.isEditingCss = true;
            // Увеличиваем версию
            this.localCssVersion++;
            // Отправляем обновление на сервер НЕМЕДЛЕННО
            this._socketEmit('update_css', { 
                css, 
                teamName: this.teamName,
                version: this.localCssVersion
            });
        }
        
        // Сохраняем время последнего редактирования
        this.lastEditedCss = css;
        
        // Устанавливаем новый таймер на заданное время
        this.editingCssTimer = setTimeout(() => {
            log(`Снят флаг редактирования CSS, прошло ${this.delayUpdateTime}ms`);
            this.isEditingCss = false;
            this.editingCssTimer = null;
            
            // При снятии флага обновляем последнюю синхронизированную версию
            this.lastSyncedCss = css;
            
            // Отправляем финальное обновление
            this._socketEmit('update_css', { 
                css, 
                teamName: this.teamName,
                version: this.localCssVersion,
                isFinalEdit: true
            });
        }, this.delayUpdateTime);
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
        // В новой версии не требуется отдельная обработка отложенных обновлений
    }
    
    /**
     * Установка флага выделения CSS текста
     * @param {boolean} isActive - Активно ли выделение
     */
    setCssSelectionActive(isActive) {
        this.isCssSelectionActive = isActive;
        // В новой версии не требуется отдельная обработка отложенных обновлений
    }

    /**
     * Отправка сообщения на сервер
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
     * Обновление HTML-кода на сервере
     * @param {string} html - HTML-код для отправки
     * @private
     */
    _updateHtml(html) {
        this._socketEmit('update_html', { html, teamName: this.teamName });
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
     * Добавляет обработчик для события обновления HTML
     * @param {Function} listener - Функция-обработчик события
     */
    onHtmlUpdated(listener) {
        // Создаем обертку для слушателя
        const wrappedListener = (data) => {
            // Добавляем отметку времени к обновлению
            data.timestamp = Date.now();
            data.version = data.version || 0;
            
            // Если пришла более старая версия, игнорируем
            if (data.version < this.remoteHtmlVersion) {
                log(`Игнорируем устаревшее обновление HTML версии ${data.version}, текущая удаленная версия ${this.remoteHtmlVersion}`);
                return;
            }
            
            // Если это продолжающееся редактирование, обрабатываем немедленно
            if (data.isContinuousEdit) {
                log(`Получено промежуточное обновление HTML от ${data.teamName}`);
                listener(data);
                return;
            }
            
            // Обновляем версию
            this.remoteHtmlVersion = data.version;
            
            // Если текущая команда редактирует HTML или имеет выделение текста,
            // слияние необходимо применить умно
            if ((this.isEditingHtml || this.isHtmlSelectionActive) && data.teamName !== this.teamName) {
                log(`Умное слияние HTML от ${data.teamName} с локальными изменениями`);
                
                // Создаем патч между последней синхронизированной версией и пришедшей
                const patch = createDiffPatch(this.lastSyncedHtml, data.html);
                
                // Получаем текущее значение HTML
                const currentHtml = this.lastEditedHtml || this.lastSyncedHtml;
                
                // Применяем патч к текущему значению
                const mergedHtml = applyDiffPatch(currentHtml, patch);
                
                // Обновляем последнюю синхронизированную версию
                this.lastSyncedHtml = data.html;
                
                // Создаем новый объект данных с слитым HTML
                const mergedData = {
                    ...data,
                    html: mergedHtml,
                    isMerged: true
                };
                
                // Уведомляем пользователя о слиянии изменений
                if (mergedHtml !== currentHtml) {
                    // Запустим всплывающее уведомление о слиянии
                    document.dispatchEvent(new CustomEvent('html_merged', {
                        detail: { teamName: data.teamName }
                    }));
                }
                
                // Запускаем обработчик с слитыми данными
                listener(mergedData);
                return;
            }
            
            // Обновляем последнюю синхронизированную версию
            this.lastSyncedHtml = data.html;
            
            // Запускаем обработчик в любом другом случае
            listener(data);
        };
        
        // Помечаем обертку для последующей идентификации
        wrappedListener.isWrapper = true;
        wrappedListener.originalHandler = listener;
        
        this.htmlUpdatedListeners.push(wrappedListener);
    }
    
    /**
     * Добавляет обработчик для события обновления CSS
     * @param {Function} listener - Функция-обработчик события
     */
    onCssUpdated(listener) {
        // Создаем обертку для слушателя
        const wrappedListener = (data) => {
            // Добавляем отметку времени к обновлению
            data.timestamp = Date.now();
            data.version = data.version || 0;
            
            // Если пришла более старая версия, игнорируем
            if (data.version < this.remoteCssVersion) {
                log(`Игнорируем устаревшее обновление CSS версии ${data.version}, текущая удаленная версия ${this.remoteCssVersion}`);
                return;
            }
            
            // Если это продолжающееся редактирование, обрабатываем немедленно
            if (data.isContinuousEdit) {
                log(`Получено промежуточное обновление CSS от ${data.teamName}`);
                listener(data);
                return;
            }
            
            // Обновляем версию
            this.remoteCssVersion = data.version;
            
            // Если текущая команда редактирует CSS или имеет выделение текста,
            // слияние необходимо применить умно
            if ((this.isEditingCss || this.isCssSelectionActive) && data.teamName !== this.teamName) {
                log(`Умное слияние CSS от ${data.teamName} с локальными изменениями`);
                
                // Создаем патч между последней синхронизированной версией и пришедшей
                const patch = createDiffPatch(this.lastSyncedCss, data.css);
                
                // Получаем текущее значение CSS
                const currentCss = this.lastEditedCss || this.lastSyncedCss;
                
                // Применяем патч к текущему значению
                const mergedCss = applyDiffPatch(currentCss, patch);
                
                // Обновляем последнюю синхронизированную версию
                this.lastSyncedCss = data.css;
                
                // Создаем новый объект данных с слитым CSS
                const mergedData = {
                    ...data,
                    css: mergedCss,
                    isMerged: true
                };
                
                // Уведомляем пользователя о слиянии изменений
                if (mergedCss !== currentCss) {
                    // Запустим всплывающее уведомление о слиянии
                    document.dispatchEvent(new CustomEvent('css_merged', {
                        detail: { teamName: data.teamName }
                    }));
                }
                
                // Запускаем обработчик с слитыми данными
                listener(mergedData);
                return;
            }
            
            // Обновляем последнюю синхронизированную версию
            this.lastSyncedCss = data.css;
            
            // Запускаем обработчик в любом другом случае
            listener(data);
        };
        
        // Помечаем обертку для последующей идентификации
        wrappedListener.isWrapper = true;
        wrappedListener.originalHandler = listener;
        
        this.cssUpdatedListeners.push(wrappedListener);
    }
}

// Экспортируем только класс, экземпляр будет создаваться в app-initializer.js
export default SocketService;