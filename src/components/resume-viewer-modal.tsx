'use client';
import React, { useEffect, useState, useRef } from 'react';
import type * as PdfJs from 'pdfjs-dist';
import { XMarkIcon, ArrowLeftIcon, ArrowRightIcon, ArrowsPointingOutIcon, DownloadIcon } from './icons';
import type { AnalysisResult } from '@/lib/types';


const pdfjsLibPromise = import('pdfjs-dist');
let pdfjsLib: typeof PdfJs | null = null;
pdfjsLibPromise.then(lib => {
  pdfjsLib = lib;
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.3.136/build/pdf.worker.mjs`;
  }
});

interface ResumeViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  result: AnalysisResult['rankedResumes'][0];
  details: AnalysisResult['details'][string];
  resumeContent?: string;
  resumeUrl?: string;
}

interface PdfPreviewProps {
    fileUrl: string;
    onDownload: () => void;
}

const PdfPreview: React.FC<PdfPreviewProps> = ({ fileUrl, onDownload }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const renderPdf = async () => {
            try {
                if (!pdfjsLib) {
                    pdfjsLib = await pdfjsLibPromise;
                    if (pdfjsLib) {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.3.136/build/pdf.worker.mjs`;
                    }
                }
                if (!fileUrl || !containerRef.current || !pdfjsLib) return;
                
                setStatus('loading');
                const container = containerRef.current;
                container.innerHTML = ''; // Clear previous renders
                setError(null);

                const loadingTask = pdfjsLib.getDocument(fileUrl);
                const pdf = await loadingTask.promise;
                const numPages = pdf.numPages;

                for (let i = 1; i <= numPages; i++) {
                    const page = await pdf.getPage(i);
                    const containerWidth = container.clientWidth || 800;
                    const viewport = page.getViewport({ scale: 1 });
                    const scale = (containerWidth / viewport.width) * 0.98;
                    const scaledViewport = page.getViewport({ scale: scale });
                    
                    const canvas = document.createElement('canvas');
                    canvas.className = 'mb-4 shadow-lg';
                    const context = canvas.getContext('2d');
                    if (!context) continue;

                    canvas.height = scaledViewport.height;
                    canvas.width = scaledViewport.width;
                    container.appendChild(canvas);

                    const renderContext = {
                        canvasContext: context,
                        viewport: scaledViewport,
                    };
                    await page.render(renderContext).promise;
                }
                setStatus('success');
            } catch (err) {
                console.error('Error rendering PDF with PDF.js:', err);
                setError('Could not display PDF preview. The file might be corrupted or in an unsupported format.');
                setStatus('error');
            }
        };

        renderPdf();
    }, [fileUrl]);

    return (
        <div className="w-full h-full bg-slate-300 overflow-y-auto">
            {status === 'loading' && <div className="flex items-center justify-center h-full text-slate-600"><p>Loading PDF preview...</p></div>}
            {status === 'error' && (
                 <div className="bg-white w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-700">
                    <h3 className="text-xl font-semibold mb-2">PDF Preview Failed</h3>
                    <p className="max-w-md">{error}</p>
                    <button onClick={onDownload} className="mt-6 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                        <DownloadIcon />
                        <span>Download Original File</span>
                    </button>
                 </div>
            )}
             <div className="absolute top-2 right-14 z-10">
                <button onClick={onDownload} className="inline-flex items-center gap-2 rounded-md bg-slate-800/50 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700" title="Download">
                    <DownloadIcon />
                </button>
            </div>
            <div ref={containerRef} className="p-2 sm:p-4 md:p-6 flex flex-col items-center" style={{ visibility: status === 'success' ? 'visible' : 'hidden' }}></div>
        </div>
    );
};

