import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Функция для логирования с временными метками
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [DB] [${level.toUpperCase()}] ${message}`;
  
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

// Сохраняем начальные значения для кода и время инициализации
const APP_START_TIME = Date.now();

// Начальные значения для кода (не меняем, просто оптимизируем доступ)
const INITIAL_HTML = `<!DOCTYPE html>
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
   <img class="img1" src="" alt="Изображение 1">          
    
   <!-- Рабоча зона команды 2-->              
   <img class="img2" src="" alt="Изображение 2">         
    
   <!-- Рабоча зона команды 3-->            
    <img class="img3" src="" alt="Изображение 3">            
     
   <!-- Рабоча зона команды 4-->            
    <img class="img4" src="" alt="Изображение 4">    
   
   </div> 
   </body> 
  </html>`;

const INITIAL_CSS = `body {     
 display: flex;    
 justify-content: center;     
 align-items: center;     
 height: 100vh;     
 margin: 0;     
 background-color: #f0f0f0; 
}  

.gallery {    
 display: grid;     
 grid-template-columns: repeat(2, 1fr);     /* 2 колонки */     
 gap: 0px;     /* Расстояние между изображениями */ 
}  

.gallery img {     
 width: 100%;     /* Ширина изображения 100% от ячейки */     
 height: auto;     /* Автоматическая высота для сохранения пропорций */ 
} 

/*Рабоча зона команды 1*/
.img1 {    
 max-width: 100%;     /* Адаптивная ширина */    
 height: auto;     /* Автоматическая высота для сохранения пропорций */ 
}  

/*Рабоча зона команды 2*/
.img2 {    
 max-width: 100%;     /* Адаптивная ширина */    
 height: auto;     /* Автоматическая высота для сохранения пропорций */ 
}  

/*Рабоча зона команды 3*/
.img3 {    
 max-width: 100%;     /* Адаптивная ширина */    
 height: auto;     /* Автоматическая высота для сохранения пропорций */ 
}  

/*Рабоча зона команды 4*/
.img4 {    
 max-width: 100%;     /* Адаптивная ширина */    
 height: auto;     /* Автоматическая высота для сохранения пропорций */ 
}`;

// Подготовленные запросы для оптимизации
let selectHtmlStmt;
let selectCssStmt;
let updateCodeStmt;
let insertHistoryStmt;

// Создание и инициализация базы данных
function initDB() {
  // Проверяем существование директории data
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // База данных будет в папке data
  const dbPath = path.join(dataDir, 'code.db');
  
  // Оптимизируем настройки базы данных
  const db = new Database(dbPath, {
    // Режим журналирования WAL для лучшей производительности
    pragma: {
      journal_mode: 'WAL',
      synchronous: 'NORMAL',
      cache_size: -64000, // 64MB кэш в памяти
      foreign_keys: 'ON'
    }
  });

  // Создаем таблицу для кодов, если она не существует
  db.exec(`
    CREATE TABLE IF NOT EXISTS code_data (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Создаем таблицу для истории изменений
  db.exec(`
    CREATE TABLE IF NOT EXISTS code_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      user TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  
  // Создаем индекс для ускорения поиска по истории
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_history_type 
    ON code_history(type, created_at DESC)
  `);

  // Проверяем, существуют ли записи для HTML и CSS
  const htmlRecord = db.prepare('SELECT * FROM code_data WHERE type = ?').get('html');
  const cssRecord = db.prepare('SELECT * FROM code_data WHERE type = ?').get('css');

  // Если записей нет, добавляем начальные значения
  if (!htmlRecord) {
    db.prepare('INSERT INTO code_data (id, type, content, updated_at) VALUES (?, ?, ?, ?)').run(
      1, 'html', INITIAL_HTML, APP_START_TIME
    );
  }

  if (!cssRecord) {
    db.prepare('INSERT INTO code_data (id, type, content, updated_at) VALUES (?, ?, ?, ?)').run(
      2, 'css', INITIAL_CSS, APP_START_TIME
    );
  }
  
  // Подготавливаем запросы для оптимизации
  selectHtmlStmt = db.prepare("SELECT content FROM code_data WHERE type = 'html'");
  selectCssStmt = db.prepare("SELECT content FROM code_data WHERE type = 'css'");
  updateCodeStmt = db.prepare('UPDATE code_data SET content = ?, updated_at = ? WHERE type = ?');
  insertHistoryStmt = db.prepare('INSERT INTO code_history (type, content, user, created_at) VALUES (?, ?, ?, ?)');

  return db;
}

