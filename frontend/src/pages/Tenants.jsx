import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings, Trash2, X, AlertTriangle, CheckCircle, Ban } from 'lucide-react';

const Tenants = () => {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const response = await axios.get('http://localhost:8000/api/v1/tenants', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTenants(response.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch tenants');
      setLoading(false);
    }
  };

  const handleManage = (tenant) => {
    setSelectedTenant(tenant);
    setShowModal(true);
  };

  const handleUpdateStatus = async (newStatus) => {
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      await axios.put(`http://localhost:8000/api/v1/tenants/${selectedTenant.id}`, 
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchTenants();
      setShowModal(false);
    } catch (err) {
      alert("Failed to update status: " + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete tenant ${selectedTenant.username}? This will DELETE ALL SITES owned by this tenant.`)) {
      return;
    }
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      await axios.delete(`http://localhost:8000/api/v1/tenants/${selectedTenant.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchTenants();
      setShowModal(false);
    } catch (err) {
      alert("Failed to delete tenant: " + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading tenants...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Tenants</h1>
        <span className="text-sm text-gray-500">Multi-Tenant Isolation Active</span>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full w-full table-auto">
          <thead>
            <tr className="bg-gray-50 text-gray-600 uppercase text-xs leading-normal">
              <th className="py-3 px-6 text-left">ID</th>
              <th className="py-3 px-6 text-left">System User</th>
              <th className="py-3 px-6 text-left">Email</th>
              <th className="py-3 px-6 text-center">Status</th>
              <th className="py-3 px-6 text-center">Sites</th>
              <th className="py-3 px-6 text-center">Created At</th>
              <th className="py-3 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-gray-600 text-sm font-light">
            {tenants.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-4 text-center">No tenants found.</td>
              </tr>
            ) : (
              tenants.map((tenant) => (
                <tr key={tenant.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="py-3 px-6 text-left whitespace-nowrap font-medium">{tenant.id}</td>
                  <td className="py-3 px-6 text-left">
                    <div className="flex items-center">
                      <span className="font-mono bg-gray-100 px-2 py-1 rounded">{tenant.username}</span>
                    </div>
                  </td>
                  <td className="py-3 px-6 text-left">{tenant.email}</td>
                  <td className="py-3 px-6 text-center">
                    <span className={`py-1 px-3 rounded-full text-xs ${
                      tenant.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-center">
                    <span className="bg-blue-100 text-blue-800 py-1 px-3 rounded-full text-xs">
                      {tenant.site_count}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-center">
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-6 text-right">
                    <button 
                      onClick={() => handleManage(tenant)}
                      className="text-blue-500 hover:text-blue-700 font-medium text-sm flex items-center justify-end w-full"
                    >
                      <Settings size={16} className="mr-1" /> Manage
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Manage Tenant Modal */}
      {showModal && selectedTenant && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md relative">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold mb-4 text-gray-800">Manage Tenant</h2>
            <div className="mb-6">
              <p className="text-sm text-gray-600">System User: <span className="font-mono font-bold">{selectedTenant.username}</span></p>
              <p className="text-sm text-gray-600">Email: {selectedTenant.email}</p>
            </div>

            <div className="space-y-3">
              {selectedTenant.status === 'active' ? (
                <button
                  onClick={() => handleUpdateStatus('suspended')}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700"
                >
                  <Ban size={16} className="mr-2" /> Suspend Tenant
                </button>
              ) : (
                <button
                  onClick={() => handleUpdateStatus('active')}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle size={16} className="mr-2" /> Activate Tenant
                </button>
              )}

              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
              >
                <Trash2 size={16} className="mr-2" /> Terminate Tenant & Sites
              </button>
            </div>
            
            {actionLoading && <p className="text-center text-sm text-gray-500 mt-4">Processing...</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Tenants;