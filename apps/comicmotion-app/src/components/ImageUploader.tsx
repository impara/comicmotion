'use client'; // Required for hooks like useState, useEffect

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone, FileRejection, Accept } from 'react-dropzone';
import { useQuery } from '@tanstack/react-query'; // Import useQuery
import { Loader2 } from 'lucide-react';

// Define the API response type from /api/avatar/generate
interface GenerateApiResponse {
  avatarId: string;
  // Add other fields if returned by the API
}

// Interface for the job status API response
interface JobStatus {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  avatarUrl?: string | null;
  error?: string | null;
}

// Define constants for validation (matching the backend)
const ALLOWED_CONTENT_TYPES: Accept = {
  'image/jpeg': ['.jpeg', '.jpg'],
  'image/png': ['.png'],
};
const MAX_FILE_SIZE_MB = 8;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface ImageUploaderProps {
  onUploadComplete: (uploadInfo: { 
      key: string; 
      previewUrl: string; 
      filename: string; 
      contentType: string; 
      size: number; 
      originalUrl: string; 
      avatarId: string;
  }) => void;
  onUploadError: (error: string) => void;
  // Callback when avatar generation *starts* successfully (job ID received)
  // onAvatarGenerationStart?: (avatarJobId: string) => void;
  // Callback when avatar generation *finishes* (completed or failed)
  // onAvatarGenerationComplete?: (result: { success: boolean; avatarId: string; avatarUrl?: string | null; error?: string | null }) => void;
}

const MINIO_ENDPOINT = process.env.NEXT_PUBLIC_S3_ENDPOINT_URL;
const BUCKET_NAME = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;