// Получение экземпляра базы данных
let db;
try {
  db = initDB();
  log('База данных успешно инициализирована');
} catch (error) {
  log(`Ошибка при инициализации базы данных: ${error.message}`, 'error');
}

// Оптимизированные функции для работы с базой данных
export function getCodeData() {
  try {
    // Проверяем, что запросы были инициализированы
    if (!selectHtmlStmt || !selectCssStmt) {
      log('Подготовленные запросы не инициализированы', 'error');
      return {
        html: INITIAL_HTML,
        css: INITIAL_CSS
      };
    }
    
    // Используем подготовленные запросы для получения данных
    const htmlResult = selectHtmlStmt.get();
    const cssResult = selectCssStmt.get();
    
    const htmlContent = htmlResult?.content || INITIAL_HTML;
    const cssContent = cssResult?.content || INITIAL_CSS;

    return {
      html: htmlContent,
      css: cssContent
    };
  } catch (error) {
    log(`Ошибка при получении данных из БД: ${error.message}`, 'error');
    return {
      html: INITIAL_HTML,
      css: INITIAL_CSS
    };
  }
}

// Добавляем семафор для предотвращения конкурентных обновлений
let isUpdating = false;
const updateQueue = [];

export function updateCode(type, content, userName) {
  // Добавляем задачу в очередь
  return new Promise((resolve, reject) => {
    updateQueue.push({ type, content, userName, resolve, reject });
    processUpdateQueue();
  });
}

// Функция для обработки очереди обновлений
function processUpdateQueue() {
  // Если уже обрабатываем или очередь пуста - выходим
  if (isUpdating || updateQueue.length === 0) return;
  
  isUpdating = true;
  
  // Получаем следующую задачу из очереди
  const { type, content, userName, resolve, reject } = updateQueue.shift();
  
  try {
    const timestamp = Date.now();
    
    // Начинаем транзакцию для атомарности операции
    const transaction = db.transaction(() => {
      // Обновляем текущее состояние кода
      updateCodeStmt.run(content, timestamp, type);
      
      // Добавляем запись в историю изменений
      insertHistoryStmt.run(type, content, userName, timestamp);
    });
    
    // Выполняем транзакцию
    transaction();
    
    // Задача выполнена успешно
    resolve(true);
  } catch (error) {
    log(`Ошибка при обновлении ${type} кода: ${error.message}`, 'error');
    reject(error);
  } finally {
    // Снимаем флаг и продолжаем обработку очереди
    isUpdating = false;
    
    // Если есть ещё задачи, продолжаем их обработку
    if (updateQueue.length > 0) {
      processUpdateQueue();
    }
  }
}

export function resetToInitialState() {
  try {
    const timestamp = Date.now();
    
    // Используем транзакцию для атомарности
    const transaction = db.transaction(() => {
      // Сбрасываем HTML и CSS к начальным значениям
      updateCodeStmt.run(INITIAL_HTML, timestamp, 'html');
      updateCodeStmt.run(INITIAL_CSS, timestamp, 'css');
      
      // Добавляем запись в историю об этом сбросе
      insertHistoryStmt.run('html', INITIAL_HTML, 'admin_reset', timestamp);
      insertHistoryStmt.run('css', INITIAL_CSS, 'admin_reset', timestamp);
    });
    
    // Выполняем транзакцию
    transaction();
    
    log('Данные успешно сброшены к начальному состоянию');
    return true;
  } catch (error) {
    log(`Ошибка при сбросе данных: ${error.message}`, 'error');
    return false;
  }
}

export function getCodeHistory(limit = 10) {
  try {
    // Подготавливаем запрос для получения истории
    const stmt = db.prepare(`
      SELECT * FROM code_history 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit);
  } catch (error) {
    log(`Ошибка при получении истории изменений: ${error.message}`, 'error');
    return [];
  }
}

export default {
  getCodeData,
  updateCode,
  resetToInitialState,
  getCodeHistory
}; 