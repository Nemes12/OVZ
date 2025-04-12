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
 * @param {string} oldText - Исходный текст
 * @param {string} newText - Новый текст
 * @return {Array} - Массив патчей
 */
function createDiffPatch(oldText, newText) {
    return createPatches(oldText || '', newText || '');
}

/**
 * Функция для применения дифференциального патча к тексту
 * @param {string} text - Текст, к которому применяется патч
 * @param {Array} patches - Массив патчей
 * @return {string} - Результат применения патча
 */
function applyDiffPatch(text, patches) {
    return applyPatches(text || '', patches);
}

/**
 * Функция для слияния изменений из трех версий текста
 * @param {string} currentText - Текущий текст
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
        this.stylesUpdatedListeners = [];

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

        // Буферы для отложенных обновлений
        this.pendingHtmlUpdates = [];
        this.pendingCssUpdates = [];

        // Версии для отслеживания порядка обновлений
        this.localHtmlVersion = 0;
        this.localCssVersion = 0;
        this.remoteHtmlVersion = 0;
        this.remoteCssVersion = 0;

        // Последние синхронизированные версии
        this.lastSyncedHtml = '';
        this.lastSyncedCss = '';

        // Таймер для обновления курсора
        this._cursorUpdateTimer = null;

        // Восстанавливаем имя команды из localStorage
        const savedTeamName = localStorage.getItem('teamName');
        if (savedTeamName) {
            this.teamName = savedTeamName;
            const savedTeamData = localStorage.getItem('teamData');
            if (savedTeamData) {
                try {
                    this.teamData = JSON.parse(savedTeamData);
                } catch (e) {
                    log('Ошибка при разборе данных команды из localStorage', 'error');
                }
            }
        }

        // Настраиваем обработчик закрытия страницы
        this._setupBeforeUnloadHandler();
    }

    /**
     * Подписка на событие авторизации
     * @param {Function} listener - Функция-обработчик
     */
    onAuth(listener) {
        this.authListeners.push(listener);
    }

    /**
     * Подписка на событие обновления количества пользователей онлайн
     * @param {Function} listener - Функция-обработчик
     */
    onOnlineUsersCount(listener) {
        this.onlineUsersCountListeners.push(listener);
    }

    /**
     * Подписка на событие обновления HTML кода
     * @param {Function} listener - Функция-обработчик
     */
    onHtmlUpdated(listener) {
        this.htmlUpdatedListeners.push(listener);
    }

    /**
     * Подписка на событие обновления CSS кода
     * @param {Function} listener - Функция-обработчик
     */
    onCssUpdated(listener) {
        this.cssUpdatedListeners.push(listener);
    }

    /**
     * Подписка на событие перемещения курсора
     * @param {Function} listener - Функция-обработчик
     */
    onCursorMoved(listener) {
        this.cursorMovedListeners.push(listener);
    }

    /**
     * Подписка на событие отключения пользователя
     * @param {Function} listener - Функция-обработчик
     */
    onUserDisconnected(listener) {
        this.userDisconnectedListeners.push(listener);
    }

    /**
     * Подписка на событие инициализации кода
     * @param {Function} listener - Функция-обработчик
     */
    onCodeInitialized(listener) {
        this.codeInitializedListeners.push(listener);
    }

    /**
     * Подписка на событие сброса кода
     * @param {Function} listener - Функция-обработчик
     */
    onCodeReset(listener) {
        this.codeResetListeners.push(listener);
    }
    
    /**
     * Подписка на событие обновления стилей
     * @param {Function} listener - Функция-обработчик
     */
    onStylesUpdated(listener) {
        this.stylesUpdatedListeners.push(listener);
    }

    // Остальной код класса SocketService...
}

// Экспортируем только класс, экземпляр будет создаваться в app-initializer.js
export default SocketService;
