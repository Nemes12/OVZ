// socket-service.js
// Модуль для работы с Socket.io

import {
    throttle,
    debounce,
    showNotification,
    saveToLocalBackup,
    restoreFromLocalBackup,
    retryOperation,
    ensureSave,
    safeJSONParse
} from './utils.js';

import {
    findDifferences,
    hasConflicts,
    createPatches,
    applyPatches,
    mergeTexts,
    DIFF_INSERT,
    DIFF_DELETE,
    DIFF_EQUAL
} from './diff-utils.js';

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
 * используя библиотеку diff-match-patch
 * @param {string} originalText - Исходный текст
 * @param {string} newText - Новый текст
 * @return {Object} Патч, содержащий различия между текстами
 */
function createDiffPatch(originalText, newText) {
    // Используем diff-match-patch для создания патчей
    const patches = createPatches(originalText, newText);
    return {
        patches: patches,
        original: originalText
    };
}

/**
 * Функция для применения патча к тексту
 * используя библиотеку diff-match-patch
 * @param {string} text - Текст для изменения
 * @param {Object} patch - Патч с изменениями
 * @return {string} Обновленный текст
 */
function applyDiffPatch(text, patch) {
    // Если это старый формат патча, используем старую логику
    if (patch.new !== undefined) {
        return mergeDiffs(text, patch.original, patch.new);
    }

    // Используем патчи diff-match-patch
    try {
        const [result, successArray] = applyPatches(text, patch.patches);

        // Проверяем, успешно ли применились все патчи
        const allPatchesApplied = successArray.every(success => success);

        if (!allPatchesApplied) {
            log('Не удалось применить все патчи. Используем трехстороннее слияние.', 'warn');
            return mergeTexts(patch.original, text, result);
        }

        return result;
    } catch (error) {
        log(`Ошибка при применении патча: ${error.message}`, 'error');
        // Используем трехстороннее слияние в случае ошибки
        return mergeDiffs(text, patch.original, text);
    }
}

/**
 * Функция для слияния изменений
 * @param {string} currentText - Текущий текст пользователя
 * @param {string} originalText - Исходный текст, с которого создавался патч
 * @param {string} newText - Новый текст после применения патча
 * @return {string} Результат слияния
 */
