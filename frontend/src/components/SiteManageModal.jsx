import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function SiteManageModal({ domain, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [siteData, setSiteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (domain) loadSiteData();
  }, [domain]);

  const loadSiteData = async () => {
    setLoading(true);
    try {
      const res = await api.sites.get(domain);
      setSiteData(res.data);
    } catch (e) {
      console.error("Failed to load site data", e);
      alert("Failed to load site details.");
    } finally {
      setLoading(false);
    }
  };

  const handleSSLToggle = async (enabled) => {
    setActionLoading(true);
    try {
      await api.sites.toggleSSL(domain, enabled);
      alert(`SSL ${enabled ? 'enable' : 'disable'} initiated.`);
      loadSiteData();
    } catch (e) {
      alert(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCacheClear = async () => {
    setActionLoading(true);
    try {
      await api.sites.clearCache(domain);
      alert("Cache clearing initiated.");
    } catch (e) {
      alert(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePHPUpdate = async (version) => {
    if (!window.confirm(`Change PHP version to ${version}? This may break your site.`)) return;
    setActionLoading(true);
    try {
      await api.sites.updatePHP(domain, version);
      alert(`PHP update to ${version} initiated.`);
      loadSiteData();
    } catch (e) {
      alert(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (!domain) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-900">Manage {domain}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500 text-2xl">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-gray-50">
          {['overview', 'ssl', 'stack', 'cache', 'database'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium capitalize focus:outline-none ${
                activeTab === tab ? 'border-b-2 border-blue-500 text-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px]">
          {loading ? (
            <div className="flex justify-center items-center h-full">Loading details...</div>
          ) : !siteData ? (
            <div className="text-red-500">Failed to load site data.</div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded">
                    <span className="block text-sm text-gray-500">Status</span>
                    <span className="font-medium text-green-600">Online</span>
                  </div>
                  <div className="p-4 bg-gray-50 rounded">
                    <span className="block text-sm text-gray-500">Type</span>
                    <span className="font-medium">{siteData.type || 'WordPress'}</span>
                  </div>
                  <div className="p-4 bg-gray-50 rounded">
                    <span className="block text-sm text-gray-500">PHP Version</span>
                    <span className="font-medium">{siteData.php}</span>
                  </div>
                  <div className="p-4 bg-gray-50 rounded">
                    <span className="block text-sm text-gray-500">SSL</span>
                    <span className={`font-medium ${siteData.ssl ? 'text-green-600' : 'text-red-500'}`}>
                      {siteData.ssl ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              )}

              {activeTab === 'ssl' && (
                <div className="space-y-4">
                  <h4 className="font-medium">SSL Configuration</h4>
                  <p className="text-sm text-gray-600">Manage Let's Encrypt certificates for this domain.</p>
                  <div className="flex items-center space-x-4 mt-4">
                    <button
                      onClick={() => handleSSLToggle(!siteData.ssl)}
                      disabled={actionLoading}
                      className={`px-4 py-2 rounded text-white ${siteData.ssl ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                      {siteData.ssl ? 'Disable SSL' : 'Enable SSL (Let\'s Encrypt)'}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'stack' && (
                <div className="space-y-4">
                  <h4 className="font-medium">PHP Version</h4>
                  <div className="flex items-center space-x-2">
                    <select 
                      className="border rounded px-3 py-2" 
                      defaultValue={siteData.php}
                      onChange={(e) => handlePHPUpdate(e.target.value)}
                      disabled={actionLoading}
                    >
                      {['7.4', '8.0', '8.1', '8.2', '8.3'].map(v => <option key={v} value={v}>PHP {v}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {activeTab === 'cache' && (
                <div className="space-y-4">
                  <h4 className="font-medium">Cache Management</h4>
                  <p className="text-sm text-gray-600">Current Backend: {siteData.cache || 'None'}</p>
                  <button onClick={handleCacheClear} disabled={actionLoading} className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600">
                    Clear All Cache
                  </button>
                </div>
              )}

              {activeTab === 'database' && (
                <div className="space-y-4">
                  <h4 className="font-medium">Database Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded">
                      <span className="block text-xs text-gray-500">Database Name</span>
                      <span className="font-mono text-sm">{siteData.db?.name || 'N/A'}</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                      <span className="block text-xs text-gray-500">Database User</span>
                      <span className="font-mono text-sm">{siteData.db?.user || 'N/A'}</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                      <span className="block text-xs text-gray-500">Database Host</span>
                      <span className="font-mono text-sm">{siteData.db?.host || 'localhost'}</span>
                    </div>
                  </div>
                  <div className="mt-4">
                     <p className="text-xs text-gray-500">Database management is available via CLI or external tools.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}