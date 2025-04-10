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
 * Сохраняет данные в локальное хранилище как резервную копию
 * @param {string} type - Тип данных ('html' или 'css')
 * @param {string} content - Содержимое для сохранения
 * @param {string} teamName - Имя команды
 */
export const saveToLocalBackup = (type, content, teamName) => {
    try {
        const timestamp = Date.now();
        const key = `${teamName}_${type}_backup`;
        const data = {
            content,
            timestamp,
            type,
            teamName
        };
        localStorage.setItem(key, JSON.stringify(data));
        console.log(`Резервная копия ${type} сохранена в localStorage`);
        return true;
    } catch (error) {
        console.error(`Ошибка при создании резервной копии ${type}:`, error);
        return false;
    }
};

/**
 * Восстанавливает данные из локального хранилища
 * @param {string} type - Тип данных ('html' или 'css')
 * @param {string} teamName - Имя команды
 * @return {string|null} - Восстановленное содержимое или null
 */
export const restoreFromLocalBackup = (type, teamName) => {
    try {
        const key = `${teamName}_${type}_backup`;
        const storedData = localStorage.getItem(key);
        
        if (!storedData) {
            console.log(`Резервная копия ${type} не найдена`);
            return null;
        }
        
        const data = safeJSONParse(storedData);
        if (!data || !data.content) {
            console.log(`Некорректная резервная копия ${type}`);
            return null;
        }
        
        console.log(`Восстановлена резервная копия ${type} от ${new Date(data.timestamp).toLocaleString()}`);
        return data.content;
    } catch (error) {
        console.error(`Ошибка при восстановлении из резервной копии ${type}:`, error);
        return null;
    }
};

/**
 * Функция для повторения операции с задержкой в случае неудачи
 * @param {Function} operation - Функция, которую нужно выполнить
 * @param {number} maxRetries - Максимальное количество повторов (по умолчанию 3)
 * @param {number} delay - Задержка между повторами в мс (по умолчанию 1000)
 * @param {number} backoff - Коэффициент увеличения задержки (по умолчанию 1.5)
 * @return {Promise} - Промис с результатом выполнения
 */
export const retryOperation = async (operation, maxRetries = 3, delay = 1000, backoff = 1.5) => {
    let retries = 0;
    let currentDelay = delay;
    
    while (true) {
        try {
            return await operation();
        } catch (error) {
            retries++;
            
            if (retries >= maxRetries) {
                console.error(`Операция не удалась после ${maxRetries} попыток:`, error);
                throw error;
            }
            
            console.warn(`Попытка ${retries}/${maxRetries} не удалась, повтор через ${currentDelay}ms:`, error);
            
            // Ждем перед следующей попыткой
            await new Promise(resolve => setTimeout(resolve, currentDelay));
            
            // Увеличиваем задержку для следующей попытки
            currentDelay *= backoff;
        }
    }
};

/**
 * Гарантирует сохранение данных с использованием локального резервирования
 * и повторных попыток при неудаче
 * @param {Function} saveFunction - Функция для сохранения данных
 * @param {string} type - Тип данных ('html' или 'css')
 * @param {string} content - Содержимое для сохранения
 * @param {string} teamName - Имя команды
 * @param {Object} options - Дополнительные опции
 * @return {Promise<boolean>} - Промис с результатом сохранения
 */
export const ensureSave = async (saveFunction, type, content, teamName, options = {}) => {
    const { 
        maxRetries = 3, 
        showSuccessNotification = true,
        notificationDuration = 3000
    } = options;
    
    // Сначала сохраняем локальную резервную копию
    saveToLocalBackup(type, content, teamName);
    
    try {
        // Пытаемся сохранить на сервере с повторными попытками
        await retryOperation(
            () => saveFunction(content, teamName),
            maxRetries
        );
        
        // Успешное сохранение
        if (showSuccessNotification) {
            showNotification(`${type.toUpperCase()} успешно сохранен`, 'success', notificationDuration);
        }
        
        return true;
    } catch (error) {
        // В случае финальной ошибки показываем уведомление
        showNotification(
            `Не удалось сохранить ${type.toUpperCase()}. Изменения сохранены локально и будут отправлены позже.`, 
            'error', 
            5000
        );
        
        // Регистрируем необходимость синхронизации 
        const pendingSyncs = safeJSONParse(localStorage.getItem('pendingSyncs') || '[]', []);
        pendingSyncs.push({
            type,
            teamName,
            timestamp: Date.now()
        });
        localStorage.setItem('pendingSyncs', JSON.stringify(pendingSyncs));
        
        return false;
    }
};

/**
 * Показывает уведомление
 * @param {string} message - Текст уведомления
 * @param {string} type - Тип уведомления ('success' или 'error')
 * @param {number} duration - Длительность показа в мс
 */
export const showNotification = (message, type = 'success', duration = 3000) => {
    // Только логируем сообщение, без отображения уведомлений
    console.log(`[Notification] ${type}: ${message}`);
};

/**
 * Показывает уведомление о слиянии изменений
 * @param {string} teamName - Имя команды, чьи изменения были объединены
 * @param {string} language - Язык редактора ('html' или 'css')
 */
export const showMergeNotification = (teamName, language) => {
    // Только логируем сообщение, без отображения уведомлений
    const languageName = language.toUpperCase();
    const message = `Изменения ${languageName} от команды "${teamName}" были объединены с вашими`;
    console.log(`[Notification] merge: ${message}`);
}; 