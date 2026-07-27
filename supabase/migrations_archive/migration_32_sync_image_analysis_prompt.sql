-- Synchronise le prompt « Analyse de l'image » depuis prompt_style vers app_settings.
-- Utile si l'ancien app_settings.analysis_prompt (migration_12) masquait vos modifications.

INSERT INTO public.app_settings (key, value, max_tokens)
SELECT
  'Analyse de l''image',
  trim(
    concat_ws(
      E'\n\n',
      nullif(trim(coalesce(ps.style_rules, '')), ''),
      nullif(trim(coalesce(ps.system_instruction, '')), '')
    )
  ),
  ps.max_tokens
FROM public.prompt_style ps
WHERE (
  lower(coalesce(ps.name_fr, '')) LIKE '%analyse%image%'
  OR lower(coalesce(ps.name_en, '')) LIKE '%analysis%image%'
  OR lower(coalesce(ps.name, '')) LIKE '%analyse%image%'
)
AND trim(
  concat_ws(
    E'\n\n',
    nullif(trim(coalesce(ps.style_rules, '')), ''),
    nullif(trim(coalesce(ps.system_instruction, '')), '')
  )
) <> ''
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  max_tokens = COALESCE(EXCLUDED.max_tokens, public.app_settings.max_tokens);
