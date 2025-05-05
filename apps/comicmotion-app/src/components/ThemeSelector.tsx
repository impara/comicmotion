'use client';

import React, { useState } from 'react';
import Image from 'next/image'; // Import Next.js Image component

interface Theme {
  id: string;
  name: string;
  // thumbnailPlaceholder: string; // Replace placeholder with actual src
  thumbnailSrc: string; // Path relative to /public directory
  description: string; 
}

const THEMES: Theme[] = [
  {
    id: 'city',
    name: 'Cityscape',
    // thumbnailPlaceholder: 'bg-blue-400',
    thumbnailSrc: '/images/themes/city.jpg', // Assumed path
    description: 'A bustling metropolis environment.'
  },
  {
    id: 'fantasy',
    name: 'Fantasy Realm',
    // thumbnailPlaceholder: 'bg-green-400',
    thumbnailSrc: '/images/themes/fantasy.jpg', // Assumed path
    description: 'An epic landscape with castles and magic.'
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    // thumbnailPlaceholder: 'bg-purple-400',
    thumbnailSrc: '/images/themes/neon.jpg', // Assumed path
    description: 'A futuristic cyberpunk street scene.'
  }
];

interface ThemeSelectorProps {
  onThemeSelect: (themeId: string) => void;
}

export function ThemeSelector({ onThemeSelect }: ThemeSelectorProps) {
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  const handleSelect = (themeId: string) => {
    setSelectedTheme(themeId);
    onThemeSelect(themeId);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-2 sm:px-4">
      <h2 className="text-2xl sm:text-3xl font-semibold text-center mb-6 sm:mb-8">Step 2: Choose Your Scene Theme</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
        {THEMES.map((theme) => (
          <div
            key={theme.id}
            onClick={() => handleSelect(theme.id)}
            className={`
              group border rounded-lg p-3 sm:p-4 cursor-pointer transition-all duration-300 
              hover:shadow-xl hover:scale-[1.03] hover:border-blue-400 
              ${selectedTheme === theme.id 
                ? 'border-blue-600 border-2 ring-2 ring-blue-300 ring-offset-1 shadow-lg scale-[1.02]'
                : 'border-gray-300'}
            `}
          >
            <div className="relative w-full h-48 sm:h-56 rounded-md mb-3 overflow-hidden">
              <Image 
                src={theme.thumbnailSrc}
                alt={`${theme.name} Theme Thumbnail`}
                layout="fill"
                objectFit="cover"
                className="transition-transform duration-300 group-hover:scale-110"
              />
            </div>
            <h3 className="text-lg font-semibold mb-1 text-center">{theme.name}</h3>
            <p className="text-sm text-gray-600 text-center px-1">{theme.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
} 