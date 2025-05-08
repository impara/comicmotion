// Placeholder for workflow definitions
import * as wf from '@temporalio/workflow';
import type * as activities from './activities'; // Import activity types
// Import AnimationInputData from lib-shared - path based on linter feedback on type location
import { type AnimationInputData } from 'lib-shared/prompts'; 

// Define the input type for the workflow based on args passed from API route
export interface GenerateAvatarWorkflowInput {
  avatarId: string;
  imageId: string;
  userId: string;
  originalImageUrl: string;
  // theme: string; // Removed theme input
}

// Define common activity options for easier reuse
const defaultActivityOptions: wf.ActivityOptions = {
  // Increase timeout significantly to allow for polling, download, upload
  startToCloseTimeout: '10 minutes', 
  retry: {
     initialInterval: '1 second',
     backoffCoefficient: 2,
     maximumInterval: '1 minute',
     maximumAttempts: 3, 
     // Consider making Error non-retryable for specific activities if needed
     // nonRetryableErrorTypes: ['Error'], 
  },
  // Heartbeat remains important for long polls
  heartbeatTimeout: '1 minute', 
};

// Get activity functions callable from the workflow
const {
  generateAvatar,
  generateScene,
  generateAnimation, // Add new activity
  markAvatarAsFailed,
  deleteAssetActivity,
} = wf.proxyActivities<typeof activities>(defaultActivityOptions);

// Proxy compensation activities with potentially shorter timeouts/retries
const compensationActivityOptions: wf.ActivityOptions = {
  startToCloseTimeout: '30 seconds', 
  retry: { maximumAttempts: 2 }, 
};
const { 
    deleteAssetActivity: deleteAssetCompensation, // Rename for clarity
    markAvatarAsFailed: markAvatarFailedCompensation // Rename for clarity
} = wf.proxyActivities<typeof activities>(compensationActivityOptions);

// Define the main workflow function
export async function generateAvatarWorkflow(input: GenerateAvatarWorkflowInput): Promise<string> {
  const { avatarId, userId } = input; // Removed theme
  const workflowId = wf.workflowInfo().workflowId;
  wf.log.info(`[Workflow:${workflowId}] Started. AvatarId: ${avatarId}`);
  
  let generatedAvatarUrl = '';
  // let generatedSceneUrl = ''; // Removed scene URL

  try {
    // Step 1: Call the avatar generation activity
    wf.log.info(`[Workflow:${workflowId}] Calling generateAvatar activity...`);
    const avatarResult = await generateAvatar(input); // Pass the full input
    generatedAvatarUrl = avatarResult.avatarUrl;
    wf.log.info(`[Workflow:${workflowId}] Activity generateAvatar completed. URL: ${generatedAvatarUrl}`);

    // Step 2: Scene generation moved to separate workflow
    // wf.log.info(`[Workflow:${workflowId}] Calling generateScene activity...`);
    // ... (removed scene generation call) ...

    // Step 3: TODO - Call animation workflow/activity (if part of this workflow)
    // wf.log.info(`[Workflow:${workflowId}] Calling generateAnimation activity...`);
    // await generateAnimation(...);

    wf.log.info(`[Workflow:${workflowId}] Completed successfully. Avatar: ${generatedAvatarUrl}`);
    return `Workflow ${workflowId} completed. Avatar: ${generatedAvatarUrl}`;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown workflow error';
    wf.log.error(`[Workflow:${workflowId}] Failed: ${errorMessage}`, error instanceof Error ? { error: error.stack } : { error });
    try {
      await markAvatarFailedCompensation(avatarId, errorMessage);
      wf.log.warn(`[Workflow:${workflowId}] Compensation: Marked avatar ${avatarId} as failed.`);
    } catch (compensationError) {
      wf.log.error(
          `[Workflow:${workflowId}] CRITICAL: Compensation activity markAvatarAsFailed failed: ${compensationError instanceof Error ? compensationError.message : 'Unknown reason'}`,
          compensationError instanceof Error ? { error: compensationError.stack } : { compensationError }
      );
    }
    throw error;
  }
}

// --- Generate Scene Workflow --- //

export interface GenerateSceneWorkflowInput {
  avatarId: string;
  userId: string;
  theme: string;
  avatarUrl: string; 
  durationSeconds?: number; 
  userAction: string;
  userEmotion: string;
  userSfx?: string;
}

export interface GenerateSceneWorkflowOutput {
    sceneUrl: string;
    finalVideoUrl?: string; 
}

