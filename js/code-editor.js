// code-editor.js
// Основной класс для редактора кода с использованием Socket.io

// Функция для дебаунсинга
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Функции для валидации кода
const validateHTML = (html) => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return doc.querySelector('parsererror') === null;
    } catch (e) {
        return false;
    }
};

const validateCSS = (css) => {
    try {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        document.head.removeChild(style);
        return true;
    } catch (e) {
        return false;
    }
};

// Основной класс редактора кода
class CodeEditor {
    constructor() {
        this.htmlEditor = null;
        this.cssEditor = null;
        this.output = document.getElementById('output');
        this.previewOutput = document.getElementById('preview-output');
        this.lastHtmlEditorIndicator = document.getElementById('last-html-editor');
        this.lastCssEditorIndicator = document.getElementById('last-css-editor');
        this.initButton = document.getElementById('init-button');
        this.initOverlay = document.getElementById('init-overlay');
        this.initStatus = document.getElementById('init-status');
        this.onlineUsersElement = document.querySelector('.online-users');
        this.onlineUsersCount = document.getElementById('online-users-count');
        
        this.teamName = '';
        this.teamData = null;
        this.initialized = false;
        this.codeData = {
            html: `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="style.css">
    <title>Изображения</title>
</head>
<body>
    <div class="gallery">
 <!-- Рабоча зона команды 1-->       
        <img class="img1" src="https://sun9-65.userapi.com/impg/UtNCKnF7FJR7wx9rpWbCw9k5WZdKFUbej5HQqA/CMwiXLXomTM.jpg?size=208x290&quality=95&sign=62fa5c78840d95aca2af76323fd9c4bb&type=album" alt="Изображение 1">
        
 <!-- Рабоча зона команды 2-->       
      <img class="img2" src="https://sun9-79.userapi.com/impg/9q_JmFSsTqNhD_Pc8a2JuxLueNkQyRfT59EeWQ/hU4UAOnK5s4.jpg?size=209x290&quality=95&sign=3903ae3486de5519b515ea50be4899e6&type=album" alt="Изображение 2">
      
  <!-- Рабоча зона команды 3-->      
      <img class="img3" src="https://sun9-29.userapi.com/impg/_JqcvwgV7oNG8Zekk3w4hMQeL2ZYYIWI7GdCmA/HWNxhX5wzdQ.jpg?size=208x291&quality=95&sign=237c8d4da590e08588cf10e19ce8738d&type=album" alt="Изображение 3">
        
  <!-- Рабоча зона команды 4-->      
      <img class="img4" src="https://sun9-37.userapi.com/impg/AeXefsKJbuq0mi1ngncZoGrX8SP9fmjkD0fYhg/0A72DM4-18U.jpg?size=209x291&quality=95&sign=87d47a4452a4f401fee59eb7761ae068&type=album" alt="Изображение 4">
    </div>
</body>
</html>`,
            css: `body {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    margin: 0;
    background-color: #f0f0f0;
}

.gallery {
    display: grid;
    grid-template-columns: repeat(2, 1fr); /* 2 колонки */
    gap: 0px; /* Расстояние между изображениями */
}

.gallery img {
    width: 100%; /* Ширина изображения 100% от ячейки */
    height: auto; /* Автоматическая высота для сохранения пропорций */
}

/*Рабоча зона команды 1*/
.img1 {
    max-width: 100%; /* Адаптивная ширина */
    height: auto; /* Автоматическая высота для сохранения пропорций */  
}

/*Рабоча зона команды 2*/
.img2 {
    max-width: 100%; /* Адаптивная ширина */
    height: auto; /* Автоматическая высота для сохранения пропорций */
}

/*Рабоча зона команды 3*/
.img3 {
    max-width: 100%; /* Адаптивная ширина */
    height: auto; /* Автоматическая высота для сохранения пропорций */ 
}

/*Рабоча зона команды 4*/
.img4 {
    max-width: 100%; /* Адаптивная ширина */
    height: auto; /* Автоматическая высота для сохранения пропорций */  
}`
        };
        this.editorsDirty = {
            html: false,
            css: false
        };
        
        // Флаг для управления событиями обновления
        this.ignoreUpdates = false;
        
        // Добавляем новые поля для отслеживания состояния редактирования
        this.isEditing = {
            html: false,
            css: false
        };
        
        // Очередь отложенных обновлений
        this.pendingUpdates = {
            html: null,
            css: null
        };
        
        // Таймер неактивности
        this.editingTimer = {
            html: null,
            css: null
        };
        
        // Время неактивности перед применением изменений (3 секунды)
        this.inactivityTimeout = 3000;
        
        // Отслеживаем текущий редактор в полноэкранном режиме
        this.fullscreenEditor = null;
        
        // Инициализация
        this.setupEventListeners();
        this.init();
    }

    init() {
        console.log('Инициализация редактора кода');
        
        // Проверяем сохраненные данные авторизации
        const savedTeamName = localStorage.getItem('teamName');
        const savedTeamData = localStorage.getItem('teamData');
        
        if (savedTeamName && savedTeamData) {
            this.teamName = savedTeamName;
            this.teamData = JSON.parse(savedTeamData);
            this.isAdmin = this.teamName === 'admin';
        }
        
        // Устанавливаем размеры редакторов
        this.setEditorsSize();
        
        // Инициализируем редакторы CodeMirror
        this.initializeEditors();
        
        // Подписываемся на события Socket.io
        this.setupSocketEvents();
        
        // Устанавливаем обработчики событий
        this.setupEventListeners();
        
        // Настраиваем оверлей инициализации
        this.setupInitOverlay();
        
        // Настраиваем индикаторы редакторов
        this.setupEditorIndicators();
        
        // Отображаем количество онлайн пользователей
        this.setupOnlineUsersListener();
        
        window.addEventListener('resize', () => {
            this.setEditorsSize();
        });
    }
    
