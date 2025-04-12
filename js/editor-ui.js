// editor-ui.js
// Модуль для управления интерфейсом редактора кода

import { debounce } from './utils.js';

/**
 * Класс для управления интерфейсом редактора
 */
export class EditorUI {
    /**
     * Конструктор класса EditorUI
     */
    constructor() {
        console.log('Инициализация EditorUI...');
        this.container = document.querySelector('.container');
        this.initOverlay = document.getElementById('init-overlay');
        this.initButton = document.getElementById('init-button');
        this.initStatus = document.getElementById('init-status');
        this.onlineUsersElement = document.querySelector('.online-users');
        this.onlineUsersCount = document.getElementById('online-users-count');
        this.fullscreenResult = document.getElementById('fullscreen-result');
        this.resultPreview = document.getElementById('result-preview');
        
        // Выводим отладочную информацию
        console.log('EditorUI элементы:');
        console.log('- container:', this.container ? 'найден' : 'не найден');
        console.log('- fullscreenResult:', this.fullscreenResult ? 'найден' : 'не найден');
        console.log('- resultPreview:', this.resultPreview ? 'найден' : 'не найден');
        
        // Флаг полноэкранного режима
        this.isFullscreen = false;
        this.currentFullscreenEditor = null;
        
        // Настраиваем адаптивные размеры редакторов
        this.setupEditorSizes();
        
        // Устанавливаем обработчики событий
        this.setupEventListeners();
        
        console.log('EditorUI полностью инициализирован.');
    }
    
    /**
     * Инициализация интерфейса
     */
    init() {
        console.log('Вызван метод init() для EditorUI');
        // Отображаем контейнер
        this.showEditor();
    }
    
    /**
     * Показать редактор кода
     */
    showEditor() {
        if (this.container) {
            this.container.style.display = 'flex';
        }
    }
    
