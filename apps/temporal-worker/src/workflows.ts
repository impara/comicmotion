// Placeholder for workflow definitions
import * as wf from '@temporalio/workflow';
import type * as activities from './activities'; // Import activity types

// Define the input type for the workflow based on args passed from API route
export interface GenerateAvatarWorkflowInput {
  avatarId: string;
  imageId: string;
  userId: string;
  originalImageUrl: string;
}

// Get activity functions callable from the workflow
const { generateAvatar, markAvatarAsFailed } = wf.proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute', // Timeout for a single activity attempt
  // Configure retries if needed
  retry: {
    // initialInterval: '1 second',
    // maximumAttempts: 3,
  },
});

// Define the main workflow function
// This matches the 'generateAvatarWorkflow' name used in the API route
export async function generateAvatarWorkflow(input: GenerateAvatarWorkflowInput): Promise<string> {
  const avatarId = input.avatarId;
  console.log(`[Workflow:${avatarId}] Started.`);
  
  let generatedAvatarUrl = '';

  try {
    // Step 1: Call the avatar generation activity
    console.log(`[Workflow:${avatarId}] Calling generateAvatar activity...`);
    const result = await generateAvatar(input); // Pass the full input
    generatedAvatarUrl = result.avatarUrl;
    console.log(`[Workflow:${avatarId}] Activity generateAvatar completed. URL: ${generatedAvatarUrl}`);

    // Step 2: TODO - Call scene generation workflow/activity (if part of this workflow)
    // console.log(`[Workflow:${avatarId}] Calling generateScene activity...`);
    // await generateScene(avatarId, generatedAvatarUrl, ...);

    // Step 3: TODO - Call animation workflow/activity (if part of this workflow)
    // console.log(`[Workflow:${avatarId}] Calling generateAnimation activity...`);
    // await generateAnimation(...);

    console.log(`[Workflow:${avatarId}] Completed successfully.`);
    return `Avatar ${avatarId} generation successful. URL: ${generatedAvatarUrl}`;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown workflow error';
    console.error(`[Workflow:${avatarId}] Failed:`, error);

    // Compensation: Mark the avatar as failed in the DB
    try {
      await markAvatarAsFailed(avatarId, errorMessage);
      console.log(`[Workflow:${avatarId}] Compensation: Marked avatar as failed.`);
    } catch (compensationError) {
      console.error(`[Workflow:${avatarId}] CRITICAL: Compensation activity markAvatarAsFailed failed:`, compensationError);
      // Log critical failure, manual intervention might be needed
    }

    // Rethrow the error to mark the workflow run as failed
    throw error;
  }
} 