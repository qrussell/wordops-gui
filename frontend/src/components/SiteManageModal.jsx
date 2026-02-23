import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Globe, Shield, Server, Database, Zap, FileText, Save, RefreshCw } from 'lucide-react';

const SiteManageModal = ({ site, onClose }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [siteDetails, setSiteDetails] = useState(null);
  const [phpVersion, setPhpVersion] = useState(site?.php_version || '8.1');

  useEffect(() => {
    if (site?.domain) {
      fetchSiteDetails();
    }
  }, [site]);

  const fetchSiteDetails = async () => {
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const response = await axios.get(`http://localhost:8000/api/v1/sites/${site.domain}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSiteDetails(response.data);
      if (response.data.stack?.php) {
          setPhpVersion(response.data.stack.php);
      }
    } catch (error) {
      console.error("Failed to fetch site details", error);
    }
  };

  const handleSslToggle = async (enabled) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      await axios.post(`http://localhost:8000/api/v1/sites/${site.domain}/ssl`, 
        { enabled },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(`SSL ${enabled ? 'enable' : 'disable'} queued.`);
      fetchSiteDetails();
    } catch (error) {
      alert("Error updating SSL");
    } finally {
      setLoading(false);
    }
  };

  const handlePhpUpdate = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      await axios.put(`http://localhost:8000/api/v1/sites/${site.domain}/stack`, 
        { php_version: phpVersion },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(`PHP update to ${phpVersion} queued.`);
    } catch (error) {
      alert("Error updating PHP version");
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      await axios.post(`http://localhost:8000/api/v1/sites/${site.domain}/cache/clear`, 
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert("Cache clear queued.");
    } catch (error) {
      alert("Error clearing cache");
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Globe },
    { id: 'ssl', label: 'SSL & Security', icon: Shield },
    { id: 'stack', label: 'Stack', icon: Server },
    { id: 'cache', label: 'Cache', icon: Zap },
    { id: 'database', label: 'Database', icon: Database },
    { id: 'logs', label: 'Logs', icon: FileText },
  ];

  if (!site) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col relative">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{site.domain}</h2>
            <span className={`text-sm px-2 py-1 rounded-full ${siteDetails?.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {siteDetails?.status || 'Checking...'}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-64 bg-gray-50 border-r overflow-y-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === tab.id 
                    ? 'bg-white text-blue-600 border-l-4 border-blue-600' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <tab.icon size={18} className="mr-3" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 p-8 overflow-y-auto">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-500 mb-1">IP Address</h3>
                    <p className="text-lg font-mono">{siteDetails?.ip || 'N/A'}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-500 mb-1">System User</h3>
                    <p className="text-lg font-mono">{siteDetails?.user || 'www-data'}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Root Directory</h3>
                    <p className="text-sm font-mono break-all">{siteDetails?.root || `/var/www/${site.domain}`}</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ssl' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between bg-gray-50 p-6 rounded-lg">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Let's Encrypt SSL</h3>
                    <p className="text-sm text-gray-500">
                      Status: {siteDetails?.ssl?.enabled ? <span className="text-green-600 font-bold">Enabled</span> : <span className="text-red-600">Disabled</span>}
                    </p>
                    {siteDetails?.ssl?.expires && (
                      <p className="text-xs text-gray-400 mt-1">Expires in: {siteDetails.ssl.expires}</p>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleSslToggle(true)}
                      disabled={loading || siteDetails?.ssl?.enabled}
                      className={`px-4 py-2 rounded-md text-sm font-medium text-white ${siteDetails?.ssl?.enabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                      Enable
                    </button>
                    <button
                      onClick={() => handleSslToggle(false)}
                      disabled={loading || !siteDetails?.ssl?.enabled}
                      className={`px-4 py-2 rounded-md text-sm font-medium text-white ${!siteDetails?.ssl?.enabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
                    >
                      Disable
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'stack' && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">PHP Version</h3>
                  <div className="flex items-center space-x-4">
                    <select
                      value={phpVersion}
                      onChange={(e) => setPhpVersion(e.target.value)}
                      className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    >
                      <option value="7.4">PHP 7.4</option>
                      <option value="8.0">PHP 8.0</option>
                      <option value="8.1">PHP 8.1</option>
                      <option value="8.2">PHP 8.2</option>
                      <option value="8.3">PHP 8.3</option>
                    </select>
                    <button
                      onClick={handlePhpUpdate}
                      disabled={loading}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
                    >
                      <Save size={16} className="mr-2" /> Update
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'cache' && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Cache Management</h3>
                  <p className="text-sm text-gray-500 mb-4">Backend: {siteDetails?.cache?.backend || 'Unknown'}</p>
                  <button
                    onClick={handleClearCache}
                    disabled={loading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none"
                  >
                    <RefreshCw size={16} className="mr-2" /> Clear Cache
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'database' && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Database Connection</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Database Name</label>
                      <div className="mt-1 flex rounded-md shadow-sm">
                        <input type="text" readOnly value={siteDetails?.db?.name || ''} className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md border-gray-300 bg-gray-100 sm:text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Database User</label>
                      <div className="mt-1 flex rounded-md shadow-sm">
                        <input type="text" readOnly value={siteDetails?.db?.user || ''} className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md border-gray-300 bg-gray-100 sm:text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-6">
                <p className="text-gray-500">Log viewer integration coming soon.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteManageModal;