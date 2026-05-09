-- Gröna Linjen Kammarmusik — Full data import
-- Company: 4d8238fb-5de4-4c9f-959a-15e93a3bf5d6
-- User: ba9c0cd4-86b0-4c8b-87bc-823ef2063be3

BEGIN;

-- ============================================================
-- 1. CLIENTS (for invoices)
-- ============================================================

INSERT INTO clients (id, name, org_number, address, email, reference_person, user_id, company_id) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Billetto AB', '559062-6098', 'C/O Hellström Advokatbyrå, box 7305, 10390 Stockholm', 'support@billetto.se', NULL, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
  ('a0000001-0000-0000-0000-000000000002', 'Stiftelsen KGL Teaterns Solister', NULL, NULL, NULL, 'Magnus Kyhle', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- ============================================================
-- 2. INVOICES — 2023 Billetto income (5 events)
-- ============================================================

-- INV-1: Mendelssohn stråkoktett 2023-01-20
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 1, '2023-01-20', '2023-01-26', '2023-01-26', 26197.76, 0, 0, 26197.76, 'paid', 'Billetto Event #763620 — 167 biljetter, brutto 31700 kr, avgifter -5502.24 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000001', 'Biljettförsäljning: Mendelssohn stråkoktett! (167 biljetter)', 26197.76, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-2: Amanda Ginsburg & Askanäs Kammarkvartett 2023-02-18
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 2, '2023-02-18', '2023-02-23', '2023-02-23', 60018.70, 0, 0, 60018.70, 'paid', 'Billetto Event #762085 — 192 biljetter, brutto 67248 kr, avgifter -7229.30 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000002', 'Biljettförsäljning: Amanda Ginsburg & Askanäs Kammarkvartett Releasekonsert (192 biljetter)', 60018.70, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-3: Tjajkovskij & Glass 2023-05-20
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001', 3, '2023-05-20', '2023-09-14', '2023-09-14', 12329.00, 0, 0, 12329.00, 'paid', 'Billetto Event #829126 — 78 biljetter, brutto 14500 kr, avgifter -2171 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000003', 'Biljettförsäljning: Tjajkovskij & Glass (78 biljetter)', 12329.00, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-4: Episk Kammarmusik för Stråkar 2023-11-10
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001', 4, '2023-11-10', '2023-11-16', '2023-11-16', 20229.89, 0, 0, 20229.89, 'paid', 'Billetto Event #881421 — 120 biljetter, brutto 22000 kr, avgifter -1770.11 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000004', 'Biljettförsäljning: Episk Kammarmusik för Stråkar (120 biljetter)', 20229.89, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-5: Julkonsert 2023-12-17
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000001', 5, '2023-12-17', '2023-12-21', '2023-12-21', 44302.23, 0, 0, 44302.23, 'paid', 'Billetto Event #893221 — 181 biljetter, brutto 52700 kr, avgifter -8397.77 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000005', 'Biljettförsäljning: Julkonsert med Gröna Linjen & Gäster! (181 biljetter)', 44302.23, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- ============================================================
-- 3. INVOICES — 2024 Billetto income (5 events)
-- ============================================================

-- INV-6: Schubert Stråkkvintett 2024-04-14
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000001', 6, '2024-04-14', '2024-04-18', '2024-04-18', 25733.17, 0, 0, 25733.17, 'paid', 'Billetto Event #957603 — 182 biljetter, brutto 34000 kr, avgifter -8266.83 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000006', 'Biljettförsäljning: Schubert Stråkkvintett! (182 biljetter)', 25733.17, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-7: Enescu & Pärt 2024-05-11
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000001', 7, '2024-05-11', '2024-05-16', '2024-05-16', 15373.75, 0, 0, 15373.75, 'paid', 'Billetto Event #957608 — 104 biljetter, brutto 17500 kr, avgifter -2126.25 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000007', 'Biljettförsäljning: Enescu & Pärt (104 biljetter)', 15373.75, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-8: Isabella Lundgren 2024-08-15
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000008', 'a0000001-0000-0000-0000-000000000001', 8, '2024-08-15', '2024-08-19', '2024-08-19', 35164.94, 0, 0, 35164.94, 'paid', 'Billetto Event #994303 — 164 biljetter, brutto 39000 kr, avgifter -3835.06 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000008', 'Biljettförsäljning: Isabella Lundgren & GL stråkkvartett (164 biljetter)', 35164.94, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-9: Vivaldis Fyra Årstider 2024-10-31
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000009', 'a0000001-0000-0000-0000-000000000001', 9, '2024-10-31', '2024-11-04', '2024-11-04', 23256.25, 0, 0, 23256.25, 'paid', 'Billetto Event #1098520 — 147 biljetter, brutto 25750 kr, avgifter -2493.75 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000009', 'Biljettförsäljning: Vivaldis Fyra Årstider m Nils-Erik Sparf (147 biljetter)', 23256.25, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-10: Brahms & Puccini 2024-11-29
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000010', 'a0000001-0000-0000-0000-000000000001', 10, '2024-11-29', '2024-12-05', '2024-12-05', 12997.50, 0, 0, 12997.50, 'paid', 'Billetto Event #1103869 — 83 biljetter, brutto 14400 kr, avgifter -1402.50 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000010', 'Biljettförsäljning: Brahms & Puccini m Tobias Ringborg & Alva Ho (83 biljetter)', 12997.50, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- ============================================================
-- 4. INVOICES — 2025 income (4 Billetto + 1 bidrag)
-- ============================================================

-- INV-11: Stråktrio 2025-02-26
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000011', 'a0000001-0000-0000-0000-000000000001', 11, '2025-02-26', '2025-03-03', '2025-03-03', 14912.50, 0, 0, 14912.50, 'paid', 'Billetto Event #1166712 — 69 biljetter, brutto 16250 kr, avgifter -1337.50 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000011', 'Biljettförsäljning: Stråktrio med GL Kammarmusik (69 biljetter)', 14912.50, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-12: Romantiska Pianokvartetter 2025-04-27
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000012', 'a0000001-0000-0000-0000-000000000001', 12, '2025-04-27', '2025-05-01', '2025-05-01', 14011.87, 0, 0, 14011.87, 'paid', 'Billetto Event #1138374 — 69 biljetter, brutto 14600 kr, avgifter -588.13 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000012', 'Biljettförsäljning: Romantiska Pianokvartetter (69 biljetter)', 14011.87, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-13: Korngold & Mozart 2025-08-15
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000013', 'a0000001-0000-0000-0000-000000000001', 13, '2025-08-15', '2025-08-21', '2025-08-21', 13807.50, 0, 0, 13807.50, 'paid', 'Billetto Event #1331658 — 73 biljetter, brutto 15200 kr, avgifter -1392.50 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000013', 'Biljettförsäljning: GL spelar Korngold & Mozart (73 biljetter)', 13807.50, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-14: Beethovens Pastoral 2025-10-25
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000014', 'a0000001-0000-0000-0000-000000000001', 14, '2025-10-25', '2025-10-30', '2025-10-30', 20803.00, 0, 0, 20803.00, 'paid', 'Billetto Event #1331659 — 100 biljetter, brutto 23050 kr, avgifter -2247 kr', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000014', 'Biljettförsäljning: GL spelar Beethovens Pastoral (100 biljetter)', 20803.00, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- INV-15: Bidrag (Olves stiftelse) — granted 2024-06-12
INSERT INTO invoices (id, client_id, invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, notes, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000015', 'a0000001-0000-0000-0000-000000000002', 15, '2024-06-12', '2024-06-12', '2024-06-12', 48000.00, 0, 0, 48000.00, 'paid', 'Enescubidrag via Stiftelsen KGL Teaterns Solister / Olves stiftelse. Ursprungligt bidrag 80 000 kr till Askanäs, varav 48 000 kr vidarebefordrat till Gröna Linjen.', 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');
INSERT INTO invoice_lines (invoice_id, description, amount, vat_rate, is_vat_exempt, user_id, company_id) VALUES
  ('b0000001-0000-0000-0000-000000000015', 'Enescubidrag — Kungliga Operans Solister / Olves stiftelse', 48000.00, 0, true, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- Update next_invoice_number
UPDATE companies SET next_invoice_number = 16 WHERE id = '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6';

-- ============================================================
-- 5. EXPENSES — 2023 costs
-- ============================================================

INSERT INTO expenses (date, supplier, amount, category, notes, vat_rate, vat_amount, subtotal, user_id, company_id) VALUES
-- Amanda Ginsburg konsert 2023-02-18
('2023-02-24', 'MTA Förening', 18000.00, 'subcontractor', 'Faktura 1586. Amanda Ginsburg m band + vidarefakturering ljudteknik. Konsert 2023-02-18 Årsta.', 0, 0, 18000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Glass & Tchaikovsky 2023-05-20
('2023-06-03', 'Willem Stam AB (Sofie Sunnerstam)', 3000.00, 'subcontractor', 'Invoice 13.23. Konsert Årsta 20 maj, Glass och Tjajkovskij.', 0, 0, 3000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Strauss & Brahms 2023-11-10
('2023-11-28', 'Bernt Lysell', 4000.00, 'subcontractor', 'Medverkan vid konsert Årsta 10/11 2023. Strauss-Brahms.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2023-11-20', 'Karin Hansson Lasses', 4000.00, 'subcontractor', 'Faktura 2023006. Kontrabas, konsert 10/11 Årsta Folkets hus.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2023-12-07', 'Vidar Andersson Meilink', 4000.00, 'subcontractor', 'Faktura 74. Gröna Linjen Konsert 10/11.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-02-27', 'Riikka Repo', 4000.00, 'subcontractor', 'Faktura 1029. Kammarmusikkonsert 19/11-2023.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Julkonsert 2023-12-17
('2023-12-18', 'RH Musikproduktion AB (David Huang)', 4000.00, 'subcontractor', 'Faktura 233. Medverkan Julkonsert 17/12 2023.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2023-12-21', 'BAGGAB Musik AB (Carl Bagge)', 4000.00, 'subcontractor', 'Faktura 864. Julkonsert Årsta Folkets hus 17/12.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2023-12-27', 'Migdal & Nilsson Musik AB (Julia Nilsson)', 4000.00, 'subcontractor', 'Faktura 1185. Julkonsert Årsta folkets hus 17/12-23.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2023-12-20', 'Anders Kjellberg Nilsson', 4000.00, 'subcontractor', 'Faktura 23-18. Konsert Årsta Folkets Hus 17 dec.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2023-12-29', 'AB Cantarel (Amanda Ginsburg)', 4000.00, 'subcontractor', 'Faktura 253. Amanda Ginsburg gäst vid julkonsert Årsta 17/12-2023.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2023-12-22', 'Willem Stam AB (Sofie Sunnerstam)', 4000.00, 'subcontractor', 'Invoice 055.23. Julkonsert Årsta Folkets hus 17 dec, viola.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2023-12-01', 'CH Tryckeri', 531.00, 'other', 'Faktura 6125. 10x A3 + 10x A4 affischer Julkonsert. Tryck.', 25, 106.25, 425.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Facebook utlägg 2023
('2023-12-31', 'Facebook/Meta (privata utlägg Brusk)', 1840.00, 'other', 'Privata Facebook-annonsutlägg okt-dec 2023. Marknadsföring.', 0, 0, 1840.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- ============================================================
-- 6. EXPENSES — 2024 costs
-- ============================================================

INSERT INTO expenses (date, supplier, amount, category, notes, vat_rate, vat_amount, subtotal, user_id, company_id) VALUES
-- Musician fees 2024
('2024-01-02', 'GK Music (Georg Källström)', 4000.00, 'subcontractor', 'Faktura 2402. Solist vid julkonsert 17/12-2023.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-01-30', 'Babalisk AB (Brusk Zanganeh)', 6000.00, 'subcontractor', 'Faktura 157. Violinist, 2 kammarmusikkonserter.', 0, 0, 6000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-01-25', 'Andreas Lavotha AB', 15000.00, 'subcontractor', 'Faktura 116. Arbete med Gröna Linjen Kammarmusik 2023.', 0, 0, 15000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-01-24', 'Migdal & Nilsson Musik AB', 12000.00, 'subcontractor', 'Faktura 1190. 4 kammarmusikkonserter 2023, arvode.', 0, 0, 12000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-05-06', 'Damon Taheri', 5000.00, 'subcontractor', 'Faktura 539. Konsert Schubert C-dur kvintett, Årsta 14/4.', 0, 0, 5000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-05-21', 'F:a Patrik Swedrup', 6000.00, 'subcontractor', 'Faktura 125. Enescu 11/5-2024.', 0, 0, 6000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-06-20', 'Albin Uusijärvi', 6000.00, 'subcontractor', 'Faktura 109. Konsertframträdande inför publik.', 0, 0, 6000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-06-14', 'Danial Shariati', 8000.00, 'subcontractor', 'Faktura 30. Oktettkonsert 11/5-24.', 0, 0, 8000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-06-12', 'Andreas Lavotha AB', 11000.00, 'subcontractor', 'Faktura 141. Jobb GL konserter 14/4 (Schubert) & 11/5 (Enescu).', 0, 0, 11000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-06-29', 'Migdal & Nilsson Musik AB', 11000.00, 'subcontractor', 'Faktura 1216. Konserter 14/4 (Schubert) och 11/5 (Enescu).', 0, 0, 11000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-07-01', 'Babalisk AB (Brusk Zanganeh)', 11000.00, 'subcontractor', 'Faktura 167. Schubert 14/4 (5000) + Enescu 14/5 (6000).', 0, 0, 11000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-07-09', 'Cross Creations AB (Sarah Cross)', 8000.00, 'subcontractor', 'Faktura 10-24. GL Konsert 11 maj + halv Allhelgonakyrkan.', 0, 0, 8000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-08-18', 'LYN Studio AB (Johan Norgren)', 8800.00, 'subcontractor', 'Faktura 202425. Gage konsert 15 aug, Isabella Lundgren.', 0, 0, 8800.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-08-26', 'MTA Förening (Isabella Lundgren)', 5000.00, 'subcontractor', 'Faktura 1740. Isabella Lundgren 15/8 Årsta.', 0, 0, 5000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-09-02', 'Niklas Fernqvist', 5000.00, 'subcontractor', 'Faktura 24-068. Musikerarvode konsert Årsta 15/8.', 0, 0, 5000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-09-28', 'Babalisk AB (Brusk Zanganeh)', 7000.00, 'subcontractor', 'Faktura 174. Violin 15/8 Isabella L (5000) + Enescu (2000).', 0, 0, 7000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-09-17', 'Andreas Lavotha AB', 7000.00, 'subcontractor', 'Faktura 150. Isabella Lundgren + halv Enescu sept.', 0, 0, 7000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-09-29', 'Firma Emilie Hornlund', 2000.00, 'subcontractor', 'Faktura 114. Konsert Allhelgonakyrkan 21/9 2024.', 0, 0, 2000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-10-08', 'Ravsta Music AB (Ylva Larsdotter)', 2000.00, 'subcontractor', 'Faktura 1048. Violin, KVAH Allhelgonakyrkan 21/9.', 0, 0, 2000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-11-05', 'Willem Stam AB (Sofie Sunnerstam)', 4000.00, 'subcontractor', 'Faktura 024.24. Shaw & Vivaldi, Årsta Teater 31/10.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-11-04', 'Firma Nils Erik Sparf', 4964.00, 'subcontractor', 'Faktura 703. Konsert Årsta 31/10 Vivaldi. Arvode 4000 + taxi 964.', 0, 0, 4964.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-11-08', 'Jonna Simonsson', 4000.00, 'subcontractor', 'Faktura 20241108/42. Konsert Årsta Teater 31/10-2024.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-11-10', 'Firma Claviorganum (Björn Gäfvert)', 4000.00, 'subcontractor', 'Faktura 870. Cembalospel Vivaldi Årsta teater 31/10.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-11-19', 'Babalisk AB (Brusk Zanganeh)', 4000.00, 'subcontractor', 'Faktura 175. Vivaldi årstiderna.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-11-14', 'Willem Stam AB (Willem Stam)', 33291.00, 'subcontractor', 'Faktura 029.24. 4 konserter (Schubert, Enescu, Enescu sept, Vivaldi) + Mailchimp + Facebook ads. Samlingsavräkning.', 0, 0, 33291.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Venue 2024
('2024-05-17', 'Årsta Folkets Husförening', 9500.00, 'other', 'Faktura 10596. Bokning 2333, 2024-04-14. Teatern + Ljud&Ljus. Lokalhyra.', 0, 0, 9500.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-05-08', 'Årsta Folkets Husförening', 9500.00, 'other', 'Faktura 10603. Bokning 2144, 2024-05-11. Teatern + Ljud&Ljus. Lokalhyra.', 0, 0, 9500.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-08-14', 'Årsta Folkets Husförening', 7000.00, 'other', 'Faktura 10658. Bokning 2542, 2024-08-15. Mälaren + Foajén. Lokalhyra.', 0, 0, 7000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-11-04', 'Årsta Folkets Husförening', 9500.00, 'other', 'Faktura 10716. Bokning 2716, 2024-10-31. Teatern + Ljud&Ljus. Lokalhyra.', 0, 0, 9500.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-11-29', 'Årsta Folkets Husförening', 9500.00, 'other', 'Faktura 10751. Bokning 2734, 2024-11-29. Teatern + Ljud&Ljus. Lokalhyra.', 0, 0, 9500.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Printing 2024
('2024-03-20', 'CH Tryckeri', 531.00, 'other', 'Faktura 6379. 10x A3 + 10x A4 Schubert affischer. Tryck.', 25, 106.25, 425.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-06-10', 'CH Tryckeri', 1156.00, 'other', 'Faktura 6546. Enescu & Pärt + Folkets Hus affischer. Tryck.', 25, 231.25, 925.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-08-05', 'CH Tryckeri', 531.00, 'other', 'Faktura 6632. Isabella Lundgren "Safari" affischer. Tryck.', 25, 106.25, 425.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-10-22', 'CH Tryckeri', 834.00, 'other', 'Faktura 6793. Vivaldi affischer + påminnelseavgift. Tryck.', 25, 156.25, 625.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-12-03', 'CH Tryckeri', 531.00, 'other', 'Faktura 6891. Brahms & Puccini affischer. Tryck.', 25, 106.25, 425.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Marketing 2024
('2024-03-25', 'Meta/Facebook (via Babalisk)', 494.46, 'other', 'Instagram ads Schubert mar 2024. Marknadsföring.', 0, 0, 494.46, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-04-08', 'Meta/Facebook (via Babalisk)', 600.00, 'other', 'Instagram ads Schubert mar-apr 2024. Marknadsföring.', 0, 0, 600.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-04-25', 'Meta/Facebook (via Babalisk)', 466.25, 'other', 'Instagram ads Schubert + Enescu apr 2024. Marknadsföring.', 0, 0, 466.25, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-05-25', 'Meta/Facebook (via Babalisk)', 539.20, 'other', 'Instagram ads Enescu apr-maj 2024. Marknadsföring.', 0, 0, 539.20, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-01-01', 'Meta/Facebook (via Andreas)', 194.09, 'other', 'Facebook ads Julkonsert nov-dec 2023. Marknadsföring.', 0, 0, 194.09, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-02-29', 'Meta/Facebook (via Andreas)', 162.88, 'other', 'Facebook ads Enescu + Schubert feb 2024. Marknadsföring.', 0, 0, 162.88, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-04-01', 'Meta/Facebook (via Andreas)', 751.35, 'other', 'Facebook ads Schubert + Enescu feb-mar 2024. Marknadsföring.', 0, 0, 751.35, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-04-28', 'Meta/Facebook (via Andreas)', 2001.84, 'other', 'Facebook ads apr 2024. Marknadsföring.', 0, 0, 2001.84, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-04-30', 'Meta/Facebook (via Andreas)', 122.96, 'other', 'Facebook ads apr 2024. Marknadsföring.', 0, 0, 122.96, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-05-23', 'Meta/Facebook (via Andreas)', 2000.00, 'other', 'Facebook ads apr-maj 2024. Marknadsföring.', 0, 0, 2000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-08-01', 'Meta/Facebook (via Andreas)', 257.31, 'other', 'Facebook ads Isabella Lundgren jun-jul 2024. Marknadsföring.', 0, 0, 257.31, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-11-15', 'Meta/Facebook (Gröna Linjen konto)', 3448.69, 'other', 'Facebook/Instagram ads okt-nov 2024, Vivaldi m.m. Marknadsföring.', 0, 0, 3448.69, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Photo 2024
('2024-05-02', 'Firma Fabian Rosenberg', 3750.00, 'other', 'Faktura 305. Bilder Gröna linjen April 2024. Foto.', 25, 750.00, 3000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Press 2024
('2024-08-22', 'Frilans Finans (Alva Press)', 5000.00, 'other', 'Faktura 82971888. Gröna linjen med Isabella Lundgren 15/8. Press/publicitet.', 25, 1000.00, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Accounting 2024
('2024-09-08', 'G&L Vasastan AB', 5156.00, 'accounting', 'Faktura 2033021. Löpande bokföring t.o.m. 31 juli 2024.', 25, 1031.25, 4125.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Piano tuning 2024
('2024-09-10', 'Pianotekniker Carl Wahren', 1500.00, 'equipment', 'Faktura 24246. Pianostämning S&S Årsta bio 16 aug.', 25, 300.00, 1200.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Transport 2024
('2024-11-06', 'QRIR Transporter & Sånt i Sverige AB', 2835.00, 'travel', 'Faktura 13505. Cembalotransport Immanuelskyrkan <-> Årsta 31/10-1/11.', 25, 567.00, 2268.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Bank 2024
('2024-08-16', 'Danske Bank (utlägg Andreas)', 6223.00, 'bank', 'Återbetalning utlägg Gröna Linjen till Andreas.', 0, 0, 6223.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-09-30', 'Danske Bank', 676.20, 'bank', 'Bankavgifter enligt avisering.', 0, 0, 676.20, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

-- ============================================================
-- 7. EXPENSES — 2025 costs
-- ============================================================

INSERT INTO expenses (date, supplier, amount, category, notes, vat_rate, vat_amount, subtotal, user_id, company_id) VALUES
-- Musician fees 2025
('2025-01-09', 'Nordic Artists Management (Alva Holm)', 4000.00, 'subcontractor', 'Invoice S13093-6436. Konsertarvode Alva Holm, konsert 29/11 2024.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2024-12-17', 'Damon Taheri', 4000.00, 'subcontractor', 'Faktura 1941. Puccini Crisantemi & Brahms kvintett, konsert 29/11 2024.', 0, 0, 4000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-03-17', 'Riikka Repo', 5000.00, 'subcontractor', 'Faktura 1058. Konsert Gröna Linjen 26/2.', 0, 0, 5000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-03-17', 'Erik Wahlgren', 5000.00, 'subcontractor', 'Trio-konsert 9/3 2025.', 0, 0, 5000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-03-19', 'Willem Stam AB', 25242.00, 'subcontractor', 'Faktura 008.25. Vivaldi (4000), Brahms (5000), Kerem/Arensky (5000) + Facebook Ads (9900) + Mailchimp (1342).', 0, 0, 25242.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-03-28', 'Migdal & Nilsson Musik AB', 15000.00, 'subcontractor', 'Faktura 1240. Isabella Lundgren 15/8-24, Trio 26/2-25, Kvartett 19/3-25.', 0, 0, 15000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-03-25', 'Andreas Lavotha AB', 8910.00, 'subcontractor', 'Faktura 179. Arvode konsert 19/3 + övrigt arbete.', 0, 0, 8910.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-04-28', 'Andreas Lavotha AB', 5000.00, 'subcontractor', 'Faktura 191. Konsert 27/4 Årsta Folkets Hus.', 0, 0, 5000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-04-30', 'Daniel Hormazabal', 5000.00, 'subcontractor', 'Faktura 202518. Konsert Årsta 27/4 2025.', 0, 0, 5000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-05-11', 'Babalisk AB (Brusk Zanganeh)', 17250.00, 'subcontractor', 'Faktura 204. Violin konserter (Holm/Ringborg 5000, Arensky 5000, Brahms P4 5000) + privata annonsutlägg (2250).', 0, 0, 17250.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-08-31', 'Kaufeldt Musik (Louisa Kaufeldt)', 6500.00, 'subcontractor', 'Faktura 2502. Repetition & konsert 15/8, Mozart och Korngold.', 0, 0, 6500.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-09-02', 'Alva Holm', 7678.00, 'subcontractor', 'Faktura 006.25. Konsert 15/8 (6500) + resa (1178).', 0, 0, 7678.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-10-27', 'Kaufeldt Musik (Louisa Kaufeldt)', 6000.00, 'subcontractor', 'Faktura 2507. Konsert 25/10 Gröna Linjen.', 0, 0, 6000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-11-07', 'Andreas Lavotha AB', 12500.00, 'subcontractor', 'Faktura 214. Konserter Korngold 15/8 & Beethoven 25/10.', 0, 0, 12500.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-10-29', 'Damon Taheri', 6000.00, 'subcontractor', 'Faktura 4044. Viola Beethoven Pastoral + Frank Martin. Konsert 25/10.', 0, 0, 6000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-11-11', 'Babalisk AB (Brusk Zanganeh)', 6500.00, 'subcontractor', 'Faktura 228. Violin Zanganeh, Korngold-konsert.', 0, 0, 6500.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-11-11', 'Yongmin Lee', 6000.00, 'subcontractor', 'Faktura 2025-003. Konsert.', 0, 0, 6000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-12-22', 'Frilans Finans (Eriikka Nylund)', 6519.00, 'subcontractor', 'Faktura 8527118. Inspelning som musiker.', 6, 369.00, 6150.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Venue 2025
('2025-02-02', 'Årsta Folkets Husförening', 9500.00, 'other', 'Faktura 10849. Bokning 3075, 2025-02-26. Teatern + Ljud&Ljus. Lokalhyra.', 0, 0, 9500.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-03-19', 'Årsta Folkets Husförening', 9500.00, 'other', 'Faktura 10909. Bokning 2980, 2025-03-19. Teatern + Ljud&Ljus. Lokalhyra.', 0, 0, 9500.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-04-15', 'Årsta Folkets Husförening', 7000.00, 'other', 'Faktura 10966. Bokning 2845, 2025-04-27. Mälaren + Foajén. Lokalhyra.', 0, 0, 7000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-08-22', 'Årsta Folkets Husförening', 7000.00, 'other', 'Faktura 11032. Bokning 3312, 2025-08-15. Teatern. Lokalhyra.', 0, 0, 7000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-11-06', 'Årsta Folkets Husförening', 7000.00, 'other', 'Faktura 11145. Bokning 3313, 2025-10-25. Teatern. Lokalhyra.', 0, 0, 7000.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Printing 2025
('2025-02-13', 'CH Tryckeri', 425.00, 'other', 'Faktura 7092. Affischer feb-konsert + påminnelseavgift 50 kr. Tryck.', 25, 75.00, 300.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-05-10', 'CH Tryckeri', 719.00, 'other', 'Faktura 7235. Affischer Arensky-konsert. Tryck.', 25, 143.75, 575.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-07-30', 'LaserTryck.se AB', 1036.25, 'other', 'Faktura F27387. 15x A3 affischer 250g Silk. Tryck.', 25, 207.25, 829.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-11-27', 'CH Tryckeri (Fortnox Finans)', 488.07, 'other', 'Faktura 7623. Affischer + påminnelseavgift + ränta. Tryck.', 25, 85.00, 340.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),
('2025-12-22', 'CH Tryckeri (Fortnox Finans)', 425.00, 'other', 'Faktura 7863. Affischer jan 2026. Tryck.', 25, 85.00, 340.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Piano tuning 2025
('2025-05-04', 'Pianotekniker Carl Wahren', 1500.00, 'equipment', 'Faktura 25122. Pianostämning Steinway, Årsta bio 27/4.', 25, 300.00, 1200.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Accounting 2025
('2025-06-09', 'G&L Vasastan AB', 3034.00, 'accounting', 'Faktura 2034959. Löpande bokföring t.o.m. maj 2025.', 25, 606.75, 2427.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6'),

-- Folkets Hus membership 2025
('2025-02-02', 'Folkets Hus Årsta', 200.00, 'other', 'Medlemsavgift Folkets Hus.', 0, 0, 200.00, 'ba9c0cd4-86b0-4c8b-87bc-823ef2063be3', '4d8238fb-5de4-4c9f-959a-15e93a3bf5d6');

COMMIT;
