import type { MealType, PoolShortage } from '@meridian/core'
import type { Messages } from './uk.ts'

const RULES = new Intl.PluralRules('en-GB')

function plural(n: number, one: string, other: string): string {
  return RULES.select(n) === 'one' ? one : other
}

const MEAL_TYPE: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

const meal = (type: MealType) => MEAL_TYPE[type].toLowerCase()

const days = (n: number) => n + ' ' + plural(n, 'day', 'days')
const meals = (n: number) => n + ' ' + plural(n, 'meal', 'meals')
const slots = (n: number) => n + ' ' + plural(n, 'slot', 'slots')

const poolShortage = (
  shortage: ReadonlyArray<PoolShortage>,
  antiRepeatDays: number,
) =>
  'Not enough meals in the pool. The rule “at most once every ' +
  days(antiRepeatDays) +
  '” needs at least ' +
  meals(antiRepeatDays) +
  ' of each type, and now there are: ' +
  shortage
    .map(
      ({ type, have, need }) =>
        MEAL_TYPE[type] + ' — ' + have + ' (needed ≥ ' + need + ')',
    )
    .join('; ') +
  '. Add meals on the “Meals” screen or lower the no-repeat setting on the “Today” screen.'

export const en: Messages = {
  common: {
    close: 'Close',
    retry: 'Try again',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    minutes: (n) => n + ' min',
    todayTag: 'today',
    profileFirst: 'Profile first',
    mealRemoved: 'meal removed from the pool',
    openWeekScreen: 'Open the “Week” screen',
    shareFailed:
      'The browser gave neither a “Share” menu nor clipboard access.',
    macroFields: {
      protein: 'Protein, g',
      fat: 'Fat, g',
      carbs: 'Carbs, g',
    },
    mealType: MEAL_TYPE,
    kcalUnit: 'kcal',
    kcal: (value) => value + ' kcal',
    grams: (value) => value + ' g',
    days,
    at: (day, time) => day + ' at ' + time,
    queryProblem: (message) => 'Database query: ' + message,
  },
  titles: {
    today: 'Today',
    week: 'Week',
    calendar: 'Calendar',
    meals: 'Meals',
    recipe: 'Recipe',
    shopping: 'Shopping list',
    family: 'Family',
  },
  gate: {
    notConfigured: 'The app is not configured',
    noSupabase: 'No Supabase address',
    serverMissing:
      'The server did not get {url} and {key}. Where to find them: {readme}; for {dev}: {example}.',
    loading: 'One moment…',
    localDbPending: 'Preparing the local database…',
  },
  profileSwitcher: {
    manage: 'Manage profiles',
    summary: (name, target, corridor) =>
      name + ' · ' + target + ' ± ' + corridor + ' kcal/day',
  },
  antiRepeat: {
    title: 'No repeats',
    label: 'A meal at most once every',
    hint: 'The rule is shared by the whole family. It applies from the next week generation and meal swap; plans already made are not recalculated.',
    savedBroken: (value) =>
      'The family no-repeat setting was saved with an error: ' + value + '.',
  },
  search: {
    label: 'Search meals',
    placeholder: 'Name or ingredient',
    clear: 'Clear search',
    found: (n) => 'Found ' + meals(n),
    notFound: (query) =>
      'No meals with “' + query + '” in the name or ingredients',
  },
  dayTotal: {
    unknown: 'Calories for the day are unknown — the meals have no numbers.',
    total: (total) => 'Day total: ' + total,
    target: (target, corridor) =>
      ' · target ' + target + ' ± ' + corridor + ' kcal',
    incomplete: (n) => ' · incomplete: ' + slots(n) + ' without numbers',
    outside: ' · outside the range',
  },
  taste: {
    favorite: 'Favourite',
    disliked: 'Disliked',
  },
  today: {
    current: 'Current meal',
    noWindows: 'There are no meal times — the day clock is empty.',
    outsidePlan: 'Today is outside the saved plan — regenerate the week.',
    mealRemoved:
      'The meal of this slot was removed from the pool — regenerate the week.',
    nextOutsidePlan:
      'The next meal is already outside the plan — regenerate the week.',
    now: (type, until) => 'Now: ' + MEAL_TYPE[type] + ' (until ' + until + ')',
    next: (type, at, tomorrow) =>
      'Next: ' +
      MEAL_TYPE[type] +
      ' at ' +
      at +
      (tomorrow ? ' (tomorrow)' : ''),
    swap: 'Swap meal',
  },
  firstSteps: {
    title: 'First steps',
    done: ' — done',
    profile: 'Profile',
    profileDone: 'Created.',
    profileText:
      'Calorie target, range and portion from the dietitian’s plan — the generator builds the week around them.',
    createProfile: 'Create profile',
    mealsEmpty: 'Starter set, import from the dietitian’s PDF, or by hand.',
    mealsShort: (count, need, have) =>
      'The pool has ' +
      meals(count) +
      ', but that is not enough for a week: it needs at least ' +
      meals(need) +
      ' with calories of each type. Now: ' +
      have +
      '.',
    mealsCount: (count) => 'The pool has ' + meals(count) + '.',
    openMeals: 'Open “Meals”',
    weekText:
      'The generator builds a week from the pool, and the current meal shows up here.',
    openWeek: 'Open “Week”',
  },
  clock: {
    night: 'Night',
    nowMeal: (time, type) => 'It is ' + time + ' — ' + meal(type) + ' time.',
    nowNight: (time) => 'It is ' + time + ' — night time.',
    nextMeal: (type, at) => ' ' + MEAL_TYPE[type] + ' at ' + at + '.',
    until: (time) => 'until ' + time,
    nextShort: (type, at) => meal(type) + ' at ' + at,
  },
  mealHours: {
    title: 'Meal times',
    change: 'Change meal times',
    start: 'Start',
    end: 'End',
    hint: 'The times are shared by the whole family: every device sees them, and reminders follow them. The snack sits between lunch and dinner.',
    reset: 'Reset to defaults',
    timeRange: 'Time from 00:00 to 24:00 in 15-minute steps.',
    startBeforeEnd: 'The start must be before the end.',
    afterPrevious: (type, previous, end) =>
      MEAL_TYPE[type] +
      ' must start no earlier than the end of ' +
      meal(previous) +
      ' (' +
      end +
      ').',
    savedPartly: 'Meal times were saved incompletely.',
    savedBroken: (problem) => 'Meal times: ' + problem,
  },
  reminders: {
    title: 'Reminders',
    enable: 'Remind me before meals',
    lead: 'Lead time',
    today: 'Today: ',
    hint: 'Reminders are sent by the page itself, so they arrive while the app is open: the app has no push server. On iPhone, notifications only work in the installed app (“Add to Home Screen”).',
    test: 'Send a test notification',
    permission: {
      denied:
        'Notifications are blocked for this site — allow them in the browser settings.',
      default: 'Notification permission was not granted.',
      unsupported: 'This browser does not support notifications.',
    },
    notificationTitle: (type, lead, at) =>
      MEAL_TYPE[type] +
      (lead ? ' in ' + lead + ' min' : ' starts') +
      ' · at ' +
      at,
    noPlan: 'There is no plan for this meal — generate the week.',
  },
  auth: {
    tagline: 'Meal planner for the family',
    signIn: 'Sign in',
    signUp: 'Sign up',
    signInHint: 'Meals, menu and shopping list are shared by the whole family.',
    signUpHint:
      'After signing up you create a family or join an existing one with a code.',
    email: 'Email',
    password: 'Password',
    passwordHint: 'At least 6 characters.',
    submitSignIn: 'Sign in',
    submitSignUp: 'Sign up',
    confirmSent: (address) =>
      'Account created. A confirmation email was sent to ' +
      address +
      ' — open it and come back here to sign in.',
    noAccount: 'No account yet? ',
    haveAccount: 'Already have an account? ',
    signOut: 'Sign out',
  },
  familySetup: {
    signedInAs: (email) => 'Signed in as ' + (email ?? 'an unknown account'),
    create: 'Create a family',
    createHint:
      'The menu, meal pool and shopping list will be shared with everyone you invite.',
    name: 'Family name',
    creating: 'Creating…',
    submitCreate: 'Create',
    join: 'Join with a code',
    joinHint:
      'Someone already in the family gives the code from their family screen. Dashes, spaces and case do not matter.',
    code: 'Invite code',
    joining: 'Joining…',
    submitJoin: 'Join',
  },
  family: {
    subtitle: 'Meals, the weekly plan and the shopping list are shared',
    members: 'In the family',
    noEmail: 'account without email',
    you: 'you',
    invite: 'Invite',
    inviteHint: (until) =>
      'Single use, valid until ' +
      until +
      '. Read it out to the person you invite — they enter the code after signing up.',
    noInvite:
      'No active code. Create one and pass it to another family member.',
    preparing: 'Preparing the code…',
    newCode: 'New code',
    createCode: 'Create code',
    language: 'Language',
    languageLabel: 'Interface language',
    languageHint:
      'The choice is stored on this device. Meal names, recipes and dietitian plans are not translated.',
  },
  starter: {
    broken: 'The starter set on the server is invalid — no meals were added.',
    failed: 'Could not add the starter set.',
    add: 'Add the starter set',
    missing: (n) =>
      'Meals from the dietitian’s plans that are not in the pool: ' +
      n +
      '. Existing meals stay as they are.',
    offer:
      'Meals from the dietitian’s plans that the administrator put on the server.',
    added: (n) => 'Added ' + meals(n) + '.',
    allThere: 'All meals of the set are already in the pool.',
  },
  details: {
    gerd: 'GERD',
    sourceIssue: 'The source has a discrepancy',
    sourceError: 'Error in the source.',
    sourceErrorText:
      ' The dietitian’s plan is inconsistent here; the values are entered as they are:',
    protein: 'Protein',
    fat: 'Fat',
    carbs: 'Carbs',
    noMacros: 'No protein, fat or carbs given.',
    ingredients: 'Ingredients',
    noIngredients: 'No ingredients given.',
    portion: 'Ready portion',
  },
  forms: {
    notNumber: (label) =>
      'The “' + label + '” field must be a number or empty.',
    negative: (label) => 'The “' + label + '” field must not be negative.',
    nutrition: {
      calories: 'Calories',
      protein: 'Protein',
      fat: 'Fat',
      carbs: 'Carbs',
    },
    portionField: (label, letter) => label + ' · portion ' + letter,
    nameRequired: 'The meal name is required.',
    typeRequired: 'Choose the slot type.',
    profileNameRequired: 'The profile name is required.',
    targetPositive: 'The daily calorie target must be a positive number.',
    corridorNonNegative: 'The calorie range must be a non-negative number.',
    sharedSelf: 'A profile cannot share a plan with itself.',
    sharedMissing: 'The profile for the shared plan was not found.',
    sharedFollower: (owner) =>
      'Profile “' +
      owner +
      '” itself uses a shared plan — choose the owner profile.',
    sharedOwner: (name, dependants) =>
      'Profile “' +
      name +
      '” already owns a shared plan for: ' +
      dependants +
      '. Unlink them first.',
    goalProtein: 'Goal: protein',
    goalFat: 'Goal: fat',
    goalCarbs: 'Goal: carbs',
    prepTime: 'Cooking time',
    servingsNumber: '“Servings” must be a number or empty.',
    servingsPositive: '“Servings” must be a positive number.',
    caloriesMissing:
      'Enter the calories — the PDF has none, and without them the meal does not get into the pool.',
    caloriesNumber:
      'Calories must be a number — remove everything but digits from the field.',
    caloriesNonNegative: 'Calories must be a non-negative number.',
    servingsWhole: 'Servings: a whole number from 1, or empty.',
  },
  sync: {
    title: 'Sync',
    notConfigured:
      'Not configured: the server did not get {url}. The app works, but the data stays on this device. Where to find the address: {readme}.',
    error: 'Error',
    online: 'Online',
    connecting: 'Connecting…',
    offline: 'Offline — changes are saved on the device',
    state: 'State',
    lastSynced: 'Last update',
    never: 'not yet',
    stored: 'Records on the device',
    pending: 'Waiting to upload',
    rejected: (n) =>
      'The server did not accept ' +
      n +
      ' ' +
      plural(n, 'change', 'changes') +
      ' from this device. They were dropped: they did not reach the server or other devices — repeat the action if you still need it.',
    understood: 'Got it',
    retrying:
      'The app keeps retrying by itself; once the server answers, the error goes away.',
    hint: 'The app reads and writes the local database, so it works without a network. Changes go to the server as soon as the network is back.',
  },
  importV1: {
    title: 'Move data from V1',
    meals,
    recipes: (n) => n + ' ' + plural(n, 'recipe', 'recipes'),
    profiles: (n) => n + ' ' + plural(n, 'profile', 'profiles'),
    prefs: (n) => n + ' ' + plural(n, 'taste mark', 'taste marks'),
    nothing: 'nothing',
    readFailed: 'Could not read the export file.',
    writeFailed: 'Could not write the data to the device.',
    unavailable:
      'Unavailable: data moves into the local database, and it did not open on this device. The reason is in the “Sync” section.',
    done: (summary) => 'Moved: ' + summary + '.',
    another: 'Move another file',
    preview: 'File {file} — will bring: {summary}.',
    skipped: (n) => 'Not moved (' + n + ')',
    applying: 'Moving…',
    apply: 'Move',
    hint: 'V1 data lives in the browser storage, so only the browser itself can get it out. Open V1 at the same address you use it on, run the contents of {script} in the console, and pick the saved file here. Importing the same file again duplicates nothing.',
  },
  errors: {
    auth: {
      invalid_credentials: 'Wrong email or password.',
      email_not_confirmed: 'The email is not confirmed yet — check your inbox.',
      user_already_exists: 'This account already exists. Try signing in.',
      weak_password: 'The password is too short. At least 6 characters.',
      validation_failed: 'Check the email and password.',
      over_request_rate_limit: 'Too many attempts. Try again in a minute.',
      over_email_send_rate_limit: 'Too many emails. Try again later.',
      signup_disabled: 'Sign-up is disabled on this server.',
    },
    rpc: {
      not_authenticated: 'The session is lost. Sign in again.',
      family_name_required: 'Enter the family name.',
      already_in_family: 'You are already in a family.',
      no_family: 'Create a family or join an existing one first.',
      invite_not_found: 'No such code. Check that no character got lost.',
      invite_already_used: 'This code was already used. Ask for a new one.',
      invite_expired: 'The code has expired. Ask for a new one.',
    },
    generic: 'Could not complete the action.',
    insecure:
      'The browser does not give the app a local database: the page is open without HTTPS. Open it at an https:// address — or via localhost on the server itself.',
    localDb: 'Could not open the local database on this device.',
    syncOffline:
      'Could not connect to the sync server: no network. The data on the device is safe.',
    syncUnauthorized:
      'The sync server did not accept the sign-in. Try signing out and in again.',
    syncUpload:
      'The server does not accept changes from this device. They stay in the queue and go out once the server accepts them.',
    syncDownload:
      'Could not get data from the sync server. Changes from this device are saved on it.',
    rejectedTable: {
      profile: 'Profile',
      meal: 'Meal',
      recipe: 'Recipe',
      meal_pref: 'Taste mark',
      week_plan: 'Week plan',
      plan_slot: 'Meal in the plan',
      shopping_check: 'Shopping list mark',
      family_settings: 'Family settings',
    },
    rejectedOp: {
      PUT: 'the creation',
      PATCH: 'the change',
      DELETE: 'the deletion',
    },
    rejectedReason: {
      duplicate:
        'this record already exists (probably created on another device)',
      missingParent: 'the linked record no longer exists',
      missingField: 'a required field is missing',
      outOfRange: 'the value is out of range',
      forbidden: 'no access — maybe the device is no longer in this family',
      invalid: 'invalid value',
      other: 'the server rejected the data',
    },
    rejected: (what, op, reason) =>
      what + ': the server did not accept ' + op + ' — ' + reason + '.',
  },
  week: {
    sharedNote: (owner) =>
      'This profile uses the shared plan of profile “' +
      owner +
      '”. Only the owner can regenerate it.',
    target: (target, corridor) =>
      'Target ' + target + ' ± ' + corridor + ' kcal/day',
    sevenDays: 'A plan for 7 days',
    profileFirstHint:
      'The generator takes the calorie target and range from the profile. Create one on the “Today” screen.',
    generating: 'Building the week…',
    regenerate: 'Regenerate the week',
    generate: 'Generate the week',
    menuTitle: 'Menu',
    shareMenu: 'Share the menu',
    menuCopied: 'The menu is copied — paste it into a messenger.',
    addMeals: 'Add meals',
    noPlan:
      'No plan yet. Press the button — the generator builds a week from the meal pool by the dietitian’s rules: slot type, calorie range, no repeats and a mix of plans.',
    swapHint:
      'To swap a single meal, press the swap button on the right of its row. The dialog offers meals of the same type with a forecast of the day’s calories.',
    confirmTitle: 'Regenerate the week?',
    confirmText: (n) =>
      'The plan has ' +
      n +
      ' ' +
      plural(n, 'manual swap', 'manual swaps') +
      ' for today and the following days. The generator builds the week anew, and manual swaps are not kept.',
    confirm: 'Regenerate',
    summary: (count, total, average, target, corridor) =>
      'Total for ' +
      days(count) +
      ': ' +
      total +
      ' · on average ' +
      average +
      '/day. Target ' +
      target +
      ' ± ' +
      corridor +
      ' kcal.',
    sources: (list) => ' Sources: ' + list + '.',
    viewerPortion: (viewer, owner) =>
      'Calories are shown for portion ' +
      viewer +
      ', while the range is held by the plan owner with portion ' +
      owner +
      '.',
    incomplete: (n) =>
      'On ' +
      days(n) +
      ' the calories are not known for every slot — those days are left out of the total.',
    generated: (at) => 'Generated ' + at + '.',
    missing: (n) =>
      slots(n) +
      ' ' +
      plural(n, 'points', 'point') +
      ' to meals no longer in the pool — regenerate the week.',
    stale:
      'The profile changed after generation (target or range) — regenerate the week.',
    snackOn:
      'The snack was turned on in the profile after generation, and the plan has none — regenerate the week.',
    snackOff:
      'The snack was turned off in the profile after generation, and the plan still has it — regenerate the week.',
    outsidePlan: 'Today is outside this plan — regenerate the week.',
    unknownCalories: 'calories unknown',
    incompleteShort: ' · incomplete',
    outside: ' · outside the range',
    swap: (type) => 'Swap meal: ' + MEAL_TYPE[type],
    poolShortage,
    failure: (failure) => {
      switch (failure.code) {
        case 'invalidTarget':
          return 'The daily calorie target must be a positive number.'
        case 'poolShortage':
          return poolShortage(failure.shortage, failure.antiRepeatDays)
        case 'noFit':
          return (
            'Could not build a week for ' +
            failure.target +
            ' kcal/day even with a ±' +
            failure.corridor +
            ' kcal range. Change the target or add meals to the pool.'
          )
        case 'emptyPool':
          return 'The meal pool is empty — add meals on the “Meals” screen.'
      }
    },
    warning: (warning) => {
      switch (warning.code) {
        case 'caloriesUnknown':
          return (
            'Meals without calories for portion ' +
            warning.portion +
            ': ' +
            warning.count +
            '. They were left out of the selection — the day’s range counts only known figures.'
          )
        case 'corridorWidened':
          return (
            'Could not stay within ±' +
            warning.corridor +
            ' kcal — the range was widened to ±' +
            warning.used +
            ' kcal.'
          )
        case 'mixBlockedByDislikes':
          return '“Disliked” marks narrowed the pool — a mix of plans became impossible.'
        case 'mixImpossible':
          return 'The pool does not allow a mix of plans — one plan covers every meal.'
        case 'mixFailed':
          return 'Could not combine different plans — the week is built from meals of one source.'
        case 'mixFailedCorridorWidened':
          return 'The range was widened to ±' + warning.used + ' kcal.'
        case 'dislikedKept':
          return 'The week cannot be built without meals marked “disliked” — they stayed in the plan. Remove the mark or add meals to the pool.'
      }
    },
  },
  calendar: {
    weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    planned: (n) => days(n) + ' planned',
    history: 'History and plans',
    profileFirstHint:
      'The calendar shows the profile’s plan. Create one on the “Today” screen.',
    previous: 'Previous week',
    next: 'Next week',
    empty:
      'The history is empty — no week has been generated yet. Generate the first one on the “Week” screen, and its days will show up here.',
    shared: (owner) =>
      'This is the calendar of the shared plan of profile “' + owner + '”.',
    noPlanLabel: ', no plan',
    noPlan: 'There is no plan for this day.',
    noPlanFuture:
      ' A new week is generated on the “Week” screen and starts with today.',
    past: 'A past day — fixed history, view only.',
  },
  swap: {
    noDay: 'The plan has no such day — regenerate the week.',
    pastTitle: 'Past day',
    past: 'This day is already over — history does not change. Swaps are only available for today and future days.',
    incomplete:
      'The plan has slots whose meal was removed from the pool. Until they are gone, a swap would count the day’s range on incomplete data — regenerate the week.',
    noSlot: 'The day slot was not found — regenerate the week.',
    current: (name, calories, target, corridor) =>
      'Now: “' +
      name +
      '”' +
      (calories ? ' — ' + calories : '') +
      '. Target ' +
      target +
      ' ± ' +
      corridor +
      ' kcal/day.',
    noCandidates: (type) =>
      'There are no other ' +
      meal(type) +
      ' meals in the pool. Add them on the “Meals” screen.',
    favorite: 'favourite',
    disliked: 'disliked',
    day: 'day → ',
    noneValid:
      'No swap keeps the week valid — every candidate breaks the range, the no-repeat rule or the mix of plans.',
    reason: {
      dayIncomplete: 'day calories incomplete',
      outsideCorridor: 'outside the range',
      repeatSoon: 'repeats nearby',
      breaksMix: 'breaks the mix of plans',
    },
    failure: (failure) => {
      switch (failure.code) {
        case 'noDay':
          return 'The plan has no day ' + failure.day + '.'
        case 'unknownSlot':
          return 'Unknown slot type: “' + failure.slot + '”.'
        case 'noSlot':
          return (
            'Day ' +
            failure.day +
            ' has no “' +
            MEAL_TYPE[failure.slot] +
            '” slot.'
          )
        case 'typeMismatch':
          return (
            'The meal “' +
            failure.meal +
            '” is a ' +
            meal(failure.mealType) +
            ', and the slot is “' +
            MEAL_TYPE[failure.slot] +
            '”.'
          )
      }
    },
  },
  shopping: {
    category: {
      veg: 'Vegetables and herbs',
      fruit: 'Fruit and berries',
      meat: 'Meat and fish',
      dairy: 'Dairy and eggs',
      grain: 'Grains and legumes',
      bread: 'Bread',
      pantry: 'Pantry and spices',
      sweet: 'Sweets',
      other: 'Other',
    },
    noQty: 'No exact quantity',
    bought: (bought, total) => bought + ' of ' + total + ' bought',
    fromWeek: 'From the current week',
    profileFirstHint:
      'The list is built from the profile’s plan. Create one on the “Today” screen.',
    noPlan:
      'There is no week plan yet. Generate it on the “Week” screen — the list is built from the meals’ ingredients, with nothing made up.',
    plans: (n) => ' · plans: ' + n,
    missing: (n) =>
      slots(n) +
      ' without a meal — it was removed from the pool, so its ingredients are not in the list.',
    share: 'Share what is not bought',
    copied: 'The list is copied — paste it into a messenger.',
    noIngredients: 'The meals of this week have no ingredients.',
    noQtyHint:
      'The dietitian’s plan has no quantities for these — the app does not make them up.',
    both: 'Both profiles',
    all: 'All profiles',
    scopeHint:
      'The scope stays on this device. “Bought” marks are shared by the family — every phone sees them.',
    progress: (bought, total) => 'Bought ' + bought + ' of ' + total,
    boughtMark: ' — bought',
  },
  recipe: {
    readingMeals: 'Reading the meal pool…',
    gone: 'The meal is no longer in the pool — it was deleted here or on another device.',
    reading: 'Reading the recipe…',
    edit: 'Edit recipe',
    add: 'Add recipe',
    hint: 'Steps, time and a photo can be added and changed here — word for word from the dietitian’s plan or your own. Ingredients and calories are edited on the “Meals” screen.',
    back: 'Back',
    toMeals: 'To meals',
    photoAlt: (name) => 'Photo: ' + name,
    imageFailed: 'Could not read the image.',
    noCanvas: 'The browser gave no canvas to shrink the photo.',
    calories: (portion) => 'calories · ' + portion,
    prep: 'to cook',
    servings: (n) => plural(n, 'serving', 'servings'),
    stayAwake: 'Keep the screen on',
    awakeRefused:
      'The browser would not keep the screen on — perhaps because of power saving.',
    cooking: 'Cooking',
    forServings: (n) => ' · for ' + n + ' ' + plural(n, 'serving', 'servings'),
    tapStep: 'Tap a step to mark it done.',
    steps: 'Cooking steps',
    stepsHint: 'One per line. Empty — no section.',
    stepsPlaceholder:
      'Boil the buckwheat for 15 min.\nFry the fillet until golden.',
    prepTime: 'Cooking time, min',
    servingsField: 'Servings',
    photo: 'Photo',
    photoChosen: ' · chosen',
    photoOptional: ' · optional',
    removePhoto: 'Remove photo',
  },
  meals: {
    clearConfirm:
      'Delete all meals from the pool together with their recipes? Meals that are in plans stay. The starter set can be added again later.',
    cleared: (removed, kept) =>
      'Deleted ' +
      meals(removed) +
      '.' +
      (kept
        ? ' ' +
          kept +
          ' ' +
          plural(kept, 'is', 'are') +
          ' kept because ' +
          plural(kept, 'it is', 'they are') +
          ' in plans: swap them or regenerate the week first.'
        : ''),
    inPool: (n) => meals(n) + ' in the pool',
    emptyPool: 'The meal pool is empty',
    all: 'All',
    favorites: 'Favourites',
    disliked: 'Disliked',
    gerdOnly: 'GERD only',
    add: 'Add meal',
    importPdf: 'Import from the dietitian’s PDF plan',
    amongChosen: ' among the selected.',
    noGerd: 'No meals with the GERD mark among the selected.',
    none: 'No meals yet. Add the first one by hand — from the dietitian’s plan.',
    noFavorites: 'No meals marked “favourite”.',
    noDisliked: 'No meals marked “disliked”.',
    noType: 'No meals of this type.',
    edit: (name) => 'Edit meal “' + name + '”',
    clearAll: 'Clear all meals',
    tasteHint:
      'Favourite meals get into the plan more often, disliked ones are left out. The dietitian’s rules (slot type, calorie range, no repeats and a mix of plans) come before taste and are never loosened by it.',
  },
  mealForm: {
    inPlans: (n) =>
      'The meal is in ' +
      slots(n) +
      ' of the plan. Swap it or regenerate the week first — otherwise the plan is left with an empty slot.',
    deleteConfirm: (name) => 'Delete meal “' + name + '”?',
    edit: 'Edit meal',
    create: 'New meal',
    name: 'Name',
    namePlaceholder: 'Buckwheat with chicken and vegetables',
    type: 'Slot type',
    ingredients: 'Ingredients',
    ingredientsHint: 'One per line; the quantity goes after “ — ”.',
    ingredientsPlaceholder:
      'buckwheat — 80 g\nchicken fillet — 150 g\nvegetables of choice',
    portions: 'Ready portion Ж/Ч',
    portionsHint:
      'Word for word from the plan; the component goes before “ — ”. Empty — no section.',
    portionsPlaceholder: 'Ж - 130 g; Ч - 200 g\nSide — Ж - 100 g; Ч - 150 g',
    source: 'Source (dietitian’s plan)',
    sourceHint: 'E.g. “Week 2” — the generator mixes the week by it.',
    sourcePlaceholder: 'Week 2',
    gerd: 'GERD — a meal from a plan that accounts for GERD',
    issues: 'Errors in the source',
    issuesHint:
      'One per line, without the correct value. Once it is cleared up and the field is fixed, delete the line.',
    issuesPlaceholder: 'Day 1 has 70 g of rice, day 2 has 100 g',
    portion: (letter) => 'Portion ' + letter,
    defaultPortion: ' · and profiles without a portion',
    calories: 'Calories, kcal',
    caloriesHint: (letter) =>
      'Empty — the generator will not use the meal for portion ' +
      letter +
      ' profiles: the day’s range is counted in numbers.',
  },
  profiles: {
    lastOne: 'The last profile cannot be deleted.',
    deleteConfirm: (name) =>
      'Delete profile “' + name + '”? Its week and calendar go too.',
    title: 'Profiles',
    corridor: (target, corridor) => target + ' ± ' + corridor + ' kcal',
    portion: (letter) => ' · portion ' + letter,
    shared: ' · shared plan',
    noSnack: ' · no snack',
    poolSize: (n) => ' · pool: ' + n,
    change: 'Edit',
    add: 'Add profile',
    edit: 'Edit profile',
    create: 'New profile',
    name: 'Name',
    namePlaceholder: 'My profile',
    target: 'Target, kcal/day',
    corridorField: 'Range, ±kcal',
    color: 'Colour',
    colorOption: (color) => 'Colour ' + color,
    portionField: 'Portion from the dietitian’s plan',
    noPortion: '— not set',
    sharedWith: 'Shared plan with profile',
    ownPlan: '— own plan',
    sharedHint:
      'Linked profiles eat the same meals — they have one plan, the owner’s.',
    snack: 'Snack',
    snackDaily: 'daily',
    snackNone: 'no snack',
    pool: 'Meal pool',
    wholePool: 'The whole shared pool',
    emptyPool: 'The pool is empty — add meals on the “Meals” screen.',
  },
  pdf: {
    known: 'This meal is already in the pool — not imported by default.',
    flag: {
      'dessert-split':
        'Name split off from the portion description — check it.',
      dup: 'Duplicate name — this meal is already above.',
      'no-kcal':
        'No calories in the PDF — enter them by hand to add the meal to the pool.',
    },
    reading: (name) => 'Reading “' + name + '”…',
    page: (page, total) =>
      'Extracting text: page ' + page + ' of ' + total + '…',
    noText: 'No text found in the file (maybe it is a scan).',
    readFailed: (detail) => 'Could not read the PDF: ' + detail,
    recipeFailed: (detail) =>
      'The meal was added, but the steps and servings were not saved: ' +
      detail,
    added: (n) => 'Added to the pool: ' + meals(n) + '. ',
    failed: (n) => 'Not added: ' + n + ' — see the marks on the cards.',
    done: 'Done.',
    nothing: 'Nothing selected.',
    noSupabase: 'The Supabase server is not configured.',
    archiveFailed: (detail) =>
      'The meals were added, but the plan text was not saved to the import archive — that needs a network. ' +
      detail,
    hint: 'We recognise only what is literally in the file: names, meal type, ingredients, week number, calories where given. Whatever the PDF lacks stays empty. You check and confirm everything before it goes into the pool.',
    paste: 'Or paste text copied from the PDF',
    pastePlaceholder: 'День 1\nСніданок: …',
    recognize: 'Recognise text',
    reviewTitle: 'Check before adding',
    stats: (found, repeats, dups, weeks, dayCount) =>
      'Meals recognised: ' +
      found +
      (repeats ? ' · repeats between days: ' + repeats : '') +
      (dups ? ' · duplicate names: ' + dups : '') +
      (weeks ? ' · weeks: ' + weeks : '') +
      (dayCount ? ' · days: ' + dayCount : '') +
      '. Repeats (“Той самий…”) are not added to the pool — the meal itself is already above. Doubtful places are marked; the raw plan text is under every card.',
    poolUnread: (issue) =>
      'Could not read the meal pool, so nothing is preselected — check every card yourself. ' +
      issue,
    none: 'No meals recognised in the text. Check that it is a plan with lines like «Сніданок: …», «Обід: …».',
    archive: 'Save the plan text to the archive',
    adding: 'Adding…',
    addChosen: (n) => 'Add selected to the pool (' + n + ')',
    another: 'Another file',
    day: (n) => ' · Day ' + n,
    repeat: ' — repeat',
    inPool: ' · already in the pool',
    name: 'Name',
    type: 'Slot type',
    calories: 'Calories, kcal',
    caloriesPlaceholder: 'not in the PDF',
    servings: 'Servings',
    source: 'Source (dietitian’s plan)',
    ingredients: 'Ingredients (one per line)',
    portions: 'Ready portion Ж/Ч (the component goes before “ — ”)',
    steps: 'Steps/notes from the plan (one per line)',
    raw: 'Raw text from the plan',
  },
}
