import { NextResponse, type NextRequest } from 'next/server';
import { getTemporalClient } from '@/lib/temporalClient'; // Adjust path if necessary
import { WorkflowNotFoundError } from '@temporalio/client';

// Define the expected parameters in the URL path
interface RouteContext {
  params: {
    workflowId: string;
  };
}

// Define possible workflow statuses relevant to the frontend
type WorkflowStatus =
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "TIMED_OUT"
  | "TERMINATED"
  | "CANCELED"
  | "UNKNOWN"; 

// Define the structure of the workflow result (matching generateSceneWorkflow output)
interface WorkflowResult {
  sceneUrl: string;
  finalVideoUrl?: string;
}

// Define the structure of the response
interface StatusResponse {
  workflowId: string;
  status: WorkflowStatus; // Overall Temporal status
  currentStage?: string; // Specific stage from query handler
  result?: WorkflowResult; 
  error?: string;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { workflowId } = context.params;

  if (!workflowId) {
    return NextResponse.json({ error: 'Workflow ID is required' }, { status: 400 });
  }

  try {
    const temporalClient = await getTemporalClient();
    const handle = temporalClient.workflow.getHandle(workflowId);

    let description;
    try {
      description = await handle.describe();
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        console.warn(`[API:/status] Workflow not found: ${workflowId}`);
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
      }
      // Rethrow other errors during describe
      throw err;
    }

    const status = description.status.name as WorkflowStatus; 
    let result: WorkflowResult | null = null; 
    let error: string | undefined = undefined;
    let currentStage: string | undefined = undefined; // Variable for stage

    // If workflow is running, query its internal stage
    if (status === 'RUNNING') {
      try {
        // Use the query name defined in the workflow
        currentStage = await handle.query<string>('getCurrentStage'); 
      } catch (queryError) {
        // Log query error but don't necessarily fail the status check
        console.warn(`[API:/status] Failed to query stage for RUNNING workflow ${workflowId}:`, queryError);
        // Keep currentStage as undefined
      }
    } 
    // If workflow is completed, try to get the result
    else if (status === 'COMPLETED') {
      currentStage = 'COMPLETED'; // Set stage explicitly
      try {
        result = (await handle.result()) as WorkflowResult; 
      } catch (err) {
        console.error(`[API:/status] Failed to get result for COMPLETED workflow ${workflowId}:`, err);
        error = 'Failed to retrieve workflow result.';
        currentStage = 'FAILED'; // Consider it failed if result cannot be retrieved
      }
    } 
    // If workflow failed or timed out, set stage and error
    else if (status === 'FAILED' || status === 'TIMED_OUT') {
       currentStage = 'FAILED'; // Set stage explicitly
       error = `Workflow ${status.toLowerCase()}`; 
    }
    // Handle other terminal states
    else if (status === 'TERMINATED' || status === 'CANCELED') {
        currentStage = status; // Use the Temporal status name as the stage
        error = `Workflow ${status.toLowerCase()}`;
    }

    const response: StatusResponse = {
      workflowId: description.workflowId,
      status: status, // Overall Temporal status
      ...(currentStage && { currentStage }), // Add current stage if available
      ...(result && { result }), 
      ...(error && { error }),   
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error(`[API:/status] Error fetching status for workflow ${workflowId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 