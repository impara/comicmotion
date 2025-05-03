'use client';

import React from 'react';
import { ImageUploader } from '@/components/ImageUploader'; // Assuming @ maps to src/
import { useRouter } from 'next/navigation'; // For redirecting after upload

export default function UploadPage() {
  const router = useRouter();

  const handleUploadSuccess = (key: string, previewUrl: string) => {
    console.log('Upload Success!', { key, previewUrl });
    // Store the key/URL somewhere (e.g., state management, local storage)
    // Redirect to the next step (e.g., theme selection)
    // For now, just log and maybe navigate
    // router.push('/themes?imageKey=' + encodeURIComponent(key));
    alert(`Upload successful! Key: ${key}`); // Placeholder feedback
  };

  const handleUploadError = (error: string) => {
    console.error('Upload Failed:', error);
    // Show error feedback to the user (e.g., toast notification)
    alert(`Upload failed: ${error}`); // Placeholder feedback
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Step 1: Upload Your Selfie</h1>
      <div className="max-w-lg mx-auto">
        <ImageUploader 
          onUploadSuccess={handleUploadSuccess}
          onUploadError={handleUploadError}
        />
      </div>
      {/* Add other page elements here if needed */}
    </div>
  );
} 