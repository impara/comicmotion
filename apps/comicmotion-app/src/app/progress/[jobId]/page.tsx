'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, Download, Copy, Check } from 'lucide-react'; // Icons

// Define possible job statuses based on TSD/PRD AND Workflow Stages
// Include all states used in the mapping/display logic
type JobStatus =
  | "queued"
  | "generating_scene" 
  | "generating_animation"
  | "generating_video" // Alias or intermediate if needed? Use generating_animation for consistency.
  | "avatar_done" // Needed for step logic
  | "video_done" // Final success state mapped from COMPLETED
  | "failed"; // Covers FAILED, TIMED_OUT etc.

// Redefine the API response structure locally
// (Matches definition in /api/generate/status/[workflowId]/route.ts)
interface WorkflowResult {
  sceneUrl: string;
  finalVideoUrl?: string;
}
interface StatusResponse {
  workflowId: string;
  status: string; // Overall Temporal status (RUNNING, COMPLETED, FAILED, etc.)
  currentStage?: string; // Specific stage (QUEUED, GENERATING_SCENE, etc.)
  result?: WorkflowResult; 
  error?: string;
}

// Remove Mock Data/Config
// const MOCK_STEPS: JobStatus[] = [...];
// const MOCK_FAIL_AFTER_STEP = ...;
// const MOCK_SHOULD_FAIL = ...;
// const MOCK_DELAY_MS = ...;

const POLLING_INTERVAL_MS = 3000; // Poll every 3 seconds

