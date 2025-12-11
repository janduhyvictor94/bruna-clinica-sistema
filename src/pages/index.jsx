import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Layout from "./Layout.jsx";

import Dashboard from "./Dashboard";
import Patients from "./Patients";
import Appointments from "./Appointments";
import Schedule from "./Schedule";
import Financial from "./Financial";
import Settings from "./Settings";
import Goals from "./Goals";
import Reports from "./Reports";
import Stock from "./Stock";

const PAGES = {
    Dashboard,
    Patients,
    Appointments,
    Schedule,
    Financial,
    Settings,
    Goals,
    Reports,
    Stock,
}

function _getCurrentPage(url) {
    if (!url) return 'Dashboard';
    let path = url.split('?')[0]; // Remove query params
    if (path.endsWith('/')) path = path.slice(0, -1);
    const pageName = path.split('/').pop();
    
    // Verifica se a página existe no mapa, senão retorna Dashboard
    const found = Object.keys(PAGES).find(p => p.toLowerCase() === pageName?.toLowerCase());
    return found || 'Dashboard';
}

export default function Pages() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/patients" element={<Patients />} />
                <Route path="/appointments" element={<Appointments />} />
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/financial" element={<Financial />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/stock" element={<Stock />} />
            </Routes>
        </Layout>
    );
}