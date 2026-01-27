CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    duration INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
    dependencies TEXT,  
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);