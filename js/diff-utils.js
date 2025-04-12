// diff-utils.js
// Утилиты для работы с библиотекой diff-match-patch

// Импортируем библиотеку diff-match-patch
// Библиотека не использует ES модули, поэтому мы должны импортировать её через скрипт-тег

// Создаем экземпляр diff_match_patch
// Предполагается, что diff_match_patch уже доступен глобально через скрипт-тег в HTML
const dmp = new diff_match_patch();

// Константы для типов операций
export const DIFF_DELETE = -1;
export const DIFF_INSERT = 1;
export const DIFF_EQUAL = 0;

/**
 * Находит различия между двумя строками текста
 * @param {string} oldText - Исходный текст
 * @param {string} newText - Новый текст
 * @param {boolean} cleanup - Выполнить семантическую очистку результатов
 * @return {Array} - Массив различий
 */
export function findDifferences(oldText, newText, cleanup = true) {
  const diffs = dmp.diff_main(oldText || '', newText || '');

  if (cleanup) {
    dmp.diff_cleanupSemantic(diffs);
  }

  return diffs;
}

/**
 * Создает патч на основе двух текстов
 * @param {string} oldText - Исходный текст
 * @param {string} newText - Новый текст
 * @return {Array} - Массив патчей
 */
export function createPatches(oldText, newText) {
  return dmp.patch_make(oldText || '', newText || '');
}

/**
 * Создает патч на основе различий
 * @param {string} text - Исходный текст
 * @param {Array} diffs - Различия
 * @return {Array} - Массив патчей
 */
export function createPatchesFromDiffs(text, diffs) {
  return dmp.patch_make(text || '', diffs);
}

/**
 * Преобразует патчи в текстовое представление
 * @param {Array} patches - Массив патчей
 * @return {string} - Текстовое представление патчей
 */
export function patchesToText(patches) {
  return dmp.patch_toText(patches);
}

/**
 * Преобразует текстовое представление в патчи
 * @param {string} textPatches - Текстовое представление патчей
 * @return {Array} - Массив патчей
 */
export function textToPatches(textPatches) {
  return dmp.patch_fromText(textPatches);
}

/**
 * Применяет патчи к тексту
 * @param {string} text - Исходный текст
 * @param {Array} patches - Массив патчей
 * @return {Array} - [Результирующий текст, Массив успешности применения патчей]
 */
export function applyPatches(text, patches) {
  return dmp.patch_apply(patches, text || '');
}

/**
 * Находит точку слияния двух версий текста относительно общей базовой версии
 * @param {string} baseText - Базовый текст
 * @param {string} text1 - Первая версия текста
 * @param {string} text2 - Вторая версия текста
 * @return {string} - Слитый текст
 */
export function mergeTexts(baseText, text1, text2) {
  // Находим различия между базовым текстом и каждой из версий
  const diffs1 = findDifferences(baseText, text1);
  const diffs2 = findDifferences(baseText, text2);

  // Создаем патчи для обеих версий
  const patches1 = createPatchesFromDiffs(baseText, diffs1);
  const patches2 = createPatchesFromDiffs(baseText, diffs2);

  // Применяем патчи последовательно (сначала text1, затем text2)
  const [resultWithText1] = applyPatches(baseText, patches1);
  const [mergedResult] = applyPatches(resultWithText1, patches2);

  return mergedResult;
}

/**
 * Создает HTML представление различий для отображения
 * @param {Array} diffs - Массив различий
 * @return {string} - HTML представление различий
 */
export function diffsToHtml(diffs) {
  return dmp.diff_prettyHtml(diffs);
}

/**
 * Находит наилучшее соответствие для шаблона в тексте
 * @param {string} pattern - Шаблон для поиска
 * @param {string} text - Текст, в котором искать
 * @return {number} - Индекс лучшего совпадения или -1, если не найдено
 */
export function findBestMatch(pattern, text) {
  return dmp.match_main(text || '', pattern || '', 0);
}

/**
 * Получает простой текст из различий (без учета удалений)
 * @param {Array} diffs - Массив различий
 * @return {string} - Текст без удаленных фрагментов
 */
export function getTextFromDiffs(diffs) {
  return diffs
    .filter(diff => diff[0] !== DIFF_DELETE)
    .map(diff => diff[1])
    .join('');
}

