import React, { useState, useEffect } from 'react';
import { 
  X, 
  Globe, 
  Server, 
  Zap, 
  Shield, 
  Loader, 
  Box, 
  CheckSquare, 
  Square 
} from 'lucide-react';
// Import console hook
import { useConsole } from '../context/ConsoleContext';

const SiteCreateModal = ({ isOpen, onClose, onSiteCreated }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [vaultItems, setVaultItems] = useState([]);
  
  // Access Console
  const { startProcess, log, endProcess } = useConsole();

  const [formData, setFormData] = useState({
    domain: '',
    type: 'wp', 
    phpVersion: '8.1',
    caching: 'redis',
    ssl: true,
    plugins: [] 
  });

  useEffect(() => {
    if (isOpen) {
      fetch('/api/v1/vault', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      })
      .then(res => res.json())
      .then(data => setVaultItems(data.items || []))
      .catch(err => console.error("Failed to load vault", err));
    }
  }, [isOpen]);

  const togglePlugin = (filename) => {
    setFormData(prev => {
      const exists = prev.plugins.includes(filename);
      return {
        ...prev,
        plugins: exists 
          ? prev.plugins.filter(p => p !== filename)
          : [...prev.plugins, filename]
      };
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    
    // 1. OPEN CONSOLE
    startProcess(`Creating Site: ${formData.domain}`);
    log('Validating configuration...', 'cmd');

    try {
      log(`Sending request to backend... (PHP ${formData.phpVersion}, ${formData.caching})`, 'info');
      
      const res = await fetch('/api/v1/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        log('Server accepted request. Background provisioning started.', 'success');
        log('WordOps is now creating the site. This may take 1-2 minutes.', 'info');
        if (formData.plugins.length > 0) {
            log(`Queued installation for ${formData.plugins.length} plugins.`, 'info');
        }
        
        onSiteCreated();
        onClose();
        setStep(1);
        setFormData({ domain: '', type: 'wp', phpVersion: '8.1', caching: 'redis', ssl: true, plugins: [] });
      } else {
        const err = await res.json();
        log(`Failed: ${err.detail || 'Unknown error'}`, 'error');
        alert("Failed to create site");
      }
    } catch (err) {
      log(`Network Error: ${err.message}`, 'error');
      console.error(err);
      alert("Error creating site");
    } finally {
      setLoading(false);
      // We don't call endProcess() immediately so the user can see the logs
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/75" onClick={onClose} />
      
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold text-gray-900">Create New Site</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {step === 1 && (
            <div className="space-y-4 animate-in slide-in-from-left-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domain Name</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  <input 
                    type="text" 
                    autoFocus
                    placeholder="example.com" 
                    className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 border"
                    value={formData.domain}
                    onChange={e => setFormData({...formData, domain: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select 
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 border"
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="wp">WordPress</option>
                    <option value="php">PHP / Laravel</option>
                    <option value="html">Static HTML</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PHP Version</label>
                  <select 
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 border"
                    value={formData.phpVersion}
                    onChange={e => setFormData({...formData, phpVersion: e.target.value})}
                  >
                    <option value="8.3">PHP 8.3</option>
                    <option value="8.2">PHP 8.2</option>
                    <option value="8.1">PHP 8.1</option>
                  </select>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-3">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center text-blue-900">
                       <Zap size={18} className="mr-2" />
                       <span className="text-sm font-medium">Object Caching</span>
                    </div>
                    <select 
                       className="text-sm border-blue-200 rounded bg-white py-1 px-2 text-blue-800"
                       value={formData.caching}
                       onChange={e => setFormData({...formData, caching: e.target.value})}
                    >
                       <option value="redis">Redis</option>
                       <option value="fastcgi">FastCGI</option>
                       <option value="none">Disabled</option>
                    </select>
                 </div>
                 <div className="flex items-center justify-between">
                    <div className="flex items-center text-blue-900">
                       <Shield size={18} className="mr-2" />
                       <span className="text-sm font-medium">Secure SSL</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={formData.ssl}
                      onChange={e => setFormData({...formData, ssl: e.target.checked})}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                 </div>
              </div>
            </div>
          )}

          {step === 2 && (
             <div className="space-y-4 animate-in slide-in-from-right-4">
                <div className="flex items-center justify-between">
                   <h4 className="font-medium text-gray-900 flex items-center">
                      <Box size={18} className="mr-2 text-blue-600" /> 
                      Select Vault Items
                   </h4>
                   <span className="text-xs text-gray-500">{formData.plugins.length} selected</span>
                </div>
                
                {vaultItems.length === 0 ? (
                   <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      <p className="text-sm text-gray-500">Your Vault is empty.</p>
                      <p className="text-xs text-gray-400 mt-1">Go to Library to upload plugins/themes.</p>
                   </div>
                ) : (
                   <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-2">
                      {vaultItems.map(item => (
                         <div 
                            key={item.name}
                            onClick={() => togglePlugin(item.name)}
                            className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                               formData.plugins.includes(item.name) 
                               ? 'bg-blue-50 border-blue-500' 
                               : 'hover:bg-gray-50 border-gray-200'
                            }`}
                         >
                            {formData.plugins.includes(item.name) 
                               ? <CheckSquare size={18} className="text-blue-600 mr-3" />
                               : <Square size={18} className="text-gray-300 mr-3" />
                            }
                            <span className="text-sm font-medium text-gray-700 truncate">{item.name}</span>
                         </div>
                      ))}
                   </div>
                )}
             </div>
          )}
        </div>

        <div className="bg-gray-50 px-6 py-4 flex justify-between shrink-0">
           {step === 2 ? (
              <button onClick={() => setStep(1)} className="text-gray-600 hover:text-gray-900 text-sm font-medium">
                 &larr; Back
              </button>
           ) : (
              <div /> 
           )}

           <div className="flex space-x-3">
              {step === 1 ? (
                 <>
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
                    <button 
                       onClick={() => setStep(2)}
                       disabled={!formData.domain}
                       className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50"
                    >
                       Next: Plugins
                    </button>
                 </>
              ) : (
                 <button 
                    onClick={handleSubmit}
                    disabled={loading}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium disabled:opacity-50 flex items-center"
                 >
                    {loading && <Loader className="animate-spin mr-2" size={16} />}
                    Create Site
                 </button>
              )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default SiteCreateModal;