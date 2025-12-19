-- Migration to make profile fields non-nullable and add constraints
-- This enforces that all profiles must have complete information

-- Create a new profiles table with NOT NULL constraints
CREATE TABLE IF NOT EXISTS profiles_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age_at_creation INTEGER NOT NULL CHECK(age_at_creation > 0 AND age_at_creation <= 120),
  profile_created_at INTEGER NOT NULL,
  sex TEXT NOT NULL CHECK(sex IN ('male', 'female', 'other')),
  race TEXT NOT NULL,
  religion TEXT NOT NULL,
  allergies TEXT NOT NULL DEFAULT '',
  conditions TEXT NOT NULL DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch())
);

-- Copy existing data from old table (only complete profiles)
INSERT INTO profiles_new (id, name, age_at_creation, profile_created_at, sex, race, religion, allergies, conditions, created_at)
SELECT 
  id, 
  name, 
  age_at_creation, 
  profile_created_at, 
  COALESCE(sex, 'other') as sex,
  COALESCE(race, 'Not specified') as race,
  COALESCE(religion, 'Not specified') as religion,
  COALESCE(allergies, '') as allergies,
  COALESCE(conditions, '') as conditions,
  created_at
FROM profiles
WHERE name IS NOT NULL AND age_at_creation IS NOT NULL;

-- Drop old table
DROP TABLE profiles;

-- Rename new table to profiles
ALTER TABLE profiles_new RENAME TO profiles;

-- Recreate index for test_results foreign key
CREATE INDEX IF NOT EXISTS idx_test_results_profile ON test_results(profile_id);
CREATE INDEX IF NOT EXISTS idx_test_results_date ON test_results(test_date);

-- Add index on profile name for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name COLLATE NOCASE);
