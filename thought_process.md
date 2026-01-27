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

