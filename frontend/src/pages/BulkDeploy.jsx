import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CloudArrowUpIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '../services/api';
import { useConsole } from '../context/ConsoleContext';

export default function BulkDeploy() {
  const [domains, setDomains] = useState('');
  const [phpVersion, setPhpVersion] = useState('8.1');
  const [features, setFeatures] = useState({
    ssl: true,
    cache: true,
  });
  const [adminCreds, setAdminCreds] = useState({
    username: '',
    email: '',
    password: ''
  });
  const [vaultItems, setVaultItems] = useState([]);
  const [selectedPlugins, setSelectedPlugins] = useState([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    // Fetch vault items for plugin selection
    const fetchVault = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const res = await axios.get('/api/v1/vault', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setVaultItems(res.data.items || []);
      } catch (e) {
        console.error("Failed to load vault", e);
      }
    };
    fetchVault();
  }, []);

  // Ensure useConsole is imported at the top:
  // import { useConsole } from '../context/ConsoleContext';

  const { startProcess, log, endProcess } = useConsole();

  const handleDeploy = async () => {
    const domainList = domains.split(/[\n,]+/).map(d => d.trim()).filter(d => d);
    if (domainList.length === 0) return alert("Please enter at least one domain.");

    setIsDeploying(true);
    startProcess('Bulk Deployment'); // This opens the terminal window
    log(`Preparing to deploy ${domainList.length} sites...`, 'system');
    
    const token = localStorage.getItem('access_token');
    let successCount = 0;

    for (let i = 0; i < domainList.length; i++) {
      const domain = domainList[i];
      log(`[${i + 1}/${domainList.length}] Building WordPress for ${domain}...`, 'info');
      
      try {
        const payload = {
          domain,
          type: 'wp',
          phpVersion: phpVersion,
          caching: features.cache ? 'redis' : 'none',
          ssl: features.ssl,
          plugins: selectedPlugins
        };

        // Use Axios directly to ensure the token is passed correctly
        await axios.post('/api/v1/sites', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });

        log(`✅ Successfully deployed ${domain}`, 'success');
        successCount++;
      } catch (error) {
        // Correctly extract the Python backend error message
        const errMsg = error.response?.data?.detail || error.message;
        log(`❌ Error deploying ${domain}: ${errMsg}`, 'error');
      }
    }

    log(`Bulk deployment completed. ${successCount}/${domainList.length} sites created.`, 'system');
    endProcess(successCount === domainList.length ? 'success' : 'error');
    setIsDeploying(false);
    setDomains(''); 
  };

  const togglePlugin = (filename) => {
    setSelectedPlugins(prev => 
      prev.includes(filename) 
        ? prev.filter(p => p !== filename)
        : [...prev, filename]
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Bulk Site Deployment</h1>
        <p className="text-gray-500">Deploy multiple WordPress sites with consistent configurations.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Configuration */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Domain Input */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Domains (one per line or comma separated)
            </label>
            <textarea
              rows={6}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono"
              placeholder="example.com&#10;site2.org&#10;blog.test.net"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              disabled={isDeploying}
            />
            <p className="mt-2 text-xs text-gray-500">
              {domains.split(/[\n,]+/).filter(d => d.trim()).length} domains detected
            </p>
          </div>

          {/* Admin Credentials */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">WordPress Admin Credentials</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={adminCreds.username}
                  onChange={(e) => setAdminCreds({...adminCreds, username: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={adminCreds.email}
                  onChange={(e) => setAdminCreds({...adminCreds, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="text"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={adminCreds.password}
                  onChange={(e) => setAdminCreds({...adminCreds, password: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* Stack Config */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Stack Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PHP Version</label>
                <select 
                  value={phpVersion}
                  onChange={(e) => setPhpVersion(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="8.3">PHP 8.3</option>
                  <option value="8.2">PHP 8.2</option>
                  <option value="8.1">PHP 8.1</option>
                  <option value="8.0">PHP 8.0</option>
                </select>
              </div>
              <div className="flex flex-col justify-center space-y-2">
                <label className="inline-flex items-center">
                  <input type="checkbox" 
                    checked={features.ssl}
                    onChange={(e) => setFeatures({...features, ssl: e.target.checked})}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" 
                  />
                  <span className="ml-2 text-sm text-gray-700">Enable SSL (Let's Encrypt)</span>
                </label>
                <label className="inline-flex items-center">
                  <input type="checkbox" 
                    checked={features.cache}
                    onChange={(e) => setFeatures({...features, cache: e.target.checked})}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" 
                  />
                  <span className="ml-2 text-sm text-gray-700">Enable FastCGI Cache</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Plugins & Actions */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Pre-install Plugins</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {vaultItems.length > 0 ? vaultItems.map((item) => (
                <label key={item.name} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={selectedPlugins.includes(item.name)}
                    onChange={() => togglePlugin(item.name)}
                    className="rounded border-gray-300 text-blue-600" 
                  />
                  <span className="text-sm text-gray-700 truncate" title={item.name}>{item.name}</span>
                </label>
              )) : <p className="text-sm text-gray-400">No items in Vault.</p>}
            </div>
          </div>

          <button
            onClick={handleDeploy}
            disabled={isDeploying}
            className="w-full flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeploying ? <CloudArrowUpIcon className="animate-bounce h-5 w-5 mr-2" /> : <CheckCircleIcon className="h-5 w-5 mr-2" />}
            {isDeploying ? 'Deploying...' : 'Start Deployment'}
          </button>
          
          {statusMessage && (
            <div className={`p-4 rounded-md ${statusMessage.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {statusMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}