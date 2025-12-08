import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Users, UserPlus, UserCheck, TrendingUp, DollarSign, Package } from 'lucide-react';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfYear, endOfYear } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#c4a47c', '#78716c', '#d6d3d1', '#a8a29e', '#57534e', '#44403c'];

export default function Reports() {
  const [filterType, setFilterType] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // --- CONEXÃO SUPABASE ---
  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*'); return data || []; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data || []; } });
  const { data: stockMovements = [] } = useQuery({ queryKey: ['stock_movements'], queryFn: async () => { const { data } = await supabase.from('stock_movements').select('*'); return data || []; } });

  const getDateRange = () => {
    if (filterType === 'month') return { start: startOfMonth(new Date(selectedYear, selectedMonth)), end: endOfMonth(new Date(selectedYear, selectedMonth)) };
    if (filterType === 'year') return { start: startOfYear(new Date(selectedYear, 0)), end: endOfYear(new Date(selectedYear, 0)) };
    if (filterType === 'custom' && startDate && endDate) return { start: parseISO(startDate), end: parseISO(endDate) };
    return { start: new Date(0), end: new Date() };
  };
  const { start, end } = getDateRange();

  const filteredAppointments = appointments.filter(a => {
    const date = new Date(a.date);
    return isWithinInterval(date, { start, end }) && a.status === 'Realizado';
  });

  // Métricas
  const newPatients = filteredAppointments.filter(a => a.is_new_patient).length;
  const returningPatients = filteredAppointments.filter(a => !a.is_new_patient).length;

  const filteredMovements = stockMovements.filter(m => {
    const date = new Date(m.date);
    return isWithinInterval(date, { start, end }) && m.type === 'saida';
  });
  const totalMaterialCost = filteredMovements.reduce((sum, m) => sum + (m.total_cost || 0), 0);

  // Materiais mais usados (TABELA INFERIOR)
  const materialUsage = filteredMovements.reduce((acc, m) => {
    if (!acc[m.material_name]) acc[m.material_name] = { quantity: 0, cost: 0 };
    acc[m.material_name].quantity += m.quantity || 0;
    acc[m.material_name].cost += m.total_cost || 0;
    return acc;
  }, {});
  const topMaterials = Object.entries(materialUsage).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.cost - a.cost).slice(0, 10);

  // Procedimentos mais executados (TABELA INFERIOR)
  const procedureStats = filteredAppointments.reduce((acc, a) => {
    if (a.procedures_performed?.length > 0) {
      a.procedures_performed.forEach(p => {
        if (!acc[p.procedure_name]) acc[p.procedure_name] = { count: 0, revenue: 0, materialCost: 0 };
        acc[p.procedure_name].count++;
        acc[p.procedure_name].revenue += p.price || 0;
      });
      const materialCost = a.total_material_cost || 0;
      const procedureCount = a.procedures_performed.length;
      a.procedures_performed.forEach(p => { acc[p.procedure_name].materialCost += materialCost / procedureCount; });
    }
    return acc;
  }, {});
  const topProcedures = Object.entries(procedureStats).map(([name, data]) => ({ name, ...data, profit: data.revenue - data.materialCost })).sort((a, b) => b.count - a.count).slice(0, 10);

  // Métricas de Gênero e Origem
  const genderStats = filteredAppointments.reduce((acc, a) => {
    const gender = a.patient_gender || 'Outro';
    if (!acc[gender]) acc[gender] = { count: 0, total: 0 };
    acc[gender].count++;
    acc[gender].total += a.final_value || a.total_value || 0;
    return acc;
  }, {});
  const genderChartData = Object.entries(genderStats).map(([name, data]) => ({ name, faturamento: data.total }));
  const genderPieData = Object.entries(genderStats).map(([name, data]) => ({ name, value: data.count }));

  const originStats = filteredAppointments.reduce((acc, a) => {
    const origin = a.patient_origin || 'Outro';
    if (!acc[origin]) acc[origin] = { count: 0, total: 0 };
    acc[origin].count++;
    acc[origin].total += a.final_value || a.total_value || 0;
    return acc;
  }, {});
  const originChartData = Object.entries(originStats).map(([name, data]) => ({ name, pacientes: data.count, faturamento: data.total })).sort((a, b) => b.pacientes - a.pacientes);

  const bestOrigin = originChartData.length > 0 ? originChartData[0] : null;
  const highestSpendingGender = Object.entries(genderStats).sort(([,a], [,b]) => b.total - a.total)[0];

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" subtitle="Análise de métricas e desempenho" />

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
        <StatCard title="Lucro" value={`R$ ${(filteredAppointments.reduce((sum,a) => sum+(a.final_value||0),0) - totalMaterialCost).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} icon={TrendingUp} />
      </div>

      {/* Insights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-stone-800 to-stone-900 text-white border-0"><CardContent className="p-4 sm:p-6"><p className="text-xs sm:text-sm text-stone-300 mb-1 sm:mb-2">Melhor Canal</p><p className="text-xl sm:text-2xl font-light">{bestOrigin?.name || '-'}</p><p className="text-xs sm:text-sm text-stone-400 mt-1">{bestOrigin ? `${bestOrigin.pacientes} pac. | R$ ${bestOrigin.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : 'Sem dados'}</p></CardContent></Card>
        <Card className="bg-gradient-to-br from-amber-600 to-amber-700 text-white border-0"><CardContent className="p-4 sm:p-6"><p className="text-xs sm:text-sm text-amber-200 mb-1 sm:mb-2">Quem Mais Gasta</p><p className="text-xl sm:text-2xl font-light">{highestSpendingGender?.[0] || '-'}</p><p className="text-xs sm:text-sm text-amber-200/70 mt-1">{highestSpendingGender ? `R$ ${highestSpendingGender[1].total.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : 'Sem dados'}</p></CardContent></Card>
      </div>

      {/* Gráficos de Pizza e Barras */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="bg-white border-stone-100"><CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Pacientes por Gênero</CardTitle></CardHeader><CardContent className="p-4 sm:p-6 pt-2 sm:pt-2"><div className="h-48 sm:h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={genderPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>{genderPieData.map((e,i)=><Cell key={`cell-${i}`} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></div></CardContent></Card>
        <Card className="bg-white border-stone-100"><CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Desempenho por Canal</CardTitle></CardHeader><CardContent className="p-4 sm:p-6 pt-2 sm:pt-2"><div className="h-64 sm:h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={originChartData} layout="vertical"><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" stroke="#78716c" fontSize={12}/><YAxis type="category" dataKey="name" stroke="#78716c" fontSize={12} width={100}/><Tooltip/><Legend/><Bar dataKey="pacientes" fill="#78716c" name="Pacientes" radius={[0, 4, 4, 0]}/><Bar dataKey="faturamento" fill="#c4a47c" name="Faturamento" radius={[0, 4, 4, 0]}/></BarChart></ResponsiveContainer></div></CardContent></Card>
      </div>

      {/* Novos vs Recorrentes (Faltava isso) */}
      <Card className="bg-white border-stone-100"><CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Novos vs Recorrentes</CardTitle></CardHeader><CardContent className="p-4 sm:p-6 pt-2 sm:pt-2"><div className="grid grid-cols-2 gap-3 sm:gap-6"><div className="text-center p-3 sm:p-6 bg-emerald-50 rounded-xl"><UserPlus className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-emerald-600 mb-1 sm:mb-2"/><p className="text-2xl sm:text-3xl font-light text-stone-800">{newPatients}</p><p className="text-xs sm:text-sm text-stone-500 mt-1">Novos</p></div><div className="text-center p-3 sm:p-6 bg-blue-50 rounded-xl"><UserCheck className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-blue-600 mb-1 sm:mb-2"/><p className="text-2xl sm:text-3xl font-light text-stone-800">{returningPatients}</p><p className="text-xs sm:text-sm text-stone-500 mt-1">Recorrentes</p></div></div></CardContent></Card>

      {/* Procedimentos Mais Realizados (Faltava isso) */}
      <Card className="bg-white border-stone-100"><CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Procedimentos Mais Realizados</CardTitle></CardHeader><CardContent className="p-4 sm:p-6 pt-2 sm:pt-2"><div className="h-64 sm:h-80 mb-4 sm:mb-6 hidden sm:block"><ResponsiveContainer width="100%" height="100%"><BarChart data={topProcedures} layout="vertical"><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis type="category" dataKey="name" width={120}/><Tooltip/><Legend/><Bar dataKey="count" fill="#78716c" name="Qtd"/><Bar dataKey="profit" fill="#22c55e" name="Lucro"/></BarChart></ResponsiveContainer></div></CardContent></Card>

      {/* Materiais Mais Utilizados (Faltava isso) */}
      <Card className="bg-white border-stone-100"><CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Materiais Mais Utilizados</CardTitle></CardHeader><CardContent className="p-4 sm:p-6 pt-2 sm:pt-2"><div className="h-64 sm:h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={topMaterials} layout="vertical"><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis type="category" dataKey="name" width={80}/><Tooltip/><Legend/><Bar dataKey="cost" fill="#c4a47c" name="Custo Total"/></BarChart></ResponsiveContainer></div></CardContent></Card>
    </div>
  );
}