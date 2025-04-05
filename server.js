import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';

const __dirname = path.resolve();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.static(path.join(__dirname)));

// И добавим явный маршрут для корневого пути
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Хранение данных о пользователях и командах
const teams = {};
const onlineUsers = {};
const codeData = {
  html: `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="style.css">
    <title>Изображения</title>
</head>
<body>
    <div class="gallery">
 <!-- Рабоча зона команды 1-->       
        <img class="img1" src="https://sun9-65.userapi.com/impg/UtNCKnF7FJR7wx9rpWbCw9k5WZdKFUbej5HQqA/CMwiXLXomTM.jpg?size=208x290&quality=95&sign=62fa5c78840d95aca2af76323fd9c4bb&type=album" alt="Изображение 1">
        
 <!-- Рабоча зона команды 2-->       
      <img class="img2" src="https://sun9-79.userapi.com/impg/9q_JmFSsTqNhD_Pc8a2JuxLueNkQyRfT59EeWQ/hU4UAOnK5s4.jpg?size=209x290&quality=95&sign=3903ae3486de5519b515ea50be4899e6&type=album" alt="Изображение 2">
      
  <!-- Рабоча зона команды 3-->      
      <img class="img3" src="https://sun9-29.userapi.com/impg/_JqcvwgV7oNG8Zekk3w4hMQeL2ZYYIWI7GdCmA/HWNxhX5wzdQ.jpg?size=208x291&quality=95&sign=237c8d4da590e08588cf10e19ce8738d&type=album" alt="Изображение 3">
        
  <!-- Рабоча зона команды 4-->      
      <img class="img4" src="https://sun9-37.userapi.com/impg/AeXefsKJbuq0mi1ngncZoGrX8SP9fmjkD0fYhg/0A72DM4-18U.jpg?size=209x291&quality=95&sign=87d47a4452a4f401fee59eb7761ae068&type=album" alt="Изображение 4">
    </div>
</body>
</html>`,
  css: `body {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    margin: 0;
    background-color: #f0f0f0;
}

.gallery {
    display: grid;
    grid-template-columns: repeat(2, 1fr); /* 2 колонки */
    gap: 0px; /* Расстояние между изображениями */
}

.gallery img {
    width: 100%; /* Ширина изображения 100% от ячейки */
    height: auto; /* Автоматическая высота для сохранения пропорций */
}

/*Рабоча зона команды 1*/
.img1 {
    max-width: 100%; /* Адаптивная ширина */
    height: auto; /* Автоматическая высота для сохранения пропорций */  
}

/*Рабоча зона команды 2*/
.img2 {
    max-width: 100%; /* Адаптивная ширина */
    height: auto; /* Автоматическая высота для сохранения пропорций */
}

/*Рабоча зона команды 3*/
.img3 {
    max-width: 100%; /* Адаптивная ширина */
    height: auto; /* Автоматическая высота для сохранения пропорций */ 
}

/*Рабоча зона команды 4*/
.img4 {
    max-width: 100%; /* Адаптивная ширина */
   height: auto; /* Автоматическая высота для сохранения пропорций */  
}`
};

// Обработка соединений Socket.io
io.on('connection', (socket) => {
  console.log('Новое соединение:', socket.id);
  
  // Обработка авторизации
  socket.on('auth', (data) => {
    const { teamName } = data;
    
    // Сохраняем данные пользователя
    onlineUsers[socket.id] = { teamName };
    
    // Отправляем успешную авторизацию
    socket.emit('auth_success', { 
      teamName,
      teamData: null
    });
    
    // Обновляем счетчик онлайн пользователей
    io.emit('online_users_count', Object.keys(onlineUsers).length);
    
    console.log(`Пользователь авторизован: ${teamName}`);
  });

  // Обработка инициализации кода
  socket.on('initialize_code', () => {
    const userData = onlineUsers[socket.id];
    if (userData && userData.teamName === 'admin') {
      console.log('Админ инициализировал код');
      // Отправляем событие всем клиентам
      io.emit('code_initialized');
      
      // Отправляем начальный код всем клиентам с небольшой задержкой
      setTimeout(() => {
        socket.broadcast.emit('html_updated', { 
          html: codeData.html, 
          teamName: 'admin' 
        });
        socket.broadcast.emit('css_updated', { 
          css: codeData.css, 
          teamName: 'admin' 
        });
        console.log('Начальный код отправлен всем клиентам');
      }, 1000); // Добавляем 1 секунду задержки для надежности
    }
  });
  
  // Обновление HTML кода
  socket.on('update_html', (data) => {
    const { html, teamName } = data;
    codeData.html = html;
    
    // Отправляем обновление всем, кроме отправителя
    socket.broadcast.emit('html_updated', { html, teamName });
    
    console.log(`HTML обновлен командой: ${teamName}`);
  });
  
  // Обновление кода CSS
  socket.on('update_css', (data) => {
    const { css, teamName } = data;
    codeData.css = css;
    
    // Отправляем обновление всем, кроме отправителя
    socket.broadcast.emit('css_updated', { css, teamName });
    
    console.log(`CSS обновлен командой: ${teamName}`);
  });
  
  // Обновление позиции курсора
  socket.on('cursor_position', (data) => {
    const { x, y, teamName } = data;
    
    // Отправляем позицию курсора всем, кроме отправителя
    socket.broadcast.emit('cursor_moved', { x, y, teamName });
  });
  
  // Обработка отключения
  socket.on('disconnect', () => {
    const userData = onlineUsers[socket.id];
    
    if (userData) {
      const { teamName } = userData;
      
      // Удаляем пользователя из списка онлайн
      delete onlineUsers[socket.id];
      
      // Обновляем счетчик онлайн пользователей
      io.emit('online_users_count', Object.keys(onlineUsers).length);
      
      // Отправляем уведомление об отключении пользователя
      io.emit('user_disconnected', { teamName });
      
      console.log(`Пользователь отключился: ${teamName}`);
    }
    
    console.log('Соединение закрыто:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});