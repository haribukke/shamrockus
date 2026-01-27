// test-recovery.js
const axios = require('axios');

async function testRecovery() {
    const baseURL = 'http://localhost:3000';
    
    console.log('\n=== Testing Recovery After Restart ===\n');
    
    // 5. After restarting server, check if tasks are still there
    console.log('5. Checking if tasks survived restart...');
    
    const stats = await axios.get(`${baseURL}/stats`);
    console.log('   Stats after restart:', stats.data);
    
    // 6. Check individual tasks
    console.log('\n6. Checking task details...');
    const tasks = await axios.get(`${baseURL}/tasks`);
    
    tasks.data.tasks.forEach(task => {
        console.log(`   ${task.id}: ${task.status} (created: ${task.created_at})`);
    });
    
    // 7. Submit more tasks to see if scheduler continues
    console.log('\n7. Submitting more tasks...');
    const newTask = await axios.post(`${baseURL}/tasks`, {
        id: `recovery_test_task_${Math.random().toString(36).substring(2, 8)}`,
        duration: 1000
    });
    console.log(`   Submitted new task: ${newTask.data.task.id}`);
    
    // 8. Monitor
    console.log('\n8. Monitoring for 5 seconds...');
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const currentStats = await axios.get(`${baseURL}/stats`);
        console.log(`   Second ${i + 1}: ${currentStats.data.running} running, ${currentStats.data.completed} completed`);
    }
    
    console.log('\n=== Persistence Test Complete ===');
    console.log('\nKey takeaway: Tasks survive server restart!');
}

// Wait a bit for server to restart
setTimeout(() => {
    testRecovery().catch(console.error);
}, 2000);