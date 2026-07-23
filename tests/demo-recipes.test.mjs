import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const projectRoot = new URL("../", import.meta.url);
const dataFileUrl = new URL("data/demo-recipes.js", projectRoot);
const indexFileUrl = new URL("index.html", projectRoot);
const serviceWorkerFileUrl = new URL("sw.js", projectRoot);

async function loadDemoData() {
  const source = await readFile(dataFileUrl, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: dataFileUrl.pathname });
  return sandbox.window.MeridianDemoData;
}

function assertPersonCalories(calories, context) {
  assert.deepEqual(
    Array.from(Object.keys(calories)).sort(),
    ["Ж", "Ч"],
    `${context} must preserve separate Ж/Ч calories`,
  );
  for (const person of ["Ж", "Ч"]) {
    assert.equal(typeof calories[person].value, "number");
    assert.equal(calories[person].approximate, true);
    assert.match(calories[person].text, /^~\d+ ккал/);
  }
}

function compatibilitySeedHash(meals) {
  const normalized = meals.map((meal) =>
    Object.fromEntries(
      Object.entries(meal).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
  const serialized = JSON.stringify(normalized);
  let hash = 5381;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = ((hash * 33) ^ serialized.charCodeAt(index)) >>> 0;
  }
  return `${hash.toString(36)}.${serialized.length}`;
}

test("standalone demo data preserves the complete PDF document contract", async () => {
  const data = await loadDemoData();

  assert.ok(data);
  assert.equal(Object.isFrozen(data), true);
  assert.equal(Object.isFrozen(data.demoMeals), true);
  assert.equal(data.document.title, "МЕНЮ НА 14 ДНІВ");
  assert.equal(data.document.subtitle, "Для двох");
  assert.equal(data.document.pageCount, 29);
  assert.equal(data.document.pdfTitle, "Меню на 14 днів — фінал з точним калоражем");
  assert.equal(data.document.sourceFile, "Menu_14_dniv на двох.pdf");
  assert.equal(data.document.fileSizeBytes, 524496);
  assert.equal(data.document.author, "Dietician");
  assert.equal(data.document.pdfVersion, "1.7");
  assert.equal(data.document.extractedTextCharacters, 46474);
  assert.equal(
    data.document.sha256,
    "6eede3a6782fcbab8a470a44e7c4e7d7814315d2ac125ce4f79fd9a603cf856c",
  );
  assert.deepEqual(Array.from(Object.keys(data.document.people)).sort(), ["Ж", "Ч"]);
  assert.ok(data.document.knownInconsistencies.length >= 2);
  assert.ok(
    data.document.knownInconsistencies.some((item) =>
      item.sourcePages.includes(2) && item.sourcePages.includes(4)),
  );
  assert.ok(
    data.document.knownInconsistencies.some((item) =>
      item.sourcePages.includes(18) && item.text.includes("220")),
  );

  assert.equal(data.mealReplacements.length, 3);
  assert.deepEqual(
    Array.from(data.mealReplacements, (replacement) => replacement.name),
    ["Базовий коктейль", "Білковий коктейль", "Йогуртовий смузі"],
  );
  assert.equal(data.mealReplacements[0].protein.min, 22);
  assert.equal(data.mealReplacements[0].protein.max, 25);
  assert.equal(data.mealReplacements[1].calories.value, 200);
  assert.equal(data.mealReplacements[2].people, null);
  assert.equal(data.days.length, 14);
  assert.deepEqual(
    Array.from(data.days, (day) => day.day),
    Array.from({ length: 14 }, (_, index) => index + 1),
  );
  assert.equal(data.recipeMethods.length, 43);
  assert.equal(data.generalRecommendations.length, 4);
  assert.equal(data.demoMeals.length, 33);
  assert.equal(data.compatibilitySeed.sourceReference, "Menu_2_tyzhni");
  assert.equal(data.compatibilitySeed.sourceDocumentIncluded, false);
  assert.equal(data.compatibilitySeed.relationToDocument, "separate-source");
  assert.equal(data.compatibilitySeed.purpose, "legacy-four-slot-generator-seed");
  assert.deepEqual(
    Array.from(data.compatibilitySeed.slotTypes),
    ["breakfast", "lunch", "dinner", "snack"],
  );
  assert.equal(data.compatibilitySeed.caloriePolicy.profileBasis, "Ч");
  assert.equal(
    data.compatibilitySeed.caloriePolicy.approximateBasis,
    "general-nutrition-tables",
  );
  assert.deepEqual(
    Array.from(data.compatibilitySeed.caloriePolicy.exactSourceMealIds),
    ["demo-wb-s2"],
  );
  assert.equal(data.compatibilitySeed.caloriePolicy.approximateMealIds.length, 32);
  assert.equal(data.sourcePages.length, 29);
  assert.deepEqual(
    Array.from(data.sourcePages, ({ page }) => page),
    Array.from({ length: 29 }, (_, index) => index + 1),
  );
  assert.ok(data.sourcePages.every(({ text }) => text.length > 0));
  assert.match(data.sourcePages[0].text, /Базовий коктейль/);
  assert.match(data.sourcePages.at(-1).text, /Пийте воду між прийомами їжі/);
  const menuText = data.sourcePages
    .slice(1, 22)
    .map(({ text }) => text)
    .join("\n");
  assert.equal(menuText.split("На 2-х").length - 1, 75);
  assert.equal(menuText.split("Готова порція:").length - 1, 76);
  assert.deepEqual(
    JSON.parse(JSON.stringify(data.document.inventory)),
    {
      weeks: 2,
      days: 14,
      scheduledMealSlots: 42,
      distinctCompositeMeals: 28,
      preparationBlocks: 75,
      ingredientItems: 440,
      portionBlocks: 76,
      substitutions: 14,
      yields: 21,
      repeatedDailyPortionBlocks: 14,
      inlinePreparationNotes: 36,
      recipeMethods: 43,
      recipeMethodSteps: 184,
      mealReplacements: 3,
      recurringExtraTypes: 3,
      recurringExtraOccurrences: 10,
      generalRecommendations: 4,
    },
  );

  assert.deepEqual(
    Array.from(data.recipeMethods, (recipe) => recipe.name),
    [
      "Запечена вівсянка з чорницею і горіхами",
      "Чіа-пудинг з ягодами і вершками",
      "Бельгійські сирні білкові вафлі",
      "Омлет із шпинатом, фетою і чері",
      "Чіа-пудинг шоколадний з бананом і мигдалем",
      "Бананові панкейки з ягодами",
      "Форшмак з оселедця з яблуком",
      "Тост з тунцем, авокадо і яйцем",
      "Ліниві хачапурі",
      "Йогурт-боул з домашньою гранолою",
      "Сирно-чіа запіканка з чорницею",
      "Шакшука з солодким перцем",
      "Запечена банан-вівсянка з арахісовою пастою",
      "Сирно-вівсяні млинці з фруктовим соусом",
      "Шпинатний крем-суп з гарбузовим насінням",
      "Куряча грудка маринована (сметана + гірчиця + соєвий соус)",
      "Лосось теріякі домашній",
      "Спаржа з кунжутом",
      "Яловичина тушкована з печерицями",
      "Перлова каша",
      "Креветки в часнику з кропом",
      "Ячна каша з петрушкою",
      "Брюссельська капуста запечена з пармезаном",
      "Грибний крем-суп",
      "Куряче стегно без шкіри запечене",
      "Кіноа з петрушкою",
      "Запіканка з броколі і сиром",
      "Паста з тунцем, нутом і фетою",
      "Запечені яловичі фрикадельки",
      "Пюре з цвітної капусти і броколі",
      "Салат з буряка з фетою",
      "Курячі котлети на грилі",
      "Кабачкові оладки запечені",
      "Кальмари вок з овочами",
      "Куряче стегно у медово-гірчичному маринаді",
      "Гречка відварна",
      "Батат запечений",
      "Овочевий салат з помідором, огірком і капустою",
      "Паста з мідіями",
      "Куряча печінка з карамелізованою цибулею",
      "Курка маринована в гранатовому соці",
      "Картопля запечена з травами",
      "Запечена цвітна капуста з йогуртовим соусом",
    ],
  );

  const coveredPages = new Set();
  for (const replacement of data.mealReplacements) {
    replacement.sourcePages.forEach((page) => coveredPages.add(page));
  }
  for (const day of data.days) {
    day.sourcePages.forEach((page) => coveredPages.add(page));
  }
  for (const recipe of data.recipeMethods) {
    assert.ok(recipe.steps.length > 0, `${recipe.name} must preserve its recipe method`);
    recipe.sourcePages.forEach((page) => coveredPages.add(page));
  }
  for (const recommendation of data.generalRecommendations) {
    recommendation.sourcePages.forEach((page) => coveredPages.add(page));
  }
  assert.deepEqual(
    Array.from(coveredPages).sort((left, right) => left - right),
    Array.from({ length: 29 }, (_, index) => index + 1),
  );
});

test("every day preserves three meal slots, per-person calories, components, and page provenance", async () => {
  const data = await loadDemoData();

  for (const day of data.days) {
    assert.ok(day.week === 1 || day.week === 2);
    assert.ok(Array.isArray(day.sourcePages) && day.sourcePages.length > 0);
    assertPersonCalories(day.totalCalories, `Day ${day.day} total`);

    for (const type of ["breakfast", "lunch", "dinner"]) {
      const meal = day.meals[type];
      assert.equal(meal.type, type);
      assert.ok(meal.name.length > 0);
      assert.ok(Array.isArray(meal.sourcePages) && meal.sourcePages.length > 0);
      assert.ok(
        meal.sourceText
          .toLocaleLowerCase("uk-UA")
          .includes(meal.name.split(" + ")[0].toLocaleLowerCase("uk-UA")),
      );
      assert.match(meal.caloriesText, /^Калорійність/);
      assertPersonCalories(meal.calories, `Day ${day.day} ${type}`);
      assert.ok(Array.isArray(meal.components) && meal.components.length > 0);

      for (const component of meal.components) {
        assert.ok(component.name.length > 0);
        assert.ok(Array.isArray(component.sourcePages) && component.sourcePages.length > 0);
        assert.ok(Array.isArray(component.ingredients));
        assert.ok(Array.isArray(component.portions));
        assert.ok(Array.isArray(component.notes));
        assert.ok(Array.isArray(component.substitutions));
      }
    }
  }
});

test("all recoverable component blocks retain ingredients, portions, substitutions, yields, and raw text", async () => {
  const data = await loadDemoData();
  const components = data.days.flatMap((day) =>
    Object.values(day.meals).flatMap((meal) => meal.components),
  );
  const preparations = components.filter(
    (component) => component.kind === "preparation-block",
  );
  const repeatedReferences = components.filter(
    (component) => component.kind === "repeated-menu-reference",
  );

  assert.equal(preparations.length, 75);
  assert.equal(repeatedReferences.length, 14);
  assert.ok(preparations.every((component) => component.sourceText.length > 0));
  assert.ok(preparations.every((component) => component.titleText.length > 0));
  assert.ok(preparations.every((component) => component.ingredientsText?.length > 0));
  assert.ok(preparations.every((component) => component.ingredients.length > 0));
  assert.ok(preparations.every((component) => component.portionText?.length > 0));
  assert.ok(preparations.every((component) => component.portions.length > 0));
  assert.ok(
    repeatedReferences.every((component) => component.dailyPortionText?.length > 0),
  );
  assert.ok(
    repeatedReferences.every((component) =>
      ["Ж", "Ч"].every((person) => component.dailyPortions[person].text.length > 0)),
  );
  for (const component of repeatedReferences) {
    const normalizedSource = component.sourceText.replace(/\s+/g, " ");
    assert.ok(normalizedSource.includes(component.titleText));
    assert.equal(component.titleText.includes("Ж -"), false);
    assert.equal(component.titleText.includes("Калорійність"), false);
    assert.ok(normalizedSource.includes(component.dailyPortionText));
    assert.ok(
      ["Ж", "Ч"].every((person) =>
        component.dailyPortionText.includes(component.dailyPortions[person].text)),
    );
  }
  assert.equal(
    preparations.filter((component) => component.notes.length > 0).length,
    36,
  );
  assert.equal(
    preparations.filter((component) => component.substitutions.length > 0).length,
    14,
  );
  assert.equal(
    preparations.filter((component) => component.yield !== null).length,
    21,
  );
  assert.ok(
    preparations
      .flatMap((component) => component.substitutions)
      .every((text) => text.startsWith("Заміна на коктейль:")),
  );
  for (const component of preparations) {
    const normalizedSource = component.sourceText.replace(/\s+/g, " ");
    assert.ok(normalizedSource.includes(component.titleText));
    assert.ok(normalizedSource.includes(component.ingredientsText));
    assert.ok(normalizedSource.includes(component.portionText));
    assert.ok(
      component.notes.every((note) => normalizedSource.includes(note)),
      `${component.name} must derive every note from its raw source block`,
    );
    assert.ok(
      component.substitutions.every((substitution) =>
        normalizedSource.includes(substitution)),
      `${component.name} must derive every substitution from its raw source block`,
    );
    if (component.yield !== null) {
      assert.ok(
        normalizedSource.includes(component.yield),
        `${component.name} must derive its yield from its raw source block`,
      );
    }
  }

  const serialized = JSON.stringify(data);
  assert.doesNotMatch(serialized, /див\. дослівний рядок/);
  assert.doesNotMatch(serialized, /наведено дослівно в PDF/);
});

test("appendix methods and extras contain source text rather than placeholders", async () => {
  const data = await loadDemoData();

  assert.equal(
    data.recipeMethods.reduce((sum, method) => sum + method.steps.length, 0),
    184,
  );
  for (const method of data.recipeMethods) {
    assert.ok(method.sourceText.startsWith(`• ${method.name}`));
    const normalizedSource = method.sourceText.replace(/\s+/g, " ");
    assert.ok(
      method.steps.every((step) => normalizedSource.includes(step)),
      `${method.name} must derive every parsed step from its raw appendix source`,
    );
  }

  const extras = data.days.flatMap((day) => day.extras);
  assert.equal(extras.length, 10);
  assert.equal(extras.filter((extra) => extra.name === "Банановий хліб").length, 4);
  assert.equal(
    extras.filter((extra) => extra.name === "морозиво пломбір зі згущеним молоком").length,
    2,
  );
  assert.equal(extras.filter((extra) => extra.name === "Сирок «Волошкове поле»").length, 4);
  assert.ok(
    extras
      .filter((extra) => extra.name !== "морозиво пломбір зі згущеним молоком")
      .every((extra) => extra.calories === null),
  );
});

test("all 14 day-level calorie statements match the PDF exactly", async () => {
  const data = await loadDemoData();
  const expected = [
    [480, 750, 620, 990, 770, 1140, 1870, 2880],
    [490, 760, 620, 990, 770, 1140, 1880, 2890],
    [480, 770, 600, 960, 790, 1150, 1870, 2880],
    [470, 770, 600, 960, 790, 1150, 1860, 2880],
    [490, 760, 610, 970, 780, 1130, 1880, 2860],
    [480, 770, 610, 970, 780, 1130, 1870, 2870],
    [470, 770, 620, 980, 780, 1130, 1870, 2880],
    [490, 780, 620, 980, 780, 1130, 1890, 2890],
    [470, 770, 620, 990, 790, 1140, 1880, 2900],
    [480, 770, 620, 990, 790, 1140, 1890, 2900],
    [470, 770, 610, 970, 780, 1140, 1860, 2880],
    [470, 770, 610, 970, 780, 1140, 1860, 2880],
    [490, 770, 620, 970, 780, 1140, 1890, 2880],
    [480, 780, 620, 970, 780, 1140, 1880, 2890],
  ];
  const expectedPages = [
    [2, 3], [4], [5, 6], [7], [8, 9], [10], [11, 12],
    [13], [14, 15], [16], [17, 18], [19], [20, 21], [22],
  ];

  for (const [index, day] of data.days.entries()) {
    const actual = [
      day.meals.breakfast.calories["Ж"].value,
      day.meals.breakfast.calories["Ч"].value,
      day.meals.lunch.calories["Ж"].value,
      day.meals.lunch.calories["Ч"].value,
      day.meals.dinner.calories["Ж"].value,
      day.meals.dinner.calories["Ч"].value,
      day.totalCalories["Ж"].value,
      day.totalCalories["Ч"].value,
    ];
    assert.deepEqual(actual, expected[index], `Day ${day.day} calorie matrix`);
    assert.deepEqual(Array.from(day.sourcePages), expectedPages[index], `Day ${day.day} pages`);
  }
});

test("high-consequence source anchors match independent PDF locations", async () => {
  const data = await loadDemoData();
  const day1 = data.days.find((day) => day.day === 1);
  const oatmeal = day1.meals.breakfast.components.find(
    (component) => component.name === "Запечена вівсянка-кейк з чорницею",
  );

  assert.equal(day1.meals.breakfast.calories["Ж"].value, 480);
  assert.equal(day1.meals.breakfast.calories["Ч"].value, 750);
  assert.deepEqual(Array.from(day1.meals.breakfast.sourcePages), [2]);
  assert.deepEqual(Array.from(day1.meals.lunch.sourcePages), [2]);
  assert.deepEqual(Array.from(day1.meals.dinner.sourcePages), [2, 3]);
  assert.equal(
    oatmeal.portions[0].text,
    "Ж - 200 г запіканки + 50 г йогурту; Ч - 300 г запіканки + 50 г йогурту + 1 банан",
  );
  assert.equal(oatmeal.yield, "Виходить ~640 г готової запіканки.");
  assert.deepEqual(Array.from(oatmeal.sourcePages), [2]);
  assert.ok(oatmeal.ingredients.includes("100 г грецького йогурту 5% для подачі"));
  assert.ok(oatmeal.ingredients.includes("1 банан"));

  const day9 = data.days.find((day) => day.day === 9);
  const khachapuri = day9.meals.breakfast.components.find(
    (component) => component.name === "Ліниві хачапурі",
  );
  assert.ok(khachapuri.ingredients.includes("2 яйця"));
  assert.ok(khachapuri.ingredients.includes("1 варене яйце для Ч"));
  assert.ok(
    data.sourcePages[3].text.includes("холодильник 6+ год."),
    "A duration plus sign must remain source text, not become an ingredient separator",
  );

  const day2LunchReference = data.days
    .find((day) => day.day === 2)
    .meals.lunch.components[0];
  assert.match(day2LunchReference.dailyPortions["Ж"].text, /100 г рису/);
  const day2DinnerReference = data.days
    .find((day) => day.day === 2)
    .meals.dinner.components[0];
  assert.match(day2DinnerReference.dailyPortions["Ж"].text, /150 г батату/);
  assert.match(day2DinnerReference.dailyPortions["Ж"].text, /190 г спаржі/);
  assert.deepEqual(Array.from(day2DinnerReference.sourcePages), [4]);
  const day6DinnerReference = data.days
    .find((day) => day.day === 6)
    .meals.dinner.components[0];
  assert.match(day6DinnerReference.dailyPortions["Ж"].text, /200 г запіканки/);
  assert.equal(
    day6DinnerReference.portionText,
    "Ж - 100 г готового гарніру; Ч - 200 г готового гарніру",
  );

  const meatballs = data.recipeMethods.find(
    (recipe) => recipe.name === "Запечені яловичі фрикадельки",
  );
  assert.deepEqual(Array.from(meatballs.days), [7, 8]);
  assert.deepEqual(Array.from(meatballs.sourcePages), [26, 27]);
  assert.ok(meatballs.steps.some((step) => step.includes("Сформувати РІВНО 20 фрикадельок")));
  assert.ok(meatballs.steps.some((step) => step.includes("Разом 20.")));

  const day11 = data.days.find((day) => day.day === 11);
  assert.equal(day11.totalCalories["Ж"].text, "~1860 ккал (з десертом ~1880)");
  assert.equal(day11.totalCalories["Ч"].text, "~2880 ккал (з десертом ~2900)");
  assert.ok(day11.extras.some((extra) => extra.name.includes("морозиво пломбір")));

  assert.equal(
    data.generalRecommendations.at(-1).text,
    "Пийте воду між прийомами їжі, а не під час.",
  );
});

test("the compatibility seed remains stable and source data is not flattened into it", async () => {
  const data = await loadDemoData();
  const ids = data.demoMeals.map((meal) => meal.id);

  assert.equal(data.seedVersion, 3);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("demo-")));
  assert.equal(data.demoMeals.filter((meal) => meal.type === "breakfast").length, 14);
  assert.equal(data.demoMeals.filter((meal) => meal.type === "lunch").length, 7);
  assert.equal(data.demoMeals.filter((meal) => meal.type === "dinner").length, 7);
  assert.equal(data.demoMeals.filter((meal) => meal.type === "snack").length, 5);
  assert.ok(data.days.every((day) => !Object.hasOwn(day.meals, "snack")));
  assert.deepEqual(
    Array.from(data.compatibilitySeed.caloriePolicy.approximateMealIds),
    Array.from(
      data.demoMeals
        .filter((meal) => meal.caloriesApprox === true)
        .map((meal) => meal.id),
    ),
  );
  assert.equal(
    compatibilitySeedHash(data.demoMeals),
    "6fzsr3.8083",
    "The externalized compatibility seed must be byte-for-byte equivalent by value",
  );
});

test("index and service worker load the standalone classic script", async () => {
  const [index, serviceWorker] = await Promise.all([
    readFile(indexFileUrl, "utf8"),
    readFile(serviceWorkerFileUrl, "utf8"),
  ]);
  const externalScript = '<script src="data/demo-recipes.js"></script>';
  const externalIndex = index.indexOf(externalScript);
  const inlineIndex = index.indexOf("<script>", externalIndex + externalScript.length);

  assert.ok(externalIndex >= 0, "index.html must load data/demo-recipes.js");
  assert.ok(inlineIndex > externalIndex, "demo data must load before the inline application");
  assert.doesNotMatch(index, /const\s+DEMO_MEALS\s*=\s*\[/);
  assert.match(index, /const\s+dataset\s*=\s*window\.MeridianDemoData/);
  assert.match(index, /const\s+DEMO_MEALS\s*=\s*dataset\.demoMeals/);
  assert.match(serviceWorker, /["']\.\/data\/demo-recipes\.js["']/);
  assert.match(serviceWorker, /CACHE_NAME\s*=\s*CACHE_PREFIX\s*\+\s*["']v3["']/);
});
