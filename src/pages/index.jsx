import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from "./Layout";
import Dashboard from "./Dashboard";
import Patients from "./Patients";
import Appointments from "./Appointments";
import Schedule from "./Schedule";
import Financial from "./Financial";
import Settings from "./Settings";
import Goals from "./Goals";
import Reports from "./Reports";
import Stock from "./Stock";

export default function Pages() {
    return (
        <Layout currentPageName="Sistema">
            <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
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