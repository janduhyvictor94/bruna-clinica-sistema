import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Users, UserPlus, UserCheck, TrendingUp, DollarSign, Package, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfYear, endOfYear } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Button } from '@/components/ui/button';

const COLORS = ['#c4a47c', '#78716c', '#d6d3d1', '#a8a29e', '#57534e', '#44403c'];

export default function Reports() {
  const [filterType, setFilterType] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState(null);

  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*, patients(*)'); return data; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data; } });
  const { data: stockMovements = [] } = useQuery({ queryKey: ['stock-movements'], queryFn: async () => { const { data } = await supabase.from('stock_movements').select('*'); return data; } });

  // --- NAVEGAÇÃO ENTRE MESES (SETAS) ---
  const handlePrevMonth = () => { if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); } else { setSelectedMonth(selectedMonth - 1); } };
  const handleNextMonth = () => { if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); } else { setSelectedMonth(selectedMonth + 1); } };

  const getDateRange = () => {
    if (filterType === 'month') return { start: startOfMonth(new Date(selectedYear, selectedMonth)), end: endOfMonth(new Date(selectedYear, selectedMonth)) };
    if (filterType === 'year') return { start: startOfYear(new Date(selectedYear, 0)), end: endOfYear(new Date(selectedYear, 0)) };
    if (filterType === 'custom' && startDate && endDate) return { start: parseISO(startDate), end: parseISO(endDate) };
    return { start: new Date(0), end: new Date() };
  };
  const { start, end } = getDateRange();

  let filteredAppointments = appointments.filter(a => { const date = new Date(a.date + 'T00:00:00'); return isWithinInterval(date, { start, end }) && a.status === 'Realizado'; });
  if (selectedPatientId) filteredAppointments = filteredAppointments.filter(a => a.patient_id === selectedPatientId);

  const newPatients = filteredAppointments.filter(a => a.type === 'Novo').length; 
  const returningPatients = filteredAppointments.filter(a => a.type === 'Recorrente').length;
  const filteredMovements = stockMovements.filter(m => { const date = new Date(m.date); return isWithinInterval(date, { start, end }) && m.type === 'saida'; });
  const totalMaterialCost = filteredAppointments.reduce((sum, a) => sum + (Number(a.cost_amount) || 0), 0);
  const materialUsage = filteredMovements.reduce((acc, m) => { if (!acc[m.material_name]) acc[m.material_name] = { quantity: 0, cost: 0 }; acc[m.material_name].quantity += m.quantity || 0; acc[m.material_name].cost += m.total_cost || 0; return acc; }, {});
  const topMaterials = Object.entries(materialUsage).map(([name, data]) => ({ name, value: data.cost })).sort((a, b) => b.value - a.value).slice(0, 10);
  const procedureStats = filteredAppointments.reduce((acc, a) => { if (a.procedures_json && Array.isArray(a.procedures_json)) { a.procedures_json.forEach(p => { const pName = p.name || 'Outro'; if (!acc[pName]) acc[pName] = { count: 0, revenue: 0, materialCost: 0 }; acc[pName].count++; acc[pName].revenue += Number(p.value) || 0; }); const materialCost = Number(a.cost_amount) || 0; const procedureCount = a.procedures_json.length; if(procedureCount > 0) { a.procedures_json.forEach(p => { const pName = p.name || 'Outro'; acc[pName].materialCost += materialCost / procedureCount; }); } } return acc; }, {});
  const topProcedures = Object.entries(procedureStats).map(([name, data]) => ({ name, ...data, profit: data.revenue - data.materialCost })).sort((a, b) => b.count - a.count).slice(0, 10);
  const genderStats = filteredAppointments.reduce((acc, a) => { const gender = a.patients?.gender || 'Não Informado'; if (!acc[gender]) acc[gender] = { count: 0, total: 0 }; acc[gender].count++; acc[gender].total += Number(a.total_amount) || 0; return acc; }, {});
  const genderChartData = Object.entries(genderStats).map(([gender, data]) => ({ name: gender, faturamento: data.total }));
  const genderPieData = Object.entries(genderStats).map(([gender, data]) => ({ name: gender, value: data.count }));
  const genderRevenueData = Object.entries(genderStats).map(([gender, data]) => ({ name: gender, value: data.total }));
  const originStats = filteredAppointments.reduce((acc, a) => { const origin = a.patients?.origin || 'Outro'; if (!acc[origin]) acc[origin] = { count: 0, total: 0 }; acc[origin].count++; acc[origin].total += Number(a.total_amount) || 0; return acc; }, {});
  const originPieData = Object.entries(originStats).map(([origin, data]) => ({ name: origin, value: data.count })).sort((a, b) => b.value - a.value);
  const bestOrigin = originPieData.length > 0 ? originPieData[0] : null;
  const highestSpendingGender = Object.entries(genderStats).sort(([,a], [,b]) => b.total - a.total)[0];
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" subtitle={selectedPatientId ? `Análise de Paciente` : "Análise de métricas e desempenho"}/>
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 p-3 sm:p-4 bg-white rounded-xl border border-stone-100 items-center justify-between">
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Select value={filterType} onValueChange={setFilterType}><SelectTrigger className="w-full sm:w-32 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">Por Mês</SelectItem><SelectItem value="year">Por Ano</SelectItem><SelectItem value="custom">Período</SelectItem></SelectContent></Select>
            <Select value={selectedPatientId || 'all'} onValueChange={(v) => setSelectedPatientId(v === 'all' ? null : v)}><SelectTrigger className="w-full sm:w-48 text-sm"><SelectValue placeholder="Todos os pacientes" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os pacientes</SelectItem>{patients.map(p => (<SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>))}</SelectContent></Select>
        </div>
        {filterType === 'month' && (
          <div className="flex items-center gap-2 bg-stone-50 p-1 rounded-lg border border-stone-200">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8 hover:bg-white"><ChevronLeft className="w-4 h-4"/></Button>
            <div className="flex gap-2">
                <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}><SelectTrigger className="flex-1 w-32 h-8 border-none bg-transparent shadow-none font-medium"><SelectValue /></SelectTrigger><SelectContent>{months.map((m, i) => (<SelectItem key={i} value={i.toString()}>{m}</SelectItem>))}</SelectContent></Select>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}><SelectTrigger className="w-20 h-8 border-none bg-transparent shadow-none font-medium"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => (<SelectItem key={y} value={y.toString()}>{y}</SelectItem>))}</SelectContent></Select>
            </div>
            <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8 hover:bg-white"><ChevronRight className="w-4 h-4"/></Button>
          </div>
        )}
      </div>

      {/* AJUSTE: Grid máximo de 4 colunas e fonte reduzida */}
      {selectedPatientId ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Atendimentos" value={filteredAppointments.length} icon={FileText} />
          <StatCard title="Total Investido" value={<span className="text-xl font-bold">R$ {filteredAppointments.reduce((sum, a) => sum + (Number(a.total_amount) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={DollarSign} />
          <StatCard title="Custo Mat." value={<span className="text-xl font-bold">R$ {totalMaterialCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={Package} />
          <StatCard title="Ticket Médio" value={<span className="text-xl font-bold">R$ {(filteredAppointments.length > 0 ? (filteredAppointments.reduce((sum, a) => sum + (Number(a.total_amount) || 0), 0) / filteredAppointments.length) : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingUp} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Novos" value={newPatients} icon={UserPlus} />
          <StatCard title="Recorrentes" value={returningPatients} icon={UserCheck} />
          <StatCard title="Atendimentos" value={filteredAppointments.length} icon={Users} />
          <StatCard title="Custo Mat." value={<span className="text-xl font-bold">R$ {totalMaterialCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={Package} />
          <StatCard title="Lucro" value={<span className="text-xl font-bold">R$ {(filteredAppointments.reduce((sum, a) => sum + (Number(a.total_amount) || 0), 0) - totalMaterialCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingUp} />
        </div>
      )}

      {/* Demais gráficos (PieCharts) */}
      {!selectedPatientId && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-gradient-to-br from-stone-800 to-stone-900 text-white border-0"><CardContent className="p-6"><p className="text-sm text-stone-300 mb-2">Melhor Canal</p><p className="text-2xl font-light">{bestOrigin?.name || '-'}</p><p className="text-sm text-stone-400 mt-1">{bestOrigin ? `${bestOrigin.value} pac.` : 'Sem dados'}</p></CardContent></Card>
            <Card className="bg-gradient-to-br from-amber-600 to-amber-700 text-white border-0"><CardContent className="p-6"><p className="text-sm text-amber-200 mb-2">Gênero que Mais Gasta</p><p className="text-2xl font-light">{highestSpendingGender?.[0] || '-'}</p><p className="text-sm text-amber-200/70 mt-1">{highestSpendingGender ? `R$ ${highestSpendingGender[1].total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sem dados'}</p></CardContent></Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white border-stone-100"><CardHeader className="p-4"><CardTitle>Pacientes por Gênero</CardTitle></CardHeader><CardContent className="p-4 h-64"><ResponsiveContainer><PieChart><Pie data={genderPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>{genderPieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip /></PieChart></ResponsiveContainer></CardContent></Card>
            <Card className="bg-white border-stone-100"><CardHeader className="p-4"><CardTitle>Faturamento por Gênero</CardTitle></CardHeader><CardContent className="p-4 h-64"><ResponsiveContainer><PieChart><Pie data={genderRevenueData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>{genderRevenueData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip /></PieChart></ResponsiveContainer></CardContent></Card>
          </div>
          <Card className="bg-white border-stone-100"><CardHeader className="p-4"><CardTitle>Pacientes por Canal (Origem)</CardTitle></CardHeader><CardContent className="p-4 h-80"><ResponsiveContainer><PieChart><Pie data={originPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>{originPieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></CardContent></Card>
        </>
      )}
      <Card className="bg-white border-stone-100"><CardHeader className="p-4"><CardTitle>Procedimentos Mais Realizados</CardTitle></CardHeader><CardContent className="p-4 pt-2">{topProcedures.length > 0 ? (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left py-2">Procedimento</th><th className="text-center py-2">Qtd</th><th className="text-right py-2 hidden sm:table-cell">Faturamento</th><th className="text-right py-2 hidden sm:table-cell">Custo</th><th className="text-right py-2">Lucro</th></tr></thead><tbody>{topProcedures.map((p, i) => (<tr key={i} className="border-b"><td className="py-2">{p.name}</td><td className="py-2 text-center">{p.count}</td><td className="py-2 text-right hidden sm:table-cell">R$ {p.revenue.toFixed(0)}</td><td className="py-2 text-right hidden sm:table-cell text-amber-600">R$ {p.materialCost.toFixed(0)}</td><td className="py-2 text-right text-emerald-600">R$ {p.profit.toFixed(0)}</td></tr>))}</tbody></table></div>) : <div className="text-center py-12 text-stone-400">Sem procedimentos no período</div>}</CardContent></Card>
      <Card className="bg-white border-stone-100"><CardHeader className="p-4"><CardTitle>Materiais Mais Utilizados (Custo)</CardTitle></CardHeader><CardContent className="p-4 h-80">{topMaterials.length > 0 ? (<ResponsiveContainer><PieChart><Pie data={topMaterials} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>{topMaterials.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>) : <div className="text-center py-12 text-stone-400">Sem movimentações</div>}</CardContent></Card>
    </div>
  );
}