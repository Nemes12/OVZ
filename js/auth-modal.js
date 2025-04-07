// auth-modal.js
// Модуль для управления формой авторизации

import { showNotification } from './utils.js';

/**
 * Класс для управления модальным окном авторизации
 */
export class AuthModal {
    /**
     * Конструктор класса AuthModal
     * @param {Object} socketService - Экземпляр сервиса сокетов
     */
    constructor(socketService) {
        this.socketService = socketService;
        this.loginModal = null;
        this.loginFormModal = null;
        this.loginBtn = null;
        this.backToMainBtn = null;
        this.loginForm = null;
        this.teamNameInput = null;
        this.errorMsg = null;
        this.initOverlay = null;
        this.initialized = false;
        
        // Инициализация
        this._initialize();
    }
    
    /**
     * Инициализация модального окна
     * @private
     */
    _initialize() {
        try {
            // Находим элементы DOM
            this.loginModal = document.getElementById('login-modal');
            this.loginFormModal = document.getElementById('login-form-modal');
            this.loginBtn = document.getElementById('login-btn');
            this.backToMainBtn = document.getElementById('back-to-main');
            this.loginForm = document.getElementById('login-form');
            this.teamNameInput = document.getElementById('team-name');
            this.errorMsg = document.getElementById('error-notification');
            this.initOverlay = document.getElementById('init-overlay');
            
            if (!this.loginModal) {
                console.error('Модальное окно входа не найдено (login-modal)');
            }
            if (!this.loginFormModal) {
                console.error('Модальное окно формы входа не найдено (login-form-modal)');
            }
            if (!this.loginBtn) {
                console.error('Кнопка входа не найдена (login-btn)');
            }
            if (!this.loginForm) {
                console.error('Форма входа не найдена (login-form)');
            }
            if (!this.teamNameInput) {
                console.error('Поле ввода имени команды не найдено (team-name)');
            }
            
            // Настраиваем обработчики событий
            this._setupEventListeners();
            
            // Проверяем предыдущую авторизацию
            const hasAuth = this.checkAuth();
            
            // Если пользователь не авторизован, показываем окно входа
            if (!hasAuth) {
                this.showLoginModal();
            }
            
            // Устанавливаем флаг инициализации
            this.initialized = true;
            
            console.log('Модальное окно авторизации успешно инициализировано');
        } catch (error) {
            console.error('Ошибка при инициализации модального окна авторизации:', error);
        }
    }
    
    /**
     * Проверка предыдущей авторизации
     */
    checkAuth() {
        // Проверяем сохраненное имя команды в localStorage
        const teamName = localStorage.getItem('teamName');
        if (teamName) {
            // Пользователь уже авторизован, восстанавливаем сессию
            console.log('Восстановление сессии для команды:', teamName);
            this.socketService.authorize(teamName);
            this.hideLoginModals();
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Показ модального окна входа
     */
    showLoginModal() {
        if (this.loginModal) {
            this.loginModal.style.display = 'flex';
        }
    }
    
    /**
     * Показать форму входа
     */
    showLoginForm() {
        console.log('Показываем форму входа');
        
        if (this.loginFormModal) {
            console.log('Модальное окно формы входа найдено, устанавливаем display: flex');
            this.loginFormModal.style.display = 'flex';
        } else {
            console.error('Модальное окно формы входа не найдено');
        }
        
        if (this.loginModal) {
            console.log('Скрываем основное модальное окно входа');
            this.loginModal.style.display = 'none';
        } else {
            console.error('Основное модальное окно входа не найдено');
        }
    }
    
    /**
     * Скрытие модальных окон входа
     */
    hideLoginModals() {
        if (this.loginModal) {
            this.loginModal.style.display = 'none';
        }
        
        if (this.loginFormModal) {
            this.loginFormModal.style.display = 'none';
        }
    }
    
    /**
     * Настройка обработчиков событий
     * @private
     */
    _setupEventListeners() {
        // Настраиваем обработчик для кнопки входа на первом экране
        if (this.loginBtn) {
            this.loginBtn.addEventListener('click', () => {
                this.showLoginForm();
            });
        } else {
            console.error('Кнопка входа не найдена');
        }
        
        // Настраиваем обработчик для кнопки "Назад"
        if (this.backToMainBtn) {
            this.backToMainBtn.addEventListener('click', () => {
                if (this.loginFormModal) {
                    this.loginFormModal.style.display = 'none';
                }
                if (this.loginModal) {
                    this.loginModal.style.display = 'flex';
                }
            });
        }
        
        // Настраиваем обработчик отправки формы
        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => {
                this._handleLoginSubmit(e);
            });
        }
    }

    /**
     * Обработка отправки формы авторизации
     * @param {Event} event - Событие отправки формы
     * @private
     */
    _handleLoginSubmit(event) {
        event.preventDefault();
        
        const form = event.target;
        const teamNameInput = form.querySelector('#team-name');
        
        if (teamNameInput) {
            try {
                const teamName = teamNameInput.value.trim();
                
                // Проверяем, что имя команды не пустое
                if (!teamName) {
                    this._showError('Пожалуйста, введите имя команды');
                    return;
                }
                
                // Отправка запроса на авторизацию
                this.socketService.authorize(teamName);
                
            } catch (error) {
                console.error('Ошибка при авторизации:', error);
                this._showError('Произошла ошибка при авторизации');
            }
        }
    }

    /**
     * Показ сообщения об ошибке
     * @param {string} message - Текст сообщения об ошибке
     * @private
     */
    _showError(message) {
        showNotification(message, 'error');
    }
}

// Экспортируем только класс, экземпляр будет создаваться в app-initializer.js