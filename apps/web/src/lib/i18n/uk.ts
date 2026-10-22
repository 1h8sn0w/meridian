import type {
  GenerateFailure,
  MealType,
  PlanFlag,
  PoolShortage,
  SlotFailure,
  SwapReason,
  WeekWarning,
} from '@meridian/core'

const RULES = new Intl.PluralRules('uk-UA')

function plural(n: number, one: string, few: string, many: string): string {
  const forms: Partial<Record<Intl.LDMLPluralRule, string>> = { one, few }
  return forms[RULES.select(n)] ?? many
}

const MEAL_TYPE: Record<MealType, string> = {
  breakfast: 'Сніданок',
  lunch: 'Обід',
  dinner: 'Вечеря',
  snack: 'Перекус',
}

const MEAL_TYPE_OF: Record<MealType, string> = {
  breakfast: 'сніданку',
  lunch: 'обіду',
  dinner: 'вечері',
  snack: 'перекусу',
}

const days = (n: number) => n + ' ' + plural(n, 'день', 'дні', 'днів')
const meals = (n: number) => n + ' ' + plural(n, 'страва', 'страви', 'страв')
const mealsAccusative = (n: number) =>
  n + ' ' + plural(n, 'страву', 'страви', 'страв')
const slots = (n: number) => n + ' ' + plural(n, 'слот', 'слоти', 'слотів')

const poolShortage = (
  shortage: ReadonlyArray<PoolShortage>,
  antiRepeatDays: number,
) =>
  'Недостатньо страв у пулі. Правило «не частіше, ніж раз на ' +
  antiRepeatDays +
  ' дн.» вимагає щонайменше ' +
  antiRepeatDays +
  ' страв кожного типу, а зараз: ' +
  shortage
    .map(
      ({ type, have, need }) =>
        MEAL_TYPE[type] + ' — ' + have + ' (потрібно ≥ ' + need + ')',
    )
    .join('; ') +
  '. Додайте страви на екрані «Страви» або зменшіть антиповтор на екрані «Сьогодні».'

