import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  FileText, 
  DollarSign, 
  Package, 
  Target,
  BarChart3,
  Menu,
  X,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
    { name: 'Pacientes', icon: Users, page: 'Patients' },
    { name: 'Agenda', icon: Calendar, page: 'Schedule' },
    { name: 'Atendimentos', icon: FileText, page: 'Appointments' },
    { name: 'Estoque', icon: Package, page: 'Stock' },
    { name: 'Financeiro', icon: DollarSign, page: 'Financial' },
    { name: 'Relatórios', icon: BarChart3, page: 'Reports' },
    { name: 'Cadastros', icon: Package, page: 'Settings' },
    { name: 'Metas', icon: Target, page: 'Goals' },
  ];

  return (
    <div className="min-h-screen bg-stone-200">
      <style>{`
        :root {
          --accent: #c4a47c;
          --accent-light: #e8dcc8;
          --accent-dark: #9a7d5a;
        }
      `}</style>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-stone-200 z-50 flex items-center justify-between px-4">
        <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
          <Menu className="w-5 h-5 text-stone-600" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg font-light tracking-wide text-stone-800">Bruna Braga</span>
        </div>
        <div className="w-9" />
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-64 bg-white border-r border-stone-200 z-50 transition-transform duration-300",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-stone-100">
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden absolute top-4 right-4 p-2 hover:bg-stone-100 rounded-lg"
          >
            <X className="w-4 h-4 text-stone-400" />
          </button>
          <h1 className="text-xl font-light tracking-wide text-stone-800">Bruna Braga</h1>
          <p className="text-xs text-stone-400 mt-1 tracking-wider uppercase">Harmonização Facial</p>
        </div>

        <nav className="p-4 space-y-1">
          {menuItems.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive 
                    ? "bg-stone-900 text-white" 
                    : "text-stone-600 hover:bg-stone-100"
                )}
              >
                <item.icon className={cn(
                  "w-4 h-4 transition-colors",
                  isActive ? "text-white" : "text-stone-400 group-hover:text-stone-600"
                )} />
                <span className="text-sm font-medium">{item.name}</span>
                {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}