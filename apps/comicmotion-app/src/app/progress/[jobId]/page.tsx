'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, Download, Copy, Check } from 'lucide-react'; // Icons

// Define possible job statuses based on TSD/PRD
type JobStatus =
  | "queued"
  | "generating_avatar"
  | "avatar_done"
  | "generating_scene"
  | "scene_done"
  | "generating_video"
  | "video_done" // Final success state
  | "failed";

// Define the structure for progress updates (adjust as needed based on actual API)
interface ProgressUpdate {
  status: JobStatus;
  message?: string;
  progressPercent?: number; // Optional progress within a step
  error?: string;
  resultUrl?: string; // URL to final video/image
  etaSeconds?: number;
}

// Mock function to simulate progress updates (replace with actual WebSocket/polling)
const MOCK_STEPS: JobStatus[] = [
  'generating_avatar',
  'avatar_done',
  'generating_scene',
  'scene_done',
  'generating_video',
  'video_done'
];

const MOCK_FAIL_AFTER_STEP = 'generating_video'; // Simulate failure
const MOCK_SHOULD_FAIL = false; // Set to true to test failure
const MOCK_DELAY_MS = 2500; // Delay between mock updates

function ProgressContent() {
  const params = useParams();
  const jobId = params.jobId as string;

  const [currentStatus, setCurrentStatus] = useState<JobStatus>('queued');
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Simulate receiving progress updates
  useEffect(() => {
    if (!jobId) return;
    console.log(`Starting progress tracking for Job ID: ${jobId}`);
    setError(null);
    setCurrentStatus('queued');
    setResultUrl(null);
    setEta(null); 

    let stepIndex = 0;
    const intervalId = setInterval(() => {
      const nextStatus = MOCK_STEPS[stepIndex];
      
      if (!nextStatus) {
        clearInterval(intervalId);
        return;
      }

      // Simulate failure if configured
      if (MOCK_SHOULD_FAIL && nextStatus === MOCK_FAIL_AFTER_STEP) {
        const update: ProgressUpdate = {
          status: 'failed',
          error: `Mock failure during step: ${nextStatus}`
        };
        console.log("Mock Update:", update);
        setCurrentStatus(update.status);
        setError(update.error || 'An unknown error occurred.');
        clearInterval(intervalId);
        return;
      }
      
      // Simulate success update
      const update: ProgressUpdate = {
        status: nextStatus,
        message: `Step ${stepIndex + 1} completed: ${nextStatus}`,
        progressPercent: 100, // Assume step completion
        resultUrl: nextStatus === 'video_done' ? `/mock-download/${jobId}.mp4` : undefined,
        etaSeconds: MOCK_STEPS.length - (stepIndex + 1) > 0 ? (MOCK_STEPS.length - (stepIndex + 1)) * (MOCK_DELAY_MS / 1000) : 0
      };
      console.log("Mock Update:", update);
      setCurrentStatus(update.status);
      setResultUrl(update.resultUrl || null);
      setEta(update.etaSeconds !== undefined ? update.etaSeconds : null);
      setError(null); // Clear error on successful step

      if (nextStatus === 'video_done') {
        clearInterval(intervalId);
      }
      
      stepIndex++;

    }, MOCK_DELAY_MS);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);

  }, [jobId]); // Rerun simulation if jobId changes

  const STEPS_CONFIG: { id: JobStatus, label: string }[] = [
    { id: 'generating_avatar', label: 'Generating Avatar' },
    { id: 'generating_scene', label: 'Creating Scene' },
    { id: 'generating_video', label: 'Animating Video' },
    { id: 'video_done', label: 'Complete' }
  ];

  const getCurrentStepIndex = () => {
    const currentMajorStep = MOCK_STEPS.find(step => currentStatus === step || currentStatus.startsWith(step.split('_')[0]));
    if (!currentMajorStep) return -1;

    if (currentStatus === 'failed') return STEPS_CONFIG.findIndex(s => s.id === MOCK_FAIL_AFTER_STEP || s.id.startsWith(MOCK_FAIL_AFTER_STEP.split('_')[0]));
    if (currentStatus === 'video_done') return STEPS_CONFIG.length -1; // Point to 'Complete'

    return STEPS_CONFIG.findIndex(s => s.id === currentMajorStep || s.id.startsWith(currentMajorStep.split('_')[0]));
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
      <p className="text-gray-600 mb-8">Job ID: <span className="font-mono bg-gray-100 px-1 rounded">{jobId || '...'}</span></p>

      {/* Progress Steps UI (8.1) - Simplified version */}
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
           {/* Step Labels (Optional Enhancement) */}
           <div className="flex justify-between mt-2">
               {STEPS_CONFIG.map((step, index) => (
                  <span key={`${step.id}-label`} className={`text-xs sm:text-sm ${currentStepIdx >= index ? 'font-semibold text-blue-700' : 'text-gray-500'}`}>
                      {step.label}
                  </span>
               ))}
           </div>
      </div>

      {/* Status Message & Actions */}
      <div className="w-full max-w-md text-center p-6 border rounded-lg shadow-md bg-white">
        {error ? (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-red-700">Generation Failed</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            {/* Add Retry Button (8.6 - deferred) */}
             <button className="mt-4 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">Try Again (Not Implemented)</button>
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
          <>
            <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
            <h2 className="text-xl font-semibold mb-2">Processing...</h2>
            <p className="text-gray-600 mb-4">
                Current Step: <span className="font-medium">{STEPS_CONFIG[currentStepIdx]?.label || 'Initializing'}...</span>
            </p>
            {eta !== null && <p className="text-sm text-gray-500 mb-4">Estimated time remaining: {Math.ceil(eta)} seconds</p>}
             {/* Removed Skeleton Loader (8.5) - replaced with simpler placeholder */}
            <div className="space-y-3 mt-4 p-4 border border-dashed border-gray-300 rounded">
              <p className="text-sm text-gray-500">Visual preview loading...</p>
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