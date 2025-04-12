// auto-save-manager.js
// Модуль для автоматического сохранения изменений

import { createPatches, patchesToText } from './diff-utils.js';

/**
 * Класс для управления автоматическим сохранением изменений
 */
export class AutoSaveManager {
    /**
     * Конструктор класса AutoSaveManager
     * @param {Object} socketService - Экземпляр сервиса сокетов
     * @param {Object} codeEditorManager - Экземпляр менеджера редакторов кода
     */
    constructor(socketService, codeEditorManager) {
        this.socketService = socketService;
        this.codeEditorManager = codeEditorManager;
        this.autoSaveInterval = 10000; // 10 секунд
        this.htmlAutoSaveTimer = null;
        this.cssAutoSaveTimer = null;
        this.lastSavedHtml = '';
        this.lastSavedCss = '';
        this.isHtmlDirty = false;
        this.isCssDirty = false;
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 секунды

        // Новые поля для diff-match-patch
        this.lastSyncedHtml = ''; // Последняя версия, отправленная на сервер
        this.lastSyncedCss = ''; // Последняя версия, отправленная на сервер

        // Инициализация
        this._initialize();
    }

    /**
     * Инициализация менеджера автосохранения
     * @private
     */
    _initialize() {
        // Подписываемся на изменения в редакторах
        this._setupEventListeners();

        // Запускаем таймеры автосохранения
        this._startAutoSaveTimers();

        // Загружаем последние сохраненные версии из localStorage
        this._loadSavedVersions();

        console.log('AutoSaveManager инициализирован');
    }

    /**
     * Настройка обработчиков событий
     * @private
     */
    _setupEventListeners() {
        // Подписываемся на изменения HTML через события DOM
        document.addEventListener('html_changed', (event) => {
            if (event.detail && event.detail.content) {
                this.isHtmlDirty = true;
                this._saveToLocalStorage('html', event.detail.content);
            }
        });

        // Подписываемся на изменения CSS через события DOM
        document.addEventListener('css_changed', (event) => {
            if (event.detail && event.detail.content) {
                this.isCssDirty = true;
                this._saveToLocalStorage('css', event.detail.content);
            }
        });

        // Подписываемся на события окна для сохранения перед закрытием
        window.addEventListener('beforeunload', (event) => {
            if (this.isHtmlDirty || this.isCssDirty) {
                this._saveAllChanges();

                // Показываем предупреждение пользователю
                // Современный способ показа предупреждения
                const message = 'У вас есть несохраненные изменения. Вы уверены, что хотите покинуть страницу?';
                event.preventDefault();
                return message;
            }
        });

        // Подписываемся на события потери и восстановления соединения
        window.addEventListener('online', () => {
            console.log('Соединение восстановлено. Синхронизация изменений...');
            this._syncChanges();
        });
    }

    /**
     * Запуск таймеров автосохранения
     * @private
     */
    _startAutoSaveTimers() {
        // Таймер для HTML
        this.htmlAutoSaveTimer = setInterval(() => {
            if (this.isHtmlDirty) {
                this._saveHtmlChanges();
            }
        }, this.autoSaveInterval);

        // Таймер для CSS
        this.cssAutoSaveTimer = setInterval(() => {
            if (this.isCssDirty) {
                this._saveCssChanges();
            }
        }, this.autoSaveInterval);
    }

