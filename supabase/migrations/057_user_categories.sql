-- Migration: user_categories — direct user → category mapping
-- Replaces the user → instrument → category indirection

-- 1. Create user_categories table
CREATE TABLE IF NOT EXISTS user_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES instrument_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_user_categories_user ON user_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_categories_category ON user_categories(category_id);

-- 2. RLS policies
ALTER TABLE user_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own categories"
  ON user_categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories"
  ON user_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories"
  ON user_categories FOR DELETE
  USING (auth.uid() = user_id);

-- Admin policy (service role bypasses RLS anyway, but explicit for clarity)
CREATE POLICY "Service role full access on user_categories"
  ON user_categories FOR ALL
  USING (auth.uid() IS NOT NULL AND is_admin(auth.uid()));

-- 3. Migrate existing data from user_instruments → user_categories
INSERT INTO user_categories (user_id, category_id)
SELECT DISTINCT ui.user_id, i.category_id
FROM user_instruments ui
JOIN instruments i ON ui.instrument_id = i.id
ON CONFLICT DO NOTHING;
