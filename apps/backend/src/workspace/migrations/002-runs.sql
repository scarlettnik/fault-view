ALTER TABLE projects ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX projects_owner_demo_idx ON projects (owner_id) WHERE is_demo;

CREATE TABLE discoveries (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  state jsonb NOT NULL
);
CREATE INDEX discoveries_project_history_idx ON discoveries (project_id, revision, created_at DESC, id);

CREATE TABLE plans (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  state jsonb NOT NULL
);
CREATE INDEX plans_project_history_idx ON plans (project_id, revision, created_at DESC, id);

CREATE TABLE runs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  state jsonb NOT NULL
);
CREATE INDEX runs_project_history_idx ON runs (project_id, created_at DESC, id);

CREATE TABLE screenshots (
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  name text NOT NULL,
  object_key text NOT NULL UNIQUE,
  bytes integer NOT NULL CHECK (bytes > 0 AND bytes <= 1000000),
  ready boolean NOT NULL DEFAULT false,
  PRIMARY KEY (run_id, name)
);

CREATE TABLE screenshot_deletions (
  object_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION queue_screenshot_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO screenshot_deletions (object_key) VALUES (OLD.object_key) ON CONFLICT DO NOTHING;
  RETURN OLD;
END;
$$;

CREATE TRIGGER delete_screenshot_object
AFTER DELETE ON screenshots FOR EACH ROW EXECUTE FUNCTION queue_screenshot_deletion();