    /**
     * Загрузка последних сохраненных версий из localStorage
     * @private
     */
    _loadSavedVersions() {
        const teamName = this.socketService.teamName;
        if (!teamName) return;

        // Загружаем HTML
        const savedHtml = localStorage.getItem(`autosave_html_${teamName}`);
        if (savedHtml) {
            try {
                const htmlData = JSON.parse(savedHtml);
                this.lastSavedHtml = htmlData.content;

                // Если есть несохраненные изменения и они новее, чем текущие в редакторе
                if (htmlData.timestamp > (localStorage.getItem(`last_sync_html_${teamName}`) || 0)) {
                    console.log('Найдены несохраненные изменения HTML. Восстановление...');
                    this.isHtmlDirty = true;

                    // Устанавливаем содержимое в редактор, если он уже инициализирован
                    if (this.codeEditorManager.htmlEditor) {
                        this.codeEditorManager.htmlEditor.setValue(htmlData.content);
                    }
                }
            } catch (error) {
                console.error('Ошибка при загрузке сохраненного HTML:', error);
            }
        }

        // Загружаем CSS
        const savedCss = localStorage.getItem(`autosave_css_${teamName}`);
        if (savedCss) {
            try {
                const cssData = JSON.parse(savedCss);
                this.lastSavedCss = cssData.content;

                // Если есть несохраненные изменения и они новее, чем текущие в редакторе
                if (cssData.timestamp > (localStorage.getItem(`last_sync_css_${teamName}`) || 0)) {
                    console.log('Найдены несохраненные изменения CSS. Восстановление...');
                    this.isCssDirty = true;

                    // Устанавливаем содержимое в редактор, если он уже инициализирован
                    if (this.codeEditorManager.cssEditor) {
                        this.codeEditorManager.cssEditor.setValue(cssData.content);
                    }
                }
            } catch (error) {
                console.error('Ошибка при загрузке сохраненного CSS:', error);
            }
        }
    }

    /**
     * Сохранение изменений в localStorage
     * @param {string} type - Тип содержимого ('html' или 'css')
     * @param {string} content - Содержимое для сохранения
     * @private
     */
    _saveToLocalStorage(type, content) {
        const teamName = this.socketService.teamName;
        if (!teamName) return;

        const data = {
            content: content,
            timestamp: Date.now()
        };

        localStorage.setItem(`autosave_${type}_${teamName}`, JSON.stringify(data));
    }

    /**
     * Сохранение изменений HTML
     * @private
     */
    _saveHtmlChanges() {
        if (!this.codeEditorManager.htmlEditor) return;

        // Для Monaco редактора получаем значение через getValue
        const content = this.codeEditorManager.htmlEditor.getValue();
        if (content === this.lastSavedHtml) {
            this.isHtmlDirty = false;
            return;
        }

        console.log('Автосохранение HTML...');

        // Вычисляем различия между последней синхронизированной версией и текущей версией
        const patches = createPatches(this.lastSyncedHtml, content);

        // Сохраняем текущую версию как последнюю сохраненную
        this.lastSavedHtml = content;

        // Отправляем только различия на сервер
        this._sendToServer('html', content, 0, patches);
    }

    /**
     * Сохранение изменений CSS
     * @private
     */
    _saveCssChanges() {
        if (!this.codeEditorManager.cssEditor) return;

        // Для Monaco редактора получаем значение через getValue
        const content = this.codeEditorManager.cssEditor.getValue();
        if (content === this.lastSavedCss) {
            this.isCssDirty = false;
            return;
        }

        console.log('Автосохранение CSS...');

        // Вычисляем различия между последней синхронизированной версией и текущей версией
        const patches = createPatches(this.lastSyncedCss, content);

        // Сохраняем текущую версию как последнюю сохраненную
        this.lastSavedCss = content;

        // Отправляем только различия на сервер
        this._sendToServer('css', content, 0, patches);
    }

