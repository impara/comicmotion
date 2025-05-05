import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { PrismaClient } from 'db';
import { getTemporalClient } from '@/lib/temporalClient'; // Adjust path if necessary

const prisma = new PrismaClient();

// TODO: Define the theme enum based on available themes in Task 5
const sceneThemes = ['city', 'fantasy', 'neon'] as const;

// Expect avatarId and theme in the request body
const generateSceneSchema = z.object({
  avatarId: z.string().cuid(), // Assuming CUID for avatar ID
  theme: z.enum(sceneThemes),
});

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth(); // Renamed to clerkId for clarity
  if (!clerkId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // --- Look up internal database user ID from Clerk ID ---
  let dbUser;
  try {
    dbUser = await prisma.user.findUnique({
      where: { clerkId: clerkId }, // Find user by their Clerk ID
      select: { id: true }, // Only select the internal database ID
    });

    if (!dbUser) {
      // This case should ideally be handled by webhooks creating the user on signup.
      // If no webhook, you might choose to create the user here, but it's less robust.
      console.error(`[API:/scene/generate] User not found in DB for Clerk ID: ${clerkId}. Ensure user sync (e.g., webhooks) is working.`);
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }
  } catch (dbLookupError) {
    console.error(`[API:/scene/generate] Database error looking up user for Clerk ID ${clerkId}:`, dbLookupError);
    return NextResponse.json({ error: 'Failed to retrieve user profile.' }, { status: 500 });
  }

  const internalUserId = dbUser.id; // Use the internal database ID
  // --- End User ID Lookup ---

  let validatedData;
  try {
    const body = await request.json();
    validatedData = generateSceneSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return new NextResponse('Invalid request body', { status: 400 });
  }

  const { avatarId, theme } = validatedData;

  try {
    // 1. Verify Avatar exists, belongs to user, and has a URL
    console.log(`[API:/scene/generate] Fetching avatar ${avatarId} for internal DB User ID ${internalUserId} (ClerkID: ${clerkId})`);
    const avatarRecord = await prisma.avatar.findUnique({
      where: {
        id: avatarId,
        userId: internalUserId, // <<< USE INTERNAL DB ID HERE
      },
      select: {
        avatarUrl: true,
        status: true,
      },
    });

    if (!avatarRecord) {
        console.warn(`[API:/scene/generate] Avatar not found or unauthorized. AvatarId: ${avatarId}, Internal DB User ID: ${internalUserId} (ClerkID: ${clerkId})`);
        return NextResponse.json({ error: 'Avatar not found or access denied.' }, { status: 404 });
    }

    if (avatarRecord.status !== 'completed' || !avatarRecord.avatarUrl) {
        console.warn(`[API:/scene/generate] Avatar ${avatarId} not completed or missing URL. Status: ${avatarRecord.status}`);
        return NextResponse.json({ error: 'Avatar generation not complete or URL missing.' }, { status: 400 });
    }

    const avatarUrl = avatarRecord.avatarUrl;
    console.log(`[API:/scene/generate] Found avatar ${avatarId} with URL: ${avatarUrl}`);

    // TODO: Check user credits for scene generation (Task 10)

    // 2. Trigger Temporal workflow for scene generation
    const temporalClient = await getTemporalClient();
    const workflowName = 'generateSceneWorkflow'; 
    const taskQueueName = 'avatar-generation'; // TODO: Consider separate task queue? Using same for now.
    // Use a unique workflow ID, e.g., based on avatarId and theme
    const workflowId = `scene-${avatarId}-${theme}-${Date.now()}`;

    console.log(`[API:/scene/generate] Starting Temporal workflow '${workflowName}' with ID '${workflowId}' for Internal DB User ID ${internalUserId} (ClerkID: ${clerkId})`);

    await temporalClient.workflow.start(workflowName, { 
      taskQueue: taskQueueName, 
      workflowId: workflowId, 
      args: [{
          avatarId: avatarId,
          userId: internalUserId, // <<< PASS INTERNAL DB ID TO WORKFLOW
          theme: theme,
          avatarUrl: avatarUrl,
      }], 
      // TODO: Define appropriate workflow execution timeout
      // workflowExecutionTimeout: '5 minutes',
    });
    
    console.log(`[API:/scene/generate] Successfully started workflow ${workflowId}`);

    // TODO: Deduct credit if needed (Task 10)

    // Return the workflow ID (or potentially the Scene record ID created by the activity)
    // Returning workflow ID for now, client might poll based on this or another mechanism.
    return NextResponse.json({ workflowId: workflowId }); // Or sceneId if preferred

  } catch (error) {
    console.error(`[API:/scene/generate] Error starting scene generation for avatar ${avatarId}:`, error);
    // TODO: Implement more specific error handling (e.g., insufficient credits)
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 