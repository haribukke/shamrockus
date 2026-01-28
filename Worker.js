const EventEmitter = require('events');
const { uuidv4 } = require('uuid');

class Worker extends EventEmitter{
    constructor(dbPath, options = {}) {
        super();
        this.db = dbPath;
        this.workerId = options.workerId || uuidv4();
        this.maxConcurrent = options.maxConcurrent || 3;
        this.pollInterval = options.pollInterval || 1000;
        this.lockTTL = options.lockTTL || 30000;

        this.runningTasks = new Map(); 
        this.isRunning = false;
        this.pollTimer = null;
        this.cleanupTimer = null;

        console.log(`Worker ${this.workerId} initialized`);
    }

    async start() {
        if(this.isRunning) return;

        this.isRunning = true;

        const resetCount = await this.db.resetStaleLocks();
        if(resetCount > 0) {
            console.log(`Worker ${this.workerId} recovered ${resetCount} stale RUNNING tasks to QUEUED`);
        }

        this.pollTimer = setInterval(() => {
            this.poll();
        }, this.pollInterval);

        this.cleanupTimer = setInterval(() => {
            const count = this.db.resetStaleLocks();
            if(count > 0) {
                console.log(`Worker ${this.workerId} cleaned up ${count} stale RUNNING tasks`);
            }

        }, this.lockTTL);

        console.log(`Worker ${this.workerId} started`);
    }

    stop() {
        this.isRunning = false;
        clearInterval(this.pollTimer);
        clearInterval(this.cleanupTimer);

        this.releaseAllLocks();
        console.log(`Worker ${this.workerId} stopped`);
    }

