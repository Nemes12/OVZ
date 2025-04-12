import { appInitializer } from './app-initializer.js';
import { EditorResizer } from './editor-resizer.js';

// main.js
// Основной файл для инициализации приложения

// Делаем доступным глобально для доступа из функций полноэкранного режима
window.appInitializer = appInitializer;

/**
 * Инициализация приложения после загрузки DOM
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Инициализация приложения...');

    // Проверка на мобильные устройства
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        document.body.classList.add('mobile-device');
    }

    // Перехват ошибок
    window.addEventListener('error', (event) => {
        console.error('Необработанная ошибка:', event.error);
    });

    // Дополнительная проверка инициализации Monaco
    if (!window.monaco && !window.monacoInitializing) {
        window.monacoInitializing = true;
        console.log('Принудительная инициализация Monaco Editor...');
        require(['vs/editor/editor.main'], function() {
            console.log('Monaco Editor успешно загружен из main.js');
            window.monaco = monaco;
            window.dispatchEvent(new Event('monaco_loaded'));
        });
    }

    // Инициализация разделителя редакторов
    const editorResizer = new EditorResizer();

    console.log('Приложение инициализировано');
});