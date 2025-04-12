import { CodeEditor } from './code-editor.js';
// Неиспользуемый импорт findDifferences удален

/**
 * Логирующая функция
 * @param {string} message Сообщение для логирования
 * @param {string} level Уровень логирования
 * @returns {void}
 */
function log(message, level = 'info') {
    const isProd = window.location.hostname !== 'localhost';
    // В продакшене логируем только ошибки
    if (isProd && level !== 'error') return;

    switch (level) {
        case 'error':
            console.error(`[CodeEditor] ${message}`);
            break;
        case 'warn':
            console.warn(`[CodeEditor] ${message}`);
            break;
        default:
            console.log(`[CodeEditor] ${message}`);
    }
}

/**
 * Класс для управления редакторами кода
 */
class CodeEditorManager {
    /**
     * Конструктор класса CodeEditorManager
     * @param {SocketService} socketService Сервис для работы с сокетами
     */
    constructor(socketService) {
        this.socketService = socketService;
        this.htmlEditor = null;
        this.cssEditor = null;
        this.editorUI = null;
        this.cursorPositionUpdateTimeout = null;
        this.isInitialized = false;

        // Поля для работы с diff-match-patch
        this.lastHtmlValue = '';
        this.lastCssValue = '';
    }

    /**
     * Инициализация редакторов кода
     * @returns {boolean} Успешность инициализации
     */
    initCodeEditors() {
        try {
            // Инициализация редактора HTML с использованием Monaco
            this.htmlEditor = new CodeEditor('html-code', 'html', {
                onChange: (value) => this._handleHtmlChange(value),
                onCursorPositionChange: (position) => this._handleCursorPositionChange(position)
            });

            // Инициализация редактора CSS с использованием Monaco
            this.cssEditor = new CodeEditor('css-code', 'css', {
                onChange: (value) => this._handleCssChange(value),
                onCursorPositionChange: (position) => this._handleCursorPositionChange(position)
            });

            // Настройка обработчиков событий
            this._setupEventHandlers();

            // Инициализация UI редактора (если необходимо)
            // Примечание: для Monaco может потребоваться другой подход к UI
            // this.editorUI = new EditorUI(this.htmlEditor, this.cssEditor);

            // Обновляем код
            this._refreshEditors();

            log('Редакторы кода успешно инициализированы с использованием Monaco');
            return true;
        } catch (error) {
            log(`Ошибка при инициализации редакторов кода: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Настройка обработчиков событий
     * @private
     */
    _setupEventHandlers() {
        // Обработчик изменения размера окна
        window.addEventListener('resize', () => {
            this._refreshEditors();
        });

        // Код для полноэкранного режима удален

        // Обработчики для CSS уже добавлены выше
    }

    /**
     * Обработка изменений HTML
     * @param {string} value - Новое значение HTML
     * @private
     */
    _handleHtmlChange(value) {
        // Обновляем HTML код на сервере
        this.socketService.updateHtml(value);

        // Обновляем результат мгновенно, так как это локальное изменение
        this._updateResult(true); // true означает, что это локальное изменение
    }

    /**
     * Обработка изменений CSS
     * @param {string} value - Новое значение CSS
     * @private
     */
    _handleCssChange(value) {
        // Обновляем CSS код на сервере
        this.socketService.updateCss(value);

        // Обновляем результат мгновенно, так как это локальное изменение
        this._updateResult(true); // true означает, что это локальное изменение
    }

    /**
     * Обработка изменений позиции курсора
     * @param {Object} position - Позиция курсора
     * @private
     */
    _handleCursorPositionChange(position) {
        // Отправляем позицию курсора на сервер
        if (this.socketService && this.socketService.isAuthorized()) {
            this.socketService.updateCursorPosition(position);
        }
    }

    /**
     * Обновление результата
     * @param {boolean} isLocalChange - Является ли изменение локальным (от текущего пользователя)
     * @private
     */
    _updateResult(isLocalChange = false) {
        // Получение значений редакторов
        const htmlCode = this.htmlEditor.getValue();
        const cssCode = this.cssEditor.getValue();

        // Обновление iframe
        const resultFrame = document.getElementById('result-frame');
        if (resultFrame) {
            const frameDoc = resultFrame.contentDocument || resultFrame.contentWindow.document;

            try {
                frameDoc.open();
                frameDoc.write(`
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <style>
                                /* Базовые стили для темной темы */
                                body {
                                    background-color: #1a1a1a;
                                    color: #e0e0e0;
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
                frameDoc.close();
            } catch (error) {
                log(`Ошибка при обновлении результата: ${error.message}`, 'error');
            }
        }

        // Обновляем основной предпросмотр в app-initializer
        if (window.appInitializer) {
            // Для локальных изменений обновляем мгновенно
            window.appInitializer._updatePreview(true, isLocalChange);
        }
    }

    /**
     * Обновление размеров редакторов
     * @private
     */
    _refreshEditors() {
        // Для Monaco редакторов необходимо вызывать layout()
        if (this.htmlEditor && this.htmlEditor.editor) {
            this.htmlEditor.editor.layout();
        }

        if (this.cssEditor && this.cssEditor.editor) {
            this.cssEditor.editor.layout();
        }
    }

    /**
     * Установка HTML кода в редактор
     * @param {string} html HTML код
     * @param {string} source Источник изменений
     */
    setHtmlCode(html, source = 'server') {
        if (!this.htmlEditor) {
            log('HTML редактор не инициализирован', 'warn');
            return;
        }

        try {
            // Если код приходит с сервера, но не отличается от текущего
            if (source === 'server' && html === this.htmlEditor.getValue()) {
                return;
            }

            // Для Monaco редактора просто устанавливаем новое значение
            this.htmlEditor.setValue(html);

            // Обновляем последнее значение
            this.lastHtmlValue = html;

            // Обновляем результат, если изменения пришли с сервера
            if (source === 'server') {
                this._updateResult();
            }
        } catch (error) {
            log(`Ошибка при установке HTML кода: ${error.message}`, 'error');
        }
    }

    /**
     * Установка CSS кода в редактор
     * @param {string} css CSS код
     * @param {string} source Источник изменений
     */
    setCssCode(css, source = 'server') {
        if (!this.cssEditor) {
            log('CSS редактор не инициализирован', 'warn');
            return;
        }

        try {
            // Если код приходит с сервера, но не отличается от текущего
            if (source === 'server' && css === this.cssEditor.getValue()) {
                return;
            }

            // Для Monaco редактора просто устанавливаем новое значение
            this.cssEditor.setValue(css);

            // Обновляем последнее значение
            this.lastCssValue = css;

            // Обновляем результат, если изменения пришли с сервера
            if (source === 'server') {
                this._updateResult();
            }
        } catch (error) {
            log(`Ошибка при установке CSS кода: ${error.message}`, 'error');
        }
    }

    // Методы _applySmartUpdate и _highlightChanges удалены как неиспользуемые
}

// Экспортируем класс
export default CodeEditorManager;