import { NextResponse } from 'next/server';
import { PrismaClient } from 'db';
// import { auth } from '@clerk/nextjs/server'; // For future authentication

const prisma = new PrismaClient();

interface JobStatusResponse {
  status: string; // e.g., 'queued', 'processing', 'completed', 'failed'
  avatarUrl?: string | null; // Present if status is 'completed'
  error?: string | null; // Present if status is 'failed'
}

export async function GET(
  request: Request, 
  context: { params: { id: string } }
): Promise<NextResponse<JobStatusResponse | { error: string }>> {
  // TODO: Add authentication to ensure user can only query their own jobs
  // const { userId } = auth();
  // if (!userId) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

  const jobId = context.params.id;

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
  }

  try {
    const avatarRecord = await prisma.avatar.findUnique({
      where: {
        id: jobId,
        // TODO: Add userId check once auth is integrated
        // userId: userId 
      },
      select: {
        status: true,
        avatarUrl: true,
        error: true, // Include error field from schema if it exists
      }
    });

    if (!avatarRecord) {
      return NextResponse.json({ error: 'Job not found or access denied' }, { status: 404 });
    }

    const responseData: JobStatusResponse = {
      status: avatarRecord.status,
    };

    if (avatarRecord.status === 'completed') {
      responseData.avatarUrl = avatarRecord.avatarUrl;
    } else if (avatarRecord.status === 'failed') {
      responseData.error = avatarRecord.error; // Pass error message if present
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error(`Error fetching job status for ID ${jobId}:`, error);
    return NextResponse.json({ error: 'Internal server error fetching job status' }, { status: 500 });
  }
} 