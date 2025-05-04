'use client';

import React, { useState } from 'react';
import { ThemeSelector } from '@/components/ThemeSelector'; // Assuming @ maps to src/
import { useRouter } from 'next/navigation'; // Import useRouter

export default function ThemeSelectionPage() {
  const router = useRouter(); // Initialize useRouter
  
  // Placeholder: In a real app, this would come from the previous step (e.g., state or query params)
  const [avatarId, _setAvatarId] = useState<string>('avatar_placeholder_123'); 

  const handleThemeSelected = (themeId: string) => {
    console.log('Theme Selected:', themeId, 'for Avatar:', avatarId);
    
    if (!avatarId) {
        console.error("Avatar ID is missing, cannot proceed.");
        // Handle error appropriately, e.g., show a message or redirect
        alert("Error: Avatar information missing. Cannot proceed.");
        return;
    }
    
    // Navigate to the next step (e.g., scene preview or generation trigger)
    // Pass both avatarId and themeId as query parameters
    router.push(`/scene-preview?avatarId=${encodeURIComponent(avatarId)}&theme=${encodeURIComponent(themeId)}`); 
    
    // Remove the alert now that we navigate
    // alert(`Theme selected: ${themeId}. Ready for next step!`); 
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Optional: Add header/breadcrumbs if needed */}
      <ThemeSelector onThemeSelect={handleThemeSelected} />
      {/* Optional: Add footer or other elements */}
    </div>
  );
} 