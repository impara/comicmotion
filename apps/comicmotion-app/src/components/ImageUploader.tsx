'use client'; // Required for hooks like useState, useEffect

import React, { useState, useCallback } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';

interface ImageUploaderProps {
  onUploadSuccess: (key: string, previewUrl: string) => void;
  onUploadError: (error: string) => void;
}

const MAX_SIZE = 8 * 1024 * 1024; // 8MB from PRD

export function ImageUploader({ onUploadSuccess, onUploadError }: ImageUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    setErrorMessage(null); // Clear previous errors
    setSelectedFile(null);
    setPreview(null);

    if (fileRejections.length > 0) {
      const firstRejection = fileRejections[0];
      const error = firstRejection.errors[0];
      let specificErrorMsg = error.message; // Default message

      if (error.code === 'file-too-large') {
        specificErrorMsg = `File is larger than ${MAX_SIZE / 1024 / 1024}MB`;
      } else if (error.code === 'file-invalid-type') {
        specificErrorMsg = 'Invalid file type. Only JPG/PNG allowed.';
      }
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

  const dropzoneOptions = {
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
    },
    maxSize: MAX_SIZE,
    multiple: false,
  };

  // Pass options directly, destructure later if needed or access via dropzone
  const dropzone = useDropzone(dropzoneOptions);
  const { getRootProps, getInputProps, isDragActive } = dropzone;

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      // 1. Get pre-signed URL from our backend
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

      // 2. Upload the file directly to MinIO using the pre-signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type,
        },
      });

      if (!uploadResponse.ok) {
        // Attempt to read error from MinIO/S3 if possible, otherwise generic
        let errorMsg = 'Failed to upload file.';
        try {
          const errorXml = await uploadResponse.text();
          // Basic XML parsing attempt (might need a library for robust parsing)
          const match = errorXml.match(/<Message>(.*?)<\/Message>/);
          if (match && match[1]) {
            errorMsg = `Upload failed: ${match[1]}`;
          }
        } catch (xmlParseError) { // Catch XML parsing error specifically
          console.warn("Could not parse S3 error XML", xmlParseError);
        }
        throw new Error(errorMsg);
      }

      // Success!
      if (preview) {
        onUploadSuccess(key, preview);
      }

    } catch (error: unknown) { // Catch as unknown, then check type
      let message = 'An unexpected error occurred during upload.';
      if (error instanceof Error) {
        message = error.message;
      }
      console.error("Upload error:", error);
      setErrorMessage(message);
      onUploadError(message);
    } finally {
      setIsUploading(false);
    }
  };

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
          onClick={handleUpload}
          disabled={isUploading}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {isUploading ? 'Uploading...' : 'Upload Selfie'}
        </button>
      )}
    </div>
  );
} 