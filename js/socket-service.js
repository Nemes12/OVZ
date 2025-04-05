// socket-service.js
const socketService = (function() {
  let socket;
  let teamName = '';
  let teamData = null;
  
  function init() {
    // Используем window.location.origin для автоматического определения URL
    socket = io(window.location.origin); // Динамический URL, работает и локально, и на хостинге
    
    // Обработка событий Socket.io
    setupSocketEvents();
    
    return {
      auth,
      updateHTML,
      updateCSS,
      updateCursorPosition,
      initializeCode,
      getTeamName: () => teamName,
      getTeamData: () => teamData
    };
  }
  
  function setupSocketEvents() {
    // Успешная авторизация
    socket.on('auth_success', (data) => {
      teamName = data.teamName;
      teamData = data.teamData;
      
      // Сохраняем данные в localStorage
      localStorage.setItem('teamName', teamName);
      localStorage.setItem('teamData', JSON.stringify(teamData));
      
      // Вызываем событие авторизации
      document.dispatchEvent(new CustomEvent('auth_success', { 
        detail: { 
          teamName, 
          teamData,
          isAdmin: teamName === 'admin'
        } 
      }));
    });
    
    // Ошибка авторизации
    socket.on('auth_error', (data) => {
      console.error('Ошибка авторизации:', data.message);
      document.dispatchEvent(new CustomEvent('auth_error', { detail: data }));
    });
    
    // Обновление HTML кода
    socket.on('html_updated', (data) => {
      // Используем requestAnimationFrame для оптимизации рендеринга
      requestAnimationFrame(() => {
        document.dispatchEvent(new CustomEvent('html_updated', { detail: data }));
      });
    });
    
    // Обновление CSS кода
    socket.on('css_updated', (data) => {
      // Используем requestAnimationFrame для оптимизации рендеринга
      requestAnimationFrame(() => {
        document.dispatchEvent(new CustomEvent('css_updated', { detail: data }));
      });
    });
    
    // Движение курсора
    socket.on('cursor_moved', (data) => {
      // Используем requestAnimationFrame для оптимизации рендеринга
      requestAnimationFrame(() => {
        document.dispatchEvent(new CustomEvent('cursor_moved', { detail: data }));
      });
    });
    
    // Обновление счетчика онлайн пользователей
    socket.on('online_users_count', (count) => {
      document.dispatchEvent(new CustomEvent('online_users_count', { detail: { count } }));
    });
    
    // Отключение пользователя
    socket.on('user_disconnected', (data) => {
      document.dispatchEvent(new CustomEvent('user_disconnected', { detail: data }));
    });
    
    // Добавляем обработчик события инициализации
    socket.on('code_initialized', () => {
      console.log('Получено событие инициализации кода');
      document.dispatchEvent(new CustomEvent('code_initialized'));
    });
  }
  
  function auth(teamName) {
    socket.emit('auth', { teamName });
  }
  
  function updateHTML(html) {
    socket.emit('update_html', { html, teamName });
  }
  
  function updateCSS(css) {
    socket.emit('update_css', { css, teamName });
  }
  
  function updateCursorPosition(x, y) {
    socket.emit('cursor_position', { x, y, teamName });
  }
  
  function initializeCode() {
    console.log('Отправка события инициализации кода');
    socket.emit('initialize_code');
  }
  
  return init();
})();

// Экспортируем для использования в других файлах
window.socketService = socketService;