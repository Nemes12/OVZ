// sync-status-indicator.js
// Модуль для отображения статуса синхронизации

/**
 * Класс для управления индикатором статуса синхронизации
 */
export class SyncStatusIndicator {
    /**
     * Конструктор класса SyncStatusIndicator
     */
    constructor() {
        this.statusElement = null;
        this.statusText = null;
        this.statusIcon = null;
        this.statusContainer = null;
        this.syncStatus = 'synced'; // 'synced', 'syncing', 'error'
        this.retryCount = 0;
        this.maxRetryCount = 3;
        this.hideTimeout = null;

        // Инициализация
        this._initialize();
    }

    /**
     * Инициализация индикатора статуса
     * @private
     */
    _initialize() {
        // Создаем элемент индикатора статуса
        this._createStatusElement();

        // Добавляем обработчики событий
        this._setupEventListeners();

        console.log('SyncStatusIndicator инициализирован');
    }

    /**
     * Создание элемента индикатора статуса
     * @private
     */
    _createStatusElement() {
        // Создаем контейнер для индикатора
        this.statusContainer = document.createElement('div');
        this.statusContainer.className = 'sync-status-container';
        this.statusContainer.style.position = 'fixed';
        this.statusContainer.style.bottom = '20px';
        this.statusContainer.style.right = '20px';
        this.statusContainer.style.zIndex = '1000';

        // Создаем элемент индикатора
        this.statusElement = document.createElement('div');
        this.statusElement.className = 'sync-status synced';
        this.statusElement.style.display = 'flex';
        this.statusElement.style.alignItems = 'center';
        this.statusElement.style.padding = '8px 12px';
        this.statusElement.style.borderRadius = '4px';
        this.statusElement.style.backgroundColor = '#f8f5ff';
        this.statusElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        this.statusElement.style.transition = 'all 0.3s ease';
        this.statusElement.style.cursor = 'pointer';

        // Создаем иконку
        this.statusIcon = document.createElement('span');
        this.statusIcon.className = 'sync-icon';
        this.statusIcon.innerHTML = '✓';
        this.statusIcon.style.marginRight = '8px';
        this.statusIcon.style.fontSize = '18px';

        // Создаем текст статуса
        this.statusText = document.createElement('span');
        this.statusText.className = 'sync-text';
        this.statusText.textContent = 'Синхронизировано';
        this.statusText.style.fontSize = '16px';

        // Собираем элементы
        this.statusElement.appendChild(this.statusIcon);
        this.statusElement.appendChild(this.statusText);
        this.statusContainer.appendChild(this.statusElement);

        // Добавляем в DOM
        document.body.appendChild(this.statusContainer);

        // Скрываем индикатор через 3 секунды
        this._hideAfterDelay(3000);
    }

    /**
     * Настройка обработчиков событий
     * @private
     */
    _setupEventListeners() {
        // Обработчик события успешного сохранения
        document.addEventListener('autosave_success', (event) => {
            this.showSynced(event.detail.type);
        });

        // Обработчик события повторной попытки сохранения
        document.addEventListener('autosave_retry', (event) => {
            this.showSyncing(event.detail.type, event.detail.retryCount);
        });

        // Обработчик события неудачного сохранения
        document.addEventListener('autosave_failed', (event) => {
            this.showError(event.detail.type);
        });

        // Обработчик клика по индикатору
        this.statusElement.addEventListener('click', () => {
            if (this.syncStatus === 'error') {
                // Отправляем событие для принудительного сохранения
                document.dispatchEvent(new CustomEvent('force_save'));
            }
        });

        // Обработчик события слияния изменений
        document.addEventListener('html_merged', () => {
            this.showMerged('HTML');
        });

        document.addEventListener('css_merged', () => {
            this.showMerged('CSS');
        });
    }

    /**
     * Показать статус "Синхронизировано"
     * @param {string} type - Тип содержимого ('html' или 'css')
     * @public
     */
    showSynced(type) {
        this._clearHideTimeout();

        this.syncStatus = 'synced';
        this.retryCount = 0;

        this.statusElement.className = 'sync-status synced';
        this.statusElement.style.backgroundColor = '#e8f5e9';
        this.statusElement.style.color = '#2e7d32';

        this.statusIcon.innerHTML = '✓';
        this.statusText.textContent = `${type.toUpperCase()} синхронизирован`;

        this.statusContainer.style.display = 'block';
        this._hideAfterDelay(3000);
    }

    /**
     * Показать статус "Синхронизация..."
     * @param {string} type - Тип содержимого ('html' или 'css')
     * @param {number} retryCount - Номер попытки
     * @public
     */
    showSyncing(type, retryCount) {
        this._clearHideTimeout();

        this.syncStatus = 'syncing';
        this.retryCount = retryCount;

        this.statusElement.className = 'sync-status syncing';
        this.statusElement.style.backgroundColor = '#e3f2fd';
        this.statusElement.style.color = '#1565c0';

        this.statusIcon.innerHTML = '↻';
        this.statusText.textContent = `Синхронизация ${type.toUpperCase()}... (${retryCount}/${this.maxRetryCount})`;

        this.statusContainer.style.display = 'block';
    }

    /**
     * Показать статус "Ошибка синхронизации"
     * @param {string} type - Тип содержимого ('html' или 'css')
     * @public
     */
    showError(type) {
        this._clearHideTimeout();

        this.syncStatus = 'error';

        this.statusElement.className = 'sync-status error';
        this.statusElement.style.backgroundColor = '#ffebee';
        this.statusElement.style.color = '#c62828';

        this.statusIcon.innerHTML = '✗';
        this.statusText.textContent = `Ошибка синхронизации ${type.toUpperCase()}. Нажмите для повтора.`;

        this.statusContainer.style.display = 'block';
    }

    /**
     * Показать статус "Изменения объединены"
     * @param {string} type - Тип содержимого ('HTML' или 'CSS')
     * @public
     */
    showMerged(type) {
        this._clearHideTimeout();

        this.statusElement.className = 'sync-status merged';
        this.statusElement.style.backgroundColor = '#fff8e1';
        this.statusElement.style.color = '#f57f17';

        this.statusIcon.innerHTML = '⟲';
        this.statusText.textContent = `${type} объединен с изменениями других пользователей`;

        this.statusContainer.style.display = 'block';
        this._hideAfterDelay(5000);
    }

    /**
     * Скрыть индикатор статуса через указанное время
     * @param {number} delay - Задержка в миллисекундах
     * @private
     */
    _hideAfterDelay(delay) {
        this._clearHideTimeout();

        this.hideTimeout = setTimeout(() => {
            this.statusContainer.style.display = 'none';
        }, delay);
    }

    /**
     * Очистить таймер скрытия
     * @private
     */
    _clearHideTimeout() {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    }
}
