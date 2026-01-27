class Task {
    constructor(id, duration, dependencies = []) {
        this.id = id;
        this.duration = duration;
        this.dependencies = dependencies; // Array of Task IDs that must be completed before this task
        this.status = 'PENDING'; // possible values: 'pending', 'queued', 'in-progress', 'completed', 'failed'
        this.createdAt = new Date();
        this.startedAt = null;
        this.completedAt = null;
        this.failedAt = null;
        this.attempts = 0;
        this.maxAttempts = 3;
    }

    canRun(allTasks) {
        /**
         * task can run if its not already completed or in-progress,
         * and all its dependencies are completed
         * and it has remaining attempts and has not completed all the attempts
         * */
        if (this.status === 'COMPLETED' || this.status === 'IN_PROGRESS') {
            return false;
        }

        if(this.attempts >= this.maxAttempts) {
            return false;
        }

        for (let depId of this.dependencies) {
            const depTask = allTasks.find(task => task.id === depId);
            if (!depTask || depTask.status !== 'COMPLETED') {
                return false;
            }
        }
        return true;
    }

    start() {   
        this.status = 'IN_PROGRESS';
        this.startedAt = new Date();
        this.attempts += 1;
    }

    complete() {
        this.status = 'COMPLETED';
        this.completedAt = new Date();
    }

    fail() {
        if(this.attempts >= this.maxAttempts) {
            this.status = 'FAILED';
            this.failedAt = new Date();
        } else {
            this.status = 'QUEUED'; // re-queue the task for another attempt
        }   
        this.completedAt = new Date();
    }

}

module.exports = Task;