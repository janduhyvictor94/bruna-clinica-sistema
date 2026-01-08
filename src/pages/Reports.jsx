import React, { useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, UserPlus, UserCheck, TrendingUp, DollarSign, Package, 
  FileText, ChevronLeft, ChevronRight, Syringe, Box, User, Clock, 
  CheckCircle2, 
  History as HistoryIcon 
} from 'lucide-react';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfYear, endOfYear, format, differenceInDays } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge'; // <--- Importação adicionada aqui

const COLORS = ['#c4a47c', '#78716c', '#d6d3d1', '#a8a29e', '#57534e', '#44403c'];
const GENDER_COLORS = { 'Feminino': '#c4a47c', 'Masculino': '#57534e', 'Outro': '#d6d3d1' };
const CREDIT_METHODS = ['Cartão de Crédito PJ', 'Cartão de Crédito PF'];

// --- FUNÇÃO DE CÁLCULO PARA RELATÓRIO POR PACIENTE ---
const calculatePatientReport = (patientId, allAppointments, allMovements) => {
    if (!patientId) return null;

    const patientAppointments = allAppointments
        .filter(a => a.patient_id === patientId && a.status && a.status.includes('Realizado'))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Filtra movimentos vinculados aos agendamentos deste paciente
    const patientMovements = allMovements.filter(m => 
        m.type === 'saida' && m.appointment_id && patientAppointments.some(a => a.id === m.appointment_id)
    );

    let totalInvestido = 0;
    let totalCustoMaterial = 0;
    const proceduresCount = {};
    const materialsCount = {};

    patientAppointments.forEach(appt => {
        totalInvestido += Number(appt.total_amount) || 0;
        
        if (appt.procedures_json && Array.isArray(appt.procedures_json)) {
            appt.procedures_json.forEach(p => {
                const pName = p.name || 'Desconhecido';
                proceduresCount[pName] = (proceduresCount[pName] || 0) + 1;
            });
        }
    });

    patientMovements.forEach(m => {
        const mName = m.material_name || 'Desconhecido';
        totalCustoMaterial += Number(m.total_cost) || 0;
        materialsCount[mName] = (materialsCount[mName] || 0) + (Number(m.quantity) || 0);
    });

    let topProcedure = 'N/A';
    let maxCount = 0;
    Object.entries(proceduresCount).forEach(([name, count]) => {
        if (count > maxCount) {
            maxCount = count;
            topProcedure = name;
        }
    });

    const topMaterials = Object.entries(materialsCount)
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

    let avgFrequency = 'N/A';
    if (patientAppointments.length >= 2) {
        const firstDate = parseISO(patientAppointments[patientAppointments.length - 1].date);
        const lastDate = parseISO(patientAppointments[0].date);
        const totalDays = differenceInDays(lastDate, firstDate);
        
        if (totalDays > 0) {
            const numIntervals = patientAppointments.length - 1;
            const avgDays = totalDays / numIntervals;
            avgFrequency = `${avgDays.toFixed(0)} dias`;
        }
    }
    
    const totalLucro = totalInvestido - totalCustoMaterial;

    return {
        totalAtendimentos: patientAppointments.length,
        totalInvestido,
        totalCustoMaterial,
        totalLucro,
        topProcedure,
        topMaterials,
        avgFrequency,
        patientAppointments,
        patientName: patientAppointments[0]?.patients?.full_name || 'Paciente',
        patientData: patientAppointments[0]?.patients,
    };
};


