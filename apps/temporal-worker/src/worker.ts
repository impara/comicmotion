import { Worker } from '@temporalio/worker';
import * as activities from './activities';
// Ensure dotenv is configured early if activities rely on process.env
// import dotenv from 'dotenv';
// dotenv.config({ path: '../.env' }); // Adjust path relative to where worker runs if needed

async function run() {
  // Ensure you have a Temporal server running locally (default: localhost:7233)
  // or configure connection options for Temporal Cloud/other deployments.

  // Step 1: Register Workflows and Activities with the Worker
  // Worker connects to localhost by default and uses the default namespace.
  // Configure the Server connection options and namespace as needed:
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflows'), // Point to the workflow functions
    activities, // Register the imported activities
    taskQueue: 'avatar-generation', // Must match the task queue used in client.workflow.start
    // You might need to configure connection options if not running locally:
    // connection: await NativeConnection.connect({ address: '...' })
    // namespace: 'your-namespace',
  });

  // Step 2: Start accepting tasks on the Task Queue
  console.log('Temporal worker started. Listening on task queue: avatar-generation');
  await worker.run();

  // Optional: Add graceful shutdown logic here if needed
  // For example, listening to process signals
}

run().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
}); 