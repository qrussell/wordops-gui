import React, { useState, useEffect } from 'react';
import { 
  Box, 
  UploadCloud, 
  Download, 
  Trash2, 
  Search, 
  CheckCircle,
  Package,
  Loader
} from 'lucide-react';
import api from '../services/api'; // Ensure this points to your API helper

const Library = () => {
  const [activeTab, setActiveTab] = useState('vault'); // 'vault' or 'wp-repo'
  const [vaultItems, setVaultItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  
  // WP Repo State
  const [wpSlug, setWpSlug] = useState('');
  const [wpType, setWpType] = useState('plugin'); // 'plugin' or 'theme'
  const [isDownloading, setIsDownloading] = useState(false);

  // --- VAULT ACTIONS ---
  const loadVault = async () => {
    setLoading(true);
    try {
      const res = await api.vault.list();
      setVaultItems(res.data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadVault(); }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      await api.vault.upload(formData);
      loadVault(); // Refresh list
    } catch (error) {
      alert("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const deleteItem = async (filename) => {
    if(!confirm(`Delete ${filename}?`)) return;
    try {
      await api.vault.delete(filename);
      setVaultItems(vaultItems.filter(i => i.name !== filename));
    } catch (e) { alert("Delete failed"); }
  };

  // --- WORDPRESS REPO ACTIONS ---
  const handleWpDownload = async () => {
     if (!wpSlug) return;
     setIsDownloading(true);
     try {
        await api.vault.downloadWp([wpSlug], wpType);
        alert(`Successfully downloaded ${wpSlug}`);
        setWpSlug('');
        loadVault(); // Refresh vault list
     } catch(e) {
        alert("Download error");
     } finally {
        setIsDownloading(false);
     }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
       
       <div className="flex justify-between items-center">
          <div>
             <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <Package className="mr-3 text-blue-600" /> Plugin & Theme Library
             </h1>
             <p className="text-gray-500 mt-1">Manage your centralized repository of WordPress assets.</p>
          </div>
          
          <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
             <button 
                onClick={() => setActiveTab('vault')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'vault' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
             >
                Local Vault
             </button>
             <button 
                onClick={() => setActiveTab('wp-repo')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'wp-repo' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
             >
                WordPress.org Store
             </button>
          </div>
       </div>

       {/* --- TAB: LOCAL VAULT --- */}
       {activeTab === 'vault' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             {/* Upload Card */}
             <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 flex flex-col items-center justify-center text-center">
                <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                   <UploadCloud size={32} className="text-blue-500" />
                </div>
                <h3 className="font-semibold text-blue-900">Upload Custom Asset</h3>
                <p className="text-sm text-blue-600 mt-2 mb-6">Drag & drop .zip files here to add them to your library.</p>
                <label className="cursor-pointer bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                   {isUploading ? 'Uploading...' : 'Select File'}
                   <input type="file" className="hidden" accept=".zip" onChange={handleFileUpload} disabled={isUploading} />
                </label>
             </div>

             {/* File List */}
             <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 font-medium text-gray-700">
                   Stored Items ({vaultItems.length})
                </div>
                <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                   {vaultItems.length === 0 ? (
                      <div className="p-8 text-center text-gray-400 italic">No items in vault yet.</div>
                   ) : (
                      vaultItems.map((item, i) => (
                         <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
						  <div className="flex items-center space-x-3">
							<Box size={20} className="text-gray-400" />
							<div>
							  <div className="flex items-center space-x-2">
								<span className="font-medium text-gray-900">{item.name}</span>
								{/* Category Badge */}
								<span className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-bold ${
								  item.type === 'theme' 
									? 'bg-purple-100 text-purple-700 border border-purple-200' 
									: 'bg-blue-100 text-blue-700 border border-blue-200'
								}`}>
								  {item.type}
								</span>
							  </div>
							  <div className="text-xs text-gray-500">{item.size}</div>
							</div>
						  </div>
						  <button onClick={() => deleteItem(item.name)} className="text-gray-400 hover:text-red-500 p-2">
							<Trash2 size={18} />
						  </button>
						</div>
                      ))
                   )}
                </div>
             </div>
          </div>
       )}

       {/* --- TAB: WORDPRESS REPO --- */}
       {activeTab === 'wp-repo' && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 max-w-2xl mx-auto">
             <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4 text-blue-600">
                   <Download size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Download from WordPress.org</h2>
                <p className="text-gray-500 mt-2">Enter a plugin or theme slug to fetch the latest stable version directly to your vault.</p>
             </div>

             <div className="space-y-4">
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Asset Type</label>
                   <div className="flex space-x-4">
                      <label className="flex items-center space-x-2 cursor-pointer">
                         <input type="radio" name="type" value="plugin" checked={wpType === 'plugin'} onChange={() => setWpType('plugin')} className="text-blue-600 focus:ring-blue-500" />
                         <span>Plugin</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                         <input type="radio" name="type" value="theme" checked={wpType === 'theme'} onChange={() => setWpType('theme')} className="text-blue-600 focus:ring-blue-500" />
                         <span>Theme</span>
                      </label>
                   </div>
                </div>

                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Slug Name</label>
                   <div className="relative">
                      <input 
                         type="text" 
                         placeholder="e.g. woocommerce, elementor, astra" 
                         className="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500 p-2 border"
                         value={wpSlug}
                         onChange={(e) => setWpSlug(e.target.value)}
                      />
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                         <Search size={18} />
                      </div>
                   </div>
                   <p className="text-xs text-gray-500 mt-1">Found in the URL: wordpress.org/plugins/<strong>your-slug</strong>/</p>
                </div>

                <button 
                   onClick={handleWpDownload}
                   disabled={isDownloading || !wpSlug}
                   className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                >
                   {isDownloading ? (
                      <><Loader className="animate-spin mr-2" size={18} /> Downloading...</>
                   ) : (
                      'Download to Vault'
                   )}
                </button>
             </div>
          </div>
       )}

    </div>
  );
};

export default Library;