function ProgressContent() {
  const params = useParams();
  const router = useRouter(); // Add router
  const jobId = params.jobId as string;

  const [currentStatus, setCurrentStatus] = useState<JobStatus>('queued');
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // --- Update Polling useEffect --- 
  useEffect(() => {
    if (!jobId) {
      console.error("Job ID is missing, cannot poll status.");
      setError("Job ID is missing. Cannot track progress.");
      return;
    }

    console.log(`Starting progress polling for Job ID: ${jobId}`);
    setError(null);
    setCurrentStatus('queued'); 
    setResultUrl(null);

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`/api/generate/status/${jobId}`);
        
        if (!response.ok) {
          // Handle specific errors like 404 Not Found
          if (response.status === 404) {
             setError(`Job ${jobId} not found.`);
             setCurrentStatus("failed"); // Treat as failed
             clearInterval(intervalId); 
             return;
          }
          // Handle other non-ok responses
          const errorText = await response.text();
          throw new Error(`API error! status: ${response.status} - ${errorText}`);
        }

        const data: StatusResponse = await response.json(); 
        console.log("Polling Update:", data);

        // --- Determine Frontend Status based on API response --- 
        let newFrontendStatus: JobStatus = 'queued'; // Default
        
        if (data.status === 'COMPLETED') {
            newFrontendStatus = 'video_done';
            setResultUrl(data.result?.finalVideoUrl || null); 
            setError(null);
            clearInterval(intervalId); // Stop polling
        } else if (['FAILED', 'TIMED_OUT', 'TERMINATED', 'CANCELED'].includes(data.status)) {
            newFrontendStatus = 'failed';
            setError(data.error || `Workflow ${data.status?.toLowerCase()}`);
            setResultUrl(null);
            clearInterval(intervalId); // Stop polling
        } else if (data.status === 'RUNNING' && data.currentStage) {
            // Map the stage from the query handler
            switch (data.currentStage) {
                case 'GENERATING_SCENE':
                    newFrontendStatus = 'generating_scene';
                    break;
                case 'GENERATING_ANIMATION':
                    newFrontendStatus = 'generating_animation';
                    break;
                // Add other stages if defined in workflow
                default:
                    // If stage is unknown or QUEUED while RUNNING, maybe default to first step
                    newFrontendStatus = 'generating_scene'; 
                    break;
            }
            setError(null); // Clear errors while running successfully
        } else {
            // Default or unknown running state, keep as queued or last known running state
            // This case might occur if query fails or status is unexpected
            newFrontendStatus = currentStatus === 'failed' ? 'failed' : 'queued';
             if (currentStatus !== 'failed') {
               // Avoid clearing error if it was a polling error
               // setError(null); 
             }
        }
        
        setCurrentStatus(newFrontendStatus);
        // --- End Status Determination --- 

      } catch (err: unknown) {
        console.error('Polling failed:', err);
        const message = err instanceof Error ? err.message : 'Failed to fetch progress update.';
        setError(`Error fetching status: ${message}. Retrying...`); 
      }
    }, POLLING_INTERVAL_MS);

    // Initial fetch immediately? Optional.
    // fetchStatus(); 

    // Cleanup interval on unmount or when jobId changes
    return () => clearInterval(intervalId);

  }, [jobId]); 

  // --- Keep STEPS_CONFIG and UI Rendering Logic ---
  // Note: The getCurrentStepIndex logic needs careful review and adjustment 
  //       to correctly reflect the state based on the *new* currentStatus updates.

  const STEPS_CONFIG: { id: JobStatus, label: string }[] = [
    // Assuming Avatar is done *before* this workflow starts. Adjust if not.
    // { id: 'generating_avatar', label: 'Generating Avatar' }, 
    { id: 'generating_scene', label: 'Creating Scene' },
    { id: 'generating_video', label: 'Animating Video' },
    { id: 'video_done', label: 'Complete' }
  ];

  // --- Refine getCurrentStepIndex based on the new accurate status ---
  const getCurrentStepIndex = () => {
      switch (currentStatus) {
          // case 'generating_avatar': return 0; // If Avatar step was included
          case 'generating_scene': return 0; // Index relative to STEPS_CONFIG above
          case 'generating_animation': return 1;
          case 'video_done': return STEPS_CONFIG.length - 1; // Point to 'Complete' (last index)
          case 'failed':
              // Try to determine where it failed, tricky without more state.
              // Default to showing error at the last known *attempted* step.
              // This requires storing the last *non-failed* status or inferring.
              // Simplification: Show error at the start or end. Let's show at end for now.
              return STEPS_CONFIG.length - 2; // Show failure at 'Animating Video' step
          case 'queued': // Initial state or before scene starts
          case 'avatar_done': // State before scene starts
             return -1; // Indicate not started within this view's steps yet
          default:
              return -1; // Default/unknown
      }
  };

  const handleCopyLink = () => {
    // Placeholder: Generate a shareable link. In a real app, this might involve an API call.
    // For now, just use the current page URL or a mock URL structure.
    const shareUrl = window.location.href; // Simple placeholder using current URL
    // const mockShareUrl = `${window.location.origin}/share/${jobId}`; // Alternative mock structure

    navigator.clipboard.writeText(shareUrl).then(() => {
      setLinkCopied(true);
      // Reset the copied state after a few seconds
      setTimeout(() => setLinkCopied(false), 2500);
    }).catch(err => {
      console.error('Failed to copy share link:', err);
      // TODO: Show an error message to the user
      alert('Failed to copy link.');
    });
  };

  const currentStepIdx = getCurrentStepIndex();
  
  return (
    <div className="container mx-auto px-4 py-12 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-4">Generating Your Comic Short!</h1>
      {/* Ensure jobId is displayed correctly */}
      <p className="text-gray-600 mb-8">Job ID: <span className="font-mono bg-gray-100 px-1 rounded">{jobId || 'Loading...'}</span></p> 

      {/* Progress Steps UI (Ensure this uses currentStepIdx correctly) */}
      <div className="w-full max-w-2xl mb-8">
          <ol className="flex items-center">
              {STEPS_CONFIG.map((step, index) => (
                  <li key={step.id} className={`relative flex w-full items-center ${index !== STEPS_CONFIG.length - 1 ? 'after:content-[""] after:w-full after:h-1 after:border-b after:border-4 after:inline-block' : ''} ${index <= currentStepIdx && currentStatus !== 'failed' ? 'after:border-blue-600' : 'after:border-gray-300'}`}>
                      <span className={`flex items-center justify-center w-10 h-10 rounded-full lg:h-12 lg:w-12 shrink-0 ${currentStepIdx > index || currentStatus === 'video_done' ? 'bg-blue-600 text-white' : currentStepIdx === index && currentStatus !== 'failed' ? 'bg-blue-200 border-2 border-blue-600 text-blue-600' : 'bg-gray-200 text-gray-600'}`}>
                          {currentStepIdx > index || currentStatus === 'video_done' ? (
                              <CheckCircle className="w-5 h-5" />
                          ) : currentStepIdx === index && currentStatus !== 'failed' ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                           ) : (
                               <span>{index + 1}</span> // Show number for future steps
                           )}
                      </span>
                  </li>
              ))}
          </ol>
           {/* Step Labels */}
           <div className="flex justify-between mt-2 text-center"> 
               {STEPS_CONFIG.map((step, index) => (
                  <span 
                    key={`${step.id}-label`} 
                    className={`flex-1 text-xs sm:text-sm px-1 ${currentStepIdx >= index && currentStatus !== 'failed' ? 'font-semibold text-blue-700' : 'text-gray-500'}`}
                  >
                      {step.label}
                  </span>
               ))}
           </div>
      </div>

      {/* Status Message & Actions (Ensure this uses component state correctly) */}
      <div className="w-full max-w-md text-center p-6 border rounded-lg shadow-md bg-white">
        {error && currentStatus === 'failed' ? ( // Show error only if status is failed
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-red-700">Generation Failed</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            {/* Consider adding a button to go back or contact support */}
            <button 
               onClick={() => router.back()} // Example: Go back
               className="mt-4 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
                Go Back
            </button>
          </>
        ) : currentStatus === 'video_done' ? (
          <>
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-green-700">Complete!</h2>
            <p className="text-gray-600 mb-6">Your animated short is ready.</p> 
            {/* Download/Share Buttons (Task 9.1, 9.2 Frontend) */}
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              {resultUrl ? (
                 <a 
                  href={resultUrl} 
                  download 
                  className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 whitespace-nowrap"
                 >
                  <Download className="w-4 h-4 mr-2" />
                  Download Video
                 </a>
              ) : (
                <button 
                  disabled
                  className="inline-flex items-center justify-center px-6 py-3 bg-gray-400 text-white rounded-lg cursor-not-allowed whitespace-nowrap"
                 >
                   Download Unavailable
                 </button>
              )}
              <button 
                onClick={handleCopyLink}
                className="inline-flex items-center justify-center px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors duration-200 whitespace-nowrap"
              >
                {linkCopied ? (
                  <Check className="w-4 h-4 mr-2 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {linkCopied ? 'Link Copied!' : 'Copy Share Link'}
              </button>
            </div>
          </>
        ) : (
          // Processing State UI
          <>
            <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
            <h2 className="text-xl font-semibold mb-2">Processing...</h2>
            <p className="text-gray-600 mb-4">
                Current Step: <span className="font-medium">{STEPS_CONFIG[currentStepIdx]?.label || 'Initializing'}...</span>
            </p>
            {/* Display polling fetch errors temporarily if they occur */}
            {error && <p className="text-sm text-orange-500 mb-4">{error}</p>} 
            <div className="space-y-3 mt-4 p-4 border border-dashed border-gray-300 rounded">
              <p className="text-sm text-gray-500">Generating your animation...</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Use Suspense for useParams compatibility
export default function ProgressPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-screen">Loading progress...</div>}>
            <ProgressContent />
        </Suspense>
    );
} 