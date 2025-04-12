// В начале файла добавляем обработчики необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('Необработанное исключение:', error);
  // Логируем ошибку, но не завершаем процесс
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанное отклонение промиса:', reason);
});

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { getCodeData, updateCode, resetToInitialState, getStyles, saveStyles, resetStyles } from './db.js';

// Функция для логирования с временными метками
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  switch(level) {
    case 'error':
      console.error(formattedMessage);
      break;
    case 'warn':
      console.warn(formattedMessage);
      break;
    default:
      console.log(formattedMessage);
  }
}

const __dirname = path.resolve();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Добавляем настройки для оптимизации socket.io
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6 // 1MB
});

// Получаем порт из переменных окружения или используем 3000 по умолчанию
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // Добавляем мидлвар для обработки JSON
app.use(express.static(path.join(__dirname), {
  // Добавляем кэширование для статических файлов
  etag: true,
  lastModified: true,
  maxAge: 30000 // 30 секунд кэширования (подходит для разработки, для продакшена можно увеличить)
}));

// И добавим явный маршрут для корневого пути
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Скрытый маршрут для сброса кодов к начальным значениям
app.get('/RelOAD', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Маршруты для страниц предпросмотра
app.get('/preview-buttons.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'preview-buttons.html'));
});

app.get('/preview-text.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'preview-text.html'));
});

app.get('/preview-editor.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'preview-editor.html'));
});

app.get('/preview-header.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'preview-header.html'));
});

// API для сброса кодов
app.post('/api/reset', async (req, res) => {
  try {
    const success = await Promise.resolve(resetToInitialState());

    if (!success) {
      return res.status(500).json({ success: false, message: 'Ошибка при сбросе данных' });
    }

    // Получаем обновленные данные
    const codeData = getCodeData();

    // Инвалидируем кэш
    codeDataCache = { ...codeData, timestamp: Date.now() };

    // Уведомляем всех клиентов о сбросе
    io.emit('code_reset');

    // Отправляем обновленные данные всем клиентам
    io.emit('html_updated', {
      html: codeData.html,
      teamName: 'admin'
    });

    io.emit('css_updated', {
      css: codeData.css,
      teamName: 'admin'
    });

    log('Данные успешно сброшены к начальному состоянию');
    res.json({ success: true, message: 'Данные успешно сброшены' });
  } catch (error) {
    log(`Ошибка при сбросе данных: ${error.message}`, 'error');
    res.status(500).json({ success: false, message: 'Ошибка при сбросе данных' });
  }
});

// API для получения стилей
app.get('/api/styles', (req, res) => {
  try {
    const styles = getStyles();
    res.json({ success: true, styles });
  } catch (error) {
    log(`Ошибка при получении стилей: ${error.message}`, 'error');
    res.status(500).json({ success: false, message: 'Ошибка при получении стилей' });
  }
});

// API для сохранения стилей
app.post('/api/save-styles', (req, res) => {
  try {
    const styles = req.body;

    if (!styles || Object.keys(styles).length === 0) {
      return res.status(400).json({ success: false, message: 'Неверный формат данных' });
    }

    const success = saveStyles(styles);

    if (!success) {
      return res.status(500).json({ success: false, message: 'Ошибка при сохранении стилей' });
    }

    // Уведомляем всех клиентов об обновлении стилей
    io.emit('styles_updated', { styles });

    log('Стили успешно сохранены');
    res.json({ success: true, message: 'Стили успешно сохранены' });
  } catch (error) {
    log(`Ошибка при сохранении стилей: ${error.message}`, 'error');
    res.status(500).json({ success: false, message: 'Ошибка при сохранении стилей' });
  }
});

// API для сброса стилей
app.post('/api/reset-styles', (req, res) => {
  try {
    const success = resetStyles();

    if (!success) {
      return res.status(500).json({ success: false, message: 'Ошибка при сбросе стилей' });
    }

    // Получаем стили по умолчанию
    const styles = getStyles();

    // Уведомляем всех клиентов об обновлении стилей
    io.emit('styles_updated', { styles });

    log('Стили успешно сброшены к начальным значениям');
    res.json({ success: true, message: 'Стили успешно сброшены' });
  } catch (error) {
    log(`Ошибка при сбросе стилей: ${error.message}`, 'error');
    res.status(500).json({ success: false, message: 'Ошибка при сбросе стилей' });
  }
});

