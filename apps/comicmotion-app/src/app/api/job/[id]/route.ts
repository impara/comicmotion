import { NextResponse } from 'next/server';
import { PrismaClient } from 'db';
import { getTemporalClient } from '@/lib/temporalClient'; // Import Temporal client
import { WorkflowNotFoundError } from '@temporalio/client';
// import { auth } from '@clerk/nextjs/server'; // For future authentication

const prisma = new PrismaClient();

// Interface matching Temporal Status names (adjust if needed)
type WorkflowStatus = 
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "TIMED_OUT"
  | "TERMINATED"
  | "CANCELED"
  | "UNKNOWN";

interface JobStatusResponse {
  status: string; // Combined status (e.g., 'queued', 'processing_avatar', 'completed', 'failed')
  avatarUrl?: string | null; // Present if status is 'completed'
  error?: string | null; // Present if status is 'failed'
}

export async function GET(
  request: Request, 
  // Correctly define context type for route handlers
  context: { params: { id: string } } 
): Promise<NextResponse<JobStatusResponse | { error: string }>> {
  // TODO: Add authentication

  // <<< Access params correctly >>>
  const { id: avatarId } = context.params; 

  if (!avatarId) {
    return NextResponse.json({ error: 'Job ID (Avatar ID) is required' }, { status: 400 });
  }

  // Construct the expected workflow ID
  const workflowId = `avatar-${avatarId}`;

  let temporalStatus: WorkflowStatus = 'UNKNOWN';
  let temporalError: string | undefined = undefined;
  let temporalResult: { avatarUrl: string } | null = null;
  let workflowFound = false;

  try {
    // 1. Check Temporal Workflow Status First
    try {
        const temporalClient = await getTemporalClient();
        const handle = temporalClient.workflow.getHandle(workflowId);
        const description = await handle.describe();
        temporalStatus = description.status.name as WorkflowStatus;
        workflowFound = true;

        if (temporalStatus === 'FAILED') {
            // Attempt to get failure info
            try {
                await handle.result(); // This throws the workflow failure
            } catch (wfError: unknown) {
                // Try to extract a message
                if (wfError instanceof Error) {
                  temporalError = (wfError.cause as Error)?.message || wfError.message || 'Workflow failed with unknown error';
                } else {
                  temporalError = 'Workflow failed with unknown error object';
                }
            }
        } else if (temporalStatus === 'COMPLETED') {
            // Get result if completed
            const rawResult = await handle.result(); 
            if (rawResult && typeof rawResult === 'object' && 'avatarUrl' in rawResult && typeof rawResult.avatarUrl === 'string') {
              temporalResult = { avatarUrl: rawResult.avatarUrl };
            } else {
              console.warn(`[API:/job] Workflow ${workflowId} completed but result format unexpected:`, rawResult);
              // Keep temporalResult as null, rely on DB avatarUrl
            }
        }

    } catch (error) {
        if (error instanceof WorkflowNotFoundError) {
            console.log(`[API:/job] Workflow ${workflowId} not found in Temporal. Checking DB.`);
            // Workflow not found in Temporal - could be old, or never started
            workflowFound = false; 
        } else {
            // Log other Temporal errors but proceed to check DB
            console.error(`[API:/job] Error querying Temporal workflow ${workflowId}:`, error);
            // Keep temporalStatus as UNKNOWN, let DB check proceed
        }
    }

    // 2. Fetch DB Record (always useful for details or fallback)
    const avatarRecord = await prisma.avatar.findUnique({
      where: { id: avatarId },
      select: {
        status: true,
        avatarUrl: true,
        error: true,
      }
    });

    if (!avatarRecord) {
      // If neither Temporal nor DB has it, it's truly not found
      return NextResponse.json({ error: 'Job not found or access denied' }, { status: 404 });
    }

    // 3. Determine final status and response
    let finalStatus = avatarRecord.status; // Start with DB status
    let finalAvatarUrl = avatarRecord.avatarUrl;
    let finalError = avatarRecord.error;

    if (workflowFound) {
        // If Temporal workflow has a terminal status, it takes precedence
        if (temporalStatus === 'COMPLETED') {
            finalStatus = 'completed';
            finalAvatarUrl = temporalResult?.avatarUrl || avatarRecord.avatarUrl; // Prefer Temporal result URL
            finalError = null;
        } else if ([ 'FAILED', 'TIMED_OUT', 'TERMINATED', 'CANCELED'].includes(temporalStatus)) {
            finalStatus = 'failed';
            finalError = temporalError || avatarRecord.error || `Workflow ${temporalStatus.toLowerCase()}`;
            finalAvatarUrl = null;
        } else if (temporalStatus === 'RUNNING' && finalStatus !== 'processing_avatar') {
            // If Temporal is running but DB isn't 'processing', update DB status
            // This handles cases where the workflow started but the initial DB update failed/was delayed
            finalStatus = 'processing_avatar'; 
            // Optionally update DB here async? Or let activity handle it.
        }
        // If Temporal is RUNNING and DB is processing_avatar, DB status is fine
    } else {
        // Workflow not found in Temporal. Rely solely on DB status.
        // If DB status is 'queued' or 'processing', it might be an orphan.
        // Consider adding logic here to time out old 'processing' jobs in DB.
        console.log(`[API:/job] Workflow ${workflowId} not found, using DB status: ${finalStatus}`);
    }

    const responseData: JobStatusResponse = { status: finalStatus };

    if (finalStatus === 'completed') {
      responseData.avatarUrl = finalAvatarUrl;
    } else if (finalStatus === 'failed') {
      responseData.error = finalError;
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error(`Error fetching job status for ID ${avatarId}:`, error);
    return NextResponse.json({ error: 'Internal server error fetching job status' }, { status: 500 });
  }
} 