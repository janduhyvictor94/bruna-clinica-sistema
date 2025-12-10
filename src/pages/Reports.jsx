import React, { useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, UserPlus, UserCheck, TrendingUp, Package, 
  BarChart3, User, Search, Clock, FileText, Calendar 
} from 'lucide-react';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfYear, endOfYear, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis 
} from 'recharts';

const COLORS = ['#c4a47c', '#78716c', '#d6d3d1', '#a8a29e', '#57534e', '#44403c', '#292524', '#a16207'];

// ==========================================
// COMPONENTE PRINCIPAL (CONTAINER)
// ==========================================
export default function Reports() {
  const [activeTab, setActiveTab] = useState('general'); // 'general' ou 'patient'

  // --- BUSCA DE DADOS CENTRALIZADA ---
  // Buscamos aqui para passar para ambos os relatórios
  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*').order('date', { ascending: false }); return data || []; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data || []; } });
  const { data: stockMovements = [] } = useQuery({ queryKey: ['stock_movements'], queryFn: async () => { const { data } = await supabase.from('stock_movements').select('*'); return data || []; } });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <PageHeader 
        title="Relatórios" 
        subtitle="Análise de métricas e desempenho" 
      />

      {/* --- MENU DE ABAS --- */}
      <div className="flex p-1 bg-stone-100 rounded-xl w-fit border border-stone-200">
        <button 
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'general' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Visão Geral
        </button>
        <button 
          onClick={() => setActiveTab('patient')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'patient' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          <User className="w-4 h-4" /> Por Paciente
        </button>
      </div>

      {/* --- RENDERIZAÇÃO CONDICIONAL --- */}
      {activeTab === 'general' ? (
        <GeneralReport 
            appointments={appointments} 
            patients={patients} 
            stockMovements={stockMovements} 
        />
      ) : (
        <PatientReport 
            appointments={appointments} 
            patients={patients} 
        />
      )}
    </div>
  );
}

