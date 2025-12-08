import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useQuery } from '@tanstack/react-query';
import { startOfMonth, endOfMonth, isWithinInterval, addDays, startOfDay } from 'date-fns';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, DollarSign, Calendar, TrendingUp, Bell, ArrowRight, UserPlus, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default function Dashboard() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*'); return data || []; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data || []; } });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: async () => { const { data } = await supabase.from('expenses').select('*'); return data || []; } });

  const monthStart = startOfMonth(new Date(selectedYear, selectedMonth));
  const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth));

  const monthAppointments = appointments.filter(a => { const date = new Date(a.date + 'T12:00:00'); return isWithinInterval(date, { start: monthStart, end: monthEnd }) && a.status === 'Realizado'; });
  const monthExpenses = expenses.filter(e => { const date = new Date(e.due_date + 'T12:00:00'); return isWithinInterval(date, { start: monthStart, end: monthEnd }); });

  const totalRevenue = monthAppointments.reduce((sum, a) => sum + (a.final_value || a.total_value || 0), 0);
  const totalExpenses = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const profit = totalRevenue - totalExpenses;
  const newPatients = monthAppointments.filter(a => a.is_new_patient).length;
  const returningPatients = monthAppointments.filter(a => !a.is_new_patient).length;

  const genderData = patients.reduce((acc, p) => { const gender = p.gender || 'Outro'; acc[gender] = (acc[gender] || 0) + 1; return acc; }, {});
  const genderChartData = [{ name: 'Feminino', value: genderData['Feminino'] || 0, color: '#c4a47c' }, { name: 'Masculino', value: genderData['Masculino'] || 0, color: '#78716c' }, { name: 'Outro', value: genderData['Outro'] || 0, color: '#d6d3d1' }].filter(d => d.value > 0);

  // --- LÓGICA DE ALERTAS (LER TUDO) ---
  const getUpcomingReturns = () => {
    const today = startOfDay(new Date());
    const limit = addDays(today, 30);
    const alerts = [];

    // 1. Pacientes (Principal + Extras)
    patients.forEach(p => {
        if (p.next_return_date) {
            const date = new Date(p.next_return_date + 'T12:00:00');
            if (date >= today && date <= limit) alerts.push({ id: `p_${p.id}`, name: p.full_name, date: p.next_return_date, type: 'Retorno', source: 'Paciente' });
        }
        if (Array.isArray(p.scheduled_returns)) {
            p.scheduled_returns.forEach((r, i) => {
                if (r.date) {
                    const date = new Date(r.date + 'T12:00:00');
                    if (date >= today && date <= limit) alerts.push({ id: `pe_${p.id}_${i}`, name: p.full_name, date: r.date, type: r.description || 'Extra', source: 'Paciente' });
                }
            });
        }
    });

    // 2. Atendimentos (Principal + Extras)
    appointments.forEach(a => {
        if (a.next_return_date) {
            const date = new Date(a.next_return_date + 'T12:00:00');
            if (date >= today && date <= limit) alerts.push({ id: `a_${a.id}`, name: a.patient_name, date: a.next_return_date, type: 'Retorno', source: 'Atendimento' });
        }
        if (Array.isArray(a.scheduled_returns)) {
            a.scheduled_returns.forEach((r, i) => {
                if (r.date) {
                    const date = new Date(r.date + 'T12:00:00');
                    if (date >= today && date <= limit) alerts.push({ id: `ae_${a.id}_${i}`, name: a.patient_name, date: r.date, type: r.description || 'Extra', source: 'Atendimento' });
                }
            });
        }
    });

    return alerts.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const upcomingReturns = getUpcomingReturns();

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader title="Dashboard" subtitle={`Visão geral da clínica`} action={<div className="flex gap-2"><Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}><SelectTrigger className="w-24 sm:w-32 bg-white text-sm"><SelectValue/></SelectTrigger><SelectContent>{months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}</SelectContent></Select><Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}><SelectTrigger className="w-20 sm:w-24 bg-white text-sm"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select></div>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <StatCard title="Faturamento" value={`R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} icon={DollarSign} />
        <StatCard title="Despesas" value={`R$ ${totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} icon={TrendingUp} />
        <StatCard title="Lucro" value={`R$ ${profit.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} icon={DollarSign} className={profit >= 0 ? '' : 'border-rose-200'} />
        <StatCard title="Atendimentos" value={monthAppointments.length} icon={Calendar} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="bg-white border-stone-200 shadow-sm"><CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2"><CardTitle className="text-xs sm:text-sm font-semibold text-stone-900">Pacientes do Mês</CardTitle></CardHeader><CardContent className="p-4 pt-0 sm:p-6 sm:pt-0"><div className="space-y-3 sm:space-y-4"><div className="flex items-center justify-between p-3 sm:p-4 bg-emerald-50 rounded-xl border border-emerald-200"><div className="flex items-center gap-2 sm:gap-3"><div className="p-1.5 sm:p-2 bg-emerald-600 rounded-lg"><UserPlus className="w-3 h-3 sm:w-4 sm:h-4 text-white" /></div><span className="text-xs sm:text-sm font-medium text-stone-900">Novos</span></div><span className="text-lg sm:text-xl font-semibold text-stone-900">{newPatients}</span></div><div className="flex items-center justify-between p-3 sm:p-4 bg-blue-50 rounded-xl border border-blue-200"><div className="flex items-center gap-2 sm:gap-3"><div className="p-1.5 sm:p-2 bg-blue-600 rounded-lg"><UserCheck className="w-3 h-3 sm:w-4 sm:h-4 text-white" /></div><span className="text-xs sm:text-sm font-medium text-stone-900">Recorrentes</span></div><span className="text-lg sm:text-xl font-semibold text-stone-900">{returningPatients}</span></div></div></CardContent></Card>
        <Card className="bg-white border-stone-200 shadow-sm"><CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2"><CardTitle className="text-xs sm:text-sm font-semibold text-stone-900">Gênero dos Pacientes</CardTitle></CardHeader><CardContent className="p-4 pt-0 sm:p-6 sm:pt-0"><div className="h-32 sm:h-40">{genderChartData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={genderChartData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" strokeWidth={0}>{genderChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-stone-400 text-xs sm:text-sm">Sem dados</div>}</div><div className="flex justify-center gap-3 sm:gap-4 mt-2 flex-wrap">{genderChartData.map((d) => <div key={d.name} className="flex items-center gap-1.5 sm:gap-2"><div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full" style={{ backgroundColor: d.color }} /><span className="text-[10px] sm:text-xs text-stone-500">{d.name}: {d.value}</span></div>)}</div></CardContent></Card>
        
        {/* Card de Retornos (Atualizado) */}
        <Card className="bg-white border-stone-200 shadow-sm sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2 flex flex-row items-center justify-between"><CardTitle className="text-xs sm:text-sm font-semibold text-stone-900 flex items-center gap-2"><Bell className="w-3 h-3 sm:w-4 sm:h-4" /> Retornos (30 dias)</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {upcomingReturns.length > 0 ? (
              <div className="space-y-2 sm:space-y-3 max-h-40 sm:max-h-48 overflow-auto">
                {upcomingReturns.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2 sm:p-3 bg-amber-50 rounded-xl gap-2 border border-amber-200">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium text-stone-900 truncate">{p.name}</p>
                      <p className="text-[10px] sm:text-xs text-stone-600">{p.type} • {p.source}</p>
                    </div>
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] sm:text-xs flex-shrink-0 font-medium">{format(new Date(p.date + 'T12:00:00'), 'dd/MM')}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-24 sm:h-32 flex items-center justify-center text-stone-500 text-xs sm:text-sm">Nenhum retorno próximo</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <Link to={createPageUrl('Patients') + '?action=new'}><div className="p-3 sm:p-4 bg-white rounded-xl border-2 border-stone-200 hover:border-stone-800 hover:bg-stone-800 transition-all cursor-pointer group shadow-sm"><div className="flex items-center justify-between"><div className="flex items-center gap-2 sm:gap-3"><div className="p-1.5 sm:p-2 bg-stone-800 group-hover:bg-white rounded-lg transition-colors"><UserPlus className="w-3 h-3 sm:w-4 sm:h-4 text-white group-hover:text-stone-800" /></div><span className="text-xs sm:text-sm font-medium text-stone-900 group-hover:text-white">Novo Paciente</span></div><ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-stone-600 group-hover:text-white group-hover:translate-x-1 transition-all hidden sm:block" /></div></div></Link>
        <Link to={createPageUrl('Appointments') + '?action=new'}><div className="p-3 sm:p-4 bg-white rounded-xl border-2 border-stone-200 hover:border-stone-800 hover:bg-stone-800 transition-all cursor-pointer group shadow-sm"><div className="flex items-center justify-between"><div className="flex items-center gap-2 sm:gap-3"><div className="p-1.5 sm:p-2 bg-stone-800 group-hover:bg-white rounded-lg transition-colors"><Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-white group-hover:text-stone-800" /></div><span className="text-xs sm:text-sm font-medium text-stone-900 group-hover:text-white">Atendimento</span></div><ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-stone-600 group-hover:text-white group-hover:translate-x-1 transition-all hidden sm:block" /></div></div></Link>
        <Link to={createPageUrl('Financial') + '?tab=expenses'}><div className="p-3 sm:p-4 bg-white rounded-xl border-2 border-stone-200 hover:border-stone-800 hover:bg-stone-800 transition-all cursor-pointer group shadow-sm"><div className="flex items-center justify-between"><div className="flex items-center gap-2 sm:gap-3"><div className="p-1.5 sm:p-2 bg-stone-800 group-hover:bg-white rounded-lg transition-colors"><DollarSign className="w-3 h-3 sm:w-4 sm:h-4 text-white group-hover:text-stone-800" /></div><span className="text-xs sm:text-sm font-medium text-stone-900 group-hover:text-white">Despesa</span></div><ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-stone-600 group-hover:text-white group-hover:translate-x-1 transition-all hidden sm:block" /></div></div></Link>
        <Link to={createPageUrl('Goals')}><div className="p-3 sm:p-4 bg-white rounded-xl border-2 border-stone-200 hover:border-stone-800 hover:bg-stone-800 transition-all cursor-pointer group shadow-sm"><div className="flex items-center justify-between"><div className="flex items-center gap-2 sm:gap-3"><div className="p-1.5 sm:p-2 bg-stone-800 group-hover:bg-white rounded-lg transition-colors"><TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-white group-hover:text-stone-800" /></div><span className="text-xs sm:text-sm font-medium text-stone-900 group-hover:text-white">Metas</span></div><ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-stone-600 group-hover:text-white group-hover:translate-x-1 transition-all hidden sm:block" /></div></div></Link>
      </div>
    </div>
  );
}