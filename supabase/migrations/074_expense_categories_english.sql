-- Migrate expense.category from Swedish strings to English canonical keys
-- DB should store language-neutral values; display labels are translated in the UI.

-- Core categories (originally in the enum)
UPDATE expenses SET category = 'travel'         WHERE category = 'Resa';
UPDATE expenses SET category = 'food'           WHERE category = 'Mat';
UPDATE expenses SET category = 'hotel'          WHERE category = 'Hotell';
UPDATE expenses SET category = 'instrument'    WHERE category = 'Instrument';
UPDATE expenses SET category = 'sheet_music'    WHERE category = 'Noter';
UPDATE expenses SET category = 'equipment'      WHERE category = 'Utrustning';
UPDATE expenses SET category = 'office'         WHERE category = 'Kontorsmaterial';
UPDATE expenses SET category = 'phone'          WHERE category = 'Telefon';
UPDATE expenses SET category = 'subscription'   WHERE category = 'Prenumeration';
UPDATE expenses SET category = 'accounting'     WHERE category = 'Redovisning';
UPDATE expenses SET category = 'other'          WHERE category = 'Övrigt';

-- Ad-hoc values that users entered in production
UPDATE expenses SET category = 'loan'           WHERE category = 'Lån';
UPDATE expenses SET category = 'bank'           WHERE category = 'Bank';
UPDATE expenses SET category = 'insurance'      WHERE category = 'Försäkring';
UPDATE expenses SET category = 'representation' WHERE category = 'Representation';
UPDATE expenses SET category = 'training'       WHERE category = 'Träning';
UPDATE expenses SET category = 'interest'       WHERE category = 'Ränta';
UPDATE expenses SET category = 'travel'         WHERE category = 'Parkering'; -- parking is a travel expense
UPDATE expenses SET category = 'subcontractor'  WHERE category = 'Musiker';   -- paid musicians are subcontractors

-- Safety net: anything we don't recognize becomes 'other'
UPDATE expenses SET category = 'other'
WHERE category IS NOT NULL AND category NOT IN (
  'travel','food','hotel','instrument','sheet_music','equipment','office',
  'phone','subscription','accounting','loan','bank','insurance','representation',
  'training','interest','subcontractor','other'
);
