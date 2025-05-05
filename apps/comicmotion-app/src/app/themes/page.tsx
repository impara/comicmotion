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

  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
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

  const handleThemeSelected = (themeId: string) => {
    setSelectedThemeId(themeId);
    setError(null); // Clear previous errors on new selection
    console.log('Theme Selected:', themeId);
  };

  const handleGenerateScene = async () => {
    if (!selectedThemeId || !avatarId) {
      setError("Please select a theme and ensure avatar information is available.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log(`Generating scene with Avatar ID: ${avatarId} and Theme: ${selectedThemeId}`);
      const response = await fetch('/api/scene/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ avatarId, theme: selectedThemeId }),
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
      <ThemeSelector onThemeSelect={handleThemeSelected} />

      {error && (
        <p className="text-center text-red-600 mt-4">{error}</p>
      )}

      {selectedThemeId && avatarId && (
        <div className="text-center mt-8">
          <button 
            onClick={handleGenerateScene} 
            disabled={isLoading || !avatarId}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Generating...' : 'Generate Scene'}
          </button>
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