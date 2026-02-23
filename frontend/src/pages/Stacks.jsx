import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Layers, 
  Server, 
  Database, 
  Cpu, 
  Play, 
  Square, 
  RotateCw, 
  CheckCircle, 
  AlertTriangle,
  Settings,
  Download
} from 'lucide-react';

/**
 * Stacks Page
 * Implements Section 7: Server Stack Configuration
 * - [cite_start]Service Management: Start/Stop/Restart NGINX, MySQL, etc. [cite: 194-196]
 * - PHP Management: Manage installed PHP versions and extensions.
 * - Database: Basic status and tuning info.
 */

const Stacks = () => {
  const [activeTab, setActiveTab] = useState('services'); // services, php, database
  const [isLoading, setIsLoading] = useState(false);
  const [phpVersion, setPhpVersion] = useState('8.1');

  // Mock Data: Services
  const [services, setServices] = useState([
    { name: 'NGINX', type: 'Web Server', version: '1.18.0', status: 'running', uptime: '14d 2h', port: 80 },
    { name: 'MariaDB', type: 'Database', version: '10.6.12', status: 'running', uptime: '14d 2h', port: 3306 },
    { name: 'Redis', type: 'Cache', version: '6.0.16', status: 'running', uptime: '14d 2h', port: 6379 },
    { name: 'PHP 8.1-FPM', type: 'PHP', version: '8.1.22', status: 'running', uptime: '2d 5h', port: 9081 },
    { name: 'PHP 8.2-FPM', type: 'PHP', version: '8.2.11', status: 'stopped', uptime: '-', port: 9082 },
    { name: 'UFW', type: 'Firewall', version: '0.36', status: 'running', uptime: '14d 2h', port: '-' },
  ]);

  // Mock Data: PHP Extensions
  const [phpExtensions, setPhpExtensions] = useState([]);

  useEffect(() => {
    if (activeTab === 'php') {
      fetchPhpExtensions();
    }
  }, [activeTab, phpVersion]);

  const fetchPhpExtensions = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await axios.get(`/api/v1/stack/php/extensions?version=${phpVersion}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPhpExtensions(res.data);
    } catch (error) {
      console.error("Failed to fetch PHP extensions", error);
    }
  };

  const handleAction = async (serviceName, action) => {
    setIsLoading(true);
    
    // Normalize service name for backend (e.g. "PHP 8.1-FPM" -> "php8.1-fpm")
    let apiServiceName = serviceName.toLowerCase();
    if (serviceName.startsWith('PHP')) {
        apiServiceName = serviceName.toLowerCase().replace(' ', '');
    }

    try {
      const token = localStorage.getItem('access_token');
      await axios.post('/api/v1/system/services', 
        { service: apiServiceName, action },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setServices(services.map(s => {
          if (s.name === serviceName) {
             if (action === 'stop') return { ...s, status: 'stopped' };
             if (action === 'start' || action === 'restart') return { ...s, status: 'running' };
          }
          return s;
       }));
    } catch (error) {
      alert(`Failed to ${action} ${serviceName}: ${error.response?.data?.detail || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhpExtensionToggle = async (ext) => {
    const action = ext.status ? 'disable' : 'enable';
    // Optimistic update
    setPhpExtensions(prev => prev.map(e => e.name === ext.name ? { ...e, status: !e.status } : e));

    try {
      const token = localStorage.getItem('access_token');
      await axios.post('/api/v1/stack/php/extensions', {
        version: phpVersion,
        extension: ext.name,
        action: action
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      // Revert on failure
      setPhpExtensions(prev => prev.map(e => e.name === ext.name ? { ...e, status: !e.status } : e));
      alert(`Failed to ${action} extension: ${error.response?.data?.detail || error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
           <Layers className="mr-3 text-blue-600" /> Stack Management
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage server services, PHP versions, and database configurations.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <TabButton id="services" label="System Services" icon={Server} active={activeTab} onClick={setActiveTab} />
          <TabButton id="php" label="PHP Extensions" icon={Cpu} active={activeTab} onClick={setActiveTab} />
          <TabButton id="database" label="Database Tuning" icon={Database} active={activeTab} onClick={setActiveTab} />
        </nav>
      </div>

      {/* TAB: SERVICES */}
      {activeTab === 'services' && (
         <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden animate-in fade-in">
            <table className="min-w-full divide-y divide-gray-200">
               <thead className="bg-gray-50">
                  <tr>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uptime</th>
                     <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
               </thead>
               <tbody className="bg-white divide-y divide-gray-200">
                  {services.map((svc) => (
                     <tr key={svc.name} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                           <div className="flex items-center">
                              <div className="font-medium text-gray-900">{svc.name}</div>
                              <span className="ml-2 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">{svc.version}</span>
                           </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{svc.type}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                           {svc.status === 'running' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                 <CheckCircle size={12} className="mr-1.5" /> Running
                              </span>
                           ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                 <AlertTriangle size={12} className="mr-1.5" /> Stopped
                              </span>
                           )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{svc.uptime}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                           <div className="flex justify-end space-x-2">
                              {svc.status === 'running' ? (
                                 <button onClick={() => handleAction(svc.name, 'stop')} className="p-1 text-gray-400 hover:text-red-600" title="Stop">
                                    <Square size={16} />
                                 </button>
                              ) : (
                                 <button onClick={() => handleAction(svc.name, 'start')} className="p-1 text-gray-400 hover:text-green-600" title="Start">
                                    <Play size={16} />
                                 </button>
                              )}
                              <button onClick={() => handleAction(svc.name, 'restart')} disabled={isLoading} className="p-1 text-blue-600 hover:text-blue-900" title="Restart">
                                 <RotateCw size={16} className={isLoading ? 'animate-spin' : ''} />
                              </button>
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      )}

      {/* TAB: PHP EXTENSIONS */}
      {activeTab === 'php' && (
         <div className="animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
               <div className="bg-blue-50 border-l-4 border-blue-400 p-4 flex-1">
                  <div className="flex">
                     <div className="flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-blue-400" />
                     </div>
                     <div className="ml-3">
                        <p className="text-sm text-blue-700">
                           Managing extensions for <strong>PHP {phpVersion}</strong>. Toggling an extension will automatically restart the PHP-FPM service.
                        </p>
                     </div>
                  </div>
               </div>
               <div className="w-full md:w-48">
                  <select 
                     value={phpVersion} 
                     onChange={(e) => setPhpVersion(e.target.value)}
                     className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                  >
                     {['8.3', '8.2', '8.1', '8.0', '7.4'].map(v => <option key={v} value={v}>PHP {v}</option>)}
                  </select>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {phpExtensions.map((ext) => (
                  <div key={ext.name} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex items-center justify-between">
                     <div>
                        <h3 className="text-sm font-medium text-gray-900 font-mono">{ext.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">{ext.desc}</p>
                     </div>
                     <button 
                        onClick={() => handlePhpExtensionToggle(ext)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${ext.status ? 'bg-blue-600' : 'bg-gray-200'}`}
                     >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${ext.status ? 'translate-x-5' : 'translate-x-0'}`} />
                     </button>
                  </div>
               ))}
               
               {/* Install New */}
               <button className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center text-gray-500 hover:border-blue-500 hover:text-blue-600 transition-colors">
                  <Download size={24} className="mb-2" />
                  <span className="text-sm font-medium">Install Extension</span>
               </button>
            </div>
         </div>
      )}

      {/* TAB: DATABASE */}
      {activeTab === 'database' && (
         <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-in fade-in">
            <h3 className="text-lg font-medium text-gray-900 mb-4">MariaDB Configuration (my.cnf)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div>
                  <label className="block text-sm font-medium text-gray-700">Max Connections</label>
                  <input type="number" defaultValue={150} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
                  <p className="mt-1 text-xs text-gray-500">Maximum permitted number of simultaneous client connections.</p>
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700">InnoDB Buffer Pool Size</label>
                  <input type="text" defaultValue="1G" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
                  <p className="mt-1 text-xs text-gray-500">The size of the memory area where InnoDB caches table and index data.</p>
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700">Query Cache Limit</label>
                  <input type="text" defaultValue="1M" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700">Slow Query Log</label>
                  <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2">
                     <option>Enabled</option>
                     <option>Disabled</option>
                  </select>
               </div>
            </div>
            <div className="mt-6 flex justify-end">
               <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center">
                  <Settings size={16} className="mr-2" /> Apply Tuning
               </button>
            </div>
         </div>
      )}

    </div>
  );
};

const TabButton = ({ id, label, icon: Icon, active, onClick }) => (
  <button
    onClick={() => onClick(id)}
    className={`group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
      active === id
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`}
  >
    <Icon size={18} className={`mr-2 ${active === id ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}`} />
    {label}
  </button>
);

export default Stacks;
