const DatabaseLocking = require('./database_locking');
const Worker = require('./Worker');

class Coordinator {
    constructor(options = {}) {
        this.dbPath = options.dbPath || './tasks-multi.db';
        this.workerCount = options.workerCount || 2;
        this.maxConcurrentPerWorker = options.maxConcurrentPerWorker || 2;
        
        this.database = null;
        this.workers = [];
        this.isRunning = false;
    }
    
    async start() {
        if (this.isRunning) return;
        
        // Initialize database
        this.database = new DatabaseLocking(this.dbPath);
        
        // Create workers
        for (let i = 0; i < this.workerCount; i++) {
            const worker = new Worker(this.database, {
                workerId: `worker-${i}`,
                maxConcurrent: this.maxConcurrentPerWorker,
                pollInterval: 1000,
                lockTTL: 30
            });
            
            // Set up event listeners
            worker.on('taskStarted', (data) => {
                console.log(`${data.workerId}: Started task ${data.task.id}`);
            });
            
            worker.on('taskCompleted', (data) => {
                console.log(`${data.workerId}: Completed task ${data.task.id}`);
            });
            
            worker.on('taskFailed', (data) => {
                console.log(`${data.workerId}: Failed task ${data.task.id}: ${data.error}`);
            });
            
            worker.on('error', (error) => {
                console.error(`Worker error:`, error);
            });
            
            this.workers.push(worker);
            await worker.start();
        }
        
        this.isRunning = true;
        console.log(`Coordinator started with ${this.workerCount} workers`);
        console.log(`Total concurrent capacity: ${this.workerCount * this.maxConcurrentPerWorker}`);
    }
    
    async stop() {
        if (!this.isRunning) return;
        
        // Stop all workers
        for (const worker of this.workers) {
            worker.stop();
        }
        
        // Close database
        if (this.database) {
            this.database.close();
        }
        
        this.isRunning = false;
        console.log('Coordinator stopped');
    }
    
    async submitTask(taskData) {
        if (!this.database) {
            throw new Error('Coordinator not started');
        }
        
        return this.database.createTask(taskData);
    }
    
    async getTaskStatus(taskId) {
        if (!this.database) {
            throw new Error('Coordinator not started');
        }
        
        return this.database.getTask(taskId);
    }
    
    async getAllTasks(limit = 100) {
        if (!this.database) {
            throw new Error('Coordinator not started');
        }
        
        return this.database.getAllTasks(limit);
    }
    
    getStats() {
        const workerStats = this.workers.map(worker => worker.getStats());
        
        return {
            totalWorkers: this.workers.length,
            totalCapacity: this.workerCount * this.maxConcurrentPerWorker,
            workers: workerStats
        };
    }
}

module.exports = Coordinator;