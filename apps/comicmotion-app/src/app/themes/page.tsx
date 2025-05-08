'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { ThemeSelector } from '@/components/ThemeSelector';
import { useRouter, useSearchParams } from 'next/navigation';

// Define the expected API response structure
interface SceneGenerationResponse {
  workflowId: string;
}

function ThemeSelectionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Get avatarId from URL query parameters on component mount
  useEffect(() => {
    const id = searchParams.get('avatarId');
    if (id) {
      setAvatarId(id);
    } else {
      console.error("Avatar ID is missing from URL parameters.");
      setError("Avatar information missing. Cannot proceed.");
    }
  }, [searchParams]);

  const handleSubmitSelections = async (selections: { themeId: string; action: string; emotion: string; sfx: string }) => {
    const { themeId, action, emotion, sfx } = selections;

    if (!themeId || !avatarId) {
      setError("Please select a theme and ensure avatar information is available.");
      return;
    }
    if (!action || !emotion) { // SFX is optional
      setError("Please provide Action/Goal and Emotion/Tone.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log(`Generating scene with Avatar ID: ${avatarId}, Theme: ${themeId}, Action: ${action}, Emotion: ${emotion}, SFX: ${sfx}`);
      const response = await fetch('/api/scene/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          avatarId, 
          theme: themeId, 
          userAction: action, 
          userEmotion: emotion, 
          userSfx: sfx 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to generate scene. Please try again.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result: SceneGenerationResponse = await response.json();
      console.log('Scene generation started. Workflow ID:', result.workflowId);

      // Explicitly create the target URL string
      const targetUrl = `/progress/${result.workflowId}`;

      // Log the final URL *before* navigation
      console.log(`DEBUG: Navigating to URL: ${targetUrl}`); 

      router.push(targetUrl); // Use the pre-constructed string

    } catch (err: unknown) {
      console.error('Failed to start scene generation:', err);
      const message = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <ThemeSelector onSubmitSelections={handleSubmitSelections} />

      {error && (
        <p className="text-center text-red-600 mt-4">{error}</p>
      )}

      {isLoading && (
        <div className="text-center mt-4">
          <p className="text-lg font-semibold">Processing your request...</p>
          {/* You might want a more sophisticated loading indicator here */}
        </div>
      )}
    </div>
  );
}

export default function ThemeSelectionPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-screen">Loading theme selection...</div>}>
           <ThemeSelectionContent />
        </Suspense>
    );
} 