import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sites from './pages/Sites';
import Users from './pages/Users';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import BulkDeploy from './pages/BulkDeploy';
import Library from './pages/Library';
import ResetPassword from './pages/ResetPassword';
import Layout from './components/Layout';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sites" element={<Sites />} />
            <Route path="/users" element={<Users />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/bulk-deploy" element={<BulkDeploy />} />
            <Route path="/library" element={<Library />} />
        </Route>
        
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

const ProtectedRoute = () => {
  const token = localStorage.getItem('access_token');
  return token ? <Layout /> : <Navigate to="/login" />;
};

export default App;