-- Add a JSON field to store flexible profile data
-- This allows more flexible profile structures without schema changes

ALTER TABLE profiles ADD COLUMN profile_data TEXT;

-- Migrate existing data to JSON format
UPDATE profiles 
SET profile_data = json_object(
  'sex', sex,
  'race', race,
  'religion', religion,
  'allergies', CASE WHEN allergies IS NOT NULL THEN json_array(allergies) ELSE json_array() END,
  'conditions', CASE WHEN conditions IS NOT NULL THEN json_array(conditions) ELSE json_array() END
)
WHERE profile_data IS NULL;
