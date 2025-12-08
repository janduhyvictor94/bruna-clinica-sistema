import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Users, UserPlus, UserCheck, TrendingUp, Package } from 'lucide-react';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfYear, endOfYear } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#c4a47c', '#78716c', '#d6d3d1', '#a8a29e', '#57534e', '#44403c', '#292524', '#a16207'];

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
  // Dados para o Gráfico de Pizza (Cidades)
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
  // Dados para o Gráfico de Pizza (Canais)
  const originPieData = Object.entries(originStats)
    .map(([name, data]) => ({ name, value: data.count }))
    .sort((a, b) => b.value - a.value);
  
  // Melhor Canal (para o Card)
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
  // Dados para o Gráfico de Pizza (Gênero)
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
  // Dados para o Gráfico de Pizza (Procedimentos)
  const proceduresPieData = Object.entries(procedureStats)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // 5. Materiais (Top 5)
  const materialUsage = filteredMovements.reduce((acc, m) => {
    if (!acc[m.material_name]) acc[m.material_name] = 0;
    acc[m.material_name] += m.total_cost; // Usando Custo Total para relevância
    return acc;
  }, {});
  // Dados para o Gráfico de Pizza (Materiais)
  const materialsPieData = Object.entries(materialUsage)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);

  // Componente Auxiliar para Gráfico de Pizza Padronizado
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
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
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

      {/* COMPARAÇÃO NOVOS VS RECORRENTES (MANTIDO CARDS PARA CLAREZA) */}
      <Card className="bg-white border-stone-100">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2"><CardTitle className="text-base sm:text-lg font-medium">Novos vs Recorrentes</CardTitle></CardHeader>
        <CardContent className="p-4 sm:p-6 pt-2 sm:pt-2">
            <div className="grid grid-cols-2 gap-3 sm:gap-6">
                <div className="text-center p-3 sm:p-6 bg-emerald-50 rounded-xl"><UserPlus className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-emerald-600 mb-1 sm:mb-2"/><p className="text-2xl sm:text-3xl font-light text-stone-800">{newPatients}</p><p className="text-xs sm:text-sm text-stone-500 mt-1">Novos</p></div>
                <div className="text-center p-3 sm:p-6 bg-blue-50 rounded-xl"><UserCheck className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-blue-600 mb-1 sm:mb-2"/><p className="text-2xl sm:text-3xl font-light text-stone-800">{returningPatients}</p><p className="text-xs sm:text-sm text-stone-500 mt-1">Recorrentes</p></div>
            </div>
        </CardContent>
      </Card>

      {/* LINHA 2: Procedimentos, Materiais e Cidades (TUDO PIZZA) */}
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