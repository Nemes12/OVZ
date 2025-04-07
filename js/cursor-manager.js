// cursor-manager.js
// Модуль для управления курсорами пользователей

import { throttle } from './utils.js';

/**
 * Класс для управления курсорами пользователей
 */
export class CursorManager {
    /**
     * Конструктор класса CursorManager
     * @param {Object} socketService - Экземпляр сервиса сокетов
     */
    constructor(socketService) {
        this.socketService = socketService;
        this.cursors = {};
        this.initialized = false;
        this.cursorContainer = null;
        
        // Инициализация курсоров
        this._initialize();
    }
    
    /**
     * Инициализация менеджера курсоров
     * @private
     */
    _initialize() {
        try {
            // Ожидаем, когда DOM будет полностью загружен
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this._initCursors());
            } else {
                this._initCursors();
            }
        } catch (error) {
            console.error('Ошибка при инициализации менеджера курсоров:', error);
        }
    }
    
    /**
     * Инициализация курсоров после загрузки DOM
     * @private
     */
    _initCursors() {
        try {
            // Создаем контейнер для курсоров
            this._createCursorContainer();
            
            // Подписываемся на события сокета
            this._subscribeToSocketEvents();
            
            // Подписываемся на события мыши
            this._setupMouseEvents();
            
            // Устанавливаем флаг инициализации
            this.initialized = true;
            
            console.log('Менеджер курсоров успешно инициализирован');
        } catch (error) {
            console.error('Ошибка при инициализации курсоров:', error);
        }
    }
    
    /**
     * Создание контейнера для курсоров
     * @private
     */
    _createCursorContainer() {
        // Проверяем, существует ли уже контейнер
        let cursorContainer = document.getElementById('cursor-container');
        
        if (!cursorContainer) {
            cursorContainer = document.createElement('div');
            cursorContainer.id = 'cursor-container';
            cursorContainer.style.position = 'fixed';
            cursorContainer.style.top = '0';
            cursorContainer.style.left = '0';
            cursorContainer.style.width = '100%';
            cursorContainer.style.height = '100%';
            cursorContainer.style.pointerEvents = 'none';
            cursorContainer.style.zIndex = '9999';
            document.body.appendChild(cursorContainer);
        }
        
        this.cursorContainer = cursorContainer;
    }
    
    /**
     * Подписка на события сокета
     * @private
     */
    _subscribeToSocketEvents() {
        // Обрабатываем движения курсора других пользователей
        this.socketService.onCursorMoved((data) => {
            const { x, y, teamName } = data;
            
            // Не обрабатываем собственные движения курсора
            if (teamName === this.socketService.getTeamName()) return;
            
            // Обновляем или создаем курсор
            this.updateCursor(teamName, x, y);
        });
        
        // Обрабатываем отключение пользователя
        this.socketService.onUserDisconnected((data) => {
            const { teamName } = data;
            
            // Удаляем курсор отключившегося пользователя
            this.removeCursor(teamName);
        });
    }
    
    /**
     * Настройка обработчиков событий мыши
     * @private
     */
    _setupMouseEvents() {
        // Обрабатываем движение мыши
        document.addEventListener('mousemove', this._throttle((e) => {
            if (!this.socketService.isAuthorized()) return;
            
            // Отправляем позицию курсора через сокет
            this.socketService.updateCursorPosition({
                x: e.clientX, 
                y: e.clientY
            });
        }, 50)); // Ограничиваем до 20 обновлений в секунду (50мс)
    }
    
    /**
     * Обновление курсора
     * @param {string} teamName - Имя команды
     * @param {number} x - Координата X
     * @param {number} y - Координата Y
     */
    updateCursor(teamName, x, y) {
        // Проверяем, существует ли уже курсор для этой команды
        let cursor = this.cursors[teamName];
        
        if (!cursor) {
            // Создаем новый курсор
            cursor = this._createCursor(teamName);
            this.cursors[teamName] = cursor;
        }
        
        // Обновляем позицию курсора
        cursor.style.transform = `translate(${x}px, ${y}px)`;
    }
    
    /**
     * Создание курсора
     * @param {string} teamName - Имя команды
     * @returns {HTMLElement} Созданный элемент курсора
     * @private
     */
    _createCursor(teamName) {
        const cursor = document.createElement('div');
        cursor.className = 'remote-cursor';
        cursor.style.position = 'absolute';
        cursor.style.width = '20px';
        cursor.style.height = '20px';
        cursor.style.borderRadius = '50%';
        cursor.style.background = this._getRandomColor(teamName);
        cursor.style.transform = 'translate(-50%, -50%)';
        cursor.style.transition = 'transform 0.1s ease-out';
        cursor.style.zIndex = '9999';
        cursor.style.pointerEvents = 'none';
        
        // Добавляем имя команды
        const nameTag = document.createElement('div');
        nameTag.className = 'cursor-name-tag';
        nameTag.textContent = teamName;
        nameTag.style.position = 'absolute';
        nameTag.style.top = '20px';
        nameTag.style.left = '10px';
        nameTag.style.background = cursor.style.background;
        nameTag.style.color = '#fff';
        nameTag.style.padding = '2px 5px';
        nameTag.style.borderRadius = '3px';
        nameTag.style.fontSize = '12px';
        nameTag.style.whiteSpace = 'nowrap';
        
        cursor.appendChild(nameTag);
        
        // Добавляем курсор в контейнер
        this.cursorContainer.appendChild(cursor);
        
        return cursor;
    }
    
    /**
     * Удаление курсора
     * @param {string} teamName - Имя команды
     */
    removeCursor(teamName) {
        const cursor = this.cursors[teamName];
        
        if (cursor) {
            cursor.remove();
            delete this.cursors[teamName];
        }
    }
    
    /**
     * Получение случайного цвета на основе имени команды
     * @param {string} teamName - Имя команды
     * @returns {string} HEX-код цвета
     * @private
     */
    _getRandomColor(teamName) {
        // Генерируем псевдослучайный цвет на основе имени команды
        let hash = 0;
        for (let i = 0; i < teamName.length; i++) {
            hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        let color = '#';
        for (let i = 0; i < 3; i++) {
            const value = (hash >> (i * 8)) & 0xFF;
            color += ('00' + value.toString(16)).substr(-2);
        }
        
        return color;
    }
    
    /**
     * Функция для ограничения частоты вызовов
     * @param {Function} func - Функция для тротлинга
     * @param {number} delay - Задержка в миллисекундах
     * @returns {Function} - Функция с тротлингом
     * @private
     */
    _throttle(func, delay) {
        let lastCall = 0;
        return function(...args) {
            const now = Date.now();
            if (now - lastCall < delay) {
                return;
            }
            lastCall = now;
            return func.apply(this, args);
        };
    }
}