export const uk = {
  common: {
    close: 'Закрити',
    retry: 'Спробувати ще раз',
    save: 'Зберегти',
    cancel: 'Скасувати',
    delete: 'Видалити',
    minutes: (n: number) => n + ' хв',
    todayTag: 'сьогодні',
    profileFirst: 'Спершу — профіль',
    mealRemoved: 'страву видалено з пулу',
    openWeekScreen: 'Відкрити екран «Тиждень»',
    macroFields: {
      protein: 'Білки, г',
      fat: 'Жири, г',
      carbs: 'Вуглеводи, г',
    },
    mealType: MEAL_TYPE,
    kcalUnit: 'ккал',
    kcal: (value: string | number) => value + ' ккал',
    grams: (value: string) => value + ' г',
    days,
    at: (day: string, time: string) => day + ' о ' + time,
    queryProblem: (message: string) => 'Запит до бази: ' + message,
  },
  titles: {
    today: 'Сьогодні',
    week: 'Тиждень',
    calendar: 'Календар',
    meals: 'Страви',
    recipe: 'Рецепт',
    shopping: 'Список покупок',
    family: 'Сім’я',
  },
  gate: {
    notConfigured: 'Застосунок не налаштовано',
    noSupabase: 'Немає адреси Supabase',
    serverMissing:
      'Сервер не отримав {url} і {key}. Де їх узяти — в {readme}; для {dev} — в {example}.',
    loading: 'Хвилинку…',
    localDbPending: 'Готуємо локальну базу…',
  },
  profileSwitcher: {
    manage: 'Керувати профілями',
    summary: (name: string, target: number, corridor: number) =>
      name + ' · ' + target + ' ± ' + corridor + ' ккал/день',
  },
  antiRepeat: {
    title: 'Антиповтор',
    label: 'Страва не частіше, ніж раз на',
    hint: "Правило спільне для всієї сім'ї. Діє з наступної генерації тижня й заміни страви; вже складені плани не перераховуються.",
    savedBroken: (value: string) =>
      "Антиповтор сім'ї збережено з помилкою: " + value + '.',
  },
  search: {
    label: 'Пошук страв',
    placeholder: 'Назва або інгредієнт',
    clear: 'Очистити пошук',
    found: (n: number) => 'Знайдено ' + mealsAccusative(n),
    notFound: (query: string) =>
      'Немає страв, де в назві чи інгредієнтах є «' + query + '»',
  },
  dayTotal: {
    unknown: 'Калорійність дня невідома — у страв цього дня немає цифр.',
    total: (total: string) => 'Разом за день: ' + total,
    target: (target: number, corridor: number) =>
      ' · ціль ' + target + ' ± ' + corridor + ' ккал',
    incomplete: (n: number) => ' · сума неповна: без цифр ' + slots(n),
    outside: ' · поза коридором',
  },
  taste: {
    favorite: 'Улюблене',
    disliked: 'Не подобається',
  },
  today: {
    current: 'Поточна страва',
    noWindows: 'Часових вікон прийомів немає — годинник дня порожній.',
    outsidePlan:
      'Сьогодні поза періодом збереженого плану — перегенеруйте тиждень.',
    mealRemoved: 'Страву цього слота видалено з пулу — перегенеруйте тиждень.',
    nextOutsidePlan:
      'Наступний прийом уже поза періодом плану — перегенеруйте тиждень.',
    now: (type: MealType, until: string) =>
      'Зараз: ' + MEAL_TYPE[type] + ' (до ' + until + ')',
    next: (type: MealType, at: string, tomorrow: boolean) =>
      'Далі: ' + MEAL_TYPE[type] + ' о ' + at + (tomorrow ? ' (завтра)' : ''),
    swap: 'Замінити страву',
  },
  firstSteps: {
    title: 'Перші кроки',
    done: ' — зроблено',
    profile: 'Профіль',
    profileDone: 'Створено.',
    profileText:
      'Ціль калорійності, коридор і порція з плану дієтолога — під них генератор збирає тиждень.',
    createProfile: 'Створити профіль',
    mealsEmpty: 'Стартовий набір, імпорт із PDF дієтолога або вручну.',
    mealsShort: (count: number, need: number, have: string) =>
      'У пулі ' +
      meals(count) +
      ', але на тиждень замало: потрібно щонайменше ' +
      meals(need) +
      ' з калорійністю кожного типу. Зараз — ' +
      have +
      '.',
    mealsCount: (count: number) => 'У пулі ' + meals(count) + '.',
    openMeals: 'Відкрити «Страви»',
    weekText:
      'Генератор збере тиждень із пулу, і тут з’явиться страва поточного прийому.',
    openWeek: 'Відкрити «Тиждень»',
  },
  clock: {
    night: 'Ніч',
    nowMeal: (time: string, type: MealType) =>
      'Зараз ' + time + ' — час ' + MEAL_TYPE_OF[type] + '.',
    nowNight: (time: string) => 'Зараз ' + time + ' — нічний час.',
    nextMeal: (type: MealType, at: string) =>
      ' ' + MEAL_TYPE[type] + ' о ' + at + '.',
    until: (time: string) => 'до ' + time,
    nextShort: (type: MealType, at: string) =>
      MEAL_TYPE[type].toLowerCase() + ' о ' + at,
  },
  mealHours: {
    title: 'Час прийомів',
    change: 'Змінити час прийомів',
    start: 'Початок',
    end: 'Кінець',
    hint: "Час спільний для всієї сім'ї: його побачать усі пристрої, і нагадування прийдуть за ним. Перекус — між обідом і вечерею.",
    reset: 'Скинути до стандартних',
    timeRange: 'Час — від 00:00 до 24:00 із кроком 15 хвилин.',
    startBeforeEnd: 'Початок має бути раніше за кінець.',
    afterPrevious: (type: MealType, previous: MealType, end: string) =>
      MEAL_TYPE[type] +
      ' має починатися не раніше за кінець ' +
      MEAL_TYPE_OF[previous] +
      ' (' +
      end +
      ').',
    savedPartly: 'Часові вікна прийомів збережено не повністю.',
    savedBroken: (problem: string) => 'Часові вікна прийомів: ' + problem,
  },
  reminders: {
    title: 'Нагадування',
    enable: 'Нагадувати перед прийомами',
    lead: 'Випередження',
    today: 'Сьогодні: ',
    hint: 'Нагадування шле сама сторінка, тож вони приходять, поки застосунок відкритий: сервера пушів у застосунку немає. На iPhone сповіщення працюють лише у встановленому застосунку («Додати на екран «Додому»»).',
    test: 'Надіслати тестове сповіщення',
    permission: {
      denied:
        'Сповіщення заблоковані для цього сайту — дозвольте їх у налаштуваннях браузера.',
      default: 'Дозвіл на сповіщення не надано.',
      unsupported: 'Цей браузер не підтримує сповіщень.',
    },
    notificationTitle: (type: MealType, lead: number, at: string) =>
      MEAL_TYPE[type] +
      (lead ? ' за ' + lead + ' хв' : ' починається') +
      ' · о ' +
      at,
    noPlan: 'На цей прийом плану немає — згенеруйте тиждень.',
  },
  auth: {
    tagline: 'Планувальник харчування для сім’ї',
    signIn: 'Вхід',
    signUp: 'Реєстрація',
    signInHint: 'Раціон, страви й список покупок спільні для всієї сім’ї.',
    signUpHint:
      'Після реєстрації створите сім’ю або приєднаєтесь до наявної за кодом.',
    email: 'Пошта',
    password: 'Пароль',
    passwordHint: 'Мінімум 6 символів.',
    submitSignIn: 'Увійти',
    submitSignUp: 'Зареєструватися',
    confirmSent: (address: string) =>
      'Акаунт створено. На ' +
      address +
      ' надіслано лист із підтвердженням — відкрийте його й поверніться сюди, щоб увійти.',
    noAccount: 'Ще немає акаунта? ',
    haveAccount: 'Уже маєте акаунт? ',
    signOut: 'Вийти',
  },
  familySetup: {
    signedInAs: (email: string | null) =>
      'Ви увійшли як ' + (email ?? 'невідомий акаунт'),
    create: 'Створити сім’ю',
    createHint:
      'Раціон, пул страв і список покупок будуть спільні для всіх, кого ви сюди запросите.',
    name: 'Назва сім’ї',
    creating: 'Створюємо…',
    submitCreate: 'Створити',
    join: 'Приєднатися за кодом',
    joinHint:
      'Код дає той, хто вже в сім’ї — на своєму екрані сім’ї. Дефіси, пробіли й регістр значення не мають.',
    code: 'Код запрошення',
    joining: 'Приєднуємось…',
    submitJoin: 'Приєднатися',
  },
  family: {
    subtitle: 'Страви, тижневий план і список покупок — спільні',
    members: 'У сім’ї',
    noEmail: 'акаунт без пошти',
    you: 'це ви',
    invite: 'Запросити',
    inviteHint: (until: string) =>
      'Одноразовий, дійсний до ' +
      until +
      ' Продиктуйте його тому, кого запрошуєте — він введе код після реєстрації.',
    noInvite:
      'Активного коду немає. Створіть — і передайте другому члену сім’ї.',
    preparing: 'Готуємо код…',
    newCode: 'Новий код',
    createCode: 'Створити код',
    language: 'Мова',
    languageLabel: 'Мова інтерфейсу',
    languageHint:
      'Вибір зберігається на цьому пристрої. Назви страв, рецепти й плани дієтолога не перекладаються.',
  },
  starter: {
    broken: 'Стартовий набір на сервері некоректний — страви не додано.',
    failed: 'Не вдалося додати стартовий набір.',
    add: 'Додати стартовий набір',
    missing: (n: number) =>
      'Страви з планів дієтолога, яких у пулі немає: ' +
      n +
      '. Наявні страви не зміняться.',
    offer: 'Страви з планів дієтолога, які адміністратор поклав на сервер.',
    added: (n: number) => 'Додано ' + mealsAccusative(n) + '.',
    allThere: 'Усі страви набору вже в пулі.',
  },
  details: {
    gerd: 'ГЕРХ',
    sourceIssue: 'У джерелі є розбіжність',
    sourceError: 'Помилка в джерелі.',
    sourceErrorText:
      ' У плані дієтолога тут розбіжність, значення занесено як є:',
    protein: 'Білки',
    fat: 'Жири',
    carbs: 'Вуглеводи',
    noMacros: 'БЖВ не вказано.',
    ingredients: 'Інгредієнти',
    noIngredients: 'Інгредієнти не вказані.',
    portion: 'Готова порція',
  },
  forms: {
    notNumber: (label: string) =>
      'Поле «' + label + '» має бути числом або лишитись порожнім.',
    negative: (label: string) => 'Поле «' + label + "» має бути невід'ємним.",
    nutrition: {
      calories: 'Калорійність',
      protein: 'Білки',
      fat: 'Жири',
      carbs: 'Вуглеводи',
    },
    portionField: (label: string, letter: string) =>
      label + ' · порція ' + letter,
    nameRequired: "Назва страви обов'язкова.",
    typeRequired: 'Оберіть тип слота.',
    profileNameRequired: "Ім'я профілю обов'язкове.",
    targetPositive: 'Цільова калорійність дня має бути додатним числом.',
    corridorNonNegative: "Коридор калорійності має бути невід'ємним числом.",
    sharedSelf: 'Профіль не може ділити план сам із собою.',
    sharedMissing: 'Профіль для спільного плану не знайдено.',
    sharedFollower: (owner: string) =>
      'Профіль «' +
      owner +
      '» сам користується спільним планом — оберіть профіль-власник.',
    sharedOwner: (name: string, dependants: string) =>
      'Профіль «' +
      name +
      '» уже є власником спільного плану для: ' +
      dependants +
      ". Спершу від'єднайте їх.",
    goalProtein: 'Ціль: білки',
    goalFat: 'Ціль: жири',
    goalCarbs: 'Ціль: вуглеводи',
    prepTime: 'Час приготування',
    servingsNumber: '«Порції» мають бути числом або лишитись порожніми.',
    servingsPositive: '«Порції» мають бути додатним числом.',
    caloriesMissing:
      'Впишіть калорійність — у PDF її немає, а без неї страва не потрапить у пул.',
    caloriesNumber:
      'Калорійність має бути числом — приберіть із поля все, крім цифр.',
    caloriesNonNegative: "Калорійність має бути невід'ємним числом.",
    servingsWhole: 'Порції — ціле число від 1 або порожньо.',
  },
  sync: {
    title: 'Синхронізація',
    notConfigured:
      'Не налаштована: сервер не отримав {url}. Застосунок працює, але дані лишаються на цьому пристрої. Де взяти адресу — в {readme}.',
    error: 'Помилка',
    online: 'Онлайн',
    connecting: 'З’єднуємось…',
    offline: 'Офлайн — зміни збережено на пристрої',
    state: 'Стан',
    lastSynced: 'Останнє оновлення',
    never: 'ще не було',
    stored: 'Записів на пристрої',
    pending: 'Чекають на відправку',
    rejected: (n: number) =>
      'Сервер не прийняв ' +
      n +
      ' ' +
      plural(n, 'зміну', 'зміни', 'змін') +
      ' з цього пристрою. Їх відкинуто: на сервер і на інші пристрої вони не потрапили — повторіть дію, якщо вона ще потрібна.',
    understood: 'Зрозуміло',
    retrying:
      'Застосунок повторює спроби сам, щойно сервер відповість — помилка зникне.',
    hint: 'Застосунок читає й пише локальну базу, тому працює без мережі. Зміни їдуть на сервер, щойно вона з’явиться.',
  },
  importV1: {
    title: 'Перенести дані з V1',
    meals,
    recipes: (n: number) =>
      n + ' ' + plural(n, 'рецепт', 'рецепти', 'рецептів'),
    profiles: (n: number) =>
      n + ' ' + plural(n, 'профіль', 'профілі', 'профілів'),
    prefs: (n: number) => n + ' ' + plural(n, 'смак', 'смаки', 'смаків'),
    nothing: 'нічого',
    readFailed: 'Не вдалося прочитати файл експорту.',
    writeFailed: 'Не вдалося записати дані на пристрій.',
    unavailable:
      'Недоступно: дані переносяться в локальну базу, а вона на цьому пристрої не відкрилась. Причина — у розділі «Синхронізація».',
    done: (summary: string) => 'Перенесено: ' + summary + '.',
    another: 'Перенести ще один файл',
    preview: 'Файл {file} — приїде: {summary}.',
    skipped: (n: number) => 'Не переноситься (' + n + ')',
    applying: 'Переносимо…',
    apply: 'Перенести',
    hint: 'Дані V1 лежать у сховищі браузера, тож дістати їх може лише сам браузер. Відкрийте V1 на тій самій адресі, де ним користуєтесь, виконайте в консолі вміст {script} — і виберіть збережений файл тут. Повторний імпорт того самого файлу нічого не подвоїть.',
  },
  errors: {
    auth: {
      invalid_credentials: 'Невірна пошта або пароль.',
      email_not_confirmed: 'Пошту ще не підтверджено — перевірте лист.',
      user_already_exists: 'Такий акаунт уже є. Спробуйте увійти.',
      weak_password: 'Пароль закороткий. Мінімум 6 символів.',
      validation_failed: 'Перевірте пошту й пароль.',
      over_request_rate_limit: 'Забагато спроб. Спробуйте за хвилину.',
      over_email_send_rate_limit: 'Забагато листів. Спробуйте пізніше.',
      signup_disabled: 'Реєстрацію на цьому сервері вимкнено.',
    } as Record<string, string>,
    rpc: {
      not_authenticated: 'Сесія втрачена. Увійдіть ще раз.',
      family_name_required: 'Введіть назву сім’ї.',
      already_in_family: 'Ви вже в сім’ї.',
      no_family: 'Спершу створіть сім’ю або приєднайтеся до наявної.',
      invite_not_found: 'Такого коду немає. Перевірте, чи не загубився символ.',
      invite_already_used: 'Цим кодом уже скористалися. Попросіть новий.',
      invite_expired: 'Термін дії коду минув. Попросіть новий.',
    } as Record<string, string>,
    generic: 'Не вдалося виконати дію.',
    insecure:
      'Браузер не дає застосунку локальної бази: сторінку відкрито без HTTPS. Відкрийте її за адресою з https:// — або через localhost на самому сервері.',
    localDb: 'Не вдалося відкрити локальну базу на цьому пристрої.',
    syncOffline:
      'Не вдалося під’єднатися до сервера синхронізації: немає мережі. Дані на пристрої в безпеці.',
    syncUnauthorized:
      'Сервер синхронізації не прийняв вхід. Спробуйте вийти з акаунта й увійти знову.',
    syncUpload:
      'Сервер не приймає зміни з цього пристрою. Вони лишаються в черзі й поїдуть, щойно сервер їх прийме.',
    syncDownload:
      'Не вдалося отримати дані із сервера синхронізації. Зміни з цього пристрою збережено на ньому.',
    rejectedTable: {
      profile: 'Профіль',
      meal: 'Страва',
      recipe: 'Рецепт',
      meal_pref: 'Позначка смаку',
      week_plan: 'План тижня',
      plan_slot: 'Страва в плані',
      shopping_check: 'Позначка в списку покупок',
      family_settings: 'Налаштування сім’ї',
    } as Record<string, string>,
    rejectedOp: {
      PUT: 'створення',
      PATCH: 'зміну',
      DELETE: 'видалення',
    },
    rejectedReason: {
      duplicate: 'такий запис уже є (мабуть, його створили на іншому пристрої)',
      missingParent: 'пов’язаного запису вже немає',
      missingField: 'бракує обов’язкового поля',
      outOfRange: 'значення поза допустимими межами',
      forbidden: 'немає доступу — можливо, пристрій уже не в цій сім’ї',
      invalid: 'некоректне значення',
      other: 'сервер відхилив дані',
    },
    rejected: (what: string, op: string, reason: string) =>
      what + ': сервер не прийняв ' + op + ' — ' + reason + '.',
  },
  week: {
    sharedNote: (owner: string) =>
      'Цей профіль користується спільним планом профілю «' +
      owner +
      '». Перегенерувати може лише власник.',
    target: (target: number, corridor: number) =>
      'Ціль ' + target + ' ± ' + corridor + ' ккал/день',
    sevenDays: 'План на 7 днів',
    profileFirstHint:
      'Ціль калорійності й коридор генератор бере з профілю. Створіть його на екрані «Сьогодні».',
    generating: 'Збираємо тиждень…',
    regenerate: 'Перегенерувати тиждень',
    generate: 'Згенерувати тиждень',
    addMeals: 'Додати страви',
    noPlan:
      'Плану ще немає. Натисніть кнопку — генератор збере тиждень із пулу страв за правилами дієтолога: тип слота, коридор калорій, антиповтор і мікс планів.',
    swapHint:
      'Щоб замінити окрему страву, натисніть кнопку заміни праворуч у її рядку. Діалог запропонує страви того ж типу з прогнозом калорій дня.',
    confirmTitle: 'Перегенерувати тиждень?',
    confirmText: (n: number) =>
      'У плані ' +
      n +
      ' ' +
      plural(n, 'ручна заміна', 'ручні заміни', 'ручних замін') +
      ' на сьогодні й наступні дні. Генератор збере тиждень наново, і ручні заміни не збережуться.',
    confirm: 'Перегенерувати',
    summary: (
      count: number,
      total: string,
      average: string,
      target: number,
      corridor: number,
    ) =>
      'Разом за ' +
      count +
      ' дн.: ' +
      total +
      ' · у середньому ' +
      average +
      '/день. Ціль ' +
      target +
      ' ± ' +
      corridor +
      ' ккал.',
    sources: (list: string) => ' Джерела: ' + list + '.',
    viewerPortion: (viewer: string, owner: string) =>
      'Калорійність показано для порції ' +
      viewer +
      ', а коридор тримає власник плану з порцією ' +
      owner +
      '.',
    incomplete: (n: number) =>
      'У ' +
      n +
      ' дн. калорійність відома не для всіх слотів — ці дні в суму не входять.',
    generated: (at: string) => 'Згенеровано ' + at + '.',
    missing: (n: number) =>
      n +
      ' ' +
      plural(n, 'слот посилається', 'слоти посилаються', 'слотів посилаються') +
      ' на страви, яких уже немає в пулі — перегенеруйте тиждень.',
    stale:
      'Профіль змінився після генерації (ціль або коридор) — перегенеруйте тиждень.',
    snackOn:
      'Перекус у профілі увімкнено після генерації, а в плані його немає — перегенеруйте тиждень.',
    snackOff:
      'Перекус у профілі вимкнено після генерації, а в плані він лишився — перегенеруйте тиждень.',
    outsidePlan: 'Сьогодні поза періодом цього плану — перегенеруйте тиждень.',
    unknownCalories: 'калорійність невідома',
    incompleteShort: ' · сума неповна',
    outside: ' · поза коридором',
    swap: (type: MealType) => 'Замінити страву: ' + MEAL_TYPE[type],
    poolShortage,
    failure: (failure: GenerateFailure): string => {
      switch (failure.code) {
        case 'invalidTarget':
          return 'Цільова калорійність дня має бути додатним числом.'
        case 'poolShortage':
          return poolShortage(failure.shortage, failure.antiRepeatDays)
        case 'noFit':
          return (
            'Не вдалося зібрати тиждень під ' +
            failure.target +
            ' ккал/день навіть із коридором ±' +
            failure.corridor +
            ' ккал. Змініть ціль або поповніть пул страв.'
          )
        case 'emptyPool':
          return 'Пул страв порожній — додайте страви на екрані «Страви».'
      }
    },
    warning: (warning: WeekWarning): string => {
      switch (warning.code) {
        case 'caloriesUnknown':
          return (
            'Страв без калорійності для порції ' +
            warning.portion +
            ': ' +
            warning.count +
            '. Вони не брали участі в доборі — коридор дня рахується лише за відомими цифрами.'
          )
        case 'corridorWidened':
          return (
            'Не вдалося втриматись у ±' +
            warning.corridor +
            ' ккал — коридор розширено до ±' +
            warning.used +
            ' ккал.'
          )
        case 'mixBlockedByDislikes':
          return 'Позначки «не подобається» звузили пул — мікс планів став неможливим.'
        case 'mixImpossible':
          return 'Пул не дозволяє мікс планів — усі страви покриває один план.'
        case 'mixFailed':
          return 'Не вдалося поєднати різні плани — тиждень зібрано зі страв одного джерела.'
        case 'mixFailedCorridorWidened':
          return 'Коридор розширено до ±' + warning.used + ' ккал.'
        case 'dislikedKept':
          return (
            'Без страв із позначкою «не подобається» тиждень не збирається — ' +
            'вони лишились у плані. Приберіть позначку або поповніть пул.'
          )
      }
    },
  },
  calendar: {
    weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
    planned: (n: number) => 'Заплановано ' + days(n),
    history: 'Історія та плани',
    profileFirstHint:
      'Календар показує план профілю. Створіть його на екрані «Сьогодні».',
    previous: 'Попередній тиждень',
    next: 'Наступний тиждень',
    empty:
      'Історія порожня — ще жоден тиждень не згенеровано. Згенеруйте перший на екрані «Тиждень», і його дні з’являться тут.',
    shared: (owner: string) =>
      'Це календар спільного плану профілю «' + owner + '».',
    noPlanLabel: ', без плану',
    noPlan: 'На цей день плану немає.',
    noPlanFuture:
      ' Новий тиждень генерується на екрані «Тиждень» і починається сьогоднішнім днем.',
    past: 'Минулий день — незмінна історія, лише перегляд.',
  },
  swap: {
    noDay: 'У плані немає такого дня — перегенеруйте тиждень.',
    pastTitle: 'Минулий день',
    past: 'Це вже прожитий день — історія незмінна. Заміна доступна лише для сьогодні й майбутніх днів.',
    incomplete:
      'У плані є слоти, страву яких видалено з пулу. Поки їх не стало, заміна рахувала б коридор дня за неповними даними — перегенеруйте тиждень.',
    noSlot: 'Слот дня не знайдено — перегенеруйте тиждень.',
    current: (
      name: string,
      calories: string,
      target: number,
      corridor: number,
    ) =>
      'Зараз: «' +
      name +
      '»' +
      (calories ? ' — ' + calories : '') +
      '. Ціль ' +
      target +
      ' ± ' +
      corridor +
      ' ккал/день.',
    noCandidates: (type: MealType) =>
      'Немає інших страв типу «' +
      MEAL_TYPE[type] +
      '» у пулі. Додайте їх на екрані «Страви».',
    favorite: 'улюблене',
    disliked: 'не подобається',
    day: 'день → ',
    noneValid:
      'Жодна заміна не лишає тиждень валідним — усі кандидати порушують коридор, антиповтор або мікс планів.',
    reason: {
      dayIncomplete: 'калорійність дня неповна',
      outsideCorridor: 'поза коридором',
      repeatSoon: 'повтор поруч',
      breaksMix: 'ламає мікс планів',
    } satisfies Record<SwapReason, string>,
    failure: (failure: SlotFailure): string => {
      switch (failure.code) {
        case 'noDay':
          return 'У плані немає дня №' + failure.day + '.'
        case 'unknownSlot':
          return 'Невідомий тип слота: «' + failure.slot + '».'
        case 'noSlot':
          return (
            'У дні №' +
            failure.day +
            ' немає слота «' +
            MEAL_TYPE[failure.slot] +
            '».'
          )
        case 'typeMismatch':
          return (
            'Страва «' +
            failure.meal +
            '» — це ' +
            MEAL_TYPE[failure.mealType].toLowerCase() +
            ', а слот — «' +
            MEAL_TYPE[failure.slot] +
            '».'
          )
      }
    },
  },
  shopping: {
    category: {
      veg: 'Овочі та зелень',
      fruit: 'Фрукти та ягоди',
      meat: "М'ясо та риба",
      dairy: 'Молочне та яйця',
      grain: 'Крупи та бобові',
      bread: 'Хліб',
      pantry: 'Бакалія та спеції',
      sweet: 'Солодощі',
      other: 'Інше',
    } as Record<string, string>,
    noQty: 'Без точної кількості',
    shareFailed:
      'Браузер не дав ні меню «Поділитися», ні доступу до буфера обміну.',
    bought: (bought: number, total: number) =>
      bought + ' з ' + total + ' куплено',
    fromWeek: 'Із поточного тижня',
    profileFirstHint:
      'Список збирається з плану профілю. Створіть його на екрані «Сьогодні».',
    noPlan:
      'Плану тижня ще немає. Згенеруйте його на екрані «Тиждень» — список збереться з інгредієнтів страв, нічого не вигадуючи.',
    plans: (n: number) => ' · планів: ' + n,
    missing: (n: number) =>
      slots(n) +
      ' без страви — її видалено з пулу, тож її інгредієнтів у списку немає.',
    share: 'Поділитися некупленим',
    copied: 'Список скопійовано — вставте його в месенджер.',
    noIngredients: 'У стравах цього тижня немає інгредієнтів.',
    noQtyHint:
      'У плані дієтолога цих кількостей немає — застосунок їх не вигадує.',
    both: 'Обидва профілі',
    all: 'Усі профілі',
    scopeHint:
      'Охоплення лишається на цьому пристрої. Позначки «куплено» спільні для сім’ї — їх видно на всіх телефонах.',
    progress: (bought: number, total: number) =>
      'Куплено ' + bought + ' з ' + total,
    boughtMark: ' — куплено',
  },
  recipe: {
    readingMeals: 'Читаємо пул страв…',
    gone: 'Страви більше немає в пулі — її видалили тут або на іншому пристрої.',
    reading: 'Читаємо рецепт…',
    edit: 'Змінити рецепт',
    add: 'Додати рецепт',
    hint: 'Кроки, час і фото можна додати й змінити тут — дослівно з плану дієтолога або свої. Склад і калорійність редагуються на екрані «Страви».',
    back: 'Назад',
    toMeals: 'До страв',
    photoAlt: (name: string) => 'Фото: ' + name,
    imageFailed: 'Не вдалося прочитати зображення.',
    noCanvas: 'Браузер не дав полотна для стиснення фото.',
    calories: (portion: string) => 'калорійність · ' + portion,
    prep: 'готувати',
    servings: (n: number) => plural(n, 'порція', 'порції', 'порцій'),
    stayAwake: 'Не гасити екран',
    awakeRefused:
      'Браузер не дав тримати екран увімкненим — можливо, через режим енергозбереження.',
    cooking: 'Приготування',
    forServings: (n: number) =>
      ' · на ' + n + ' ' + plural(n, 'порцію', 'порції', 'порцій'),
    tapStep: 'Натисніть на крок, щоб відмітити його зробленим.',
    steps: 'Кроки приготування',
    stepsHint: 'По одному в рядку. Порожньо — секції не буде.',
    stepsPlaceholder: 'Відварити гречку 15 хв.\nОбсмажити філе до золотистого.',
    prepTime: 'Час приготування, хв',
    servingsField: 'Порції',
    photo: 'Фото',
    photoChosen: ' · обрано',
    photoOptional: " · необов'язково",
    removePhoto: 'Прибрати фото',
  },
  meals: {
    clearConfirm:
      'Видалити всі страви з пулу разом із рецептами? Страви, що стоять у планах, лишаться. Стартовий набір потім можна додати знову.',
    cleared: (removed: number, kept: number) =>
      'Видалено ' +
      mealsAccusative(removed) +
      '.' +
      (kept
        ? ' ' +
          kept +
          ' ' +
          plural(kept, 'лишилась', 'лишились', 'лишилось') +
          ', бо стоять у планах: спершу замініть їх або перегенеруйте тиждень.'
        : ''),
    inPool: (n: number) => meals(n) + ' у пулі',
    emptyPool: 'Пул страв порожній',
    all: 'Усі',
    favorites: 'Улюблені',
    disliked: 'Небажані',
    gerdOnly: 'Лише ГЕРХ',
    add: 'Додати страву',
    importPdf: 'Імпорт із PDF-плану дієтолога',
    amongChosen: ' серед обраних.',
    noGerd: 'Немає страв із маркером ГЕРХ серед обраних.',
    none: 'Поки що жодної страви. Додайте першу вручну — з плану дієтолога.',
    noFavorites: 'Немає страв із позначкою «улюблене».',
    noDisliked: 'Немає страв із позначкою «не подобається».',
    noType: 'Немає страв цього типу.',
    edit: (name: string) => 'Редагувати страву «' + name + '»',
    clearAll: 'Очистити всі страви',
    tasteHint:
      'Улюблені страви частіше потрапляють у план, небажані — виключаються. Правила дієтолога (тип слота, коридор калорій, антиповтор і мікс планів) головніші за смак і ніколи ним не послаблюються.',
  },
  mealForm: {
    inPlans: (n: number) =>
      'Страва стоїть у ' +
      n +
      ' слот(ах) плану. Спершу замініть її або перегенеруйте тиждень — інакше в плані лишиться порожній слот.',
    deleteConfirm: (name: string) => 'Видалити страву «' + name + '»?',
    edit: 'Редагувати страву',
    create: 'Нова страва',
    name: 'Назва',
    namePlaceholder: 'Гречка з куркою та овочами',
    type: 'Тип слота',
    ingredients: 'Інгредієнти',
    ingredientsHint: 'По одному в рядку; кількість — після « — ».',
    ingredientsPlaceholder:
      'гречка — 80 г\nкуряче філе — 150 г\nовочі на вибір',
    portions: 'Готова порція Ж/Ч',
    portionsHint:
      'Дослівно з плану; складник — до « — ». Порожньо — секції не буде.',
    portionsPlaceholder: 'Ж - 130 г; Ч - 200 г\nГарнір — Ж - 100 г; Ч - 150 г',
    source: 'Джерело (план дієтолога)',
    sourceHint: 'Напр. «Тиждень 2» — за ним генератор міксує тиждень.',
    sourcePlaceholder: 'Тиждень 2',
    gerd: 'ГЕРХ — страва з плану з урахуванням ГЕРХ',
    issues: 'Помилки в джерелі',
    issuesHint:
      "По одній на рядок, без правильного значення. З'ясували й виправили поле — зітріть рядок.",
    issuesPlaceholder: 'У день 1 рис 70 г, у день 2 — 100 г',
    portion: (letter: string) => 'Порція ' + letter,
    defaultPortion: ' · і профілі без порції',
    calories: 'Калорійність, ккал',
    caloriesHint: (letter: string) =>
      'Порожньо — генератор не братиме страву для профілів порції ' +
      letter +
      ': коридор дня рахується числами.',
  },
  profiles: {
    lastOne: 'Не можна видалити останній профіль.',
    deleteConfirm: (name: string) =>
      'Видалити профіль «' + name + '»? Його тиждень і календар теж зникнуть.',
    title: 'Профілі',
    corridor: (target: number, corridor: number) =>
      target + ' ± ' + corridor + ' ккал',
    portion: (letter: string) => ' · порція ' + letter,
    shared: ' · спільний план',
    noSnack: ' · без перекусу',
    poolSize: (n: number) => ' · пул: ' + n,
    change: 'Змінити',
    add: 'Додати профіль',
    edit: 'Редагувати профіль',
    create: 'Новий профіль',
    name: 'Ім’я',
    namePlaceholder: 'Мій профіль',
    target: 'Ціль, ккал/день',
    corridorField: 'Коридор, ±ккал',
    color: 'Колір',
    colorOption: (color: string) => 'Колір ' + color,
    portionField: 'Порція з плану дієтолога',
    noPortion: '— не задано',
    sharedWith: 'Спільний план із профілем',
    ownPlan: '— власний план',
    sharedHint:
      'Пов’язані профілі їдять ті самі страви — план у них один, власників.',
    snack: 'Перекус',
    snackDaily: 'щодня',
    snackNone: 'без перекусу',
    pool: 'Пул страв',
    wholePool: 'Увесь спільний пул',
    emptyPool: 'Пул порожній — додайте страви на екрані «Страви».',
  },
  pdf: {
    known: 'Така страва вже є в пулі — типово не імпортується.',
    flag: {
      repeat: 'Повтор страви попереднього дня — окрема страва вже є вище.',
      'dessert-split': 'Назву відділено від опису порції — перевірте.',
      dup: 'Дублікат назви — така страва вже є вище.',
      'no-kcal': 'У PDF немає калорійності — впишіть вручну, щоб додати в пул.',
    } satisfies Record<PlanFlag, string>,
    reading: (name: string) => 'Читаю «' + name + '»…',
    page: (page: number, total: number) =>
      'Витягаю текст: сторінка ' + page + ' з ' + total + '…',
    noText: 'У файлі не знайдено тексту (можливо, це скан).',
    readFailed: (detail: string) => 'Не вдалося прочитати PDF: ' + detail,
    recipeFailed: (detail: string) =>
      'Страву додано, але кроки й порційність не збереглися: ' + detail,
    added: (n: number) => 'Додано до пулу: ' + meals(n) + '. ',
    failed: (n: number) => 'Не додано: ' + n + ' — див. позначки в картках.',
    done: 'Готово.',
    nothing: 'Нічого не вибрано.',
    noSupabase: 'Сервер Supabase не налаштований.',
    archiveFailed: (detail: string) =>
      'Страви додано, але текст плану не збережено в архів імпортів — для цього потрібна мережа. ' +
      detail,
    hint: 'Розпізнаємо лише те, що буквально є у файлі: назви, тип прийому, інгредієнти, номер тижня, калорійність — де вказана. Чого в PDF немає, те лишиться порожнім. Перед додаванням у пул усе перевіряєте й підтверджуєте ви.',
    paste: 'Або вставте текст, скопійований із PDF',
    pastePlaceholder: 'День 1\nСніданок: …',
    recognize: 'Розпізнати текст',
    reviewTitle: 'Перевірка перед додаванням',
    stats: (
      found: number,
      repeats: number,
      dups: number,
      weeks: number,
      dayCount: number,
    ) =>
      'Розпізнано страв: ' +
      found +
      (repeats ? ' · повторів між днями: ' + repeats : '') +
      (dups ? ' · дублікатів назв: ' + dups : '') +
      (weeks ? ' · тижнів: ' + weeks : '') +
      (dayCount ? ' · днів: ' + dayCount : '') +
      '. Повтори («Той самий…») до пулу не додаються — окрема страва вже є вище. Сумнівні місця мають позначки, сирий текст плану — під кожною карткою.',
    poolUnread: (issue: string) =>
      'Не вдалося прочитати пул страв, тож нічого не позначено наперед — перевірте кожну картку самі. ' +
      issue,
    none: 'У тексті не розпізнано жодної страви. Перевірте, що це план із рядками «Сніданок: …», «Обід: …».',
    archive: 'Зберегти текст плану в архів',
    adding: 'Додаємо…',
    addChosen: (n: number) => 'Додати вибрані до пулу (' + n + ')',
    another: 'Інший файл',
    day: (n: number) => ' · День ' + n,
    repeat: ' — повтор',
    inPool: ' · уже в пулі',
    name: 'Назва',
    type: 'Тип слота',
    calories: 'Калорійність, ккал',
    caloriesPlaceholder: 'немає в PDF',
    servings: 'Порції',
    source: 'Джерело (план дієтолога)',
    ingredients: 'Інгредієнти (по одному в рядку)',
    portions: 'Готова порція Ж/Ч (складник — до « — »)',
    steps: 'Кроки/нотатки з плану (по одному в рядку)',
    raw: 'Сирий текст із плану',
  },
}

export type Messages = typeof uk
