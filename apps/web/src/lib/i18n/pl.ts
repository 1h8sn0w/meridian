import type { MealType, PoolShortage } from '@meridian/core'
import type { Messages } from './uk.ts'

const RULES = new Intl.PluralRules('pl-PL')

function plural(n: number, one: string, few: string, many: string): string {
  const forms: Partial<Record<Intl.LDMLPluralRule, string>> = { one, few }
  return forms[RULES.select(n)] ?? many
}

const MEAL_TYPE: Record<MealType, string> = {
  breakfast: 'Śniadanie',
  lunch: 'Obiad',
  dinner: 'Kolacja',
  snack: 'Przekąska',
}

const MEAL_TYPE_FOR: Record<MealType, string> = {
  breakfast: 'śniadanie',
  lunch: 'obiad',
  dinner: 'kolację',
  snack: 'przekąskę',
}

const MEAL_TYPE_OF: Record<MealType, string> = {
  breakfast: 'śniadania',
  lunch: 'obiadu',
  dinner: 'kolacji',
  snack: 'przekąski',
}

const days = (n: number) => n + ' ' + plural(n, 'dzień', 'dni', 'dni')
const meals = (n: number) => n + ' ' + plural(n, 'danie', 'dania', 'dań')
const mealsOf = (n: number) => n + ' ' + plural(n, 'dania', 'dań', 'dań')
const slots = (n: number) => n + ' ' + plural(n, 'slot', 'sloty', 'slotów')

const poolShortage = (
  shortage: ReadonlyArray<PoolShortage>,
  antiRepeatDays: number,
) =>
  'Za mało dań w puli. Reguła „nie częściej niż raz na ' +
  days(antiRepeatDays) +
  '” wymaga co najmniej ' +
  mealsOf(antiRepeatDays) +
  ' każdego rodzaju, a teraz jest: ' +
  shortage
    .map(
      ({ type, have, need }) =>
        MEAL_TYPE[type] + ' — ' + have + ' (potrzeba ≥ ' + need + ')',
    )
    .join('; ') +
  '. Dodaj dania na ekranie „Dania” albo skróć blokadę powtórek na ekranie „Dziś”.'