export default function Reports() {
  const [filterType, setFilterType] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailData, setDetailData] = useState({ title: '', items: [], type: 'transaction' });
  
  // Queries
  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*, patients(*)'); return data; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data; } });
  const { data: stockMovements = [] } = useQuery({ queryKey: ['stock-movements'], queryFn: async () => { const { data } = await supabase.from('stock_movements').select('*'); return data; } });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: async () => { const { data } = await supabase.from('expenses').select('*'); return data; } });
  // NOVA QUERY: Installments para cálculo de caixa
  const { data: installments = [] } = useQuery({ 
      queryKey: ['installments'], 
      queryFn: async () => { 
          // Trazemos também o patient_id via appointments para filtrar se necessário
          const { data } = await supabase.from('installments').select('*, appointments(patient_id)'); 
          return data; 
      } 
  });

  const handlePrevMonth = () => { if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); } else { setSelectedMonth(selectedMonth - 1); } };
  const handleNextMonth = () => { if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); } else { setSelectedMonth(selectedMonth + 1); } };

  const getDateRange = () => {
    if (filterType === 'month') return { start: startOfMonth(new Date(selectedYear, selectedMonth)), end: endOfMonth(new Date(selectedYear, selectedMonth)) };
    if (filterType === 'year') return { start: startOfYear(new Date(selectedYear, 0)), end: endOfYear(new Date(selectedYear, 0)) };
    return { start: new Date(0), end: new Date() };
  };
  const { start, end } = getDateRange();

  // 1. Filtra agendamentos por data e status (para contagem e gráficos gerais)
  const filteredAppointments = useMemo(() => {
    return appointments.filter(a => { 
      if(!a.date) return false;
      const date = new Date(a.date + 'T00:00:00'); 
      return isWithinInterval(date, { start, end }) && a.status && a.status.includes('Realizado'); 
    });
  }, [appointments, start, end]);
  
  // 2. Filtra por paciente
  const patientFiltered = useMemo(() => {
      return selectedPatientId 
        ? filteredAppointments.filter(a => a.patient_id === selectedPatientId) 
        : filteredAppointments;
  }, [selectedPatientId, filteredAppointments]);

  const patientReport = useMemo(() => {
    return calculatePatientReport(selectedPatientId, appointments, stockMovements);
  }, [selectedPatientId, appointments, stockMovements]);


  // --- CÁLCULO DE RECEITA (REGIME DE CAIXA - IGUAL DASHBOARD) ---
  const revenueCalculations = useMemo(() => {
      // A. Recebimentos à vista (Entrada imediata nos agendamentos do período)
      // Agendamentos devem estar no período E ter status Realizado
      // Se houver paciente selecionado, filtra por ele.
      const cashAppointments = appointments.filter(a => {
          const date = new Date(a.date + 'T00:00:00');
          const isDateIn = isWithinInterval(date, { start, end });
          const isRealized = a.status && a.status.includes('Realizado');
          const isPatientMatch = selectedPatientId ? a.patient_id === selectedPatientId : true;
          return isDateIn && isRealized && isPatientMatch;
      });

      const cashFromAppointments = cashAppointments.reduce((sum, appt) => {
          const methods = appt.payment_methods_json || [];
          // Soma apenas o que NÃO gera parcela (Dinheiro, Pix, Débito...)
          // Crédito e Agendamento vão para a tabela installments
          const cashPart = methods
              .filter(m => {
                  const method = m.method || '';
                  const isInstallmentStarter = CREDIT_METHODS.includes(method) || method === 'Agendamento de Pagamento';
                  return !isInstallmentStarter;
              })
              .reduce((s, m) => {
                  const rawValue = Number(m.value) || 0;
                  const discPercent = Number(m.discount_percent) || 0;
                  return s + (rawValue - (rawValue * (discPercent / 100)));
              }, 0);
          return sum + cashPart;
      }, 0);

      // B. Recebimentos de Parcelas (Tabela installments)
      // Parcelas onde 'received_date' cai no período
      const receivedInstallments = installments.filter(i => {
          if (!i.is_received || !i.received_date) return false;
          const rDate = parseISO(i.received_date);
          const isDateIn = isWithinInterval(rDate, { start, end });
          
          // Filtro de Paciente nas Parcelas
          let isPatientMatch = true;
          if (selectedPatientId) {
             // Tenta pegar do join ou, se não tiver, tenta achar o agendamento pai na lista de appointments
             const parentAppt = i.appointments || appointments.find(a => a.id === i.appointment_id);
             if (parentAppt && parentAppt.patient_id !== selectedPatientId) {
                 isPatientMatch = false;
             }
          }

          return isDateIn && isPatientMatch;
      });

      const cashFromInstallments = receivedInstallments.reduce((sum, i) => sum + (Number(i.value) || 0), 0);

      return cashFromAppointments + cashFromInstallments;

  }, [appointments, installments, start, end, selectedPatientId]);


  // --- MOVIMENTAÇÕES DE ESTOQUE ---
  const filteredMovements = useMemo(() => {
      return stockMovements.filter(m => { 
        const date = new Date(m.date); 
        const inPeriod = isWithinInterval(date, { start, end }) && m.type === 'saida';
        if (!inPeriod) return false;

        if (m.appointment_id) {
            const parentAppt = appointments.find(a => a.id === m.appointment_id);
            if (!parentAppt || !parentAppt.status || !parentAppt.status.includes('Realizado')) {
                return false; 
            }
            if (selectedPatientId && parentAppt.patient_id !== selectedPatientId) {
                return false;
            }
        } else if (selectedPatientId) {
            return false;
        }
        return true; 
    });
  }, [stockMovements, appointments, start, end, selectedPatientId]);


  // --- TOTAIS GERAIS ---
  const newPatients = patientFiltered.filter(a => a.type === 'Novo').length; 
  const returningPatients = patientFiltered.filter(a => a.type === 'Recorrente').length;
  
  // Custo Variável
  const totalMaterialCost = filteredMovements.reduce((sum, m) => sum + (Number(m.total_cost) || 0), 0);
  
  // Receita (Agora via Regime de Caixa)
  const totalRevenue = revenueCalculations;

  // Despesas Operacionais (Fixo)
  const filteredExpenses = expenses.filter(e => {
      if(!e.due_date || !e.is_paid) return false;
      const date = parseISO(e.due_date);
      return isWithinInterval(date, { start, end });
  });
  const totalOperatingExpenses = selectedPatientId ? 0 : filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // Lucro Líquido
  const totalProfit = totalRevenue - totalMaterialCost - totalOperatingExpenses;

  // --- CÁLCULOS AVANÇADOS ---
  const procedureStats = useMemo(() => {
      const stats = {};
      patientFiltered.forEach(a => {
          if (a.procedures_json && Array.isArray(a.procedures_json)) {
              a.procedures_json.forEach(p => {
                  const pName = p.name || 'Outro';
                  if (!stats[pName]) stats[pName] = { count: 0, revenue: 0, cost: 0, details: [] };
                  stats[pName].count++;
                  stats[pName].revenue += Number(p.value) || 0;
                  stats[pName].details.push({ 
                    date: a.date, 
                    patient: a.patients?.full_name, 
                    patient_id: a.patient_id,
                    value: Number(p.value) || 0
                  });
              });
          }
      });
      return Object.entries(stats).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.count - a.count);
  }, [patientFiltered]);

  const materialStats = useMemo(() => {
      const stats = {};
      filteredMovements.forEach(m => {
          const mName = m.material_name || 'Outro';
          if (!stats[mName]) stats[mName] = { quantity: 0, cost: 0, details: [] };
          stats[mName].quantity += Number(m.quantity) || 0;
          stats[mName].cost += Number(m.total_cost) || 0;
          stats[mName].details.push({ 
            date: m.date, 
            patient: m.patient_name, 
            patient_id: m.appointment_id ? appointments.find(a => a.id === m.appointment_id)?.patient_id : null,
            quantity: Number(m.quantity) || 0,
            value: Number(m.total_cost) || 0 
          });
      });
      return Object.entries(stats).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.cost - a.cost);
  }, [filteredMovements, appointments]);

  const getPatientRanking = (details) => {
    const patientCounts = {};
    details.forEach(item => {
        if (item.patient && item.patient_id) {
            if (!patientCounts[item.patient_id]) {
                patientCounts[item.patient_id] = { name: item.patient, count: 0, totalValue: 0, totalQuantity: 0 };
            }
            patientCounts[item.patient_id].count++;
            if (item.value) patientCounts[item.patient_id].totalValue += Number(item.value);
            if (item.quantity) patientCounts[item.patient_id].totalQuantity += Number(item.quantity);
        }
    });
    return Object.values(patientCounts).sort((a, b) => b.count - a.count).slice(0, 10);
  };
  
  const openDetails = (title, items, type = 'transaction') => {
      setDetailData({ title, items, type });
      setDetailModalOpen(true);
  };

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);

  // --- GRÁFICOS ---
  const genderStats = useMemo(() => {
      const counts = {};
      const revenue = {};
      patientFiltered.forEach(app => {
          const gender = app.patients?.gender || 'Não informado';
          counts[gender] = (counts[gender] || 0) + 1;
          revenue[gender] = (revenue[gender] || 0) + (Number(app.total_amount) || 0);
      });
      const countData = Object.entries(counts).map(([name, value]) => ({ name, value }));
      const revenueData = Object.entries(revenue).map(([name, value]) => ({ name, value }));
      let maxRevenue = -1;
      let maxRevenueGender = 'N/A';
      revenueData.forEach(item => {
          if(item.value > maxRevenue) {
              maxRevenue = item.value;
              maxRevenueGender = item.name;
          }
      });
      return { countData, revenueData, maxRevenueGender, maxRevenue };
  }, [patientFiltered]);
  
  const channelStats = useMemo(() => {
      const counts = {};
      patientFiltered.forEach(app => {
          const origin = app.patients?.origin || 'Outro';
          counts[origin] = (counts[origin] || 0) + 1;
      });
      const data = Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
      const bestChannel = data.length > 0 ? data[0].name : 'N/A';
      const bestChannelCount = data.length > 0 ? data[0].value : 0;
      return { data, bestChannel, bestChannelCount };
  }, [patientFiltered]);

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" subtitle="Análise de métricas e desempenho"/>
      
      <div className="flex flex-col sm:flex-row flex-wrap gap-4 p-4 bg-white rounded-xl border border-stone-100 items-center justify-between">
        <div className="flex gap-2">
            <Select value={filterType} onValueChange={setFilterType}><SelectTrigger className="w-32 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">Por Mês</SelectItem><SelectItem value="year">Por Ano</SelectItem></SelectContent></Select>
            <div className="hidden sm:block">
                <Select value={selectedPatientId || 'all'} onValueChange={(v) => setSelectedPatientId(v === 'all' ? null : v)}><SelectTrigger className="w-48 text-sm"><SelectValue placeholder="Todos os pacientes" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os pacientes</SelectItem>{patients.map(p => (<SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>))}</SelectContent></Select>
            </div>
        </div>
        {filterType === 'month' && (
          <div className="flex items-center gap-2 bg-stone-50 p-1 rounded-lg border border-stone-200">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth}><ChevronLeft className="w-4 h-4"/></Button>
            <div className="flex gap-2"><Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}><SelectTrigger className="w-32 border-none bg-transparent shadow-none"><SelectValue /></SelectTrigger><SelectContent>{months.map((m, i) => (<SelectItem key={i} value={i.toString()}>{m}</SelectItem>))}</SelectContent></Select><Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}><SelectTrigger className="w-20 border-none bg-transparent shadow-none"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => (<SelectItem key={y} value={y.toString()}>{y}</SelectItem>))}</SelectContent></Select></div>
            <Button variant="ghost" size="icon" onClick={handleNextMonth}><ChevronRight className="w-4 h-4"/></Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-stone-100 w-full sm:w-auto grid grid-cols-2 sm:flex">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="patient">Por Paciente</TabsTrigger>
            <TabsTrigger value="procedures">Por Procedimento</TabsTrigger>
            <TabsTrigger value="materials">Por Material</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Novos" value={newPatients} icon={UserPlus} />
                <StatCard title="Recorrentes" value={returningPatients} icon={UserCheck} />
                <StatCard title="Atendimentos" value={patientFiltered.length} icon={Users} />
                <StatCard title="Custo Mat." value={`R$ ${totalMaterialCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={Package} />
            </div>

            <div className="w-full sm:w-1/4">
                 <StatCard 
                    title="Lucro Líquido (Caixa)" 
                    value={`R$ ${totalProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
                    icon={TrendingUp} 
                    className={totalProfit >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}
                 />
                 {!selectedPatientId && totalOperatingExpenses > 0 && (
                     <p className="text-xs text-stone-500 mt-1 ml-1">
                        (Deduzido R$ {totalOperatingExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})} de despesas fixas)
                     </p>
                 )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-stone-900 text-white rounded-xl p-6 shadow-sm">
                    <p className="text-xs text-stone-400 uppercase font-bold tracking-wider mb-2">Melhor Canal</p>
                    <h3 className="text-3xl font-light">{channelStats.bestChannel}</h3>
                    <p className="text-sm text-stone-500 mt-1">{channelStats.bestChannelCount} pac.</p>
                </div>

                <div className="bg-[#c45a01] text-white rounded-xl p-6 shadow-sm">
                    <p className="text-xs text-white/70 uppercase font-bold tracking-wider mb-2">Gênero que Mais Gasta</p>
                    <h3 className="text-3xl font-light">{genderStats.maxRevenueGender}</h3>
                    <p className="text-sm text-white/80 mt-1">R$ {genderStats.maxRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-white border-stone-100">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-stone-700">Pacientes por Gênero</CardTitle></CardHeader>
                    <CardContent className="h-64">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={genderStats.countData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" paddingAngle={5}>
                                    {genderStats.countData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={GENDER_COLORS[entry.name] || COLORS[index]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="middle" align="left" layout="vertical" iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="bg-white border-stone-100">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-stone-700">Faturamento por Gênero</CardTitle></CardHeader>
                    <CardContent className="h-64">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={genderStats.revenueData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" paddingAngle={5}>
                                    {genderStats.revenueData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={GENDER_COLORS[entry.name] || COLORS[index]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `R$ ${value.toLocaleString('pt-BR')}`} />
                                <Legend verticalAlign="middle" align="left" layout="vertical" iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-white border-stone-100">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-stone-700">Pacientes por Canal (Origem)</CardTitle></CardHeader>
                <CardContent className="h-64">
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie data={channelStats.data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" paddingAngle={2}>
                                {channelStats.data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="middle" align="left" layout="vertical" iconType="circle" />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="bg-white border-stone-100">
                <CardHeader className="pb-2 border-b border-stone-50"><CardTitle className="text-sm font-medium text-stone-700">Procedimentos Mais Realizados</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-sm">
                        <thead className="text-xs text-stone-500 font-bold bg-stone-50">
                            <tr>
                                <th className="px-4 py-2 text-left">Procedimento</th>
                                <th className="px-4 py-2 text-center">Qtd</th>
                                <th className="px-4 py-2 text-right">Faturamento</th>
                                <th className="px-4 py-2 text-right">Lucro (Bruto)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {procedureStats.slice(0, 5).map((proc, i) => (
                                <tr key={i} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/50">
                                    <td className="px-4 py-3 font-medium text-stone-800">{proc.name}</td>
                                    <td className="px-4 py-3 text-center text-stone-600">{proc.count}</td>
                                    <td className="px-4 py-3 text-right text-stone-600">R$ {proc.revenue.toLocaleString('pt-BR', {minimumFractionDigits: 0})}</td>
                                    <td className="px-4 py-3 text-right text-emerald-600">R$ {proc.revenue.toLocaleString('pt-BR', {minimumFractionDigits: 0})}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            <Card className="bg-white border-stone-100">
                <CardHeader className="pb-2 border-b border-stone-50"><CardTitle className="text-sm font-medium text-stone-700">Materiais Mais Utilizados (Custo)</CardTitle></CardHeader>
                <CardContent className="h-64">
                    {materialStats.length > 0 ? (
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={materialStats.slice(0, 5)} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="cost" nameKey="name" paddingAngle={2}>
                                    {materialStats.slice(0, 5).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `R$ ${value.toLocaleString('pt-BR')}`} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <p className="text-center text-stone-400 py-20">Sem dados de consumo.</p>}
                </CardContent>
            </Card>

        </TabsContent>

        <TabsContent value="patient" className="mt-6 space-y-4">
            {selectedPatientId && patientReport ? (
                <>
                    <Card className="bg-white border-stone-100 p-6 shadow-md">
                        <div className="flex items-center gap-4 mb-4 border-b border-stone-100 pb-3">
                            <div className="w-12 h-12 rounded-full bg-stone-900 text-white flex items-center justify-center font-bold text-xl">{patientReport.patientName.charAt(0)}</div>
                            <div>
                                <h3 className="text-xl font-bold text-stone-900">{patientReport.patientName}</h3>
                                <p className="text-sm text-stone-500">Última atualização: {patientReport.patientAppointments.length > 0 ? format(parseISO(patientReport.patientAppointments[0].date), 'dd/MM/yyyy') : 'N/A'}</p>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard title="Total Atendimentos" value={patientReport.totalAtendimentos} icon={FileText} className="bg-stone-50/50" />
                            <StatCard title="Total Investido" value={`R$ ${patientReport.totalInvestido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={DollarSign} className="bg-blue-50/50" />
                            <StatCard title="Total Custo Mat." value={`R$ ${patientReport.totalCustoMaterial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={Package} className="bg-rose-50/50" />
                            <StatCard title="Lucro (Paciente)" value={`R$ ${patientReport.totalLucro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={TrendingUp} className={patientReport.totalLucro >= 0 ? 'bg-emerald-50/50' : 'bg-rose-50/50'} />
                        </div>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="bg-white border-stone-100 p-4 space-y-3">
                            <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-2"><Syringe className="w-4 h-4"/> Destaques Clínicos</h4>
                            <div className="space-y-2">
                                <div className="p-3 bg-stone-50 rounded-lg">
                                    <p className="text-[10px] text-stone-400 uppercase font-bold">Procedimento Mais Comum</p>
                                    <p className="text-sm font-bold text-stone-800">{patientReport.topProcedure}</p>
                                </div>
                                <div className="p-3 bg-stone-50 rounded-lg">
                                    <p className="text-[10px] text-stone-400 uppercase font-bold">Frequência Média</p>
                                    <p className="text-sm font-bold text-stone-800">{patientReport.avgFrequency}</p>
                                </div>
                            </div>
                            <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-2 pt-3 border-t border-stone-100"><Box className="w-4 h-4"/> Materiais Mais Usados</h4>
                            <div className="space-y-1">
                                {patientReport.topMaterials.length > 0 ? patientReport.topMaterials.map((m, i) => (
                                    <div key={i} className="flex justify-between text-sm items-center border-b border-stone-50/50 pb-1 last:border-0">
                                        <span className="font-medium text-stone-700">{m.name}</span>
                                        <Badge variant="secondary">{m.quantity.toFixed(1)} un</Badge>
                                    </div>
                                )) : <p className="text-xs text-stone-400 italic">Sem consumo registrado.</p>}
                            </div>
                        </Card>
                        
                        <Card className="md:col-span-2 bg-white border-stone-100 p-4">
                            <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-2 mb-3"><HistoryIcon className="w-4 h-4"/> Histórico de Atendimentos (Detalhado)</h4>
                            <ScrollArea className="h-[400px]">
                                <div className="space-y-3 pr-2">
                                    {patientReport.patientAppointments.map(appt => (
                                        <div key={appt.id} className="p-3 border border-stone-200 rounded-lg bg-stone-50 hover:bg-white shadow-sm transition-colors">
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 className={`w-4 h-4 ${appt.status.includes('Realizado') ? 'text-emerald-500' : 'text-stone-400'}`} />
                                                    <span className="text-sm font-bold text-stone-800">{format(parseISO(appt.date), 'dd/MM/yyyy')}</span>
                                                </div>
                                                <span className="font-bold text-sm text-blue-600">R$ {appt.total_amount?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                            </div>
                                            <p className="text-xs text-stone-500 line-clamp-1 mb-1">
                                                {appt.procedures_json?.map(p => p.name).join(', ') || 'Nenhum procedimento registrado.'}
                                            </p>
                                            <div className="flex justify-between items-center text-[10px] text-stone-400 pt-1 border-t border-stone-100">
                                                <span>Lucro: R$ {appt.profit_amount?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                                <span>Custo Mat: R$ {appt.cost_amount?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {patientReport.patientAppointments.length === 0 && <p className="text-center text-stone-400 py-10 italic">Nenhum atendimento realizado para este paciente.</p>}
                                </div>
                            </ScrollArea>
                        </Card>
                    </div>
                </>
            ) : <p className="text-center text-stone-400 py-10">Selecione um paciente no topo para ver detalhes específicos.</p>}
        </TabsContent>

        <TabsContent value="procedures" className="mt-6">
            <Card className="bg-white border-stone-100">
                <CardHeader className="p-4 bg-stone-50 border-b border-stone-100"><CardTitle className="flex items-center gap-2"><Syringe className="w-4 h-4"/> Performance Detalhada</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-stone-500 uppercase bg-stone-50"><tr><th className="px-4 py-3">Nome</th><th className="px-4 py-3 text-center">Qtd</th><th className="px-4 py-3 text-right">Faturamento</th><th className="px-4 py-3 text-right">Lucro (Bruto)</th><th className="px-4 py-3 text-center">Ação</th></tr></thead>
                        <tbody className="divide-y divide-stone-100">
                            {procedureStats.map((proc, i) => (
                                <tr key={i} className="hover:bg-stone-50">
                                    <td className="px-4 py-3 font-medium">{proc.name}</td>
                                    <td className="px-4 py-3 text-center">{proc.count}</td>
                                    <td className="px-4 py-3 text-right">R$ {proc.revenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                    <td className="px-4 py-3 text-right text-emerald-600">R$ {proc.revenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                    <td className="px-4 py-3 text-center">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="text-blue-600 h-6 text-xs" 
                                            onClick={() => openDetails(`Top Pacientes: ${proc.name}`, getPatientRanking(proc.details), 'ranking')}
                                        >
                                            Top Pacientes
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="materials" className="mt-6">
            <Card className="bg-white border-stone-100">
                <CardHeader className="p-4 bg-stone-50 border-b border-stone-100"><CardTitle className="flex items-center gap-2"><Box className="w-4 h-4"/> Consumo Detalhado</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-stone-500 uppercase bg-stone-50"><tr><th className="px-4 py-3">Material</th><th className="px-4 py-3 text-center">Qtd Usada</th><th className="px-4 py-3 text-right">Custo Total</th><th className="px-4 py-3 text-center">Ação</th></tr></thead>
                        <tbody className="divide-y divide-stone-100">
                            {materialStats.map((mat, i) => (
                                <tr key={i} className="hover:bg-stone-50">
                                    <td className="px-4 py-3 font-medium">{mat.name}</td>
                                    <td className="px-4 py-3 text-center">{mat.quantity}</td>
                                    <td className="px-4 py-3 text-right text-amber-600">R$ {mat.cost.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                    <td className="px-4 py-3 text-center">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="text-blue-600 h-6 text-xs" 
                                            onClick={() => openDetails(`Top Consumidores: ${mat.name}`, getPatientRanking(mat.details), 'ranking')}
                                        >
                                            Top Pacientes
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>{detailData.title}</DialogTitle>
                <DialogDescription>
                    {detailData.type === 'ranking' ? 'Pacientes que mais utilizaram este item no período.' : 'Histórico detalhado do período selecionado.'}
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 mt-2">
                {detailData.items.length === 0 && <p className="text-center text-stone-400 py-4">Nenhum registro encontrado.</p>}

                {detailData.type === 'ranking' && (
                    <table className="w-full text-sm">
                        <thead className="text-xs text-stone-500 uppercase bg-stone-50">
                            <tr>
                                <th className="px-2 py-1 text-left">Paciente</th>
                                <th className="px-2 py-1 text-center">Qtd Atend.</th>
                                <th className="px-2 py-1 text-right">Valor/Consumo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detailData.items.map((item, idx) => (
                                <tr key={item.patient_id || idx} className="border-b border-stone-100 hover:bg-stone-50/50">
                                    <td className="px-2 py-2 font-medium text-stone-700">{item.name}</td>
                                    <td className="px-2 py-2 text-center text-stone-600">{item.count}x</td>
                                    <td className="px-2 py-2 text-right text-blue-600">
                                        {item.totalValue > 0 
                                            ? `R$ ${item.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` 
                                            : `${item.totalQuantity.toFixed(1)} un`}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {detailData.type === 'transaction' && detailData.items.map((item, idx) => (
                    <div key={idx} className="p-2 border border-stone-100 rounded bg-stone-50 flex justify-between items-center text-sm">
                        <div>
                            <p className="font-bold text-stone-700">{item.patient}</p>
                            <p className="text-xs text-stone-500">{format(parseISO(item.date), 'dd/MM/yyyy')}</p>
                        </div>
                        <div className="text-right">
                            {item.value && <p className="font-medium text-stone-800">R$ {item.value.toFixed(2)}</p>}
                            {item.quantity && <p className="font-medium text-stone-800">{item.quantity} un</p>}
                        </div>
                    </div>
                ))}
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}