import { debounce } from './utils.js';
import { EditorUI } from './editor-ui.js';

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
    }

    /**
     * Инициализация редакторов кода
     * @returns {boolean} Успешность инициализации
     */
    initCodeEditors() {
        try {
            // Инициализация редактора HTML
            this.htmlEditor = CodeMirror.fromTextArea(document.getElementById('html-editor'), {
                mode: 'htmlmixed',
                theme: 'monokai',
                lineNumbers: true,
                autoCloseTags: true,
                autoCloseBrackets: true,
                matchBrackets: true,
                matchTags: { bothTags: true },
                foldGutter: true,
                gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
                extraKeys: { 'Ctrl-Space': 'autocomplete' },
                hintOptions: { completeSingle: false },
                indentUnit: 4,
                tabSize: 4,
                indentWithTabs: false,
                lineWrapping: true
            });

            // Инициализация редактора CSS
            this.cssEditor = CodeMirror.fromTextArea(document.getElementById('css-editor'), {
                mode: 'css',
                theme: 'monokai',
                lineNumbers: true,
                autoCloseBrackets: true,
                matchBrackets: true,
                foldGutter: true,
                gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
                extraKeys: { 'Ctrl-Space': 'autocomplete' },
                hintOptions: { completeSingle: false },
                indentUnit: 4,
                tabSize: 4,
                indentWithTabs: false,
                lineWrapping: true
            });

            // Настройка обработчиков событий
            this._setupEventHandlers();

            // Инициализация UI редактора
            this.editorUI = new EditorUI(this.htmlEditor, this.cssEditor);

            // Обновляем код
            this._refreshEditors();

            log('Редакторы кода успешно инициализированы');
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
        // Обработчик изменений в HTML редакторе с дебаунсом
        this.htmlEditor.on('change', debounce((editor) => {
            // Обновляем HTML код на сервере
            this.socketService.updateHtml(editor.getValue());
            
            // Обновляем результат
            this._updateResult();
        }, 300));
        
        // Обработчик изменений в CSS редакторе с дебаунсом
        this.cssEditor.on('change', debounce((editor) => {
            // Обновляем CSS код на сервере
            this.socketService.updateCss(editor.getValue());
            
            // Обновляем результат
            this._updateResult();
        }, 300));
        
        // Обработчик изменения размера окна
        window.addEventListener('resize', () => {
            this._refreshEditors();
        });
        
        // Обработчик выделения текста в HTML редакторе
        this.htmlEditor.on('cursorActivity', (editor) => {
            // Проверяем, есть ли выделенный текст
            const isTextSelected = editor.getSelection().length > 0;
            
            // Устанавливаем флаг выделения в SocketService
            this.socketService.setHtmlSelectionActive(isTextSelected);
        });
        
        // Обработчик выделения текста в CSS редакторе
        this.cssEditor.on('cursorActivity', (editor) => {
            // Проверяем, есть ли выделенный текст
            const isTextSelected = editor.getSelection().length > 0;
            
            // Устанавливаем флаг выделения в SocketService
            this.socketService.setCssSelectionActive(isTextSelected);
        });
        
        // Находим кнопки полноэкранного режима
        const htmlFullscreenBtn = document.getElementById('html-fullscreen-btn');
        const cssFullscreenBtn = document.getElementById('css-fullscreen-btn');
        
        // Проверяем наличие кнопок и добавляем обработчики
        if (htmlFullscreenBtn) {
            htmlFullscreenBtn.addEventListener('click', () => {
                this.editorUI.toggleFullscreen('html');
            });
        } else {
            log('Кнопка полноэкранного режима HTML не найдена', 'warn');
            
            // Пробуем добавить обработчик после небольшой задержки
            setTimeout(() => {
                const btn = document.getElementById('html-fullscreen-btn');
                if (btn && !btn._fullscreenHandlerAdded) {
                    btn.addEventListener('click', () => {
                        this.editorUI.toggleFullscreen('html');
                    });
                    btn._fullscreenHandlerAdded = true;
                    log('Обработчик полноэкранного режима HTML добавлен с задержкой');
                }
            }, 500);
        }
        
        if (cssFullscreenBtn) {
            cssFullscreenBtn.addEventListener('click', () => {
                this.editorUI.toggleFullscreen('css');
            });
        } else {
            log('Кнопка полноэкранного режима CSS не найдена', 'warn');
            
            // Пробуем добавить обработчик после небольшой задержки
            setTimeout(() => {
                const btn = document.getElementById('css-fullscreen-btn');
                if (btn && !btn._fullscreenHandlerAdded) {
                    btn.addEventListener('click', () => {
                        this.editorUI.toggleFullscreen('css');
                    });
                    btn._fullscreenHandlerAdded = true;
                    log('Обработчик полноэкранного режима CSS добавлен с задержкой');
                }
            }, 500);
        }
    }
    
    /**
     * Обновление результата
     * @private
     */
    _updateResult() {
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
                            <style>${cssCode}</style>
                        </head>
                        <body>${htmlCode}</body>
                    </html>
                `);
                frameDoc.close();
            } catch (error) {
                log(`Ошибка при обновлении результата: ${error.message}`, 'error');
            }
        }
    }
    
    /**
     * Обновление размеров редакторов
     * @private
     */
    _refreshEditors() {
        if (this.htmlEditor) {
            this.htmlEditor.refresh();
        }
        
        if (this.cssEditor) {
            this.cssEditor.refresh();
        }
    }

    /**
     * Установка HTML-кода в редакторе
     * @param {string} html HTML-код
     */
    setHtmlCode(html) {
        if (this.htmlEditor) {
            // Сохраняем текущую позицию курсора и прокрутки
            const cursor = this.htmlEditor.getCursor();
            const scrollInfo = this.htmlEditor.getScrollInfo();
            
            // Устанавливаем новое значение
            this.htmlEditor.setValue(html);
            
            // Восстанавливаем позицию курсора и прокрутки
            this.htmlEditor.setCursor(cursor);
            this.htmlEditor.scrollTo(scrollInfo.left, scrollInfo.top);
            
            // Обновляем размер редактора
            this.htmlEditor.refresh();
            
            // Обновляем результат
            this._updateResult();
        }
    }
    
    /**
     * Установка CSS-кода в редакторе
     * @param {string} css CSS-код
     */
    setCssCode(css) {
        if (this.cssEditor) {
            // Сохраняем текущую позицию курсора и прокрутки
            const cursor = this.cssEditor.getCursor();
            const scrollInfo = this.cssEditor.getScrollInfo();
            
            // Устанавливаем новое значение
            this.cssEditor.setValue(css);
            
            // Восстанавливаем позицию курсора и прокрутки
            this.cssEditor.setCursor(cursor);
            this.cssEditor.scrollTo(scrollInfo.left, scrollInfo.top);
            
            // Обновляем размер редактора
            this.cssEditor.refresh();
            
            // Обновляем результат
            this._updateResult();
        }
    }
}

// Экспортируем класс
export default CodeEditorManager; 