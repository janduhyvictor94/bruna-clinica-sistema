import React, { useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startOfDay, endOfDay, addDays, isWithinInterval, getDate, getMonth, parseISO, startOfMonth, endOfMonth, differenceInMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale'; 
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Cake, Calendar, AlertTriangle, CheckCircle2, XCircle, DollarSign, TrendingUp, TrendingDown, Syringe, CreditCard, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { AppointmentModal } from './Appointments';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import PatientDetailsModal from '@/components/PatientDetailsModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const RECEIVE_METHODS = [
    'Pix PF', 'Pix PJ', 'Dinheiro', 
    'Débito PF', 'Débito PJ', 
    'Cartão de Crédito PF', 'Cartão de Crédito PJ', 
    'Agendamento de Pagamento', 
    'Outro'
];

const DISCOUNT_ALLOWED_METHODS = ['Dinheiro', 'Pix PF', 'Pix PJ', 'Débito PJ', 'Débito PF'];
const CREDIT_METHODS = ['Cartão de Crédito PJ', 'Cartão de Crédito PF'];
const INSTALLMENT_ALLOWED_METHODS = [...CREDIT_METHODS, 'Agendamento de Pagamento'];

export default function Dashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [viewingPatientId, setViewingPatientId] = useState(null);
  
  // ESTADOS MODAL
  const [receivingItem, setReceivingItem] = useState(null);
  const [receiveMethod, setReceiveMethod] = useState('');
  const [receiveDiscount, setReceiveDiscount] = useState(0);
  const [receiveInstallments, setReceiveInstallments] = useState(1);

  const queryClient = useQueryClient();

  const { data: appointments = [] } = useQuery({ 
      queryKey: ['appointments_list'], 
      queryFn: async () => { 
          const { data } = await supabase.from('appointments').select('*, patients(*), installments(*)'); 
          return data || []; 
      } 
  });
  
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data || []; } });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: async () => { const { data } = await supabase.from('expenses').select('*'); return data || []; } }
  );
  
  const { data: installments = [] } = useQuery({ 
    queryKey: ['installments'], 
    queryFn: async () => { 
        const { data } = await supabase.from('installments').select('*, appointments(payment_methods_json)'); 
        return data || []; 
    } 
  });

  React.useEffect(() => {
    if (receivingItem) {
        setReceiveInstallments(1); 
        setReceiveMethod('');
        setReceiveDiscount(0);
    }
  }, [receivingItem]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => { 
        const idToUse = Number(id);
        if (isNaN(idToUse)) throw new Error("ID de agendamento inválido.");
        
        const { error } = await supabase.from('appointments').update({ status }).eq('id', idToUse); 
        if (error) throw error; 
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments_list'] }); toast.success('Status atualizado!'); },
    onError: (e) => toast.error("Erro: " + e.message)
  });

  // --- MUTAÇÃO INTELIGENTE DE RECEBIMENTO ---
  const processPaymentMutation = useMutation({
    mutationFn: async ({ id, method, discountPercent, installmentsCount, originalValue, appointmentId, patientName }) => {
        
        const IS_PARCELED_PAYMENT = installmentsCount > 1;
        const IS_CREDIT_PARCELADO = CREDIT_METHODS.includes(method);
        const today = new Date();
        
        // 1. Calcula o valor base e a primeira parcela
        const baseInstallmentValue = originalValue / installmentsCount;
        const discountValue = baseInstallmentValue * (discountPercent / 100);
        const firstInstallmentPaidValue = baseInstallmentValue - discountValue;
        
        const apptId = Number(appointmentId);
        
        // 2. Determina o VENCIMENTO e RECEBIMENTO da 1ª parcela
        let firstInstallmentDueDate;
        let firstInstallmentReceivedDate;
        
        // Pagamentos Parcelados (Crédito, Agendado > 1x)
        if (IS_CREDIT_PARCELADO || IS_PARCELED_PAYMENT) {
             // 1ª parcela vence no próximo mês
            firstInstallmentDueDate = addMonths(today, 1); 
            
            // LÓGICA DE RECEBIMENTO (COMPETÊNCIA)
            if (IS_CREDIT_PARCELADO) {
                 // Para Cartão de Crédito, received_date é a data de vencimento (mês seguinte)
                firstInstallmentReceivedDate = format(firstInstallmentDueDate, 'yyyy-MM-dd');
            } else {
                 // Pagamento Agendado Parcelado (>1x) ou 1x: Fica A RECEBER ou hoje. 
                 // Como a baixa implica o recebimento do valor da 1a parcela,
                 // e o objetivo é rastrear o fluxo de caixa, usamos a data de hoje.
                 firstInstallmentReceivedDate = today.toISOString(); 
            }
        } else {
            // INTEGRAL (1x): Vencimento e Recebimento são hoje.
            firstInstallmentDueDate = today;
            firstInstallmentReceivedDate = today.toISOString();
        }

        // 3. Atualiza a parcela atual (ID clicado) - É a 1ª Parcela
        const { error: updateError } = await supabase.from('installments').update({
            value: firstInstallmentPaidValue, 
            is_received: true, 
            received_date: firstInstallmentReceivedDate, // Data de recebimento (competência ou hoje)
            installment_number: 1, 
            total_installments: installmentsCount, 
            due_date: format(firstInstallmentDueDate, 'yyyy-MM-dd'), // Data de vencimento (competência)
        }).eq('id', id);
        
        if(updateError) throw updateError;

        // 4. Cria as parcelas futuras, se houver
        if (installmentsCount > 1) {
            
            const newInstallments = [];
            
            // Loop começa na parcela 2 (i=2) e vai até o total de parcelas
            for (let i = 2; i <= installmentsCount; i++) { 
                
                // A parcela 'i' vence em 'i' meses a partir de HOJE (D+60, D+90, etc.)
                const dueDate = addMonths(today, i); 
                const formattedDate = format(dueDate, 'yyyy-MM-dd');
                
                // Lógica de recebimento das parcelas futuras:
                // Apenas Cartão de Crédito é TRUE (Contabilização no mês de vencimento)
                const isReceived = IS_CREDIT_PARCELADO; 
                
                newInstallments.push({
                    appointment_id: apptId, 
                    patient_name: patientName,
                    installment_number: i, // Parcela 2, 3...
                    total_installments: installmentsCount,
                    value: baseInstallmentValue, 
                    due_date: formattedDate,
                    is_received: isReceived, 
                    received_date: isReceived ? formattedDate : null 
                });
            }
            if (newInstallments.length > 0) {
                const { error: insertError } = await supabase.from('installments').insert(newInstallments);
                if (insertError) throw insertError;
            }
        }
        
        // 5. CORREÇÃO CRÍTICA: Atualiza o JSON do Appointment para refletir o método final
        if (!isNaN(apptId)) {
            const { data: appt } = await supabase.from('appointments').select('payment_methods_json').eq('id', apptId).single();
            if (appt && appt.payment_methods_json) {
                
                // Filtra para encontrar o pagamento agendado que corresponde ao valor original
                const agendamentoIndex = appt.payment_methods_json.findIndex(pm => 
                    pm.method === 'Agendamento de Pagamento' && (Number(pm.value) === originalValue)
                );
                
                if (agendamentoIndex !== -1) {
                    const newMethods = [...appt.payment_methods_json];
                    
                    // Substitui o método "Agendamento de Pagamento" pelo método final (Cartão/Pix Parcelado)
                    newMethods[agendamentoIndex] = {
                        method: method, 
                        value: originalValue,
                        installments: installmentsCount,
                        // Remove o scheduled_date original e adiciona a data de baixa (hoje)
                        scheduled_date: today.toISOString()
                    };
                    
                    // Salva o JSON atualizado
                    await supabase.from('appointments').update({ payment_methods_json: newMethods }).eq('id', apptId);
                }
            }
        }
    },
    onSuccess: () => { 
        queryClient.invalidateQueries();
        setReceivingItem(null);
        setReceiveMethod('');
        setReceiveDiscount(0);
        setReceiveInstallments(1);
        toast.success('Recebimento confirmado e parcelas contabilizadas!'); 
    },
    onError: (e) => toast.error("Erro ao processar: " + e.message)
  });

  const handleStatusSelect = (id, newStatus) => { 
    if (id) {
        updateStatusMutation.mutate({ id, status: newStatus }); 
    } else {
        toast.error("Erro: ID de agendamento não encontrado.");
    }
  };
  const handleOpenAppointment = (appt) => { setSelectedAppointment(appt); setIsModalOpen(true); };
  
  const handleReceiveClick = (item, e) => {
      e.stopPropagation();
      setReceivingItem(item);
      setReceiveMethod('');
      setReceiveDiscount(0);
      setReceiveInstallments(1); 
  };

  const calculateFirstPaymentDisplay = () => {
      if (!receivingItem) return 0;
      const original = Number(receivingItem.value) || 0;
      const baseParcel = original / receiveInstallments;
      return baseParcel - (baseParcel * (receiveDiscount / 100));
  };

  const confirmReceive = () => {
      if(!receiveMethod) return toast.error("Selecione a forma de pagamento.");
      
      processPaymentMutation.mutate({ 
          id: receivingItem.id, 
          method: receiveMethod,
          discountPercent: Number(receiveDiscount),
          installmentsCount: Number(receiveInstallments),
          originalValue: Number(receivingItem.value),
          appointmentId: receivingItem.appointment_id,
          patientName: receivingItem.patient_name
      });
  };
  
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

  const stats = useMemo(() => {
    const today = startOfDay(new Date()); 
    const next30Days = endOfDay(addDays(today, 30));
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);

    const monthAppts = appointments.filter(a => { const d = parseISO(a.date); return isWithinInterval(d, { start: currentMonthStart, end: currentMonthEnd }) && a.status === 'Realizado'; });
    const monthExps = expenses.filter(e => { const d = parseISO(e.due_date); return isWithinInterval(d, { start: currentMonthStart, end: currentMonthEnd }); });
    const monthInstallments = installments.filter(i => { 
        if(!i.received_date) return false;
        const d = parseISO(i.received_date); 
        return i.is_received && isWithinInterval(d, { start: currentMonthStart, end: currentMonthEnd }); 
    });

    const paymentAlerts = installments
        .filter(i => {
            const isPending = !i.is_received;
            const isSoon = isWithinInterval(parseISO(i.due_date), { start: today, end: next30Days });
            const methods = i.appointments?.payment_methods_json || [];
            // Filtro para mostrar apenas Agendamento de Pagamento no aviso
            const isScheduledPayment = methods.some(m => m.method === 'Agendamento de Pagamento');
            
            // FILTRO: Se está pendente E é Agendamento de Pagamento E vence em 30 dias
            return isPending && isScheduledPayment && isSoon; 
        })
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    // CORREÇÃO: Faturamento do mês (só Pix, Dinheiro, Débito e Parcelas já recebidas)
    const totalRevenueFromAppointments = monthAppts.reduce((sum, appt) => {
        const methods = appt.payment_methods_json || [];
        const cashPart = methods
            .filter(m => {
                const method = m.method || '';
                // EXCLUI: Cartão de Crédito E Agendamento de Pagamento
                const isInstallmentStarter = CREDIT_METHODS.includes(method) || method === 'Agendamento de Pagamento';
                
                // Inclui se NÃO for um método que gera parcelas futuras (apenas Pix, Dinheiro, Débito)
                return !isInstallmentStarter;
            })
            .reduce((s, m) => {
                const rawValue = Number(m.value) || 0;
                const discPercent = Number(m.discount_percent) || 0;
                const discountValue = rawValue * (discPercent / 100);
                return s + (rawValue - discountValue);
            }, 0);
        return sum + cashPart;
    }, 0);

    const revenueFromInstallments = monthInstallments.reduce((sum, i) => sum + (Number(i.value) || 0), 0);

    const totalRevenue = totalRevenueFromAppointments + revenueFromInstallments; // Soma das entradas à vista + Parcelas na competência

    const fixedExpenses = monthExps.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const variableCosts = monthAppts.reduce((sum, a) => sum + (Number(a.cost_amount) || 0), 0);
    const totalExpenses = fixedExpenses + variableCosts;
    const profit = totalRevenue - totalExpenses;

    const birthdays = patients.filter(p => { if (!p.birth_date) return false; const dob = parseISO(p.birth_date); return getDate(dob) === getDate(today) && getMonth(dob) === getMonth(today); });
    const confirmedList = appointments.filter(a => { const d = parseISO(a.date); return a.status === 'Confirmado' && isWithinInterval(d, { start: today, end: next30Days }); }).sort((a, b) => new Date(a.date) - new Date(b.date));
    const returnWarnings = appointments.filter(a => { const d = parseISO(a.date); return a.status === 'Agendado' && isWithinInterval(d, { start: today, end: next30Days }); }).sort((a, b) => new Date(a.date) - new Date(b.date));

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

    return { birthdays, confirmedList, returnWarnings, recoveryList, paymentAlerts, totalRevenue, totalExpenses, profit, monthCount: monthAppts.length };
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        
        {/* CARD A RECEBER */}
        <Card className="border-stone-200 shadow-sm h-[400px] flex flex-col bg-white">
            <CardHeader className="pb-2 p-4 bg-blue-50/50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/30">
                <div className="flex justify-between items-center"><CardTitle className="text-sm font-bold text-blue-700 dark:text-blue-300 flex items-center gap-2"><CreditCard className="w-4 h-4" /> A Receber (30d)</CardTitle><Badge className="bg-blue-500 text-white">{stats.paymentAlerts.length}</Badge></div>
            </CardHeader>
            <CardContent className="p-4 overflow-auto flex-1">
                {stats.paymentAlerts.length > 0 ? (
                    <div className="space-y-2">{stats.paymentAlerts.map(i => (
                        <div key={i.id} className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg flex justify-between items-center group hover:bg-blue-100 transition-colors">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-stone-700 dark:text-stone-200">{i.patient_name}</span>
                                <span className="text-xs text-stone-500">Venc: {format(parseISO(i.due_date), 'dd/MM/yyyy')}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-blue-600 text-sm">R$ {i.value?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-stone-400 hover:text-emerald-600 hover:bg-emerald-100 rounded-full" onClick={(e) => handleReceiveClick(i, e)} title="Confirmar Recebimento">
                                    <CheckCircle2 className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>
                    ))}</div>
                ) : <div className="text-xs text-stone-400 text-center py-10">Nenhum pagamento agendado próximo.</div>}
            </CardContent>
        </Card>

        {/* Demais cards mantidos... */}
        <Card className="border-stone-200 shadow-sm h-[400px] flex flex-col bg-white">
            <CardHeader className="pb-2 p-4 bg-purple-50/50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-900/30">
                <div className="flex justify-between items-center"><CardTitle className="text-sm font-bold text-purple-700 dark:text-purple-300 flex items-center gap-2"><Syringe className="w-4 h-4" /> Retorno (CRM)</CardTitle><Badge className="bg-purple-500 text-white">{stats.recoveryList.length}</Badge></div>
            </CardHeader>
            <CardContent className="p-4 overflow-auto flex-1">
                {stats.recoveryList.length > 0 ? (
                    <div className="space-y-2">{stats.recoveryList.map(a => (<div key={a.id} className="p-3 bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 rounded-lg flex flex-col gap-1 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors" onClick={() => handleRecoveryClick(a)}><div className="flex justify-between"><span className="text-sm font-bold text-stone-700 dark:text-stone-200">{a.patients?.full_name}</span><span className="text-xs font-bold text-purple-600 dark:text-purple-400">{a.typeName} ({a.monthsAgo}m)</span></div><span className="text-xs text-stone-500 dark:text-stone-400">Último: {format(parseISO(a.date), 'dd/MM/yyyy')}</span></div>))}</div>
                ) : <div className="text-xs text-stone-400 text-center py-10">Nenhum paciente para recuperação.</div>}
            </CardContent>
        </Card>

        <Card className="border-stone-200 shadow-sm h-[400px] flex flex-col bg-white">
            <CardHeader className="pb-2 p-4 bg-pink-50/50 dark:bg-pink-900/20 border-b border-pink-100 dark:border-pink-900/30">
                <CardTitle className="text-sm font-bold text-pink-700 dark:text-pink-300 flex items-center gap-2"><Cake className="w-4 h-4" /> Aniversariantes (Hoje)</CardTitle>
            </CardHeader>
            <CardContent className="p-4 overflow-auto flex-1">
                {stats.birthdays.length > 0 ? (
                    <div className="space-y-2">{stats.birthdays.map(p => (
                        <div key={p.id} className="p-3 bg-pink-50 dark:bg-pink-900/10 border border-pink-100 dark:border-pink-900/30 rounded-lg flex items-center justify-between cursor-pointer hover:bg-pink-100 transition-colors" onClick={() => setViewingPatientId(p.id)}>
                            <span className="text-sm font-medium text-stone-700 dark:text-stone-200">{p.full_name}</span>
                            <Badge className="bg-pink-200 dark:bg-pink-900 text-pink-800 dark:text-pink-100 border-none">Parabéns!</Badge>
                        </div>
                    ))}</div>
                ) : <div className="text-xs text-stone-400 text-center py-10">Nenhum aniversariante hoje.</div>}
            </CardContent>
        </Card>

        <Card className="border-stone-200 shadow-sm h-[400px] flex flex-col bg-white">
            <CardHeader className="pb-2 p-4 bg-emerald-50/50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-900/30">
                <div className="flex justify-between items-center"><CardTitle className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2"><Calendar className="w-4 h-4" /> Confirmados (30d)</CardTitle><Badge className="bg-emerald-500 text-white">{stats.confirmedList.length}</Badge></div>
            </CardHeader>
            <CardContent className="p-4 overflow-auto flex-1">
                {stats.confirmedList.length > 0 ? (
                    <div className="space-y-2">{stats.confirmedList.map(a => (<div key={a.id} className="p-3 bg-white border border-stone-100 rounded-lg hover:shadow-md transition-all group flex justify-between items-center" onClick={() => handleOpenAppointment(a)}><div className="cursor-pointer flex-1"><div className="flex gap-2 mb-1"><span className="text-xs font-bold text-stone-500">{format(parseISO(a.date), 'dd/MM')} - {a.time}</span></div><p className="font-bold text-stone-800 text-sm group-hover:text-emerald-700">{a.patients?.full_name}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="h-6 text-[10px] px-2 bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200" onClick={(e) => e.stopPropagation()}>OK</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handleStatusSelect(a.id, 'Realizado')}><CheckCircle2 className="w-4 h-4 mr-2"/> Realizado</DropdownMenuItem><DropdownMenuItem onClick={() => handleStatusSelect(a.id, 'Cancelado')}><XCircle className="w-4 h-4 mr-2"/> Cancelar</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>))}</div>
                ) : <div className="text-xs text-stone-400 text-center py-10">Nenhum confirmado.</div>}
            </CardContent>
        </Card>

        <Card className="border-stone-200 shadow-sm h-[400px] flex flex-col bg-white">
            <CardHeader className="pb-2 p-4 bg-amber-50/50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/30">
                <div className="flex justify-between items-center"><CardTitle className="text-sm font-bold text-amber-700 dark:text-amber-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Agendados (30d)</CardTitle><Badge className="bg-amber-500 text-white">{stats.returnWarnings.length}</Badge></div>
            </CardHeader>
            <CardContent className="p-4 overflow-auto flex-1">
                {stats.returnWarnings.length > 0 ? (
                    <div className="space-y-2">{stats.returnWarnings.map(a => (<div key={a.id} className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg hover:bg-amber-100 transition-all relative flex justify-between items-center" onClick={() => handleOpenAppointment(a)}><div className="cursor-pointer flex-1"><div className="flex items-center gap-1 mb-1"><span className="text-xs font-bold text-amber-700">{format(parseISO(a.date), 'dd/MM')}</span></div><p className="font-bold text-stone-800 text-sm">{a.patients?.full_name}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="h-6 text-[10px] px-2 bg-white border-amber-300 text-amber-700 hover:bg-amber-50" onClick={(e) => e.stopPropagation()}>Ver</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handleStatusSelect(a.id, 'Confirmado')}><CheckCircle2 className="w-4 h-4 mr-2"/> Confirmar</DropdownMenuItem><DropdownMenuItem onClick={() => handleStatusSelect(a.id, 'Cancelado')}><XCircle className="w-4 h-4 mr-2"/> Cancelar</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>))}</div>
                ) : <div className="text-xs text-stone-400 text-center py-10">Nenhum pendente.</div>}
            </CardContent>
        </Card>
      </div>

      <AppointmentModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        initialData={selectedAppointment}
        onDelete={async (id) => {
            const idToDelete = Number(id); 
            if (isNaN(idToDelete)) throw new Error("ID de agendamento inválido.");

            await supabase.from('stock_movements').delete().eq('appointment_id', idToDelete);
            await supabase.from('installments').delete().eq('appointment_id', idToDelete);
            
            const { data: appt } = await supabase.from('appointments').select('patient_id').eq('id', idToDelete).single();
            await supabase.from('appointments').delete().eq('id', idToDelete);
            
            if (appt && appt.patient_id) {
                await supabase.from('patients').update({ next_return_date: null }).eq('id', appt.patient_id);
            }
            queryClient.invalidateQueries();
            setIsModalOpen(false);
            toast.success('Excluído!');
        }}
        onSave={async (data) => {
            try {
                const { id, returns_to_create, custom_installments, ...rawData } = data;
                
                const payload = {
                    patient_id: rawData.patient_id, date: rawData.date, time: rawData.time, status: rawData.status,
                    type: rawData.type, notes: rawData.notes, service_type_custom: rawData.service_type_custom, 
                    payment_methods_json: rawData.payment_methods, 
                    procedures_json: rawData.procedures_json, materials_json: rawData.materials_json,
                    total_amount: Number(rawData.total_amount)||0, cost_amount: Number(rawData.cost_amount)||0,
                    profit_amount: Number(rawData.profit_amount)||0, discount_percent: Number(rawData.discount_percent)||0
                };

                let appointmentId;
                if (id) {
                    const idToUpdate = Number(id);
                    if (isNaN(idToUpdate)) throw new Error("ID de agendamento inválido para atualização.");

                    // UPDATE CRÍTICO - Usando ID numérico
                    const { error } = await supabase.from('appointments').update(payload).eq('id', idToUpdate); 
                    if (error) throw error;
                    appointmentId = idToUpdate;
                } else {
                    const { data: newApp, error } = await supabase.from('appointments').insert([payload]).select().single();
                    if (error) throw error;
                    appointmentId = newApp.id;
                }
                
                const apptId = Number(appointmentId);
                
                if (returns_to_create && returns_to_create.length > 0) {
                    const returnsPayload = returns_to_create.map(ret => ({
                        patient_id: payload.patient_id, date: ret.date,
                        notes: `Retorno Automático: ${ret.note || ''}`, status: 'Agendado', type: 'Recorrente'
                    }));
                    await supabase.from('appointments').insert(returnsPayload);
                }

                if (payload.status === 'Realizado') {
                    await supabase.from('stock_movements').delete().eq('appointment_id', apptId);
                    await supabase.from('installments').delete().eq('appointment_id', apptId);

                    if (rawData.materials_json?.length > 0) {
                       const { data: dbMaterials } = await supabase.from('materials').select('id, name, stock_quantity, cost_per_unit');
                       const movementsPayload = [];
                       for (const matItem of rawData.materials_json) {
                           const dbMat = dbMaterials?.find(m => m.name === matItem.name);
                           if (dbMat) {
                               const qty = Number(matItem.quantity) || 1; 
                               await supabase.from('materials').update({ stock_quantity: (dbMat.stock_quantity||0) - qty }).eq('id', dbMat.id);
                               movementsPayload.push({
                                   material_id: dbMat.id, appointment_id: apptId, type: 'saida', quantity: qty,
                                   previous_stock: dbMat.stock_quantity, new_stock: (dbMat.stock_quantity||0) - qty,
                                   cost_per_unit: dbMat.cost_per_unit, total_cost: Number(matItem.cost)||0, reason: 'Uso em atendimento',
                                   date: payload.date, material_name: dbMat.name, patient_name: rawData.patient_name_ref
                               });
                           }
                       }
                       if (movementsPayload.length) await supabase.from('stock_movements').insert(movementsPayload);
                    }

                    const installmentsPayload = [];
                    if (custom_installments && custom_installments.length > 0) {
                        custom_installments.forEach(inst => {
                            installmentsPayload.push({
                                appointment_id: apptId, patient_name: rawData.patient_name_ref,
                                installment_number: inst.number, total_installments: inst.total, value: inst.value,
                                due_date: inst.date, is_received: false
                            });
                        });
                    } 
                    else if (rawData.payment_methods?.length > 0) {
                        rawData.payment_methods.forEach(pm => {
                            const totalVal = Number(pm.value)||0; 
                            const isCreditCard = CREDIT_METHODS.includes(pm.method);
                            const isScheduled = pm.method === 'Agendamento de Pagamento';
                            const numInstallments = Number(pm.installments)||1;
                            
                            // Caso 1: Agendamento de Pagamento (CRIA APENAS 1 PARCELA PENDENTE COM O VALOR TOTAL)
                            if (isScheduled) {
                                if (!pm.scheduled_date) {
                                    throw new Error(`Selecione a data de vencimento para o Agendamento de Pagamento de R$ ${totalVal.toFixed(2).replace('.', ',')}.`);
                                }
                                
                                installmentsPayload.push({
                                    appointment_id: apptId, patient_name: rawData.patient_name_ref,
                                    installment_number: 1, 
                                    total_installments: numInstallments, 
                                    value: totalVal, 
                                    due_date: pm.scheduled_date, 
                                    is_received: false
                                });
                            }
                            // Caso 2: Parcelamento Cartão (Contabilizado no Mês Seguinte)
                            else if (isCreditCard) {
                                const valPerInst = totalVal/numInstallments;
                                const appointmentDate = parseISO(payload.date);
                                const firstInstallmentDate = addMonths(appointmentDate, 1);
                                
                                for(let i=1; i<=numInstallments; i++) {
                                    const dueDate = addMonths(firstInstallmentDate, i - 1); 
                                    
                                    installmentsPayload.push({
                                        appointment_id: apptId, patient_name: rawData.patient_name_ref,
                                        installment_number: i, total_installments: numInstallments, value: valPerInst,
                                        due_date: format(dueDate, 'yyyy-MM-dd'),
                                        is_received: true, 
                                        received_date: format(dueDate, 'yyyy-MM-dd'),
                                    });
                                }
                            } 
                            // Pagamentos à vista (Dinheiro, Pix, Débito) NÃO criam parcelas aqui (evita duplicação)
                        });
                    }
                    if (installmentsPayload.length) {
                        const { error: instError } = await supabase.from('installments').insert(installmentsPayload);
                        if (instError) throw instError;
                    }
                } else if (id) {
                    // *** LIMPEZA SE O STATUS MUDAR PARA ALGO QUE NÃO É REALIZADO ***
                    await supabase.from('stock_movements').delete().eq('appointment_id', apptId);
                    await supabase.from('installments').delete().eq('appointment_id', apptId);
                }

                queryClient.invalidateQueries();
                
                setIsModalOpen(false);
                toast.success('Salvo!');
            } catch (error) {
                console.error(error);
                toast.error('Erro ao salvar: ' + error.message);
            }
        }} 
      />
      
      <PatientDetailsModal open={!!viewingPatientId} onClose={() => setViewingPatientId(null)} patientId={viewingPatientId} />

      {/* MODAL DE RECEBIMENTO */}
      <Dialog open={!!receivingItem} onOpenChange={() => setReceivingItem(null)}>
        <DialogContent className="max-w-sm">
            <DialogHeader>
                <DialogTitle>Confirmar Recebimento</DialogTitle>
                <DialogDescription>
                    Valor total a ser baixado: <strong>R$ {receivingItem?.value?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
                <div className="space-y-2">
                    <Label>Como foi pago?</Label>
                    <Select value={receiveMethod} onValueChange={setReceiveMethod}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>{RECEIVE_METHODS.map(m => (<SelectItem key={m} value={m}>{m}</SelectItem>))}</SelectContent>
                    </Select>
                </div>

                {DISCOUNT_ALLOWED_METHODS.includes(receiveMethod) && (
                    <div className="space-y-2 bg-stone-50 p-2 rounded">
                        <Label>Desconto nesta parcela (%)</Label>
                        <Input type="number" placeholder="0" value={receiveDiscount} onChange={(e) => setReceiveDiscount(Number(e.target.value))} />
                    </div>
                )}
                
                {INSTALLMENT_ALLOWED_METHODS.includes(receiveMethod) && (
                    <div className="space-y-2 bg-stone-50 p-2 rounded">
                        <Label>Dividir em quantas vezes?</Label>
                        <Select value={receiveInstallments.toString()} onValueChange={(v) => setReceiveInstallments(Number(v))}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>{[1,2,3,4,5,6,10,12].map(n => <SelectItem key={n} value={n.toString()}>{n}x</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                )}

                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded text-center">
                    <p className="text-xs text-emerald-600 font-bold uppercase">Valor da 1ª Parcela (Recebido Hoje)</p>
                    <p className="text-xl font-bold text-emerald-700">R$ {calculateFirstPaymentDisplay().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    {receiveInstallments > 1 && (
                        <p className="text-[10px] text-emerald-600 mt-1">
                            + {receiveInstallments - 1} parcelas futuras de R$ {(receivingItem?.value / receiveInstallments).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                    )}
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setReceivingItem(null)}>Cancelar</Button>
                <Button onClick={confirmReceive} className="bg-emerald-600 hover:bg-emerald-700 text-white">Confirmar Baixa</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}