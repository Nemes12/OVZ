// код редактора
import { debounce, throttle } from './utils.js';

export class CodeEditor {
    constructor(editorId, language, options = {}) {
        this.editorId = editorId;
        this.language = language;
        this.editor = null;
        this.value = '';
        this.isInitialized = false;
        this.hasUnsavedChanges = false;
        this.lastSavedValue = '';
        this.isEditing = false;
        this.editingTimer = null;
        this.editingTimeout = 5000; // 5 секунд
        this.options = {
            onChange: () => {},
            onCursorPositionChange: () => {},
            ...options
        };

        // Создаем оптимизированные версии обработчиков
        this.debouncedOnChange = debounce(this._handleContentChange.bind(this), 300);
        this.throttledCursorUpdate = throttle(this._handleCursorPositionChange.bind(this), 100);

        this._initialize();
    }

    /**
     * Инициализация редактора кода
     * @private
     */
    _initialize() {
        // Проверяем, загружен ли уже Monaco
        if (window.monaco) {
            this._createEditor();
        } else {
            console.log(`Ожидание загрузки Monaco Editor для редактора ${this.language}...`);
            // Однократная подписка на событие загрузки Monaco
            const monacoLoadedHandler = () => {
                console.log(`Monaco Editor загружен, создаю редактор ${this.language}`);
                this._createEditor();
                // Удаляем обработчик после создания редактора
                window.removeEventListener('monaco_loaded', monacoLoadedHandler);
            };
            window.addEventListener('monaco_loaded', monacoLoadedHandler);
            
            // Таймаут на случай, если Monaco не загрузится
            setTimeout(() => {
                if (!window.monaco) {
                    console.error(`Таймаут ожидания Monaco Editor для редактора ${this.language}`);
                    window.removeEventListener('monaco_loaded', monacoLoadedHandler);
                }
            }, 10000); // 10 секунд таймаут
        }
    }

    /**
     * Создание экземпляра редактора кода
     * @private
     */
    _createEditor() {
        const editorElement = document.getElementById(this.editorId);
        
        if (!editorElement) {
            console.error(`Элемент с id ${this.editorId} не найден`);
            return;
        }

        try {
            if (!window.monaco) {
                console.error('Monaco Editor не загружен, невозможно создать редактор');
                return;
            }
            
            // Определяем язык для подсветки синтаксиса
            const language = this.language === 'html' ? 'html' : 'css';
            
            console.log(`Создаю редактор ${this.language} с использованием Monaco`);
            
            // Создаем редактор Monaco
            this.editor = monaco.editor.create(editorElement, {
                value: this.value,
                language: language,
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: {
                    enabled: false // Отключаем миникарту для экономии ресурсов
                },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                fontSize: 14,
                wordWrap: 'on',
                tabSize: 2,
                folding: true,
                renderWhitespace: 'none',
                autoIndent: 'advanced',
                showFoldingControls: 'always',
                // Оптимизации для больших файлов
                largeFileOptimizations: true,
                // Экономия памяти
                wordBasedSuggestions: false,
                // Снижаем частоту обновления для экономии CPU
                renderValidationDecorations: 'editable',
                // Инкрементальная проверка моделей для экономии CPU
                model: monaco.editor.createModel('', language),
                // Отключаем тяжелые фичи для больших файлов
                quickSuggestions: {
                    other: false,
                    comments: false,
                    strings: false
                },
                // Отложенное форматирование
                formatOnType: false,
                formatOnPaste: false,
                // Работает быстрее по сравнению с exact
                accessibilitySupport: 'off',
                renderLineHighlight: 'line',
                // Повышаем производительность рендеринга
                disableMonospaceOptimizations: false
            });

            // Обработчик изменения содержимого
            this.editor.onDidChangeModelContent(this.debouncedOnChange);

            // Обработчик изменения позиции курсора
            this.editor.onDidChangeCursorPosition(this.throttledCursorUpdate);
            
            // Устанавливаем флаг инициализации
            this.isInitialized = true;
            
            // Добавляем обработчик событий сокетов для обновления кода
            this._initSocketEvents();
            
            // Инициализируем глобальные события
            this._initEvents();
            
            console.log(`Редактор ${this.language} успешно создан`);
        } catch (error) {
            console.error(`Ошибка при создании редактора ${this.language}:`, error);
        }
    }
    
