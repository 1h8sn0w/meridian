import type { SupabaseClient } from '@supabase/supabase-js'

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
