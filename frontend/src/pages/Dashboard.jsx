import React, { useState, useEffect } from 'react';
import api from '../services/api';

const colorMap = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  purple: 'bg-purple-500',
};

const StatCard = ({ title, value, subtext, color }) => (
  <div className="bg-white overflow-hidden shadow rounded-lg">
    <div className="p-5">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <div className={`rounded-md p-3 ${colorMap[color] || 'bg-gray-500'}`}>
            {/* Simple Icon Placeholder */}
            <span className="text-white font-bold text-xl">{title[0]}</span>
          </div>
        </div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
            <dd>
              <div className="text-lg font-medium text-gray-900">{value}</div>
              <div className="text-sm text-gray-400">{subtext}</div>
            </dd>
          </dl>
        </div>
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const [stats, setStats] = useState({ cpu: 0, ram: 0, disk: 0, uptime: '...' });
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statsRes, servicesRes] = await Promise.all([
        api.stack.getStats(),
        api.stack.list()
      ]);
      setStats(statsRes.data);
      setServices(servicesRes.data);
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  const handleServiceAction = async (serviceName, action) => {
    try {
      await api.stack.manageService(serviceName, action);
      fetchData(); // Refresh state
    } catch (error) {
      alert(`Failed to ${action} ${serviceName}: ${error.response?.data?.detail || error.message}`);
    }
  };

  if (loading) return <div className="p-6">Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="CPU Usage" value={`${stats.cpu}%`} subtext="System Load" color="blue" />
        <StatCard title="RAM Usage" value={`${stats.ram} MB`} subtext="Free Memory" color="green" />
        <StatCard title="Disk Usage" value={`${stats.disk}%`} subtext="Storage Used" color="yellow" />
        <StatCard title="Uptime" value={stats.uptime} subtext="System Uptime" color="purple" />
      </div>

      {/* Services Status */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">System Services</h3>
        </div>
        <ul className="divide-y divide-gray-200">
          {services.map((service) => (
            <li key={service.name} className="px-4 py-4 sm:px-6 flex items-center justify-between">
              <div className="flex items-center">
                <div className={`h-2.5 w-2.5 rounded-full mr-3 ${service.status === 'running' ? 'bg-green-400' : 'bg-red-400'}`}></div>
                <p className="text-sm font-medium text-gray-900">{service.name}</p>
                <span className="ml-2 text-xs text-gray-500">({service.version || 'unknown'})</span>
              </div>
              <div className="flex space-x-2">
                {service.status === 'running' ? (
                  <button
                    onClick={() => handleServiceAction(service.name, 'restart')}
                    className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200"
                  >
                    Restart
                  </button>
                ) : (
                  <button
                    onClick={() => handleServiceAction(service.name, 'start')}
                    className="px-3 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200"
                  >
                    Start
                  </button>
                )}
                {service.status === 'running' && (
                  <button
                    onClick={() => handleServiceAction(service.name, 'stop')}
                    className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200"
                  >
                    Stop
                  </button>
                )}
              </div>
            </li>
          ))}
          {services.length === 0 && (
            <li className="px-4 py-4 text-sm text-gray-500 text-center">
              No services found.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}