    /**
     * Отправка изменений на сервер
     * @param {string} type - Тип содержимого ('html' или 'css')
     * @param {string} content - Содержимое для сохранения
     * @param {number} retryCount - Счетчик повторных попыток
     * @param {Array} patches - Патчи с изменениями (опционально)
     * @private
     */
    _sendToServer(type, content, retryCount, patches = null) {
        const teamName = this.socketService.teamName;
        if (!teamName) return;

        // Функция отправки, которая использует оптимизированный патч, если он доступен
        const sendContent = () => {
            // Флаг для определения было ли включено использование патчей
            const usingPatches = patches !== null && patches.length > 0;

            // Если тип HTML
            if (type === 'html') {
                const promise = this.socketService.updateHtml(content, {
                    // Если есть патчи, включаем оптимизированную отправку
                    optimization: usingPatches ? {
                        patchesText: patchesToText(patches),
                        baseVersion: this.lastSyncedHtml
                    } : null
                });

                promise.then(() => {
                    this.isHtmlDirty = false;
                    // Обновляем последнюю синхронизированную версию
                    this.lastSyncedHtml = content;
                    localStorage.setItem(`last_sync_html_${teamName}`, Date.now().toString());
                });

                return promise;
            }
            // Если тип CSS
            else if (type === 'css') {
                const promise = this.socketService.updateCss(content, {
                    // Если есть патчи, включаем оптимизированную отправку
                    optimization: usingPatches ? {
                        patchesText: patchesToText(patches),
                        baseVersion: this.lastSyncedCss
                    } : null
                });

                promise.then(() => {
                    this.isCssDirty = false;
                    // Обновляем последнюю синхронизированную версию
                    this.lastSyncedCss = content;
                    localStorage.setItem(`last_sync_css_${teamName}`, Date.now().toString());
                });

                return promise;
            }

            return Promise.reject(new Error('Неизвестный тип контента'));
        };

        // Отправляем изменения и обрабатываем результат
        sendContent().catch((error) => {
            console.error(`Ошибка при сохранении ${type}:`, error);

            // Пытаемся повторить отправку, если не превышено максимальное количество попыток
            if (retryCount < this.maxRetries) {
                console.log(`Повторная попытка сохранения ${type} (${retryCount + 1}/${this.maxRetries})...`);

                // Повторяем попытку с задержкой
                setTimeout(() => {
                    this._sendToServer(type, content, retryCount + 1);
                }, this.retryDelay);
            } else {
                console.error(`Не удалось сохранить ${type} после ${this.maxRetries} попыток`);

                // Отмечаем как "грязное", чтобы повторить попытку позже
                if (type === 'html') {
                    this.isHtmlDirty = true;
                } else if (type === 'css') {
                    this.isCssDirty = true;
                }
            }
        });
    }

    /**
     * Сохранение всех изменений
     * @private
     */
    _saveAllChanges() {
        if (this.isHtmlDirty) {
            this._saveHtmlChanges();
        }

        if (this.isCssDirty) {
            this._saveCssChanges();
        }
    }

    /**
     * Синхронизация изменений после восстановления соединения
     * @private
     */
    _syncChanges() {
        const teamName = this.socketService.teamName;
        if (!teamName) return;

        // Синхронизация HTML
        const savedHtml = localStorage.getItem(`autosave_html_${teamName}`);
        if (savedHtml) {
            try {
                const htmlData = JSON.parse(savedHtml);
                const lastSyncHtml = localStorage.getItem(`last_sync_html_${teamName}`);

                // Если локальные изменения новее, чем последняя синхронизация
                if (!lastSyncHtml || htmlData.timestamp > parseInt(lastSyncHtml)) {
                    console.log('Синхронизация несохраненных изменений HTML...');
                    this._sendToServer('html', htmlData.content, 0);
                }
            } catch (error) {
                console.error('Ошибка при синхронизации HTML:', error);
            }
        }

        // Синхронизация CSS
        const savedCss = localStorage.getItem(`autosave_css_${teamName}`);
        if (savedCss) {
            try {
                const cssData = JSON.parse(savedCss);
                const lastSyncCss = localStorage.getItem(`last_sync_css_${teamName}`);

                // Если локальные изменения новее, чем последняя синхронизация
                if (!lastSyncCss || cssData.timestamp > parseInt(lastSyncCss)) {
                    console.log('Синхронизация несохраненных изменений CSS...');
                    this._sendToServer('css', cssData.content, 0);
                }
            } catch (error) {
                console.error('Ошибка при синхронизации CSS:', error);
            }
        }
    }

    /**
     * Принудительное сохранение всех изменений
     * @public
     */
    forceSave() {
        console.log('Принудительное сохранение всех изменений...');
        this._saveAllChanges();
    }

    /**
     * Очистка ресурсов при уничтожении
     * @public
     */
    destroy() {
        // Останавливаем таймеры
        if (this.htmlAutoSaveTimer) {
            clearInterval(this.htmlAutoSaveTimer);
        }

        if (this.cssAutoSaveTimer) {
            clearInterval(this.cssAutoSaveTimer);
        }

        // Сохраняем все несохраненные изменения
        this._saveAllChanges();
    }
}