    setupSocketEvents() {
        // Обработка событий обновления кода
        document.addEventListener('html_updated', (event) => {
            if (this.ignoreUpdates) return;
            
            const { html, teamName } = event.detail;
            console.log(`Получено обновление HTML от команды ${teamName}`);
            
            // Если редактор в режиме редактирования, откладываем обновление
            if (this.isEditing.html) {
                this.pendingUpdates.html = { code: html, teamName };
                console.log('HTML редактируется, обновление отложено');
                return;
            }
            
            // Сохраняем текущие позиции прокрутки и курсора
            const scrollInfo = this.htmlEditor.getScrollInfo();
            const cursor = this.htmlEditor.getCursor();
            
            // Обновляем редактор
            this.htmlEditor.setValue(html);
            
            // Восстанавливаем позиции
            this.htmlEditor.scrollTo(scrollInfo.left, scrollInfo.top);
            this.htmlEditor.setCursor(cursor);
            
            this.updateLastEditorIndicator('html', teamName);
            this.run();
        });
        
        document.addEventListener('css_updated', (event) => {
            if (this.ignoreUpdates) return;
            
            const { css, teamName } = event.detail;
            console.log(`Получено обновление CSS от команды ${teamName}`);
            
            // Если редактор в режиме редактирования, откладываем обновление
            if (this.isEditing.css) {
                this.pendingUpdates.css = { code: css, teamName };
                console.log('CSS редактируется, обновление отложено');
                return;
            }
            
            // Сохраняем текущие позиции прокрутки и курсора
            const scrollInfo = this.cssEditor.getScrollInfo();
            const cursor = this.cssEditor.getCursor();
            
            // Обновляем редактор
            this.cssEditor.setValue(css);
            
            // Восстанавливаем позиции
            this.cssEditor.scrollTo(scrollInfo.left, scrollInfo.top);
            this.cssEditor.setCursor(cursor);
            
            this.updateLastEditorIndicator('css', teamName);
            this.run();
        });
        
        // Обработка события успешной авторизации
        document.addEventListener('auth_success', (event) => {
            const { teamName, teamData, isAdmin } = event.detail;
            this.teamName = teamName;
            this.teamData = teamData;
            this.isAdmin = isAdmin;
            
            console.log('Авторизация успешна:', { teamName, teamData, isAdmin: this.isAdmin });
            
            // Скрываем модальное окно входа
            const loginModal = document.getElementById('login-modal');
            if (loginModal) {
                loginModal.style.display = 'none';
            }
            
            // Показываем основной контейнер
            const container = document.querySelector('.container');
            if (container) {
                container.style.display = 'flex';
            }
            
            // Настраиваем оверлей инициализации
            this.setupInitOverlay();
            
            if (this.isAdmin) {
                console.log('Пользователь авторизован как администратор');
            }
        });
        
        // Обработка события ошибки авторизации
        document.addEventListener('auth_error', (event) => {
            console.error('Ошибка авторизации:', event.detail.message);
            this.showError(event.detail.message);
        });
        
        // Обновление счетчика онлайн пользователей
        document.addEventListener('online_users_count', (event) => {
            this.updateOnlineUsersCount(event.detail.count);
        });

        // Добавляем обработчик события инициализации кода
        document.addEventListener('code_initialized', () => {
            console.log('Получено событие инициализации кода');
            this.typeCodeAnimation();
        });
    }

    initializeEditors() {
        // Инициализация HTML редактора
        this.htmlEditor = CodeMirror(document.getElementById('html-code'), {
            mode: 'xml',
            theme: 'dracula',
            lineNumbers: true,
            lineWrapping: true,
            indentUnit: 2,
            tabSize: 2,
            autoCloseTags: true,
            autoCloseBrackets: true,
            matchTags: { bothTags: true },
            extraKeys: {
                'Alt-Shift-F': () => this.formatCode(),
                'Ctrl-S': () => this.syncChanges('html'),
            }
        });

        // Инициализация CSS редактора
        this.cssEditor = CodeMirror(document.getElementById('css-code'), {
            mode: 'css',
            theme: 'dracula',
            lineNumbers: true,
            lineWrapping: true,
            indentUnit: 2,
            tabSize: 2,
            autoCloseBrackets: true,
            extraKeys: {
                'Alt-Shift-F': () => this.formatCode(),
                'Ctrl-S': () => this.syncChanges('css'),
            }
        });

        // Отслеживание состояния редактирования
        this.htmlEditor.on('focus', () => {
            this.currentEditor = 'html';
        });

        this.cssEditor.on('focus', () => {
            this.currentEditor = 'css';
        });

        // Отслеживание начала редактирования
        this.htmlEditor.on('beforeChange', (editor, change) => {
            if (change.origin === 'setValue' || this.ignoreUpdates) return;
            this.startEditing('html');
        });

        this.cssEditor.on('beforeChange', (editor, change) => {
            if (change.origin === 'setValue' || this.ignoreUpdates) return;
            this.startEditing('css');
        });

        // Отслеживание изменений
        this.htmlEditor.on('change', (editor, change) => {
            if (change.origin === 'setValue' || this.ignoreUpdates) return;
            this.editorsDirty.html = true;
            this.resetEditingTimer('html');
            this.run();
            this.updateFullscreenResult(); // Обновляем результат в полноэкранном режиме
        });

        this.cssEditor.on('change', (editor, change) => {
            if (change.origin === 'setValue' || this.ignoreUpdates) return;
            this.editorsDirty.css = true;
            this.resetEditingTimer('css');
            this.run();
            this.updateFullscreenResult(); // Обновляем результат в полноэкранном режиме
        });

        // Отслеживание потери фокуса
        this.htmlEditor.on('blur', () => {
            if (this.editorsDirty.html) {
                this.finishEditing('html');
            }
        });

        this.cssEditor.on('blur', () => {
            if (this.editorsDirty.css) {
                this.finishEditing('css');
            }
        });
    }

