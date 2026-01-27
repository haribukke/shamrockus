const express = require('express');

const SimpleScheduler = require('./SimpleSchedulerAPI');

const app = express();
const port = 3000;

app.use(express.json());

const scheduler = new SimpleScheduler(3);

app.post('/tasks', (req, res) => {
    try {
        const taskData = req.body;

        if(!taskData.id || !taskData.duration) {
            return res.status(400).json({ error: 'Task must have an id and duration' });
        }
        const task = scheduler.submitTask(taskData);
        res.status(201).json({
            message: 'Task submitted successfully',
            task: task
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit task', details: error.message });
    }
});

app.get('/tasks/:id', (req, res) => {
    try {
        const id = req.params.id;
        const task = scheduler.getTaskStatus(id);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve task', details: error.message });
    }
});

app.get('/tasks', (req, res) => {
    try {
        const tasks = scheduler.getAllTasks();
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve tasks', details: error.message });
    }
});


app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    })
});

setInterval(() => {
    scheduler.runNextBatch();
}, 1000);

app.listen(port, () => {
    console.log(`Task Scheduler server running at http://localhost:${port}`);
    console.log('Endpoints:');
    console.log('  POST   /tasks     - Submit a new task');
    console.log('  GET    /tasks/:id - Get task status');
    console.log('  GET    /tasks     - List all tasks');
    console.log('  GET    /health    - Health check');
});