// ==========================================
// 1. RELATÓRIO GERAL (SEU CÓDIGO ORIGINAL)
// ==========================================
function GeneralReport({ appointments, patients, stockMovements }) {
  const [filterType, setFilterType] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const getDateRange = () => {
    if (filterType === 'month') return { start: startOfMonth(new Date(selectedYear, selectedMonth)), end: endOfMonth(new Date(selectedYear, selectedMonth)) };
    if (filterType === 'year') return { start: startOfYear(new Date(selectedYear, 0)), end: endOfYear(new Date(selectedYear, 0)) };
    if (filterType === 'custom' && startDate && endDate) return { start: parseISO(startDate), end: parseISO(endDate) };
    return { start: new Date(0), end: new Date() };
  };
  const { start, end } = getDateRange();

  const filteredAppointments = appointments.filter(a => isWithinInterval(new Date(a.date), { start, end }) && a.status === 'Realizado');

  // --- MÉTRICAS GERAIS ---
  const newPatients = filteredAppointments.filter(a => a.is_new_patient).length;
  const returningPatients = filteredAppointments.filter(a => !a.is_new_patient).length;

  const filteredMovements = stockMovements.filter(m => isWithinInterval(new Date(m.date), { start, end }) && m.type === 'saida');
  const totalMaterialCost = filteredMovements.reduce((sum, m) => sum + (m.total_cost || 0), 0);
  const totalRevenue = filteredAppointments.reduce((sum, a) => sum + (a.final_value || a.total_value || 0), 0);
  const profit = totalRevenue - totalMaterialCost;

  // --- ESTATÍSTICAS AVANÇADAS ---
  
  // 1. Cidades
  const cityStats = filteredAppointments.reduce((acc, a) => {
    const patient = patients.find(p => p.id === a.patient_id);
    const city = patient?.city || 'Não Informado';
    if (!acc[city]) acc[city] = { count: 0 };
    acc[city].count++;
    return acc;
  }, {});
  const cityPieData = Object.entries(cityStats)
    .map(([name, data]) => ({ name, value: data.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5); // Top 5

  // 2. Canais (Origem)
  const originStats = filteredAppointments.reduce((acc, a) => {
    const origin = a.patient_origin || 'Outro';
    if (!acc[origin]) acc[origin] = { count: 0, total: 0 };
    acc[origin].count++;
    acc[origin].total += a.final_value || a.total_value || 0;
    return acc;
  }, {});
  const originPieData = Object.entries(originStats)
    .map(([name, data]) => ({ name, value: data.count }))
    .sort((a, b) => b.value - a.value);
  
  const bestOrigin = Object.entries(originStats)
     .sort(([,a], [,b]) => b.count - a.count)[0];

  // 3. Gênero
  const genderStats = filteredAppointments.reduce((acc, a) => {
    const gender = a.patient_gender || 'Outro';
    if (!acc[gender]) acc[gender] = { count: 0, total: 0 };
    acc[gender].count++;
    acc[gender].total += a.final_value || 0;
    return acc;
  }, {});
  const genderPieData = Object.entries(genderStats).map(([name, data]) => ({ name, value: data.count }));
  const highestSpendingGender = Object.entries(genderStats).sort(([,a], [,b]) => b.total - a.total)[0];

  // 4. Procedimentos (Top 5)
  const procedureStats = filteredAppointments.reduce((acc, a) => {
    if (a.procedures_performed?.length > 0) {
      a.procedures_performed.forEach(p => {
        if (!acc[p.procedure_name]) acc[p.procedure_name] = 0;
        acc[p.procedure_name]++;
      });
    }
    return acc;
  }, {});
  const proceduresPieData = Object.entries(procedureStats)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // 5. Materiais (Top 5)
  const materialUsage = filteredMovements.reduce((acc, m) => {
    if (!acc[m.material_name]) acc[m.material_name] = 0;
    acc[m.material_name] += m.total_cost;
    return acc;
  }, {});
  const materialsPieData = Object.entries(materialUsage)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);

  const CustomPieChart = ({ data, nameKey = "name", dataKey = "value" }) => (
    <ResponsiveContainer width="100%" height="100%">
        <PieChart>
            <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey={dataKey}
                label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                    const RADIAN = Math.PI / 180;
                    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                    // const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    // const y = cy + radius * Math.sin(-midAngle * RADIAN);
                    return percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : '';
                }}
                labelLine={false}
            >
                {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
            </Pie>
            <Tooltip formatter={(value) => [value, 'Quantidade']} />
            <Legend verticalAlign="bottom" height={36} iconType="circle" />
        </PieChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 p-3 sm:p-4 bg-white rounded-xl border border-stone-100">
        <Select value={filterType} onValueChange={setFilterType}><SelectTrigger className="w-full sm:w-32 text-sm"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="month">Por Mês</SelectItem><SelectItem value="year">Por Ano</SelectItem><SelectItem value="custom">Período</SelectItem></SelectContent></Select>
        {filterType === 'month' && <div className="flex gap-2 flex-1"><Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}><SelectTrigger className="flex-1 sm:w-36 text-sm"><SelectValue/></SelectTrigger><SelectContent>{months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}</SelectContent></Select><Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}><SelectTrigger className="w-20 sm:w-24 text-sm"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select></div>}
        {filterType === 'year' && <Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}><SelectTrigger className="w-full sm:w-24 text-sm"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select>}
        {filterType === 'custom' && <div className="flex flex-col sm:flex-row gap-2 flex-1"><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 sm:w-40 text-sm"/><span className="text-stone-400 self-center hidden sm:block">até</span><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 sm:w-40 text-sm"/></div>}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
        <StatCard title="Novos" value={newPatients} icon={UserPlus} />
        <StatCard title="Recorrentes" value={returningPatients} icon={UserCheck} />
        <StatCard title="Atendimentos" value={filteredAppointments.length} icon={Users} />
        <StatCard title="Custo Mat." value={`R$ ${totalMaterialCost.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} icon={Package} />
        <StatCard title="Lucro" value={`R$ ${profit.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} icon={TrendingUp} />
      </div>

      {/* Cards de Insights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-stone-800 to-stone-900 text-white border-0"><CardContent className="p-4 sm:p-6"><p className="text-xs sm:text-sm text-stone-300 mb-1 sm:mb-2">Melhor Canal</p><p className="text-xl sm:text-2xl font-light">{bestOrigin ? bestOrigin[0] : '-'}</p><p className="text-xs sm:text-sm text-stone-400 mt-1">{bestOrigin ? `${bestOrigin[1].count} pacientes` : 'Sem dados'}</p></CardContent></Card>
        <Card className="bg-gradient-to-br from-amber-600 to-amber-700 text-white border-0"><CardContent className="p-4 sm:p-6"><p className="text-xs sm:text-sm text-amber-200 mb-1 sm:mb-2">Quem Mais Gasta</p><p className="text-xl sm:text-2xl font-light">{highestSpendingGender?.[0] || '-'}</p><p className="text-xs sm:text-sm text-amber-200/70 mt-1">{highestSpendingGender ? `R$ ${highestSpendingGender[1].total.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : 'Sem dados'}</p></CardContent></Card>
      </div>

      {/* LINHA 1: Gênero e Canais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="bg-white border-stone-100">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Pacientes por Gênero</CardTitle></CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
                <div className="h-64 sm:h-80">
                    {genderPieData.length > 0 ? <CustomPieChart data={genderPieData} /> : <div className="h-full flex items-center justify-center text-stone-400">Sem dados</div>}
                </div>
            </CardContent>
        </Card>
        <Card className="bg-white border-stone-100">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Canais de Aquisição</CardTitle></CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
                <div className="h-64 sm:h-80">
                    {originPieData.length > 0 ? <CustomPieChart data={originPieData} /> : <div className="h-full flex items-center justify-center text-stone-400">Sem dados</div>}
                </div>
            </CardContent>
        </Card>
      </div>

      {/* COMPARAÇÃO NOVOS VS RECORRENTES */}
      <Card className="bg-white border-stone-100">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Novos vs Recorrentes</CardTitle></CardHeader>
        <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
            <div className="grid grid-cols-2 gap-3 sm:gap-6">
                <div className="text-center p-3 sm:p-6 bg-emerald-50 rounded-xl"><UserPlus className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-emerald-600 mb-1 sm:mb-2"/><p className="text-2xl sm:text-3xl font-light text-stone-800">{newPatients}</p><p className="text-xs sm:text-sm text-stone-500 mt-1">Novos</p></div>
                <div className="text-center p-3 sm:p-6 bg-blue-50 rounded-xl"><UserCheck className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-blue-600 mb-1 sm:mb-2"/><p className="text-2xl sm:text-3xl font-light text-stone-800">{returningPatients}</p><p className="text-xs sm:text-sm text-stone-500 mt-1">Recorrentes</p></div>
            </div>
        </CardContent>
      </Card>

      {/* LINHA 2: Procedimentos, Materiais e Cidades */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-white border-stone-100">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Top Procedimentos</CardTitle></CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
                <div className="h-64">
                    {proceduresPieData.length > 0 ? <CustomPieChart data={proceduresPieData} /> : <div className="h-full flex items-center justify-center text-stone-400">Sem dados</div>}
                </div>
            </CardContent>
        </Card>
        
        <Card className="bg-white border-stone-100">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Custo Materiais</CardTitle></CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
                <div className="h-64">
                    {materialsPieData.length > 0 ? <CustomPieChart data={materialsPieData} /> : <div className="h-full flex items-center justify-center text-stone-400">Sem dados</div>}
                </div>
            </CardContent>
        </Card>

        <Card className="bg-white border-stone-100">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Top Cidades</CardTitle></CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
                <div className="h-64">
                    {cityPieData.length > 0 ? <CustomPieChart data={cityPieData} /> : <div className="h-full flex items-center justify-center text-stone-400">Sem dados</div>}
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ==========================================
// 2. RELATÓRIO POR PACIENTE (NOVA FUNCIONALIDADE)
// ==========================================
function PatientReport({ patients, appointments }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState(null);

  const filteredPatients = useMemo(() => {
    if (!searchTerm) return [];
    const lower = searchTerm.toLowerCase();
    return patients.filter(p => p.full_name.toLowerCase().includes(lower)).slice(0, 5);
  }, [searchTerm, patients]);

  const selectedPatient = useMemo(() => patients.find(p => p.id === selectedPatientId), [selectedPatientId, patients]);

  const patientStats = useMemo(() => {
    if (!selectedPatient) return null;
    const history = appointments.filter(a => a.patient_id === selectedPatient.id && a.status === 'Realizado');
    
    const totalSpent = history.reduce((acc, curr) => acc + (curr.final_value || curr.total_value || 0), 0);
    const visitCount = history.length;
    const averageTicket = visitCount > 0 ? totalSpent / visitCount : 0;
    const firstVisit = history.length > 0 ? history[history.length - 1].date : '-';
    
    const proceduresMap = {};
    history.forEach(apt => {
      let procs = [];
      if (Array.isArray(apt.procedures_performed)) procs = apt.procedures_performed;
      else if (typeof apt.procedures_performed === 'string') { try { procs = JSON.parse(apt.procedures_performed); } catch {} }
      procs.forEach(p => { const name = p.procedure_name || p.name || 'Outro'; proceduresMap[name] = (proceduresMap[name] || 0) + 1; });
    });

    const topProcedures = Object.entries(proceduresMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);

    return { history, totalSpent, visitCount, averageTicket, firstVisit, topProcedures };
  }, [selectedPatient, appointments]);

  const formatMoney = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Busca */}
      <Card className="border-stone-200 shadow-sm bg-white sticky top-4 z-10">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input placeholder="Busque o paciente por nome..." className="pl-9 bg-stone-50" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setSelectedPatientId(null); }} />
            {searchTerm && !selectedPatientId && filteredPatients.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-50 overflow-hidden">
                {filteredPatients.map(p => (
                  <div key={p.id} onClick={() => { setSelectedPatientId(p.id); setSearchTerm(p.full_name); }} className="p-3 hover:bg-stone-50 cursor-pointer border-b border-stone-100 last:border-0 text-sm font-medium text-stone-700">{p.full_name}</div>
                ))}
              </div>
            )}
          </div>
          {selectedPatientId && <Button variant="ghost" onClick={() => { setSearchTerm(''); setSelectedPatientId(null); }} className="text-xs text-stone-500">Limpar</Button>}
        </CardContent>
      </Card>

      {/* Dados do Paciente */}
      {selectedPatient && patientStats ? (
        <div className="space-y-6">
          <div className="flex items-center gap-4 ml-2">
            <div className="w-12 h-12 bg-stone-800 rounded-full flex items-center justify-center text-white text-xl">{selectedPatient.full_name.charAt(0)}</div>
            <div><h2 className="text-2xl font-bold text-stone-900">{selectedPatient.full_name}</h2><p className="text-stone-500 text-sm">{selectedPatient.phone}</p></div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-emerald-50 border-emerald-100"><CardContent className="p-6"><div className="text-xs font-bold uppercase text-emerald-700 mb-2">Total Investido</div><div className="text-2xl font-bold text-emerald-900">{formatMoney(patientStats.totalSpent)}</div></CardContent></Card>
            <Card className="bg-blue-50 border-blue-100"><CardContent className="p-6"><div className="text-xs font-bold uppercase text-blue-700 mb-2">Visitas</div><div className="text-2xl font-bold text-blue-900">{patientStats.visitCount}</div></CardContent></Card>
            <Card className="bg-amber-50 border-amber-100"><CardContent className="p-6"><div className="text-xs font-bold uppercase text-amber-700 mb-2">Ticket Médio</div><div className="text-2xl font-bold text-amber-900">{formatMoney(patientStats.averageTicket)}</div></CardContent></Card>
            <Card className="bg-stone-50 border-stone-200"><CardContent className="p-6"><div className="text-xs font-bold uppercase text-stone-600 mb-2">1ª Visita</div><div className="text-lg font-bold text-stone-800">{patientStats.firstVisit !== '-' ? format(new Date(patientStats.firstVisit + 'T12:00:00'), 'dd/MM/yyyy') : '-'}</div></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 h-fit border-stone-200">
                <CardHeader><CardTitle className="text-sm">Preferências (Top 5)</CardTitle></CardHeader>
                <CardContent className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={patientStats.topProcedures} margin={{ left: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11}} />
                            <Tooltip cursor={{fill: '#f5f5f4'}} contentStyle={{borderRadius: '8px', border: 'none'}} />
                            <Bar dataKey="count" fill="#78716c" radius={[0, 4, 4, 0]} barSize={20}>
                                {patientStats.topProcedures.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
            
            <Card className="lg:col-span-2 border-stone-200">
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4"/> Histórico Completo</CardTitle></CardHeader>
                <CardContent className="px-6">
                    <div className="relative border-l border-stone-200 pl-8 space-y-8 py-2">
                      {patientStats.history.map((apt) => {
                         let notes = []; try { notes = JSON.parse(apt.notes); } catch { if(apt.notes) notes = [{ text: apt.notes }]; }
                         if(!Array.isArray(notes)) notes = [];
                         return (
                          <div key={apt.id} className="relative group">
                            <div className="absolute -left-[41px] top-1 w-5 h-5 bg-stone-100 border-2 border-stone-300 rounded-full group-hover:border-stone-800 transition-colors"></div>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-2">
                                <div><span className="text-sm font-bold block text-stone-800">{format(new Date(apt.date + 'T12:00:00'), "d 'de' MMMM, yyyy", { locale: ptBR })}</span></div>
                                <Badge variant="outline" className="mt-1 sm:mt-0 w-fit bg-emerald-50 text-emerald-800 border-emerald-200">{formatMoney(apt.final_value || apt.total_value)}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-3">{Array.isArray(apt.procedures_performed) && apt.procedures_performed.map((p, i) => <Badge key={i} variant="secondary" className="bg-stone-100 text-stone-700 hover:bg-stone-200">{p.procedure_name || p.name}</Badge>)}</div>
                            {notes.length > 0 && <div className="bg-stone-50 rounded-lg p-3 text-xs text-stone-600 space-y-2 border border-stone-100">{notes.map((n, i) => <div key={i} className="flex gap-2"><FileText className="w-3 h-3 mt-0.5 text-stone-400 shrink-0"/><p>{n.text}</p></div>)}</div>}
                          </div>
                         );
                      })}
                      {patientStats.history.length === 0 && <div className="text-sm text-stone-500 italic">Sem histórico.</div>}
                    </div>
                </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-stone-400 opacity-50 space-y-4">
            <User className="w-16 h-16 stroke-1" />
            <p className="text-lg">Selecione um paciente na busca acima para ver o relatório.</p>
        </div>
      )}
    </div>
  );
}