    /**
     * Инициализация обработчиков событий сокетов
     * @private
     */
    _initSocketEvents() {
        // Получаем экземпляр сокет-сервиса
        const socketService = window.socketService;
        
        if (!socketService) {
            console.error('Сокет-сервис не найден');
            return;
        }
        
        // Подписываемся на событие инициализации кода
        socketService.onCodeInitialized(() => {
            console.log(`Получен сигнал инициализации кода для ${this.language}`);
        });
        
        // Подписываемся на событие сброса кода
        socketService.onCodeReset(() => {
            console.log(`Получен сигнал сброса кода для ${this.language}`);
        });
        
        if (this.language === 'html') {
            // Обработчик обновления HTML кода
            socketService.onHtmlUpdated(data => {
                console.log('Получено обновление HTML от', data.teamName);
                
                // Обрабатываем данные, независимо от того, редактируем мы сейчас или нет
                // В socket-service уже происходит умное слияние изменений
                this.setValue(data.html);
                
                // Обновляем индикатор последнего редактора
                const lastEditorSpan = document.getElementById('last-html-editor');
                if (lastEditorSpan) {
                    lastEditorSpan.textContent = `(Последнее изменение: ${data.teamName})`;
                    lastEditorSpan.classList.add('updated');
                    setTimeout(() => {
                        lastEditorSpan.classList.remove('updated');
                    }, 2000);
                }
            });
        } else if (this.language === 'css') {
            // Обработчик обновления CSS кода
            socketService.onCssUpdated(data => {
                console.log('Получено обновление CSS от', data.teamName);
                
                // Обрабатываем данные, независимо от того, редактируем мы сейчас или нет
                // В socket-service уже происходит умное слияние изменений
                this.setValue(data.css);
                
                // Обновляем индикатор последнего редактора
                const lastEditorSpan = document.getElementById('last-css-editor');
                if (lastEditorSpan) {
                    lastEditorSpan.textContent = `(Последнее изменение: ${data.teamName})`;
                    lastEditorSpan.classList.add('updated');
                    setTimeout(() => {
                        lastEditorSpan.classList.remove('updated');
                    }, 2000);
                }
            });
        }
    }

    /**
     * Получение текущего значения редактора
     * @returns {string} Текущее значение редактора
     */
    getValue() {
        if (!this.editor) return this.value;
        return this.editor.getValue();
    }
    
    /**
     * Установка значения редактора
     * @param {string} value Новое значение редактора
     */
    setValue(value) {
        // Если значение не изменилось, ничего не делаем
        if (this.value === value) return;
        
        // Сохраняем текущую позицию просмотра и курсора
        let currentPosition = null;
        let currentScrollTop = null;
        let currentVisibleRanges = null;
        let currentSelection = null;
        
        if (this.editor) {
            // Сохраняем текущую позицию курсора
            currentPosition = this.editor.getPosition();
            
            // Сохраняем текущую позицию скролла
            currentScrollTop = this.editor.getScrollTop();
            
            // Сохраняем видимый диапазон для более точного восстановления
            currentVisibleRanges = this.editor.getVisibleRanges();
            
            // Сохраняем текущее выделение
            currentSelection = this.editor.getSelection();
            
            // Запоминаем, что мы обновляем содержимое программно, а не пользователь
            this.updatingProgrammatically = true;
            
            // Создаем атомарные операции редактирования для оптимизации
            const editOperations = [];
            
            // Используем более производительный метод для больших изменений
            const currentModel = this.editor.getModel();
            if (currentModel) {
                const fullRange = currentModel.getFullModelRange();
                editOperations.push({
                    range: fullRange,
                    text: value,
                    forceMoveMarkers: true
                });
                
                // Применяем изменения как одну операцию
                currentModel.pushEditOperations([], editOperations, () => null);
                
                // Сбрасываем историю отмены для экономии памяти
                currentModel.pushStackElement();
            } else {
                // Запасной вариант, если модель не доступна
                this.editor.setValue(value);
            }
            
            // Обновляем значение
            this.value = value;
            
            // Сохраняем последнее сохраненное значение для отслеживания несохраненных изменений
            this.lastSavedValue = value;
            
            // Восстанавливаем позицию просмотра и курсора после того, как Monaco обработает изменения
            // Обертываем в setTimeout, чтобы гарантировать, что Monaco завершил изменения
            setTimeout(() => {
                if (this.editor) {
                    // Восстанавливаем позицию курсора, если она была сохранена
                    if (currentPosition) {
                        // Проверяем, что позиция валидна после изменений
                        const model = this.editor.getModel();
                        if (model) {
                            const lineCount = model.getLineCount();
                            if (currentPosition.lineNumber <= lineCount) {
                                const lineContent = model.getLineContent(currentPosition.lineNumber);
                                // Корректируем позицию, если после изменений она вышла за пределы строки
                                const column = Math.min(currentPosition.column, lineContent.length + 1);
                                this.editor.setPosition({ lineNumber: currentPosition.lineNumber, column });
                            }
                        }
                    }
                    
                    // Восстанавливаем выделение, если оно было сохранено
                    if (currentSelection) {
                        // Проверяем, что выделение валидно после изменений
                        const model = this.editor.getModel();
                        if (model) {
                            const lineCount = model.getLineCount();
                            if (currentSelection.startLineNumber <= lineCount && 
                                currentSelection.endLineNumber <= lineCount) {
                                const startLine = model.getLineContent(currentSelection.startLineNumber);
                                const endLine = model.getLineContent(currentSelection.endLineNumber);
                                // Корректируем выделение
                                const startColumn = Math.min(currentSelection.startColumn, startLine.length + 1);
                                const endColumn = Math.min(currentSelection.endColumn, endLine.length + 1);
                                const selection = {
                                    startLineNumber: currentSelection.startLineNumber,
                                    startColumn: startColumn,
                                    endLineNumber: currentSelection.endLineNumber,
                                    endColumn: endColumn
                                };
                                this.editor.setSelection(selection);
                            }
                        }
                    }
                    
                    // Восстанавливаем позицию скролла
                    if (currentScrollTop !== null) {
                        this.editor.setScrollTop(currentScrollTop);
                    }
                    
                    // Сбрасываем флаг программного обновления
                    this.updatingProgrammatically = false;
                }
            }, 0);
            
            // Принудительно обновляем редактор, чтобы избежать проблем с отображением
            this.editor.layout();
        } else {
            // Если редактор еще не создан, просто сохраняем значение
            this.value = value;
            this.lastSavedValue = value;
        }
    }

