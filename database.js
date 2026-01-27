// database.js
const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');

class Database {
    constructor(dbPath = './tasks.db') {
        // Open database connection
        this.db = new sqlite3.Database(dbPath);
        
        // Convert callback methods to promises
        this.run = promisify(this.db.run.bind(this.db));
        this.get = promisify(this.db.get.bind(this.db));
        this.all = promisify(this.db.all.bind(this.db));
        
        // Initialize database
        this.init();
    }
    
    async init() {
        // Create tables
        await this.run(`
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
            )
        `);
        
        await this.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
        await this.run('CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)');
        
        console.log('Database initialized');
    }
    
    async createTask(task) {
        const { id, duration, dependencies = [] } = task;
        const status = dependencies.length > 0 ? 'PENDING' : 'QUEUED';
        
        // Store dependencies as JSON string
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
    
    async updateTaskStatus(id, status, data = {}) {
        let query = 'UPDATE tasks SET status = ?';
        const params = [status, id];
        
        if (status === 'RUNNING') {
            query += ', started_at = CURRENT_TIMESTAMP, attempts = attempts + 1';
        } else if (status === 'COMPLETED' || status === 'FAILED') {
            query += ', completed_at = CURRENT_TIMESTAMP';
        }
        
        query += ' WHERE id = ?';
        
        await this.run(query, params);
        return this.getTask(id);
    }
    
    async getReadyTasks(limit = 10) {
        // This is a simplified version - we'll improve it later
        const tasks = await this.all(
            'SELECT * FROM tasks WHERE status = "QUEUED" ORDER BY created_at ASC LIMIT ?',
            [limit]
        );
        
        // Parse JSON dependencies
        return tasks.map(task => {
            if (task.dependencies) {
                task.dependencies = JSON.parse(task.dependencies);
            }
            return task;
        });
    }
    
    async updateDependentTasks(completedTaskId) {
        // Get all tasks that depend on the completed task
        const tasks = await this.all('SELECT * FROM tasks WHERE status = "PENDING"');
        
        for (const task of tasks) {
            if (task.dependencies) {
                const dependencies = JSON.parse(task.dependencies);
                
                if (dependencies.includes(completedTaskId)) {
                    const allDepsCompleted = await Promise.all(
                        dependencies.map(async depId => {
                            const depTask = await this.getTask(depId);
                            return depTask && depTask.status === 'COMPLETED';
                        })
                    );
                    
                    if (allDepsCompleted.every(Boolean)) {
                        await this.updateTaskStatus(task.id, 'QUEUED');
                    }
                }
            }
        }
    }
    
    async resetStaleRunningTasks() {
        // If a task has been RUNNING for too long (e.g., > 5 minutes),
        // reset it to QUEUED (for crash recovery)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        
        await this.run(
            'UPDATE tasks SET status = "QUEUED" WHERE status = "RUNNING" AND started_at < ?',
            [fiveMinutesAgo]
        );
    }
    
    close() {
        this.db.close();
    }
}

module.exports = Database;