export const pl: Messages = {
  common: {
    close: 'Zamknij',
    retry: 'Spróbuj ponownie',
    save: 'Zapisz',
    cancel: 'Anuluj',
    delete: 'Usuń',
    minutes: (n) => n + ' min',
    todayTag: 'dziś',
    profileFirst: 'Najpierw profil',
    mealRemoved: 'danie usunięte z puli',
    openWeekScreen: 'Otwórz ekran „Tydzień”',
    shareFailed:
      'Przeglądarka nie dała ani menu „Udostępnij”, ani dostępu do schowka.',
    macroFields: {
      protein: 'Białko, g',
      fat: 'Tłuszcz, g',
      carbs: 'Węglowodany, g',
    },
    mealType: MEAL_TYPE,
    kcalUnit: 'kcal',
    kcal: (value) => value + ' kcal',
    grams: (value) => value + ' g',
    days,
    at: (day, time) => day + ' o ' + time,
    queryProblem: (message) => 'Zapytanie do bazy danych: ' + message,
  },
  titles: {
    today: 'Dziś',
    week: 'Tydzień',
    calendar: 'Kalendarz',
    meals: 'Dania',
    recipe: 'Przepis',
    shopping: 'Lista zakupów',
    family: 'Rodzina',
  },
  gate: {
    notConfigured: 'Aplikacja nie jest skonfigurowana',
    noSupabase: 'Brak adresu Supabase',
    serverMissing:
      'Serwer nie otrzymał {url} ani {key}. Gdzie je znaleźć: {readme}; dla {dev}: {example}.',
    loading: 'Chwileczkę…',
    localDbPending: 'Przygotowujemy lokalną bazę danych…',
  },
  profileSwitcher: {
    manage: 'Zarządzaj profilami',
    summary: (name, target, corridor) =>
      name + ' · ' + target + ' ± ' + corridor + ' kcal/dzień',
  },
  antiRepeat: {
    title: 'Bez powtórek',
    label: 'Danie nie częściej niż raz na',
    hint: 'Reguła jest wspólna dla całej rodziny. Działa od następnego generowania tygodnia i następnej zamiany; gotowe plany nie są przeliczane.',
    savedBroken: (value) =>
      'Rodzinna blokada powtórek zapisała się z błędem: ' + value + '.',
  },
  search: {
    label: 'Szukaj dań',
    placeholder: 'Nazwa lub składnik',
    clear: 'Wyczyść wyszukiwanie',
    found: (n) => 'Znaleziono ' + meals(n),
    notFound: (query) => 'Brak dań z „' + query + '” w nazwie lub składnikach',
  },
  dayTotal: {
    unknown: 'Kaloryczność dnia nieznana — dania nie mają liczb.',
    total: (total) => 'Suma dnia: ' + total,
    target: (target, corridor) =>
      ' · cel ' + target + ' ± ' + corridor + ' kcal',
    incomplete: (n) => ' · niepełne: ' + slots(n) + ' bez liczb',
    outside: ' · poza zakresem',
  },
  taste: {
    favorite: 'Ulubione',
    disliked: 'Nielubiane',
  },
  today: {
    current: 'Bieżący posiłek',
    noWindows: 'Brak pór posiłków — zegar dnia jest pusty.',
    outsidePlan:
      'Dzisiejszy dzień jest poza zapisanym planem — wygeneruj tydzień ponownie.',
    mealRemoved:
      'Danie z tego slotu usunięto z puli — wygeneruj tydzień ponownie.',
    nextOutsidePlan:
      'Następny posiłek jest już poza planem — wygeneruj tydzień ponownie.',
    now: (type, until) => 'Teraz: ' + MEAL_TYPE[type] + ' (do ' + until + ')',
    next: (type, at, tomorrow) =>
      'Następnie: ' +
      MEAL_TYPE[type] +
      ' o ' +
      at +
      (tomorrow ? ' (jutro)' : ''),
    swap: 'Zamień danie',
    later: (tomorrow) => (tomorrow ? 'Później jutro' : 'Później dziś'),
  },
  firstSteps: {
    title: 'Pierwsze kroki',
    done: ' — gotowe',
    profile: 'Profil',
    profileDone: 'Utworzony.',
    profileText:
      'Cel kaloryczny, zakres i porcja z planu dietetyka — wokół nich generator układa tydzień.',
    createProfile: 'Utwórz profil',
    mealsEmpty: 'Zestaw startowy, import z PDF dietetyka albo ręcznie.',
    mealsShort: (count, need, have) =>
      'Dań w puli: ' +
      count +
      ' — na tydzień to za mało: potrzeba co najmniej ' +
      mealsOf(need) +
      ' z kaloriami każdego rodzaju. Teraz: ' +
      have +
      '.',
    mealsCount: (count) => 'Dań w puli: ' + count + '.',
    openMeals: 'Otwórz „Dania”',
    weekText:
      'Generator układa tydzień z puli, a bieżący posiłek pojawi się tutaj.',
    openWeek: 'Otwórz „Tydzień”',
  },
  clock: {
    night: 'Noc',
    nowMeal: (time, type) =>
      'Jest ' + time + ' — pora na ' + MEAL_TYPE_FOR[type] + '.',
    nowNight: (time) => 'Jest ' + time + ' — pora nocna.',
    nextMeal: (type, at) => ' ' + MEAL_TYPE[type] + ' o ' + at + '.',
    until: (time) => 'do ' + time,
    nextShort: (type, at) => MEAL_TYPE[type].toLowerCase() + ' o ' + at,
  },
  mealHours: {
    title: 'Pory posiłków',
    change: 'Zmień pory posiłków',
    start: 'Początek',
    end: 'Koniec',
    hint: 'Pory są wspólne dla całej rodziny: widzi je każde urządzenie i według nich działają przypomnienia. Przekąska wypada między obiadem a kolacją.',
    reset: 'Przywróć domyślne',
    timeRange: 'Godzina od 00:00 do 24:00 co 15 minut.',
    startBeforeEnd: 'Początek musi być przed końcem.',
    afterPrevious: (type, previous, end) =>
      MEAL_TYPE[type] +
      ' może zacząć się najwcześniej po końcu ' +
      MEAL_TYPE_OF[previous] +
      ' (' +
      end +
      ').',
    savedPartly: 'Pory posiłków zapisały się niecałkowicie.',
    savedBroken: (problem) => 'Pory posiłków: ' + problem,
  },
  reminders: {
    title: 'Przypomnienia',
    enable: 'Przypominaj przed posiłkami',
    lead: 'Wyprzedzenie',
    today: 'Dziś: ',
    hint: 'Przypomnienia wysyła sama strona, więc docierają, dopóki aplikacja jest otwarta: aplikacja nie ma serwera push. Na iPhonie powiadomienia działają tylko w zainstalowanej aplikacji („Do ekranu początkowego”).',
    test: 'Wyślij powiadomienie testowe',
    permission: {
      denied:
        'Powiadomienia są zablokowane dla tej strony — zezwól na nie w ustawieniach przeglądarki.',
      default: 'Nie udzielono zgody na powiadomienia.',
      unsupported: 'Ta przeglądarka nie obsługuje powiadomień.',
    },
    notificationTitle: (type, lead, at) =>
      MEAL_TYPE[type] +
      (lead ? ' za ' + lead + ' min' : ' — już czas') +
      ' · o ' +
      at,
    noPlan: 'Dla tego posiłku nie ma planu — wygeneruj tydzień.',
  },
  auth: {
    tagline: 'Planer posiłków dla rodziny',
    signIn: 'Logowanie',
    signUp: 'Rejestracja',
    signInHint:
      'Dania, jadłospis i lista zakupów są wspólne dla całej rodziny.',
    signUpHint:
      'Po rejestracji założysz rodzinę albo dołączysz do istniejącej za pomocą kodu.',
    email: 'E-mail',
    password: 'Hasło',
    passwordHint: 'Co najmniej 6 znaków.',
    submitSignIn: 'Zaloguj się',
    submitSignUp: 'Zarejestruj się',
    confirmSent: (address) =>
      'Konto utworzone. Na adres ' +
      address +
      ' wysłaliśmy e-mail z potwierdzeniem — otwórz go i wróć tutaj, aby się zalogować.',
    noAccount: 'Nie masz konta? ',
    haveAccount: 'Masz już konto? ',
    signOut: 'Wyloguj się',
  },
  familySetup: {
    signedInAs: (email) => 'Zalogowano jako ' + (email ?? 'nieznane konto'),
    create: 'Załóż rodzinę',
    createHint:
      'Jadłospis, pula dań i lista zakupów będą wspólne ze wszystkimi, których zaprosisz.',
    name: 'Nazwa rodziny',
    creating: 'Zakładanie…',
    submitCreate: 'Załóż',
    join: 'Dołącz za pomocą kodu',
    joinHint:
      'Osoba, która jest już w rodzinie, poda kod ze swojego ekranu rodziny. Myślniki, spacje i wielkość liter nie mają znaczenia.',
    code: 'Kod zaproszenia',
    joining: 'Dołączanie…',
    submitJoin: 'Dołącz',
  },
  family: {
    subtitle: 'Dania, plan tygodnia i lista zakupów są wspólne',
    members: 'W rodzinie',
    noEmail: 'konto bez e-maila',
    you: 'ty',
    invite: 'Zaproszenie',
    inviteHint: (until) =>
      'Jednorazowy, ważny do ' +
      until +
      '. Podyktuj go zapraszanej osobie — wpisze kod po rejestracji.',
    noInvite:
      'Brak aktywnego kodu. Utwórz go i przekaż innemu członkowi rodziny.',
    preparing: 'Przygotowujemy kod…',
    newCode: 'Nowy kod',
    createCode: 'Utwórz kod',
    language: 'Język',
    languageLabel: 'Język interfejsu',
    languageHint:
      'Wybór zapisuje się na tym urządzeniu. Nazwy dań, przepisy i plany dietetyka nie są tłumaczone.',
  },
  starter: {
    broken:
      'Zestaw startowy na serwerze jest nieprawidłowy — nie dodano żadnych dań.',
    failed: 'Nie udało się dodać zestawu startowego.',
    add: 'Dodaj zestaw startowy',
    missing: (n) =>
      'Dania z planów dietetyka, których nie ma w puli: ' +
      n +
      '. Istniejące dania pozostaną bez zmian.',
    offer:
      'Dania z planów dietetyka, które administrator umieścił na serwerze.',
    added: (n) => 'Dodano ' + meals(n) + '.',
    allThere: 'Wszystkie dania z zestawu są już w puli.',
  },
  details: {
    gerd: 'Refluks',
    sourceIssue: 'W źródle jest rozbieżność',
    sourceError: 'Błąd w źródle.',
    sourceErrorText:
      ' Plan dietetyka jest tu niespójny; wartości wpisano tak, jak są:',
    protein: 'Białko',
    fat: 'Tłuszcz',
    carbs: 'Węglowodany',
    noMacros: 'Nie podano białka, tłuszczu ani węglowodanów.',
    ingredients: 'Składniki',
    noIngredients: 'Nie podano składników.',
    portion: 'Gotowa porcja',
  },
  forms: {
    notNumber: (label) =>
      'Pole „' + label + '” musi być liczbą albo pozostać puste.',
    negative: (label) => 'Pole „' + label + '” nie może być ujemne.',
    nutrition: {
      calories: 'Kalorie',
      protein: 'Białko',
      fat: 'Tłuszcz',
      carbs: 'Węglowodany',
    },
    portionField: (label, letter) => label + ' · porcja ' + letter,
    nameRequired: 'Nazwa dania jest wymagana.',
    typeRequired: 'Wybierz rodzaj slotu.',
    profileNameRequired: 'Nazwa profilu jest wymagana.',
    targetPositive: 'Dzienny cel kaloryczny musi być liczbą dodatnią.',
    corridorNonNegative: 'Zakres kalorii musi być liczbą nieujemną.',
    sharedSelf: 'Profil nie może dzielić planu sam ze sobą.',
    sharedMissing: 'Nie znaleziono profilu dla wspólnego planu.',
    sharedFollower: (owner) =>
      'Profil „' +
      owner +
      '” sam korzysta ze wspólnego planu — wybierz profil właściciela.',
    sharedOwner: (name, dependants) =>
      'Profil „' +
      name +
      '” jest już właścicielem wspólnego planu dla: ' +
      dependants +
      '. Najpierw ich odłącz.',
    goalProtein: 'Cel: białko',
    goalFat: 'Cel: tłuszcz',
    goalCarbs: 'Cel: węglowodany',
    prepTime: 'Czas przygotowania',
    servingsNumber: '„Porcje” muszą być liczbą albo pozostać puste.',
    servingsPositive: '„Porcje” muszą być liczbą dodatnią.',
    caloriesMissing:
      'Wpisz kalorie — w PDF ich nie ma, a bez nich danie nie trafi do puli.',
    caloriesNumber:
      'Kalorie muszą być liczbą — usuń z pola wszystko poza cyframi.',
    caloriesNonNegative: 'Kalorie muszą być liczbą nieujemną.',
    servingsWhole: 'Porcje: liczba całkowita od 1 albo puste.',
  },
  sync: {
    title: 'Synchronizacja',
    notConfigured:
      'Nie skonfigurowano: serwer nie otrzymał {url}. Aplikacja działa, ale dane zostają na tym urządzeniu. Gdzie znaleźć adres: {readme}.',
    error: 'Błąd',
    online: 'Online',
    connecting: 'Łączenie…',
    offline: 'Offline — zmiany zapisują się na urządzeniu',
    state: 'Stan',
    lastSynced: 'Ostatnia aktualizacja',
    never: 'jeszcze nie',
    stored: 'Rekordy na urządzeniu',
    pending: 'Czeka na wysłanie',
    rejected: (n) =>
      'Serwer odrzucił zmiany z tego urządzenia: ' +
      n +
      '. Zostały porzucone: nie dotarły ani na serwer, ani na inne urządzenia — powtórz czynność, jeśli nadal jest potrzebna.',
    understood: 'Rozumiem',
    retrying: 'Aplikacja sama ponawia próby; gdy serwer odpowie, błąd zniknie.',
    hint: 'Aplikacja czyta i zapisuje lokalną bazę danych, więc działa bez sieci. Zmiany trafiają na serwer, gdy tylko sieć wróci.',
  },
  importV1: {
    title: 'Przenieś dane z V1',
    meals,
    recipes: (n) => n + ' ' + plural(n, 'przepis', 'przepisy', 'przepisów'),
    profiles: (n) => n + ' ' + plural(n, 'profil', 'profile', 'profili'),
    prefs: (n) =>
      n +
      ' ' +
      plural(n, 'oznaczenie smaku', 'oznaczenia smaku', 'oznaczeń smaku'),
    nothing: 'nic',
    readFailed: 'Nie udało się odczytać pliku eksportu.',
    writeFailed: 'Nie udało się zapisać danych na urządzeniu.',
    unavailable:
      'Niedostępne: dane trafiają do lokalnej bazy, a ta nie otworzyła się na tym urządzeniu. Przyczyna jest w sekcji „Synchronizacja”.',
    done: (summary) => 'Przeniesiono: ' + summary + '.',
    another: 'Przenieś inny plik',
    preview: 'Plik {file} — przeniesie: {summary}.',
    skipped: (n) => 'Nie przeniesiono (' + n + ')',
    applying: 'Przenoszenie…',
    apply: 'Przenieś',
    hint: 'Dane V1 leżą w pamięci przeglądarki, więc wydobyć je może tylko sama przeglądarka. Otwórz V1 pod tym samym adresem, co zwykle, uruchom w konsoli zawartość {script} i wybierz tutaj zapisany plik. Ponowny import tego samego pliku niczego nie dubluje.',
  },
  errors: {
    auth: {
      invalid_credentials: 'Nieprawidłowy e-mail lub hasło.',
      email_not_confirmed:
        'E-mail nie jest jeszcze potwierdzony — sprawdź skrzynkę.',
      user_already_exists: 'To konto już istnieje. Spróbuj się zalogować.',
      weak_password: 'Hasło jest za krótkie. Co najmniej 6 znaków.',
      validation_failed: 'Sprawdź e-mail i hasło.',
      over_request_rate_limit: 'Za dużo prób. Spróbuj ponownie za minutę.',
      over_email_send_rate_limit: 'Za dużo e-maili. Spróbuj ponownie później.',
      signup_disabled: 'Rejestracja na tym serwerze jest wyłączona.',
    },
    rpc: {
      not_authenticated: 'Sesja wygasła. Zaloguj się ponownie.',
      family_name_required: 'Wpisz nazwę rodziny.',
      already_in_family: 'Jesteś już w rodzinie.',
      no_family: 'Najpierw załóż rodzinę albo dołącz do istniejącej.',
      invite_not_found:
        'Nie ma takiego kodu. Sprawdź, czy nie zgubił się żaden znak.',
      invite_already_used: 'Ten kod został już użyty. Poproś o nowy.',
      invite_expired: 'Kod wygasł. Poproś o nowy.',
    },
    generic: 'Nie udało się wykonać czynności.',
    insecure:
      'Przeglądarka nie daje aplikacji lokalnej bazy danych: strona jest otwarta bez HTTPS. Otwórz ją pod adresem https:// — albo przez localhost na samym serwerze.',
    localDb: 'Nie udało się otworzyć lokalnej bazy danych na tym urządzeniu.',
    syncOffline:
      'Nie udało się połączyć z serwerem synchronizacji: brak sieci. Dane na urządzeniu są bezpieczne.',
    syncUnauthorized:
      'Serwer synchronizacji nie przyjął logowania. Spróbuj się wylogować i zalogować ponownie.',
    syncUpload:
      'Serwer nie przyjmuje zmian z tego urządzenia. Zostają w kolejce i zostaną wysłane, gdy serwer je przyjmie.',
    syncDownload:
      'Nie udało się pobrać danych z serwera synchronizacji. Zmiany z tego urządzenia są na nim zapisane.',
    rejectedTable: {
      profile: 'Profil',
      meal: 'Danie',
      recipe: 'Przepis',
      meal_pref: 'Oznaczenie smaku',
      week_plan: 'Plan tygodnia',
      plan_slot: 'Danie w planie',
      shopping_check: 'Oznaczenie na liście zakupów',
      family_settings: 'Ustawienia rodziny',
    },
    rejectedOp: {
      PUT: 'utworzenia',
      PATCH: 'zmiany',
      DELETE: 'usunięcia',
    },
    rejectedReason: {
      duplicate:
        'taki rekord już istnieje (pewnie utworzono go na innym urządzeniu)',
      missingParent: 'powiązany rekord już nie istnieje',
      missingField: 'brakuje wymaganego pola',
      outOfRange: 'wartość jest poza dopuszczalnym zakresem',
      forbidden: 'brak dostępu — może urządzenie nie należy już do tej rodziny',
      invalid: 'nieprawidłowa wartość',
      other: 'serwer odrzucił dane',
    },
    rejected: (what, op, reason) =>
      what + ': serwer nie przyjął ' + op + ' — ' + reason + '.',
  },
  week: {
    sharedNote: (owner) =>
      'Ten profil korzysta ze wspólnego planu profilu „' +
      owner +
      '”. Wygenerować go ponownie może tylko właściciel.',
    target: (target, corridor) =>
      'Cel ' + target + ' ± ' + corridor + ' kcal/dzień',
    sevenDays: 'Plan na 7 dni',
    profileFirstHint:
      'Cel i zakres kalorii generator bierze z profilu. Utwórz go na ekranie „Dziś”.',
    generating: 'Układamy tydzień…',
    regenerate: 'Wygeneruj tydzień ponownie',
    generate: 'Wygeneruj tydzień',
    menuTitle: 'Jadłospis',
    shareMenu: 'Udostępnij jadłospis',
    menuCopied: 'Jadłospis skopiowany — wklej go w komunikatorze.',
    addMeals: 'Dodaj dania',
    noPlan:
      'Planu jeszcze nie ma. Naciśnij przycisk — generator ułoży tydzień z puli dań według zasad dietetyka: rodzaj slotu, zakres kalorii, bez powtórek i z mieszanką planów.',
    swapHint:
      'Aby zamienić jedno danie, naciśnij przycisk zamiany po prawej stronie jego wiersza. Okno zaproponuje dania tego samego rodzaju z prognozą kalorii dnia.',
    confirmTitle: 'Wygenerować tydzień ponownie?',
    confirmText: (n) =>
      'Plan ma ręczne zamiany na dziś i kolejne dni: ' +
      n +
      '. Generator ułoży tydzień od nowa, a ręczne zamiany nie zostaną zachowane.',
    confirm: 'Wygeneruj ponownie',
    summary: (count, total, average, target, corridor) =>
      'Razem za ' +
      days(count) +
      ': ' +
      total +
      ' · średnio ' +
      average +
      '/dzień. Cel ' +
      target +
      ' ± ' +
      corridor +
      ' kcal.',
    sources: (list) => ' Źródła: ' + list + '.',
    viewerPortion: (viewer, owner) =>
      'Kalorie pokazano dla porcji ' +
      viewer +
      ', a zakresu pilnuje właściciel planu z porcją ' +
      owner +
      '.',
    incomplete: (n) =>
      'Dni, w których nie dla każdego slotu znamy kalorie: ' +
      n +
      ' — pominięto je w sumie.',
    generated: (at) => 'Wygenerowano ' + at + '.',
    missing: (n) =>
      slots(n) +
      ' ' +
      plural(n, 'wskazuje', 'wskazują', 'wskazuje') +
      ' na dania, których nie ma już w puli — wygeneruj tydzień ponownie.',
    stale:
      'Profil zmienił się po wygenerowaniu (cel lub zakres) — wygeneruj tydzień ponownie.',
    snackOn:
      'Przekąskę włączono w profilu po wygenerowaniu, a plan jej nie ma — wygeneruj tydzień ponownie.',
    snackOff:
      'Przekąskę wyłączono w profilu po wygenerowaniu, a plan nadal ją ma — wygeneruj tydzień ponownie.',
    outsidePlan:
      'Dzisiejszy dzień jest poza tym planem — wygeneruj tydzień ponownie.',
    unknownCalories: 'kalorie nieznane',
    incompleteShort: ' · niepełne',
    outside: ' · poza zakresem',
    swap: (type) => 'Zamień danie: ' + MEAL_TYPE[type],
    poolShortage,
    failure: (failure) => {
      switch (failure.code) {
        case 'invalidTarget':
          return 'Dzienny cel kaloryczny musi być liczbą dodatnią.'
        case 'poolShortage':
          return poolShortage(failure.shortage, failure.antiRepeatDays)
        case 'noFit':
          return (
            'Nie udało się ułożyć tygodnia na ' +
            failure.target +
            ' kcal/dzień nawet z zakresem ±' +
            failure.corridor +
            ' kcal. Zmień cel albo dodaj dania do puli.'
          )
        case 'emptyPool':
          return 'Pula dań jest pusta — dodaj dania na ekranie „Dania”.'
      }
    },
    warning: (warning) => {
      switch (warning.code) {
        case 'caloriesUnknown':
          return (
            'Dania bez kalorii dla porcji ' +
            warning.portion +
            ': ' +
            warning.count +
            '. Nie brały udziału w doborze — zakres dnia liczy tylko znane wartości.'
          )
        case 'corridorWidened':
          return (
            'Nie udało się zmieścić w ±' +
            warning.corridor +
            ' kcal — zakres poszerzono do ±' +
            warning.used +
            ' kcal.'
          )
        case 'mixBlockedByDislikes':
          return 'Oznaczenia „nielubiane” zawęziły pulę — mieszanka planów stała się niemożliwa.'
        case 'mixImpossible':
          return 'Pula nie pozwala na mieszankę planów — wszystkie dania pochodzą z jednego planu.'
        case 'mixFailed':
          return 'Nie udało się połączyć różnych planów — tydzień ułożono z dań jednego źródła.'
        case 'mixFailedCorridorWidened':
          return 'Zakres poszerzono do ±' + warning.used + ' kcal.'
        case 'dislikedKept':
          return 'Bez dań oznaczonych jako „nielubiane” tygodnia nie da się ułożyć — zostały w planie. Usuń oznaczenie albo dodaj dania do puli.'
      }
    },
  },
  calendar: {
    weekdays: ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'],
    planned: (n) => 'Zaplanowano: ' + days(n),
    history: 'Historia i plany',
    profileFirstHint:
      'Kalendarz pokazuje plan profilu. Utwórz go na ekranie „Dziś”.',
    previous: 'Poprzedni tydzień',
    next: 'Następny tydzień',
    empty:
      'Historia jest pusta — nie wygenerowano jeszcze żadnego tygodnia. Wygeneruj pierwszy na ekranie „Tydzień”, a jego dni pojawią się tutaj.',
    shared: (owner) => 'To kalendarz wspólnego planu profilu „' + owner + '”.',
    noPlanLabel: ', bez planu',
    noPlan: 'Na ten dzień nie ma planu.',
    noPlanFuture:
      ' Nowy tydzień generuje się na ekranie „Tydzień” i zaczyna się od dziś.',
    past: 'Miniony dzień — zamknięta historia, tylko do podglądu.',
  },
  swap: {
    noDay: 'W planie nie ma takiego dnia — wygeneruj tydzień ponownie.',
    pastTitle: 'Miniony dzień',
    past: 'Ten dzień już minął — historia się nie zmienia. Zamiany są dostępne tylko na dziś i kolejne dni.',
    incomplete:
      'W planie są sloty, których danie usunięto z puli. Dopóki są, zamiana liczyłaby zakres dnia na niepełnych danych — wygeneruj tydzień ponownie.',
    noSlot: 'Nie znaleziono slotu dnia — wygeneruj tydzień ponownie.',
    current: (name, calories, target, corridor) =>
      'Teraz: „' +
      name +
      '”' +
      (calories ? ' — ' + calories : '') +
      '. Cel ' +
      target +
      ' ± ' +
      corridor +
      ' kcal/dzień.',
    noCandidates: (type) =>
      'W puli nie ma innych dań rodzaju „' +
      MEAL_TYPE[type] +
      '”. Dodaj je na ekranie „Dania”.',
    favorite: 'ulubione',
    disliked: 'nielubiane',
    day: 'dzień → ',
    noneValid:
      'Żadna zamiana nie zachowuje poprawności tygodnia — każdy kandydat łamie zakres, blokadę powtórek albo mieszankę planów.',
    reason: {
      dayIncomplete: 'kalorie dnia niepełne',
      outsideCorridor: 'poza zakresem',
      repeatSoon: 'powtórka w pobliżu',
      breaksMix: 'łamie mieszankę planów',
    },
    failure: (failure) => {
      switch (failure.code) {
        case 'noDay':
          return 'W planie nie ma dnia nr ' + failure.day + '.'
        case 'unknownSlot':
          return 'Nieznany rodzaj slotu: „' + failure.slot + '”.'
        case 'noSlot':
          return (
            'Dzień nr ' +
            failure.day +
            ' nie ma slotu „' +
            MEAL_TYPE[failure.slot] +
            '”.'
          )
        case 'typeMismatch':
          return (
            'Danie „' +
            failure.meal +
            '” to ' +
            MEAL_TYPE[failure.mealType].toLowerCase() +
            ', a slot to „' +
            MEAL_TYPE[failure.slot] +
            '”.'
          )
      }
    },
  },
  shopping: {
    category: {
      veg: 'Warzywa i zioła',
      fruit: 'Owoce i jagody',
      meat: 'Mięso i ryby',
      dairy: 'Nabiał i jajka',
      grain: 'Zboża i strączki',
      bread: 'Pieczywo',
      pantry: 'Spiżarnia i przyprawy',
      sweet: 'Słodycze',
      other: 'Inne',
    },
    noQty: 'Bez dokładnej ilości',
    bought: (bought, total) => 'Kupiono ' + bought + ' z ' + total,
    fromWeek: 'Z bieżącego tygodnia',
    profileFirstHint:
      'Lista powstaje z planu profilu. Utwórz go na ekranie „Dziś”.',
    noPlan:
      'Nie ma jeszcze planu tygodnia. Wygeneruj go na ekranie „Tydzień” — lista powstanie ze składników dań, bez niczego wymyślonego.',
    plans: (n) => ' · plany: ' + n,
    missing: (n) =>
      'Sloty bez dania: ' +
      n +
      ' — usunięto je z puli, więc ich składników nie ma na liście.',
    share: 'Udostępnij to, czego nie kupiono',
    copied: 'Lista skopiowana — wklej ją w komunikatorze.',
    noIngredients: 'Dania z tego tygodnia nie mają składników.',
    noQtyHint:
      'Plan dietetyka nie podaje tu ilości — aplikacja ich nie wymyśla.',
    both: 'Oba profile',
    all: 'Wszystkie profile',
    scopeHint:
      'Zakres zostaje na tym urządzeniu. Oznaczenia „kupione” są wspólne dla rodziny — widzi je każdy telefon.',
    progress: (bought, total) => 'Kupiono ' + bought + ' z ' + total,
    boughtMark: ' — kupione',
  },
  recipe: {
    readingMeals: 'Czytamy pulę dań…',
    gone: 'Tego dania nie ma już w puli — usunięto je tutaj albo na innym urządzeniu.',
    reading: 'Czytamy przepis…',
    edit: 'Edytuj przepis',
    add: 'Dodaj przepis',
    hint: 'Kroki, czas i zdjęcie można tu dodać i zmienić — dosłownie z planu dietetyka albo własne. Składniki i kalorie edytuje się na ekranie „Dania”.',
    back: 'Wstecz',
    toMeals: 'Do dań',
    photoAlt: (name) => 'Zdjęcie: ' + name,
    imageFailed: 'Nie udało się odczytać obrazu.',
    noCanvas: 'Przeglądarka nie dała canvasu do zmniejszenia zdjęcia.',
    calories: (portion) => 'kalorie · ' + portion,
    prep: 'przygotowanie',
    servings: (n) => plural(n, 'porcja', 'porcje', 'porcji'),
    stayAwake: 'Nie wygaszaj ekranu',
    awakeRefused:
      'Przeglądarka nie pozwoliła utrzymać włączonego ekranu — być może przez oszczędzanie energii.',
    cooking: 'Gotowanie',
    forServings: (n) =>
      ' · na ' + n + ' ' + plural(n, 'porcję', 'porcje', 'porcji'),
    tapStep: 'Stuknij krok, aby oznaczyć go jako zrobiony.',
    steps: 'Kroki przygotowania',
    stepsHint: 'Jeden w wierszu. Puste — bez sekcji.',
    stepsPlaceholder: 'Gotuj kaszę gryczaną 15 min.\nUsmaż filet na złoto.',
    prepTime: 'Czas przygotowania, min',
    servingsField: 'Porcje',
    photo: 'Zdjęcie',
    photoChosen: ' · wybrane',
    photoOptional: ' · opcjonalnie',
    removePhoto: 'Usuń zdjęcie',
  },
  meals: {
    clearConfirm:
      'Usunąć wszystkie dania z puli razem z przepisami? Dania, które są w planach, zostaną. Zestaw startowy można później dodać ponownie.',
    cleared: (removed, kept) =>
      'Usunięto ' +
      meals(removed) +
      '.' +
      (kept
        ? ' Zostały dania, które są w planach: ' +
          kept +
          '. Najpierw je zamień albo wygeneruj tydzień ponownie.'
        : ''),
    inPool: (n) => meals(n) + ' w puli',
    emptyPool: 'Pula dań jest pusta',
    all: 'Wszystkie',
    favorites: 'Ulubione',
    disliked: 'Nielubiane',
    gerdOnly: 'Tylko refluks',
    add: 'Dodaj danie',
    importPdf: 'Importuj z planu PDF dietetyka',
    amongChosen: ' wśród wybranych.',
    noGerd: 'Brak dań z oznaczeniem refluksu wśród wybranych.',
    none: 'Nie ma jeszcze dań. Dodaj pierwsze ręcznie — z planu dietetyka.',
    noFavorites: 'Brak dań oznaczonych jako „ulubione”.',
    noDisliked: 'Brak dań oznaczonych jako „nielubiane”.',
    noType: 'Brak dań tego rodzaju.',
    edit: (name) => 'Edytuj danie „' + name + '”',
    clearAll: 'Wyczyść wszystkie dania',
    tasteHint:
      'Ulubione dania częściej trafiają do planu, nielubiane są pomijane. Zasady dietetyka (rodzaj slotu, zakres kalorii, bez powtórek i mieszanka planów) mają pierwszeństwo przed smakiem i nigdy nie są przez niego luzowane.',
  },
  mealForm: {
    inPlans: (n) =>
      'Danie jest w planie, slotów: ' +
      n +
      '. Najpierw je zamień albo wygeneruj tydzień ponownie — inaczej w planie zostanie pusty slot.',
    deleteConfirm: (name) => 'Usunąć danie „' + name + '”?',
    edit: 'Edytuj danie',
    create: 'Nowe danie',
    name: 'Nazwa',
    namePlaceholder: 'Kasza gryczana z kurczakiem i warzywami',
    type: 'Rodzaj slotu',
    ingredients: 'Składniki',
    ingredientsHint: 'Jeden w wierszu; ilość po „ — ”.',
    ingredientsPlaceholder:
      'kasza gryczana — 80 g\nfilet z kurczaka — 150 g\nwarzywa do wyboru',
    portions: 'Gotowa porcja Ж/Ч',
    portionsHint:
      'Dosłownie z planu; składnik przed „ — ”. Puste — bez sekcji.',
    portionsPlaceholder: 'Ж - 130 g; Ч - 200 g\nDodatek — Ж - 100 g; Ч - 150 g',
    source: 'Źródło (plan dietetyka)',
    sourceHint: 'Np. „Tydzień 2” — według tego generator miesza tydzień.',
    sourcePlaceholder: 'Tydzień 2',
    gerd: 'Refluks — danie z planu, który uwzględnia refluks (GERD)',
    issues: 'Błędy w źródle',
    issuesHint:
      'Jeden w wierszu, bez poprawnej wartości. Gdy sprawa się wyjaśni i pole zostanie poprawione, usuń wiersz.',
    issuesPlaceholder: 'Dzień 1 ma 70 g ryżu, dzień 2 — 100 g',
    portion: (letter) => 'Porcja ' + letter,
    defaultPortion: ' · i profile bez porcji',
    calories: 'Kalorie, kcal',
    caloriesHint: (letter) =>
      'Puste — generator nie użyje dania dla profili z porcją ' +
      letter +
      ': zakres dnia liczy się w liczbach.',
  },
  profiles: {
    lastOne: 'Ostatniego profilu nie można usunąć.',
    deleteConfirm: (name) =>
      'Usunąć profil „' + name + '”? Jego tydzień i kalendarz też znikną.',
    title: 'Profile',
    corridor: (target, corridor) => target + ' ± ' + corridor + ' kcal',
    portion: (letter) => ' · porcja ' + letter,
    shared: ' · wspólny plan',
    noSnack: ' · bez przekąski',
    poolSize: (n) => ' · pula: ' + n,
    change: 'Zmień',
    add: 'Dodaj profil',
    edit: 'Edytuj profil',
    create: 'Nowy profil',
    name: 'Nazwa',
    namePlaceholder: 'Mój profil',
    target: 'Cel, kcal/dzień',
    corridorField: 'Zakres, ±kcal',
    color: 'Kolor',
    colorOption: (color) => 'Kolor ' + color,
    portionField: 'Porcja z planu dietetyka',
    noPortion: '— nie ustawiono',
    sharedWith: 'Wspólny plan z profilem',
    ownPlan: '— własny plan',
    sharedHint:
      'Połączone profile jedzą te same dania — mają jeden plan, właściciela.',
    snack: 'Przekąska',
    snackDaily: 'codziennie',
    snackNone: 'bez przekąski',
    pool: 'Pula dań',
    wholePool: 'Cała wspólna pula',
    emptyPool: 'Pula jest pusta — dodaj dania na ekranie „Dania”.',
  },
  pdf: {
    known: 'To danie jest już w puli — domyślnie nie jest importowane.',
    flag: {
      'dessert-split': 'Nazwę oddzielono od opisu porcji — sprawdź.',
      dup: 'Powtórzona nazwa — to danie jest już wyżej.',
      'no-kcal':
        'W PDF nie ma kaloryczności — wpisz ją ręcznie, aby dodać danie do puli.',
    },
    reading: (name) => 'Czytamy „' + name + '”…',
    page: (page, total) =>
      'Wyodrębniamy tekst: strona ' + page + ' z ' + total + '…',
    noText: 'W pliku nie znaleziono tekstu (może to skan).',
    readFailed: (detail) => 'Nie udało się odczytać PDF: ' + detail,
    recipeFailed: (detail) =>
      'Danie dodano, ale kroki i porcje nie zapisały się: ' + detail,
    added: (n) => 'Dodano do puli: ' + meals(n) + '. ',
    failed: (n) => 'Nie dodano: ' + n + ' — zobacz oznaczenia na kartach.',
    done: 'Gotowe.',
    nothing: 'Nic nie wybrano.',
    noSupabase: 'Serwer Supabase nie jest skonfigurowany.',
    archiveFailed: (detail) =>
      'Dania dodano, ale tekst planu nie zapisał się w archiwum importów — do tego potrzebna jest sieć. ' +
      detail,
    hint: 'Rozpoznajemy tylko to, co dosłownie jest w pliku: nazwy, rodzaj posiłku, składniki, numer tygodnia, kalorie, jeśli są podane. Czego nie ma w PDF, zostaje puste. Wszystko sprawdzasz i potwierdzasz, zanim trafi do puli.',
    paste: 'Albo wklej tekst skopiowany z PDF',
    pastePlaceholder: 'День 1\nСніданок: …',
    recognize: 'Rozpoznaj tekst',
    reviewTitle: 'Sprawdź przed dodaniem',
    stats: (found, repeats, dups, weeks, dayCount) =>
      'Rozpoznano dań: ' +
      found +
      (repeats ? ' · powtórki między dniami: ' + repeats : '') +
      (dups ? ' · powtórzone nazwy: ' + dups : '') +
      (weeks ? ' · tygodnie: ' + weeks : '') +
      (dayCount ? ' · dni: ' + dayCount : '') +
      '. Powtórki („Той самий…”) nie trafiają do puli — samo danie jest już wyżej. Wątpliwe miejsca są oznaczone; surowy tekst planu jest pod każdą kartą.',
    poolUnread: (issue) =>
      'Nie udało się odczytać puli dań, więc nic nie jest zaznaczone z góry — sprawdź każdą kartę samodzielnie. ' +
      issue,
    none: 'W tekście nie rozpoznano dań. Sprawdź, czy to plan z wierszami typu «Сніданок: …», «Обід: …».',
    archive: 'Zapisz tekst planu w archiwum',
    adding: 'Dodawanie…',
    addChosen: (n) => 'Dodaj wybrane do puli (' + n + ')',
    another: 'Inny plik',
    day: (n) => ' · Dzień ' + n,
    repeat: ' — powtórka',
    inPool: ' · już w puli',
    name: 'Nazwa',
    type: 'Rodzaj slotu',
    calories: 'Kalorie, kcal',
    caloriesPlaceholder: 'brak w PDF',
    servings: 'Porcje',
    source: 'Źródło (plan dietetyka)',
    ingredients: 'Składniki (jeden w wierszu)',
    portions: 'Gotowa porcja Ж/Ч (składnik przed „ — ”)',
    steps: 'Kroki/uwagi z planu (jeden w wierszu)',
    raw: 'Surowy tekst z planu',
  },
}
