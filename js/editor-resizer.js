/**
 * Класс для управления изменением размеров редакторов
 */
export class EditorResizer {
    /**
     * Конструктор класса EditorResizer
     */
    constructor() {
        this.htmlEditor = document.getElementById('html-editor-container');
        this.cssEditor = document.getElementById('css-editor-container');
        this.resizer = document.getElementById('editor-resizer');
        this.isDragging = false;
        this.startY = 0;
        this.startHeightHtml = 0;
        this.startHeightCss = 0;
        this.leftContainer = document.querySelector('.left');
        this.totalHeight = 0;
        
        // Инициализация обработчиков событий
        this._initEventListeners();
        
        console.log('EditorResizer инициализирован');
    }
    
    /**
     * Инициализация обработчиков событий
     * @private
     */
    _initEventListeners() {
        if (!this.resizer || !this.htmlEditor || !this.cssEditor) {
            console.error('Не удалось найти элементы редакторов или разделителя');
            return;
        }
        
        // Обработчик начала перетаскивания
        this.resizer.addEventListener('mousedown', this._handleMouseDown.bind(this));
        
        // Обработчики перемещения и окончания перетаскивания
        document.addEventListener('mousemove', this._handleMouseMove.bind(this));
        document.addEventListener('mouseup', this._handleMouseUp.bind(this));
        
        // Обработчик изменения размера окна
        window.addEventListener('resize', this._handleWindowResize.bind(this));
        
        // Инициализация начальных размеров
        this._updateTotalHeight();
    }
    
    /**
     * Обновление общей высоты контейнера
     * @private
     */
    _updateTotalHeight() {
        if (this.leftContainer) {
            this.totalHeight = this.leftContainer.clientHeight - this.resizer.offsetHeight;
        }
    }
    
    /**
     * Обработчик начала перетаскивания
     * @param {MouseEvent} e - Событие мыши
     * @private
     */
    _handleMouseDown(e) {
        e.preventDefault();
        
        this.isDragging = true;
        this.startY = e.clientY;
        this.startHeightHtml = this.htmlEditor.offsetHeight;
        this.startHeightCss = this.cssEditor.offsetHeight;
        
        // Обновляем общую высоту
        this._updateTotalHeight();
        
        // Добавляем класс для стилизации во время перетаскивания
        this.resizer.classList.add('dragging');
        
        // Добавляем класс к body для предотвращения выделения текста
        document.body.classList.add('resizing');
    }
    
    /**
     * Обработчик перемещения мыши
     * @param {MouseEvent} e - Событие мыши
     * @private
     */
    _handleMouseMove(e) {
        if (!this.isDragging) return;
        
        const deltaY = e.clientY - this.startY;
        
        // Рассчитываем новые высоты редакторов
        let newHeightHtml = this.startHeightHtml + deltaY;
        let newHeightCss = this.startHeightCss - deltaY;
        
        // Ограничиваем минимальную высоту редакторов (20% от общей высоты)
        const minHeight = this.totalHeight * 0.2;
        
        if (newHeightHtml < minHeight) {
            newHeightHtml = minHeight;
            newHeightCss = this.totalHeight - minHeight;
        } else if (newHeightCss < minHeight) {
            newHeightCss = minHeight;
            newHeightHtml = this.totalHeight - minHeight;
        }
        
        // Применяем новые высоты
        this.htmlEditor.style.height = `${newHeightHtml}px`;
        this.cssEditor.style.height = `${newHeightCss}px`;
        
        // Обновляем редакторы Monaco
        this._updateEditors();
    }
    
    /**
     * Обработчик окончания перетаскивания
     * @private
     */
    _handleMouseUp() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        
        // Удаляем класс для стилизации
        this.resizer.classList.remove('dragging');
        
        // Удаляем класс с body
        document.body.classList.remove('resizing');
        
        // Обновляем редакторы Monaco
        this._updateEditors();
    }
    
    /**
     * Обработчик изменения размера окна
     * @private
     */
    _handleWindowResize() {
        // Обновляем общую высоту
        this._updateTotalHeight();
        
        // Обновляем редакторы Monaco
        this._updateEditors();
    }
    
    /**
     * Обновление редакторов Monaco
     * @private
     */
    _updateEditors() {
        // Отправляем событие изменения размера для обновления редакторов Monaco
        window.dispatchEvent(new Event('editor-resize'));
    }
}
