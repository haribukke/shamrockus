const Database = require('./database');

class PersistentScheduler {
    constructor(dbPath = './tasks.db', maxConcurrent = 3) {
        this.db = new Database(dbPath);
        this.maxConcurrent = maxConcurrent;
        this.runningTasks = new Map(); 
       
        this.recoverFromCrash();

        console.log('PersistentScheduler initialized');
    }

    async recoverFromCrash() {
        /**
         * on startup, check for tasks that were RUNNING and mark them as QUEUED
         * this allows the scheduler to pick them up again
         */
        await this.db.resetStaleRunningTasks();
        console.log('Recovered from crash, stale RUNNING tasks reset to QUEUED');
    }

    async submitTask(taskData) {
        const task = await this.db.createTask(taskData);
        console.log(`Created task ${task.id} with status ${task.status}`);
        return task;
    }

    async getReadyTasks() {
        const readyTasks = await this.db.getReadyTasks(this.maxConcurrent * 2); // fetch more than maxConcurrent to have buffer

        const tasksWithMetDeps = [];
        for(const task of readyTasks) {
            if(await this.depMet(task)){
                tasksWithMetDeps.push(task);
            }
        }

        return tasksWithMetDeps.slice(0, this.maxConcurrent);
    }

    async depMet(task) {
        if(!task.dependencies || task.dependencies.length === 0) {
            return true;
        }

        for(const depId of task.dependencies) {
            const depTask = await this.db.getTask(depId);
            if(!depTask || depTask.status !== 'COMPLETED') {
                return false;
            }
        }
        return true
    }

    async runNextBatch() {
        /**
         * find out if any slots are available to run tasks, if nothing available return
         * else get tasks from the queue for the available slots and execute them
         */
        const availableSlots = this.maxConcurrent - this.runningTasks.size;
        if (availableSlots <= 0) {
            return;
        }

        const readyTasks = await this.getReadyTasks();
        const tasksToRun = readyTasks.slice(0, availableSlots);

        for (let task of tasksToRun) {
           await this.executeTask(task);
        }

    }

    async executeTask(task) {
        /**
         * start the task, simulate its execution with setTimeout
         * on completion, mark it as complete and update dependent tasks
         * on failure, mark it as failed and re-queue if attempts remain
         */
        try {
            await this.db.updateTaskStatus(task.id, 'RUNNING');

            this.runningTasks.set(task.id, {
                startTime: Date.now(),
                timeout: null
            });

            const timeout = setTimeout(async () => {
                try {
                    const shouldFail = Math.random() < 0.1 && task.attempts < task.max_attempts;
                    
                    if (shouldFail) {
                        console.log(`Task ${task.id} failed, will retry`);
                        await this.handleTaskFailure(task);
                    } else {
                        console.log(`Task ${task.id} completed`);
                        await this.handleTaskCompletion(task);
                    }
                } catch (error) {
                    console.error(`Error processing task ${task.id}:`, error);
                    await this.handleTaskFailure(task, error.message);
                }
               
            }, task.duration);  

            this.runningTasks.get(task.id).timeout = timeout;
        } catch (error) {
            console.error(`Error updating task status: ${error.message}`);
            return;
        }

    }

    async handleTaskCompletion(task) {
        await this.db.updateTaskStatus(task.id, 'COMPLETED');
        this.runningTasks.delete(task.id);
        await this.db.updateDependentTasks(task.id);
    }

    async handleTaskFailure(task, errorMsg = '') {
        const currentTask = await this.db.getTask(task.id);
        if (currentTask.attempts >= currentTask.max_attempts) {
            await this.db.updateTaskStatus(task.id, 'FAILED');
            console.log(`Task ${task.id} failed permanently after ${currentTask.attempts} attempts`);
        } else {
            await this.db.updateTaskStatus(task.id, 'QUEUED');
            console.log(`Task ${task.id} queued for retry (attempt ${currentTask.attempts + 1})`);
        }
        this.runningTasks.delete(task.id);
    }

    startPolling(intervalMs = 1000) {
        setInterval(() => {
            this.runNextBatch();
        }, intervalMs);
    }

    stop() {
        // Clear any pending timeouts
        for (const [taskId, taskInfo] of this.runningTasks) {
            if (taskInfo.timeout) {
                clearTimeout(taskInfo.timeout);
            }
        }
        
        this.db.close();
        console.log('Scheduler stopped');
    }

    getTaskStatus(taskId) {
        return this.db.getTask(taskId);
    }

    getAllTasks(limit = 100) {
        return this.db.getAllTasks(limit);
    }

}

module.exports = PersistentScheduler;
