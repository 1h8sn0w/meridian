import type { MealType, PoolShortage } from '@meridian/core'
import type { Messages } from './uk.ts'

const RULES = new Intl.PluralRules('de-DE')

function plural(n: number, one: string, other: string): string {
  return RULES.select(n) === 'one' ? one : other
}

const MEAL_TYPE: Record<MealType, string> = {
  breakfast: 'Frühstück',
  lunch: 'Mittagessen',
  dinner: 'Abendessen',
  snack: 'Snack',
}

const MEAL_TYPE_OF: Record<MealType, string> = {
  breakfast: 'des Frühstücks',
  lunch: 'des Mittagessens',
  dinner: 'des Abendessens',
  snack: 'des Snacks',
}

const MEAL_TIME: Record<MealType, string> = {
  breakfast: 'Frühstückszeit',
  lunch: 'Zeit fürs Mittagessen',
  dinner: 'Zeit fürs Abendessen',
  snack: 'Zeit für einen Snack',
}

const days = (n: number) => n + ' ' + plural(n, 'Tag', 'Tage')
const meals = (n: number) => n + ' ' + plural(n, 'Gericht', 'Gerichte')
const slots = (n: number) => n + ' ' + plural(n, 'Slot', 'Slots')

const poolShortage = (
  shortage: ReadonlyArray<PoolShortage>,
  antiRepeatDays: number,
) =>
  'Zu wenige Gerichte im Pool. Die Regel „höchstens einmal alle ' +
  days(antiRepeatDays) +
  '“ braucht mindestens ' +
  meals(antiRepeatDays) +
  ' jeder Art, derzeit sind es: ' +
  shortage
    .map(
      ({ type, have, need }) =>
        MEAL_TYPE[type] + ' — ' + have + ' (nötig ≥ ' + need + ')',
    )
    .join('; ') +
  '. Füge auf dem Bildschirm „Gerichte“ welche hinzu oder verkürze die Wiederholungssperre auf dem Bildschirm „Heute“.'

