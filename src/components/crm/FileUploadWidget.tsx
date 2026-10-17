import React, { useRef } from 'react';
import { Upload, X, FileText, Check, Paperclip, Download } from 'lucide-react';
import type { UploadedFileMeta } from '../../types/operations';

interface FileUploadWidgetProps {
  label?: string;
  files?: UploadedFileMeta[];
  onChange: (files: UploadedFileMeta[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  helperText?: string;
}

export const FileUploadWidget: React.FC<FileUploadWidgetProps> = ({
  label,
  files = [],
  onChange,
  multiple = true,
  disabled = false,
  helperText
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selectedFiles = Array.from(e.target.files);

    const newMetas: UploadedFileMeta[] = await Promise.all(
      selectedFiles.map(file => {
        return new Promise<UploadedFileMeta>((resolve) => {
          // If file is reasonably small (< 5MB), store data URL for preview/download
          if (file.size < 5 * 1024 * 1024) {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                name: file.name,
                size: file.size,
                type: file.type || 'application/octet-stream',
                uploadedAt: new Date().toISOString(),
                dataUrl: reader.result as string
              });
            };
            reader.onerror = () => {
              resolve({
                id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                name: file.name,
                size: file.size,
                type: file.type || 'application/octet-stream',
                uploadedAt: new Date().toISOString()
              });
            };
            reader.readAsDataURL(file);
          } else {
            resolve({
              id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              name: file.name,
              size: file.size,
              type: file.type || 'application/octet-stream',
              uploadedAt: new Date().toISOString()
            });
          }
        });
      })
    );

    if (multiple) {
      onChange([...files, ...newMetas]);
    } else {
      onChange(newMetas.slice(0, 1));
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (indexToRemove: number) => {
    if (disabled) return;
    onChange(files.filter((_, idx) => idx !== indexToRemove));
  };

  const handleDownload = (file: UploadedFileMeta) => {
    if (file.dataUrl) {
      const link = document.createElement('a');
      link.href = file.dataUrl;
      link.download = file.name;
      link.click();
    } else {
      alert(`File "${file.name}" was registered in frontend demo state.`);
    }
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
          <span>{label} {multiple ? '(Multiple)' : ''}</span>
          {files.length > 0 && (
            <span className="text-[10px] text-gray-400 font-normal">
              {files.length} file{files.length > 1 ? 's' : ''} attached
            </span>
          )}
        </label>
      )}

      {/* Upload Zone */}
      {!disabled && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border border-dashed border-gray-300 hover:border-be-orange hover:bg-orange-50/20 rounded-xl p-2.5 text-center cursor-pointer transition-all group flex items-center justify-center gap-2 bg-gray-50/60"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple={multiple}
            onChange={handleFileSelect}
            className="hidden"
            disabled={disabled}
          />
          <div className="w-6 h-6 rounded-lg bg-white shadow-2xs border border-gray-200 flex items-center justify-center text-gray-400 group-hover:text-be-orange group-hover:border-orange-200 transition-colors">
            <Upload size={12} />
          </div>
          <span className="text-xs text-gray-600 font-medium group-hover:text-be-orange transition-colors">
            {files.length > 0 ? 'Upload additional files' : 'Click to upload files'}
          </span>
          <span className="text-[10px] text-gray-400">PDF, DOC, IMG up to 10MB</span>
        </div>
      )}

      {helperText && <p className="text-[10px] text-gray-400">{helperText}</p>}

      {/* Uploaded Files Chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {files.map((file, idx) => (
            <div
              key={file.id || idx}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 shadow-2xs group hover:border-gray-300 transition-all max-w-full"
            >
              <Paperclip size={11} className="text-gray-400 shrink-0" />
              <span className="font-medium truncate max-w-[140px] sm:max-w-[200px]" title={file.name}>
                {file.name}
              </span>
              <span className="text-[10px] text-gray-400 shrink-0">
                ({formatFileSize(file.size)})
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(file);
                }}
                className="text-gray-400 hover:text-blue-600 transition-colors p-0.5 cursor-pointer"
                title="Download / View"
              >
                <Download size={11} />
              </button>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile(idx);
                  }}
                  className="text-gray-400 hover:text-rose-600 transition-colors p-0.5 cursor-pointer"
                  title="Remove file"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
