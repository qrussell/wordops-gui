import React, { useState, useEffect } from 'react';
import { User, Lock, Bell, Globe } from 'lucide-react';
import api from '../services/api';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  const [user, setUser] = useState({ username: '', role: '' });
  const [formData, setFormData] = useState({
    username: '',
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [mfaData, setMfaData] = useState({ secret: '', uri: '' });
  const [mfaToken, setMfaToken] = useState('');
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [showMfaDisable, setShowMfaDisable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const res = await api.auth.me();
      setUser(res.data);
      setFormData(prev => ({ ...prev, username: res.data.username }));
    } catch (error) {
      console.error("Failed to fetch user", error);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setLoading(true);

    if (formData.new_password && formData.new_password !== formData.confirm_password) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      setLoading(false);
      return;
    }

    const payload = {};
    if (formData.username !== user.username) payload.username = formData.username;
    if (formData.new_password) {
      payload.current_password = formData.current_password;
      payload.new_password = formData.new_password;
    }

    if (Object.keys(payload).length === 0) {
      setMessage({ type: 'info', text: 'No changes to save' });
      setLoading(false);
      return;
    }

    try {
      await api.settings.update(payload);
      setMessage({ type: 'success', text: 'Settings updated successfully' });
      fetchUser();
      setFormData(prev => ({ ...prev, current_password: '', new_password: '', confirm_password: '' }));
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to update settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSetup = async () => {
    try {
      setLoading(true);
      const res = await api.auth.setupMfa();
      setMfaData({ secret: res.data.secret, uri: res.data.provisioning_uri });
      setShowMfaSetup(true);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to initiate MFA setup' });
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async () => {
    try {
      setLoading(true);
      await api.auth.verifyMfa(mfaToken);
      setMessage({ type: 'success', text: 'MFA enabled successfully' });
      setShowMfaSetup(false);
      setMfaToken('');
      fetchUser();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Invalid token' });
    } finally {
      setLoading(false);
    }
  };

  const handleMfaDisable = async () => {
    try {
      setLoading(true);
      await api.auth.disableMfa(mfaToken);
      setMessage({ type: 'success', text: 'MFA disabled successfully' });
      setShowMfaDisable(false);
      setMfaToken('');
      fetchUser();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Invalid token' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Account Settings</h1>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row">
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-gray-50 border-r border-gray-200 p-4">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${activeTab === 'profile' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <User className="mr-3 h-5 w-5" /> Profile
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${activeTab === 'security' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <Lock className="mr-3 h-5 w-5" /> Security
            </button>
             {/* Placeholders for other tabs */}
             <button disabled className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-400 cursor-not-allowed">
              <Bell className="mr-3 h-5 w-5" /> Notifications
            </button>
            <button disabled className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-400 cursor-not-allowed">
              <Globe className="mr-3 h-5 w-5" /> Preferences
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 md:p-8">
          {message.text && (
            <div className={`mb-4 p-4 rounded-md ${message.type === 'error' ? 'bg-red-50 text-red-700' : message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium leading-6 text-gray-900">Profile Information</h3>
                  <p className="mt-1 text-sm text-gray-500">Update your account's profile information.</p>
                </div>
                
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                  <div className="sm:col-span-4">
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700">Username</label>
                    <div className="mt-1">
                      <input
                        type="text"
                        name="username"
                        id="username"
                        value={formData.username}
                        onChange={handleChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-sm font-medium text-gray-700">Role</label>
                    <div className="mt-1">
                      <input
                        type="text"
                        disabled
                        value={user.role}
                        className="shadow-sm bg-gray-50 block w-full sm:text-sm border-gray-300 rounded-md p-2 border text-gray-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium leading-6 text-gray-900">Change Password</h3>
                  <p className="mt-1 text-sm text-gray-500">Ensure your account is using a long, random password to stay secure.</p>
                </div>

                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                  <div className="sm:col-span-4">
                    <label htmlFor="current_password" className="block text-sm font-medium text-gray-700">Current Password</label>
                    <div className="mt-1">
                      <input
                        type="password"
                        name="current_password"
                        id="current_password"
                        value={formData.current_password}
                        onChange={handleChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <label htmlFor="new_password" className="block text-sm font-medium text-gray-700">New Password</label>
                    <div className="mt-1">
                      <input
                        type="password"
                        name="new_password"
                        id="new_password"
                        value={formData.new_password}
                        onChange={handleChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                    <div className="mt-1">
                      <input
                        type="password"
                        name="confirm_password"
                        id="confirm_password"
                        value={formData.confirm_password}
                        onChange={handleChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                      />
                    </div>
                  </div>
                </div>

                {/* MFA Section */}
                <div className="pt-6 border-t border-gray-200 mt-6">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">Two-Factor Authentication (MFA)</h3>
                  <p className="mt-1 text-sm text-gray-500">Add an extra layer of security to your account.</p>
                  
                  <div className="mt-4">
                    {user.mfa_enabled ? (
                      <div className="bg-green-50 border border-green-200 rounded-md p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <div className="flex-shrink-0">
                              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="ml-3">
                              <h3 className="text-sm font-medium text-green-800">MFA is enabled</h3>
                              <p className="text-sm text-green-700 mt-1">Your account is secured with two-factor authentication.</p>
                            </div>
                          </div>
                          {!showMfaDisable && (
                            <button
                              type="button"
                              onClick={() => setShowMfaDisable(true)}
                              className="ml-3 text-sm font-medium text-red-600 hover:text-red-500"
                            >
                              Disable MFA
                            </button>
                          )}
                        </div>
                        
                        {showMfaDisable && (
                          <div className="mt-4 border-t border-green-200 pt-4">
                            <label className="block text-sm font-medium text-gray-700">Confirm with Authenticator Code</label>
                            <div className="mt-2 flex space-x-3">
                              <input
                                type="text"
                                value={mfaToken}
                                onChange={(e) => setMfaToken(e.target.value)}
                                placeholder="123456"
                                className="shadow-sm focus:ring-red-500 focus:border-red-500 block w-32 sm:text-sm border-gray-300 rounded-md p-2 border"
                              />
                              <button
                                type="button"
                                onClick={handleMfaDisable}
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                              >
                                Disable
                              </button>
                              <button
                                type="button"
                                onClick={() => { setShowMfaDisable(false); setMfaToken(''); }}
                                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {!showMfaSetup ? (
                          <button
                            type="button"
                            onClick={handleMfaSetup}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            Setup MFA
                          </button>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                            <h4 className="text-sm font-medium text-gray-900">Scan QR Code</h4>
                            <p className="text-sm text-gray-500 mt-1">Use your authenticator app (Google Authenticator, Authy, etc.) to scan the code or enter the secret key manually.</p>
                            
                            <div className="mt-4 p-4 bg-white border border-gray-200 rounded flex flex-col items-center">
                                <div className="h-48 w-48 bg-gray-100 flex items-center justify-center text-gray-400 text-xs text-center mb-4">
                                    QR Code Library Not Available<br/>Use Secret Key
                                </div>
                                <div className="text-center">
                                    <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Secret Key</p>
                                    <code className="block mt-1 text-lg font-mono bg-gray-100 px-2 py-1 rounded select-all">{mfaData.secret}</code>
                                </div>
                            </div>

                            <div className="mt-4">
                              <label className="block text-sm font-medium text-gray-700">Verify Code</label>
                              <div className="mt-2 flex space-x-3">
                                <input
                                  type="text"
                                  value={mfaToken}
                                  onChange={(e) => setMfaToken(e.target.value)}
                                  placeholder="123456"
                                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-32 sm:text-sm border-gray-300 rounded-md p-2 border"
                                />
                                <button
                                  type="button"
                                  onClick={handleMfaVerify}
                                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                  Verify & Enable
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setShowMfaSetup(false); setMfaData({secret:'', uri:''}); setMfaToken(''); }}
                                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-5 border-t border-gray-200 mt-6">
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}