function mergeDiffs(currentText, originalText, newText) {
    // Используем трехстороннее слияние из diff-match-patch
    return mergeTexts(originalText, currentText, newText);
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
        this.delayUpdateTime = 5000; // 5 секунд - увеличено для снижения частоты обновлений

        // Флаги для отслеживания состояния выделения текста
        this.isHtmlSelectionActive = false;
        this.isCssSelectionActive = false;

        // Флаги для отслеживания программных обновлений
        this.isProgrammaticallyUpdatingHtml = false;
        this.isProgrammaticallyUpdatingCss = false;

        // Сохраняем отложенные обновления от других команд во время редактирования
        this.pendingHtmlUpdates = []; // Используем массив
        this.pendingCssUpdates = []; // Используем массив
        this.bufferStartSyncedHtml = ''; // Состояние HTML на начало локального редактирования
        this.bufferStartSyncedCss = ''; // Состояние CSS на начало локального редактирования

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

            // Добавляем обработчик событий beforeunload
            this._setupBeforeUnloadHandler();

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
     * Настраивает обработчик события закрытия страницы
     * @private
     */
    _setupBeforeUnloadHandler() {
        window.addEventListener('beforeunload', (event) => {
            // Если мы сейчас редактируем HTML или CSS, сохраняем изменения
            if (this.isEditingHtml && this.lastEditedHtml) {
                saveToLocalBackup('html', this.lastEditedHtml, this.teamName);

                // Регистрируем необходимость синхронизации
                const pendingSyncs = safeJSONParse(localStorage.getItem('pendingSyncs') || '[]', []);
                pendingSyncs.push({
                    type: 'html',
                    teamName: this.teamName,
                    timestamp: Date.now()
                });
                localStorage.setItem('pendingSyncs', JSON.stringify(pendingSyncs));
            }

            if (this.isEditingCss && this.lastEditedCss) {
                saveToLocalBackup('css', this.lastEditedCss, this.teamName);

                // Регистрируем необходимость синхронизации
                const pendingSyncs = safeJSONParse(localStorage.getItem('pendingSyncs') || '[]', []);
                pendingSyncs.push({
                    type: 'css',
                    teamName: this.teamName,
                    timestamp: Date.now()
                });
                localStorage.setItem('pendingSyncs', JSON.stringify(pendingSyncs));
            }

            // Если есть несохраненные изменения, запрашиваем подтверждение закрытия
            if (this.isEditingHtml || this.isEditingCss) {
                // Стандартное сообщение для несохраненных изменений
                const message = 'Есть несохраненные изменения. Они будут сохранены локально и синхронизированы при следующем входе.';
                event.returnValue = message;
                return message;
            }
        });
    }

    /**
     * Инициализирует все обработчики событий сокета
     * @private
     */
    _initSocketEventListeners() {
        if (!this.socket) return;

        // Обработка ошибки авторизации
        this.socket.on('auth_error', (data) => {
            log(`Ошибка авторизации: ${data.message}`, 'error');

            // Уведомляем пользователя об ошибке
            showNotification(data.message, 'error', 5000);

            // Создаем событие ошибки авторизации для обработки в интерфейсе
            document.dispatchEvent(new CustomEvent('auth_error', {
                detail: { message: data.message }
            }));
        });

        // Авторизация успешна
        this.socket.on('auth_success', (data) => {
            // Сохраняем имя команды и данные
            this.teamName = data.teamName;
            this.teamData = data.teamData || null;

            // Уведомляем всех подписчиков
            for (const listener of this.authListeners) {
                listener(data);
            }

            // После успешной авторизации пытаемся синхронизировать локальные изменения
            setTimeout(() => this._syncLocalBackups(), 1000);

            // Сохраняем данные в localStorage
            localStorage.setItem('teamName', this.teamName);
            localStorage.setItem('teamData', JSON.stringify(this.teamData));

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
        // Сначала всегда делаем резервную копию
        saveToLocalBackup('html', html, this.teamName);

        if (this.editingHtmlTimer) {
            clearTimeout(this.editingHtmlTimer);
            // Продолжаем редактирование, отправляем промежуточное обновление
            this._socketEmit('update_html', {
                html,
                teamName: this.teamName,
                version: this.localHtmlVersion,
                isContinuousEdit: true
            });
        } else {
            // Начинаем редактирование
            this.isEditingHtml = true;
            this.localHtmlVersion++;
            // Сохраняем состояние на начало редактирования для последующего слияния
            this.bufferStartSyncedHtml = this.lastSyncedHtml;
            // Очищаем буфер на случай, если он не был очищен ранее
            this.pendingHtmlUpdates = [];
            // Отправляем начальное обновление
            this._socketEmit('update_html', {
                html,
                teamName: this.teamName,
                version: this.localHtmlVersion
            });
        }

        this.lastEditedHtml = html;

        this.editingHtmlTimer = setTimeout(() => {
            log(`Снят флаг редактирования HTML, прошло ${this.delayUpdateTime}ms`);
            const finalLocalHtml = this.lastEditedHtml; // Сохраняем финальное локальное состояние
            this.isEditingHtml = false;
            this.editingHtmlTimer = null;
            this.lastSyncedHtml = finalLocalHtml; // Предварительно обновляем, т.к. это наша последняя версия

            // Отправляем финальное обновление с гарантией доставки
            const finalData = {
                html: finalLocalHtml,
                teamName: this.teamName,
                version: this.localHtmlVersion,
                isFinalEdit: true
            };

            retryOperation(
                () => {
                    const result = this._socketEmit('update_html', finalData);
                    if (!result) throw new Error('Не удалось отправить финальное обновление HTML');
                    return result;
                },
                3, 1000
            ).then(() => {
                // После успешной отправки применяем накопленные изменения
                this._applyBufferedUpdates('html');
            }).catch(error => {
                log(`Ошибка при финальном обновлении HTML: ${error.message}`, 'error');
                // Если отправка не удалась, все равно пробуем применить буфер,
                // т.к. локальные изменения сохранены и будут синхронизированы позже.
                this._applyBufferedUpdates('html');
            });
        }, this.delayUpdateTime);
    }

    /**
     * Обработчик обновления CSS кода
     * @param {string} css - Новый CSS код
     */
    updateCss(css) {
        // Сначала всегда делаем резервную копию
        saveToLocalBackup('css', css, this.teamName);

        if (this.editingCssTimer) {
            clearTimeout(this.editingCssTimer);
            // Продолжаем редактирование, отправляем промежуточное обновление
            this._socketEmit('update_css', {
                css,
                teamName: this.teamName,
                version: this.localCssVersion,
                isContinuousEdit: true
            });
        } else {
            // Начинаем редактирование
            this.isEditingCss = true;
            this.localCssVersion++;
            // Сохраняем состояние на начало редактирования
            this.bufferStartSyncedCss = this.lastSyncedCss;
            // Очищаем буфер
            this.pendingCssUpdates = [];
            // Отправляем начальное обновление
            this._socketEmit('update_css', {
                css,
                teamName: this.teamName,
                version: this.localCssVersion
            });
        }

        this.lastEditedCss = css;

        this.editingCssTimer = setTimeout(() => {
            log(`Снят флаг редактирования CSS, прошло ${this.delayUpdateTime}ms`);
            const finalLocalCss = this.lastEditedCss; // Сохраняем финальное локальное состояние
            this.isEditingCss = false;
            this.editingCssTimer = null;
            this.lastSyncedCss = finalLocalCss; // Предварительно обновляем

            // Отправляем финальное обновление с гарантией доставки
            const finalData = {
                css: finalLocalCss,
                teamName: this.teamName,
                version: this.localCssVersion,
                isFinalEdit: true
            };

            retryOperation(
                () => {
                    const result = this._socketEmit('update_css', finalData);
                    if (!result) throw new Error('Не удалось отправить финальное обновление CSS');
                    return result;
                },
                3, 1000
            ).then(() => {
                // После успешной отправки применяем накопленные изменения
                this._applyBufferedUpdates('css');
            }).catch(error => {
                log(`Ошибка при финальном обновлении CSS: ${error.message}`, 'error');
                 // Если отправка не удалась, все равно пробуем применить буфер
                this._applyBufferedUpdates('css');
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

            // Если это обновление кода, сохраняем его локально
            if (event === 'update_html' || event === 'update_css') {
                const type = event === 'update_html' ? 'html' : 'css';
                const content = type === 'html' ? data.html : data.css;
                saveToLocalBackup(type, content, this.teamName);
                showNotification(`Изменения ${type.toUpperCase()} сохранены локально`, 'warning');
            }

            return false;
        }

        try {
            log(`Отправка события ${event} на сервер`);
            this.socket.emit(event, data);
            return true;
        } catch (error) {
            log(`Ошибка при отправке события ${event}: ${error.message}`, 'error');

            // Если это обновление кода, сохраняем его локально
            if (event === 'update_html' || event === 'update_css') {
                const type = event === 'update_html' ? 'html' : 'css';
                const content = type === 'html' ? data.html : data.css;
                saveToLocalBackup(type, content, this.teamName);
                showNotification(`Изменения ${type.toUpperCase()} сохранены локально`, 'warning');
            }

            return false;
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
        const wrappedListener = (data) => {
            data.timestamp = Date.now();
            data.version = data.version || 0;

            // Игнорируем обновления от себя же
            if (data.teamName === this.teamName) return;

            // Если локальный пользователь активно редактирует - буферизуем
            if (this.isEditingHtml) {
                log(`Буферизация обновления HTML от ${data.teamName} (версия ${data.version})`);
                this.pendingHtmlUpdates.push(data);
                 // Обновляем удаленную версию, чтобы не пропустить будущие обновления
                if (data.version > this.remoteHtmlVersion) {
                    this.remoteHtmlVersion = data.version;
                }
                return; // Не применяем и не вызываем listener
            }

            // Стандартная обработка, если не редактируем локально
            if (data.version < this.remoteHtmlVersion) {
                log(`Игнорируем устаревшее обновление HTML версии ${data.version}, текущая удаленная версия ${this.remoteHtmlVersion}`);
                return;
            }

            if (data.isContinuousEdit) {
                log(`Получено промежуточное обновление HTML от ${data.teamName}`);
                // Для промежуточных обновлений можно не использовать сложный merge, просто обновить
                this.lastSyncedHtml = data.html; // Обновляем синхронизированную версию
                listener(data);
                return;
            }

            this.remoteHtmlVersion = data.version;

            // Применяем патч с использованием diff-match-patch
            log(`Применение обновления HTML от ${data.teamName} (версия ${data.version})`);
            const currentLocalHtml = this.lastSyncedHtml; // Используем последнюю синхронизированную версию

            // Проверяем наличие конфликтов
            const hasConflictsDetected = hasConflicts(this.lastSyncedHtml, currentLocalHtml, data.html);
            if (hasConflictsDetected) {
                log(`Обнаружены потенциальные конфликты при слиянии HTML от ${data.teamName}. Используем трехстороннее слияние.`, 'warn');
            }

            // Создаем патч и применяем его
            const patch = createDiffPatch(this.lastSyncedHtml, data.html);
            const mergedHtml = applyDiffPatch(currentLocalHtml, patch);

            // Сохраняем результат слияния для диагностики
            if (mergedHtml !== currentLocalHtml && mergedHtml !== data.html) {
                log(`Успешное слияние HTML изменений от ${data.teamName}`);
                saveToLocalBackup('html_merged', mergedHtml, this.teamName);
            }

            this.lastSyncedHtml = data.html; // Обновляем синхронизированную версию до версии отправителя

            const mergedData = {
                ...data,
                html: mergedHtml,
                isMerged: mergedHtml !== currentLocalHtml && mergedHtml !== data.html // Флаг, если было реальное слияние
            };

            if (mergedData.isMerged) {
                document.dispatchEvent(new CustomEvent('html_merged', {
                    detail: { teamName: data.teamName }
                }));
            }

            listener(mergedData);
        };

        wrappedListener.isWrapper = true;
        wrappedListener.originalHandler = listener;
        this.htmlUpdatedListeners.push(wrappedListener);
    }

    /**
     * Добавляет обработчик для события обновления CSS
     * @param {Function} listener - Функция-обработчик события
     */
    onCssUpdated(listener) {
        const wrappedListener = (data) => {
            data.timestamp = Date.now();
            data.version = data.version || 0;

            // Игнорируем обновления от себя же
            if (data.teamName === this.teamName) return;

            // Если локальный пользователь активно редактирует - буферизуем
            if (this.isEditingCss) {
                log(`Буферизация обновления CSS от ${data.teamName} (версия ${data.version})`);
                this.pendingCssUpdates.push(data);
                 // Обновляем удаленную версию, чтобы не пропустить будущие обновления
                if (data.version > this.remoteCssVersion) {
                    this.remoteCssVersion = data.version;
                }
                return; // Не применяем и не вызываем listener
            }

            // Стандартная обработка, если не редактируем локально
            if (data.version < this.remoteCssVersion) {
                log(`Игнорируем устаревшее обновление CSS версии ${data.version}, текущая удаленная версия ${this.remoteCssVersion}`);
                return;
            }

            if (data.isContinuousEdit) {
                log(`Получено промежуточное обновление CSS от ${data.teamName}`);
                this.lastSyncedCss = data.css; // Обновляем синхронизированную версию
                listener(data);
                return;
            }

            this.remoteCssVersion = data.version;

            log(`Применение обновления CSS от ${data.teamName} (версия ${data.version})`);
                const patch = createDiffPatch(this.lastSyncedCss, data.css);
            const currentLocalCss = this.lastSyncedCss;
            const mergedCss = applyDiffPatch(currentLocalCss, patch);
            this.lastSyncedCss = data.css; // Обновляем синхронизированную версию до версии отправителя

                const mergedData = {
                    ...data,
                    css: mergedCss,
                isMerged: mergedCss !== currentLocalCss && mergedCss !== data.css
                };

            if (mergedData.isMerged) {
                    document.dispatchEvent(new CustomEvent('css_merged', {
                        detail: { teamName: data.teamName }
                    }));
                }

                listener(mergedData);
        };

        wrappedListener.isWrapper = true;
        wrappedListener.originalHandler = listener;
        this.cssUpdatedListeners.push(wrappedListener);
    }

    /**
     * Синхронизация несохраненных данных из локального хранилища
     * @private
     */
    _syncLocalBackups() {
        log('Проверка наличия несинхронизированных изменений...');

        if (!this.isAuthorized()) {
            log('Пользователь не авторизован, синхронизация невозможна');
                return;
            }

        // Получаем список необходимых синхронизаций
        const pendingSyncs = safeJSONParse(localStorage.getItem('pendingSyncs') || '[]', []);

        if (pendingSyncs.length === 0) {
            log('Несинхронизированных изменений не найдено');
            return;
        }

        log(`Найдено ${pendingSyncs.length} несинхронизированных изменений`);

        // Сначала отфильтруем и отсортируем записи для текущей команды
        const teamSyncs = pendingSyncs
            .filter(item => item.teamName === this.teamName)
            .sort((a, b) => a.timestamp - b.timestamp);

        // Для каждого типа (html, css) берем самую последнюю запись
        const latestHtmlSync = teamSyncs.filter(item => item.type === 'html').pop();
        const latestCssSync = teamSyncs.filter(item => item.type === 'css').pop();

        // Восстанавливаем HTML если есть
        if (latestHtmlSync) {
            const htmlContent = restoreFromLocalBackup('html', this.teamName);
            if (htmlContent) {
                log('Восстановление несохраненного HTML...');

                // Отправляем сохраненное содержимое на сервер
                retryOperation(
                    () => {
                        const result = this._socketEmit('update_html', {
                            html: htmlContent,
                            teamName: this.teamName,
                            version: this.localHtmlVersion,
                            isFinalEdit: true
                        });
                        if (!result) throw new Error('Не удалось синхронизировать HTML');
                        return result;
                    },
                    3  // 3 попытки
                ).then(() => {
                    showNotification('Несохраненные изменения HTML успешно синхронизированы', 'success');

                    // Обновляем локальную версию для избежания конфликтов
                    this.lastSyncedHtml = htmlContent;
                }).catch(error => {
                    log(`Ошибка при синхронизации HTML: ${error.message}`, 'error');
                    showNotification('Не удалось синхронизировать HTML. Попробуйте обновить страницу.', 'error', 5000);
                });
            }
        }

        // Восстанавливаем CSS если есть
        if (latestCssSync) {
            const cssContent = restoreFromLocalBackup('css', this.teamName);
            if (cssContent) {
                log('Восстановление несохраненного CSS...');

                // Отправляем сохраненное содержимое на сервер
                retryOperation(
                    () => {
                        const result = this._socketEmit('update_css', {
                            css: cssContent,
                            teamName: this.teamName,
                            version: this.localCssVersion,
                            isFinalEdit: true
                        });
                        if (!result) throw new Error('Не удалось синхронизировать CSS');
                        return result;
                    },
                    3  // 3 попытки
                ).then(() => {
                    showNotification('Несохраненные изменения CSS успешно синхронизированы', 'success');

                    // Обновляем локальную версию для избежания конфликтов
                    this.lastSyncedCss = cssContent;
                }).catch(error => {
                    log(`Ошибка при синхронизации CSS: ${error.message}`, 'error');
                    showNotification('Не удалось синхронизировать CSS. Попробуйте обновить страницу.', 'error', 5000);
                });
            }
        }

        // Очищаем список несинхронизированных изменений для текущей команды
        const updatedPendingSyncs = pendingSyncs.filter(item => item.teamName !== this.teamName);
        localStorage.setItem('pendingSyncs', JSON.stringify(updatedPendingSyncs));
    }

    /**
     * Применяет накопленные в буфере обновления после завершения локального редактирования
     * @param {'html' | 'css'} type Тип обновлений для применения
     * @private
     */
    _applyBufferedUpdates(type) {
        try {
            // Проверяем, что мы не находимся в процессе редактирования
            if ((type === 'html' && this.isEditingHtml) || (type === 'css' && this.isEditingCss)) {
                log(`Невозможно применить буферизированные обновления ${type} во время редактирования`, 'warn');
                return;
            }

            const buffer = type === 'html' ? this.pendingHtmlUpdates : this.pendingCssUpdates;
            if (buffer.length === 0) {
                log(`Нет буферизированных обновлений для ${type}`);
                return;
            }

            log(`Применение ${buffer.length} буферизированных обновлений для ${type}...`);

            // Сохраняем текущее состояние для возможного отката
            const currentContent = type === 'html' ? this.lastSyncedHtml : this.lastSyncedCss;
            saveToLocalBackup(`${type}_before_merge`, currentContent, this.teamName);

            let resultingContent = currentContent; // Начинаем с последнего сохраненного состояния
            let currentBufferBase = type === 'html' ? this.bufferStartSyncedHtml : this.bufferStartSyncedCss; // База для первого патча
            let lastAppliedRemoteVersion = type === 'html' ? this.remoteHtmlVersion : this.remoteCssVersion;
            let lastAppliedRemoteContent = currentBufferBase; // Отслеживаем последнее примененное удаленное состояние
            let mergeOccurred = false; // Флаг, что было хотя бы одно слияние
            let lastAppliedTeamName = 'unknown';

            // Сортируем буфер по версиям и времени получения
            buffer.sort((a, b) => {
                // Сначала сортируем по версии
                const versionDiff = (a.version || 0) - (b.version || 0);
                if (versionDiff !== 0) return versionDiff;

                // Если версии одинаковые, сортируем по времени получения
                return (a.timestamp || 0) - (b.timestamp || 0);
            });

            // Применяем каждое обновление последовательно
            for (const bufferedData of buffer) {
                 // Пропускаем устаревшие или уже примененные версии
                if ((bufferedData.version || 0) <= lastAppliedRemoteVersion) {
                    log(`Пропуск устаревшего обновления версии ${bufferedData.version} от ${bufferedData.teamName}`);
                    continue;
                }

                const remoteContent = type === 'html' ? bufferedData.html : bufferedData.css;

                // Проверяем, что контент не пустой
                if (!remoteContent || remoteContent.trim() === '') {
                    log(`Пропуск пустого обновления от ${bufferedData.teamName}`, 'warn');
                    continue;
                }

                // Создаем патч от предыдущего удаленного состояния к новому удаленному
                const patch = createDiffPatch(currentBufferBase, remoteContent);
                // Применяем патч к текущему результату слияния
                const previouslyMergedContent = resultingContent;
                resultingContent = applyDiffPatch(resultingContent, patch);

                // Проверяем, что слияние прошло успешно
                if (resultingContent === previouslyMergedContent) {
                    log(`Обновление от ${bufferedData.teamName} не внесло изменений`);
                } else {
                    log(`Успешно применено обновление от ${bufferedData.teamName}`);
                    mergeOccurred = true;
                }

                // Обновляем базу для следующего патча
                currentBufferBase = remoteContent;
                lastAppliedRemoteVersion = bufferedData.version;
                lastAppliedRemoteContent = remoteContent;
                lastAppliedTeamName = bufferedData.teamName;
            }

            // Очищаем буфер
            if (type === 'html') {
                this.pendingHtmlUpdates = [];
            } else {
                this.pendingCssUpdates = [];
            }

            // Если ничего не изменилось в результате слияния буфера, выходим
            const finalLocalContent = type === 'html' ? this.lastSyncedHtml : this.lastSyncedCss;
            if (resultingContent === finalLocalContent) {
                log(`Применение буфера ${type} не изменило итоговый код.`);
                // Обновляем lastSynced на случай, если удаленная версия ушла вперед
                if(type === 'html') this.lastSyncedHtml = lastAppliedRemoteContent;
                else this.lastSyncedCss = lastAppliedRemoteContent;
                return;
            }

            log(`Применение буфера ${type} завершено. Обновление редактора.`);

            // Обновляем lastSynced до финального состояния
            if (type === 'html') {
                this.lastSyncedHtml = lastAppliedRemoteContent; // Важно обновить до последнего примененного удаленного состояния
            } else {
                this.lastSyncedCss = lastAppliedRemoteContent;
            }

            // Уведомляем подписчиков (редактор) о финальном результате
            const listeners = type === 'html' ? this.htmlUpdatedListeners : this.cssUpdatedListeners;
            const finalUpdateData = {
                [type]: resultingContent,
                teamName: lastAppliedTeamName, // Указываем имя последнего, чьи изменения были в буфере
                version: lastAppliedRemoteVersion,
                isBufferedApply: true, // Флаг, что это результат применения буфера
                isMerged: mergeOccurred
            };

            if (mergeOccurred) {
                document.dispatchEvent(new CustomEvent(`${type}_merged`, {
                    detail: { teamName: `нескольких пользователей (буфер)` }
                }));
            }

            listeners.forEach(listener => listener(finalUpdateData));
        } catch (error) {
            log(`Ошибка при применении буферизированных обновлений: ${error.message}`, 'error');

            // В случае ошибки очищаем буфер, чтобы не зациклиться
            if (type === 'html') {
                this.pendingHtmlUpdates = [];
            } else {
                this.pendingCssUpdates = [];
            }
            // Если ничего не изменилось в результате слияния буфера, выходим
            const finalLocalContent = type === 'html' ? this.lastSyncedHtml : this.lastSyncedCss;
            if (resultingContent === finalLocalContent) {
                log(`Применение буфера ${type} не изменило итоговый код.`);
                // Обновляем lastSynced на случай, если удаленная версия ушла вперед
                if(type === 'html') this.lastSyncedHtml = lastAppliedRemoteContent;
                else this.lastSyncedCss = lastAppliedRemoteContent;
                return;
            }

            log(`Применение буфера ${type} завершено. Обновление редактора.`);

            // Обновляем lastSynced до финального состояния
            if (type === 'html') {
                this.lastSyncedHtml = lastAppliedRemoteContent; // Важно обновить до последнего примененного удаленного состояния
            } else {
                this.lastSyncedCss = lastAppliedRemoteContent;
            }

            // Уведомляем подписчиков (редактор) о финальном результате
            const listeners = type === 'html' ? this.htmlUpdatedListeners : this.cssUpdatedListeners;
            const finalUpdateData = {
                [type]: resultingContent,
                teamName: lastAppliedTeamName, // Указываем имя последнего, чьи изменения были в буфере
                version: lastAppliedRemoteVersion,
                isBufferedApply: true, // Флаг, что это результат применения буфера
                isMerged: mergeOccurred
            };

            if (mergeOccurred) {
                document.dispatchEvent(new CustomEvent(`${type}_merged`, {
                    detail: { teamName: `нескольких пользователей (буфер)` }
                }));
            }

            listeners.forEach(listener => listener(finalUpdateData));
        }
    }
}

// Экспортируем только класс, экземпляр будет создаваться в app-initializer.js
export default SocketService;