export function ImageUploader({ 
    onUploadComplete, 
    onUploadError 
    // Remove unused props
    // onAvatarGenerationStart,
    // onAvatarGenerationComplete
}: ImageUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [avatarJobId, setAvatarJobId] = useState<string | null>(null); // Store the Avatar ID (which is the Job ID for polling)
  // State to hold upload details temporarily until generation completes
  const [pendingUploadInfo, setPendingUploadInfo] = useState<Omit<Parameters<ImageUploaderProps['onUploadComplete']>[0], 'avatarId'> | null>(null);

  // --- Polling Logic using React Query ---
  const { data: jobStatus, error: pollingError, isLoading: isPolling } = useQuery<JobStatus, Error>({
    queryKey: ['avatarStatus', avatarJobId], 
    queryFn: async () => {
      if (!avatarJobId) throw new Error('No job ID to poll');
      const response = await fetch(`/api/job/${avatarJobId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch job status');
      }
      return response.json();
    },
    enabled: !!avatarJobId, 
    refetchInterval: (query) => {
      // Stop polling if the job is completed or failed
      const status = query.state.data?.status;
      return status === 'completed' || status === 'failed' ? false : 2000; // Poll every 2 seconds
    },
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => {
        // Don't retry endlessly on certain errors, e.g., 404 Not Found
        if (error.message.includes('Job not found') || failureCount > 5) {
            return false;
        }
        return true; // Retry on other errors
    },
    gcTime: 1000 * 60 * 5, // Keep data for 5 mins after inactive
  });

  // --- Effect to handle polling completion --- 
  useEffect(() => {
    // Check if polling finished successfully
    if (jobStatus?.status === 'completed' && avatarJobId && pendingUploadInfo) {
        console.log('Avatar generation completed via polling. Triggering navigation.');
        onUploadComplete({ 
            ...pendingUploadInfo, // Spread the stored upload info
            avatarId: avatarJobId // Add the confirmed avatarId
        });
        setAvatarJobId(null); // Stop polling
        setPendingUploadInfo(null); // Clear temp state
    }
    // Check if polling finished with failure
    else if (jobStatus?.status === 'failed' && avatarJobId) {
      console.error('Avatar generation failed via polling:', jobStatus.error);
      const errorMsg = `Avatar generation failed: ${jobStatus.error || 'Unknown reason'}`;
      setErrorMessage(errorMsg); 
      onUploadError(errorMsg);
      setAvatarJobId(null); // Stop polling
      setPendingUploadInfo(null); // Clear temp state
    }
    // Handle query fetch errors
    else if (pollingError) {
       console.error('Polling query error:', pollingError);
       // Display a generic error, as polling will retry based on query config
       setErrorMessage(`Error checking status: ${pollingError.message}`);
       // Consider if we should call onUploadError here or let retry handle it
    } 

  }, [jobStatus, pollingError, avatarJobId, pendingUploadInfo, onUploadComplete, onUploadError]);


  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    setErrorMessage(null); // Clear previous errors
    setSelectedFile(null);
    setPreview(null);
    setAvatarJobId(null); // Reset job ID on new file selection

    if (fileRejections.length > 0) {
      const firstRejection = fileRejections[0];
      const error = firstRejection.errors[0];
      let specificErrorMsg = error.message; // Default message

      if (error.code === 'file-too-large') {
        specificErrorMsg = `File is larger than ${MAX_FILE_SIZE_MB}MB`; // Use MB constant
      } else if (error.code === 'file-invalid-type') {
        specificErrorMsg = 'Invalid file type. Only JPG/PNG allowed.';
      }
      console.error('File rejected:', fileRejections);
      setErrorMessage(specificErrorMsg);
      onUploadError(specificErrorMsg); // Notify parent
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, [onUploadError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_CONTENT_TYPES,
    maxSize: MAX_FILE_SIZE_BYTES,
    multiple: false,
  });

  const handleUploadAndGenerate = async () => {
    if (!selectedFile || !preview) return;

    setIsUploading(true);
    setAvatarJobId(null); 
    setPendingUploadInfo(null); // Clear previous pending info
    setErrorMessage(null);

    let uploadKey = '';
    let originalUrl = ''; 
    let avatarId = ''; 

    try {
      // Step 1: Upload (same as before)
      console.log('Requesting pre-signed URL...');
      const presignResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type,
        }),
      });

      if (!presignResponse.ok) {
        let errorMsg = 'Failed to get upload URL.'; // Default message
        try {
          // Try to parse the structured error from our API
          const errorData = await presignResponse.json();
          errorMsg = errorData.error || errorMsg; // Use API error if available
        } catch (parseError) {
          console.warn('Could not parse presign error response JSON.', parseError);
        }
        throw new Error(errorMsg);
      }

      const { uploadUrl, key } = await presignResponse.json();
      uploadKey = key;
      console.log('Got pre-signed URL and key:', key);

      console.log('Uploading file to MinIO...');
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type,
        },
      });

      if (!uploadResponse.ok) {
        let errorMsg = 'Failed to upload file.';
        try {
          const errorXml = await uploadResponse.text();
          const match = errorXml.match(/<Message>(.*?)<\/Message>/);
          if (match && match[1]) {
            errorMsg = `Upload failed: ${match[1]}`;
          }
        } catch (xmlParseError) { 
          console.warn("Could not parse S3 error XML", xmlParseError);
        }
        throw new Error(errorMsg);
      }
      console.log('File uploaded successfully!');

      // <<< Construct the actual MinIO URL HERE >>>
      originalUrl = `${MINIO_ENDPOINT}/${BUCKET_NAME}/${uploadKey}`;
      console.log('Constructed originalUrl:', originalUrl);

      // Store upload info temporarily (can use the constructed URL now)
      const tempUploadInfo = { 
          key: uploadKey, 
          previewUrl: preview, 
          filename: selectedFile.name, 
          contentType: selectedFile.type, 
          size: selectedFile.size,
          originalUrl: originalUrl 
      };

      // Step 2: Call Generate API (Now with correct originalUrl)
      console.log('Triggering avatar generation API...');
      const generateResponse = await fetch('/api/avatar/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            imageKey: uploadKey,
            originalUrl: originalUrl, 
            filename: selectedFile.name,
            contentType: selectedFile.type,
            size: selectedFile.size,
        }),
      });

      if (!generateResponse.ok) {
        let errorMsg = 'Failed to start avatar generation.'; // Default message
        try {
           // Try to parse the structured error from our API
          const errorData = await generateResponse.json();
          errorMsg = errorData.error || errorMsg;
        } catch (parseError) {
             console.warn('Could not parse generation error response JSON.', parseError);
        }
        throw new Error(errorMsg);
      }
      
      // Get avatarId from the response
      const generateResult: GenerateApiResponse = await generateResponse.json();
      avatarId = generateResult.avatarId; 
      console.log('Avatar generation API call successful, Avatar ID:', avatarId);
      setIsUploading(false); // Now API call is done, uploading phase is over

      // Step 3: Store Info and Start Polling (NO Navigation Yet)
      setPendingUploadInfo(tempUploadInfo); // Store info needed for later navigation
      setAvatarJobId(avatarId); // Start polling by setting the ID
      console.log('Polling started for Avatar ID:', avatarId);
      // Do NOT call onUploadComplete here anymore

    } catch (error: unknown) {
      let message = 'An unexpected error occurred.';
      // Attempt to parse structured API errors
      if (error instanceof Error) {
        message = error.message; // Default to standard message
        // Check if it might be a failed fetch response (tricky without knowing the exact error type)
        // A more robust way involves checking error.response if using a library like axios,
        // but with native fetch, we often get a generic TypeError for network errors,
        // or the error occurs *after* fetch resolves when processing the response body.
        // Let's refine the error handling within the specific fetch calls instead.
      }
      console.error("Operation error:", error);
      setErrorMessage(message);
      onUploadError(message);
      // Ensure we stop any potential residual states
      setIsUploading(false);
      setAvatarJobId(null); // Ensure polling stops if initiation failed
      setPendingUploadInfo(null);
    }
  };

  // Determine button state and text based on upload/polling status
  const isGenerating = !!avatarJobId; // Generation phase starts when polling starts
  const pollingStatus = jobStatus?.status;
  let buttonText = 'Upload & Generate';
  let buttonDisabled = !selectedFile; // Initial disable state

  if (isUploading) {
      buttonText = 'Uploading...';
      buttonDisabled = true;
  } else if (isGenerating) {
      buttonDisabled = true; // Disable while generating
      if (pollingStatus === 'processing' || pollingStatus === 'queued' || isPolling) {
          buttonText = `Generating Avatar...`;
      } else if (pollingStatus === 'completed') {
          // This state is brief as useEffect triggers navigation
          buttonText = 'Generation Complete!'; 
      } else if (pollingStatus === 'failed') {
          buttonText = 'Generation Failed'; 
          buttonDisabled = false; // Allow retry/new upload after failure
      } else {
           buttonText = 'Starting Generation...'; // Initial state after API call
      }
  } else if (errorMessage) {
       // If there was an error before polling started (e.g., upload failed)
       buttonDisabled = false; // Allow retry/new upload
  }

  return (
    <div className="flex flex-col items-center space-y-4 p-4 border border-dashed border-gray-400 rounded-lg">
      <div
        {...getRootProps()}
        className={`w-full p-10 border-2 border-dashed rounded-lg text-center cursor-pointer ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'} ${isUploading || isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps({ disabled: isUploading || isGenerating })} />
        {isDragActive ? (
          <p className="text-blue-600">Drop the selfie here ...</p>
        ) : (
          <p className="text-gray-500">Drag &apos;n&apos; drop your selfie here, or click to select file (JPG/PNG, max 8MB)</p>
        )}
      </div>

      {/* Display generation status more prominently */}
      {isGenerating && (
             <div className="text-center p-2 bg-blue-100 border border-blue-300 rounded-md w-full">
                <p className="text-blue-700 font-medium text-sm flex items-center justify-center">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 
                    Generating Avatar{pollingStatus ? ` (${pollingStatus})` : '...'} 
                </p>
             </div>
        )}
        
        {errorMessage && (
            <p className="text-red-500 text-sm mt-2">{errorMessage}</p>
        )}

        {preview && (
          <div className="mt-4 flex flex-col items-center">
            <h4 className="text-lg font-semibold mb-2">Preview:</h4>
            <img src={preview} alt="Selected preview" className="max-w-xs max-h-48 object-contain rounded" />
          </div>
        )}

        {selectedFile && (
          <button
            onClick={handleUploadAndGenerate}
            disabled={buttonDisabled}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {buttonText}
          </button>
        )}
    </div>
  );
} 