    /**
     * Обработчик изменения содержимого
     * @private
     */
    _handleContentChange() {
        if (!this.isInitialized) return;
        
        // Игнорируем программные изменения (когда мы сами устанавливаем значение)
        if (this.updatingProgrammatically) return;
        
        const newValue = this.editor.getValue();
        this.value = newValue;
        this.hasUnsavedChanges = true;
        
        // Устанавливаем флаг редактирования
        this.isEditing = true;
        
        // Сбрасываем таймер, если он уже установлен
        if (this.editingTimer) {
            clearTimeout(this.editingTimer);
        }
        
        // Устанавливаем новый таймер на 5 секунд
        this.editingTimer = setTimeout(() => {
            this.isEditing = false;
            this.editingTimer = null;
            // Обновляем визуальный статус
            this._updateSavingStatus('saved');
        }, this.editingTimeout);
        
        // Добавляем визуальную индикацию несохраненных изменений
        this._updateSavingStatus('editing');
        
        // Немедленно отправляем изменения на сервер
        if (typeof this.options.onChange === 'function') {
            // Запускаем событие сохранения для отслеживания
            document.dispatchEvent(new CustomEvent('editor_saving', { 
                detail: { type: this.language }
            }));
            
            // Вызываем обработчик изменений с небольшой задержкой, чтобы не вызывать слишком часто
            this.options.onChange(newValue);
            
            // После небольшой задержки показываем статус "сохранено"
            setTimeout(() => {
                this._updateSavingStatus('saved');
            }, 300);
        }
    }
    
    /**
     * Обновляет визуальный статус сохранения
     * @param {string} status - Статус ('editing', 'saving', 'saved')
     * @private
     */
    _updateSavingStatus(status) {
        // Отключаем отображение статуса редактирования, так как это мешает пользователю
        return;
        
        // Получаем заголовок редактора
        const editorContainer = document.getElementById(this.editorId);
        if (!editorContainer) return;
        
        const editorParent = editorContainer.closest('.div-codemirror');
        if (!editorParent) return;
        
        const statusContainer = editorParent.querySelector('.save-status');
        
        // Если контейнер статуса не существует, создаем его
        if (!statusContainer) {
            const header = editorParent.querySelector('.editor-header');
            if (!header) return;
            
            const statusDiv = document.createElement('div');
            statusDiv.className = 'save-status';
            statusDiv.style.marginLeft = '10px';
            statusDiv.style.fontSize = '12px';
            header.querySelector('.editor-title').appendChild(statusDiv);
            
            // Обновляем ссылку на новый контейнер
            this._updateSavingStatus(status);
            return;
        }
        
        // Обновляем статус
        switch (status) {
            case 'editing':
                statusContainer.textContent = '● редактируется';
                statusContainer.style.color = '#ffaa00';
                break;
            case 'saving':
                statusContainer.textContent = '● сохраняется...';
                statusContainer.style.color = '#66aaff';
                break;
            case 'saved':
                statusContainer.textContent = '● сохранено';
                statusContainer.style.color = '#66cc66';
                
                // Удаляем статус через 3 секунды
                setTimeout(() => {
                    if (statusContainer.textContent === '● сохранено') {
                        statusContainer.textContent = '';
                    }
                }, 3000);
                break;
        }
    }

    /**
     * Обработчик изменения позиции курсора
     * @private
     */
    _handleCursorPositionChange(event) {
        if (!this.isInitialized) return;
        
        const position = event.position;
        const editorElement = document.getElementById(this.editorId);
        const editorBounds = editorElement.getBoundingClientRect();
        
        // Получаем координаты позиции курсора в редакторе
        const coordinatesList = this.editor.getScrolledVisiblePosition(position);
        
        if (!coordinatesList) return;
        
        // Вычисляем абсолютные координаты курсора
        const x = editorBounds.left + coordinatesList.left;
        const y = editorBounds.top + coordinatesList.top;
        
        if (typeof this.options.onCursorPositionChange === 'function') {
            this.options.onCursorPositionChange({ x, y });
        }
    }

    /**
     * Инициализация глобальных событий
     * @private
     */
    _initEvents() {
        // Обработчик события начала сохранения
        document.addEventListener('editor_saving', (event) => {
            const { type } = event.detail;
            
            // Проверяем, относится ли событие к этому редактору
            if ((type === 'html' && this.language === 'html') || 
                (type === 'css' && this.language === 'css')) {
                this._updateSavingStatus('saving');
            }
        });
    }
} 