// Хранение данных о пользователях
const onlineUsers = {};

// Кэш для данных кода
let codeDataCache = null;
const CACHE_TTL = 30000; // 30 секунд

// Функция для получения данных с кэшированием
function getCachedCodeData() {
  const now = Date.now();

  // Если кэш отсутствует или устарел
  if (!codeDataCache || (now - codeDataCache.timestamp > CACHE_TTL)) {
    const freshData = getCodeData();
    codeDataCache = { ...freshData, timestamp: now };
  }

  // Возвращаем копию данных без временной метки
  const { timestamp, ...data } = codeDataCache;
  return data;
}

// Обработка соединений Socket.io
io.on('connection', (socket) => {
  log(`Новое соединение: ${socket.id}`);

  // Устанавливаем таймаут для активности сокета
  let inactivityTimeout;

  const resetInactivityTimeout = () => {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(() => {
      // Отключаем неактивных пользователей через 2 часа
      if (socket.connected) {
        log(`Отключение ${socket.id} из-за неактивности`, 'warn');
        socket.disconnect(true);
      }
    }, 2 * 60 * 60 * 1000); // 2 часа
  };

  // Сбрасываем таймаут при любом событии от пользователя
  socket.onAny(() => {
    resetInactivityTimeout();
  });

  resetInactivityTimeout(); // Инициализация таймаута

  // Обработка авторизации
  socket.on('auth', (data) => {
    const { teamName } = data;

    // Проверяем, используется ли уже это имя команды другим пользователем
    const isTeamNameTaken = Object.values(onlineUsers).some(user => user.teamName === teamName);

    if (isTeamNameTaken) {
      // Если имя команды уже используется, отправляем ошибку
      socket.emit('auth_error', {
        message: 'Это имя команды уже используется. Пожалуйста, выберите другое.'
      });
      log(`Попытка авторизации с занятым именем команды: ${teamName}`, 'warn');
      return;
    }

    // Сохраняем данные пользователя
    onlineUsers[socket.id] = { teamName };

    // Отправляем успешную авторизацию
    socket.emit('auth_success', {
      teamName,
      teamData: null
    });

    // Обновляем счетчик онлайн пользователей
    io.emit('online_users_count', Object.keys(onlineUsers).length);

    log(`Пользователь авторизован: ${teamName}`);
  });

  // Обработка инициализации кода
  socket.on('initialize_code', () => {
    const userData = onlineUsers[socket.id];
    if (!userData) return; // Пользователь должен быть авторизован

    log(`${userData.teamName} запросил инициализацию кода`);

    // Получаем актуальные данные из кэша
    const codeData = getCachedCodeData();

    // Отправляем событие инициализации
    socket.emit('code_initialized');

    // Отправляем начальный код с небольшой задержкой
    setTimeout(() => {
      socket.emit('html_updated', {
        html: codeData.html,
        teamName: 'system'
      });
      socket.emit('css_updated', {
        css: codeData.css,
        teamName: 'system'
      });
      log('Начальный код отправлен');
    }, 300);
  });

  // Обновление HTML кода
  socket.on('update_html', (data) => {
    const { html, teamName, version, isContinuousEdit, isFinalEdit } = data;

    // Проверяем авторизацию пользователя
    const userData = onlineUsers[socket.id];
    if (!userData || userData.teamName !== teamName) return;

    // Добавляем версию, если ее нет
    data.version = version || 0;

    // Если это промежуточное обновление, просто транслируем его, не сохраняя в БД
    if (isContinuousEdit) {
      // Отправляем обновление всем, кроме отправителя
      socket.broadcast.emit('html_updated', {
        html,
        teamName,
        version: data.version,
        isContinuousEdit: true
      });

      log(`HTML обновление (промежуточное) от команды: ${teamName} (версия ${data.version})`);
      return;
    }

    // Сохраняем HTML в базу данных (для финальных или обычных обновлений)
    updateCode('html', html, teamName)
      .then(() => {
        // Обновляем кэш
        if (codeDataCache) {
          codeDataCache.html = html;
          codeDataCache.timestamp = Date.now();
          codeDataCache.htmlVersion = version || 0;
        }

        // Отправляем обновление всем, кроме отправителя
        socket.broadcast.emit('html_updated', {
          html,
          teamName,
          version: data.version,
          isFinalEdit: isFinalEdit || false
        });

        log(`HTML обновлен командой: ${teamName} (версия ${data.version})${isFinalEdit ? ' (финальное)' : ''}`);
      })
      .catch((error) => {
        log(`Ошибка при обновлении HTML: ${error.message}`, 'error');
      });
  });

  // Обновление кода CSS
  socket.on('update_css', (data) => {
    const { css, teamName, version, isContinuousEdit, isFinalEdit } = data;

    // Проверяем авторизацию пользователя
    const userData = onlineUsers[socket.id];
    if (!userData || userData.teamName !== teamName) return;

    // Добавляем версию, если ее нет
    data.version = version || 0;

    // Если это промежуточное обновление, просто транслируем его, не сохраняя в БД
    if (isContinuousEdit) {
      // Отправляем обновление всем, кроме отправителя
      socket.broadcast.emit('css_updated', {
        css,
        teamName,
        version: data.version,
        isContinuousEdit: true
      });

      log(`CSS обновление (промежуточное) от команды: ${teamName} (версия ${data.version})`);
      return;
    }

    // Сохраняем CSS в базу данных (для финальных или обычных обновлений)
    updateCode('css', css, teamName)
      .then(() => {
        // Обновляем кэш
        if (codeDataCache) {
          codeDataCache.css = css;
          codeDataCache.timestamp = Date.now();
          codeDataCache.cssVersion = version || 0;
        }

        // Отправляем обновление всем, кроме отправителя
        socket.broadcast.emit('css_updated', {
          css,
          teamName,
          version: data.version,
          isFinalEdit: isFinalEdit || false
        });

        log(`CSS обновлен командой: ${teamName} (версия ${data.version})${isFinalEdit ? ' (финальное)' : ''}`);
      })
      .catch((error) => {
        log(`Ошибка при обновлении CSS: ${error.message}`, 'error');
      });
  });

  // Обновление позиции курсора (оптимизировано для частых обновлений)
  socket.on('cursor_position', (data) => {
    const { x, y, teamName } = data;

    // Проверяем авторизацию пользователя
    const userData = onlineUsers[socket.id];
    if (!userData || userData.teamName !== teamName) return;

    // Отправляем позицию курсора всем, кроме отправителя
    socket.broadcast.emit('cursor_moved', { x, y, teamName });
  });

  // Обработка отключения
  socket.on('disconnect', () => {
    clearTimeout(inactivityTimeout); // Очищаем таймаут при отключении

    const userData = onlineUsers[socket.id];

    if (userData) {
      const { teamName } = userData;

      // Удаляем пользователя из списка онлайн
      delete onlineUsers[socket.id];

      // Обновляем счетчик онлайн пользователей
      io.emit('online_users_count', Object.keys(onlineUsers).length);

      // Отправляем уведомление об отключении пользователя
      io.emit('user_disconnected', { teamName });

      log(`Пользователь отключился: ${teamName}`);
    }

    log(`Соединение закрыто: ${socket.id}`);
  });
});

// Запускаем сервер
server.listen(PORT, () => {
  log(`Сервер запущен на порту ${PORT}`);

  try {
    // Инициализируем кэш при запуске сервера
    const initialData = getCodeData();
    if (initialData) {
      codeDataCache = { ...initialData, timestamp: Date.now() };
      log('Кэш кода успешно инициализирован');
    } else {
      log('Не удалось получить начальные данные для кэша', 'warn');
    }
  } catch (error) {
    log(`Ошибка при инициализации кэша: ${error.message}`, 'error');
  }
});