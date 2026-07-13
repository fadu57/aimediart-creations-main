-- Canopée p5 : réglages vitrine / projection + lecture publique (bandeau anon)
INSERT INTO public.app_settings (key, value)
VALUES (
  'settings_forest_canopy',
  '{"strip":{"canvas_height":150,"max_width":850,"min_width":320},"particles":{"count":600,"size_min":12,"size_max":40,"color_r_min":18,"color_r_max":48,"color_g_min":80,"color_g_max":160,"color_b_min":30,"color_b_max":60,"alpha":150},"overlay":{"spawn_interval_ms":1100,"word_chance":0.42,"burst_strip_min":1,"burst_strip_max":2,"burst_fullscreen_min":3,"burst_fullscreen_max":4,"word_speed_min":10,"word_speed_max":22,"heart_speed_min":14,"heart_speed_max":26,"word_fade_per_sec":63,"heart_fade_per_sec":99,"word_font_min":20,"word_font_max":50,"heart_font_min":22,"heart_font_max":58},"animation":{"background_r":5,"background_g":20,"background_b":10,"background_a":80,"pulse_amplitude":20,"pulse_speed":0.02}}'
)
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS app_settings_forest_canopy_public_read ON public.app_settings;
CREATE POLICY app_settings_forest_canopy_public_read ON public.app_settings
  FOR SELECT TO anon, authenticated
  USING (key = 'settings_forest_canopy');
