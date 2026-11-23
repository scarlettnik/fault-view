ALTER TABLE projects ADD COLUMN demo_key text;
UPDATE projects SET demo_key = 'storefront' WHERE is_demo;
ALTER TABLE projects ADD CONSTRAINT projects_demo_key_check
  CHECK (is_demo = (demo_key IS NOT NULL));

DROP INDEX projects_owner_demo_idx;
CREATE UNIQUE INDEX projects_owner_demo_idx ON projects (owner_id, demo_key) WHERE is_demo;