export const de: Messages = {
  common: {
    close: 'Schließen',
    retry: 'Erneut versuchen',
    save: 'Speichern',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    minutes: (n) => n + ' Min.',
    todayTag: 'heute',
    profileFirst: 'Zuerst ein Profil',
    mealRemoved: 'Gericht aus dem Pool entfernt',
    openWeekScreen: 'Bildschirm „Woche“ öffnen',
    shareFailed:
      'Der Browser bietet weder ein „Teilen“-Menü noch Zugriff auf die Zwischenablage.',
    macroFields: {
      protein: 'Eiweiß, g',
      fat: 'Fett, g',
      carbs: 'Kohlenhydrate, g',
    },
    mealType: MEAL_TYPE,
    kcalUnit: 'kcal',
    kcal: (value) => value + ' kcal',
    grams: (value) => value + ' g',
    days,
    at: (day, time) => day + ' um ' + time,
    queryProblem: (message) => 'Datenbankabfrage: ' + message,
  },
  titles: {
    today: 'Heute',
    week: 'Woche',
    calendar: 'Kalender',
    meals: 'Gerichte',
    recipe: 'Rezept',
    shopping: 'Einkaufsliste',
    family: 'Familie',
  },
  gate: {
    notConfigured: 'Die App ist nicht eingerichtet',
    noSupabase: 'Keine Supabase-Adresse',
    serverMissing:
      'Der Server hat {url} und {key} nicht erhalten. Wo sie zu finden sind: {readme}; für {dev}: {example}.',
    loading: 'Einen Moment…',
    localDbPending: 'Lokale Datenbank wird vorbereitet…',
  },
  profileSwitcher: {
    manage: 'Profile verwalten',
    summary: (name, target, corridor) =>
      name + ' · ' + target + ' ± ' + corridor + ' kcal/Tag',
  },
  antiRepeat: {
    title: 'Keine Wiederholungen',
    label: 'Ein Gericht höchstens einmal alle',
    hint: 'Die Regel gilt für die ganze Familie. Sie wirkt ab der nächsten Wochenplanung und dem nächsten Tausch; bestehende Pläne werden nicht neu berechnet.',
    savedBroken: (value) =>
      'Die Wiederholungssperre der Familie wurde fehlerhaft gespeichert: ' +
      value +
      '.',
  },
  search: {
    label: 'Gerichte suchen',
    placeholder: 'Name oder Zutat',
    clear: 'Suche leeren',
    found: (n) => meals(n) + ' gefunden',
    notFound: (query) =>
      'Keine Gerichte mit „' + query + '“ im Namen oder in den Zutaten',
  },
  dayTotal: {
    unknown:
      'Die Kalorien des Tages sind unbekannt — die Gerichte haben keine Zahlen.',
    total: (total) => 'Tagessumme: ' + total,
    target: (target, corridor) =>
      ' · Ziel ' + target + ' ± ' + corridor + ' kcal',
    incomplete: (n) => ' · unvollständig: ' + slots(n) + ' ohne Zahlen',
    outside: ' · außerhalb des Bereichs',
  },
  taste: {
    favorite: 'Lieblingsgericht',
    disliked: 'Mag ich nicht',
  },
  today: {
    current: 'Aktuelle Mahlzeit',
    noWindows: 'Es gibt keine Essenszeiten — die Tagesuhr ist leer.',
    outsidePlan:
      'Heute liegt außerhalb des gespeicherten Plans — plane die Woche neu.',
    mealRemoved:
      'Das Gericht dieses Slots wurde aus dem Pool entfernt — plane die Woche neu.',
    nextOutsidePlan:
      'Die nächste Mahlzeit liegt schon außerhalb des Plans — plane die Woche neu.',
    now: (type, until) => 'Jetzt: ' + MEAL_TYPE[type] + ' (bis ' + until + ')',
    next: (type, at, tomorrow) =>
      'Als Nächstes: ' +
      MEAL_TYPE[type] +
      ' um ' +
      at +
      (tomorrow ? ' (morgen)' : ''),
    swap: 'Gericht tauschen',
    later: (tomorrow) => (tomorrow ? 'Später morgen' : 'Später heute'),
  },
  firstSteps: {
    title: 'Erste Schritte',
    done: ' — erledigt',
    profile: 'Profil',
    profileDone: 'Angelegt.',
    profileText:
      'Kalorienziel, Bereich und Portion aus dem Plan der Ernährungsberatung — darum herum plant der Generator die Woche.',
    createProfile: 'Profil anlegen',
    mealsEmpty:
      'Startset, Import aus dem PDF der Ernährungsberatung oder von Hand.',
    mealsShort: (count, need, have) =>
      'Gerichte im Pool: ' +
      count +
      ' — für eine Woche reicht das nicht: nötig sind mindestens ' +
      meals(need) +
      ' mit Kalorien je Art. Derzeit: ' +
      have +
      '.',
    mealsCount: (count) => 'Gerichte im Pool: ' + count + '.',
    openMeals: '„Gerichte“ öffnen',
    weekText:
      'Der Generator plant eine Woche aus dem Pool, und die aktuelle Mahlzeit erscheint hier.',
    openWeek: '„Woche“ öffnen',
  },
  clock: {
    night: 'Nacht',
    nowMeal: (time, type) => 'Es ist ' + time + ' — ' + MEAL_TIME[type] + '.',
    nowNight: (time) => 'Es ist ' + time + ' — Nachtruhe.',
    nextMeal: (type, at) => ' ' + MEAL_TYPE[type] + ' um ' + at + '.',
    until: (time) => 'bis ' + time,
    nextShort: (type, at) => MEAL_TYPE[type] + ' um ' + at,
  },
  mealHours: {
    title: 'Essenszeiten',
    change: 'Essenszeiten ändern',
    start: 'Beginn',
    end: 'Ende',
    hint: 'Die Zeiten gelten für die ganze Familie: Jedes Gerät sieht sie, und die Erinnerungen richten sich danach. Der Snack liegt zwischen Mittag- und Abendessen.',
    reset: 'Auf Standard zurücksetzen',
    timeRange: 'Uhrzeit von 00:00 bis 24:00 in 15-Minuten-Schritten.',
    startBeforeEnd: 'Der Beginn muss vor dem Ende liegen.',
    afterPrevious: (type, previous, end) =>
      MEAL_TYPE[type] +
      ' darf nicht vor dem Ende ' +
      MEAL_TYPE_OF[previous] +
      ' (' +
      end +
      ') beginnen.',
    savedPartly: 'Die Essenszeiten wurden unvollständig gespeichert.',
    savedBroken: (problem) => 'Essenszeiten: ' + problem,
  },
  reminders: {
    title: 'Erinnerungen',
    enable: 'Vor Mahlzeiten erinnern',
    lead: 'Vorlauf',
    today: 'Heute: ',
    hint: 'Erinnerungen verschickt die Seite selbst, sie kommen also an, solange die App geöffnet ist: Die App hat keinen Push-Server. Auf dem iPhone funktionieren Benachrichtigungen nur in der installierten App („Zum Home-Bildschirm“).',
    test: 'Testbenachrichtigung senden',
    permission: {
      denied:
        'Benachrichtigungen sind für diese Seite blockiert — erlaube sie in den Browsereinstellungen.',
      default: 'Die Erlaubnis für Benachrichtigungen wurde nicht erteilt.',
      unsupported: 'Dieser Browser unterstützt keine Benachrichtigungen.',
    },
    notificationTitle: (type, lead, at) =>
      MEAL_TYPE[type] +
      (lead ? ' in ' + lead + ' Min.' : ' beginnt') +
      ' · um ' +
      at,
    noPlan: 'Für diese Mahlzeit gibt es keinen Plan — plane die Woche.',
  },
  auth: {
    tagline: 'Essensplaner für die Familie',
    signIn: 'Anmelden',
    signUp: 'Registrieren',
    signInHint:
      'Gerichte, Speiseplan und Einkaufsliste teilt sich die ganze Familie.',
    signUpHint:
      'Nach der Registrierung gründest du eine Familie oder trittst einer bestehenden mit einem Code bei.',
    email: 'E-Mail',
    password: 'Passwort',
    passwordHint: 'Mindestens 6 Zeichen.',
    submitSignIn: 'Anmelden',
    submitSignUp: 'Registrieren',
    confirmSent: (address) =>
      'Konto erstellt. Eine Bestätigungs-E-Mail ging an ' +
      address +
      ' — öffne sie und komm zum Anmelden hierher zurück.',
    noAccount: 'Noch kein Konto? ',
    haveAccount: 'Schon ein Konto? ',
    signOut: 'Abmelden',
  },
  familySetup: {
    signedInAs: (email) => 'Angemeldet als ' + (email ?? 'unbekanntes Konto'),
    create: 'Familie gründen',
    createHint:
      'Speiseplan, Gerichte-Pool und Einkaufsliste teilst du mit allen, die du einlädst.',
    name: 'Name der Familie',
    creating: 'Wird gegründet…',
    submitCreate: 'Gründen',
    join: 'Mit Code beitreten',
    joinHint:
      'Wer schon in der Familie ist, gibt dir den Code von seinem Familienbildschirm. Bindestriche, Leerzeichen und Groß-/Kleinschreibung spielen keine Rolle.',
    code: 'Einladungscode',
    joining: 'Beitritt läuft…',
    submitJoin: 'Beitreten',
  },
  family: {
    subtitle: 'Gerichte, Wochenplan und Einkaufsliste sind gemeinsam',
    members: 'In der Familie',
    noEmail: 'Konto ohne E-Mail',
    you: 'du',
    invite: 'Einladen',
    inviteHint: (until) =>
      'Einmalig, gültig bis ' +
      until +
      '. Sag ihn der eingeladenen Person — sie gibt den Code nach der Registrierung ein.',
    noInvite:
      'Kein aktiver Code. Erstelle einen und gib ihn einem anderen Familienmitglied.',
    preparing: 'Code wird vorbereitet…',
    newCode: 'Neuer Code',
    createCode: 'Code erstellen',
    language: 'Sprache',
    languageLabel: 'Sprache der Oberfläche',
    languageHint:
      'Die Wahl wird auf diesem Gerät gespeichert. Namen der Gerichte, Rezepte und Pläne der Ernährungsberatung werden nicht übersetzt.',
  },
  starter: {
    broken:
      'Das Startset auf dem Server ist ungültig — es wurden keine Gerichte hinzugefügt.',
    failed: 'Das Startset konnte nicht hinzugefügt werden.',
    add: 'Startset hinzufügen',
    missing: (n) =>
      'Gerichte aus den Plänen der Ernährungsberatung, die noch nicht im Pool sind: ' +
      n +
      '. Vorhandene Gerichte bleiben, wie sie sind.',
    offer:
      'Gerichte aus den Plänen der Ernährungsberatung, die die Administration auf den Server gelegt hat.',
    added: (n) => meals(n) + ' hinzugefügt.',
    allThere: 'Alle Gerichte des Sets sind schon im Pool.',
  },
  details: {
    gerd: 'Reflux',
    sourceIssue: 'Die Quelle enthält eine Unstimmigkeit',
    sourceError: 'Fehler in der Quelle.',
    sourceErrorText:
      ' Der Plan der Ernährungsberatung widerspricht sich hier; die Werte sind unverändert übernommen:',
    protein: 'Eiweiß',
    fat: 'Fett',
    carbs: 'Kohlenhydrate',
    noMacros: 'Keine Angaben zu Eiweiß, Fett und Kohlenhydraten.',
    ingredients: 'Zutaten',
    noIngredients: 'Keine Zutaten angegeben.',
    portion: 'Fertige Portion',
  },
  forms: {
    notNumber: (label) =>
      'Das Feld „' + label + '“ muss eine Zahl oder leer sein.',
    negative: (label) => 'Das Feld „' + label + '“ darf nicht negativ sein.',
    nutrition: {
      calories: 'Kalorien',
      protein: 'Eiweiß',
      fat: 'Fett',
      carbs: 'Kohlenhydrate',
    },
    portionField: (label, letter) => label + ' · Portion ' + letter,
    nameRequired: 'Der Name des Gerichts fehlt.',
    typeRequired: 'Wähle die Art des Slots.',
    profileNameRequired: 'Der Profilname fehlt.',
    targetPositive: 'Das tägliche Kalorienziel muss eine positive Zahl sein.',
    corridorNonNegative:
      'Der Kalorienbereich muss eine nicht negative Zahl sein.',
    sharedSelf: 'Ein Profil kann keinen Plan mit sich selbst teilen.',
    sharedMissing: 'Das Profil für den gemeinsamen Plan wurde nicht gefunden.',
    sharedFollower: (owner) =>
      'Das Profil „' +
      owner +
      '“ nutzt selbst einen gemeinsamen Plan — wähle das Besitzerprofil.',
    sharedOwner: (name, dependants) =>
      'Das Profil „' +
      name +
      '“ besitzt bereits einen gemeinsamen Plan für: ' +
      dependants +
      '. Löse zuerst diese Verknüpfungen.',
    goalProtein: 'Ziel: Eiweiß',
    goalFat: 'Ziel: Fett',
    goalCarbs: 'Ziel: Kohlenhydrate',
    prepTime: 'Zubereitungszeit',
    servingsNumber: '„Portionen“ muss eine Zahl oder leer sein.',
    servingsPositive: '„Portionen“ muss eine positive Zahl sein.',
    caloriesMissing:
      'Gib die Kalorien ein — das PDF enthält keine, und ohne sie kommt das Gericht nicht in den Pool.',
    caloriesNumber:
      'Die Kalorien müssen eine Zahl sein — entferne alles außer Ziffern aus dem Feld.',
    caloriesNonNegative: 'Die Kalorien müssen eine nicht negative Zahl sein.',
    servingsWhole: 'Portionen: eine ganze Zahl ab 1 oder leer.',
  },
  sync: {
    title: 'Synchronisierung',
    notConfigured:
      'Nicht eingerichtet: Der Server hat {url} nicht erhalten. Die App funktioniert, aber die Daten bleiben auf diesem Gerät. Wo die Adresse zu finden ist: {readme}.',
    error: 'Fehler',
    online: 'Online',
    connecting: 'Verbindung wird aufgebaut…',
    offline: 'Offline — Änderungen werden auf dem Gerät gespeichert',
    state: 'Status',
    lastSynced: 'Letzte Aktualisierung',
    never: 'noch nicht',
    stored: 'Einträge auf dem Gerät',
    pending: 'Warten auf Upload',
    rejected: (n) =>
      'Der Server hat ' +
      n +
      ' ' +
      plural(n, 'Änderung', 'Änderungen') +
      ' von diesem Gerät nicht angenommen. Sie wurden verworfen: Sie haben weder den Server noch andere Geräte erreicht — wiederhole die Aktion, falls du sie noch brauchst.',
    understood: 'Verstanden',
    retrying:
      'Die App versucht es selbst weiter; sobald der Server antwortet, verschwindet der Fehler.',
    hint: 'Die App liest und schreibt die lokale Datenbank und funktioniert daher ohne Netz. Änderungen gehen an den Server, sobald das Netz zurück ist.',
  },
  importV1: {
    title: 'Daten aus V1 übernehmen',
    meals,
    recipes: (n) => n + ' ' + plural(n, 'Rezept', 'Rezepte'),
    profiles: (n) => n + ' ' + plural(n, 'Profil', 'Profile'),
    prefs: (n) =>
      n + ' ' + plural(n, 'Geschmacksmarkierung', 'Geschmacksmarkierungen'),
    nothing: 'nichts',
    readFailed: 'Die Exportdatei konnte nicht gelesen werden.',
    writeFailed: 'Die Daten konnten nicht auf das Gerät geschrieben werden.',
    unavailable:
      'Nicht verfügbar: Die Daten gehen in die lokale Datenbank, und die hat sich auf diesem Gerät nicht geöffnet. Den Grund zeigt der Abschnitt „Synchronisierung“.',
    done: (summary) => 'Übernommen: ' + summary + '.',
    another: 'Weitere Datei übernehmen',
    preview: 'Datei {file} — bringt: {summary}.',
    skipped: (n) => 'Nicht übernommen (' + n + ')',
    applying: 'Wird übernommen…',
    apply: 'Übernehmen',
    hint: 'Die V1-Daten liegen im Browserspeicher, also kann nur der Browser selbst sie herausholen. Öffne V1 unter derselben Adresse wie sonst, führe den Inhalt von {script} in der Konsole aus und wähle hier die gespeicherte Datei. Ein erneuter Import derselben Datei erzeugt keine Duplikate.',
  },
  errors: {
    auth: {
      invalid_credentials: 'Falsche E-Mail oder falsches Passwort.',
      email_not_confirmed:
        'Die E-Mail ist noch nicht bestätigt — sieh in dein Postfach.',
      user_already_exists:
        'Dieses Konto existiert bereits. Versuche, dich anzumelden.',
      weak_password: 'Das Passwort ist zu kurz. Mindestens 6 Zeichen.',
      validation_failed: 'Prüfe E-Mail und Passwort.',
      over_request_rate_limit:
        'Zu viele Versuche. Versuche es in einer Minute erneut.',
      over_email_send_rate_limit:
        'Zu viele E-Mails. Versuche es später erneut.',
      signup_disabled: 'Die Registrierung ist auf diesem Server deaktiviert.',
    },
    rpc: {
      not_authenticated: 'Die Sitzung ist verloren. Melde dich erneut an.',
      family_name_required: 'Gib den Namen der Familie ein.',
      already_in_family: 'Du bist bereits in einer Familie.',
      no_family: 'Gründe zuerst eine Familie oder tritt einer bei.',
      invite_not_found:
        'Diesen Code gibt es nicht. Prüfe, ob kein Zeichen fehlt.',
      invite_already_used:
        'Dieser Code wurde schon benutzt. Bitte um einen neuen.',
      invite_expired: 'Der Code ist abgelaufen. Bitte um einen neuen.',
    },
    generic: 'Die Aktion konnte nicht ausgeführt werden.',
    insecure:
      'Der Browser gibt der App keine lokale Datenbank: Die Seite ist ohne HTTPS geöffnet. Öffne sie unter einer https://-Adresse — oder über localhost auf dem Server selbst.',
    localDb:
      'Die lokale Datenbank konnte auf diesem Gerät nicht geöffnet werden.',
    syncOffline:
      'Keine Verbindung zum Synchronisierungsserver: kein Netz. Die Daten auf dem Gerät sind sicher.',
    syncUnauthorized:
      'Der Synchronisierungsserver hat die Anmeldung nicht akzeptiert. Melde dich ab und wieder an.',
    syncUpload:
      'Der Server nimmt keine Änderungen von diesem Gerät an. Sie bleiben in der Warteschlange und gehen raus, sobald der Server sie annimmt.',
    syncDownload:
      'Vom Synchronisierungsserver kamen keine Daten. Die Änderungen dieses Geräts sind darauf gespeichert.',
    rejectedTable: {
      profile: 'Profil',
      meal: 'Gericht',
      recipe: 'Rezept',
      meal_pref: 'Geschmacksmarkierung',
      week_plan: 'Wochenplan',
      plan_slot: 'Gericht im Plan',
      shopping_check: 'Markierung in der Einkaufsliste',
      family_settings: 'Familieneinstellungen',
    },
    rejectedOp: {
      PUT: 'das Anlegen',
      PATCH: 'die Änderung',
      DELETE: 'das Löschen',
    },
    rejectedReason: {
      duplicate:
        'dieser Eintrag existiert bereits (wohl auf einem anderen Gerät angelegt)',
      missingParent: 'der verknüpfte Eintrag existiert nicht mehr',
      missingField: 'ein Pflichtfeld fehlt',
      outOfRange: 'der Wert liegt außerhalb des zulässigen Bereichs',
      forbidden:
        'kein Zugriff — vielleicht gehört das Gerät nicht mehr zu dieser Familie',
      invalid: 'ungültiger Wert',
      other: 'der Server hat die Daten abgelehnt',
    },
    rejected: (what, op, reason) =>
      what + ': Der Server hat ' + op + ' nicht angenommen — ' + reason + '.',
  },
  week: {
    sharedNote: (owner) =>
      'Dieses Profil nutzt den gemeinsamen Plan des Profils „' +
      owner +
      '“. Nur der Besitzer kann ihn neu planen.',
    target: (target, corridor) =>
      'Ziel ' + target + ' ± ' + corridor + ' kcal/Tag',
    sevenDays: 'Ein Plan für 7 Tage',
    profileFirstHint:
      'Kalorienziel und Bereich nimmt der Generator aus dem Profil. Lege eines auf dem Bildschirm „Heute“ an.',
    generating: 'Woche wird geplant…',
    regenerate: 'Woche neu planen',
    generate: 'Woche planen',
    menuTitle: 'Speiseplan',
    shareMenu: 'Speiseplan teilen',
    menuCopied: 'Der Speiseplan ist kopiert — füge ihn in einen Messenger ein.',
    addMeals: 'Gerichte hinzufügen',
    noPlan:
      'Noch kein Plan. Drück den Knopf — der Generator plant eine Woche aus dem Gerichte-Pool nach den Regeln der Ernährungsberatung: Art des Slots, Kalorienbereich, keine Wiederholungen und ein Mix der Pläne.',
    swapHint:
      'Um ein einzelnes Gericht zu tauschen, drück die Tauschtaste rechts in seiner Zeile. Der Dialog bietet Gerichte derselben Art mit einer Prognose der Tageskalorien an.',
    confirmTitle: 'Woche neu planen?',
    confirmText: (n) =>
      'Der Plan enthält ' +
      n +
      ' ' +
      plural(
        n,
        'von Hand getauschtes Gericht',
        'von Hand getauschte Gerichte',
      ) +
      ' für heute und die folgenden Tage. Der Generator plant die Woche neu, von Hand getauschte Gerichte bleiben nicht erhalten.',
    confirm: 'Neu planen',
    summary: (count, total, average, target, corridor) =>
      'Summe für ' +
      days(count) +
      ': ' +
      total +
      ' · im Schnitt ' +
      average +
      '/Tag. Ziel ' +
      target +
      ' ± ' +
      corridor +
      ' kcal.',
    sources: (list) => ' Quellen: ' + list + '.',
    viewerPortion: (viewer, owner) =>
      'Die Kalorien gelten für Portion ' +
      viewer +
      ', den Bereich hält der Planbesitzer mit Portion ' +
      owner +
      '.',
    incomplete: (n) =>
      'An ' +
      n +
      ' ' +
      plural(n, 'Tag', 'Tagen') +
      ' sind die Kalorien nicht für jeden Slot bekannt — diese Tage fehlen in der Summe.',
    generated: (at) => 'Geplant ' + at + '.',
    missing: (n) =>
      slots(n) +
      ' ' +
      plural(n, 'verweist', 'verweisen') +
      ' auf Gerichte, die nicht mehr im Pool sind — plane die Woche neu.',
    stale:
      'Das Profil hat sich nach der Planung geändert (Ziel oder Bereich) — plane die Woche neu.',
    snackOn:
      'Der Snack wurde nach der Planung im Profil eingeschaltet, und der Plan hat keinen — plane die Woche neu.',
    snackOff:
      'Der Snack wurde nach der Planung im Profil ausgeschaltet, und der Plan enthält ihn noch — plane die Woche neu.',
    outsidePlan: 'Heute liegt außerhalb dieses Plans — plane die Woche neu.',
    unknownCalories: 'Kalorien unbekannt',
    incompleteShort: ' · unvollständig',
    outside: ' · außerhalb des Bereichs',
    swap: (type) => 'Gericht tauschen: ' + MEAL_TYPE[type],
    poolShortage,
    failure: (failure) => {
      switch (failure.code) {
        case 'invalidTarget':
          return 'Das tägliche Kalorienziel muss eine positive Zahl sein.'
        case 'poolShortage':
          return poolShortage(failure.shortage, failure.antiRepeatDays)
        case 'noFit':
          return (
            'Selbst mit einem Bereich von ±' +
            failure.corridor +
            ' kcal ließ sich keine Woche für ' +
            failure.target +
            ' kcal/Tag planen. Ändere das Ziel oder füge Gerichte zum Pool hinzu.'
          )
        case 'emptyPool':
          return 'Der Gerichte-Pool ist leer — füge auf dem Bildschirm „Gerichte“ welche hinzu.'
      }
    },
    warning: (warning) => {
      switch (warning.code) {
        case 'caloriesUnknown':
          return (
            'Gerichte ohne Kalorien für Portion ' +
            warning.portion +
            ': ' +
            warning.count +
            '. Sie blieben bei der Auswahl außen vor — der Tagesbereich zählt nur bekannte Zahlen.'
          )
        case 'corridorWidened':
          return (
            '±' +
            warning.corridor +
            ' kcal ließen sich nicht einhalten — der Bereich wurde auf ±' +
            warning.used +
            ' kcal erweitert.'
          )
        case 'mixBlockedByDislikes':
          return 'Markierungen „Mag ich nicht“ haben den Pool verkleinert — ein Mix der Pläne ist unmöglich geworden.'
        case 'mixImpossible':
          return 'Der Pool erlaubt keinen Mix der Pläne — ein Plan deckt alle Gerichte ab.'
        case 'mixFailed':
          return 'Verschiedene Pläne ließen sich nicht kombinieren — die Woche besteht aus Gerichten einer Quelle.'
        case 'mixFailedCorridorWidened':
          return 'Der Bereich wurde auf ±' + warning.used + ' kcal erweitert.'
        case 'dislikedKept':
          return 'Ohne Gerichte mit der Markierung „Mag ich nicht“ lässt sich die Woche nicht planen — sie sind im Plan geblieben. Entferne die Markierung oder füge Gerichte zum Pool hinzu.'
      }
    },
  },
  calendar: {
    weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
    planned: (n) => days(n) + ' geplant',
    history: 'Verlauf und Pläne',
    profileFirstHint:
      'Der Kalender zeigt den Plan des Profils. Lege eines auf dem Bildschirm „Heute“ an.',
    previous: 'Vorige Woche',
    next: 'Nächste Woche',
    empty:
      'Der Verlauf ist leer — es wurde noch keine Woche geplant. Plane die erste auf dem Bildschirm „Woche“, dann erscheinen ihre Tage hier.',
    shared: (owner) =>
      'Das ist der Kalender des gemeinsamen Plans des Profils „' + owner + '“.',
    noPlanLabel: ', kein Plan',
    noPlan: 'Für diesen Tag gibt es keinen Plan.',
    noPlanFuture:
      ' Eine neue Woche wird auf dem Bildschirm „Woche“ geplant und beginnt mit heute.',
    past: 'Ein vergangener Tag — feste Historie, nur zum Ansehen.',
  },
  swap: {
    noDay: 'Den Tag gibt es im Plan nicht — plane die Woche neu.',
    pastTitle: 'Vergangener Tag',
    past: 'Dieser Tag ist vorbei — die Historie ändert sich nicht. Tauschen geht nur für heute und künftige Tage.',
    incomplete:
      'Der Plan hat Slots, deren Gericht aus dem Pool entfernt wurde. Solange es sie gibt, würde ein Tausch den Tagesbereich mit unvollständigen Daten rechnen — plane die Woche neu.',
    noSlot: 'Der Slot des Tages wurde nicht gefunden — plane die Woche neu.',
    current: (name, calories, target, corridor) =>
      'Jetzt: „' +
      name +
      '“' +
      (calories ? ' — ' + calories : '') +
      '. Ziel ' +
      target +
      ' ± ' +
      corridor +
      ' kcal/Tag.',
    noCandidates: (type) =>
      'Im Pool gibt es keine anderen Gerichte der Art „' +
      MEAL_TYPE[type] +
      '“. Füge sie auf dem Bildschirm „Gerichte“ hinzu.',
    favorite: 'Lieblingsgericht',
    disliked: 'mag ich nicht',
    day: 'Tag → ',
    noneValid:
      'Kein Tausch hält die Woche gültig — jeder Kandidat verletzt den Bereich, die Wiederholungssperre oder den Mix der Pläne.',
    reason: {
      dayIncomplete: 'Tageskalorien unvollständig',
      outsideCorridor: 'außerhalb des Bereichs',
      repeatSoon: 'Wiederholung in der Nähe',
      breaksMix: 'bricht den Mix der Pläne',
    },
    failure: (failure) => {
      switch (failure.code) {
        case 'noDay':
          return 'Der Plan hat keinen Tag ' + failure.day + '.'
        case 'unknownSlot':
          return 'Unbekannte Slot-Art: „' + failure.slot + '“.'
        case 'noSlot':
          return (
            'Tag ' +
            failure.day +
            ' hat keinen Slot „' +
            MEAL_TYPE[failure.slot] +
            '“.'
          )
        case 'typeMismatch':
          return (
            'Das Gericht „' +
            failure.meal +
            '“ gehört zu „' +
            MEAL_TYPE[failure.mealType] +
            '“, der Slot aber zu „' +
            MEAL_TYPE[failure.slot] +
            '“.'
          )
      }
    },
  },
  shopping: {
    category: {
      veg: 'Gemüse und Kräuter',
      fruit: 'Obst und Beeren',
      meat: 'Fleisch und Fisch',
      dairy: 'Milchprodukte und Eier',
      grain: 'Getreide und Hülsenfrüchte',
      bread: 'Brot',
      pantry: 'Vorrat und Gewürze',
      sweet: 'Süßes',
      other: 'Sonstiges',
    },
    noQty: 'Ohne genaue Menge',
    bought: (bought, total) => bought + ' von ' + total + ' gekauft',
    fromWeek: 'Aus der aktuellen Woche',
    profileFirstHint:
      'Die Liste entsteht aus dem Plan des Profils. Lege eines auf dem Bildschirm „Heute“ an.',
    noPlan:
      'Noch kein Wochenplan. Plane ihn auf dem Bildschirm „Woche“ — die Liste entsteht aus den Zutaten der Gerichte, ohne Erfundenes.',
    plans: (n) => ' · Pläne: ' + n,
    missing: (n) =>
      slots(n) +
      ' ohne Gericht — es wurde aus dem Pool entfernt, seine Zutaten fehlen in der Liste.',
    share: 'Nicht Gekauftes teilen',
    copied: 'Die Liste ist kopiert — füge sie in einen Messenger ein.',
    noIngredients: 'Die Gerichte dieser Woche haben keine Zutaten.',
    noQtyHint:
      'Der Plan der Ernährungsberatung nennt hierfür keine Mengen — die App erfindet keine.',
    both: 'Beide Profile',
    all: 'Alle Profile',
    scopeHint:
      'Die Auswahl bleibt auf diesem Gerät. Die Markierungen „gekauft“ teilt die Familie — jedes Handy sieht sie.',
    progress: (bought, total) => bought + ' von ' + total + ' gekauft',
    boughtMark: ' — gekauft',
  },
  recipe: {
    readingMeals: 'Gerichte-Pool wird gelesen…',
    gone: 'Das Gericht ist nicht mehr im Pool — es wurde hier oder auf einem anderen Gerät gelöscht.',
    reading: 'Rezept wird gelesen…',
    edit: 'Rezept bearbeiten',
    add: 'Rezept hinzufügen',
    hint: 'Schritte, Zeit und ein Foto lassen sich hier hinzufügen und ändern — wörtlich aus dem Plan der Ernährungsberatung oder deine eigenen. Zutaten und Kalorien werden auf dem Bildschirm „Gerichte“ bearbeitet.',
    back: 'Zurück',
    toMeals: 'Zu den Gerichten',
    photoAlt: (name) => 'Foto: ' + name,
    imageFailed: 'Das Bild konnte nicht gelesen werden.',
    noCanvas:
      'Der Browser stellt kein Canvas bereit, um das Foto zu verkleinern.',
    calories: (portion) => 'Kalorien · ' + portion,
    prep: 'Zubereitung',
    servings: (n) => plural(n, 'Portion', 'Portionen'),
    stayAwake: 'Bildschirm anlassen',
    awakeRefused:
      'Der Browser lässt den Bildschirm nicht an — vielleicht wegen des Energiesparmodus.',
    cooking: 'Kochen',
    forServings: (n) => ' · für ' + n + ' ' + plural(n, 'Portion', 'Portionen'),
    tapStep: 'Tippe auf einen Schritt, um ihn abzuhaken.',
    steps: 'Zubereitungsschritte',
    stepsHint: 'Einer pro Zeile. Leer — kein Abschnitt.',
    stepsPlaceholder: 'Buchweizen 15 Min. kochen.\nFilet goldbraun anbraten.',
    prepTime: 'Zubereitungszeit, Min.',
    servingsField: 'Portionen',
    photo: 'Foto',
    photoChosen: ' · ausgewählt',
    photoOptional: ' · optional',
    removePhoto: 'Foto entfernen',
  },
  meals: {
    clearConfirm:
      'Alle Gerichte samt Rezepten aus dem Pool löschen? Gerichte, die in Plänen stehen, bleiben. Das Startset lässt sich später wieder hinzufügen.',
    cleared: (removed, kept) =>
      meals(removed) +
      ' gelöscht.' +
      (kept
        ? ' ' +
          meals(kept) +
          ' ' +
          plural(kept, 'ist', 'sind') +
          ' geblieben, weil ' +
          plural(kept, 'es', 'sie') +
          ' in Plänen ' +
          plural(kept, 'steht', 'stehen') +
          ': Tausche sie zuerst oder plane die Woche neu.'
        : ''),
    inPool: (n) => meals(n) + ' im Pool',
    emptyPool: 'Der Gerichte-Pool ist leer',
    all: 'Alle',
    favorites: 'Lieblingsgerichte',
    disliked: 'Mag ich nicht',
    gerdOnly: 'Nur Reflux',
    add: 'Gericht hinzufügen',
    importPdf: 'Aus dem PDF-Plan der Ernährungsberatung importieren',
    amongChosen: ' in der Auswahl.',
    noGerd: 'Keine Gerichte mit der Reflux-Markierung in der Auswahl.',
    none: 'Noch keine Gerichte. Füge das erste von Hand hinzu — aus dem Plan der Ernährungsberatung.',
    noFavorites: 'Keine Gerichte mit der Markierung „Lieblingsgericht“.',
    noDisliked: 'Keine Gerichte mit der Markierung „Mag ich nicht“.',
    noType: 'Keine Gerichte dieser Art.',
    edit: (name) => 'Gericht „' + name + '“ bearbeiten',
    clearAll: 'Alle Gerichte löschen',
    tasteHint:
      'Lieblingsgerichte kommen öfter in den Plan, ungeliebte bleiben draußen. Die Regeln der Ernährungsberatung (Art des Slots, Kalorienbereich, keine Wiederholungen und ein Mix der Pläne) gehen vor dem Geschmack und werden durch ihn nie gelockert.',
  },
  mealForm: {
    inPlans: (n) =>
      'Das Gericht steht in ' +
      n +
      ' ' +
      plural(n, 'Slot', 'Slots') +
      ' des Plans. Tausche es zuerst oder plane die Woche neu — sonst bleibt im Plan ein leerer Slot.',
    deleteConfirm: (name) => 'Gericht „' + name + '“ löschen?',
    edit: 'Gericht bearbeiten',
    create: 'Neues Gericht',
    name: 'Name',
    namePlaceholder: 'Buchweizen mit Hähnchen und Gemüse',
    type: 'Art des Slots',
    ingredients: 'Zutaten',
    ingredientsHint: 'Eine pro Zeile; die Menge steht nach „ — “.',
    ingredientsPlaceholder:
      'Buchweizen — 80 g\nHähnchenbrustfilet — 150 g\nGemüse nach Wahl',
    portions: 'Fertige Portion Ж/Ч',
    portionsHint:
      'Wörtlich aus dem Plan; die Komponente steht vor „ — “. Leer — kein Abschnitt.',
    portionsPlaceholder: 'Ж - 130 g; Ч - 200 g\nBeilage — Ж - 100 g; Ч - 150 g',
    source: 'Quelle (Plan der Ernährungsberatung)',
    sourceHint: 'Z. B. „Woche 2“ — danach mischt der Generator die Woche.',
    sourcePlaceholder: 'Woche 2',
    gerd: 'Reflux — ein Gericht aus einem Plan, der Reflux (GERD) berücksichtigt',
    issues: 'Fehler in der Quelle',
    issuesHint:
      'Einer pro Zeile, ohne den richtigen Wert. Sobald es geklärt und das Feld korrigiert ist, lösche die Zeile.',
    issuesPlaceholder: 'Tag 1 hat 70 g Reis, Tag 2 hat 100 g',
    portion: (letter) => 'Portion ' + letter,
    defaultPortion: ' · und Profile ohne Portion',
    calories: 'Kalorien, kcal',
    caloriesHint: (letter) =>
      'Leer — der Generator nutzt das Gericht nicht für Profile mit Portion ' +
      letter +
      ': Der Tagesbereich wird in Zahlen gerechnet.',
  },
  profiles: {
    lastOne: 'Das letzte Profil lässt sich nicht löschen.',
    deleteConfirm: (name) =>
      'Profil „' + name + '“ löschen? Seine Woche und sein Kalender gehen mit.',
    title: 'Profile',
    corridor: (target, corridor) => target + ' ± ' + corridor + ' kcal',
    portion: (letter) => ' · Portion ' + letter,
    shared: ' · gemeinsamer Plan',
    noSnack: ' · ohne Snack',
    poolSize: (n) => ' · Pool: ' + n,
    change: 'Ändern',
    add: 'Profil hinzufügen',
    edit: 'Profil bearbeiten',
    create: 'Neues Profil',
    name: 'Name',
    namePlaceholder: 'Mein Profil',
    target: 'Ziel, kcal/Tag',
    corridorField: 'Bereich, ±kcal',
    color: 'Farbe',
    colorOption: (color) => 'Farbe ' + color,
    portionField: 'Portion aus dem Plan der Ernährungsberatung',
    noPortion: '— nicht gesetzt',
    sharedWith: 'Gemeinsamer Plan mit Profil',
    ownPlan: '— eigener Plan',
    sharedHint:
      'Verknüpfte Profile essen dieselben Gerichte — sie haben einen Plan, den des Besitzers.',
    snack: 'Snack',
    snackDaily: 'täglich',
    snackNone: 'ohne Snack',
    pool: 'Gerichte-Pool',
    wholePool: 'Der ganze gemeinsame Pool',
    emptyPool:
      'Der Pool ist leer — füge auf dem Bildschirm „Gerichte“ welche hinzu.',
  },
  pdf: {
    known: 'Dieses Gericht ist schon im Pool — standardmäßig nicht importiert.',
    flag: {
      'dessert-split':
        'Name von der Portionsbeschreibung getrennt — bitte prüfen.',
      dup: 'Doppelter Name — dieses Gericht steht schon oben.',
      'no-kcal':
        'Im PDF stehen keine Kalorien — trag sie von Hand ein, um das Gericht in den Pool aufzunehmen.',
    },
    reading: (name) => '„' + name + '“ wird gelesen…',
    page: (page, total) =>
      'Text wird extrahiert: Seite ' + page + ' von ' + total + '…',
    noText: 'In der Datei wurde kein Text gefunden (vielleicht ein Scan).',
    readFailed: (detail) => 'Das PDF konnte nicht gelesen werden: ' + detail,
    recipeFailed: (detail) =>
      'Das Gericht wurde hinzugefügt, aber Schritte und Portionen wurden nicht gespeichert: ' +
      detail,
    added: (n) => 'Zum Pool hinzugefügt: ' + meals(n) + '. ',
    failed: (n) =>
      'Nicht hinzugefügt: ' + n + ' — siehe die Markierungen auf den Karten.',
    done: 'Fertig.',
    nothing: 'Nichts ausgewählt.',
    noSupabase: 'Der Supabase-Server ist nicht eingerichtet.',
    archiveFailed: (detail) =>
      'Die Gerichte wurden hinzugefügt, aber der Plantext wurde nicht im Importarchiv gespeichert — dafür braucht es ein Netz. ' +
      detail,
    hint: 'Wir erkennen nur, was wörtlich in der Datei steht: Namen, Art der Mahlzeit, Zutaten, Wochennummer, Kalorien, wo angegeben. Was im PDF fehlt, bleibt leer. Du prüfst und bestätigst alles, bevor es in den Pool kommt.',
    paste: 'Oder aus dem PDF kopierten Text einfügen',
    pastePlaceholder: 'День 1\nСніданок: …',
    recognize: 'Text erkennen',
    reviewTitle: 'Vor dem Hinzufügen prüfen',
    stats: (found, repeats, dups, weeks, dayCount) =>
      'Erkannte Gerichte: ' +
      found +
      (repeats ? ' · Wiederholungen zwischen Tagen: ' + repeats : '') +
      (dups ? ' · doppelte Namen: ' + dups : '') +
      (weeks ? ' · Wochen: ' + weeks : '') +
      (dayCount ? ' · Tage: ' + dayCount : '') +
      '. Wiederholungen („Той самий…“) kommen nicht in den Pool — das Gericht selbst steht schon oben. Zweifelhafte Stellen sind markiert; der Rohtext des Plans steht unter jeder Karte.',
    poolUnread: (issue) =>
      'Der Gerichte-Pool konnte nicht gelesen werden, daher ist nichts vorausgewählt — prüfe jede Karte selbst. ' +
      issue,
    none: 'Im Text wurden keine Gerichte erkannt. Prüfe, ob es ein Plan mit Zeilen wie «Сніданок: …», «Обід: …» ist.',
    archive: 'Plantext im Archiv speichern',
    adding: 'Wird hinzugefügt…',
    addChosen: (n) => 'Auswahl zum Pool hinzufügen (' + n + ')',
    another: 'Andere Datei',
    day: (n) => ' · Tag ' + n,
    repeat: ' — Wiederholung',
    inPool: ' · schon im Pool',
    name: 'Name',
    type: 'Art des Slots',
    calories: 'Kalorien, kcal',
    caloriesPlaceholder: 'nicht im PDF',
    servings: 'Portionen',
    source: 'Quelle (Plan der Ernährungsberatung)',
    ingredients: 'Zutaten (eine pro Zeile)',
    portions: 'Fertige Portion Ж/Ч (die Komponente steht vor „ — “)',
    steps: 'Schritte/Notizen aus dem Plan (einer pro Zeile)',
    raw: 'Rohtext aus dem Plan',
  },
}
