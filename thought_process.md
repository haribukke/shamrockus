**understanding requirements**

build a system that accepts jobs and processes it concurrenlty

it must 
- accept tasks
- store them
- process and execute them ( with respect to limits and dependencies)
- survives crash and restarts
- have an api to interact with the system to do above things.

If we do all this, and then have good performance of the system, then the task can be understood as completed.

We can check any of the items above, but first lets go with task manager.

### step 1 task processor
**task states**
- PENDING
- QUEUED
- RUNNING
- COMPLETED
- FAILED
- CANCELED (this can be taken in the end if required)

task life cycle is the same as above
Pending -> Queued -> Running -> Completed
Pending -> Queued -> Running -> Failed

[Task.js](./Task.js) handles this. with this we can create tasks and run them.
Now we can write a system that can handle these tasks [SimpleScheduler.js](./SimpleScheduler.js). In this we create a new instance of workers, and then add tasks, and then start them. and keep monitoring their status. output can be verified at [outputlog_simpleScheduler.txt](./outputlog_simpleScheduler.txt)

### step 2 API

Now that we have a simple scheduler, we can write an API on top of it, to consume its methods. We will use express js for it.
`npm init -y`
`npm install express`

we have written a couple of APIs as wrapper to the scheduler and have created a copy of the scheduler as [SimpleSchedulerAPI.js](./SimpleSchedulerAPI.js) and the server is written in [server.js](./server.js)

Endpoints:
  POST   /tasks     - Submit a new task
  GET    /tasks/:id - Get task status
  GET    /tasks     - List all tasks
  GET    /health    - Health check

test cases using

curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "id": "task-a",
    "type": "data_processing", 
    "duration": 2000
  }'

curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "id": "task-b",
    "type": "data_processing",
    "duration": 1000,
    "dependencies": ["task-a"]
  }'

curl -X GET http://localhost:3000/tasks | jq .

### step 3 storage

Right now if we restart there is no way tasks will survive the restart. so we need to store them somewhere. So sqlite is the option.

Why Sqlite - its small, installabled, and no external depdnecies.

`npm install sqlite3`

data model for this would be

task
 - id
 - duration
 - status
 - dependencies
 - created_at
 - started_at
 - completed_at
 - failed_at
 - attempts
 - maxAttempts

Created a new [schema.sql](./schema.sql) file for the db

Created [persistent_server](./persistent_server.js) and [PersistentScheduler](./PersistentScheduler.js) which uses sqlite3 [database](./database.js). all logic that was present in SimpleScheduler using arrays are moved to db.

The first time we run persistent_server, it will fail because there is no db. we have to run it again to start.

wrote two scripts [test-persistence](./test-persistence.js) and [test-recovery](./test-recovery.js) to test them. first rnn test persistence and then test recovery. we will see that tasks are retained.