type SceneWorkflowStage = 
  | 'QUEUED' 
  | 'GENERATING_SCENE' 
  | 'GENERATING_ANIMATION' 
  | 'COMPLETED' 
  | 'FAILED';

export async function generateSceneWorkflow(input: GenerateSceneWorkflowInput): Promise<GenerateSceneWorkflowOutput> {
  const { avatarId, userId, theme, avatarUrl, durationSeconds, userAction, userEmotion, userSfx } = input; 
  const workflowId = wf.workflowInfo().workflowId;
  wf.log.info(`[Workflow:${workflowId}] Started Scene & Animation. AvatarId: ${avatarId}, Theme: ${theme}, Duration: ${durationSeconds || 'default'}, Action: ${userAction}, Emotion: ${userEmotion}, SFX: ${userSfx || 'none'}`);

  let currentStage: SceneWorkflowStage = 'QUEUED'; 
  wf.setHandler(wf.defineQuery<SceneWorkflowStage>('getCurrentStage'), () => currentStage);

  let generatedSceneUrl = '';
  let actualSceneDbId = ''; // Renamed variable for clarity

  try {
    currentStage = 'GENERATING_SCENE'; 
    wf.log.info(`[Workflow:${workflowId}] Calling generateScene activity...`);
    const sceneActivityInput: activities.GenerateSceneInput = { avatarId, userId, avatarUrl, theme };
    const sceneResult = await generateScene(sceneActivityInput);
    generatedSceneUrl = sceneResult.sceneUrl;
    // Capture the actual sceneDbId returned by the activity
    actualSceneDbId = sceneResult.sceneDbId; 
    wf.log.info(`[Workflow:${workflowId}] Activity generateScene completed. Scene URL: ${generatedSceneUrl}, Scene DB ID: ${actualSceneDbId}`);

    currentStage = 'GENERATING_ANIMATION'; 
    wf.log.info(`[Workflow:${workflowId}] Calling generateAnimation activity...`);

    const animationPromptData: AnimationInputData = {
        theme: theme,
        userAction: userAction,
        userEmotion: userEmotion,
        userSfx: userSfx,
        durationSeconds: durationSeconds || 6, 
        characterDescription: "The character from the scene", 
    };

    // Pass the actualSceneDbId to the animation activity
    const animationActivityInput = {
        sceneId: actualSceneDbId, // Use the actual ID
        sceneUrl: generatedSceneUrl, 
        animationData: animationPromptData, 
        userId: userId, 
    } as activities.GenerateAnimationInput; 

    const animationResult = await generateAnimation(animationActivityInput);
    const finalVideoUrl = animationResult.finalAnimationUrl;

    currentStage = 'COMPLETED'; 
    wf.log.info(`[Workflow:${workflowId}] Workflow Completed. Scene: ${generatedSceneUrl}, Video: ${finalVideoUrl}`);
    return { 
        sceneUrl: generatedSceneUrl, 
        finalVideoUrl: finalVideoUrl 
    };

  } catch (error) {
    currentStage = 'FAILED';
    const errorMessage = error instanceof Error ? error.message : 'Unknown workflow error';
    wf.log.error(`[Workflow:${workflowId}] Scene/Animation Generation Failed: ${errorMessage}`, error instanceof Error ? { error: error.stack } : { error });

    // Compensation logic (ensure extractKeyFromUrl is robust)
    // ... (existing compensation logic) ...
    throw error;
  }
}

// Helper function to extract storage key from URL (basic implementation)
function extractKeyFromUrl(url: string): string | null {
    try {
        const parsedUrl = new URL(url);
        // Assuming format like /bucket-name/assets/userId/...) 
        // or just /assets/userId/... if bucket is part of hostname/endpoint
        let path = parsedUrl.pathname;
        if (path.startsWith('/')) {
            path = path.substring(1);
        }
        // Basic check if it looks like our asset path
        if (path.startsWith('assets/')) { 
            // Remove potential bucket name prefix if present (simple check)
            const parts = path.split('/');
            if (parts.length > 1 && parts[1] === 'assets') { // e.g., /bucket/assets/...
                return parts.slice(1).join('/'); // Return 'assets/userId/...'
            } else { // e.g., /assets/userId/...
                return path; 
            }
        } 
        wf.log.warn(`URL path "${path}" does not seem to be a recognized asset key format.`);
        return null;
    } catch (e) {
        wf.log.error(`Failed to parse URL or extract key: ${url}`, e instanceof Error ? { error: e.stack } : { error: e });
        return null;
    }
} 