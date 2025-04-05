// auth-modal.js (обновленная версия)
document.addEventListener('DOMContentLoaded', () => {
    const loginModal = document.getElementById('login-modal');
    const loginFormModal = document.getElementById('login-form-modal');
    const loginBtn = document.getElementById('login-btn');
    const backToMainBtn = document.getElementById('back-to-main');
    const loginForm = document.getElementById('login-form');
    const errorNotification = document.getElementById('error-notification');
    const initOverlay = document.getElementById('init-overlay');

    // Функция для показа ошибок
    const showError = (message) => {
        errorNotification.textContent = message;
        errorNotification.classList.add('show');
        setTimeout(() => {
            errorNotification.classList.remove('show');
        }, 3000);
    };

    // Проверяем состояние авторизации из localStorage
    const checkAuth = () => {
        const teamName = localStorage.getItem('teamName');
        if (teamName) {
            // Пользователь уже авторизован, восстанавливаем сессию
            socketService.auth(teamName);
            loginModal.style.display = 'none';
            loginFormModal.style.display = 'none';
            
            // Показываем оверлей инициализации кода
            if (initOverlay) {
                initOverlay.style.display = 'flex';
            }
        } else {
            // Пользователь не авторизован
            loginModal.style.display = 'flex';
            
            // Скрываем оверлей инициализации кода
            if (initOverlay) {
                initOverlay.style.display = 'none';
            }
        }
    };

    // Обработчик для события успешной авторизации
    document.addEventListener('auth_success', () => {
        loginModal.style.display = 'none';
        loginFormModal.style.display = 'none';
        
        // Показываем оверлей инициализации кода
        if (initOverlay) {
            initOverlay.style.display = 'flex';
        }
    });
    
    // Обработчик для события ошибки авторизации
    document.addEventListener('auth_error', (event) => {
        showError(event.detail.message);
    });

    // Обработчик для кнопки "Вход"
    loginBtn.addEventListener('click', () => {
        loginModal.style.display = 'none';
        loginFormModal.style.display = 'flex';
    });

    // Обработчик для кнопки "Назад"
    backToMainBtn.addEventListener('click', () => {
        loginFormModal.style.display = 'none';
        loginModal.style.display = 'flex';
        loginForm.reset();
    });

    // Обработчик отправки формы
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const teamName = document.getElementById('team-name').value;

        try {
            console.log('Попытка входа для команды:', teamName);
            
            // Отправка запроса на авторизацию
            socketService.auth(teamName);
            
        } catch (error) {
            console.error('Ошибка при входе:', error);
            showError('Ошибка при входе в систему');
        }
    });
    
    // Проверяем авторизацию при загрузке страницы
    checkAuth();
});