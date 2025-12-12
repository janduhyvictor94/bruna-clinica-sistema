import React, { useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startOfDay, endOfDay, addDays, isWithinInterval, getDate, getMonth, parseISO, startOfMonth, endOfMonth, differenceInMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale'; 
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Cake, Calendar, AlertTriangle, CheckCircle2, XCircle, DollarSign, TrendingUp, TrendingDown, Syringe } from 'lucide-react';
import { format } from 'date-fns';
import { AppointmentModal } from './Appointments';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export default function Dashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const queryClient = useQueryClient();

  // --- Buscas de Dados ---
  const { data: appointments = [] } = useQuery({ queryKey: ['appointments_list'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*, patients(*)'); return data || []; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data || []; } });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: async () => { const { data } = await supabase.from('expenses').select('*'); return data || []; } });
  const { data: installments = [] } = useQuery({ queryKey: ['installments'], queryFn: async () => { const { data } = await supabase.from('installments').select('*'); return data || []; } });

  // --- Mutações ---
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => { const { error } = await supabase.from('appointments').update({ status }).eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments_list'] }); toast.success('Status atualizado!'); },
    onError: (e) => toast.error("Erro: " + e.message)
  });

  const handleStatusSelect = (id, newStatus) => { updateStatusMutation.mutate({ id, status: newStatus }); };
  
  // Funções de Modal
  const handleOpenAppointment = (appt) => { setSelectedAppointment(appt); setIsModalOpen(true); };
  
  // Função para criar NOVO retorno (CRM)
  const handleRecoveryClick = (appt) => {
      setSelectedAppointment({
          patient_id: appt.patient_id,
          date: format(new Date(), 'yyyy-MM-dd'),
          time: '',
          status: 'Agendado',
          type: 'Recorrente', 
          notes: `Retorno de recuperação (CRM). Última visita: ${format(parseISO(appt.date), 'dd/MM/yyyy')}`
      });
      setIsModalOpen(true);
  };

  // --- Cálculos do Dashboard ---
  const stats = useMemo(() => {
    const today = startOfDay(new Date()); 
    // CORREÇÃO: Aumentei o alcance para 30 dias em ambos os cards para ninguém sumir
    const next30Days = endOfDay(addDays(today, 30));
    
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);

    // Filtros de Mês Atual (Para Financeiro e Contadores)
    const monthAppts = appointments.filter(a => { const d = parseISO(a.date); return isWithinInterval(d, { start: currentMonthStart, end: currentMonthEnd }) && a.status === 'Realizado'; });
    const monthExps = expenses.filter(e => { const d = parseISO(e.due_date); return isWithinInterval(d, { start: currentMonthStart, end: currentMonthEnd }); });
    const monthInstallments = installments.filter(i => { const d = parseISO(i.due_date); return isWithinInterval(d, { start: currentMonthStart, end: currentMonthEnd }); });

    // Cálculos Financeiros
    const revenueFromCash = monthAppts.reduce((sum, appt) => {
        const methods = appt.payment_methods_json || [];
        const cashPart = methods.filter(m => !m.method || !m.method.includes('Crédito')).reduce((s, m) => s + (Number(m.value) || 0), 0);
        return sum + cashPart;
    }, 0);
    const revenueFromInstallments = monthInstallments.reduce((sum, i) => sum + (Number(i.value) || 0), 0);
    const totalRevenue = revenueFromCash + revenueFromInstallments;
    const fixedExpenses = monthExps.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const variableCosts = monthAppts.reduce((sum, a) => sum + (Number(a.cost_amount) || 0), 0);
    const totalExpenses = fixedExpenses + variableCosts;
    const profit = totalRevenue - totalExpenses;

    const birthdays = patients.filter(p => { if (!p.birth_date) return false; const dob = parseISO(p.birth_date); return getDate(dob) === getDate(today) && getMonth(dob) === getMonth(today); });
    
    // --- CORREÇÃO NOS FILTROS DE CARDS ---
    // Agora ambos olham para os próximos 30 dias
    const confirmedList = appointments.filter(a => { 
        const d = parseISO(a.date); 
        return a.status === 'Confirmado' && isWithinInterval(d, { start: today, end: next30Days }); 
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const returnWarnings = appointments.filter(a => { 
        const d = parseISO(a.date); 
        return a.status === 'Agendado' && isWithinInterval(d, { start: today, end: next30Days }); 
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    // -------------------------------------

    // Lógica de Recuperação (CRM)
    const recoveryList = [];
    const processedRecovery = new Set();
    const sortedAppts = [...appointments].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedAppts.forEach(appt => {
        if (!processedRecovery.has(appt.patient_id) && appt.status === 'Realizado') {
            const procs = appt.procedures_json || [];
            const hasBotox = procs.some(p => p.name?.toLowerCase().includes('botox') || p.name?.toLowerCase().includes('toxina'));
            const hasFiller = procs.some(p => p.name?.toLowerCase().includes('preenchimento') || p.name?.toLowerCase().includes('harmonização'));
            let targetMin = 0, targetMax = 0, type = '';

            if (hasBotox) { targetMin = 4; targetMax = 7; type = 'Toxina'; }
            else if (hasFiller) { targetMin = 10; targetMax = 14; type = 'Preenchimento'; }

            if (targetMin > 0) {
                const date = parseISO(appt.date);
                const monthsDiff = differenceInMonths(today, date);
                if (monthsDiff >= targetMin && monthsDiff <= targetMax) {
                    const hasFuture = appointments.some(fut => fut.patient_id === appt.patient_id && new Date(fut.date) > today && fut.status !== 'Cancelado');
                    if (!hasFuture) recoveryList.push({ ...appt, monthsAgo: monthsDiff, typeName: type });
                }
            }
            processedRecovery.add(appt.patient_id);
        }
    });

    return { birthdays, confirmedList, returnWarnings, recoveryList, totalRevenue, totalExpenses, profit, monthCount: monthAppts.length };
  }, [appointments, patients, expenses, installments]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader title="Dashboard" subtitle={`Visão geral de ${format(new Date(), 'MMMM', { locale: ptBR })}`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Faturamento (Mês)" value={<span className="text-lg sm:text-xl font-bold tracking-tight">R$ {stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={DollarSign} />
        <StatCard title="Despesas (Mês)" value={<span className="text-lg sm:text-xl font-bold tracking-tight">R$ {stats.totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingDown} />
        <StatCard title="Líquido (Mês)" value={<span className="text-lg sm:text-xl font-bold tracking-tight">R$ {stats.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>} icon={TrendingUp} className={stats.profit >= 0 ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20' : 'border-rose-200 bg-rose-50 dark:bg-rose-900/20'} />
        <StatCard title="Realizados (Mês)" value={stats.monthCount} icon={Calendar} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        
        {/* CRM / Recuperação */}
        <Card className="border-stone-200 shadow-sm h-[500px] flex flex-col bg-white">
            <CardHeader className="pb-2 p-4 bg-purple-50/50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-900/30">
                <div className="flex justify-between items-center"><CardTitle className="text-sm font-bold text-purple-700 dark:text-purple-300 flex items-center gap-2"><Syringe className="w-4 h-4" /> Retorno (CRM)</CardTitle><Badge className="bg-purple-500 text-white">{stats.recoveryList.length}</Badge></div>
            </CardHeader>
            <CardContent className="p-4 overflow-auto flex-1">
                {stats.recoveryList.length > 0 ? (
                    <div className="space-y-2">{stats.recoveryList.map(a => (<div key={a.id} className="p-3 bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 rounded-lg flex flex-col gap-1 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors" onClick={() => handleRecoveryClick(a)}><div className="flex justify-between"><span className="text-sm font-bold text-stone-700 dark:text-stone-200">{a.patients?.full_name}</span><span className="text-xs font-bold text-purple-600 dark:text-purple-400">{a.typeName} ({a.monthsAgo}m)</span></div><span className="text-xs text-stone-500 dark:text-stone-400">Último: {format(parseISO(a.date), 'dd/MM/yyyy')}</span></div>))}</div>
                ) : <div className="text-xs text-stone-400 text-center py-10">Nenhum paciente para recuperação.</div>}
            </CardContent>
        </Card>

        {/* Aniversariantes */}
        <Card className="border-stone-200 shadow-sm h-[500px] flex flex-col bg-white">
            <CardHeader className="pb-2 p-4 bg-pink-50/50 dark:bg-pink-900/20 border-b border-pink-100 dark:border-pink-900/30">
                <CardTitle className="text-sm font-bold text-pink-700 dark:text-pink-300 flex items-center gap-2"><Cake className="w-4 h-4" /> Aniversariantes (Hoje)</CardTitle>
            </CardHeader>
            <CardContent className="p-4 overflow-auto flex-1">
                {stats.birthdays.length > 0 ? (
                    <div className="space-y-2">{stats.birthdays.map(p => (<div key={p.id} className="p-3 bg-pink-50 dark:bg-pink-900/10 border border-pink-100 dark:border-pink-900/30 rounded-lg flex items-center justify-between"><span className="text-sm font-medium text-stone-700 dark:text-stone-200">{p.full_name}</span><Badge className="bg-pink-200 dark:bg-pink-900 text-pink-800 dark:text-pink-100 border-none">Parabéns!</Badge></div>))}</div>
                ) : <div className="text-xs text-stone-400 text-center py-10">Nenhum aniversariante hoje.</div>}
            </CardContent>
        </Card>

        {/* Confirmados (Agora 30d) */}
        <Card className="border-stone-200 shadow-sm h-[500px] flex flex-col bg-white">
            <CardHeader className="pb-2 p-4 bg-emerald-50/50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-900/30">
                <div className="flex justify-between items-center"><CardTitle className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2"><Calendar className="w-4 h-4" /> Confirmados (30d)</CardTitle><Badge className="bg-emerald-500 text-white">{stats.confirmedList.length}</Badge></div>
            </CardHeader>
            <CardContent className="p-4 overflow-auto flex-1">
                {stats.confirmedList.length > 0 ? (
                    <div className="space-y-2">{stats.confirmedList.map(a => (<div key={a.id} className="p-3 bg-white border border-stone-100 rounded-lg hover:shadow-md transition-all group flex justify-between items-center" onClick={() => handleOpenAppointment(a)}><div className="cursor-pointer flex-1"><div className="flex gap-2 mb-1"><span className="text-xs font-bold text-stone-500">{format(parseISO(a.date), 'dd/MM')} - {a.time}</span></div><p className="font-bold text-stone-800 text-sm group-hover:text-emerald-700">{a.patients?.full_name}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="h-6 text-[10px] px-2 bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200" onClick={(e) => e.stopPropagation()}>OK</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handleStatusSelect(a.id, 'Realizado')}><CheckCircle2 className="w-4 h-4 mr-2"/> Realizado</DropdownMenuItem><DropdownMenuItem onClick={() => handleStatusSelect(a.id, 'Cancelado')}><XCircle className="w-4 h-4 mr-2"/> Cancelar</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>))}</div>
                ) : <div className="text-xs text-stone-400 text-center py-10">Nenhum confirmado (30 dias).</div>}
            </CardContent>
        </Card>

        {/* Agendados (Agora 30d) */}
        <Card className="border-stone-200 shadow-sm h-[500px] flex flex-col bg-white">
            <CardHeader className="pb-2 p-4 bg-amber-50/50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/30">
                <div className="flex justify-between items-center"><CardTitle className="text-sm font-bold text-amber-700 dark:text-amber-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Agendados (30d)</CardTitle><Badge className="bg-amber-500 text-white">{stats.returnWarnings.length}</Badge></div>
            </CardHeader>
            <CardContent className="p-4 overflow-auto flex-1">
                {stats.returnWarnings.length > 0 ? (
                    <div className="space-y-2">{stats.returnWarnings.map(a => (<div key={a.id} className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg hover:bg-amber-100 transition-all relative flex justify-between items-center" onClick={() => handleOpenAppointment(a)}><div className="cursor-pointer flex-1"><div className="flex items-center gap-1 mb-1"><span className="text-xs font-bold text-amber-700">{format(parseISO(a.date), 'dd/MM')}</span></div><p className="font-bold text-stone-800 text-sm">{a.patients?.full_name}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="h-6 text-[10px] px-2 bg-white border-amber-300 text-amber-700 hover:bg-amber-50" onClick={(e) => e.stopPropagation()}>Ver</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handleStatusSelect(a.id, 'Confirmado')}><CheckCircle2 className="w-4 h-4 mr-2"/> Confirmar</DropdownMenuItem><DropdownMenuItem onClick={() => handleStatusSelect(a.id, 'Cancelado')}><XCircle className="w-4 h-4 mr-2"/> Cancelar</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>))}</div>
                ) : <div className="text-xs text-stone-400 text-center py-10">Nenhum pendente (30 dias).</div>}
            </CardContent>
        </Card>
      </div>

      <AppointmentModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen}
        initialData={selectedAppointment}
        
        onDelete={async (id) => {
            const { data: appt } = await supabase.from('appointments').select('patient_id').eq('id', id).single();
            await supabase.from('stock_movements').delete().eq('appointment_id', id);
            await supabase.from('installments').delete().eq('appointment_id', id);
            await supabase.from('appointments').delete().eq('id', id);

            if (appt && appt.patient_id) {
                // A atualização da data correta será feita automaticamente pelo GATILHO SQL que criamos
                // Mas podemos forçar NULL aqui se quiser garantir
                await supabase.from('patients').update({ next_return_date: null }).eq('id', appt.patient_id);
            }

            queryClient.invalidateQueries({ queryKey: ['appointments_list'] });
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['installments'] });
            setIsModalOpen(false);
            toast.success('Excluído!');
        }}

        onSave={async (data) => {
            const { id, returns_to_create, ...rawData } = data;
            const payload = {
                patient_id: rawData.patient_id, date: rawData.date, time: rawData.time, status: rawData.status,
                type: rawData.type, notes: rawData.notes, payment_methods_json: rawData.payment_methods, 
                procedures_json: rawData.procedures_json, materials_json: rawData.materials_json,
                total_amount: Number(rawData.total_amount)||0, cost_amount: Number(rawData.cost_amount)||0,
                profit_amount: Number(rawData.profit_amount)||0, discount_percent: Number(rawData.discount_percent)||0
            };
            
            let appointmentId = id;
            if (id) {
                await supabase.from('appointments').update(payload).eq('id', id);
            } else {
                const { data: newApp } = await supabase.from('appointments').insert([payload]).select().single();
                appointmentId = newApp.id;
            }

            // O GATILHO SQL cuidará de atualizar a tabela 'patients' (next_return_date) automaticamente
            // pois ele roda a cada INSERT ou UPDATE na tabela appointments.
            
            if (returns_to_create && returns_to_create.length > 0) {
                const returnsPayload = returns_to_create.map(ret => ({
                    patient_id: payload.patient_id,
                    date: ret.date,
                    notes: `Retorno Automático: ${ret.note || ''}`,
                    status: 'Agendado',
                    type: 'Recorrente'
                }));
                await supabase.from('appointments').insert(returnsPayload);
            }

            if (payload.status === 'Realizado') {
                await supabase.from('stock_movements').delete().eq('appointment_id', appointmentId);
                await supabase.from('installments').delete().eq('appointment_id', appointmentId);

                if (rawData.materials_json?.length > 0) {
                   const { data: dbMaterials } = await supabase.from('materials').select('id, name, stock_quantity, cost_per_unit');
                   const movementsPayload = [];
                   for (const matItem of rawData.materials_json) {
                       const dbMat = dbMaterials?.find(m => m.name === matItem.name);
                       if (dbMat) {
                           const qty = 1; 
                           await supabase.from('materials').update({ stock_quantity: (dbMat.stock_quantity||0) - qty }).eq('id', dbMat.id);
                           movementsPayload.push({
                               material_id: dbMat.id, appointment_id: appointmentId, type: 'saida', quantity: qty,
                               previous_stock: dbMat.stock_quantity, new_stock: (dbMat.stock_quantity||0) - qty,
                               cost_per_unit: dbMat.cost_per_unit, total_cost: Number(matItem.cost)||0, reason: 'Uso em atendimento',
                               date: payload.date, material_name: dbMat.name, patient_name: rawData.patient_name_ref
                           });
                       }
                   }
                   if (movementsPayload.length) await supabase.from('stock_movements').insert(movementsPayload);
                }

                if (rawData.payment_methods?.length > 0) {
                    const installmentsPayload = [];
                    rawData.payment_methods.forEach(pm => {
                        const isCredit = pm.method && pm.method.includes('Crédito');
                        if (isCredit) {
                            const totalVal = Number(pm.value)||0; const num = Number(pm.installments)||1;
                            const valPerInst = totalVal/num;
                            for(let i=1; i<=num; i++) {
                                const due = new Date(payload.date); due.setMonth(due.getMonth() + (i-1));
                                installmentsPayload.push({
                                    appointment_id: appointmentId, patient_name: rawData.patient_name_ref,
                                    installment_number: i, total_installments: num, value: valPerInst,
                                    due_date: due.toISOString(), is_received: false
                                });
                            }
                        }
                    });
                    if (installmentsPayload.length) await supabase.from('installments').insert(installmentsPayload);
                }
            }

            queryClient.invalidateQueries({ queryKey: ['appointments_list'] });
            queryClient.invalidateQueries({ queryKey: ['patients'] }); 
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['installments'] });
            setIsModalOpen(false);
            toast.success('Salvo!');
        }} 
      />
    </div>
  );
}