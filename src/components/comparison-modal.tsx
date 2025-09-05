'use client';
import React, { useEffect, useRef } from 'react';
import type { AnalysisResult } from '@/lib/types';
import { XMarkIcon } from './icons';

interface ComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: AnalysisResult['rankedResumes'];
  details: AnalysisResult['details'];
}

const CandidateColumn: React.FC<{ rankedResume: AnalysisResult['rankedResumes'][0], detail: AnalysisResult['details'][string] }> = ({ rankedResume, detail }) => (
    <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 h-full flex flex-col">
        <div className="flex-shrink-0">
             <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-900">{rankedResume.filename.replace(/_/g, ' ').replace('.txt', '')}</h3>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-sm text-slate-500">Score</p>
                    <p className="text-2xl font-bold text-blue-600">{rankedResume.score}</p>
                </div>
            </div>
             <p className="text-sm mb-4">
                <span className="font-semibold text-slate-600">Experience: </span>
                <span className="text-slate-800">{detail.skills.experienceYears < 0 ? 'N/A' : `${detail.skills.experienceYears} years`}</span>
            </p>
            <div className="border-t border-slate-200 my-4"></div>
        </div>

        <div className="flex-grow overflow-y-auto space-y-6 pr-2 -mr-2">
            <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">AI Summary</h4>
                <p className="text-sm text-slate-600">{rankedResume.highlights}</p>
            </div>
            {detail.keywords.matches?.length > 0 && (
                <div>
                    <h4 className="text-sm font-semibold text-slate-800 mb-2">Matched Skills</h4>
                    <ul className="space-y-2 text-sm text-slate-600 list-disc list-inside">
                        {detail.keywords.matches.slice(0, 4).map((s, i) => <li key={i}><span className="font-medium text-slate-700">{s}</span></li>)}
                         {detail.keywords.matches.length > 4 && <li className="text-slate-500">...and {detail.keywords.matches.length - 4} more.</li>}
                    </ul>
                </div>
            )}
            {detail.keywords.missing?.length > 0 && (
                <div>
                    <h4 className="text-sm font-semibold text-slate-800 mb-2">Missing Skills</h4>
                     <div className="flex flex-wrap gap-1.5">
                        {detail.keywords.missing.map((skill, i) => (
                            <span key={i} className="bg-red-100 text-red-800 px-2 py-0.5 rounded-md text-xs font-medium">{skill}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    </div>
);


export const ComparisonModal: React.FC<ComparisonModalProps> = ({ isOpen, onClose, results, details }) => {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isOpen && e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    
    const gridColsClass = results.length === 2 ? 'grid-cols-2' : 'grid-cols-3';

    return (
        <div 
            ref={modalRef} 
            className="fixed inset-0 bg-black/75 z-50 flex flex-col p-4 sm:p-6 lg:p-8" 
            role="dialog" 
            aria-modal="true"
        >
            <header className="flex-shrink-0 flex items-center justify-between text-white pb-4">
                <h2 className="text-xl font-semibold">
                    Comparing {results.length} Candidates
                </h2>
                <button
                    onClick={onClose}
                    className="text-slate-300 hover:text-white transition-colors p-2 rounded-full bg-slate-800/50"
                    title="Close (Esc)"
                >
                    <XMarkIcon />
                </button>
            </header>

            <main className={`flex-grow grid ${gridColsClass} gap-6 overflow-hidden`}>
                {results.map((result, index) => (
                    <CandidateColumn key={result.filename || index} rankedResume={result} detail={details[result.filename]} />
                ))}
            </main>
        </div>
    );
};
