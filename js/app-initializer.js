// app-initializer.js
// Модуль для инициализации всего приложения

import { showNotification, throttle, showMergeNotification } from './utils.js';
import SocketService from './socket-service.js';
import { CursorManager } from './cursor-manager.js';
import { AuthModal } from './auth-modal.js';
// Неиспользуемый импорт CodeEditor удален
import CodeEditorManager from './code-editor-manager.js';
import { AutoSaveManager } from './auto-save-manager.js';
import { SyncStatusIndicator } from './sync-status-indicator.js';
import { StyleManager } from './style-manager.js';

/**
 * Класс инициализации приложения
 */
export class AppInitializer {
    /**
     * Конструктор класса AppInitializer
     */
    constructor() {
        // Настройка сервисов
        this.socketService = null;
        this.cursorManager = null;
        this.authModal = null;
        this.htmlEditor = null;
        this.cssEditor = null;
        this.previewFrame = null;
        this.isPreviewUpdatePending = false;
        this.autoSaveManager = null;
        this.syncStatusIndicator = null;
        this.codeEditorManager = null;
        this.styleManager = null;

        // Создаем троттлированную версию метода обновления предпросмотра
        this.throttledUpdatePreview = throttle(this._performPreviewUpdate.bind(this), 500);

        // Инициализируем приложение
        this._initialize();
    }

    /**
     * Инициализация приложения
     * @private
     */
    _initialize() {
        try {
            // Ожидаем, когда DOM будет полностью загружен
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this._initApplication());
            } else {
                this._initApplication();
            }
        } catch (error) {
            console.error('Ошибка при инициализации приложения:', error);
            this._showError('Произошла ошибка при инициализации приложения');
        }
    }

    /**
     * Инициализация приложения после загрузки DOM
     * @private
     */
    _initApplication() {
        try {
            // Сохраняем ссылку на экземпляр класса в глобальной области видимости
            window.appInitializer = this;

            // Инициализация сокет-сервиса
            this.socketService = new SocketService();
            window.socketService = this.socketService;

            // Инициализация менеджера курсоров
            this.cursorManager = new CursorManager(this.socketService);

            // Инициализация модального окна авторизации
            this.authModal = new AuthModal(this.socketService);

            // Инициализация менеджера редакторов кода
            this.codeEditorManager = new CodeEditorManager(this.socketService);
            this.codeEditorManager.initCodeEditors();

            // Инициализация фрейма предпросмотра
            this._initPreviewFrame();

            // Подписка на события сокетов
            this._subscribeToSocketEvents();

            // Инициализация соединения с сервером
            this.socketService.connect();

            // Инициализация менеджера автосохранения
            this.autoSaveManager = new AutoSaveManager(this.socketService, this.codeEditorManager);

            // Инициализация индикатора статуса синхронизации
            this.syncStatusIndicator = new SyncStatusIndicator();

            // Инициализация менеджера стилей
            this.styleManager = new StyleManager(this.socketService);

            // Подписываемся на событие принудительного сохранения
            document.addEventListener('force_save', () => {
                if (this.autoSaveManager) {
                    this.autoSaveManager.forceSave();
                }
            });

            console.log('Приложение успешно инициализировано');

            // Подписываемся на события слияния HTML
            document.addEventListener('html_merged', (event) => {
                const teamName = event.detail.teamName;
                showMergeNotification(teamName, 'html');
            });

            // Подписываемся на события слияния CSS
            document.addEventListener('css_merged', (event) => {
                const teamName = event.detail.teamName;
                showMergeNotification(teamName, 'css');
            });
        } catch (error) {
            console.error('Ошибка при инициализации приложения:', error);
            this._showError('Произошла ошибка при инициализации приложения');
        }
    }

    // Метод _initCodeEditors удален как неиспользуемый

    /**
     * Инициализация фрейма предпросмотра
     * @private
     */
    _initPreviewFrame() {
        try {
            this.previewFrame = document.getElementById('output');

            if (!this.previewFrame) {
                console.error('Элемент предпросмотра не найден');
                return;
            }

            console.log('Фрейм предпросмотра успешно инициализирован');

            // Добавляем таймер для проверки и обновления предпросмотра
            this.previewCheckInterval = setInterval(() => {
                this._checkAndUpdatePreview();
            }, 2000); // Проверяем каждые 2 секунды
        } catch (error) {
            console.error('Ошибка при инициализации фрейма предпросмотра:', error);
            this._showError('Произошла ошибка при инициализации предпросмотра');
        }
    }

    /**
     * Проверяет состояние предпросмотра и обновляет его при необходимости
     * @private
     */
    _checkAndUpdatePreview() {
        if (!this.previewFrame || !this.codeEditorManager) return;

        try {
            const frameDocument = this.previewFrame.contentDocument || this.previewFrame.contentWindow.document;
            const htmlCode = this.codeEditorManager.htmlEditor ? this.codeEditorManager.htmlEditor.getValue() : '';
            const cssCode = this.codeEditorManager.cssEditor ? this.codeEditorManager.cssEditor.getValue() : '';

            // Проверяем, есть ли код в редакторах, но предпросмотр пустой
            if ((htmlCode || cssCode) && (!frameDocument.body || frameDocument.body.innerHTML.trim() === '')) {
                console.log('Обнаружен пустой предпросмотр, обновляем...');
                this._updatePreview(true); // Принудительное обновление
            }
        } catch (error) {
            console.error('Ошибка при проверке предпросмотра:', error);
        }
    }

    /**
     * Подписка на события сокетов
     * @private
     */
    _subscribeToSocketEvents() {
        // Обработка события успешной авторизации
        this.socketService.onAuth((data) => {
            showNotification(`Вход выполнен под именем: ${data.teamName}`, 'success');

            // Показываем основной контейнер и скрываем логин
            this._showMainContainerAfterAuth();

            // Принудительно обновляем предпросмотр после авторизации
            setTimeout(() => {
                this._updatePreview(true); // Принудительное обновление
                console.log('Принудительное обновление предпросмотра после авторизации');
            }, 1000); // Даем время на загрузку кода
        });

        // Обработка события обновления HTML
        this.socketService.onHtmlUpdated((data) => {
            showNotification(`${data.teamName} обновил(а) HTML код`, 'info');
            this._updatePreview(true); // Принудительное обновление
        });

        // Обработка события обновления CSS
        this.socketService.onCssUpdated((data) => {
            showNotification(`${data.teamName} обновил(а) CSS код`, 'info');
            this._updatePreview(true); // Принудительное обновление
        });

        // Обработка события обновления количества пользователей онлайн
        this.socketService.onOnlineUsersCount((count) => {
            document.getElementById('online-users-count').textContent = count;
            showNotification(`Пользователей онлайн: ${count}`, 'info');
        });

        // Обработка события отключения пользователя
        this.socketService.onUserDisconnected((data) => {
            showNotification(`Пользователь ${data.teamName} отключился`, 'warning');
        });

        // Обработка события инициализации кода
        this.socketService.onCodeInitialized(() => {
            showNotification('Код успешно загружен из базы данных', 'success');

            // Принудительно обновляем предпросмотр несколько раз с задержкой
            this._updatePreview(true); // Принудительное обновление

            // Дополнительные обновления с задержкой для надежности
            setTimeout(() => {
                this._updatePreview(true); // Принудительное обновление
                console.log('Повторное обновление предпросмотра после инициализации кода');
            }, 1000);

            setTimeout(() => {
                this._updatePreview(true); // Принудительное обновление
                console.log('Финальное обновление предпросмотра после инициализации кода');
            }, 2000);
        });

        // Обработка события сброса кода
        this.socketService.onCodeReset(() => {
            showNotification('Код сброшен к начальным значениям', 'warning');
            this._updatePreview(true); // Принудительное обновление
        });
    }

    /**
     * Показываем основной контейнер и скрываем логин после авторизации
     * @private
     */
    _showMainContainerAfterAuth() {
        // Скрываем модальное окно входа
        const loginModal = document.getElementById('login-modal');
        const loginFormModal = document.getElementById('login-form-modal');

        if (loginModal) {
            loginModal.style.display = 'none';
        }

        if (loginFormModal) {
            loginFormModal.style.display = 'none';
        }

        // Показываем счетчик пользователей
        const onlineUsersContainer = document.querySelector('.online-users');
        if (onlineUsersContainer) {
            onlineUsersContainer.style.display = 'block';
        }

        console.log('Основной контейнер показан после успешной авторизации');
    }

    // Метод _updateHtml удален как неиспользуемый

    // Метод _updateCss удален как неиспользуемый

    // Метод _updateCursorPosition удален как неиспользуемый

    /**
     * Обновление предпросмотра
     * @param {boolean} force - Принудительное обновление, даже если код не изменился
     * @param {boolean} immediate - Мгновенное обновление без задержки (для локальных изменений)
     * @private
     */
    _updatePreview(force = false, immediate = false) {
        // Устанавливаем флаг принудительного обновления
        this.forcePreviewUpdate = force;

        if (immediate) {
            // Для локальных изменений обновляем мгновенно
            this._performPreviewUpdate();
        } else {
            // Для изменений от сервера используем троттлированную версию
            this.throttledUpdatePreview();
        }
    }

    /**
     * Выполняет фактическое обновление предпросмотра
     * @private
     */
    _performPreviewUpdate() {
        if (this.isPreviewUpdatePending) return;

        this.isPreviewUpdatePending = true;

        requestAnimationFrame(() => {
            try {
                if (!this.previewFrame) return;

                const frameDocument = this.previewFrame.contentDocument || this.previewFrame.contentWindow.document;

                // Получаем код из менеджера редакторов
                const htmlCode = this.codeEditorManager ?
                    (this.codeEditorManager.htmlEditor ? this.codeEditorManager.htmlEditor.getValue() : '') :
                    (this.htmlEditor ? this.htmlEditor.getValue() : '');

                const cssCode = this.codeEditorManager ?
                    (this.codeEditorManager.cssEditor ? this.codeEditorManager.cssEditor.getValue() : '') :
                    (this.cssEditor ? this.cssEditor.getValue() : '');

                // Даже если код не изменился, мы все равно обновляем предпросмотр,
                // если он пустой или если это принудительное обновление
                const isEmpty = !frameDocument.body || frameDocument.body.innerHTML.trim() === '';
                const forceUpdate = this.forcePreviewUpdate || isEmpty;

                if (!forceUpdate && this.lastHtmlCode === htmlCode && this.lastCssCode === cssCode) {
                    this.isPreviewUpdatePending = false;
                    return;
                }

                // Сбрасываем флаг принудительного обновления
                this.forcePreviewUpdate = false;

                this.lastHtmlCode = htmlCode;
                this.lastCssCode = cssCode;

                console.log('Обновляем предпросмотр. HTML: ' + htmlCode.length + ' байт, CSS: ' + cssCode.length + ' байт');


                frameDocument.open();
                frameDocument.write(`
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <style>
                                /* Базовые стили для светлой темы */
                                body {
                                    background-color: #ffffff;
                                    color: #333333;
                                    font-family: 'poppins', sans-serif;
                                    margin: 0;
                                    padding: 10px;
                                }
                                /* Пользовательские стили */
                                ${cssCode}
                            </style>
                        </head>
                        <body>${htmlCode}</body>
                    </html>
                `);

                // Добавляем обработчик загрузки для изображений
                frameDocument.write(`
                    <script>
                        document.addEventListener('DOMContentLoaded', function() {
                            const images = document.querySelectorAll('img');
                            let loadedImages = 0;
                            const totalImages = images.length;

                            if (totalImages === 0) {
                                window.parent.postMessage('previewLoaded', '*');
                                return;
                            }

                            images.forEach(function(img) {
                                if (img.complete) {
                                    loadedImages++;
                                    checkAllImagesLoaded();
                                } else {
                                    img.addEventListener('load', function() {
                                        loadedImages++;
                                        checkAllImagesLoaded();
                                    });
                                    img.addEventListener('error', function() {
                                        loadedImages++;
                                        this.style.border = '1px solid red';
                                        this.style.padding = '2px';
                                        this.title = 'Ошибка загрузки изображения';
                                        checkAllImagesLoaded();
                                    });
                                }
                            });

                            function checkAllImagesLoaded() {
                                if (loadedImages >= totalImages) {
                                    window.parent.postMessage('previewLoaded', '*');
                                }
                            }

                            setTimeout(function() {
                                window.parent.postMessage('previewLoaded', '*');
                            }, 2000);
                        });
                    </script>
                `);

                frameDocument.close();

                this.lastDocStructure = this._getDocStructure(htmlCode);
                // Обновление полноэкранного предпросмотра удалено

                this.isPreviewUpdatePending = false;
            } catch (error) {
                console.error('Ошибка при обновлении предпросмотра:', error);
                this.isPreviewUpdatePending = false;
            }
        });
    }

    // Метод _updateFullscreenPreview удален

    /**
     * Получает структуру HTML документа (без содержимого)
     * @param {string} html - HTML код
     * @returns {string} - Хэш структуры документа
     * @private
     */
    _getDocStructure(html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Упрощенное представление структуры документа
            return doc.doctype?.name + Array.from(doc.querySelectorAll('*')).map(el =>
                el.tagName + (el.id ? '#' + el.id : '') +
                (el.className ? '.' + el.className.replace(/\s+/g, '.') : '')
            ).join('|');
        } catch (e) {
            return null;
        }
    }

    /**
     * Отображение ошибки
     * @param {string} message - Сообщение об ошибке
     * @private
     */
    _showError(message) {
        showNotification(message, 'error', 5000);
    }

    /**
     * Инициализирует обработчик сообщений от iframe
     * @private
     */
    _initPreviewMessageHandler() {
        window.addEventListener('message', (event) => {
            if (event.data === 'previewLoaded') {
                console.log('Предпросмотр полностью загружен (включая все изображения)');
                // Можно добавить дополнительную логику или индикацию загрузки
            }
        });
    }

    /**
     * Инициализирует приложение
     */
    init() {
        this._initializeEventListeners();
        this._initializeEditors();
        this._initializePreview();
        this._initPreviewMessageHandler();

        // Запускаем первое обновление после инициализации
        this._performPreviewUpdate();
    }
}

// Создаем экземпляр инициализатора приложения
const appInitializer = new AppInitializer();

// Экспортируем для совместимости со старым кодом
export { appInitializer };