    setEditorsSize() {
        // Устанавливаем размеры редакторов в зависимости от размера окна
        const leftSection = document.querySelector('.left');
        const editors = leftSection.querySelectorAll('.div-codemirror');
        const leftHeight = leftSection.clientHeight;
        
        editors.forEach(editor => {
            editor.style.height = `${leftHeight / editors.length - 20}px`;
        });
    }

    setupEventListeners() {
        // Обработчик для кнопки инициализации
        this.initButton.addEventListener('click', () => {
            this.playInitAnimation();
        });

        // Горячие клавиши
        document.addEventListener('keydown', (e) => {
            // Alt+Shift+F для форматирования кода
            if (e.altKey && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                this.formatCode();
            }
            
            // Esc для выхода из полноэкранного режима
            if (e.key === 'Escape') {
                this.exitFullscreen();
            }
        });
        
        // Кнопки полноэкранного режима
        const htmlFullscreenBtn = document.getElementById('html-fullscreen-btn');
        const cssFullscreenBtn = document.getElementById('css-fullscreen-btn');
        
        if (htmlFullscreenBtn) {
            htmlFullscreenBtn.addEventListener('click', (e) => {
                console.log('HTML fullscreen button clicked');
                this.toggleFullscreen('html');
            });
        } else {
            console.error('HTML fullscreen button not found');
        }
        
        if (cssFullscreenBtn) {
            cssFullscreenBtn.addEventListener('click', (e) => {
                console.log('CSS fullscreen button clicked');
                this.toggleFullscreen('css');
            });
        } else {
            console.error('CSS fullscreen button not found');
        }
    }

    run() {
        const htmlCode = this.htmlEditor.getValue();
        const cssCode = this.cssEditor.getValue();

        // Проверка кода на ошибки
        if (!validateHTML(htmlCode)) {
            this.showError('Ошибка в HTML коде');
            return;
        }

        if (!validateCSS(cssCode)) {
            this.showError('Ошибка в CSS коде');
            return;
        }

        // Обновляем iframe без добавления кавычек
        this.updateOutput(htmlCode, cssCode);
        
        // Обновляем результат в полноэкранном режиме
        if (this.fullscreenEditor) {
            this.updateFullscreenResult();
        }
    }

