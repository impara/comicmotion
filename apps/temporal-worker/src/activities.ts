// Placeholder for activities - will contain functions executed by the worker

import { PrismaClient } from 'db'; // Example: Accessing Prisma client
// Remove direct OpenAI import if no longer needed after refactor
// import { openai } from 'lib-shared'; 
import { getAvatarGenerationPrompt } from 'lib-shared';
import { Context, sleep } from '@temporalio/activity';
// Import startAvatarGeneration
import { startSceneGeneration, getPredictionStatus, startAvatarGeneration } from 'lib-shared'; 
import { uploadStreamToS3, bucketName, deleteS3Object } from 'storage'; // Import S3 upload function
import fetch from 'node-fetch'; // For downloading the image
import { startAnimationGeneration } from 'lib-shared'; 

const prisma = new PrismaClient();

/**
 * Interface for the input arguments of the generateAvatar activity.
 */
export interface GenerateAvatarInput {
  avatarId: string;
  imageId: string;
  userId: string;
  originalImageUrl: string;
}

/**
 * Interface for the result of the generateAvatar activity.
 */
export interface GenerateAvatarOutput {
  avatarUrl: string; // The URL of the generated avatar
}

/**
 * Activity: Generates the avatar using Replicate (GPT-Image-1) and updates the database.
 * Follows TSD Step A1.
 */
