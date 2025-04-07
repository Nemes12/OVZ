// utils.js
// Вспомогательные функции, используемые в разных частях приложения

/**
 * Функция для дебаунсинга - ограничивает частоту вызова функции
 * @param {Function} func - Функция для выполнения
 * @param {number} wait - Время ожидания в мс
 * @return {Function} - Функция с дебаунсингом
 */
export const debounce = (func, wait) => {
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

/**
 * Функция для троттлинга - гарантирует, что функция не будет вызываться чаще, чем раз в указанный период
 * @param {Function} func - Функция для выполнения
 * @param {number} limit - Минимальный интервал между вызовами в мс
 * @return {Function} - Функция с троттлингом
 */
export const throttle = (func, limit) => {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

/**
 * Валидация HTML кода
 * @param {string} html - Код HTML для проверки
 * @return {boolean} - Валиден ли код
 */
export const validateHTML = (html) => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return doc.querySelector('parsererror') === null;
    } catch (e) {
        console.error('Ошибка валидации HTML:', e);
        return false;
    }
};

/**
 * Валидация CSS кода
 * @param {string} css - Код CSS для проверки
 * @return {boolean} - Валиден ли код
 */
export const validateCSS = (css) => {
    try {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        document.head.removeChild(style);
        return true;
    } catch (e) {
        console.error('Ошибка валидации CSS:', e);
        return false;
    }
};

/**
 * Безопасная обработка JSON данных
 * @param {string} data - Строка JSON для парсинга
 * @param {*} defaultValue - Значение по умолчанию в случае ошибки
 * @return {*} - Результат парсинга или значение по умолчанию
 */
export const safeJSONParse = (data, defaultValue = null) => {
    try {
        return data ? JSON.parse(data) : defaultValue;
    } catch (error) {
        console.error('Ошибка при парсинге JSON:', error);
        return defaultValue;
    }
};

/**
 * Показывает уведомление
 * @param {string} message - Текст уведомления
 * @param {string} type - Тип уведомления ('success' или 'error')
 * @param {number} duration - Длительность показа в мс
 */
export const showNotification = (message, type = 'success', duration = 3000) => {
    // Получаем или создаем контейнер для уведомлений
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Добавляем иконку в зависимости от типа уведомления
    const iconClass = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    
    // Устанавливаем содержимое
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="fas ${iconClass}"></i>
        </div>
        <div class="notification-message">${message}</div>
        <button class="notification-close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Добавляем в контейнер
    container.appendChild(notification);
    
    // Добавляем обработчик для кнопки закрытия
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
        notification.classList.remove('show');
        
        // Удаляем уведомление после окончания анимации
        setTimeout(() => {
            notification.remove();
        }, 300);
    });
    
    // Анимируем появление
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Автоматически скрываем через указанное время
    if (duration > 0) {
        setTimeout(() => {
            // Проверяем, существует ли еще уведомление в DOM
            if (notification.parentElement) {
                notification.classList.remove('show');
                
                // Удаляем уведомление после окончания анимации
                setTimeout(() => {
                    if (notification.parentElement) {
                        notification.remove();
                    }
                }, 300);
            }
        }, duration);
    }
}; 