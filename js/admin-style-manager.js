/**
 * Класс для управления стилями в админ-панели
 */
class StyleManager {
    /**
     * Конструктор класса StyleManager
     */
    constructor() {
        // Значения стилей по умолчанию
        this.defaultStyles = {
            accentColor: '#bd93f9',
            bgColor: '#f8f5ff',
            brightness: '100',
            grayscale: '0',
            fontSizeBase: '25',
            fontSizeSmall: '22',
            fontSizeLarge: '30',
            editorFontSize: '24',
            editorHeaderHeight: '90'
        };

        // Текущие стили
        this.currentStyles = this._loadStyles() || { ...this.defaultStyles };

        // Элементы DOM
        this.previewModal = document.getElementById('previewModal');
        this.previewIframe = document.getElementById('previewIframe');
        this.previewClose = document.getElementById('previewClose');
        this.previewCancel = document.getElementById('previewCancel');
        this.previewApply = document.getElementById('previewApply');
        this.resetStylesButton = document.getElementById('resetStylesButton');
        this.resultMessage = document.getElementById('resultMessage');

        // Временные стили для предпросмотра
        this.previewStyles = null;

        // Инициализация
        this._initInputs();
        this._initEventListeners();
    }

    /**
     * Инициализация полей ввода значениями из текущих стилей
     * @private
     */
    _initInputs() {
        // Устанавливаем значения в поля ввода
        Object.keys(this.currentStyles).forEach(key => {
            const input = document.getElementById(key);
            if (input) {
                input.value = this.currentStyles[key];
            }
        });
    }

