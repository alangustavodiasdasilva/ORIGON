import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HVIUploadProps {
    onUpload: (files: File[]) => void;
    isProcessing: boolean;
    maxFiles?: number;
    disabled?: boolean;
}

export default function HVIUpload({ onUpload, isProcessing, maxFiles = 28, disabled = false }: HVIUploadProps) {
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent) => {
        if (disabled || isProcessing) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        if (disabled || isProcessing) return;
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    };

    const handleFiles = (files: File[]) => {
        if (disabled || isProcessing) return;
        const validFiles = files.filter(file => {
            const isImage = file.type.startsWith('image/');
            const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB
            return isImage && isValidSize;
        });

        if (validFiles.length > 0) {
            onUpload(validFiles.slice(0, maxFiles));
        } else {
            alert("Only PNG/JPG images under 10MB are allowed.");
        }
    };

    const onButtonClick = () => {
        if (disabled || isProcessing) return;
        inputRef.current?.click();
    };

    return (
        <div
            className={cn(
                "relative flex flex-col items-center justify-center w-full min-h-[180px] border transition-all p-6 text-center bg-neutral-50",
                dragActive ? "border-black bg-neutral-100" : "border-neutral-200 hover:border-black",
                (isProcessing || disabled) && "opacity-50 cursor-not-allowed bg-neutral-100"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
        >
            <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleChange}
                accept="image/png, image/jpeg, image/jpg"
                disabled={isProcessing || disabled}
            />

            <div className="flex flex-row items-center gap-8 max-w-xl w-full justify-center">
                <div className="flex-1 text-left space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 border border-black rounded-none bg-white">
                            <Upload className="h-4 w-4 text-black" />
                        </div>
                        <div>
                            <h3 className="text-lg font-serif text-black leading-none">
                                Upload Source
                            </h3>
                            <p className="text-[9px] text-neutral-400 uppercase tracking-[0.2em] font-mono mt-0.5">
                                Drag Images Here
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex-1">
                    <Button
                        onClick={onButtonClick}
                        disabled={isProcessing || disabled}
                        className="w-full h-10 bg-black text-white hover:bg-neutral-800 rounded-none font-bold text-[9px] uppercase tracking-[0.2em] border border-transparent hover:border-black hover:bg-white hover:text-black transition-colors"
                    >
                        Select Files
                    </Button>
                    <div className="flex gap-4 text-[8px] font-mono uppercase tracking-widest text-neutral-300 mt-2 justify-center">
                        <span>PNG/JPG</span>
                        <span>Max 10MB</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
