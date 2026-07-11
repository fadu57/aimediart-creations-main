-- Index de rattachement œuvre pour fiabiliser les filtres coûts (expo / œuvre / agence).
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_artwork_id
  ON public.ai_usage_logs (artwork_id)
  WHERE artwork_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_metadata_artwork_id
  ON public.ai_usage_logs ((metadata->>'artwork_id'))
  WHERE (metadata->>'artwork_id') IS NOT NULL;

COMMENT ON INDEX idx_ai_usage_logs_artwork_id IS
  'Filtres coûts par œuvre — colonne artwork_id.';
COMMENT ON INDEX idx_ai_usage_logs_metadata_artwork_id IS
  'Filtres coûts par œuvre — repli metadata.artwork_id.';