    updateOutput(htmlCode, cssCode) {
        try {
            const output = this.output;
            const previewOutput = this.previewOutput;
            
            if (!output || !previewOutput) {
                console.error('Output elements not found');
                return;
            }

            if (!this.htmlEditor || !this.cssEditor) {
                console.error('Editors not initialized');
                return;
            }
            
            // Сохраняем текущие позиции прокрутки
            const htmlScrollInfo = this.htmlEditor.getScrollInfo();
            const cssScrollInfo = this.cssEditor.getScrollInfo();
            
            // Сохраняем позиции курсоров
            const htmlCursor = this.htmlEditor.getCursor();
            const cssCursor = this.cssEditor.getCursor();
            
            // Сохраняем выделение текста
            const htmlSelection = this.htmlEditor.getSelection();
            const cssSelection = this.cssEditor.getSelection();
            
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>${cssCode}</style>
                </head>
                <body>${htmlCode}</body>
                </html>
            `;
            
            // Обновляем содержимое
            output.srcdoc = html;
            previewOutput.srcdoc = html;
            
            // Восстанавливаем позиции прокрутки
            setTimeout(() => {
                this.htmlEditor.scrollTo(htmlScrollInfo.left, htmlScrollInfo.top);
                this.cssEditor.scrollTo(cssScrollInfo.left, cssScrollInfo.top);
                
                // Восстанавливаем позиции курсоров
                this.htmlEditor.setCursor(htmlCursor);
                this.cssEditor.setCursor(cssCursor);
                
                // Восстанавливаем выделение текста
                if (htmlSelection) {
                    this.htmlEditor.setSelection(htmlSelection.anchor, htmlSelection.head);
                }
                if (cssSelection) {
                    this.cssEditor.setSelection(cssSelection.anchor, cssSelection.head);
                }
            }, 0);
            
        } catch (error) {
            console.error('Error in updateOutput:', error);
        }
    }

    formatCode() {
        const activeEditor = document.activeElement && document.activeElement.closest ? 
            document.activeElement.closest('.CodeMirror') : 
                           document.querySelector('.CodeMirror-focused');
                           
        if (!activeEditor) {
            // Если ни один редактор не в фокусе, форматируем оба
            this.formatHtml(this.htmlEditor.getValue());
            this.formatCss(this.cssEditor.getValue());
        } else {
            // Определяем, какой редактор активен
            const cmInstance = activeEditor.CodeMirror;
            if (cmInstance === this.htmlEditor) {
                this.formatHtml(this.htmlEditor.getValue());
            } else if (cmInstance === this.cssEditor) {
                this.formatCss(this.cssEditor.getValue());
            }
        }
        
        this.showNotification('Код отформатирован');
    }

    formatHtml(html) {
        // Простое форматирование HTML кода
        let formatted = '';
        let indent = '';
        const tab = '  '; // Два пробела для отступа
        
        // Удаляем кавычки в начале и конце, если они есть
        html = html.trim();
        if (html.startsWith('"') && html.endsWith('"')) {
            html = html.substring(1, html.length - 1);
        }
        
        html.split(/>\s*</).forEach(function(element) {
            if (element.match(/^\/\w/)) {
                indent = indent.substring(tab.length); // Уменьшаем отступ
            }
            
            formatted += indent + '<' + element + '>\n';
            
            if (element.match(/^<?\w[^>]*[^\/]$/) && !element.startsWith('input') && !element.startsWith('img')) {
                indent += tab; // Увеличиваем отступ
            }
        });
        
        // Устанавливаем отформатированный код
        this.ignoreUpdates = true;
        this.htmlEditor.setValue(formatted.trim());
        
        // Форматируем с помощью встроенных инструментов CodeMirror
        const totalLines = this.htmlEditor.lineCount();
        for (let i = 0; i < totalLines; i++) {
            this.htmlEditor.indentLine(i);
        }
        
        this.ignoreUpdates = false;
        
        // Отправляем обновление другим пользователям
        socketService.updateHTML(this.htmlEditor.getValue());
    }

    formatCss(css) {
        // Простое форматирование CSS кода
        let formatted = '';
        const rules = css.split('}');
        
        for (let i = 0; i < rules.length; i++) {
            let rule = rules[i];
            if (rule.trim() === '') continue;
            
            // Форматируем селектор
            let parts = rule.split('{');
            let selector = parts[0].trim();
            let properties = parts[1] ? parts[1].trim() : '';
            
            formatted += selector + ' {\n';
            
            // Форматируем свойства
            if (properties) {
                let propList = properties.split(';');
                for (let j = 0; j < propList.length; j++) {
                    let prop = propList[j].trim();
                    if (prop === '') continue;
                    formatted += '  ' + prop + ';\n';
                }
            }
            
            formatted += '}\n\n';
        }
        
        // Устанавливаем отформатированный код
        this.ignoreUpdates = true;
        this.cssEditor.setValue(formatted.trim());
        this.ignoreUpdates = false;
        
        // Отправляем обновление другим пользователям
        socketService.updateCSS(this.cssEditor.getValue());
    }

    showNotification(message) {
        const notification = document.getElementById('success-notification');
        if (notification) {
            notification.textContent = message;
            notification.style.display = 'block';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 3000);
        }
    }

    showError(message) {
        const notification = document.getElementById('error-notification');
        notification.textContent = message;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    setupEditorIndicators() {
        // Настраиваем индикаторы последнего редактора
        this.lastHtmlEditorIndicator.textContent = '';
        this.lastCssEditorIndicator.textContent = '';
    }

    updateLastEditorIndicator(editorType, teamName) {
        if (editorType === 'html') {
            this.lastHtmlEditorIndicator.textContent = teamName || '';
        } else if (editorType === 'css') {
            this.lastCssEditorIndicator.textContent = teamName || '';
        }
    }

    setupInitOverlay() {
        if (this.initOverlay) {
            // Показываем оверлей инициализации
            this.initOverlay.style.display = 'flex';
            
            // Настраиваем видимость элементов в зависимости от роли
            if (this.isAdmin) {
                if (this.initButton) {
                    this.initButton.style.display = 'block';
                }
                if (this.onlineUsersElement) {
        this.onlineUsersElement.style.display = 'block';
                }
                this.updateInitStatus('Ожидаем подключения команд...', false);
            } else {
                if (this.initButton) {
                    this.initButton.style.display = 'none';
                }
                if (this.onlineUsersElement) {
                    this.onlineUsersElement.style.display = 'none';
                }
                this.updateInitStatus('Ожидаем запуска кода администратором...', true);
            }
        }
    }

    setupOnlineUsersListener() {
        // Отображаем начальное количество пользователей
        this.updateOnlineUsersCount(0);
    }

    updateOnlineUsersCount(count) {
        // Обновляем счетчик онлайн пользователей
        this.onlineUsersCount.textContent = count;
        this.onlineUsersCount.classList.add('updated');
        
        setTimeout(() => {
            this.onlineUsersCount.classList.remove('updated');
        }, 300);
    }

    updateInitStatus(message, showDots = true) {
        if (this.initStatus) {
            const dots = showDots ? '<div class="loading-dots"><span></span><span></span><span></span></div>' : '';
            this.initStatus.innerHTML = `${message}${dots}`;
        }
    }

    playInitAnimation() {
        // Проверяем, не инициализирован ли уже код
        if (!this.isInitialized) {
            // Отключаем кнопку если мы админ
            if (this.isAdmin && this.initButton) {
                this.initButton.disabled = true;
                this.initButton.style.transform = 'scale(0.9)';
            }

            // Обновляем статус
            this.updateInitStatus('Инициализация кода...', true);
            
            // Создаем частицы для всех пользователей
            this.createParticles();

            // Если мы админ, отправляем событие инициализации через 3 секунды
            if (this.isAdmin) {
                // Обновляем статус с обратным отсчетом
                let countdown = 3;
                const countdownInterval = setInterval(() => {
                    this.updateInitStatus(`Инициализация кода через ${countdown}...`, true);
                    countdown--;
                    if (countdown < 0) {
                        clearInterval(countdownInterval);
                        this.updateInitStatus('Отправка кода...', true);
                        
                        // Скрываем оверлей инициализации перед отправкой кода
                        if (this.initOverlay) {
                            this.initOverlay.style.opacity = '0';
                            this.initOverlay.style.pointerEvents = 'none';
                            setTimeout(() => {
                                this.initOverlay.style.display = 'none';
                            }, 500);
                        }
                        
                        // Отправляем код
                        socketService.initializeCode();
                    }
                }, 1000);
            }
        }
    }

    createParticles() {
        const container = document.querySelector('.init-animation-container');
        const startPoint = this.isAdmin ? this.initButton.getBoundingClientRect() : {
            left: window.innerWidth / 2,
            top: window.innerHeight / 2,
            width: 0,
            height: 0
        };
        const centerX = startPoint.left + startPoint.width / 2;
        const centerY = startPoint.top + startPoint.height / 2;
        
        // Создаем больше частиц с разными размерами и скоростями
        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.classList.add('particle');
            
            // Случайный размер от 5 до 20 пикселей
            const size = Math.random() * 15 + 5;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            
            // Случайное начальное положение вокруг центральной точки
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 50;
            const startX = centerX + Math.cos(angle) * distance;
            const startY = centerY + Math.sin(angle) * distance;
            
            particle.style.left = `${startX}px`;
            particle.style.top = `${startY}px`;
            
            // Случайная задержка анимации
            particle.style.animationDelay = `${Math.random() * 0.5}s`;
            
            // Случайная длительность анимации
            const duration = 1 + Math.random() * 1;
            particle.style.animationDuration = `${duration}s`;
            
            container.appendChild(particle);
            
            // Удаляем частицу после завершения анимации
            particle.addEventListener('animationend', () => {
                particle.remove();
            });
        }
        
        // Создаем вторую волну частиц с задержкой
        setTimeout(() => {
            for (let i = 0; i < 20; i++) {
                const particle = document.createElement('div');
                particle.classList.add('particle');
                
                const size = Math.random() * 10 + 3;
                particle.style.width = `${size}px`;
                particle.style.height = `${size}px`;
                
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * 30;
                const startX = centerX + Math.cos(angle) * distance;
                const startY = centerY + Math.sin(angle) * distance;
                
                particle.style.left = `${startX}px`;
                particle.style.top = `${startY}px`;
                particle.style.animationDelay = `${Math.random() * 0.3}s`;
                particle.style.animationDuration = `${0.8 + Math.random() * 0.4}s`;
                
                container.appendChild(particle);
                
                particle.addEventListener('animationend', () => {
                    particle.remove();
                });
            }
        }, 500);
    }

    initializeCodeWithAnimation() {
        // Этот метод теперь не нужен, так как вся логика перенесена в playInitAnimation
    }

    playTypeSound() {
        // Функция для воспроизведения звука печати (можно реализовать позже)
    }

    setupInitializationListener() {
        // Подписываемся на изменения состояния инициализации
        document.addEventListener('auth_success', (event) => {
            const { teamName, teamData } = event.detail;
            this.isAdmin = teamName === 'admin';
            
            if (this.isAdmin) {
                console.log('Пользователь авторизован как администратор');
                if (this.initButton) {
                    this.initButton.style.display = 'block';
                }
                if (this.onlineUsersElement) {
                    this.onlineUsersElement.style.display = 'block';
                }
                this.updateInitStatus('Ждем подключения пользователей...', false);
            } else {
                console.log('Пользователь авторизован как обычный пользователь');
                if (this.initButton) {
                    this.initButton.style.display = 'none';
                }
                if (this.onlineUsersElement) {
                    this.onlineUsersElement.style.display = 'none';
                }
                this.updateInitStatus('Ожидаем запуска кода администратором...', true);
            }
        });
    }

    createCodeFlowAnimation(startX, startY, endX, endY, type) {
        const container = document.querySelector('.init-animation-container');
        
        // Создаем SVG элемент для пути
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        
        // Создаем путь
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const controlX = (startX + endX) / 2;
        const controlY = startY - 100;
        
        path.setAttribute('d', `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`);
        path.setAttribute('stroke', type === 'html' ? '#ff79c6' : '#50fa7b');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.classList.add('code-path');
        
        svg.appendChild(path);
        container.appendChild(svg);
        
        // Создаем "частицы" кода
        const particlesCount = 5;
        for (let i = 0; i < particlesCount; i++) {
            const particle = document.createElement('div');
            particle.classList.add('code-particle');
            particle.style.position = 'absolute';
            particle.style.color = type === 'html' ? '#ff79c6' : '#50fa7b';
            particle.textContent = type === 'html' ? '<>' : '{}';
            
            // Рассчитываем позицию на пути
            const progress = i / (particlesCount - 1);
            const t = progress;
            const x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * controlX + t * t * endX;
            const y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * controlY + t * t * endY;
            
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;
            
            container.appendChild(particle);
            
            // Удаляем частицу после анимации
            particle.addEventListener('animationend', () => {
                particle.remove();
            });
        }
        
        // Удаляем SVG после завершения анимации
        setTimeout(() => {
            svg.remove();
        }, 2000);
    }

    setEditorsReadOnly(readonly) {
        if (this.htmlEditor) {
            this.htmlEditor.setOption('readOnly', readonly);
            if (readonly) {
                this.htmlEditor.getWrapperElement().classList.add('readonly');
            } else {
                this.htmlEditor.getWrapperElement().classList.remove('readonly');
            }
        }
        
        if (this.cssEditor) {
            this.cssEditor.setOption('readOnly', readonly);
            if (readonly) {
                this.cssEditor.getWrapperElement().classList.add('readonly');
                } else {
                this.cssEditor.getWrapperElement().classList.remove('readonly');
            }
        }
    }

    finishInitialization() {
        this.isInitialized = true;
        
        // Активируем редакторы
        this.setEditorsReadOnly(false);
        
        // Запускаем код
        this.run();
        
        // Скрываем оверлей с анимацией
        if (this.initOverlay) {
                    this.initOverlay.style.opacity = '0';
            this.initOverlay.style.pointerEvents = 'none';
                    setTimeout(() => {
                        this.initOverlay.style.display = 'none';
                    }, 800);
        }
    }

    // Новый метод для синхронизации изменений
    syncChanges(editorType) {
        if (!this.editorsDirty[editorType]) return;

        if (editorType === 'html') {
            const htmlCode = this.htmlEditor.getValue();
            socketService.updateHTML(htmlCode);
            this.updateLastEditorIndicator('html', this.teamName);
            this.editorsDirty.html = false;
        } else if (editorType === 'css') {
            const cssCode = this.cssEditor.getValue();
            socketService.updateCSS(cssCode);
            this.updateLastEditorIndicator('css', this.teamName);
            this.editorsDirty.css = false;
        }

        this.showNotification(`${editorType.toUpperCase()} код синхронизирован`);
    }

    // Новые методы для управления состоянием редактирования
    startEditing(editorType) {
        this.isEditing[editorType] = true;
        this.showEditingIndicator(editorType);
    }

    resetEditingTimer(editorType) {
        if (this.editingTimer[editorType]) {
            clearTimeout(this.editingTimer[editorType]);
        }

        this.editingTimer[editorType] = setTimeout(() => {
            if (this.isEditing[editorType] && this.editorsDirty[editorType]) {
                this.finishEditing(editorType);
            }
        }, this.inactivityTimeout);
    }

    finishEditing(editorType) {
        this.isEditing[editorType] = false;
        this.hideEditingIndicator(editorType);
        
        // Синхронизируем наши изменения
        this.syncChanges(editorType);
        
        // Применяем отложенные обновления, если они есть
        if (this.pendingUpdates[editorType]) {
            const { code, teamName } = this.pendingUpdates[editorType];
            this.ignoreUpdates = true;
            if (editorType === 'html') {
                this.htmlEditor.setValue(code);
            } else {
                this.cssEditor.setValue(code);
            }
            this.ignoreUpdates = false;
            this.updateLastEditorIndicator(editorType, teamName);
            this.pendingUpdates[editorType] = null;
            this.run();
        }
    }

    showEditingIndicator(editorType) {
        const indicator = editorType === 'html' ? 
            this.lastHtmlEditorIndicator : 
            this.lastCssEditorIndicator;
        
        indicator.textContent = `${this.teamName} (редактирует...)`;
        indicator.classList.add('editing');
    }

    hideEditingIndicator(editorType) {
        const indicator = editorType === 'html' ? 
            this.lastHtmlEditorIndicator : 
            this.lastCssEditorIndicator;
        
        indicator.textContent = this.teamName;
        indicator.classList.remove('editing');
    }

    // Новый метод для анимации печати кода
    typeCodeAnimation() {
        try {
            if (!this.htmlEditor || !this.cssEditor) {
                console.error('Editors not initialized');
                return;
            }
            
            // Скрываем оверлей инициализации перед началом анимации
            if (this.initOverlay) {
                this.initOverlay.style.opacity = '0';
                this.initOverlay.style.pointerEvents = 'none';
                setTimeout(() => {
                    this.initOverlay.style.display = 'none';
                }, 500);
            }
            
            // Устанавливаем редакторы в режим только для чтения
            this.setEditorsReadOnly(true);
            
            // Создаем элементы для анимации печати поверх редакторов
            const htmlWrapper = this.htmlEditor.getWrapperElement();
            const cssWrapper = this.cssEditor.getWrapperElement();
            
            const htmlAnimationOverlay = document.createElement('div');
            htmlAnimationOverlay.className = 'animation-overlay CodeMirror cm-s-dracula';
            htmlAnimationOverlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: #282a36;
                z-index: 1000;
                font-family: monospace;
                color: #f8f8f2;
                padding: 10px;
                white-space: pre;
                overflow: auto;
                font-size: 14px;
                line-height: 1.5;
            `;
            
            const cssAnimationOverlay = htmlAnimationOverlay.cloneNode(true);
            
            htmlWrapper.appendChild(htmlAnimationOverlay);
            cssWrapper.appendChild(cssAnimationOverlay);
            
            // Функция для анимации появления текста с подсветкой синтаксиса
            const animateText = (overlay, text, isHTML, callback) => {
                let currentText = '';
                let currentIndex = 0;
                const chunkSize = 3; // Увеличиваем размер чанка для более быстрой печати
                
                const highlightHTML = (text) => {
                    let highlighted = text;
                    
                    // Заменяем < и > на HTML-сущности
                    highlighted = highlighted
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    
                    // Подсвечиваем HTML-комментарии
                    highlighted = highlighted.replace(
                        /(&lt;!--[\s\S]*?--&gt;)/g,
                        '<span class="cm-comment">$1</span>'
                    );
                    
                    // Подсвечиваем теги с атрибутами
                    highlighted = highlighted.replace(
                        /(&lt;\/?)([a-zA-Z0-9-]+)([^&]*?)(&gt;)/g,
                        (match, start, tag, attrs, end) => {
                            let result = '<span class="cm-tag">' + start + tag + '</span>';
                            
                            // Подсвечиваем атрибуты
                            if (attrs) {
                                result += attrs.replace(
                                    /\s+([a-zA-Z-]+)(="[^"]*")?/g,
                                    (match, attr, value) => {
                                        if (value) {
                                            return ' <span class="cm-attribute">' + attr + '</span>=' +
                                                   '<span class="cm-string">' + value + '</span>';
                                        }
                                        return ' <span class="cm-attribute">' + attr + '</span>';
                                    }
                                );
                            }
                            
                            result += '<span class="cm-tag">' + end + '</span>';
                            return result;
                        }
                    );
                    
                    return highlighted;
                };
                
                const highlightCSS = (text) => {
                    return text
                        .replace(/([{};])/g, '<span class="cm-punctuation">$1</span>')
                        .replace(/([a-z-]+):/g, '<span class="cm-property">$1</span>:')
                        .replace(/(#[a-f0-9]{3,6})/gi, '<span class="cm-atom">$1</span>')
                        .replace(/(\d+(?:px|em|rem|%|vh|vw))/g, '<span class="cm-number">$1</span>')
                        .replace(/\/\*[\s\S]*?\*\//g, '<span class="cm-comment">$&</span>');
                };
                
                const typeChunk = () => {
                    if (currentIndex < text.length) {
                        // Добавляем следующий чанк текста
                        const nextChunk = text.slice(currentIndex, currentIndex + chunkSize);
                        currentText += nextChunk;
                        
                        // Применяем подсветку синтаксиса
                        const highlightedText = isHTML ? 
                            highlightHTML(currentText) :
                            highlightCSS(currentText);
                            
                        // Добавляем мигающий курсор
                        overlay.innerHTML = highlightedText + '<span class="typing-cursor">|</span>';
                        overlay.scrollTop = overlay.scrollHeight;
                        
                        currentIndex += chunkSize;
                        
                        // Используем requestAnimationFrame для более плавной анимации
                        requestAnimationFrame(() => {
                            setTimeout(typeChunk, 1); // Уменьшаем задержку для более быстрой печати
                        });
                    } else {
                        // Плавно скрываем оверлей анимации
                        overlay.style.transition = 'opacity 0.3s';
                        overlay.style.opacity = '0';
                        
                        setTimeout(() => {
                            overlay.remove();
                            if (callback) callback();
                        }, 300);
                    }
                };
                
                // Добавляем стили для мигающего курсора
                const style = document.createElement('style');
                style.textContent = `
                    .typing-cursor {
                        animation: blink 0.7s infinite;
                        color: #ff79c6;
                        font-weight: bold;
                    }
                    @keyframes blink {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
                
                typeChunk();
            };
            
            // Запускаем анимацию для HTML, затем для CSS
            animateText(htmlAnimationOverlay, this.codeData.html, true, () => {
                // После анимации HTML устанавливаем правильный код
                this.htmlEditor.setValue(this.codeData.html);
                
                animateText(cssAnimationOverlay, this.codeData.css, false, () => {
                    // После анимации CSS устанавливаем правильный код
                    this.cssEditor.setValue(this.codeData.css);
                    
                    // После завершения всех анимаций
                    this.showNotification('Код инициализирован');
                    this.setEditorsReadOnly(false);
                    this.finishInitialization();
                });
            });
            
        } catch (error) {
            console.error('Error in typeCodeAnimation:', error);
            this.showError('Ошибка при инициализации кода');
        }
    }

    // Метод для анимации печати текста
    typeText(editor, text, callback) {
        try {
            let currentIndex = 0;
            const typingSpeed = 5; // Скорость печати (мс)
            const chunkSize = 1; // Количество символов для печати за раз
            
            const typeChunk = () => {
                if (currentIndex < text.length) {
                    // Получаем текущий текст
                    const currentText = editor.getValue();
                    
                    // Добавляем следующий кусок текста
                    const nextChunk = text.slice(currentIndex, currentIndex + chunkSize);
                    editor.setValue(currentText + nextChunk);
                    
                    // Подсвечиваем текущий символ
                    const lastLine = editor.lastLine();
                    const lastChar = editor.getLine(lastLine).length;
                    editor.setCursor({ line: lastLine, ch: lastChar });
                    
                    // Прокручиваем к последней строке плавно
                    editor.scrollIntoView({ line: lastLine, ch: lastChar }, 50);
                    
                    currentIndex += chunkSize;
                    
                    // Используем requestAnimationFrame для более плавной анимации
                    requestAnimationFrame(() => {
                        setTimeout(typeChunk, typingSpeed);
                    });
                } else {
                    if (callback) callback();
                }
            };
            
            typeChunk();
        } catch (error) {
            console.error('Error in typeText:', error);
            if (callback) callback();
        }
    }

    /**
     * Переключает полноэкранный режим для указанного редактора
     * @param {string} editorType - Тип редактора ('html' или 'css')
     */
    toggleFullscreen(editorType) {
        try {
            console.log(`toggleFullscreen called for ${editorType}`);
            
            const container = editorType === 'html' 
                ? document.getElementById('html-editor-container')
                : document.getElementById('css-editor-container');
                
            if (!container) {
                console.error(`Container not found for ${editorType}`);
                return;
            }
            console.log(`Container found: ${container.id}`);
            
            const button = editorType === 'html'
                ? document.getElementById('html-fullscreen-btn')
                : document.getElementById('css-fullscreen-btn');
                
            if (!button) {
                console.error(`Button not found for ${editorType}`);
                return;
            }
            
            const icon = button.querySelector('i');
            
            // Получаем контейнер для результата
            const resultContainer = document.getElementById('fullscreen-result');
            if (!resultContainer) {
                console.error('Result container not found');
                return;
            }
            
            const fullscreenOutput = document.getElementById('fullscreen-output');
            if (!fullscreenOutput) {
                console.error('Fullscreen output iframe not found');
                return;
            }
            
            // Проверяем, находится ли редактор в полноэкранном режиме
            const isFullscreen = container.classList.contains('fullscreen-mode');
            console.log(`Current fullscreen state: ${isFullscreen}`);
            
            if (isFullscreen) {
                // Выходим из полноэкранного режима
                console.log('Exiting fullscreen mode');
                container.classList.remove('fullscreen-mode');
                document.body.classList.remove('fullscreen-active');
                icon.className = 'fas fa-expand';
                button.title = 'Полноэкранный режим';
                
                // Скрываем контейнер результата
                resultContainer.style.display = 'none';
                
                // Обновляем размеры редакторов
                this.setEditorsSize();
                
                // Обновляем редактор после изменения размера
                if (editorType === 'html' && this.htmlEditor) {
                    this.htmlEditor.refresh();
                } else if (editorType === 'css' && this.cssEditor) {
                    this.cssEditor.refresh();
                }
            } else {
                // Выходим из полноэкранного режима для всех редакторов
                console.log('Entering fullscreen mode');
                this.exitFullscreen();
                
                // Входим в полноэкранный режим для выбранного редактора
                container.classList.add('fullscreen-mode');
                document.body.classList.add('fullscreen-active');
                icon.className = 'fas fa-compress';
                button.title = 'Выйти из полноэкранного режима';
                
                // Показываем контейнер результата и обновляем содержимое
                console.log('Showing result container');
                resultContainer.style.display = 'block';
                
                // Обновляем содержимое iframe с результатом
                const htmlCode = this.htmlEditor ? this.htmlEditor.getValue() : '';
                const cssCode = this.cssEditor ? this.cssEditor.getValue() : '';
                
                const fullCode = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>${cssCode}</style>
                    </head>
                    <body>${htmlCode}</body>
                    </html>
                `;
                
                console.log('Updating fullscreen output');
                fullscreenOutput.srcdoc = fullCode;
                
                // Обновляем редактор после изменения размера
                if (editorType === 'html' && this.htmlEditor) {
                    this.htmlEditor.refresh();
                } else if (editorType === 'css' && this.cssEditor) {
                    this.cssEditor.refresh();
                }
                
                // Фокусируемся на редакторе
                if (editorType === 'html' && this.htmlEditor) {
                    this.htmlEditor.focus();
                } else if (editorType === 'css' && this.cssEditor) {
                    this.cssEditor.focus();
                }
            }
            
            // Сохраняем текущий полноэкранный редактор
            this.fullscreenEditor = isFullscreen ? null : editorType;
            console.log(`Fullscreen editor set to: ${this.fullscreenEditor}`);
            
        } catch (error) {
            console.error('Ошибка при переключении полноэкранного режима:', error);
            this.showError('Не удалось переключить полноэкранный режим');
        }
    }
    
    /**
     * Выходит из полноэкранного режима для всех редакторов
     */
    exitFullscreen() {
        try {
            const containers = document.querySelectorAll('.div-codemirror.fullscreen-mode');
            if (containers.length === 0) return;
            
            containers.forEach(container => {
                container.classList.remove('fullscreen-mode');
                const button = container.querySelector('.fullscreen-btn');
                if (button) {
                    const icon = button.querySelector('i');
                    if (icon) {
                        icon.className = 'fas fa-expand';
                    }
                    button.title = 'Полноэкранный режим';
                }
            });
            
            // Скрываем контейнер результата
            const resultContainer = document.getElementById('fullscreen-result');
            if (resultContainer) {
                resultContainer.style.display = 'none';
            }
            
            // Убираем класс с body
            document.body.classList.remove('fullscreen-active');
            
            // Обновляем размеры редакторов
            this.setEditorsSize();
            
            // Обновляем оба редактора после изменения размера
            if (this.htmlEditor) {
                this.htmlEditor.refresh();
            }
            
            if (this.cssEditor) {
                this.cssEditor.refresh();
            }
            
            // Сбрасываем текущий полноэкранный редактор
            this.fullscreenEditor = null;
            
        } catch (error) {
            console.error('Ошибка при выходе из полноэкранного режима:', error);
        }
    }

    /**
     * Обновляет содержимое iframe в полноэкранном режиме
     */
    updateFullscreenResult() {
        try {
            // Проверяем, активен ли полноэкранный режим
            if (!this.fullscreenEditor) return;
            
            const fullscreenOutput = document.getElementById('fullscreen-output');
            if (!fullscreenOutput) return;
            
            const htmlCode = this.htmlEditor ? this.htmlEditor.getValue() : '';
            const cssCode = this.cssEditor ? this.cssEditor.getValue() : '';
            
            const fullCode = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>${cssCode}</style>
                </head>
                <body>${htmlCode}</body>
                </html>
            `;
            
            fullscreenOutput.srcdoc = fullCode;
            
        } catch (error) {
            console.error('Ошибка при обновлении полноэкранного результата:', error);
        }
    }
}

// Инициализация редактора при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    // Создаем экземпляр редактора кода
    window.codeEditor = new CodeEditor();
});

// Экспортируем для возможности использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CodeEditor };
}