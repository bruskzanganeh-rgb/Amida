-- Client-side error logging table
CREATE TABLE IF NOT EXISTS client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  error_message text NOT NULL,
  error_stack text,
  component_stack text,
  url text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

-- Anyone can report errors (even unauthenticated via service role)
CREATE POLICY "Anyone can insert errors" ON client_errors
  FOR INSERT WITH CHECK (true);

-- Only service role can read errors
CREATE POLICY "Service role reads errors" ON client_errors
  FOR SELECT TO service_role USING (true);
