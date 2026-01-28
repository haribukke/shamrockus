const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');

class DatabaseLocking {
    constructor(dbPath = './tasks.db') {
        console.log(`Initializing enhanced database at ${dbPath} with locking support`);
        this.db = new sqlite3.Database(dbPath);
        this.db.on('error', (err) => {
            console.error('Database error:', err);
        });
        this.init();
    }

    // Helper method to promisify db.run with access to changes
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this); // 'this' contains lastID and changes
            });
        });
    }
    
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
    
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
    
    async init() {
        
        await this.run(`
            CREATE TABLE if not exists tasks (
                id TEXT PRIMARY KEY,
                duration INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
                dependencies TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                failed_at TIMESTAMP,
                attempts INTEGER DEFAULT 0,
                max_attempts INTEGER DEFAULT 3,
                locked_by TEXT,
                locked_until TIMESTAMP,
                version INTEGER DEFAULT 0
            )
        `);

        console.log('Created tasks table with locking columns');
        
        await this.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
        await this.run('CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)');
        await this.run('CREATE INDEX IF NOT EXISTS idx_tasks_locked ON tasks(locked_by, locked_until)');
        
        console.log('Enhanced database initialized with locking support');
    }
    
    async createTask(task) {
        const { id, duration, dependencies = [] } = task;
        const status = dependencies.length > 0 ? 'PENDING' : 'QUEUED';
        const dependenciesJson = JSON.stringify(dependencies);
        
        await this.run(
            'INSERT INTO tasks (id, duration, status, dependencies) VALUES (?, ?, ?, ?)',
            [id, duration, status, dependenciesJson]
        );
        
        return this.getTask(id);
    }
    
    async getTask(id) {
        const task = await this.get('SELECT * FROM tasks WHERE id = ?', [id]);
        if (task && task.dependencies) {
            task.dependencies = JSON.parse(task.dependencies);
        }
        return task;
    }
    
    async getAllTasks(limit = 100) {
        const tasks = await this.all(
            'SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?',
            [limit]
        );
        
        return tasks.map(task => {
            if (task.dependencies) {
                task.dependencies = JSON.parse(task.dependencies);
            }
            return task;
        });
    }
    
    async acquireLock(taskId, workerId, ttlSeconds = 30) {
        // Use optimistic locking: try to acquire lock if not already locked or lock expired
        const now = Math.floor(Date.now() / 1000);
        const lockedUntil = now + ttlSeconds;
        
        const result = await this.run(
            `UPDATE tasks 
             SET locked_by = ?, locked_until = ?, version = version + 1
             WHERE id = ? 
             AND (locked_by IS NULL OR locked_until < ?)
             AND status IN ('QUEUED', 'PENDING')`,
            [workerId, lockedUntil, taskId, now]
        );
        
        return result.changes > 0;
    }
    
    async releaseLock(taskId) {
        await this.run(
            'UPDATE tasks SET locked_by = NULL, locked_until = NULL WHERE id = ?',
            [taskId]
        );
    }
    
    async updateTaskStatus(taskId, status, options = {}) {
        const { workerId = null, force = false } = options;
        let query = 'UPDATE tasks SET status = ?, version = version + 1';
        const params = [status, taskId];
        
        if (status === 'RUNNING') {
            query += ', started_at = CURRENT_TIMESTAMP, attempts = attempts + 1';
            if (workerId) {
                query += ', locked_by = ?';
                params.splice(1, 0, workerId);
            }
        } else if (status === 'COMPLETED' || status === 'FAILED') {
            query += ', completed_at = CURRENT_TIMESTAMP, locked_by = NULL, locked_until = NULL';
        }
        
        if (workerId && !force) {
            query += ' WHERE id = ? AND (locked_by = ? OR ?)';
            params.push(workerId, force);
        } else {
            query += ' WHERE id = ?';
        }
        
        await this.run(query, params);
        return this.getTask(taskId);
    }
    
    async getReadyTasks(workerId, limit = 10) {
        // Get tasks that are ready to run and not locked (or locked by this worker)
        const now = Math.floor(Date.now() / 1000);
        
        const tasks = await this.all(`
            SELECT * FROM tasks 
            WHERE status IN ('QUEUED', 'PENDING')
            AND (locked_by IS NULL OR locked_by = ? OR locked_until < ?)
            ORDER BY 
                CASE 
                    WHEN status = 'QUEUED' THEN 1
                    WHEN status = 'PENDING' THEN 2
                    ELSE 3
                END,
                created_at ASC
            LIMIT ?
        `, [workerId, now, limit]);
        
        return tasks.map(task => {
            if (task.dependencies) {
                task.dependencies = JSON.parse(task.dependencies);
            }
            return task;
        });
    }
    
    async checkDependencies(task) {
        if (!task.dependencies || task.dependencies.length === 0) {
            return true;
        }
        
        const placeholders = task.dependencies.map(() => '?').join(',');
        const query = `
            SELECT COUNT(*) as count 
            FROM tasks 
            WHERE id IN (${placeholders}) 
            AND status = 'COMPLETED'
        `;
        
        const result = await this.get(query, task.dependencies);
        return result.count === task.dependencies.length;
    }
    
    async resetStaleLocks(maxAgeSeconds = 60) {
        const now = Math.floor(Date.now() / 1000);
        const staleTime = now - maxAgeSeconds;
        
        await this.run(
            `UPDATE tasks 
             SET locked_by = NULL, locked_until = NULL, status = 'QUEUED'
             WHERE status = 'RUNNING' 
             AND locked_until < ?`,
            [staleTime]
        );
        
        const result = await this.run(
            `UPDATE tasks 
             SET locked_by = NULL, locked_until = NULL
             WHERE locked_by IS NOT NULL 
             AND locked_until < ?`,
            [now]
        );
        
        return result?.changes || 0;
    }
    
    close() {
        this.db.close();
    }
}

module.exports = DatabaseLocking;