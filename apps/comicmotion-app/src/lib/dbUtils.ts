import { PrismaClient } from 'db';

const prisma = new PrismaClient();

/**
 * Updates the Avatar record in the database upon successful generation.
 * This function is intended to be called from the background job/Temporal activity.
 * 
 * @param avatarId The ID of the Avatar record to update.
 * @param avatarUrl The URL of the successfully generated avatar image.
 */
export async function updateAvatarRecordOnSuccess(avatarId: string, avatarUrl: string): Promise<void> {
    console.log(`Updating Avatar record ${avatarId} with success status and URL...`);
    try {
        await prisma.avatar.update({
            where: { id: avatarId },
            data: {
                status: 'completed',
                avatarUrl: avatarUrl,
                error: null, // Clear any previous error messages
            },
        });
        console.log(`Successfully updated Avatar record ${avatarId}.`);
    } catch (error) {
        console.error(`Failed to update Avatar record ${avatarId} on success:`, error);
        // Depending on the background job system, you might want to:
        // - Throw the error to let the system handle retries/failures.
        // - Implement specific error handling/logging here.
        throw new Error(`Database update failed for avatar ${avatarId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Updates the Avatar record in the database upon failed generation.
 * This function is intended to be called from the background job/Temporal activity.
 * 
 * @param avatarId The ID of the Avatar record to update.
 * @param errorMessage A description of the error that occurred.
 */
export async function updateAvatarRecordOnFailure(avatarId: string, errorMessage: string): Promise<void> {
    console.error(`Updating Avatar record ${avatarId} with failure status: ${errorMessage}`);
    try {
        await prisma.avatar.update({
            where: { id: avatarId },
            data: {
                status: 'failed',
                error: errorMessage.substring(0, 500), // Truncate error message if needed
                // avatarUrl remains null or unchanged
            },
        });
        console.log(`Successfully updated Avatar record ${avatarId} status to failed.`);
    } catch (error) {
        console.error(`CRITICAL: Failed to update Avatar record ${avatarId} on failure:`, error);
        // This is a critical failure - the job failed, and we couldn't even record the failure.
        // Log this prominently. Manual intervention might be needed.
        // Depending on the background job system, throwing might trigger retries of this DB update.
        throw new Error(`Critical: Database update failed for avatar ${avatarId} after job failure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
} 