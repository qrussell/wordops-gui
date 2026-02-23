import React, { createContext, useState, useContext, useCallback } from 'react';

const ConsoleContext = createContext();

export const useConsole = () => {
  const context = useContext(ConsoleContext);
  if (!context) {
    throw new Error('useConsole must be used within a ConsoleProvider');
  }
  return context;
};

export const ConsoleProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [processName, setProcessName] = useState('System Console');
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([]);

  const open = useCallback(() => {
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const minimize = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const startProcess = useCallback((name) => {
    setProcessName(name);
    setIsRunning(true);
    setLogs([]);
    setIsOpen(true);
    setIsMinimized(false);
    
    // Add initial log
    const timestamp = new Date().toLocaleTimeString();
    setLogs([{ timestamp, message: `Starting process: ${name}...`, type: 'system' }]);
  }, []);

  const log = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  }, []);

  const endProcess = useCallback((status = 'success') => {
    setIsRunning(false);
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { 
      timestamp, 
      message: `Process finished with status: ${status}`, 
      type: status === 'success' ? 'success' : 'error' 
    }]);
  }, []);

  const value = {
    isOpen,
    isMinimized,
    processName,
    isRunning,
    logs,
    open,
    close,
    minimize,
    startProcess,
    log,
    endProcess
  };

  return (
    <ConsoleContext.Provider value={value}>
      {children}
    </ConsoleContext.Provider>
  );
};