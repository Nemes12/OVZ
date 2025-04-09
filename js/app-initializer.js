// app-initializer.js
// Модуль для инициализации всего приложения

import { showNotification, throttle, showMergeNotification } from './utils.js';
import SocketService from './socket-service.js';
import { CursorManager } from './cursor-manager.js';
import { AuthModal } from './auth-modal.js';
import { CodeEditor } from './code-editor.js';

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
            // Инициализация сокет-сервиса
            this.socketService = new SocketService();
            window.socketService = this.socketService;
            
            // Инициализация менеджера курсоров
            this.cursorManager = new CursorManager(this.socketService);
            
            // Инициализация модального окна авторизации
            this.authModal = new AuthModal(this.socketService);
            
            // Инициализация редакторов кода
            this._initCodeEditors();
            
            // Инициализация фрейма предпросмотра
            this._initPreviewFrame();
            
            // Подписка на события сокетов
            this._subscribeToSocketEvents();
            
            // Инициализация соединения с сервером
            this.socketService.connect();
            
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
    
    /**
     * Инициализация редакторов кода
     * @private
     */
    _initCodeEditors() {
        try {
            // Создаем редактор HTML
            this.htmlEditor = new CodeEditor('html-code', 'html', {
                onChange: (value) => this._updateHtml(value),
                onCursorPositionChange: (position) => this._updateCursorPosition(position)
            });
            
            // Создаем редактор CSS
            this.cssEditor = new CodeEditor('css-code', 'css', {
                onChange: (value) => this._updateCss(value),
                onCursorPositionChange: (position) => this._updateCursorPosition(position)
            });
            
            console.log('Редакторы кода успешно инициализированы');
        } catch (error) {
            console.error('Ошибка при инициализации редакторов кода:', error);
            this._showError('Произошла ошибка при инициализации редакторов кода');
        }
    }
    
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
        } catch (error) {
            console.error('Ошибка при инициализации фрейма предпросмотра:', error);
            this._showError('Произошла ошибка при инициализации предпросмотра');
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
        });
        
        // Обработка события обновления HTML
        this.socketService.onHtmlUpdated((data) => {
            showNotification(`${data.teamName} обновил(а) HTML код`, 'info');
            this._updatePreview();
        });
        
        // Обработка события обновления CSS
        this.socketService.onCssUpdated((data) => {
            showNotification(`${data.teamName} обновил(а) CSS код`, 'info');
            this._updatePreview();
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
            this._updatePreview();
        });
        
        // Обработка события сброса кода
        this.socketService.onCodeReset(() => {
            showNotification('Код сброшен к начальным значениям', 'warning');
            this._updatePreview();
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
    
    /**
     * Обновление HTML кода
     * @param {string} html - Новый HTML код
     * @private
     */
    _updateHtml(html) {
        if (!this.socketService || !this.socketService.isAuthorized()) return;
        
        this.socketService.updateHtml(html);
        this._updatePreview();
    }
    
    /**
     * Обновление CSS кода
     * @param {string} css - Новый CSS код
     * @private
     */
    _updateCss(css) {
        if (!this.socketService || !this.socketService.isAuthorized()) return;
        
        this.socketService.updateCss(css);
        this._updatePreview();
    }
    
    /**
     * Обновление позиции курсора
     * @param {Object} position - Позиция курсора
     * @private
     */
    _updateCursorPosition(position) {
        if (!this.socketService || !this.socketService.isAuthorized()) return;
        
        this.socketService.updateCursorPosition(position);
    }
    
    /**
     * Обновление предпросмотра
     * @private
     */
    _updatePreview() {
        // Используем троттлированную версию для оптимизации
        this.throttledUpdatePreview();
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
                
                const htmlCode = this.htmlEditor ? this.htmlEditor.getValue() : '';
                const cssCode = this.cssEditor ? this.cssEditor.getValue() : '';
                
                if (this.lastHtmlCode === htmlCode && this.lastCssCode === cssCode) {
                    this.isPreviewUpdatePending = false;
                    return;
                }
                
                this.lastHtmlCode = htmlCode;
                this.lastCssCode = cssCode;
                
                
                frameDocument.open();
                frameDocument.write(`
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <meta charset="utf-8">
                            <style>
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
                this._updateFullscreenPreview(htmlCode, cssCode);
                
                this.isPreviewUpdatePending = false;
            } catch (error) {
                console.error('Ошибка при обновлении предпросмотра:', error);
                this.isPreviewUpdatePending = false;
            }
        });
    }
    
    /**
     * Обновляет предпросмотр в полноэкранном режиме
     * @param {string} htmlCode - HTML код
     * @param {string} cssCode - CSS код
     * @private
     */
    _updateFullscreenPreview(htmlCode, cssCode) {
        try {
            const fullscreenResult = document.getElementById('fullscreen-result');
            if (fullscreenResult && window.getComputedStyle(fullscreenResult).display !== 'none') {
                const fullscreenOutput = document.getElementById('fullscreen-output');
                if (fullscreenOutput) {
                    console.log('Обновляю fullscreen-output');
                    
                    try {
                        const frameDocument = fullscreenOutput.contentDocument || fullscreenOutput.contentWindow.document;
                        
                        frameDocument.open();
                        frameDocument.write(`
                            <!DOCTYPE html>
                            <html>
                                <head>
                                    <meta charset="utf-8">
                                    <style>
                                        ${cssCode}
                                    </style>
                                </head>
                                <body>${htmlCode}</body>
                            </html>
                        `);
                        
                        frameDocument.write(`
                            <script>
                                document.addEventListener('DOMContentLoaded', function() {
                                    const images = document.querySelectorAll('img');
                                    let loadedImages = 0;
                                    const totalImages = images.length;
                                    
                                    if (totalImages === 0) {
                                        return;
                                    }
                                    
                                    images.forEach(function(img) {
                                        if (img.complete) {
                                            loadedImages++;
                                        } else {
                                            img.addEventListener('load', function() {
                                                loadedImages++;
                                            });
                                            img.addEventListener('error', function() {
                                                loadedImages++;
                                                this.style.border = '1px solid red';
                                                this.style.padding = '2px';
                                                this.title = 'Ошибка загрузки изображения';
                                            });
                                        }
                                    });
                                });
                            </script>
                        `);
                        
                        frameDocument.close();
                    } catch (e) {
                        console.error('Ошибка при обновлении fullscreen-output:', e);
                    }
                }
            }
        } catch (error) {
            console.error('Ошибка при обновлении предпросмотра в полноэкранном режиме:', error);
        }
    }
    
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