    async recoverFromCrash() {
        /**
         * on startup, check for tasks that were RUNNING and mark them as QUEUED
         * this allows the scheduler to pick them up again
         */
        await this.db.resetStaleLocks();
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

    async poll() {
        /**
         * find out if any slots are available to run tasks, if nothing available return
         * else get tasks from the queue for the available slots and execute them
         */
        if(this.runningTasks.size >= this.maxConcurrent) {
            return;
        }

        const availableSlots = this.maxConcurrent - this.runningTasks.size;
        if (availableSlots <= 0) {
            return;
        }
        try {
            const readyTasks = await this.db.getReadyTasks(this.workerId, availableSlots * 2);

            for (let task of readyTasks) {
                if (this.runningTasks.size >= this.maxConcurrent) {
                    break;
                }

                const depsMet = await this.db.checkDependencies(task);
                if (!depsMet) {
                    continue;
                }

                const lockAcquired = await this.db.acquireLock(task.id, this.workerId, this.lockTTL);
                if (lockAcquired) {
                    console.log(`Worker ${this.workerId} locked task ${task.id} for execution`);
                    await this.executeTask(task);
                }   

            }
        } catch (error) {
            this.emit('error', error);
            console.error(`Worker ${this.workerId} encountered error during polling:`, error.message);
        }

    }

    async executeTask(task) {

        try {
            await this.db.updateTaskStatus(task.id, 'RUNNING', { workerId: this.workerId });
            console.log(`Worker ${this.workerId} started task ${task.id}`);

            this.runningTasks.set(task.id, {
                task,
                startTime: Date.now(),
                timeout: null,
                lockRefreshInterval: null
            });

            this.startLockRefresh(task.id);
            console.log(`Worker ${this.workerId} refreshing lock for task ${task.id}`);
            this.emit('taskStarted', {task, workerId: this.workerId});

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
            await this.db.releaseLock(task.id);
        }

    }

    async startLockRefresh(taskId) {
        const taskInfo = this.runningTasks.get(taskId);
        if (!taskInfo) {
            return;
        }

        const interval = setInterval(async () => {
            try {
                const now = Math.floor(Date.now() / 1000);
                const lockedUntil = now + this.lockTTL;
                
                await this.db.run(
                    `UPDATE tasks 
                     SET locked_by = ?, locked_until = ?
                     WHERE id = ? 
                     AND (locked_by = ?)`,
                    [this.workerId, lockedUntil, taskId, this.workerId]
                );
            } catch (error) {
                console.log(`Worker ${this.workerId} failed to refresh lock on task ${taskId}`);
            }

        }, this.lockTTL / 2);

        taskInfo.lockRefreshInterval = interval;

    }

    async handleTaskCompletion(task) {
        try {
            await this.db.updateTaskStatus(task.id, 'COMPLETED', { workerId: this.workerId, force: true });
            this.cleanupTask(task.id);
            this.runningTasks.delete(task.id);

            console.log(`Worker ${this.workerId} completed task ${task.id}`);
            this.emit('taskCompleted', { workerId: this.workerId, task });

            await this.updateDependentTasks(task.id);
            
        } catch (error) {
            console.error(`Error completing task ${task.id}:`, error.message);
        }
    }

    async handleTaskFailure(task, errorMsg = '') {
        try {
            const currentTask = await this.db.getTask(task.id);
            
            if (currentTask.attempts >= currentTask.max_attempts) {
                await this.db.updateTaskStatus(task.id, 'FAILED', { 
                    workerId: this.workerId,
                    force: true 
                });
                console.log(`Worker ${this.workerId} task ${task.id} failed permanently`);
                this.emit('taskFailed', { workerId: this.workerId, task, error: errorMsg });
            } else {
                await this.db.updateTaskStatus(task.id, 'QUEUED', { 
                    workerId: this.workerId,
                    force: true 
                });
                console.log(`Worker ${this.workerId} task ${task.id} queued for retry`);
                this.emit('taskRetry', { workerId: this.workerId, task, error: errorMsg });
            }
            
            this.cleanupTask(task.id);
            this.runningTasks.delete(task.id);
            
        } catch (error) {
            console.error(`Worker ${this.workerId} failed to handle failure for ${task.id}:`, error);
        }
    }

    async updateDependentTasks(completedTaskId) {
        try {
            // Get all waiting tasks
            const waitingTasks = await this.db.all(
                'SELECT * FROM tasks WHERE status = "PENDING"'
            );
            
            for (const task of waitingTasks) {
                if (task.dependencies) {
                    const dependencies = JSON.parse(task.dependencies);
                    
                    if (dependencies.includes(completedTaskId)) {
                        // Check if all dependencies are now completed
                        const allCompleted = await Promise.all(
                            dependencies.map(async depId => {
                                const depTask = await this.db.getTask(depId);
                                return depTask && depTask.status === 'COMPLETED';
                            })
                        );
                        
                        if (allCompleted.every(Boolean)) {
                            await this.db.updateTaskStatus(task.id, 'QUEUED');
                            console.log(`Task ${task.id} promoted to QUEUED`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Worker ${this.workerId} failed to update dependent tasks:`, error);
        }
    }

    cleanupTask(taskId) {
        const taskInfo = this.runningTasks.get(taskId);
        if (!taskInfo) return;
        
        if (taskInfo.timeout) clearTimeout(taskInfo.timeout);
        if (taskInfo.lockRefreshInterval) clearInterval(taskInfo.lockRefreshInterval);
        
        // Release lock
        this.db.releaseLock(taskId).catch(console.error);
    }

    async releaseAllLocks() {
        try {
            await this.db.run(
                'UPDATE tasks SET locked_by = NULL, locked_until = NULL WHERE locked_by = ?',
                [this.workerId]
            );
            console.log(`Worker ${this.workerId} released all locks`);
        } catch (error) {
            console.error(
                `Error releasing locks for worker ${this.workerId}:`,
                error.message   
            )
        }
    }

    getStats() {
        return {
            runningTasks: this.runningTasks.size,
            maxConcurrent: this.maxConcurrent,
            workerId: this.workerId
        };
    }

}

module.exports = Worker;
