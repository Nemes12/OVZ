/**
 * Класс для управления стилями на клиенте
 */
export class StyleManager {
    /**
     * Конструктор класса StyleManager
     * @param {SocketService} socketService - Экземпляр сервиса сокетов
     */
    constructor(socketService) {
        this.socketService = socketService;
        this.currentStyles = null;

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

        // Инициализация
        this._init();
    }

    /**
     * Инициализация менеджера стилей
     * @private
     */
    _init() {
        // Загружаем стили из localStorage или используем значения по умолчанию
        this._loadStyles();

        // Подписываемся на событие обновления стилей
        if (this.socketService) {
            this.socketService.onStylesUpdated(data => {
                this._handleStylesUpdated(data);
            });
        }

        // Применяем текущие стили
        this._applyStyles();
    }

    /**
     * Загрузка стилей из localStorage
     * @private
     */
    _loadStyles() {
        try {
            const savedStyles = localStorage.getItem('customStyles');
            this.currentStyles = savedStyles ? JSON.parse(savedStyles) : { ...this.defaultStyles };
        } catch (error) {
            console.error('Ошибка при загрузке стилей:', error);
            this.currentStyles = { ...this.defaultStyles };
        }
    }

    /**
     * Сохранение стилей в localStorage
     * @private
     */
    _saveStyles() {
        try {
            localStorage.setItem('customStyles', JSON.stringify(this.currentStyles));
        } catch (error) {
            console.error('Ошибка при сохранении стилей:', error);
        }
    }

    /**
     * Обработчик события обновления стилей
     * @param {Object} data - Данные о стилях
     * @private
     */
    _handleStylesUpdated(data) {
        if (data && data.styles) {
            this.currentStyles = data.styles;
            this._saveStyles();
            this._applyStyles();
        }
    }

    /**
     * Применение стилей к документу
     * @private
     */
    _applyStyles() {
        if (!this.currentStyles) return;

        // Создаем или обновляем элемент стилей
        let styleElement = document.getElementById('custom-styles');

        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = 'custom-styles';
            document.head.appendChild(styleElement);
        }

        // Генерируем CSS
        const css = this._generateCss();

        // Применяем CSS
        styleElement.textContent = css;
    }

    /**
     * Генерация CSS на основе текущих стилей
     * @returns {string} CSS-код
     * @private
     */
    _generateCss() {
        // Получаем значение яркости и черно-белого режима в процентах
        console.log('Current styles:', this.currentStyles);
        const brightness = parseInt(this.currentStyles.brightness || 100) / 100;
        const grayscale = parseInt(this.currentStyles.grayscale || 0) / 100;
        console.log('Brightness:', brightness, 'Grayscale:', grayscale);

        return `
            :root {
                --bg-color: ${this.currentStyles.bgColor};
                --bg-color-rgb: ${this._hexToRgb(this.currentStyles.bgColor)};
                --accent-color: ${this.currentStyles.accentColor};
                --button-color: ${this.currentStyles.accentColor};
                --button-hover-color: ${this._getLighterColor(this.currentStyles.accentColor, 10)};
                --font-size-base: ${this.currentStyles.fontSizeBase}px;
                --font-size-small: ${this.currentStyles.fontSizeSmall}px;
                --font-size-large: ${this.currentStyles.fontSizeLarge}px;
                --grayscale: ${grayscale};
                --brightness: ${brightness};
            }

            html, body, .app-container, .preview-container, div.container {
                filter: brightness(${brightness}) grayscale(${grayscale}) !important;
            }

            .editor-header {
                height: ${this.currentStyles.editorHeaderHeight}px;
            }

            .monaco-editor .view-lines {
                font-size: ${this.currentStyles.editorFontSize}px !important;
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
     * Получение текущих стилей
     * @returns {Object} Объект с текущими стилями
     */
    getStyles() {
        return { ...this.currentStyles };
    }

    /**
     * Сброс стилей к значениям по умолчанию
     */
    resetStyles() {
        this.currentStyles = { ...this.defaultStyles };
        this._saveStyles();
        this._applyStyles();
    }
}

export default StyleManager;
