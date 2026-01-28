// test-race-conditions.js
const axios = require('axios');

async function stressTest() {
    const baseURL = 'http://localhost:3000';
    
    console.log('=== Testing Race Condition Prevention ===\n');
    
    // 1. Submit many tasks
    console.log('1. Submitting 20 tasks...');
    const tasks = [];
    
    for (let i = 1; i <= 20; i++) {
        try {
            const response = await axios.post(`${baseURL}/tasks`, {
                id: 'stress_test_task_' + i+ Math.random().toString(36).substring(2, 8),
                duration: 2000 + Math.random() * 3000 // 2-5 seconds
            });
            tasks.push(response.data.task.id);
            console.log(`   Submitted task ${response.data.task.id}`);
        } catch (error) {
            console.error(`   Failed to submit task: ${error.message}`);
        }
        
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // 2. Monitor for race conditions
    console.log('\n2. Monitoring for 15 seconds...');
    const taskExecutions = new Map();
    
    for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const stats = await axios.get(`${baseURL}/stats`);
        const runningTasks = stats.data.taskStats.running;
        const completedTasks = stats.data.taskStats.completed;
        
        console.log(`   Second ${i + 1}: ${runningTasks} running, ${completedTasks} completed`);
        
        // Check for duplicate executions
        const tasksData = await axios.get(`${baseURL}/tasks?limit=100`);
        tasksData.data.tasks.forEach(task => {
            if (task.status === 'RUNNING' || task.status === 'COMPLETED') {
                if (!taskExecutions.has(task.id)) {
                    taskExecutions.set(task.id, {
                        startTime: task.started_at,
                        worker: task.locked_by || 'unknown',
                        executions: 1
                    });
                } else {
                    const record = taskExecutions.get(task.id);
                    record.executions++;
                    taskExecutions.set(task.id, record);
                }
            }
        });
    }
    
    // 3. Check for duplicates
    console.log('\n3. Checking for duplicate executions...');
    let duplicates = 0;
    for (const [taskId, record] of taskExecutions.entries()) {
        if (record.executions > 1) {
            console.log(`   ⚠️  Task ${taskId} executed ${record.executions} times!`);
            duplicates++;
        }
    }
    
    if (duplicates === 0) {
        console.log('   ✅ No duplicate executions detected');
    } else {
        console.log(`   ❌ Found ${duplicates} tasks with duplicate executions`);
    }
    
    // 4. Final stats
    console.log('\n4. Final statistics:');
    const finalStats = await axios.get(`${baseURL}/stats`);
    console.log('   Task stats:', finalStats.data.taskStats);
    console.log('   Coordinator stats:', finalStats.data.coordinatorStats);
    
    // 5. Check locks
    console.log('\n5. Checking lock status...');
    const allTasks = await axios.get(`${baseURL}/tasks?limit=100`);
    const lockedTasks = allTasks.data.tasks.filter(t => t.locked_by);
    console.log(`   Currently locked tasks: ${lockedTasks.length}`);
    
    lockedTasks.forEach(task => {
        console.log(`   - ${task.id}: locked by ${task.locked_by}, until ${task.locked_until}`);
    });
    
    console.log('\n=== Race Condition Test Complete ===');
}

// Run multiple instances to test concurrency
async function runMultipleClients() {
    console.log('=== Simulating Multiple Clients ===\n');
    
    const clientPromises = [];
    
    // Simulate 3 clients submitting tasks simultaneously
    for (let clientId = 1; clientId <= 3; clientId++) {
        const promise = (async () => {
            console.log(`Client ${clientId} starting...`);
            
            for (let i = 1; i <= 5; i++) {
                try {
                    const response = await axios.post('http://localhost:3000/tasks', {
                        id: `client_${clientId}_task_${Math.random().toString(36).substring(2, 8)}`,
                        duration: 1000 + Math.random() * 2000
                    });
                    console.log(`Client ${clientId} submitted task ${response.data.task.id}`);
                } catch (error) {
                    console.error(`Client ${clientId} failed: ${error.message}`);
                }
                
                // Random delay between submissions
                await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
            }
            
            console.log(`Client ${clientId} finished`);
        })();
        
        clientPromises.push(promise);
    }
    
    await Promise.all(clientPromises);
    console.log('\nAll clients finished submitting tasks');
}

// Run tests
async function runTests() {
    await stressTest();
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for tasks to complete
    await runMultipleClients();
}

runTests().catch(console.error);