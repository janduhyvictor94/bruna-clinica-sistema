import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./Layout";

// Importação das Páginas
import Dashboard from "./Dashboard";
import Patients from "./Patients";
import Appointments from "./Appointments";
import Schedule from "./Schedule";
import Stock from "./Stock";
import Financial from "./Financial";
import Reports from "./Reports";
import Goals from "./Goals";
import Settings from "./Settings";
import Remarketing from "./Remarketing"; // Nova tela

const Pages = () => {
  return (
    <Routes>
      {/* O Layout envolve todas as rotas internas */}
      <Route path="/" element={<Layout />}>
        
        {/* 1. Se acessar a raiz "/", abre o Dashboard */}
        <Route index element={<Dashboard />} />
        
        {/* 2. CORREÇÃO DO ERRO: Se acessar "/dashboard", TAMBÉM abre o Dashboard */}
        <Route path="dashboard" element={<Dashboard />} />

        {/* Outras rotas */}
        <Route path="patients" element={<Patients />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="stock" element={<Stock />} />
        <Route path="financial" element={<Financial />} />
        <Route path="reports" element={<Reports />} />
        <Route path="goals" element={<Goals />} />
        <Route path="settings" element={<Settings />} />
        
        {/* Nova Rota de Remarketing */}
        <Route path="remarketing" element={<Remarketing />} />
      </Route>

      {/* Rota de segurança: Qualquer endereço desconhecido volta para o login ou dashboard */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default Pages;