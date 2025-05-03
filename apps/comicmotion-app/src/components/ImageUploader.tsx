'use client'; // Required for hooks like useState, useEffect

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone, FileRejection, Accept } from 'react-dropzone';
import { useQuery } from '@tanstack/react-query'; // Import useQuery

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
  onUploadComplete: (uploadInfo: { key: string; previewUrl: string; filename: string; contentType: string; size: number; originalUrl: string }) => void;
  onUploadError: (error: string) => void;
  // Callback when avatar generation *starts* successfully (job ID received)
  onAvatarGenerationStart?: (avatarJobId: string) => void;
  // Callback when avatar generation *finishes* (completed or failed)
  onAvatarGenerationComplete?: (result: { success: boolean; avatarId: string; avatarUrl?: string | null; error?: string | null }) => void;
}

const MINIO_ENDPOINT = process.env.NEXT_PUBLIC_S3_ENDPOINT_URL;
const BUCKET_NAME = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;

export function ImageUploader({ 
    onUploadComplete, 
    onUploadError, 
    onAvatarGenerationStart, // Added prop
    onAvatarGenerationComplete // Added prop
}: ImageUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // const [isGenerating, setIsGenerating] = useState(false); // Remove this, use polling status
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [avatarJobId, setAvatarJobId] = useState<string | null>(null); // Store the Job ID

  // --- Polling Logic using React Query ---
  const { data: jobStatus, isLoading: isPolling } = useQuery<JobStatus, Error>({
    queryKey: ['avatarStatus', avatarJobId], // Query key includes the job ID
    queryFn: async () => {
      if (!avatarJobId) throw new Error('No job ID to poll');
      const response = await fetch(`/api/job/${avatarJobId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch job status');
      }
      return response.json();
    },
    enabled: !!avatarJobId, // Only run the query if avatarJobId is set
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
    if (jobStatus?.status === 'completed' || jobStatus?.status === 'failed') {
      if (avatarJobId) { // Ensure we have the job ID
         onAvatarGenerationComplete?.({
           success: jobStatus.status === 'completed',
           avatarId: avatarJobId,
           avatarUrl: jobStatus.avatarUrl,
           error: jobStatus.error
         });
      }
      setAvatarJobId(null); // Stop polling by clearing the job ID
    }
    // Handle polling errors displayed to user
    if (jobStatus?.error && jobStatus?.status === 'failed') {
        setErrorMessage(`Generation failed: ${jobStatus.error}`);
    }
  }, [jobStatus, avatarJobId, onAvatarGenerationComplete]);


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
    // setIsGenerating(false); // Removed
    setAvatarJobId(null); // Reset job ID
    setErrorMessage(null);

    let uploadKey = '';

    try {
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
        const errorData = await presignResponse.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
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
      setIsUploading(false);

      if (!MINIO_ENDPOINT || !BUCKET_NAME) {
        console.warn("MinIO endpoint/bucket env vars not set, cannot construct original URL");
        throw new Error("MinIO configuration missing in environment.");
      }
      const originalUrl = `${MINIO_ENDPOINT}/${BUCKET_NAME}/${uploadKey}`;

      // Notify parent that upload is complete (BEFORE starting generation)
      onUploadComplete({ 
          key: uploadKey, 
          previewUrl: preview, 
          filename: selectedFile.name, 
          contentType: selectedFile.type, 
          size: selectedFile.size,
          originalUrl: originalUrl
      });

      console.log('Triggering avatar generation...');
      // setIsGenerating(true); // Removed
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
        const errorData = await generateResponse.json();
        throw new Error(errorData.error || 'Failed to start avatar generation');
      }

      // Start polling by setting the job ID
      const { avatarId } = await generateResponse.json();
      console.log('Avatar generation job started, polling ID:', avatarId);
      setAvatarJobId(avatarId);
      onAvatarGenerationStart?.(avatarId); // Notify parent generation started

    } catch (error: unknown) {
      let message = 'An unexpected error occurred.';
      if (error instanceof Error) {
        message = error.message;
      }
      console.error("Operation error:", error);
      setErrorMessage(message);
      onUploadError(message);
      // Ensure we stop any potential residual states
      setIsUploading(false);
      setAvatarJobId(null); // Ensure polling stops if initiation failed
    }
    // Don't set isUploading false here, let the polling status dictate UI state
  };

  // Determine button state and text based on polling status
  const isGenerating = !!avatarJobId && (jobStatus?.status === 'queued' || jobStatus?.status === 'processing' || isPolling);
  let buttonText = 'Upload & Generate';
  if (isUploading) buttonText = 'Uploading...';
  else if (isGenerating) buttonText = `Generating Avatar (${jobStatus?.status || 'starting'})...`;
  else if (jobStatus?.status === 'completed') buttonText = 'Generation Complete!';
  else if (jobStatus?.status === 'failed') buttonText = 'Generation Failed';

  return (
    <div className="flex flex-col items-center space-y-4 p-4 border border-dashed border-gray-400 rounded-lg">
      <div
        {...getRootProps()}
        className={`w-full p-10 border-2 border-dashed rounded-lg text-center cursor-pointer ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
      >
        <input {...getInputProps({})} />
        {isDragActive ? (
          <p className="text-blue-600">Drop the selfie here ...</p>
        ) : (
          <p className="text-gray-500">Drag &apos;n&apos; drop your selfie here, or click to select file (JPG/PNG, max 8MB)</p>
        )}
      </div>

      {/* Display detailed status during generation if needed */}
      {isGenerating && jobStatus?.status && (
          <p className="text-blue-500 text-sm">Status: {jobStatus.status}</p>
      )}

      {errorMessage && (
        <p className="text-red-500 text-sm">{errorMessage}</p>
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
          disabled={isUploading || isGenerating}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {buttonText}
        </button>
      )}
    </div>
  );
} 