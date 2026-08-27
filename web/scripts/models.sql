-- Panel models: the sizes and colour depths a device can report as.
--
-- Not application data. A device that calls /api/setup is matched against a row
-- here, and the editor draws against og_plus, so an install with an empty table
-- answers "No models are installed." and nothing works. The rows came with the
-- upstream terminus seeds; they are copied here so a fresh database is usable
-- without one.
--
-- Loaded by `make up` when the table is empty, and safe to run again: ids are
-- assigned by the sequence and never referenced from outside this database, so
-- the conflict target is the name.

INSERT INTO models (name, label, width, height, colors, bit_depth, mode, color_codes, rotation, offset_x, offset_y, mime_type) VALUES
  ('amazon_kindle_2024', 'Amazon Kindle 2024', 1400, 840, 256, 8, 'dither', '[]', 90, 75, 25, 'image/png'),
  ('amazon_kindle_7', 'Amazon Kindle 7', 800, 600, 256, 8, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('amazon_kindle_oasis_2', 'Amazon Kindle Oasis 2', 1680, 1264, 256, 8, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('amazon_kindle_paperwhite_6th_gen', 'Amazon Kindle PW 6th Gen', 1024, 768, 256, 8, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('amazon_kindle_paperwhite_7th_gen', 'Amazon Kindle PW 7th Gen', 1448, 1072, 256, 8, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('amazon_kindle_paperwhite_signature_11th_gen', 'Amazon Kindle PW Signature 11th Gen', 1648, 1236, 16, 4, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('amazon_kindle_scribe', 'Amazon Kindle Scribe', 2480, 1860, 256, 8, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('amazon_kindle_voyage', 'Amazon Kindle Voyage', 1448, 1072, 256, 8, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('avalue_epd_42s', 'Avalue EPD-42S 42" Display Board', 2880, 2160, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('byod_custom', 'Custom Device', 800, 480, 2, 1, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('ed133ut2', 'ED133UT2 Active Matrix', 1600, 1200, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('generic_16_9', 'Generic 16:9 Display', 1920, 1080, 256, 8, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('inkplate_10', 'Inkplate 10', 1200, 825, 4, 2, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('inkplate_13_spectra', 'Inkplate 13 Spectra', 1600, 1200, 2, 1, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('inkplate_5_2', 'Inkplate 5.2', 1280, 720, 4, 2, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('inkplate_6_color', 'Inkplate 6COLOR', 600, 448, 2, 1, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('inkplate_6_plus', 'Inkplate 6 Plus', 1024, 758, 4, 2, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('inky_impression_13_3', 'Inky Impression 13.3', 1600, 1200, 2, 1, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('inky_impression_7_3', 'Inky Impression 7.3', 800, 480, 2, 1, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('kobo_aura_h2o_2', 'Kobo Aura H2O Edition 2', 1430, 1080, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('kobo_aura_hd', 'Kobo Aura HD', 1440, 1080, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('kobo_aura_one', 'Kobo Aura One', 1872, 1404, 256, 8, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('kobo_forma', 'Kobo Forma', 1920, 1440, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('kobo_glo', 'Kobo Glo', 1024, 768, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('kobo_libra_2', 'Kobo Libra 2', 1680, 1264, 256, 8, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('kobo_libra_color', 'Kobo Libra Color', 1680, 1264, 4096, 12, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('kobo_sage', 'Kobo Sage', 1920, 1440, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('kobo_touch', 'Kobo Touch', 800, 600, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('m5_paper_s3', 'M5PaperS3', 960, 540, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('meta_portal', 'Meta Portal', 1280, 800, 16777216, 24, 'dither', '[]', 0, 0, 0, 'image/webp'),
  ('nook_simple_touch', 'Nook Simple Touch', 800, 600, 256, 8, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('og_bwry', 'TRMNL OG (B/W/R/Y)', 800, 480, 2, 1, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('og_plus', 'TRMNL OG (2-bit)', 800, 480, 4, 2, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('og_png', 'TRMNL OG (1-bit)', 800, 480, 2, 1, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('onxy_boox_nova_air_c', 'Onyx BOOX Nova Air C', 1872, 1404, 4096, 12, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('onyx_boox_go_7', 'Onyx BOOX Go 7', 1680, 1264, 16, 4, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('onyx_boox_poke_5', 'Onyx BOOX Poke 5', 1072, 1448, 16, 4, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('openframe', 'OpenPeak OpenFrame', 800, 480, 16777216, 24, 'dither', '[]', 0, 0, 0, 'image/webp'),
  ('palma', 'Onyx BOOX Palma', 1648, 824, 256, 8, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('raspberry_pi_touch_2', 'Raspberry Pi Touch 2', 1280, 720, 16777216, 24, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('remarkable_paper_2', 'reMarkable 2', 1404, 1872, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('seeed_e1001', 'Seeed E1001 Monochrome', 800, 480, 4, 2, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('seeed_e1002', 'Seeed E1002', 800, 480, 6, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('seeed_e1003', 'Seeed E1003 (4-bit)', 1872, 1404, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('seeed_e1004', 'Seeed E1004', 1600, 1200, 16, 4, 'dither', '[]', 90, 0, 0, 'image/png'),
  ('tcl_nxtpaper_14', 'TCL NxtPaper 14', 2400, 1600, 16777216, 24, 'dither', '[]', 0, 0, 0, 'image/webp'),
  ('tidbyt', 'Tidbyt', 64, 32, 16777216, 24, 'dither', '[]', 0, 0, 0, 'image/webp'),
  ('v2', 'TRMNL X', 1872, 1404, 16, 4, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('waveshare_4_26', 'Waveshare 4.26" (2-bit)', 800, 480, 4, 2, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('waveshare_5_8_bw', 'Waveshare 5.83" (Steam Machine)', 648, 480, 4, 2, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('waveshare_7_5_bw', 'Waveshare 7.5" B/W', 800, 480, 2, 1, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('waveshare_7_5_bwr', 'Waveshare 7.5" B/W/R', 800, 480, 2, 1, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('waveshare_7_5_bwry', 'Waveshare 7.5" B/W/R/Y', 800, 480, 2, 1, 'dither', '[]', 0, 0, 0, 'image/png'),
  ('xteink_x4', 'Xteink X4', 800, 480, 4, 2, 'dither', '[]', 0, 0, 0, 'image/png')
ON CONFLICT (name) DO NOTHING;