export async function generateAvatar(input: GenerateAvatarInput): Promise<GenerateAvatarOutput> {
  console.log('[Activity:generateAvatar] Started for avatarId:', input.avatarId);
  const { avatarId, imageId, userId, originalImageUrl } = input; 
  const workflowId = Context.current().info.workflowExecution.workflowId;

  let predictionId: string | null = null;
  let finalAvatarUrl = ''; // Can be Replicate URL initially, then MinIO URL if downloaded

  try {
    // Update status to 'processing_avatar' immediately
    await prisma.avatar.update({
        where: { id: avatarId },
        data: { status: 'processing_avatar' },
    });
    console.log(`[Activity:generateAvatar][${workflowId}] Updated Avatar record ${avatarId} status to processing_avatar.`);

    // 1. Generate Prompt
    const prompt = getAvatarGenerationPrompt(); // Use default prompt for now
    console.log(`[Activity:generateAvatar][${workflowId}] Generated prompt for ${avatarId}: ${prompt}`);

    // 2. Start Replicate prediction for Avatar Generation
    console.log(`[Activity:generateAvatar][${workflowId}] Starting Replicate prediction for avatar...`);
    // Use the shared Replicate function, passing the user's original image URL and the generated prompt
    const prediction = await startAvatarGeneration(originalImageUrl, prompt); 
    predictionId = prediction.id;

    // Update Avatar record with Replicate ID
    await prisma.avatar.update({
        where: { id: avatarId },
        data: { replicateId: predictionId }, // Store the prediction ID
    });
    console.log(`[Activity:generateAvatar][${workflowId}] Replicate avatar prediction started. ID: ${predictionId}`);

    // 3. Polling loop (similar to generateScene)
    // Define constants for polling avatar generation
    const AVATAR_POLL_INTERVAL = '3 seconds'; // Adjust as needed
    const AVATAR_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout, adjust as needed
    
    const startTime = Date.now();
    let replicateAvatarUrl: string | null = null;

    console.log(`[Activity:generateAvatar][${workflowId}] Starting polling loop for prediction ${predictionId}...`);
    while (Date.now() - startTime < AVATAR_TIMEOUT_MS) {
      Context.current().heartbeat('Polling Replicate avatar prediction status...'); // Heartbeat

      const status = await getPredictionStatus(predictionId);
      console.log(`[Activity:generateAvatar][${workflowId}] Poll status for ${predictionId}: ${status.status}`);

      if (status.status === 'succeeded') {
        // Validate output format (expecting an array of URLs)
        if (Array.isArray(status.output) && status.output.length > 0 && typeof status.output[0] === 'string') {
            replicateAvatarUrl = status.output[0]; // Store the temporary Replicate URL
            console.log(`[Activity:generateAvatar][${workflowId}] Prediction ${predictionId} SUCCEEDED. Replicate URL: ${replicateAvatarUrl}`);
            break; // Exit polling loop
        } else {
            const errorMsg = `Prediction ${predictionId} succeeded but output format is unexpected: ${JSON.stringify(status.output)}`;
            console.error(`[Activity:generateAvatar][${workflowId}] ${errorMsg}`);
            throw new Error(errorMsg);
        }
      } else if (status.status === 'failed' || status.status === 'canceled') {
        const errorMsg = status.error ? String(status.error) : `Prediction ${status.status} without error details.`;
        console.error(`[Activity:generateAvatar][${workflowId}] Prediction ${predictionId} FAILED or CANCELED: ${errorMsg}`);
        throw new Error(`Replicate avatar generation ${status.status}: ${errorMsg}`); // Fail the activity
      }
      
      await sleep(AVATAR_POLL_INTERVAL);
    }

    // Check if polling timed out
    if (!replicateAvatarUrl) {
        const timeoutMsg = `Avatar prediction ${predictionId} timed out after ${AVATAR_TIMEOUT_MS / 1000} seconds.`;
        console.error(`[Activity:generateAvatar][${workflowId}] ${timeoutMsg}`);
        throw new Error(timeoutMsg);
    }

    // 4. TODO: Decide if we need to download from Replicate and store in MinIO (like generateScene)
    // TSD 5.5 implies workers save generated assets. Let's assume yes for consistency.
    console.log(`[Activity:generateAvatar][${workflowId}] Downloading avatar from Replicate URL: ${replicateAvatarUrl}`);
    Context.current().heartbeat('Downloading avatar from Replicate...'); // Heartbeat before download
    const response = await fetch(replicateAvatarUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download avatar image from Replicate URL: ${response.statusText}`);
    }
    const imageBuffer = await response.buffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    const fileExtension = contentType.split('/')[1] || 'png';
    // Use avatarId for the filename to ensure uniqueness within the job context
    const avatarKey = `assets/${userId}/${avatarId}/avatar.${fileExtension}`; 

    console.log(`[Activity:generateAvatar][${workflowId}] Uploading avatar buffer to MinIO. Key: ${avatarKey}`);
    Context.current().heartbeat('Uploading avatar to MinIO...'); // Heartbeat before upload
    await uploadStreamToS3(avatarKey, imageBuffer, contentType);
    console.log(`[Activity:generateAvatar][${workflowId}] Avatar uploaded successfully to MinIO.`);

    // Construct the final MinIO URL using the NEW public base URL variable
    const s3PublicUrl = process.env.S3_PUBLIC_URL; // <<< Use the new variable name for public URL construction
    if (!s3PublicUrl) { // Check the new variable
        console.warn('S3_PUBLIC_URL environment variable is not set. Cannot construct public URL. Falling back to key.');
        finalAvatarUrl = avatarKey; // Fallback to key
    } else {
        // Construct URL using the public base URL and bucket name
        finalAvatarUrl = `${s3PublicUrl}/${bucketName}/${avatarKey}`; // <<< Construct with public base
    }
    console.log(`[Activity:generateAvatar][${workflowId}] Final MinIO URL: ${finalAvatarUrl}`);


    // 5. Update database record with success status and FINAL MinIO URL
    await prisma.avatar.update({
      where: { id: avatarId },
      data: {
        status: 'completed', // Mark as completed for this step
        avatarUrl: finalAvatarUrl, // Store the persistent MinIO URL/key
        error: null, 
      },
    });
    console.log(`[Activity:generateAvatar][${workflowId}] Updated Avatar record ${avatarId} status to completed and saved MinIO URL.`);

  } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown activity error';
      console.error(`[Activity:generateAvatar][${workflowId}] Failed for avatarId ${avatarId}:`, error);
      
      // Attempt to update status to failed in DB (compensation should handle actual refund/cleanup)
      try {
        await prisma.avatar.update({
          where: { id: avatarId },
          data: { 
              status: 'failed', 
              // Store replicateId even on failure if available
              ...(predictionId && { replicateId: predictionId }), 
              error: errorMessage.substring(0, 1000) // Limit error msg length
          }
        });
      } catch (dbError) {
          console.error(`[Activity:generateAvatar][${workflowId}] CRITICAL: Failed to update Avatar ${avatarId} status to failed in DB:`, dbError);
      }

      // Rethrow the original error to fail the activity and trigger workflow compensation
      throw error; 
  }

  // Return the final MinIO URL
  return { avatarUrl: finalAvatarUrl };
}

// --- Scene Generation Activity --- //

export interface GenerateSceneInput {
  avatarId: string;
  userId: string;
  avatarUrl: string; 
  theme: string;
}

export interface GenerateSceneOutput {
  sceneUrl: string;
}

const SCENE_POLL_INTERVAL = '3 seconds';
const SCENE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout for polling

export async function generateScene(input: GenerateSceneInput): Promise<GenerateSceneOutput> {
  const { avatarId, userId, avatarUrl, theme } = input;
  const workflowId = Context.current().info.workflowExecution.workflowId;
  console.log(`[Activity:generateScene][${workflowId}] Started. AvatarId: ${avatarId}, Theme: ${theme}`);

  let sceneRecord = null;
  let predictionId: string | null = null;
  let finalMinioUrl = ''; // Store the final URL

  try {
    // 1. Create initial Scene record in DB
    console.log(`[Activity:generateScene][${workflowId}] Creating Scene DB record...`);
    sceneRecord = await prisma.scene.create({
      data: {
        userId: userId,
        avatarId: avatarId,
        theme: theme,
        status: 'processing_scene', // Initial status
      },
    });
    console.log(`[Activity:generateScene][${workflowId}] Created Scene record ID: ${sceneRecord.id}`);

    // 2. Start Replicate prediction via lib-shared function
    console.log(`[Activity:generateScene][${workflowId}] Starting Replicate prediction...`);
    const prediction = await startSceneGeneration(theme, avatarUrl); 
    predictionId = prediction.id;

    // Update Scene record with Replicate ID
    await prisma.scene.update({
      where: { id: sceneRecord.id },
      data: { replicateId: predictionId },
    });
    console.log(`[Activity:generateScene][${workflowId}] Replicate prediction started. ID: ${predictionId}`);

    // 3. Polling loop
    const startTime = Date.now();
    let replicateSceneUrl: string | null = null;

    console.log(`[Activity:generateScene][${workflowId}] Starting polling loop for prediction ${predictionId}...`);
    while (Date.now() - startTime < SCENE_TIMEOUT_MS) {
      Context.current().heartbeat('Polling Replicate prediction status...'); // Heartbeat signal

      const status = await getPredictionStatus(predictionId);
      console.log(`[Activity:generateScene][${workflowId}] Poll status for ${predictionId}: ${status.status}`);

      if (status.status === 'succeeded') {
        // Validate output format (expecting an array of URLs)
        if (Array.isArray(status.output) && status.output.length > 0 && typeof status.output[0] === 'string') {
            replicateSceneUrl = status.output[0]; // Store the temporary Replicate URL
            console.log(`[Activity:generateScene][${workflowId}] Prediction ${predictionId} SUCCEEDED. Replicate URL: ${replicateSceneUrl}`);
            break; // Exit polling loop
        } else {
            // Log unexpected format and fail
            const errorMsg = `Prediction ${predictionId} succeeded but output format is unexpected: ${JSON.stringify(status.output)}`;
            console.error(`[Activity:generateScene][${workflowId}] ${errorMsg}`);
            throw new Error(errorMsg);
        }
      } else if (status.status === 'failed' || status.status === 'canceled') {
        const errorMsg = status.error ? String(status.error) : `Prediction ${status.status} without error details.`;
        console.error(`[Activity:generateScene][${workflowId}] Prediction ${predictionId} FAILED or CANCELED: ${errorMsg}`);
        throw new Error(`Replicate scene generation ${status.status}: ${errorMsg}`); // Fail the activity
      }
      // If status is starting, processing, etc., continue polling

      // Wait before the next poll
      await sleep(SCENE_POLL_INTERVAL);
    }

    // Check if polling timed out
    if (!replicateSceneUrl) {
        const timeoutMsg = `Prediction ${predictionId} timed out after ${SCENE_TIMEOUT_MS / 1000} seconds.`;
        console.error(`[Activity:generateScene][${workflowId}] ${timeoutMsg}`);
        throw new Error(timeoutMsg);
    }

    // 4. Download from Replicate URL and Upload to MinIO
    console.log(`[Activity:generateScene][${workflowId}] Downloading scene from Replicate URL: ${replicateSceneUrl}`);
    Context.current().heartbeat('Downloading scene from Replicate...'); // Heartbeat before download
    const response = await fetch(replicateSceneUrl);
    if (!response.ok || !response.body) {
        throw new Error(`Failed to download scene image from Replicate URL: ${response.statusText}`);
    }
    
    // Convert ReadableStream to Buffer
    const imageBuffer = await response.buffer(); 

    const contentType = response.headers.get('content-type') || 'image/png';
    const fileExtension = contentType.split('/')[1] || 'png';
    const sceneKey = `assets/${userId}/${sceneRecord.id}/scene.${fileExtension}`;

    console.log(`[Activity:generateScene][${workflowId}] Uploading scene buffer to MinIO. Key: ${sceneKey}`);
    Context.current().heartbeat('Uploading scene to MinIO...'); // Heartbeat before upload
    // Pass the Buffer to the upload function
    await uploadStreamToS3(sceneKey, imageBuffer, contentType); 
    console.log(`[Activity:generateScene][${workflowId}] Scene uploaded successfully to MinIO.`);

    // Construct the final MinIO URL using the NEW public base URL variable
    const s3PublicUrl = process.env.S3_PUBLIC_URL; // <<< Use the new variable name for public URL construction
    if (!s3PublicUrl) {
        console.warn('S3_PUBLIC_URL environment variable is not set. Cannot construct public URL. Falling back to key.');
        finalMinioUrl = sceneKey; // Fallback to key
    } else {
        // Construct URL using the public base URL and bucket name
        finalMinioUrl = `${s3PublicUrl}/${bucketName}/${sceneKey}`; // <<< Construct with public base
    }
    console.log(`[Activity:generateScene][${workflowId}] Final MinIO URL: ${finalMinioUrl}`);

    // 5. Update Scene record on successful completion with MinIO URL
    console.log(`[Activity:generateScene][${workflowId}] Updating Scene record ${sceneRecord.id} with MinIO URL.`);
    await prisma.scene.update({
      where: { id: sceneRecord.id },
      data: {
        status: 'completed', 
        sceneUrl: finalMinioUrl, // Save the persistent MinIO URL/key
        error: null,
      },
    });
    console.log(`[Activity:generateScene][${workflowId}] Scene record ${sceneRecord.id} updated successfully.`);

    return { sceneUrl: finalMinioUrl };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown activity error';
    console.error(`[Activity:generateScene][${workflowId}] An error occurred:`, error);
    
    // Attempt to update Scene record to failed status
    if (sceneRecord?.id) {
        console.warn(`[Activity:generateScene][${workflowId}] Attempting to mark Scene record ${sceneRecord.id} as failed.`);
        try {
            await prisma.scene.update({
                where: { id: sceneRecord.id },
                data: { 
                    status: 'failed', 
                    // Store replicateId even on failure if available
                    ...(predictionId && { replicateId: predictionId }), 
                    error: errorMessage.substring(0, 1000) // Limit error message length for DB
                }
            });
             console.warn(`[Activity:generateScene][${workflowId}] Marked Scene record ${sceneRecord.id} as failed.`);
        } catch (dbUpdateError) {
            // Log critical failure if DB update fails during error handling
            console.error(`[Activity:generateScene][${workflowId}] CRITICAL: Failed to update scene ${sceneRecord.id} status to failed after activity error:`, dbUpdateError);
        }
    }
    
    // Rethrow the original error to fail the activity for Temporal
    throw error;
  }
}

// --- Add other activities for scene generation, animation, etc. here ---

// Example: Activity to update DB on failure (might be called from workflow compensation)
export async function markAvatarAsFailed(avatarId: string, errorMessage: string): Promise<void> {
  console.warn(`[Activity:markAvatarAsFailed] Marking avatar ${avatarId} as failed: ${errorMessage}`);
  try {
     await prisma.avatar.update({
         where: { id: avatarId },
         data: { 
             status: 'failed', 
             error: errorMessage
         }
     });
  } catch (dbError) {
    console.error(`[Activity:markAvatarAsFailed] CRITICAL: Failed to update avatar ${avatarId} status to failed:`, dbError);
    // Even if DB update fails, we might not want to fail the *compensation* activity itself
    // Log critical failure for manual intervention
  }
}

// --- Asset Deletion Activity (for Compensation) --- //

export interface DeleteAssetInput {
    assetKey: string; // The S3/MinIO key to delete
}

export async function deleteAssetActivity(input: DeleteAssetInput): Promise<void> {
    const { assetKey } = input;
    const workflowId = Context.current().info.workflowExecution.workflowId;
    console.log(`[Activity:deleteAssetActivity][${workflowId}] Attempting to delete asset with key: ${assetKey}`);

    if (!assetKey) {
        console.warn(`[Activity:deleteAssetActivity][${workflowId}] No asset key provided. Skipping deletion.`);
        return; 
    }

    try {
        await deleteS3Object(assetKey);
        console.log(`[Activity:deleteAssetActivity][${workflowId}] Successfully deleted asset: ${assetKey}`);
    } catch (error) {
        console.error(`[Activity:deleteAssetActivity][${workflowId}] Failed to delete asset ${assetKey}:`, error);
        // Decide whether to rethrow or not. Rethrowing fails the compensation step.
        // throw error; 
    }
}

// --- Animation Generation Activity --- //

export interface GenerateAnimationInput {
  sceneId: string; // ID of the scene record
  sceneUrl: string; // MinIO URL of the generated scene
  userId: string;
  durationSeconds?: number; 
}

export interface GenerateAnimationOutput {
  finalAnimationUrl: string; // Return the final MinIO URL/Key
}

const ANIMATION_POLL_INTERVAL = '5 seconds'; // Longer interval for video
const ANIMATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes timeout for polling video

export async function generateAnimation(input: GenerateAnimationInput): Promise<GenerateAnimationOutput> {
  const { sceneId, sceneUrl, userId, durationSeconds } = input;
  const workflowId = Context.current().info.workflowExecution.workflowId;
  console.log(`[Activity:generateAnimation][${workflowId}] Started. SceneId: ${sceneId}`);

  let animationRecord = null; 
  let predictionId: string | null = null;
  let finalMinioUrl = '';
  let replicateAnimationUrl: string | null = null; // Defined here to be accessible in the final update

  try {
    // 1. Create initial Animation record in DB
    console.log(`[Activity:generateAnimation][${workflowId}] Creating Animation DB record for sceneId: ${sceneId}`);
    animationRecord = await prisma.animation.create({
        data: {
            userId: userId,
            sceneId: sceneId, 
            status: 'processing_animation',
            duration: durationSeconds || 6, 
        },
    });
    console.log(`[Activity:generateAnimation][${workflowId}] Created Animation record ID: ${animationRecord.id}`);

    // 2. Start Replicate animation prediction
    console.log(`[Activity:generateAnimation][${workflowId}] Starting Replicate animation prediction...`);
    const prediction = await startAnimationGeneration(sceneUrl, durationSeconds); 
    predictionId = prediction.id;
    console.log(`[Activity:generateAnimation][${workflowId}] Replicate animation prediction started. ID: ${predictionId}`);

    // Update Animation record with Replicate ID
    await prisma.animation.update({
      where: { id: animationRecord.id },
      data: { replicateId: predictionId },
    });
    console.log(`[Activity:generateAnimation][${workflowId}] Updated Animation record ${animationRecord.id} with Replicate ID: ${predictionId}`);

    // 3. Polling loop for animation completion (moved inside activity)
    const startTime = Date.now();
    // let replicateAnimationUrl: string | null = null; // Moved to broader scope

    console.log(`[Activity:generateAnimation][${workflowId}] Starting polling loop for prediction ${predictionId}...`);
    while (Date.now() - startTime < ANIMATION_TIMEOUT_MS) {
      Context.current().heartbeat('Polling Replicate animation status...');

      const status = await getPredictionStatus(predictionId);
      console.log(`[Activity:generateAnimation][${workflowId}] Poll status for ${predictionId}: ${status.status}`);

      if (status.status === 'succeeded') {
        // Video output might be direct URL string or array
        if (typeof status.output === 'string') {
            replicateAnimationUrl = status.output;
        } else if (Array.isArray(status.output) && status.output.length > 0 && typeof status.output[0] === 'string') {
             replicateAnimationUrl = status.output[0];
        } else {
            const errorMsg = `Prediction ${predictionId} succeeded but output format is unexpected: ${JSON.stringify(status.output)}`;
            console.error(`[Activity:generateAnimation][${workflowId}] ${errorMsg}`);
            throw new Error(errorMsg);
        }
        console.log(`[Activity:generateAnimation][${workflowId}] Prediction ${predictionId} SUCCEEDED. Replicate URL: ${replicateAnimationUrl}`);
        break; // Exit polling loop
      } else if (status.status === 'failed' || status.status === 'canceled') {
        const errorMsg = status.error ? String(status.error) : `Prediction ${status.status} without error details.`;
        console.error(`[Activity:generateAnimation][${workflowId}] Prediction ${predictionId} FAILED or CANCELED: ${errorMsg}`);
        throw new Error(`Replicate animation generation ${status.status}: ${errorMsg}`);
      }

      await sleep(ANIMATION_POLL_INTERVAL);
    }

    if (!replicateAnimationUrl) {
        const timeoutMsg = `Animation Prediction ${predictionId} timed out after ${ANIMATION_TIMEOUT_MS / 1000} seconds.`;
        console.error(`[Activity:generateAnimation][${workflowId}] ${timeoutMsg}`);
        throw new Error(timeoutMsg);
    }

    // 4. Download from Replicate URL and Upload to MinIO
    // TODO: Implement transcoding here if needed (Subtask 7.4)
    console.log(`[Activity:generateAnimation][${workflowId}] Downloading animation from Replicate URL: ${replicateAnimationUrl}`);
    Context.current().heartbeat('Downloading animation from Replicate...'); // Heartbeat before download
    const response = await fetch(replicateAnimationUrl);
    if (!response.ok || !response.body) {
        throw new Error(`Failed to download animation video from Replicate URL: ${response.statusText}`);
    }
    
    const videoBuffer = await response.buffer();
    const contentType = response.headers.get('content-type') || 'video/mp4';
    // Determine extension carefully, default to mp4 as required by PRD
    const fileExtension = contentType.startsWith('video/') ? contentType.split('/')[1] : 'mp4'; 
    const animationKey = `assets/${userId}/${animationRecord.id}/animation.${fileExtension}`; // Use animation ID

    console.log(`[Activity:generateAnimation][${workflowId}] Uploading animation buffer to MinIO. Key: ${animationKey}`);
    Context.current().heartbeat('Uploading animation to MinIO...'); // Heartbeat before upload
    await uploadStreamToS3(animationKey, videoBuffer, contentType); 
    console.log(`[Activity:generateAnimation][${workflowId}] Animation uploaded successfully to MinIO.`);

    // Construct the final MinIO URL using the NEW public base URL variable
    const s3PublicUrl = process.env.S3_PUBLIC_URL; // <<< Use the new variable name for public URL construction
    if (!s3PublicUrl) {
        console.warn('[Activity:generateAnimation] S3_PUBLIC_URL environment variable is not set. Falling back to key.');
        finalMinioUrl = animationKey; 
    } else {
        // Construct URL using the public base URL and bucket name
        finalMinioUrl = `${s3PublicUrl}/${bucketName}/${animationKey}`; // <<< Construct with public base
    }
    console.log(`[Activity:generateAnimation][${workflowId}] Final MinIO URL: ${finalMinioUrl}`);

    // 5. Update Animation record on successful completion
    await prisma.animation.update({
      where: { id: animationRecord.id },
      data: {
        status: 'completed', 
        videoUrl: finalMinioUrl, 
        // replicateOutput: replicateAnimationUrl, // Removed this field as it's not in the schema
        error: null,
      },
    });
    console.log(`[Activity:generateAnimation][${workflowId}] Animation record ${animationRecord.id} updated to completed.`);

    // Return the final URL
    return { finalAnimationUrl: finalMinioUrl };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown activity error';
    console.error(`[Activity:generateAnimation][${workflowId}] An error occurred:`, error);
    
    if (animationRecord?.id) { 
        console.warn(`[Activity:generateAnimation][${workflowId}] Attempting to mark Animation record ${animationRecord.id} as failed.`);
        try {
             await prisma.animation.update({
                 where: { id: animationRecord.id },
                 data: { 
                     status: 'failed', 
                     ...(predictionId && { replicateId: predictionId }), 
                     error: errorMessage.substring(0, 1000) 
                 }
             });
             console.warn(`[Activity:generateAnimation][${workflowId}] Marked Animation record ${animationRecord.id} as failed.`);
        } catch (dbUpdateError) {
            console.error(`[Activity:generateAnimation][${workflowId}] CRITICAL: Failed to update animation ${animationRecord.id} status to failed:`, dbUpdateError);
        }
    } else {
        console.error(`[Activity:generateAnimation][${workflowId}] Error occurred before animation record could be created for sceneId: ${sceneId}.`);
        // Optionally, create a failed record here if desired for tracking, ensuring all required fields like 'duration' are provided.
        // Example: await prisma.animation.create({ data: { userId, sceneId, status: 'failed', error: errorMessage.substring(0,1000), replicateId: predictionId, duration: durationSeconds || 6 }});
    }
    
    throw error; // Rethrow the original error
  }
} 