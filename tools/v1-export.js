;(function exportMeridianV1() {
  var PREFIX = 'meridian.'

  var data = {}
  var unreadable = {}
  var count = 0

  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i)
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
    origin: location.origin,
    data: data,
  }
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
