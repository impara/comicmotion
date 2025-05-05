// Placeholder for workflow definitions
import * as wf from '@temporalio/workflow';
import type * as activities from './activities'; // Import activity types

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
  avatarUrl: string; // Need the URL to pass to the activity
  durationSeconds?: number; // Add duration here
}

export interface GenerateSceneWorkflowOutput {
    sceneUrl: string;
    // animationPredictionId?: string; // No longer needed from workflow output
    finalVideoUrl?: string; // If animation completes here
}

// Define possible stages for the scene/animation workflow
type SceneWorkflowStage = 
  | 'QUEUED' 
  | 'GENERATING_SCENE' 
  | 'GENERATING_ANIMATION' 
  | 'COMPLETED' 
  | 'FAILED';

export async function generateSceneWorkflow(input: GenerateSceneWorkflowInput): Promise<GenerateSceneWorkflowOutput> {
  const { avatarId, userId, theme, avatarUrl, durationSeconds } = input; 
  const workflowId = wf.workflowInfo().workflowId;
  wf.log.info(`[Workflow:${workflowId}] Started Scene & Animation Generation. AvatarId: ${avatarId}, Theme: ${theme}, Duration: ${durationSeconds || 'default'}`);

  // --- Add state variable and query handler --- 
  let currentStage: SceneWorkflowStage = 'QUEUED'; 

  wf.setHandler(wf.defineQuery<SceneWorkflowStage>('getCurrentStage'), () => {
    return currentStage;
  });
  // --- End state variable and query handler ---

  let generatedSceneUrl = '';
  let sceneDbId = ''; 
  let finalVideoUrl: string | undefined = undefined;

  try {
    // 1. Call the scene generation activity
    currentStage = 'GENERATING_SCENE'; // Update stage
    wf.log.info(`[Workflow:${workflowId}] Calling generateScene activity...`);
    const sceneActivityInput: activities.GenerateSceneInput = { avatarId, userId, avatarUrl, theme };
    const sceneResult = await generateScene(sceneActivityInput);
    generatedSceneUrl = sceneResult.sceneUrl;
    sceneDbId = `scene_for_${avatarId}`; 
    wf.log.info(`[Workflow:${workflowId}] Activity generateScene completed. Scene URL: ${generatedSceneUrl}`);

    // 2. Call the animation generation activity 
    currentStage = 'GENERATING_ANIMATION'; // Update stage
    wf.log.info(`[Workflow:${workflowId}] Calling generateAnimation activity...`);
    const animationActivityInput: activities.GenerateAnimationInput = {
        sceneId: sceneDbId, 
        sceneUrl: generatedSceneUrl, 
        userId: userId,
        durationSeconds: durationSeconds 
    };
    const animationResult = await generateAnimation(animationActivityInput);
    finalVideoUrl = animationResult.finalAnimationUrl;
    wf.log.info(`[Workflow:${workflowId}] Activity generateAnimation completed. Final Video URL: ${finalVideoUrl}`);

    // 3. Mark as completed
    currentStage = 'COMPLETED'; // Update stage
    wf.log.info(`[Workflow:${workflowId}] Workflow Completed Successfully. Scene: ${generatedSceneUrl}, Video: ${finalVideoUrl}`);
    return { 
        sceneUrl: generatedSceneUrl, 
        finalVideoUrl: finalVideoUrl 
    };

  } catch (error) {
    currentStage = 'FAILED'; // Update stage on error
    const errorMessage = error instanceof Error ? error.message : 'Unknown workflow error';
    wf.log.error(`[Workflow:${workflowId}] Scene/Animation Generation Failed: ${errorMessage}`, error instanceof Error ? { error: error.stack } : { error });

    // --- Compensation Logic --- 
    wf.log.warn(`[Workflow:${workflowId}] Generation failed. Attempting to delete assets as compensation.`);
    
    // Attempt to delete the final video asset if its URL was generated *before* the error
    // (Less likely now polling is in activity, but possible if error happens *after* activity completes but before workflow returns)
    if (finalVideoUrl) { 
         try {
             const videoKey = extractKeyFromUrl(finalVideoUrl);
             if (videoKey) {
                 wf.log.info(`[Workflow:${workflowId}] Calling deleteAssetActivity (compensation) for video key: ${videoKey}`);
                 await deleteAssetCompensation({ assetKey: videoKey });
                 wf.log.warn(`[Workflow:${workflowId}] Compensation: deleteAssetActivity called for video.`);
             } else {
                 wf.log.warn(`[Workflow:${workflowId}] Could not parse video key from URL: ${finalVideoUrl}. Skipping video deletion.`);
             }
         } catch (videoDeleteError) {
             wf.log.error(
                 `[Workflow:${workflowId}] Compensation activity deleteAssetActivity for video failed: ${videoDeleteError instanceof Error ? videoDeleteError.message : 'Unknown reason'}`,
                 videoDeleteError instanceof Error ? { error: videoDeleteError.stack } : { videoDeleteError }
             );
         }
     }

    // Attempt to delete the scene asset if its URL was generated
    if (generatedSceneUrl) {
        try {
            const sceneKey = extractKeyFromUrl(generatedSceneUrl);
            if (sceneKey) {
                wf.log.info(`[Workflow:${workflowId}] Calling deleteAssetActivity (compensation) for scene key: ${sceneKey}`);
                await deleteAssetCompensation({ assetKey: sceneKey }); 
                wf.log.warn(`[Workflow:${workflowId}] Compensation: deleteAssetActivity called for scene.`);
            } else {
                wf.log.warn(`[Workflow:${workflowId}] Could not parse scene key from URL: ${generatedSceneUrl}. Skipping scene deletion.`);
            }
        } catch (sceneDeleteError) {
            wf.log.error(
                `[Workflow:${workflowId}] Compensation activity deleteAssetActivity for scene failed: ${sceneDeleteError instanceof Error ? sceneDeleteError.message : 'Unknown reason'}`,
                sceneDeleteError instanceof Error ? { error: sceneDeleteError.stack } : { sceneDeleteError }
            );
        }
    }

    // Always attempt to delete the original avatar asset (passed in as input)
    try {
      const avatarKey = extractKeyFromUrl(avatarUrl);
      if (avatarKey) {
        wf.log.info(`[Workflow:${workflowId}] Calling deleteAssetActivity (compensation) for avatar key: ${avatarKey}`);
        await deleteAssetCompensation({ assetKey: avatarKey });
        wf.log.warn(`[Workflow:${workflowId}] Compensation: deleteAssetActivity called for avatar ${avatarId}.`);
      } else {
         wf.log.warn(`[Workflow:${workflowId}] Could not parse avatar key from URL: ${avatarUrl}. Skipping avatar deletion.`);
      }
    } catch (avatarDeleteError) {
       wf.log.error(
          `[Workflow:${workflowId}] Compensation activity deleteAssetActivity for avatar failed: ${avatarDeleteError instanceof Error ? avatarDeleteError.message : 'Unknown reason'}`,
          avatarDeleteError instanceof Error ? { error: avatarDeleteError.stack } : { avatarDeleteError }
      );
    }

    throw error; // Rethrow the original error to fail the workflow
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