-- Add new fields to support additional dietary preferences
ALTER TABLE profiles ADD COLUMN meat_choice TEXT;
ALTER TABLE profiles ADD COLUMN food_exclusions TEXT;
