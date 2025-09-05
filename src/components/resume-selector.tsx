'use client';

import * as React from 'react';
import type { Resume } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText } from 'lucide-react';

interface ResumeSelectorProps {
  resumes: Resume[];
  onSelectionChange: (selected: Resume[]) => void;
  disabled?: boolean;
}

export default function ResumeSelector({
  resumes,
  onSelectionChange,
  disabled = false,
}: ResumeSelectorProps) {
  const [selectedFilenames, setSelectedFilenames] = React.useState<Set<string>>(new Set());

  const handleCheckboxChange = (filename: string, checked: boolean) => {
    const newSelectedFilenames = new Set(selectedFilenames);
    if (checked) {
      newSelectedFilenames.add(filename);
    } else {
      newSelectedFilenames.delete(filename);
    }
    setSelectedFilenames(newSelectedFilenames);

    const selected = resumes.filter((r) => newSelectedFilenames.has(r.filename));
    onSelectionChange(selected);
  };

  return (
    <ScrollArea className="h-48 w-full rounded-md border p-4">
      <div className="space-y-4">
        {resumes.map((resume) => (
          <div key={resume.filename} className="flex items-center space-x-3">
            <Checkbox
              id={resume.filename}
              onCheckedChange={(checked) => handleCheckboxChange(resume.filename, !!checked)}
              checked={selectedFilenames.has(resume.filename)}
              disabled={disabled}
            />
            <Label
              htmlFor={resume.filename}
              className={`flex items-center gap-2 text-sm font-normal ${disabled ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'}`}
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              {resume.filename}
            </Label>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
