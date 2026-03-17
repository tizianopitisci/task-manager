-- 1. Crea la tabella maps
CREATE TABLE IF NOT EXISTS maps (
  id   bigserial PRIMARY KEY,
  name text      NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Inserisci la mappa esistente come mappa 1
INSERT INTO maps (id, name) VALUES (1, 'Casa & Famiglia')
  ON CONFLICT (id) DO NOTHING;

-- 3. Aggiunge map_id a tasks (nullable inizialmente per sicurezza)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS map_id bigint REFERENCES maps(id);

-- 4. Tutti i task esistenti appartengono alla mappa 1
UPDATE tasks SET map_id = 1 WHERE map_id IS NULL;

-- 5. Rende map_id obbligatorio con default 1
ALTER TABLE tasks ALTER COLUMN map_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN map_id SET DEFAULT 1;

-- 6. Indice per performance
CREATE INDEX IF NOT EXISTS tasks_map_id_idx ON tasks(map_id);
