import React, { useEffect, useRef } from 'react';
import { 
  X, 
  Minimize2, 
  Maximize2, 
  Terminal, 
  Loader, 
  CheckCircle, 
  AlertTriangle 
} from 'lucide-react';
import { useConsole } from '../context/ConsoleContext';

const ConsoleModal = () => {
  const { 
    isOpen, 
    isMinimized, 
    logs, 
    processName, 
    isRunning, 
    close, 
    minimize, 
    open 
  } = useConsole();
  
  const bottomRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen && !isMinimized && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen, isMinimized]);

  if (!isOpen) return null;

  // --- MINIMIZED STATE (Floating Button) ---
  if (isMinimized) {
    return (
      <button
        onClick={open}
        className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white p-4 rounded-full shadow-lg border border-gray-700 hover:bg-gray-800 transition-all flex items-center gap-3 animate-bounce-in"
      >
        <div className="relative">
          <Terminal size={20} />
          {isRunning && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
          )}
        </div>
        <span className="font-mono text-sm font-medium max-w-[150px] truncate">
          {processName}
        </span>
      </button>
    );
  }

  // --- EXPANDED STATE (Terminal Window) ---
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
      {/* Backdrop (Click to minimize) */}
      <div className="absolute inset-0 bg-black/20 pointer-events-auto" onClick={minimize} />

      {/* Console Window */}
      <div className="pointer-events-auto w-full max-w-3xl m-4 bg-[#0d1117] rounded-lg shadow-2xl border border-gray-700 overflow-hidden flex flex-col max-h-[80vh] font-mono text-sm animate-in slide-in-from-bottom-4">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-md ${isRunning ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
              <Terminal size={16} />
            </div>
            <div>
              <h3 className="text-gray-200 font-semibold leading-none">{processName}</h3>
              <div className="flex items-center gap-2 mt-1">
                {isRunning ? (
                  <>
                    <Loader size={12} className="animate-spin text-blue-400" />
                    <span className="text-xs text-blue-400">Processing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={12} className="text-green-500" />
                    <span className="text-xs text-gray-500">Completed</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={minimize} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors" title="Minimize">
              <Minimize2 size={16} />
            </button>
            <button onClick={close} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-md transition-colors" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Logs Output */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-[#0d1117] min-h-[300px]">
          {logs.length === 0 && (
            <div className="text-gray-600 italic py-4 text-center">Waiting for output...</div>
          )}
          
          {logs.map((log, i) => (
            <div key={i} className="flex gap-3 hover:bg-white/5 px-2 py-0.5 rounded -mx-2">
              <span className="text-gray-600 shrink-0 select-none">[{log.timestamp}]</span>
              <span className={`break-all ${
                log.type === 'error' ? 'text-red-400' :
                log.type === 'success' ? 'text-green-400' :
                log.type === 'system' ? 'text-blue-400 font-bold' :
                'text-gray-300'
              }`}>
                {log.type === 'cmd' && <span className="text-purple-400 mr-2">$</span>}
                {log.message}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
};

export default ConsoleModal;
