import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { supabase } from './supabase';
import Login from './pages/Login'; 
import Pages from "@/pages/index.jsx"; 
import { Toaster } from "@/components/ui/toaster";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verifica sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Escuta mudanças de login/logout
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  // Se não estiver logado, mostra Login
  if (!session) {
    return <Login />;
  }

  // Se estiver logado, mostra o Sistema (Gerenciado por Pages/index.jsx)
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Pages />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;