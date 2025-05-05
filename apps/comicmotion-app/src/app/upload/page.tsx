'use client';

import React from 'react';
import { ImageUploader } from '@/components/ImageUploader'; // Assuming @ maps to src/
import { useRouter } from 'next/navigation'; // Need useRouter for navigation

// Define the expected type for the upload info object received from ImageUploader
// Ensure this matches the object passed by onUploadComplete in ImageUploader
type UploadInfo = {
  key: string;
  previewUrl: string;
  filename: string;
  contentType: string;
  size: number;
  originalUrl: string;
  avatarId: string; // <<< Add avatarId here
}

export default function UploadPage() {
  const router = useRouter(); // Initialize router

  // Updated function signature to match the modified onUploadComplete prop
  const handleUploadSuccess = (uploadInfo: UploadInfo) => {
    console.log('Upload & Generation API Call Success!', uploadInfo);
    // Use the avatarId received from the component for navigation
    if (uploadInfo.avatarId) {
        console.log(`Navigating to themes page with Avatar ID: ${uploadInfo.avatarId}`);
        // Uncomment and use avatarId for navigation
        router.push(`/themes?avatarId=${encodeURIComponent(uploadInfo.avatarId)}`); 
    } else {
        // Handle case where avatarId might be missing (shouldn't happen with previous change)
        console.error('Avatar ID missing in upload success callback!');
        alert('Something went wrong, could not proceed to theme selection.');
    }
    // Remove the old placeholder alert
    // alert(`Upload successful! Key: ${uploadInfo.key}`); 
  };

  const handleUploadError = (error: string) => {
    console.error('Upload or Generation Trigger Failed:', error);
    alert(`Operation failed: ${error}`); // Placeholder feedback
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Step 1: Upload Your Selfie</h1>
      <div className="max-w-lg mx-auto">
        <ImageUploader 
          onUploadComplete={handleUploadSuccess} 
          onUploadError={handleUploadError}
          // We are not using onAvatarGenerationStart or onAvatarGenerationComplete here
          // as navigation happens immediately after the generation API call returns.
        />
      </div>
    </div>
  );
} 