    /**
     * Инициализация обработчиков событий
     * @private
     */
    _initEventListeners() {
        // Обработчики для кнопок предпросмотра
        const previewButtons = document.querySelectorAll('.preview-button');
        previewButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const styleKey = e.target.dataset.style;
                const input = document.getElementById(styleKey);
                if (input) {
                    this._showPreview({ [styleKey]: input.value });
                }
            });
        });

        // Обработчик для ползунка яркости
        const brightnessSlider = document.getElementById('brightness');
        const brightnessValue = document.getElementById('brightnessValue');

        if (brightnessSlider && brightnessValue) {
            // Устанавливаем начальное значение
            brightnessValue.textContent = `${brightnessSlider.value}%`;

            // Обработчик изменения значения
            brightnessSlider.addEventListener('input', () => {
                brightnessValue.textContent = `${brightnessSlider.value}%`;
            });
        }

        // Обработчик для ползунка черно-белого режима
        const grayscaleSlider = document.getElementById('grayscale');
        const grayscaleValue = document.getElementById('grayscaleValue');

        if (grayscaleSlider && grayscaleValue) {
            // Устанавливаем начальное значение
            grayscaleValue.textContent = `${grayscaleSlider.value}%`;

            // Обработчик изменения значения
            grayscaleSlider.addEventListener('input', () => {
                grayscaleValue.textContent = `${grayscaleSlider.value}%`;
            });
        }

        // Обработчик для закрытия модального окна
        if (this.previewClose) {
            this.previewClose.addEventListener('click', () => {
                this._closePreview();
            });
        }

        // Обработчик для отмены изменений
        if (this.previewCancel) {
            this.previewCancel.addEventListener('click', () => {
                this._closePreview();
            });
        }

        // Обработчик для применения изменений
        if (this.previewApply) {
            this.previewApply.addEventListener('click', () => {
                this._applyPreviewStyles();
            });
        }

        // Обработчик для сброса стилей
        if (this.resetStylesButton) {
            this.resetStylesButton.addEventListener('click', () => {
                this._resetStyles();
            });
        }
    }

    /**
     * Загрузка стилей из localStorage
     * @returns {Object|null} Объект со стилями или null
     * @private
     */
    _loadStyles() {
        try {
            const savedStyles = localStorage.getItem('customStyles');
            return savedStyles ? JSON.parse(savedStyles) : null;
        } catch (error) {
            console.error('Ошибка при загрузке стилей:', error);
            return null;
        }
    }

    /**
     * Сохранение стилей в localStorage
     * @param {Object} styles Объект со стилями
     * @private
     */
    _saveStyles(styles) {
        try {
            localStorage.setItem('customStyles', JSON.stringify(styles));
        } catch (error) {
            console.error('Ошибка при сохранении стилей:', error);
        }
    }

    /**
     * Показ модального окна предпросмотра
     * @param {Object} styles Объект с изменяемыми стилями
     * @private
     */
    _showPreview(styles) {
        // Сохраняем текущие стили для предпросмотра
        this.previewStyles = { ...this.currentStyles, ...styles };

        // Определяем тип предпросмотра в зависимости от изменяемого стиля
        const styleKey = Object.keys(styles)[0];
        let previewUrl = '/';
        let previewDescription = 'Ниже показан предпросмотр внешнего вида редактора с примененными изменениями.';

        // Настраиваем предпросмотр в зависимости от типа стиля
        switch (styleKey) {
            case 'accentColor':
                previewUrl = '/preview-editor.html';
                previewDescription = 'Предпросмотр страницы с редакторами с измененным основным цветом акцента.';
                break;
            case 'buttonColor':
                previewUrl = '/preview-buttons.html';
                previewDescription = 'Предпросмотр кнопок "Войти" и "Назад" с измененным цветом.';
                break;
            case 'bgColor':
                previewUrl = '/preview-editor.html';
                previewDescription = 'Предпросмотр страницы с редакторами с измененным цветом фона.';
                break;
            case 'brightness':
                previewUrl = '/preview-editor.html';
                previewDescription = 'Предпросмотр страницы с измененной яркостью интерфейса.';
                break;
            case 'fontSizeBase':
            case 'fontSizeSmall':
            case 'fontSizeLarge':
                previewUrl = '/preview-text.html';
                previewDescription = 'Предпросмотр текста с измененными размерами шрифтов.';
                break;
            case 'editorFontSize':
                previewUrl = '/preview-editor.html';
                previewDescription = 'Предпросмотр редактора кода с измененным размером шрифта.';
                break;
            case 'editorHeaderHeight':
                previewUrl = '/preview-header.html';
                previewDescription = 'Предпросмотр заголовка редактора с измененной высотой.';
                break;
        }

        // Обновляем описание предпросмотра
        const previewDescriptionElement = document.querySelector('.preview-description');
        if (previewDescriptionElement) {
            previewDescriptionElement.textContent = previewDescription;
        }

        // Генерируем CSS для предпросмотра
        const previewCss = this._generateCss(this.previewStyles);

        // Открываем модальное окно
        if (this.previewModal) {
            this.previewModal.classList.add('show');
        }

        // Загружаем iframe с нужным URL
        if (this.previewIframe) {
            // Устанавливаем URL для предпросмотра
            this.previewIframe.src = previewUrl;

            this.previewIframe.onload = () => {
                // Применяем стили сразу после загрузки
                this._applyStylesToIframe(this.previewIframe, previewCss);

                // Дополнительная проверка через небольшой промежуток времени
                setTimeout(() => {
                    this._applyStylesToIframe(this.previewIframe, previewCss);
                }, 100);
            };
        }
    }

    /**
     * Закрытие модального окна предпросмотра
     * @private
     */
    _closePreview() {
        if (this.previewModal) {
            this.previewModal.classList.remove('show');
        }

        // Сбрасываем временные стили
        this.previewStyles = null;
    }

    /**
     * Применение стилей предпросмотра
     * @private
     */
    _applyPreviewStyles() {
        if (this.previewStyles) {
            // Обновляем текущие стили
            this.currentStyles = { ...this.previewStyles };

            // Сохраняем стили
            this._saveStyles(this.currentStyles);

            // Обновляем значения в полях ввода
            this._initInputs();

            // В админ-панели не применяем стили к самой странице
            // Стили будут применены на основной странице при загрузке

            // Отправляем запрос на сервер для сохранения стилей
            this._saveStylesToServer();

            // Закрываем модальное окно
            this._closePreview();

            // Показываем сообщение об успешном сохранении
            this._showResultMessage('Стили успешно сохранены', 'success');
        }
    }

    /**
     * Сброс стилей к значениям по умолчанию
     * @private
     */
    _resetStyles() {
        // Запрашиваем подтверждение
        if (confirm('Вы уверены, что хотите сбросить все стили к значениям по умолчанию?')) {
            // Сбрасываем текущие стили
            this.currentStyles = { ...this.defaultStyles };

            // Сохраняем стили
            this._saveStyles(this.currentStyles);

            // Обновляем значения в полях ввода
            this._initInputs();

            // Отправляем запрос на сервер для сброса стилей
            this._resetStylesToServer();

            // Показываем сообщение об успешном сбросе
            this._showResultMessage('Стили успешно сброшены к значениям по умолчанию', 'success');
        }
    }

    /**
     * Генерация CSS на основе объекта стилей
     * @param {Object} styles Объект со стилями
     * @returns {string} CSS-код
     * @private
     */
    _generateCss(styles) {
        // Получаем значение яркости и черно-белого режима в процентах
        console.log('Admin styles:', styles);
        const brightness = parseInt(styles.brightness || 100) / 100;
        const grayscale = parseInt(styles.grayscale || 0) / 100;
        console.log('Admin brightness:', brightness, 'Admin grayscale:', grayscale);

        return `
            :root {
                --bg-color: ${styles.bgColor};
                --bg-color-rgb: ${this._hexToRgb(styles.bgColor)};
                --accent-color: ${styles.accentColor};
                --button-color: ${styles.accentColor};
                --button-hover-color: ${this._getLighterColor(styles.accentColor, 10)};
                --font-size-base: ${styles.fontSizeBase}px;
                --font-size-small: ${styles.fontSizeSmall}px;
                --font-size-large: ${styles.fontSizeLarge}px;
                --editorFontSize: ${styles.editorFontSize}px;
                --editorHeaderHeight: ${styles.editorHeaderHeight}px;
                --grayscale: ${grayscale};
            }

            /* Применяем фон ко всем возможным контейнерам */
            html, body, .app-container, .preview-container, div.container {
                background-color: ${styles.bgColor} !important;
            }

            body {
                filter: brightness(${brightness}) grayscale(${grayscale}) !important;
            }

            /* Применяем цвет кнопок */
            .button, button {
                background-color: var(--button-color) !important;
            }

            .button:hover, button:hover {
                background-color: var(--button-hover-color) !important;
            }

            /* Применяем цвет заголовка редактора */
            .editor-header {
                background-color: var(--accent-color) !important;
                height: ${styles.editorHeaderHeight}px !important;
            }

            /* Применяем размер шрифта в редакторе */
            .monaco-editor .view-lines, .editor-content, .editor-content * {
                font-size: ${styles.editorFontSize}px !important;
            }
        `;
    }

    /**
     * Преобразование HEX цвета в RGB формат
     * @param {string} hexColor Цвет в формате HEX
     * @returns {string} Строка в формате "r, g, b"
     * @private
     */
    _hexToRgb(hexColor) {
        // Удаляем # если он есть
        hexColor = hexColor.replace('#', '');

        // Преобразуем в RGB
        const r = parseInt(hexColor.substr(0, 2), 16);
        const g = parseInt(hexColor.substr(2, 2), 16);
        const b = parseInt(hexColor.substr(4, 2), 16);

        return `${r}, ${g}, ${b}`;
    }

    /**
     * Получение более светлого цвета на основе исходного
     * @param {string} hexColor Исходный цвет в формате HEX
     * @param {number} percent Процент осветления
     * @returns {string} Осветленный цвет в формате HEX
     * @private
     */
    _getLighterColor(hexColor, percent) {
        // Удаляем # если он есть
        hexColor = hexColor.replace('#', '');

        // Преобразуем в RGB
        let r = parseInt(hexColor.substr(0, 2), 16);
        let g = parseInt(hexColor.substr(2, 2), 16);
        let b = parseInt(hexColor.substr(4, 2), 16);

        // Осветляем каждый канал
        r = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
        g = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
        b = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));

        // Преобразуем обратно в HEX
        const rHex = r.toString(16).padStart(2, '0');
        const gHex = g.toString(16).padStart(2, '0');
        const bHex = b.toString(16).padStart(2, '0');

        return `#${rHex}${gHex}${bHex}`;
    }

    /**
     * Применение стилей к iframe
     * @param {HTMLIFrameElement} iframe Элемент iframe
     * @param {string} css CSS-код
     * @private
     */
    _applyStylesToIframe(iframe, css) {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

            // Проверяем, существует ли уже элемент стилей
            let styleElement = iframeDoc.getElementById('custom-admin-styles');

            if (!styleElement) {
                // Создаем новый элемент стилей
                styleElement = iframeDoc.createElement('style');
                styleElement.id = 'custom-admin-styles';
                iframeDoc.head.appendChild(styleElement);
            }

            // Извлекаем цвет фона и другие параметры из CSS
            const bgColorMatch = css.match(/--bg-color:\s*([^;]+);/);
            const bgColor = bgColorMatch ? bgColorMatch[1].trim() : '#f8f5ff';
            const bgColorRgb = this._hexToRgb(bgColor);
            const lighterBgColor = this._getLighterColor(bgColor, 20);

            // Извлекаем значение grayscale из CSS
            const grayscaleMatch = css.match(/grayscale\(([^)]+)\)/);
            const grayscale = grayscaleMatch ? grayscaleMatch[1].trim() : '0';

            // Извлекаем значение brightness из CSS
            const brightnessMatch = css.match(/brightness\(([^)]+)\)/);
            const brightness = brightnessMatch ? brightnessMatch[1].trim() : '1';

            // Добавляем дополнительные правила для гарантии применения стилей
            const enhancedCss = css + `
                /* Дополнительные правила для предпросмотра */
                :root {
                    --bg-color-rgb: ${bgColorRgb};
                    --grayscale: ${grayscale};
                    --brightness: ${brightness};
                }
                html, body, .app-container, .preview-container, div.container {
                    background-color: ${bgColor} !important;
                }

                body {
                    filter: brightness(${brightness}) grayscale(${grayscale}) !important;
                }
                .button, button { background-color: var(--accent-color, #bd93f9) !important; }
                .button:hover, button:hover { background-color: var(--button-hover-color, #bd93f9) !important; }
                .editor-header { background-color: var(--accent-color, #bd93f9) !important; }
                .monaco-editor .view-lines, .editor-content, .editor-content * { font-size: var(--editorFontSize, 24px) !important; }
            `;

            // Устанавливаем CSS
            styleElement.textContent = enhancedCss;
        } catch (error) {
            console.error('Ошибка при применении стилей к iframe:', error);
        }
    }

    /**
     * Сохранение стилей на сервере
     * @private
     */
    _saveStylesToServer() {
        console.log('Saving styles to server:', this.currentStyles);
        fetch('/api/save-styles', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(this.currentStyles)
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                console.error('Ошибка при сохранении стилей на сервере:', data.message);
                this._showResultMessage('Ошибка при сохранении стилей на сервере', 'error');
            }
        })
        .catch(error => {
            console.error('Ошибка при отправке запроса:', error);
            this._showResultMessage('Ошибка соединения с сервером', 'error');
        });
    }

    /**
     * Сброс стилей на сервере
     * @private
     */
    _resetStylesToServer() {
        fetch('/api/reset-styles', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                console.error('Ошибка при сбросе стилей на сервере:', data.message);
                this._showResultMessage('Ошибка при сбросе стилей на сервере', 'error');
            }
        })
        .catch(error => {
            console.error('Ошибка при отправке запроса:', error);
            this._showResultMessage('Ошибка соединения с сервером', 'error');
        });
    }

    /**
     * Показ сообщения о результате операции
     * @param {string} message Текст сообщения
     * @param {string} type Тип сообщения ('success' или 'error')
     * @private
     */
    _showResultMessage(message, type) {
        if (this.resultMessage) {
            this.resultMessage.textContent = message;
            this.resultMessage.className = `result-message ${type}`;
            this.resultMessage.style.display = 'block';

            // Скрываем сообщение через 3 секунды
            setTimeout(() => {
                this.resultMessage.style.display = 'none';
            }, 3000);
        }
    }
}

// Инициализация менеджера стилей при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    const styleManager = new StyleManager();
});
