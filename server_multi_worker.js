const express = require('express');

const Coordinator = require('./Coordinator');
const { time } = require('node:console');

const app = express();
const port = 3000;

app.use(express.json());

// Create coordinator with multiple workers
const coordinator = new Coordinator({
    workerCount: 2,
    maxConcurrentPerWorker: 2,
    dbPath: './tasks-multi.db'
});

coordinator.start();

app.post('/tasks', async (req, res) => {
    try {
        const taskData = req.body;

        if(!taskData.id || !taskData.duration) {
            return res.status(400).json({ error: 'Task must have an id and duration' });
        }
        const task =  await coordinator.submitTask(taskData);
        console.log(`Task ${task.id} submitted via API`);
        res.status(201).json({
            message: 'Task submitted successfully',
            task: task
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit task', details: error.message });
    }
});

app.get('/tasks/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const task = await coordinator.getTaskStatus(id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve task', details: error.message });
    }
});

app.get('/tasks', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const tasks = await coordinator.getAllTasks(limit);
        res.json({tasks, count: tasks.length});
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve tasks', details: error.message });
    }
});

app.get('/stats', async (req, res) => {
    try {
        const tasks = await coordinator.getAllTasks(10000);
        const coordinatorStats = coordinator.getStats();
        // console.log('tasks in stats:', tasks);
        const runningTasks = tasks.filter(task => task.status === 'RUNNING');
        const completedTasks = tasks.filter(task => task.status === 'COMPLETED');
        const failedTasks = tasks.filter(task => task.status === 'FAILED');
        const pendingTasks = tasks.filter(task => task.status === 'PENDING');
        const queuedTasks = tasks.filter(task => task.status === 'QUEUED');

        const taskStats = {
            total: tasks.length,
            running: runningTasks.length,
            completed: completedTasks.length,
            failed: failedTasks.length,
            pending: pendingTasks.length,
            queued: queuedTasks.length
        };


        res.json({
            coordinatorStats: coordinatorStats,
            taskStats: taskStats,
            timestamp: new Date().toISOString()

        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve stats', details: error.message });
    }
});


app.get('/health', async (req, res) => {
    try {
        // Test database connection
        const testTask = await coordinator.getTaskStatus('nonexistenttask-only-for-health-check');
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            workers: coordinator.getStats().totalWorkers
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error.message
        });
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await coordinator.stop();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await coordinator.stop();
    process.exit(0);
});


app.listen(port, () => {
    console.log(`Task coordinator server running at http://localhost:${port}, and db is persistent at ./tasks-multi.db`);
    console.log(`Workers: ${coordinator.workerCount}, Max Concurrent per Worker: ${coordinator.maxConcurrentPerWorker}`);
    console.log('Endpoints:');
    console.log('  POST   /tasks     - Submit a new task');
    console.log('  GET    /tasks/:id - Get task status');
    console.log('  GET    /tasks     - List all tasks');
    console.log('  GET    /stats     - Get task statistics');
    console.log('  GET    /health    - Health check');
});