/**
 * Определяет, есть ли конфликты при слиянии двух версий
 * @param {string} baseText - Базовый текст
 * @param {string} text1 - Первая версия текста
 * @param {string} text2 - Вторая версия текста
 * @return {boolean} - true, если есть конфликты
 */
export function hasConflicts(baseText, text1, text2) {
  const diffs1 = findDifferences(baseText, text1);
  const diffs2 = findDifferences(baseText, text2);

  // Анализируем изменения для выявления конфликтов
  // Конфликт возникает, когда оба пользователя меняют один и тот же блок текста

  const changedRangesText1 = getChangedRanges(diffs1, baseText);
  const changedRangesText2 = getChangedRanges(diffs2, baseText);

  // Проверяем пересечение измененных диапазонов
  for (const range1 of changedRangesText1) {
    for (const range2 of changedRangesText2) {
      if (rangesOverlap(range1, range2)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Получает диапазоны изменений из различий
 * @param {Array} diffs - Массив различий
 * @return {Array} - Массив диапазонов [start, end]
 */
function getChangedRanges(diffs) {
  const ranges = [];
  let position = 0;
  let currentStart = -1;

  for (const diff of diffs) {
    const [operation, content] = diff;

    // Обрабатываем операции изменения (вставки и удаления)
    if (operation !== DIFF_EQUAL) {
      if (currentStart === -1) {
        // Начало нового диапазона изменений
        currentStart = position;
      }

      // Если это удаление, добавляем его длину к позиции
      if (operation === DIFF_DELETE) {
        position += content.length;
      }
    } else {
      // Если мы находимся в равном фрагменте и у нас был открыт диапазон изменений
      if (currentStart !== -1) {
        // Закрываем текущий диапазон и добавляем его в список
        ranges.push([currentStart, position]);
        currentStart = -1;
      }

      // Для равного фрагмента добавляем его длину к текущей позиции
      position += content.length;
    }
  }

  // Если остался незакрытый диапазон изменений
  if (currentStart !== -1) {
    ranges.push([currentStart, position]);
  }

  // Объединим близкие или перекрывающиеся диапазоны
  return mergeCloseRanges(ranges);
}

/**
 * Объединяет близкие или перекрывающиеся диапазоны
 * @param {Array} ranges - Массив диапазонов [start, end]
 * @param {number} threshold - Пороговое значение для объединения близких диапазонов
 * @return {Array} - Объединенный массив диапазонов
 */
function mergeCloseRanges(ranges, threshold = 3) {
  if (ranges.length <= 1) {
    return ranges;
  }

  // Сортируем диапазоны по начальной позиции
  const sortedRanges = [...ranges].sort((a, b) => a[0] - b[0]);
  const mergedRanges = [sortedRanges[0]];

  for (let i = 1; i < sortedRanges.length; i++) {
    const currentRange = sortedRanges[i];
    const lastMergedRange = mergedRanges[mergedRanges.length - 1];

    // Если текущий диапазон пересекается с последним объединенным или находится очень близко к нему
    if (currentRange[0] <= lastMergedRange[1] + threshold) {
      // Объединяем диапазоны, расширяя последний объединенный
      lastMergedRange[1] = Math.max(lastMergedRange[1], currentRange[1]);
    } else {
      // Иначе добавляем новый диапазон
      mergedRanges.push(currentRange);
    }
  }

  return mergedRanges;
}

/**
 * Проверяет, пересекаются ли два диапазона
 * @param {Array} range1 - Первый диапазон [start, end]
 * @param {Array} range2 - Второй диапазон [start, end]
 * @return {boolean} - true, если диапазоны пересекаются или находятся близко друг к другу
 */
function rangesOverlap(range1, range2, proximity = 2) {
  // Проверяем строгое пересечение
  if (Math.max(range1[0], range2[0]) <= Math.min(range1[1], range2[1])) {
    return true;
  }

  // Проверяем близость диапазонов (почти пересечение)
  // Учитываем случай, когда конец одного диапазона близко к началу другого
  const gap1 = range2[0] - range1[1]; // Разрыв, если range1 идет перед range2
  const gap2 = range1[0] - range2[1]; // Разрыв, если range2 идет перед range1

  return (gap1 >= 0 && gap1 <= proximity) || (gap2 >= 0 && gap2 <= proximity);
}