    /**
     * Скрыть редактор кода
     */
    hideEditor() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }
    
    /**
     * Показать оверлей инициализации
     */
    showInitOverlay() {
        if (this.initOverlay) {
            this.initOverlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }
    
    /**
     * Скрыть оверлей инициализации
     */
    hideInitOverlay() {
        if (this.initOverlay) {
            this.initOverlay.style.display = 'none';
            document.body.style.overflow = '';
        }
    }
    
    /**
     * Обновить счетчик онлайн-пользователей
     * @param {number} count - Количество пользователей
     */
    updateOnlineUsers(count) {
        if (this.onlineUsersCount) {
            // Добавляем анимацию обновления
            this.onlineUsersCount.classList.add('updated');
            this.onlineUsersCount.textContent = count;
            
            // Отображаем элемент, если он был скрыт
            if (this.onlineUsersElement) {
                this.onlineUsersElement.style.display = 'block';
            }
            
            // Удаляем класс анимации после завершения
            setTimeout(() => {
                this.onlineUsersCount.classList.remove('updated');
            }, 300);
        }
    }
    
    /**
     * Показать кнопку инициализации кода для админа
     */
    showInitButton() {
        if (this.initButton && this.initStatus) {
            this.initButton.style.display = 'flex';
            this.initStatus.style.display = 'none';
        }
    }
    
    /**
     * Настройка адаптивных размеров редакторов
     */
    setupEditorSizes() {
        // Обработчик изменения размера окна
        const resizeHandler = debounce(() => {
            this.adjustEditorSizes();
        }, 100);
        
        window.addEventListener('resize', resizeHandler);
        
        // Первоначальная настройка размеров
        this.adjustEditorSizes();
    }
    
    /**
     * Корректировка размеров редакторов в зависимости от размера окна
     */
    adjustEditorSizes() {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // Адаптация для мобильных устройств
        if (windowWidth < 768) {
            // Мобильная версия: редакторы располагаются вертикально
            if (this.container) {
                this.container.classList.add('mobile-layout');
            }
        } else {
            // Десктопная версия: горизонтальное расположение
            if (this.container) {
                this.container.classList.remove('mobile-layout');
            }
        }
        
        // Диспетчеризация события изменения размера для CodeMirror
        window.dispatchEvent(new CustomEvent('editor-resize'));
    }
    
    /**
     * Переключение полноэкранного режима для редактора
     * @param {string} editorType - Тип редактора (html или css)
     */
    toggleFullscreen(editorType) {
        // Логируем действие
        log(`Переключение полноэкранного режима для редактора ${editorType}`);
        
        // Находим контейнер редактора
        const editorContainer = document.querySelector(`.div-codemirror.${editorType}-editor`);
        if (!editorContainer) {
            log(`Контейнер редактора ${editorType} не найден`, 'error');
            return;
        }
        
        // Находим существующий элемент в полноэкранном режиме, если есть
        const existingFullscreen = document.querySelector('.div-codemirror.fullscreen');
        
        // Если уже есть другой редактор в полноэкранном режиме, сначала убираем у него класс
        if (existingFullscreen && existingFullscreen !== editorContainer) {
            existingFullscreen.classList.remove('fullscreen');
            // Выходим из режима полноэкранного просмотра для body
            document.body.classList.remove('fullscreen-active');
            log(`Убран полноэкранный режим с предыдущего редактора`);
        }
        
        // Переключаем класс fullscreen у контейнера редактора
        editorContainer.classList.toggle('fullscreen');
        
        // Проверяем, находится ли сейчас контейнер в полноэкранном режиме
        const isFullscreen = editorContainer.classList.contains('fullscreen');
        
        // Настраиваем класс fullscreen-active для body
        if (isFullscreen) {
            document.body.classList.add('fullscreen-active');
            log(`Добавлен класс fullscreen-active для body`);
        } else {
            const anyFullscreen = document.querySelector('.div-codemirror.fullscreen');
            if (!anyFullscreen) {
                document.body.classList.remove('fullscreen-active');
                log(`Убран класс fullscreen-active для body`);
            }
        }
        
        // Показываем или скрываем контейнер результата в зависимости от состояния
        const resultContainer = document.getElementById('fullscreen-result');
        if (resultContainer) {
            resultContainer.style.display = isFullscreen ? 'block' : 'none';
            log(`${isFullscreen ? 'Показан' : 'Скрыт'} контейнер результата в полноэкранном режиме`);
        }
        
        // Обновляем размер CodeMirror редактора через короткую задержку
        // для корректного отображения после изменения стилей
        setTimeout(() => {
            if (editorType === 'html' && this.htmlEditor) {
                this.htmlEditor.refresh();
                log(`Обновлен размер HTML редактора`);
            } else if (editorType === 'css' && this.cssEditor) {
                this.cssEditor.refresh();
                log(`Обновлен размер CSS редактора`);
            }

            // Дополнительно обновляем размер еще раз через некоторое время
            setTimeout(() => {
                if (editorType === 'html' && this.htmlEditor) {
                    this.htmlEditor.refresh();
                    log(`Обновлен размер HTML редактора`);
                } else if (editorType === 'css' && this.cssEditor) {
                    this.cssEditor.refresh();
                    log(`Обновлен размер CSS редактора`);
                } else {
                    log(`Не удалось обновить размер редактора ${editorType}`);
                }
            }, 500); // Увеличиваем задержку до 500мс для гарантии обновления DOM
        }, 200); // Увеличиваем задержку до 200мс для гарантии обновления DOM
    }
    
    /**
     * Обновление индикатора последнего редактора
     * @param {string} editorType - Тип редактора ('html' или 'css')
     * @param {string} teamName - Имя команды
     */
    updateLastEditorIndicator(editorType, teamName) {
        const indicator = document.getElementById(`last-${editorType}-editor`);
        
        if (indicator) {
            indicator.textContent = teamName ? `редактировал: ${teamName}` : '';
            
            // Анимация обновления
            indicator.classList.add('updated');
            setTimeout(() => {
                indicator.classList.remove('updated');
            }, 1000);
        }
    }
    
    /**
     * Установка обработчиков событий
     */
    setupEventListeners() {
        // Слушатель события ESC для выхода из полноэкранного режима
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isFullscreen) {
                const editorContainer = document.getElementById(`${this.currentFullscreenEditor}-editor-container`);
                if (editorContainer) {
                    editorContainer.classList.remove('fullscreen');
                    document.body.classList.remove('fullscreen-active');
                    this.fullscreenResult.style.display = 'none';
                    this.isFullscreen = false;
                    this.currentFullscreenEditor = null;
                }
            }
        });
    }
}

// Экспортируем экземпляр класса для использования в других файлах
export const editorUI = new EditorUI(); 