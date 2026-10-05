-- MER-76: «помилка в джерелі» — розбіжності в плані дієтолога, які страва
-- зберігає дослівно, без виправлень навмання. Масив рядків-описів; порожній —
-- розбіжностей немає. Правильне значення в описі не пропонується (провенанс).
--
-- Як і в 0005, права й публікація окремого кроку не потребують.
ALTER TABLE "meal" ADD COLUMN "source_issues" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "meal" ADD CONSTRAINT "meal_source_issues_is_array" CHECK (jsonb_typeof("source_issues") = 'array');
