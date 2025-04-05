// Класс для управления курсорами
class CursorManager {
    constructor() {
        this.cursorElement = null;
        this.teamName = null;
        this.teamData = null;
        this.cursors = new Map();
        this.initialized = false;
        this.retryCount = 0;
        this.MAX_RETRIES = 10;
        
        // Проверяем данные команды и инициализируем курсор
        this.initializeTeamData();
        
        // Подписываемся на события
        this.setupEventListeners();
    }

    initializeTeamData() {
        // Получаем данные команды из localStorage
        this.teamName = localStorage.getItem('teamName');
        
        try {
            this.teamData = JSON.parse(localStorage.getItem('teamData'));
        } catch (error) {
            console.error('Ошибка при парсинге данных команды:', error);
            this.teamData = null;
        }
        
        console.log('Данные команды:', { teamName: this.teamName, teamData: this.teamData });
        
        if (this.teamName) {
            console.log('Инициализация курсора для команды:', this.teamName);
            
            // Если курсор уже был инициализирован, очищаем его перед повторной инициализацией
            if (this.initialized) {
                this.cleanup();
            }
            
            this.init();
        } else {
            console.log('Имя команды не найдено в localStorage, повторная попытка через 500мс');
            this.retryCount++;
            if (this.retryCount < this.MAX_RETRIES) {
                setTimeout(() => {
                    this.initializeTeamData();
                }, 500);
            } else {
                console.log('Превышено максимальное количество попыток, остановка');
            }
        }
    }
    
    setupEventListeners() {
        // Подписываемся на события курсора
        document.addEventListener('cursor_moved', (event) => {
            const { x, y, teamName } = event.detail;
            if (teamName !== this.teamName) {
                this.updateOtherCursor(teamName, { x, y });
            }
        });
        
        // Подписываемся на события отключения пользователя
        document.addEventListener('user_disconnected', (event) => {
            const { teamName } = event.detail;
            this.removeCursor(teamName);
        });
        
        // Подписываемся на события авторизации
        document.addEventListener('auth_success', () => {
            this.initializeTeamData();
        });
    }

    init() {
        try {
            // Создаем элемент курсора для текущей команды
            this.createCursorElement();

            // Отслеживаем движение курсора
            this.trackCursorMovement();

            this.initialized = true;
            console.log('Курсор успешно инициализирован');
        } catch (error) {
            console.error('Ошибка при инициализации курсора:', error);
        }
    }

    createCursorElement() {
        try {
            // Проверяем, не существует ли уже курсор
            if (this.cursorElement) {
                console.log('Курсор уже существует, удаляем старый');
                this.cursorElement.remove();
            }

            // Создаем элемент курсора
            this.cursorElement = document.createElement('div');
            this.cursorElement.className = 'cursor';
            this.cursorElement.style.backgroundColor = this.getTeamColor(this.teamName);
            this.cursorElement.style.width = '10px';
            this.cursorElement.style.height = '10px';
            this.cursorElement.style.borderRadius = '50%';
            this.cursorElement.style.position = 'absolute';
            this.cursorElement.style.pointerEvents = 'none';
            this.cursorElement.style.zIndex = '1000';
            this.cursorElement.style.transition = 'all 0.1s ease';
            
            // Добавляем имя команды
            const teamLabel = document.createElement('div');
            teamLabel.className = 'cursor-label';
            teamLabel.textContent = this.teamName;
            teamLabel.style.position = 'absolute';
            teamLabel.style.top = '15px';
            teamLabel.style.left = '0';
            teamLabel.style.fontSize = '12px';
            teamLabel.style.color = this.getTeamColor(this.teamName);
            teamLabel.style.whiteSpace = 'nowrap';
            this.cursorElement.appendChild(teamLabel);

            // Добавляем курсор на страницу
            document.body.appendChild(this.cursorElement);
            console.log('Курсор создан и добавлен на страницу');
        } catch (error) {
            console.error('Ошибка при создании элемента курсора:', error);
        }
    }

    getTeamColor(teamName) {
        if (!teamName) {
            console.warn('getTeamColor вызван без имени команды');
            return 'hsl(0, 70%, 50%)'; // Возвращаем красный цвет по умолчанию
        }
        
        // Генерируем уникальный цвет для команды на основе имени
        let hash = 0;
        for (let i = 0; i < teamName.length; i++) {
            hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = hash % 360;
        return `hsl(${hue}, 70%, 50%)`;
    }

    updateOtherCursor(teamName, data) {
        let cursor = this.cursors.get(teamName);
        
        if (!cursor) {
            // Создаем новый элемент курсора для другой команды
            cursor = document.createElement('div');
            cursor.className = 'cursor';
            cursor.style.backgroundColor = this.getTeamColor(teamName);
            cursor.style.width = '10px';
            cursor.style.height = '10px';
            cursor.style.borderRadius = '50%';
            cursor.style.position = 'absolute';
            cursor.style.pointerEvents = 'none';
            cursor.style.zIndex = '1000';
            cursor.style.transition = 'all 0.1s ease';

            // Добавляем имя команды
            const teamLabel = document.createElement('div');
            teamLabel.className = 'cursor-label';
            teamLabel.textContent = teamName;
            teamLabel.style.position = 'absolute';
            teamLabel.style.top = '15px';
            teamLabel.style.left = '0';
            teamLabel.style.fontSize = '12px';
            teamLabel.style.color = this.getTeamColor(teamName);
            teamLabel.style.whiteSpace = 'nowrap';
            cursor.appendChild(teamLabel);

            document.body.appendChild(cursor);
            this.cursors.set(teamName, cursor);
        }

        // Обновляем позицию курсора
        cursor.style.left = `${data.x}px`;
        cursor.style.top = `${data.y}px`;
    }

    removeCursor(teamName) {
        const cursor = this.cursors.get(teamName);
        if (cursor) {
            cursor.remove();
            this.cursors.delete(teamName);
        }
    }

    trackCursorMovement() {
        let lastUpdate = 0;
        const updateInterval = 16; // Минимальный интервал между обновлениями (мс)

        document.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastUpdate < updateInterval) return;
            lastUpdate = now;

            // Обновляем позицию локального курсора
            this.cursorElement.style.left = `${e.clientX}px`;
            this.cursorElement.style.top = `${e.clientY}px`;

            // Отправляем позицию через Socket.io
            socketService.updateCursorPosition(e.clientX, e.clientY);
        });

        // Очищаем позицию курсора при выходе со страницы
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    cleanup() {
        // Удаляем все курсоры
        if (this.cursorElement) {
            this.cursorElement.remove();
            this.cursorElement = null;
        }

        this.cursors.forEach(cursor => cursor.remove());
        this.cursors.clear();
    }
}

// Создаем единственный экземпляр менеджера курсоров
const cursorManager = new CursorManager();