/**
 * Експорт даних Meridian V1 у файл (MER-48).
 *
 * `localStorage` прив'язаний до origin, тож дотягнутися до нього ззовні — ні
 * скриптом на сервері, ні з іншої вкладки — неможливо. Єдиний спосіб забрати
 * дані — виконати цей код НА сторінці V1.
 *
 * ## Як користуватись
 *
 *  1. Відкрити Meridian V1 **на тій самій адресі, де ним користуються**. Це
 *     найважливіший крок: `file://` — це інший origin і інше (порожнє) сховище,
 *     тож відкритий «з файлу» застосунок покаже нуль записів, хоча дані на місці.
 *  2. Відкрити консоль браузера (F12 → Console).
 *  3. Вставити вміст цього файлу цілком і натиснути Enter.
 *  4. Браузер збереже `meridian-v1-export.json` — його й підсовують V2 на
 *     вкладці «Сім'я» → «Перенести дані з V1».
 *
 * ## Що всередині файлу
 *
 * Знімок сховища як він є: ключ → розібране значення. Нічого не
 * перейменовується й не «нормалізується» — розбір даних робить V2
 * (`migrateV1` у `packages/core`), і робить його з тестами.
 *
 *  - **Ключа, якого немає, у файлі немає взагалі.** Порожня заглушка потім не
 *    відрізнялася б від справжніх порожніх даних.
 *  - Ключ із поламаним JSON лягає в окремий розділ `unreadable` **сирим
 *    рядком**: втратити його мовчки не можна, а вдавати, що він розібрався, —
 *    тим паче. V2 покаже такий ключ у списку пропущеного.
 */

;(function exportMeridianV1() {
  var PREFIX = 'meridian.'

  var data = {}
  var unreadable = {}
  var count = 0

  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i)
    /* Беремо всі ключі застосунку, а не перелік відомих: тижні й календар
     * розкладені по профілях (`meridian.week.v1.<profileId>`), і фіксований
     * список тихо загубив би профіль, про який ми не знали. */
    if (!key || key.indexOf(PREFIX) !== 0) continue

    var raw = localStorage.getItem(key)
    if (raw === null) continue
    try {
      data[key] = JSON.parse(raw)
      count++
    } catch (e) {
      unreadable[key] = raw
    }
  }

  var dump = {
    format: 'meridian-v1-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    /* Звідки саме знято дамп — щоб було видно, якщо його випадково зняли з
     * порожнього `file://` замість робочої адреси. */
    origin: location.origin,
    data: data,
  }
  /* Розділу немає, якщо ламати не було чого — те саме правило, що й для ключів. */
  if (Object.keys(unreadable).length) dump.unreadable = unreadable

  var blob = new Blob([JSON.stringify(dump, null, 2)], {
    type: 'application/json',
  })
  var url = URL.createObjectURL(blob)
  var link = document.createElement('a')
  link.href = url
  link.download = 'meridian-v1-export.json'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  console.log(
    'Meridian: збережено meridian-v1-export.json — ключів ' +
      count +
      (Object.keys(unreadable).length
        ? ', нечитабельних ' + Object.keys(unreadable).length
        : ''),
  )
  if (!count && !Object.keys(unreadable).length) {
    console.warn(
      'Meridian: у цьому сховищі даних немає. Перевірте, що сторінку' +
        ' відкрито на тій самій адресі, де ви користуєтесь застосунком' +
        ' (file:// має власне порожнє сховище).',
    )
  }
})()
