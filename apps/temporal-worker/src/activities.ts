// Placeholder for activities - will contain functions executed by the worker

import { PrismaClient } from 'db'; // Example: Accessing Prisma client
// Import from the new shared package
import { openai } from 'lib-shared'; 
import { getAvatarGenerationPrompt } from 'lib-shared';

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
 * Activity: Generates the avatar using OpenAI and updates the database.
 */
export async function generateAvatar(input: GenerateAvatarInput): Promise<GenerateAvatarOutput> {
  console.log('[Activity:generateAvatar] Started for avatarId:', input.avatarId);
  const { avatarId, imageId, userId, originalImageUrl } = input; // Destructure for easier access

  let generatedAvatarUrl = '';

  try {
    // Update status to 'processing' immediately
    await prisma.avatar.update({
        where: { id: avatarId },
        data: { status: 'processing_avatar' },
    });
    console.log(`[Activity:generateAvatar] Updated Avatar record ${avatarId} status to processing_avatar.`);

    // 1. Generate Prompt
    const prompt = getAvatarGenerationPrompt(); // Use default prompt for now
    console.log(`[Activity:generateAvatar] Generated prompt for ${avatarId}: ${prompt}`);

    // 2. Implement OpenAI call (DALL-E)
    console.log(`[Activity:generateAvatar] Calling OpenAI DALL-E 3 for avatarId: ${avatarId}...`);
    
    // TODO: Decide if using generate or edit based on originalImageUrl
    // For now, assume generate based on prompt only
    const response = await openai.images.generate({
      model: "dall-e-3", // Ensure this matches lib/openai if constants defined there
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard", // Use standard for DALL-E 3 unless HD is explicitly needed and budgeted
      response_format: "url",
      user: userId, // Pass user ID for moderation tracking
    });

    generatedAvatarUrl = response.data?.[0]?.url ?? ''; // Use nullish coalescing
    if (!generatedAvatarUrl) {
        throw new Error('OpenAI API did not return an image URL.');
    }
    console.log(`[Activity:generateAvatar] OpenAI generated URL for ${avatarId}: ${generatedAvatarUrl}`);

    // 3. TODO: Implement logic to store the generated avatar if needed (e.g., download & upload to MinIO)
    // For now, we just store the OpenAI URL.

    // 4. Update database record with success status and URL
    await prisma.avatar.update({
      where: { id: avatarId },
      data: {
        status: 'completed', // Mark as completed (or next step like 'generating_scene')
        avatarUrl: generatedAvatarUrl,
        error: null, // Clear any previous errors
      },
    });
    console.log(`[Activity:generateAvatar] Updated Avatar record ${avatarId} status to completed and saved URL.`);

  } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown activity error';
      console.error(`[Activity:generateAvatar] Failed for avatarId ${avatarId}:`, error);
      // Don't update DB here; let the workflow catch and call the compensation activity
      throw error; // Rethrow to fail the activity
  }

  // Return the result needed by the workflow
  return { avatarUrl: generatedAvatarUrl };
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