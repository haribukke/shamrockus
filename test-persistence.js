// test-persistence.js
const axios = require('axios');

async function testPersistence() {
    const baseURL = 'http://localhost:3000';
    
    console.log('=== Testing Persistence ===\n');
    
    // 1. Submit some tasks
    console.log('1. Submitting tasks...');
    
    const tasks = [];
    for (let i = 1; i <= 3; i++) {
        const response = await axios.post(`${baseURL}/tasks`, {
            id: `persistence_test_${i}_${Math.random().toString(36).substring(2, 8)}`,
            duration: 2000
        });
        console.log('Response data:', response.data);
        tasks.push(response.data.task.id);
        console.log(`   Submitted task ${response.data.task.id}`);
    }
    
    // 2. Check stats
    console.log('\n2. Checking stats...');
    const stats = await axios.get(`${baseURL}/stats`);
    console.log('   Stats:', stats.data);
    
    // 3. Wait for tasks to start running
    console.log('\n3. Waiting 3 seconds for tasks to start...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 4. CRITICAL: Simulate server crash
    console.log('\n4. SIMULATING SERVER CRASH...');
    console.log('   (Stop the server with Ctrl+C now)');
    console.log('   Then restart the server and continue with step 5.');
    
    return tasks;
}

testPersistence().catch(console.error);