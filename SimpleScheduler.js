const Task = require('./Task');

class SimpleScheduler {
    constructor(maxConcurrent = 3) {
        this.maxConcurrent = maxConcurrent;
        this.tasks = new Map(); 
        this.runningTasks = new Set(); 
        this.taskQueue = []; 
    }

    submitTask(taskData) {
        const task = new Task(taskData.id, taskData.duration, taskData.dependencies);
        task.status = task.dependencies.length > 0 ? 'PENDING' : 'QUEUED'; 
        this.tasks.set(task.id, task);

        if (task.status === 'QUEUED') {
            this.taskQueue.push(task);
        }

        return task;
    }

    getReadyTasks() {
        const readyTasks = [];

        for(const [taskId, task] of this.tasks) {
            if (task.canRun(Array.from(this.tasks.values()))) {
                readyTasks.push(task);
            }
        }

        return readyTasks.sort((a, b) => a.createdAt - b.createdAt);
    }

    runNextBatch() {
        /**
         * find out if any slots are available to run tasks, if nothing available return
         * else get tasks from the queue for the available slots and execute them
         */
        const availableSlots = this.maxConcurrent - this.runningTasks.size;
        if (availableSlots <= 0) {
            return;
        }

        const readyTasks = this.getReadyTasks();
        const tasksToRun = readyTasks.slice(0, availableSlots);

        for (let task of tasksToRun) {
            this.executeTask(task);
        }

    }

    executeTask(task) {
        /**
         * start the task, simulate its execution with setTimeout
         * on completion, mark it as complete and update dependent tasks
         * on failure, mark it as failed and re-queue if attempts remain
         */
        console.log(`Starting task ${task.id}`);
        task.start();
        this.runningTasks.add(task.id);

        setTimeout(() => {
            const shouldFail = Math.random() < 0.2; // 80% chance of success

            if (shouldFail) {
                console.log(`Task ${task.id} failed`);
                task.fail();
                if( task.attempts < task.maxAttempts) {
                    this.taskQueue.push(task); // re-queue the task
                } else {
                    this.updateDependentTasks(task.id);
                }
            } else {
                console.log(`Task ${task.id} completed`);
                task.complete();
                this.updateDependentTasks(task.id);
            }

            this.runningTasks.delete(task.id);
            this.runNextBatch();
        }, task.duration);  

    }

    updateDependentTasks(completedTaskId) {
        /**
         * loop through all tasks, and check if their status is Pending and if their dependencies include the completedTaskId
         * if yes, then check if all dependencies are completed, if yes, change status to QUEUED and add to taskQueue
         */
        for(const [taskId, task] of this.tasks) {
            if(task.dependencies.includes(completedTaskId) && task.status === 'PENDING') {
                const allDepenedenciesCompleted = task.dependencies.every(depId => {
                    const depTask = this.getTaskStatus(depId);
                    return depTask && depTask.status === 'COMPLETED';
                });

                if(allDepenedenciesCompleted) {
                    task.status = 'QUEUED';
                    this.taskQueue.push(task);
                }
            }
        }   
    }

    getTaskStatus(taskId) {
        return this.tasks.get(taskId);
    }

    getAllTasks() {
        return Array.from(this.tasks.values());
    }



}

module.exports = SimpleScheduler;

const scheduler = new SimpleScheduler(2);

scheduler.submitTask({ id: 'task1', duration: 2000, dependencies: [] });
scheduler.submitTask({ id: 'task2', duration: 1000, dependencies: ['task1'] });
scheduler.submitTask({ id: 'task3', duration: 1500, dependencies: ['task1'] });
scheduler.submitTask({ id: 'task4', duration: 500, dependencies: ['task2', 'task3'] });

console.log('Initial task statuses:', scheduler.getAllTasks());

setInterval(() => {
    scheduler.runNextBatch();
}, 1000);

setInterval(() => {
    console.log('current status');
    scheduler.getAllTasks().forEach(task => {
        console.log(task.id, task.status);
    });
}, 3000);