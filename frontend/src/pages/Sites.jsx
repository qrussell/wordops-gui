import React, { useState, useEffect } from 'react';
import api from '../services/api';
import SiteManageModal from '../components/SiteManageModal';
import SiteCreateModal from '../components/SiteCreateModal';

export default function Sites() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const fetchSites = async () => {
    setLoading(true);
    try {
      const res = await api.sites.list();
      setSites(res.data);
    } catch (error) {
      console.error("Failed to fetch sites", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const handleDelete = async (domain) => {
    if (!window.confirm(`Are you sure you want to delete ${domain}? This cannot be undone.`)) return;
    try {
      await api.sites.delete(domain);
      alert(`Deletion initiated for ${domain}`);
      fetchSites();
    } catch (error) {
      alert(`Error deleting site: ${error.message}`);
    }
  };

  const filteredSites = sites.filter(site => 
    site.domain.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Sites</h1>
        {/* 3. Wire the button onClick */}
        <button 
           onClick={() => setIsCreateModalOpen(true)}
           className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add Site
        </button>
      </div>

	   {/* Add this right above the closing </div> of the page */}
	   <SiteCreateModal 
		 isOpen={isCreateModalOpen} 
		 onClose={() => setIsCreateModalOpen(false)} 
		 onSiteCreated={() => {
		   setIsCreateModalOpen(false);
		   fetchSites(); // Refresh the table automatically
		 }}
	   />

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search domains..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Domain</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PHP</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SSL</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cache</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan="6" className="px-6 py-4 text-center">Loading sites...</td></tr>
              ) : filteredSites.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-4 text-center">No sites found.</td></tr>
              ) : (
                filteredSites.map((site) => (
                  <tr key={site.id || site.domain}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{site.domain}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {site.status || 'Online'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{site.php || '8.1'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{site.ssl ? 'Enabled' : 'Disabled'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{site.cache || 'None'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => setSelectedSite(site.domain)} className="text-blue-600 hover:text-blue-900 mr-4">Manage</button>
                      <button onClick={() => handleDelete(site.domain)} className="text-red-600 hover:text-red-900">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSite && (
        <SiteManageModal domain={selectedSite} onClose={() => setSelectedSite(null)} />
      )}
		  {/* 4. Place this at the VERY BOTTOM, just inside the last closing </div> */}
		  {isCreateModalOpen && (
			<div className="relative z-50">
			  <SiteCreateModal 
				isOpen={isCreateModalOpen} 
				onClose={() => setIsCreateModalOpen(false)} 
				onSiteCreated={() => {
				  setIsCreateModalOpen(false);
				  fetchSites(); 
				}}
			  />
			</div>
		  )}
		</div>
	  );
	}
    </div>
  );
}