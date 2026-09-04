/**
 * Архів джерельного тексту імпорту (MER-52) — таблиця `pdf_import`.
 *
 * **Це єдиний запис застосунку, який іде НЕ через локальний SQLite.**
 * `pdf_import` свідомо лишили поза синхронізацією (`infra/powersync/
 * sync-config.yaml`): на пристрої від імпорту потрібні страви, а не кілобайти
 * вихідного тексту, який більше ніхто не читає. Тож пишемо прямо в PostgREST,
 * як екрани сім'ї (MER-45).
 *
 * Наслідок, який не можна ховати: **архів вимагає мережі, а імпорт — ні.**
 * Страви лягають у локальну базу й вивантажаться самі, коли з'явиться зв'язок;
 * текст плану без мережі не збережеться взагалі. Тому помилка звідси не валить
 * імпорт — вона повертається окремо, і екран каже про неї прямо. Тихо
 * проковтнути її не можна: сенс таблиці саме в тому, щоб завжди було видно, з
 * чого зроблено страви.
 *
 * `created_at`/`updated_at` не пишемо — їх ставить сервер (правило `mutations.ts`).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Зберегти текст, з якого розпізнали страви.
 *
 * `fileName` — `null`, коли текст вставили руками: колонка так і задумана
 * (порожнє лишається порожнім, а не рядком «—»).
 */
export async function archivePlanSource(
  supabase: SupabaseClient,
  familyId: string,
  fileName: string | null,
  sourceText: string,
): Promise<void> {
  const { error } = await supabase.from('pdf_import').insert({
    family_id: familyId,
    file_name: fileName,
    source_text: sourceText,
  })
  if (error) throw new Error(error.message)
}