const TextView: React.FC<{ content: string, title: string, score: number, highlights: string, onDownload?: () => void, hasFile: boolean }> = ({ content, title, score, highlights, onDownload, hasFile }) => (
    <div className="bg-white rounded-lg shadow-xl w-full h-full overflow-y-auto p-8 text-slate-800">
        <div className="flex justify-between items-start">
            <div>
                <h3 className="text-2xl font-bold text-slate-900">{title}</h3>
            </div>
            <div className="text-right flex-shrink-0 ml-4">
                <p className="text-sm text-slate-500">Match Score</p>
                <p className="text-2xl font-bold text-blue-600">{score} <span className="text-base font-normal">/ 100</span></p>
            </div>
        </div>

        <div className="border-t my-6"></div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
                <div>
                    <h4 className="text-lg font-semibold text-slate-800 mb-3">Resume Content</h4>
                        <pre className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 p-4 rounded-md">{content || 'No content available.'}</pre>
                </div>
            </div>
            <div className="md:col-span-1">
                <div className="bg-slate-50 p-4 rounded-lg sticky top-6">
                    <h4 className="text-base font-semibold text-slate-800 mb-3">AI Review</h4>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{highlights}</p>
                        {hasFile && onDownload && (
                        <div className="mt-6 text-center border-t pt-4">
                                <button onClick={onDownload} className="inline-flex w-full justify-center items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                                <DownloadIcon /><span>Download Original</span>
                                </button>
                        </div>
                        )}
                </div>
            </div>
        </div>
    </div>
);


export const ResumeViewerModal: React.FC<ResumeViewerModalProps> = ({
  isOpen, onClose, onNext, onPrev, hasNext, hasPrev, result, details, resumeContent, resumeUrl
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  
  const isPdf = resumeUrl?.toLowerCase().endsWith('.pdf');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasNext) onNext();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onNext, onPrev, hasNext, hasPrev]);

  const handleFullscreen = () => {
    if (modalRef.current) {
        if (!document.fullscreenElement) modalRef.current.requestFullscreen();
        else document.exitFullscreen();
    }
  };
  
  const handleDownload = () => {
    if(!resumeUrl) return;
    const link = document.createElement('a');
    link.href = resumeUrl;
    link.download = result.filename;
    link.target = '_blank'; // Open in new tab to avoid issues
    link.click();
  };

  if (!isOpen) return null;
  
  const canDownload = !!resumeUrl;

  return (
    <div ref={modalRef} className="fixed inset-0 bg-black/75 z-50 flex flex-col p-4" role="dialog" aria-modal="true">
      <header className="flex-shrink-0 flex items-center justify-between text-white p-2 bg-slate-800/50 rounded-t-lg">
        <h2 className="text-lg font-semibold truncate" title={result.filename}>Viewing: {result.filename}</h2>
        <div className="flex items-center gap-4">
            <button onClick={handleFullscreen} className="text-slate-300 hover:text-white" title="Toggle Fullscreen"><ArrowsPointingOutIcon /></button>
            <button onClick={onClose} className="text-slate-300 hover:text-white" title="Close (Esc)"><XMarkIcon /></button>
        </div>
      </header>

      <main className="flex-grow bg-slate-200 flex items-center justify-center overflow-hidden relative">
        {isPdf && resumeUrl ? (
            <PdfPreview fileUrl={resumeUrl} onDownload={handleDownload} />
        ) : resumeContent ? (
            <TextView
                content={resumeContent}
                title={result.filename}
                score={result.score}
                highlights={result.highlights}
                onDownload={canDownload ? handleDownload : undefined}
                hasFile={canDownload}
            />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600 p-8 text-center">
             <div>
                <h3 className="text-xl font-semibold mb-2">No Preview Available</h3>
                <p>The content for this file type cannot be displayed directly.</p>
                {canDownload && (
                     <button onClick={handleDownload} className="mt-6 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                        <DownloadIcon />
                        <span>Download Original File</span>
                    </button>
                )}
            </div>
          </div>
        )}
      </main>

      <footer className="flex-shrink-0 flex items-center justify-center p-2 bg-slate-800/50 rounded-b-lg">
        <div className="flex items-center gap-8">
          <button onClick={onPrev} disabled={!hasPrev} className="flex items-center gap-2 text-white disabled:text-slate-500 hover:text-blue-300 transition-colors" title="Previous (Left Arrow)">
            <ArrowLeftIcon /><span>Previous</span>
          </button>
          <button onClick={onNext} disabled={!hasNext} className="flex items-center gap-2 text-white disabled:text-slate-500 hover:text-blue-300 transition-colors" title="Next (Right Arrow)">
            <span>Next</span><ArrowRightIcon />
          </button>
        </div>
      </footer>
    </div>
  );
};
