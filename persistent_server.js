const express = require('express');

const PersistentScheduler = require('./PersistentScheduler');
const { count } = require('node:console');

const app = express();
const port = 3000;

app.use(express.json());

const scheduler = new PersistentScheduler('./tasks.db', 3);

scheduler.startPolling();

app.post('/tasks', async (req, res) => {
    try {
        const taskData = req.body;

        if(!taskData.id || !taskData.duration) {
            return res.status(400).json({ error: 'Task must have an id and duration' });
        }
        const task =  await scheduler.submitTask(taskData);
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
        const task = await scheduler.getTaskStatus(id);
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
        const tasks = await scheduler.getAllTasks(limit);
        res.json({tasks, count: tasks.length});
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve tasks', details: error.message });
    }
});

app.get('/stats', async (req, res) => {
    try {
        const tasks = await scheduler.getAllTasks(10000);
        // console.log('tasks in stats:', tasks);
        const runningTasks = tasks.filter(task => task.status === 'RUNNING');
        const completedTasks = tasks.filter(task => task.status === 'COMPLETED');
        const failedTasks = tasks.filter(task => task.status === 'FAILED');
        const pendingTasks = tasks.filter(task => task.status === 'PENDING');
        const queuedTasks = tasks.filter(task => task.status === 'QUEUED');

        res.json({
            total: tasks.length,
            running: runningTasks.length,
            completed: completedTasks.length,
            failed: failedTasks.length,
            pending: pendingTasks.length,
            queued: queuedTasks.length
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve stats', details: error.message });
    }
});


app.get('/health', async (req, res) => {
    try {
        // Test database connection
        const testTask = await scheduler.getTaskStatus('nonexistenttask-only-for-health-check');
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected'
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
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    scheduler.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    scheduler.stop();
    process.exit(0);
});


app.listen(port, () => {
    console.log(`Task Scheduler server running at http://localhost:${port}, and db is persistent at ./tasks.db`);
    console.log('Endpoints:');
    console.log('  POST   /tasks     - Submit a new task');
    console.log('  GET    /tasks/:id - Get task status');
    console.log('  GET    /tasks     - List all tasks');
    console.log('  GET    /stats     - Get task statistics');
    console.log('  GET    /health    - Health check');
});

