-- Bucket audio-guides : autoriser M4A/AAC (migration MP3 → .m4a)

UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT array_agg(DISTINCT mime ORDER BY mime)
  FROM (
    SELECT unnest(COALESCE(allowed_mime_types, ARRAY[]::text[])) AS mime
    UNION ALL
    SELECT unnest(ARRAY['audio/mp4', 'audio/x-m4a', 'audio/aac']::text[])
  ) AS merged
)
WHERE id = 'audio-guides';
