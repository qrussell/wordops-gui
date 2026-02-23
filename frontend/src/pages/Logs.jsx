import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Download, 
  Pause, 
  Play, 
  Trash2, 
  AlertCircle
} from 'lucide-react';

/**
 * Logs Page
 * Implements:
 * - Section 2.3.1: Log Viewing (Access, Error, Real-time stats).
 * - Section 14.1: Audit Log Features (Filter, Search, Export).
 * - UX: Dark mode console viewer with "Live Tail" simulation.
 */

const Logs = () => {
  const [activeTab, setActiveTab] = useState('audit'); // audit, nginx-access, nginx-error, php
  const [isTailing, setIsTailing] = useState(true);
  const [logs, setLogs] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting, connected, error
  const bottomRef = useRef(null);
  
  // Use ref for isTailing to avoid reconnecting EventSource on toggle
  const isTailingRef = useRef(isTailing);
  useEffect(() => { isTailingRef.current = isTailing; }, [isTailing]);

  useEffect(() => {
    setLogs([]); 
    setConnectionStatus('connecting');
    
    const token = localStorage.getItem('access_token');
    if (!token) {
        setConnectionStatus('error');
        return;
    }

    // EventSource doesn't support custom headers, so we pass token as query param
    const eventSource = new EventSource(`/api/v1/system/logs/stream/${activeTab}?token=${token}`);

    eventSource.onopen = () => {
      setConnectionStatus('connected');
    };

    eventSource.onmessage = (event) => {
      if (isTailingRef.current) {
        let msg = event.data;
        let color = 'text-gray-300';
        
        if (msg.toLowerCase().includes('error')) color = 'text-red-400';
        if (msg.toLowerCase().includes('warning')) color = 'text-yellow-400';

        const newLine = {
          time: new Date().toLocaleTimeString(),
          msg: msg,
          color: color
        };
        setLogs(prev => {
          const updated = [...prev, newLine];
          return updated.slice(-200); // Keep last 200 lines
        });
      }
    };

    eventSource.onerror = () => {
      setConnectionStatus('error');
      eventSource.close();
    };

    return () => eventSource.close();
  }, [activeTab]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isTailing && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isTailing]);

  const handleDownload = () => {
    const logText = logs.map(l => `[${l.time}] ${l.msg}`).join('\n');
    const blob = new Blob([logText], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}_log_${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const cleanText = (text) => {
    // Removes ANSI color codes
    return text.replace(/[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
      
      {/* --- HEADER & CONTROLS --- */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        
        {/* Log Source Selector */}
        <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto">
          <TabButton id="audit" label="Audit Trail" active={activeTab} onClick={setActiveTab} />
          <TabButton id="nginx-access" label="NGINX Access" active={activeTab} onClick={setActiveTab} />
          <TabButton id="nginx-error" label="NGINX Error" active={activeTab} onClick={setActiveTab} />
          <TabButton id="php" label="PHP-FPM" active={activeTab} onClick={setActiveTab} />
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setIsTailing(!isTailing)}
            className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isTailing ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {isTailing ? <><Pause size={14} className="mr-1.5" /> Live</> : <><Play size={14} className="mr-1.5" /> Paused</>}
          </button>
          
          <button onClick={() => setLogs([])} className="p-2 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50" title="Clear View">
             <Trash2 size={16} />
          </button>
          
          <button onClick={handleDownload} className="p-2 text-gray-400 hover:text-blue-500 rounded-md hover:bg-blue-50" title="Download">
             <Download size={16} />
          </button>
        </div>
      </div>

      {/* --- SEARCH BAR --- */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
           <Search size={16} className="text-gray-400" />
        </div>
        <input 
           type="text" 
           placeholder={`Filter ${activeTab} logs...`} 
           className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>

      {/* --- CONSOLE VIEWER --- */}
      <div className="flex-1 bg-gray-900 rounded-lg shadow-inner overflow-hidden flex flex-col font-mono text-sm border border-gray-700">
         {/* Console Header */}
         <div className="bg-gray-800 px-4 py-2 flex justify-between items-center border-b border-gray-700">
            <span className="text-gray-400 text-xs">/var/log/{activeTab === 'audit' ? 'wordops/audit.log' : activeTab.replace('-', '/') + '.log'}</span>
            <span className="text-gray-500 text-xs flex items-center">
               <div className={`w-2 h-2 rounded-full mr-2 ${
                 connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' : 
                 connectionStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
               }`}></div>
               {connectionStatus === 'connected' ? (isTailing ? 'Live Stream' : 'Paused') : 
                connectionStatus === 'error' ? 'Connection Failed' : 'Connecting...'}
            </span>
         </div>
         
         {/* Log Output */}
         <div className="flex-1 p-4 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            {logs.length === 0 && (
               <div className="text-gray-500 italic text-center mt-10">No logs to display...</div>
            )}
            {connectionStatus === 'error' && (
               <div className="flex items-center justify-center text-red-400 mt-4">
                  <AlertCircle size={16} className="mr-2" />
                  <span>Failed to connect to log stream. Check server status.</span>
               </div>
            )}
            {logs.map((log, index) => (
               <div key={index} className="break-all whitespace-pre-wrap hover:bg-gray-800 p-0.5 rounded px-1 flex">
                  <span className="text-gray-500 mr-3 select-none flex-shrink-0">[{log.time}]</span>
                  <span className={`${log.color}`}>{cleanText(log.msg)}</span>
               </div>
            ))}
            <div ref={bottomRef} />
         </div>
      </div>

    </div>
  );
};

// --- Helpers ---

const TabButton = ({ id, label, active, onClick }) => (
  <button
    onClick={() => onClick(id)}
    className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
      active === id
        ? 'bg-blue-600 text-white shadow-sm'
        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
    }`}
  >
    {label}
  </button>
);

export default Logs;
