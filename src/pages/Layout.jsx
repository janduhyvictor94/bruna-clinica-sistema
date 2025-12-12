import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom'; // <--- Adicionado Outlet e useLocation
import { createPageUrl } from '@/utils';
import { 
  LayoutDashboard, Users, Calendar, FileText, DollarSign, 
  Package, Target, BarChart3, Menu, X, ChevronRight, Sun, Moon,
  Repeat // <--- Novo ícone importado para o Remarketing
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Layout({ currentPageName }) { // Removido 'children', pois usaremos Outlet
  const location = useLocation(); // Hook para saber em qual URL estamos
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('theme') === 'dark';
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Lista atualizada com Remarketing e paths explícitos para garantir a navegação
  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', path: '/dashboard' },
    { name: 'Pacientes', icon: Users, page: 'Patients', path: '/patients' },
    { name: 'Agenda', icon: Calendar, page: 'Schedule', path: '/schedule' },
    { name: 'Atendimentos', icon: FileText, page: 'Appointments', path: '/appointments' },
    { name: 'Estoque', icon: Package, page: 'Stock', path: '/stock' },
    { name: 'Financeiro', icon: DollarSign, page: 'Financial', path: '/financial' },
    { name: 'Relatórios', icon: BarChart3, page: 'Reports', path: '/reports' },
    { name: 'Cadastros', icon: Package, page: 'Settings', path: '/settings' },
    { name: 'Metas', icon: Target, page: 'Goals', path: '/goals' },
    { name: 'Remarketing', icon: Repeat, page: 'Remarketing', path: '/remarketing' }, // <--- Item Novo
  ];

  return (
    <div className="min-h-screen bg-stone-200 dark:bg-[#0f0f0f] text-stone-900 dark:text-stone-100 transition-colors duration-300">
      <style>{`
        :root { --accent: #c4a47c; }
        
        /* CORREÇÃO DO MODO DARK - ALTO CONTRASTE */
        .dark .bg-white { background-color: #1a1a1a !important; border-color: #333 !important; color: #e5e5e5 !important; }
        .dark .bg-stone-50 { background-color: #262626 !important; border-color: #404040 !important; }
        .dark .bg-stone-100 { background-color: #262626 !important; border-color: #404040 !important; }
        
        /* Textos */
        .dark .text-stone-400 { color: #a3a3a3 !important; } 
        .dark .text-stone-500 { color: #d4d4d4 !important; } 
        .dark .text-stone-600 { color: #e5e5e5 !important; } 
        .dark .text-stone-700 { color: #ffffff !important; }
        .dark .text-stone-800 { color: #ffffff !important; }
        .dark .text-stone-900 { color: #ffffff !important; }

        /* Inputs e Selects */
        .dark input, .dark select, .dark textarea { 
            background-color: #262626 !important; 
            border-color: #404040 !important; 
            color: white !important; 
        }
        
        /* Bordas */
        .dark .border-stone-100, .dark .border-stone-200 { border-color: #333 !important; }
        
        /* Scrollbar */
        .dark ::-webkit-scrollbar-track { background: #1a1a1a; }
        .dark ::-webkit-scrollbar-thumb { background: #444; }
      `}</style>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-[#1a1a1a] border-b border-stone-200 dark:border-stone-800 z-50 flex items-center justify-between px-4">
        <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors">
          <Menu className="w-5 h-5 text-stone-600 dark:text-stone-200" />
        </button>
        <span className="text-lg font-light tracking-wide text-stone-800 dark:text-stone-100">Bruna Braga</span>
        <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg">
            {isDarkMode ? <Sun className="w-5 h-5 text-yellow-400"/> : <Moon className="w-5 h-5 text-stone-600"/>}
        </button>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-64 bg-white dark:bg-[#1a1a1a] border-r border-stone-200 dark:border-[#333] z-50 transition-transform duration-300 flex flex-col",
        "lg:translate-x-0", sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-stone-100 dark:border-[#333] relative">
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden absolute top-4 right-4 p-2 hover:bg-stone-100 rounded-lg"><X className="w-4 h-4" /></button>
          <h1 className="text-xl font-light tracking-wide text-stone-800 dark:text-white">Bruna Braga</h1>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-1 tracking-wider uppercase">Harmonização Facial</p>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {menuItems.map((item) => {
            // Lógica de Ativo: Compara a URL atual com o path do item
            // Também mantemos suporte ao currentPageName caso ele venha por prop
            const isActive = location.pathname.includes(item.path) || 
                             (item.path === '/dashboard' && location.pathname === '/') ||
                             currentPageName === item.page;

            return (
              <Link 
                key={item.page} 
                to={item.path} // Usamos o path direto para garantir
                onClick={() => setSidebarOpen(false)}
                className={cn("flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive ? "bg-stone-900 dark:bg-stone-700 text-white" : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#262626]"
                )}
              >
                <item.icon className={cn("w-4 h-4 transition-colors", isActive ? "text-white" : "text-stone-400 group-hover:text-stone-600 dark:text-stone-400 dark:group-hover:text-stone-200")} />
                <span className="text-sm font-medium">{item.name}</span>
                {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-stone-100 dark:border-[#333] hidden lg:block">
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#262626] transition-all">
                {isDarkMode ? <Sun className="w-4 h-4 text-yellow-400"/> : <Moon className="w-4 h-4"/>}
                <span className="text-sm font-medium">{isDarkMode ? 'Modo Claro' : 'Modo Escuro'}</span>
            </button>
        </div>
      </aside>

      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            {/* AQUI ESTÁ A MUDANÇA PRINCIPAL:
               Substituímos {children} por <Outlet />.
               Isso permite que o 'index.jsx' injete a página correta (Remarketing, Dashboard, etc)
               dentro desta área.
            */}
            <Outlet />
        </div>
      </main>
    </div>
  );
}