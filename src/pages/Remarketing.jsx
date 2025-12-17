import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase'; 
import dashboardConfig from '../config/dashboard.json';
import { Users, CheckCircle, Calendar, MessageCircle, AlertCircle, RefreshCw } from 'lucide-react';

const Remarketing = () => {
  const [metrics, setMetrics] = useState({
    baseRemarketing: 0,
    recuperados: 0,
    metaProgresso: 0,
    agendamentosHoje: 0
  });
  const [fila, setFila] = useState([]);
  const [loading, setLoading] = useState(true);

  // Mapeamento de Ícones
  const getIcon = (iconName) => {
    const icons = {
      'people-carry': <Users className="h-4 w-4" />,
      'check-double': <CheckCircle className="h-4 w-4" />,
      'calendar': <Calendar className="h-4 w-4" />,
      'whatsapp': <MessageCircle className="h-4 w-4" />
    };
    return icons[iconName] || <AlertCircle className="h-4 w-4" />;
  };

  const getColorClass = (colorName) => {
    const colors = { 
      primary: "text-blue-600 bg-blue-50 border-blue-100", 
      success: "text-green-600 bg-green-50 border-green-100", 
      warning: "text-yellow-600 bg-yellow-50 border-yellow-100", 
      info: "text-cyan-600 bg-cyan-50 border-cyan-100" 
    };
    return colors[colorName] || "text-gray-600 bg-gray-50 border-gray-100";
  };

  // FUNÇÃO QUE BUSCA OS DADOS DE VERDADE
  const fetchData = async () => {
    setLoading(true);
    try {
      // ---------------------------------------------------------
      // 1. CONFIGURAÇÃO DE DIAS (ALTERADO PARA 90 DIAS)
      // ---------------------------------------------------------
      const diasAusencia = 90; 
      
      const dataCorte = new Date();
      dataCorte.setDate(dataCorte.getDate() - diasAusencia);
      const dataCorteISO = dataCorte.toISOString().split('T')[0]; // YYYY-MM-DD

      // 2. Busca Pacientes Inativos (Base para Remarketing)
      // Lógica: Atendimentos finalizados com data ANTERIOR a 90 dias atrás
      const { data: inativosData, error: inativosError } = await supabase
        .from('appointments')
        .select('patient_id')
        .eq('status', 'finished')
        .lt('date', dataCorteISO);

      if (inativosError) throw inativosError;
      
      // Filtra IDs únicos de pacientes inativos
      const idsInativos = [...new Set(inativosData?.map(item => item.patient_id))];
      const countInativos = idsInativos.length;

      // 3. Busca Recuperados no Mês
      // Lógica: Status 'scheduled' criados este mês, cujo ID esteja na lista de inativos
      const inicioMes = new Date();
      inicioMes.setDate(1);
      const inicioMesISO = inicioMes.toISOString().split('T')[0];

      let countRecuperados = 0;
      
      if (idsInativos.length > 0) {
        const { data: recuperadosData } = await supabase
          .from('appointments')
          .select('id')
          .eq('status', 'scheduled')
          .gte('created_at', inicioMesISO) // Criado este mês
          .in('patient_id', idsInativos); // É um paciente da lista antiga

        countRecuperados = recuperadosData?.length || 0;
      }

      // 4. Agendamentos Hoje
      const hoje = new Date().toISOString().split('T')[0];
      const { count: countHoje } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('date', hoje);

      // 5. Preencher a Fila (Tabela)
      // Pega os dados dos pacientes inativos
      let filaRemarketing = [];
      if (idsInativos.length > 0) {
        // Busca info dos pacientes
        const { data: patientsData } = await supabase
            .from('patients') 
            .select('id, name, phone')
            .in('id', idsInativos)
            .limit(20);
        
        // Pega a última data de cada um
        if (patientsData) {
            filaRemarketing = await Promise.all(patientsData.map(async (p) => {
                const { data: lastAppt } = await supabase
                    .from('appointments')
                    .select('date')
                    .eq('patient_id', p.id)
                    .eq('status', 'finished')
                    .order('date', { ascending: false })
                    .limit(1)
                    .single();
                
                return {
                    name: p.name,
                    phone: p.phone,
                    last_interaction: lastAppt?.date || 'N/A'
                };
            }));
        }
      }

      setMetrics({
        baseRemarketing: countInativos,
        recuperados: countRecuperados,
        metaProgresso: (countRecuperados / 50) * 100, // Meta fixa de 50
        agendamentosHoje: countHoje || 0
      });

      setFila(filaRemarketing);

    } catch (error) {
      console.error("Erro ao carregar remarketing:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">{dashboardConfig.title}</h1>
          <p className="text-gray-500">Gestão estratégica de retorno de pacientes inativos.</p>
        </div>
        <button 
          onClick={fetchData} 
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>
      <hr className="border-gray-200" />

      {/* Grid de Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Base Inativos */}
        <div className={`rounded-xl border shadow-sm p-6 ${getColorClass('primary').split(' ')[2]} bg-white`}>
            <div className="flex justify-between items-start pb-2">
                <h3 className="text-sm font-medium text-gray-500">Base para Remarketing</h3>
                <div className={`p-2 rounded-full ${getColorClass('primary')}`}>{getIcon('people-carry')}</div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{metrics.baseRemarketing}</div>
            <p className="text-xs text-gray-500 mt-1">Pacientes inativos (+90 dias)</p>
        </div>

        {/* Card 2: Recuperados */}
        <div className={`rounded-xl border shadow-sm p-6 ${getColorClass('success').split(' ')[2]} bg-white`}>
            <div className="flex justify-between items-start pb-2">
                <h3 className="text-sm font-medium text-gray-500">Recuperados no Mês</h3>
                <div className={`p-2 rounded-full ${getColorClass('success')}`}>{getIcon('check-double')}</div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{metrics.recuperados}</div>
            <p className="text-xs text-gray-500 mt-1">Pacientes que re-agendaram</p>
        </div>

        {/* Card 3: Meta */}
        <div className={`rounded-xl border shadow-sm p-6 ${getColorClass('warning').split(' ')[2]} bg-white`}>
            <div className="flex justify-between items-start pb-2">
                <h3 className="text-sm font-medium text-gray-500">Meta de Recuperação</h3>
                <div className={`p-2 rounded-full ${getColorClass('warning')}`}>{getIcon('target')}</div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{metrics.recuperados} / 50</div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-3">
                <div className="bg-yellow-500 h-1.5 rounded-full" style={{ width: `${Math.min(metrics.metaProgresso, 100)}%` }}></div>
            </div>
        </div>

         {/* Card 4: Hoje */}
         <div className={`rounded-xl border shadow-sm p-6 ${getColorClass('info').split(' ')[2]} bg-white`}>
            <div className="flex justify-between items-start pb-2">
                <h3 className="text-sm font-medium text-gray-500">Agenda Hoje</h3>
                <div className={`p-2 rounded-full ${getColorClass('info')}`}>{getIcon('calendar')}</div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{metrics.agendamentosHoje}</div>
            <p className="text-xs text-gray-500 mt-1">Total de atendimentos</p>
        </div>
      </div>

      {/* Tabela de Fila */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-lg font-semibold text-gray-900">Fila Prioritária</h3>
            <p className="text-sm text-gray-500">Pacientes para entrar em contato (Inativos {'>'} 3 meses).</p>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                    <tr>
                        <th className="px-6 py-3">Paciente</th>
                        <th className="px-6 py-3">WhatsApp</th>
                        <th className="px-6 py-3">Última Interação</th>
                        <th className="px-6 py-3">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    {fila.length > 0 ? (
                        fila.map((paciente, i) => (
                            <tr key={i} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900">{paciente.name}</td>
                                <td className="px-6 py-4">{paciente.phone}</td>
                                <td className="px-6 py-4 text-gray-500">
                                    {new Date(paciente.last_interaction).toLocaleDateString('pt-BR')}
                                </td>
                                <td className="px-6 py-4">
                                    <a 
                                        href={`https://wa.me/${paciente.phone}`} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="text-green-600 hover:text-green-800 font-medium flex items-center gap-1"
                                    >
                                        <MessageCircle className="w-4 h-4"/> Conversar
                                    </a>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                                Nenhuma oportunidade encontrada no momento.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default Remarketing;