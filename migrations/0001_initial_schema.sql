CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age_at_creation INTEGER NOT NULL,
  profile_created_at INTEGER NOT NULL,
  sex TEXT,
  race TEXT,
  religion TEXT,
  conditions TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  test_name TEXT NOT NULL,
  test_value TEXT NOT NULL,
  test_date TEXT NOT NULL,
  summary TEXT,
  vector_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX idx_test_results_profile ON test_results(profile_id);
CREATE INDEX idx_test_results_date ON test_results(test_date);
