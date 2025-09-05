'use client';
import React, { useRef } from 'react';
import { UploadIcon, FileIcon, XCircleIcon } from './icons';

interface FileUploadProps {
  title: string;
  description: string;
  onFilesChange: (files: File[]) => void;
  acceptedFiles: string;
  isMultiple: boolean;
  files: File[];
  disabled?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  title,
  description,
  onFilesChange,
  acceptedFiles,
  isMultiple,
  files,
  disabled = false
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNewFiles = (newFiles: File[]) => {
    if (isMultiple) {
      const combined = [...files, ...newFiles];
      const uniqueFiles = combined.filter(
        (file, index, self) =>
          index === self.findIndex((f) => f.name === file.name)
      );
      onFilesChange(uniqueFiles.slice(0, 15));
    } else {
      onFilesChange(newFiles.slice(0, 1));
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleNewFiles(Array.from(event.target.files));
      // Reset the input value to allow re-uploading the same file
      if(inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = (indexToRemove: number) => {
    onFilesChange(files.filter((_, index) => index !== indexToRemove));
  };
  
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (disabled) return;
      handleNewFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
      <h2 className="text-lg font-semibold text-slate-900 mb-1">{title}</h2>
      <p className="text-sm text-slate-500 mb-4">{description}</p>
      <div 
        className={`border-2 border-dashed border-slate-300 rounded-lg p-6 text-center transition-colors ${disabled ? 'cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:border-blue-500 hover:bg-slate-50'}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          multiple={isMultiple}
          accept={acceptedFiles}
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled}
        />
        <div className="flex flex-col items-center">
            <UploadIcon />
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-semibold text-blue-600">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-slate-400 mt-1">{isMultiple ? 'PDF, DOC, DOCX, TXT (max 3MB)' : 'PDF, TXT (max 3MB)'}</p>
        </div>
      </div>
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
            <h3 className="text-sm font-medium text-slate-600">Uploaded Files:</h3>
          {files.map((file, index) => (
            <div key={index} className="flex items-center justify-between bg-slate-100 p-2 rounded-md">
              <div className="flex items-center space-x-2 overflow-hidden">
                <FileIcon />
                <span className="text-sm text-slate-700 truncate">{file.name}</span>
              </div>
              <button onClick={() => handleRemoveFile(index)} className="text-slate-400 hover:text-red-500" disabled={disabled}>
                <XCircleIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
