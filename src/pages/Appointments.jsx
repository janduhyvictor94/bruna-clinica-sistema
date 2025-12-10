import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit2, Trash2, Clock, DollarSign, X, Calendar, Wallet, History as HistoryIcon, Send, ClipboardList, PlusCircle, User, Edit } from 'lucide-react';
import { format, addMonths, isSameDay } from 'date-fns';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const PAYMENT_METHODS = [
  'Pix PJ', 'Pix PF', 'Dinheiro', 'Débito PF', 'Débito PJ', 
  'Crédito PF', 'Crédito PJ', 'Permuta', 'Troca em Procedimento'
];

const formatDateDisplay = (dateString) => {
  if (!dateString) return '';
  return format(new Date(dateString + 'T12:00:00'), 'dd/MM/yyyy');
};

const formatShortDate = (dateString) => {
  if (!dateString) return '';
  return format(new Date(dateString + 'T12:00:00'), 'dd/MM');
};

export default function Appointments() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [deleteAppointment, setDeleteAppointment] = useState(null);
  
  // Histórico
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedPatientHistory, setSelectedPatientHistory] = useState(null);

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  useEffect(() => { if (urlParams.get('action') === 'new') setIsOpen(true); }, []);

  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*').order('date', { ascending: false }); return data || []; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data || []; } });
  const { data: procedures = [] } = useQuery({ queryKey: ['procedures'], queryFn: async () => { const { data } = await supabase.from('procedures').select('*'); return data || []; } });
  const { data: materials = [] } = useQuery({ queryKey: ['materials'], queryFn: async () => { const { data } = await supabase.from('materials').select('*'); return data || []; } });
  const { data: allInstallments = [] } = useQuery({ queryKey: ['installments'], queryFn: async () => { const { data } = await supabase.from('installments').select('*'); return data || []; } });

  // Agrupamento para mostrar apenas o último atendimento de cada paciente no mês selecionado
  const groupedAppointments = useMemo(() => {
    const groups = {};
    
    appointments.forEach(apt => {
        const aptDate = new Date(apt.date);
        if (aptDate.getMonth() === selectedMonth && aptDate.getFullYear() === selectedYear) {
            if (!groups[apt.patient_id]) {
                groups[apt.patient_id] = {
                    patient_id: apt.patient_id,
                    patient_name: apt.patient_name,
                    items: []
                };
            }
            groups[apt.patient_id].items.push(apt);
        }
    });
    
    // Ordena os itens internos por data, do mais recente para o mais antigo (dentro do mês)
    Object.keys(groups).forEach(key => {
        groups[key].items.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    // Retorna array ordenado por nome do paciente
    return Object.values(groups).sort((a, b) => a.patient_name.localeCompare(b.patient_name));
  }, [appointments, selectedMonth, selectedYear]);

  const preparePayload = (formData) => {
    if (!formData.patient_id) throw new Error("Selecione um paciente");
    const patient = patients.find(p => p.id === parseInt(formData.patient_id));
    
    const cleanTime = formData.time && formData.time.trim() !== '' ? formData.time : null;
    const cleanNextReturn = formData.next_return_date && formData.next_return_date.trim() !== '' ? formData.next_return_date : null;

    return {
        patient_id: parseInt(formData.patient_id),
        patient_name: patient?.full_name || '',
        patient_gender: patient?.gender,
        patient_origin: patient?.origin,
        date: formData.date,
        time: cleanTime,
        next_return_date: cleanNextReturn,
        status: formData.status || 'Agendado',
        notes: Array.isArray(formData.notes) ? formData.notes : [],
        scheduled_returns: Array.isArray(formData.scheduled_returns) ? formData.scheduled_returns : [],
        procedures_performed: Array.isArray(formData.procedures_performed) ? formData.procedures_performed : [],
        materials_used: Array.isArray(formData.materials_used) ? formData.materials_used : [],
        total_value: parseFloat(formData.total_value) || 0,
        total_material_cost: parseFloat(formData.total_material_cost) || 0,
        discount_percent: parseFloat(formData.discount_percent) || 0,
        discount_value: parseFloat(formData.discount_value) || 0,
        final_value: parseFloat(formData.final_value) || 0,
        is_new_patient: formData.is_new_patient || false,
        payment_method: formData.payments?.length > 1 ? 'Misto' : (formData.payments?.[0]?.method || null),
        installments: 1, 
        installment_value: 0
    };
  };

  const generateInstallments = async (formData, appointmentId, patientName, date) => {
      await supabase.from('installments').delete().eq('appointment_id', appointmentId);
      if (formData.payments && formData.payments.length > 0) {
        const installmentsArray = [];
        formData.payments.forEach(pay => {
            if (pay.method.includes('Crédito') && pay.installments > 1) {
                const valuePerInst = pay.value / pay.installments;
                for (let i = 1; i <= pay.installments; i++) {
                    const baseDate = new Date(date + 'T12:00:00');
                    const dueDate = addMonths(baseDate, i - 1);
                    installmentsArray.push({
                        appointment_id: appointmentId,
                        patient_name: patientName,
                        installment_number: i,
                        total_installments: pay.installments,
                        value: valuePerInst,
                        due_date: format(dueDate, 'yyyy-MM-dd'),
                        paid: true, is_received: true, received_date: format(new Date(), 'yyyy-MM-dd'), 
                        payment_method: pay.method,
                        description: `Parcela ${i}/${pay.installments} (${pay.method}) - ${patientName}`
                    });
                }
            } else {
                installmentsArray.push({
                    appointment_id: appointmentId,
                    patient_name: patientName,
                    installment_number: 1,
                    total_installments: 1,
                    value: pay.value,
                    due_date: format(new Date(date + 'T12:00:00'), 'yyyy-MM-dd'),
                    paid: pay.paid_now, is_received: pay.paid_now, received_date: pay.paid_now ? format(new Date(), 'yyyy-MM-dd') : null,
                    payment_method: pay.method,
                    description: `Pagamento (${pay.method}) - ${patientName}`
                });
            }
        });
        if (installmentsArray.length > 0) await supabase.from('installments').insert(installmentsArray);
      }
  };

  // --- SINCRONIZAÇÃO DE RETORNO DO PACIENTE (ATUALIZA A FICHA DO PACIENTE) ---
  const syncPatientReturns = async (patientId, nextReturn, scheduledReturns) => {
      const updates = {
          next_return_date: nextReturn, 
          scheduled_returns: scheduledReturns
      };
      
      await supabase.from('patients').update(updates).eq('id', patientId);
      
      queryClient.invalidateQueries({ queryKey: ['patients'] });
  };

  const createMutation = useMutation({
    mutationFn: async (formData) => {
      const payload = preparePayload(formData);
      const { data: appointment, error } = await supabase.from('appointments').insert([payload]).select().single();
      if (error) throw error;

      if (payload.materials_used?.length > 0) {
        for (const mat of payload.materials_used) {
          const { data: materialData } = await supabase.from('materials').select('stock_quantity, cost_per_unit').eq('id', mat.material_id).single();
          if (materialData) {
            const newStock = (materialData.stock_quantity || 0) - mat.quantity;
            await supabase.from('stock_movements').insert([{
              material_id: mat.material_id, material_name: mat.material_name, type: 'saida', quantity: mat.quantity,
              previous_stock: materialData.stock_quantity, new_stock: newStock, cost_per_unit: mat.cost, total_cost: mat.cost * mat.quantity,
              reason: `Atendimento ${payload.patient_name}`, date: new Date()
            }]);
            await supabase.from('materials').update({ stock_quantity: newStock }).eq('id', mat.material_id);
          }
        }
      }
      await generateInstallments(formData, appointment.id, payload.patient_name, payload.date);
      
      // SINCRONIZAÇÃO: Força a data de retorno principal se for um retorno novo
      if (!payload.is_new_patient && payload.date) {
         await supabase.from('patients').update({ next_return_date: payload.date }).eq('id', payload.patient_id);
      }
      
      await syncPatientReturns(payload.patient_id, payload.next_return_date, payload.scheduled_returns);
      return appointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] }); 
      setIsOpen(false);
      setEditingAppointment(null);
      toast.success('Atendimento salvo!');
    },
    onError: (err) => toast.error('Erro: ' + err.message)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => { 
        const payload = preparePayload(data); 
        const { error } = await supabase.from('appointments').update(payload).eq('id', id); 
        if (error) throw error; 
        await generateInstallments(data, id, payload.patient_name, payload.date);
        
        // --- SINCRONIZAÇÃO EM EDIÇÃO DE DATA (CORREÇÃO DA VINCULAÇÃO) ---
        const patientToUpdate = patients.find(p => p.id === payload.patient_id);
        
        if (patientToUpdate) {
            let newNextReturnDate = patientToUpdate.next_return_date;
            let newScheduledReturns = payload.scheduled_returns;

            // 1. Sincroniza Retorno Principal do Paciente
            // Regra A: Se o Agendamento editado é do tipo "Retorno" (is_new_patient: false),
            // a data desse agendamento DEVE ser a nova data principal na ficha.
            if (!payload.is_new_patient && data.date) {
                 newNextReturnDate = data.date;
            } else if (payload.next_return_date) {
                 // Regra B: Se o usuário preencheu o campo "Próximo Retorno" no modal, use-o.
                 newNextReturnDate = payload.next_return_date;
            } else if (patientToUpdate.next_return_date === editingAppointment?.date && !data.date && !payload.next_return_date) {
                 // Regra C: Se a data do agendamento antigo era a data de retorno e foi limpa no modal, limpa na ficha.
                 newNextReturnDate = null;
            }
            
            // 2. Sincroniza a lista de Retornos Adicionais
            newScheduledReturns = payload.scheduled_returns;

            await syncPatientReturns(payload.patient_id, newNextReturnDate, newScheduledReturns);
        }
    },
    onSuccess: () => { 
        queryClient.invalidateQueries({ queryKey: ['appointments'] }); 
        queryClient.invalidateQueries({ queryKey: ['installments'] });
        queryClient.invalidateQueries({ queryKey: ['patients'] }); 
        setIsOpen(false);
        setEditingAppointment(null);
        toast.success('Atualizado!'); 
    },
    onError: (err) => toast.error('Erro ao atualizar: ' + err.message)
  });

  const quickStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
        await supabase.from('appointments').update({ status }).eq('id', id);
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['patients'] });
        toast.success('Status atualizado!');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('appointments').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments'] }); setDeleteAppointment(null); toast.success('Excluído'); }
  });

  const handleOpenNewReturn = (patientId, dateStr) => {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;
    setEditingAppointment({
        patient_id: patient.id, patient_name: patient.full_name, date: dateStr, status: 'Agendado',
        is_new_patient: false, notes: [], procedures_performed: [], materials_used: [], payments: []
    });
    setIsOpen(true);
  };

  const handleNewForPatient = (patientId, patientName) => {
    setEditingAppointment({
        patient_id: patientId, 
        patient_name: patientName, 
        date: format(new Date(), 'yyyy-MM-dd'),
        status: 'Agendado',
        is_new_patient: false, 
        notes: [], procedures_performed: [], materials_used: [], payments: []
    });
    setIsOpen(true);
  };

  const handleOpenHistory = (patientId, patientName) => {
    const history = appointments.filter(a => a.patient_id === patientId);
    setSelectedPatientHistory({ name: patientName, history });
    setHistoryOpen(true);
  };

  const editFromHistory = (apt) => {
      setHistoryOpen(false);
      setEditingAppointment(apt);
      setIsOpen(true);
  };

  const deleteFromHistory = (apt) => {
      setHistoryOpen(false);
      setDeleteAppointment(apt);
  };

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);
  
  const getStatusColor = (status) => {
      switch(status) {
          case 'Realizado': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
          case 'Confirmado': return 'bg-blue-100 text-blue-800 border-blue-200';
          case 'Cancelado': return 'bg-rose-100 text-rose-800 border-rose-200';
          default: return 'bg-stone-100 text-stone-800 border-stone-200';
      }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Atendimentos" subtitle="Registro de consultas" action={<Button onClick={() => { setEditingAppointment(null); setIsOpen(true); }} className="bg-stone-800 hover:bg-stone-900"><Plus className="w-4 h-4 mr-2"/> Novo Atendimento</Button>} />
      <div className="flex flex-wrap gap-3"><Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}><SelectTrigger className="w-36 bg-white"><SelectValue/></SelectTrigger><SelectContent>{months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}</SelectContent></Select><Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}><SelectTrigger className="w-24 bg-white"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select></div>
      
      <div className="space-y-4">
        {groupedAppointments.length > 0 ? groupedAppointments.map(group => {
        return (
        <Card key={group.patient_id} className="bg-white border-stone-200 shadow-sm hover:shadow-md transition-shadow group-card">
            <CardContent className="p-0">
                
                {/* CABEÇALHO DO CARD (NOME DO PACIENTE) */}
                <div className="flex justify-between items-center p-4 border-b border-stone-100 bg-stone-50/30">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 font-bold text-sm">
                            {group.patient_name ? group.patient_name.charAt(0) : <User size={14}/>}
                        </div>
                        <h3 
                            onClick={() => handleOpenHistory(group.patient_id, group.patient_name)}
                            className="font-bold text-base text-stone-800 cursor-pointer hover:text-stone-600 transition-colors"
                        >
                            {group.patient_name}
                        </h3>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleNewForPatient(group.patient_id, group.patient_name)} className="h-7 text-xs border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                            <PlusCircle className="w-3 h-3 mr-1"/> Adicionar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenHistory(group.patient_id, group.patient_name)} title="Ver Histórico Completo">
                            <ClipboardList className="w-4 h-4 text-stone-400"/>
                        </Button>
                    </div>
                </div>

                {/* LISTA DE ATENDIMENTOS DO MÊS */}
                <div className="divide-y divide-stone-100">
                    {group.items.map(apt => {
                        // REMOVIDO showReturns: Mostra retornos se houver datas
                        return (
                            <div key={apt.id} className="p-4 hover:bg-stone-50/50 transition-colors">
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                    
                                    {/* COLUNA 1: INFO PRINCIPAL */}
                                    <div className="flex-1 space-y-2">
                                        <div className="flex flex-wrap items-center gap-3">
                                            {/* DATA */}
                                            <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-700 bg-white px-2 py-1 rounded border border-stone-200 shadow-sm">
                                                <Clock className="w-3.5 h-3.5 text-stone-400"/> {formatDateDisplay(apt.date)} {apt.time && `- ${apt.time}`}
                                            </span>

                                            {/* TIPO (NOVO/RETORNO) */}
                                            {apt.is_new_patient ? 
                                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 text-[10px]">Novo Atendimento</Badge> : 
                                                <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200 text-[10px]">Retorno</Badge>
                                            }

                                            {/* SELETOR DE STATUS (INDIVIDUAL) */}
                                            <div className="w-[130px]">
                                                <Select 
                                                    defaultValue={apt.status} 
                                                    onValueChange={(val) => quickStatusMutation.mutate({ id: apt.id, status: val })}
                                                >
                                                    <SelectTrigger className={`h-7 text-[10px] font-medium border-0 px-2 rounded-full ${getStatusColor(apt.status)}`}>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Agendado">Agendado</SelectItem>
                                                        <SelectItem value="Confirmado">Confirmado</SelectItem>
                                                        <SelectItem value="Realizado">Realizado</SelectItem>
                                                        <SelectItem value="Cancelado">Cancelado</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* DETALHES (Procedimentos e Valor) */}
                                        <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500 pl-1">
                                            {apt.procedures_performed?.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {apt.procedures_performed.map((p,i) => (
                                                        <span key={i} className="bg-stone-100 px-1.5 py-0.5 rounded text-stone-600">{p.procedure_name}</span>
                                                    ))}
                                                </div>
                                            ) : <span className="italic text-stone-400">Sem procedimentos</span>}
                                            
                                            <span className="font-medium text-stone-600 ml-auto lg:ml-0 border-l border-stone-200 pl-3">
                                                R$ {(apt.final_value || 0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                                            </span>
                                        </div>

                                        {/* RETORNOS RÁPIDOS */}
                                        {(apt.next_return_date || (apt.scheduled_returns && apt.scheduled_returns.length > 0)) && (
                                            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-stone-100 border-dashed">
                                                {apt.next_return_date && (
                                                    <Badge 
                                                        variant="outline" 
                                                        className="text-amber-600 border-amber-200 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors flex items-center gap-1 text-[10px]"
                                                        onClick={() => handleOpenNewReturn(apt.patient_id, apt.next_return_date)}
                                                        title="Criar Atendimento deste Retorno"
                                                    >
                                                        <Calendar className="w-3 h-3"/> {formatShortDate(apt.next_return_date)}
                                                    </Badge>
                                                )}
                                                {Array.isArray(apt.scheduled_returns) && apt.scheduled_returns.map((r, i) => (
                                                    <Badge 
                                                        key={i} 
                                                        variant="outline" 
                                                        className="text-blue-600 border-blue-200 bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors flex items-center gap-1 text-[10px]"
                                                        onClick={() => handleOpenNewReturn(apt.patient_id, r.date)}
                                                        title="Criar Atendimento deste Retorno"
                                                    >
                                                        <Calendar className="w-3 h-3"/> {formatShortDate(r.date)}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* COLUNA 2: AÇÕES */}
                                    <div className="flex items-center gap-1 lg:flex-col lg:gap-2 border-t lg:border-t-0 lg:border-l border-stone-100 pt-2 lg:pt-0 lg:pl-3 justify-end">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => setEditingAppointment(apt)} title="Editar">
                                            <Edit2 className="w-3.5 h-3.5"/>
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-300 hover:text-red-500 hover:bg-red-50" onClick={() => setDeleteAppointment(apt)} title="Excluir">
                                            <Trash2 className="w-3.5 h-3.5"/>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>)}) : (
            <div className="flex flex-col items-center justify-center py-12 text-stone-400 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                <Calendar className="w-10 h-10 mb-2 opacity-20"/>
                <p>Nenhum atendimento neste mês.</p>
            </div>
        )}
      </div>
      
      {/* MODAL PRINCIPAL DE EDIÇÃO */}
      <AppointmentModal 
        open={isOpen || !!editingAppointment} 
        onClose={() => { setIsOpen(false); setEditingAppointment(null); }} 
        appointment={editingAppointment} 
        patients={patients} 
        procedures={procedures} 
        materials={materials} 
        allAppointments={appointments} 
        allInstallments={allInstallments}
        onSave={(data) => { 
            if(editingAppointment?.id) updateMutation.mutate({ id: editingAppointment.id, data }); 
            else createMutation.mutate(data); 
        }} 
        isLoading={createMutation.isPending || updateMutation.isPending} 
      />
      
      {/* MODAL DE HISTÓRICO COM EDIÇÃO E EXCLUSÃO */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-stone-50">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">Histórico: {selectedPatientHistory?.name}</DialogTitle>
                <DialogDescription>Todos os atendimentos realizados.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-4">
                {selectedPatientHistory?.history && selectedPatientHistory.history.length > 0 ? (
                    selectedPatientHistory.history.sort((a,b) => new Date(b.date) - new Date(a.date)).map(hist => (
                        <Card key={hist.id} className="border-stone-200 bg-white hover:bg-stone-50/50 transition-colors">
                            <CardContent className="p-3">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="font-bold text-sm text-stone-800">{formatDateDisplay(hist.date)}</span>
                                            
                                            <Badge variant="outline" className={`text-[10px] ${getStatusColor(hist.status)}`}>{hist.status}</Badge>
                                            
                                            {hist.is_new_patient ? 
                                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px]">Novo</Badge> : 
                                                <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[10px]">Retorno</Badge>
                                            }
                                        </div>
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {Array.isArray(hist.procedures_performed) && hist.procedures_performed.map((p,idx) => (
                                                <Badge key={idx} className="bg-stone-100 text-stone-600 hover:bg-stone-200 text-[10px] border-stone-200">{p.procedure_name}</Badge>
                                            ))}
                                        </div>
                                        <div className="text-xs font-bold text-stone-500">
                                            Total: R$ {(hist.final_value || 0).toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1 ml-2">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-400 hover:bg-blue-100" onClick={() => editFromHistory(hist)} title="Editar"><Edit2 className="w-3.5 h-3.5"/></Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-300 hover:text-red-500 hover:bg-red-50" onClick={() => deleteFromHistory(hist)} title="Excluir"><Trash2 className="w-3.5 h-3.5"/></Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : ( <p className="text-center text-stone-500">Nenhum histórico.</p> )}
            </div>
            <DialogFooter><Button onClick={() => setHistoryOpen(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteAppointment} onOpenChange={() => setDeleteAppointment(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogDescription>Irreversível.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(deleteAppointment.id)} className="bg-red-600">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

// Modal de Formulário
export function AppointmentModal({ open, onClose, appointment, patients, procedures, materials, allAppointments, allInstallments, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    patient_id: '', patient_name: '', patient_protocol: '', date: format(new Date(), 'yyyy-MM-dd'), time: '', status: 'Agendado',
    notes: [], next_return_date: '', scheduled_returns: [], 
    is_new_patient: false, 
    procedures_performed: [], materials_used: [],
    total_value: 0, total_material_cost: 0, payment_method: '', discount_percent: 0, discount_value: 0, final_value: 0, installments: 1, installment_value: 0,
    payments: [] 
  });
  
  const [currentPayment, setCurrentPayment] = useState({ method: 'Pix PF', value: '', installments: 1, paid_now: true });
  const [newReturn, setNewReturn] = useState({ date: '', description: '', alert_days: 15 });
  const [newNote, setNewNote] = useState({ date: format(new Date(), 'yyyy-MM-dd'), text: '' });
  
  // Estado para editar retornos adicionais
  const [editingReturnIndex, setEditingReturnIndex] = useState(null);
  const [editingReturnData, setEditingReturnData] = useState({ date: '', description: '' });


  // Histórico lateral no modal
  const patientHistory = formData.patient_id 
    ? allAppointments
        .filter(a => a.patient_id === parseInt(formData.patient_id) && a.status !== 'Cancelado' && a.id !== appointment?.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 3) 
    : [];

  useEffect(() => { 
      if (appointment) {
          const patient = patients.find(p => p.id === appointment.patient_id);
          let initialNotes = [];
          if (appointment.notes) {
              if (Array.isArray(appointment.notes)) initialNotes = appointment.notes;
              else if (typeof appointment.notes === 'string') {
                  try { const parsed = JSON.parse(appointment.notes); initialNotes = Array.isArray(parsed) ? parsed : [{ date: appointment.date, text: appointment.notes }]; } catch (e) { initialNotes = [{ date: appointment.date, text: appointment.notes }]; }
              }
          }

          let reconstructedPayments = [];
          if (allInstallments && allInstallments.length > 0) {
              const aptInstallments = allInstallments.filter(i => i.appointment_id === appointment.id);
              const groups = {};
              aptInstallments.forEach(inst => {
                  if (!groups[inst.payment_method]) {
                      groups[inst.payment_method] = { method: inst.payment_method, value: 0, installments: 0, paid_now: inst.paid };
                  }
                  groups[inst.payment_method].value += inst.value;
                  groups[inst.payment_method].installments = Math.max(groups[inst.payment_method].installments, inst.total_installments || 1);
              });
              reconstructedPayments = Object.values(groups);
          }

          setFormData({ 
              ...appointment, 
              patient_id: appointment.patient_id?.toString() || '', 
              patient_protocol: patient?.protocol || '', 
              time: appointment.time || '', 
              notes: initialNotes, 
              next_return_date: appointment.next_return_date || '', 
              payment_method: appointment.payment_method || '',
              procedures_performed: appointment.procedures_performed || [],
              materials_used: appointment.materials_used || [],
              scheduled_returns: appointment.scheduled_returns || [],
              total_value: appointment.total_value || 0,
              total_material_cost: appointment.total_material_cost || 0,
              discount_percent: appointment.discount_percent || 0,
              discount_value: appointment.discount_value || 0,
              final_value: appointment.final_value || 0,
              installments: appointment.installments || 1,
              installment_value: appointment.installment_value || 0,
              payments: reconstructedPayments 
          }); 
      } else {
          setFormData({ 
              patient_id: '', patient_name: '', patient_protocol: '', date: format(new Date(), 'yyyy-MM-dd'), time: '', status: 'Agendado', 
              notes: [], next_return_date: '', scheduled_returns: [], is_new_patient: false, procedures_performed: [], materials_used: [], 
              total_value: 0, total_material_cost: 0, discount_percent: 0, discount_value: 0, final_value: 0,
              payments: [] 
          }); 
      }
      setNewNote({ date: format(new Date(), 'yyyy-MM-dd'), text: '' });
      setEditingReturnIndex(null);
  }, [appointment, open, patients, allInstallments]);

  const handlePatientChange = (pid) => { 
    const p = patients.find(pat => pat.id === pid); 
    const hasApps = allAppointments.some(a => a.patient_id === pid); 
    setFormData(prev => ({ ...prev, patient_id: pid, patient_name: p?.full_name, patient_protocol: p?.protocol || '', is_new_patient: !hasApps })); 
  };
  
  const recalc = (procs, mats, discount, installs) => { 
      const totalV = procs.reduce((sum, p) => sum + (p.price || 0), 0); 
      const totalC = mats.reduce((sum, m) => sum + (m.cost * m.quantity), 0); 
      const discV = (totalV * (discount / 100)); 
      const finalV = totalV - discV; 
      setFormData(prev => ({ ...prev, procedures_performed: procs, materials_used: mats, total_value: totalV, total_material_cost: totalC, discount_percent: discount, discount_value: discV, final_value: finalV })); 
  };

  const toggleProc = (proc) => { let newProcs = formData.procedures_performed?.find(p => p.procedure_id === proc.id) ? formData.procedures_performed.filter(p => p.procedure_id !== proc.id) : [...(formData.procedures_performed||[]), { procedure_id: proc.id, procedure_name: proc.name, price: proc.has_variable_price ? 0 : (proc.default_price || 0), has_variable_price: proc.has_variable_price }]; recalc(newProcs, formData.materials_used||[], formData.discount_percent); };
  const addMat = (mat) => { if(formData.materials_used?.find(m => m.material_id === mat.id)) return; const newMats = [...(formData.materials_used||[]), { material_id: mat.id, material_name: mat.name, quantity: 1, cost: mat.cost_per_unit || 0 }]; recalc(formData.procedures_performed||[], newMats, formData.discount_percent); };
  const updateMat = (id, qtd) => { const newMats = formData.materials_used?.map(m => m.material_id === id ? { ...m, quantity: parseFloat(qtd)||0 } : m); recalc(formData.procedures_performed||[], newMats, formData.discount_percent); };
  const updateProcPrice = (id, price) => { const newProcs = formData.procedures_performed?.map(p => p.procedure_id === id ? { ...p, price: parseFloat(price)||0 } : p); recalc(newProcs, formData.materials_used||[], formData.discount_percent); };
  
  const addRet = () => { 
      if(newReturn.date) { 
          // Adiciona o novo retorno à lista
          setFormData(prev => ({...prev, scheduled_returns: [...(prev.scheduled_returns || []), newReturn]})); 
          setNewReturn({date:'',description:'', alert_days: 15}); 
          toast.success("Retorno Adicional adicionado. Salve para atualizar a agenda.");
      }
  };
  
  const handleStartEditReturn = (index) => {
      setEditingReturnIndex(index);
      setEditingReturnData(formData.scheduled_returns[index]);
  };
  
  const handleSaveEditReturn = () => {
      if (editingReturnIndex !== null) {
          const newReturns = [...formData.scheduled_returns];
          newReturns[editingReturnIndex] = editingReturnData;
          setFormData(prev => ({...prev, scheduled_returns: newReturns}));
          setEditingReturnIndex(null);
          toast.success("Retorno Adicional alterado. Salve para atualizar a agenda.");
      }
  };
  
  const handleCancelEditReturn = () => {
      setEditingReturnIndex(null);
      setEditingReturnData({ date: '', description: '' });
  };
  
  const removeRet = (index) => { 
      setFormData(prev => ({ ...prev, scheduled_returns: prev.scheduled_returns.filter((_, i) => i !== index) })); 
      toast.info("Retorno Adicional removido. Salve para aplicar.");
  };
  
  const addNote = () => { if (!newNote.text.trim()) return; setFormData(prev => ({ ...prev, notes: [...(prev.notes || []), newNote] })); setNewNote({ date: format(new Date(), 'yyyy-MM-dd'), text: '' }); };
  const removeNote = (index) => { setFormData(prev => ({ ...prev, notes: prev.notes.filter((_, i) => i !== index) })); };

  const addPayment = () => {
      const val = parseFloat(currentPayment.value);
      if (!val || val <= 0) return toast.error("Valor inválido");
      setFormData(prev => ({ ...prev, payments: [...prev.payments, { ...currentPayment, value: val }] }));
      setCurrentPayment({ method: 'Pix PF', value: '', installments: 1, paid_now: true });
  };
  const removePayment = (index) => { setFormData(prev => ({ ...prev, payments: prev.payments.filter((_, i) => i !== index) })); };
  const totalPaid = formData.payments.reduce((sum, p) => sum + p.value, 0);
  const remaining = (formData.final_value || 0) - totalPaid;
  const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };

  return (
    <Dialog open={open} onOpenChange={onClose}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{appointment ? 'Editar' : 'Novo'} Atendimento</DialogTitle><DialogDescription className="hidden">Formulário</DialogDescription></DialogHeader>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6" id="appointment-form">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2"><Label>Paciente *</Label><Select value={formData.patient_id?.toString() || ''} onValueChange={v => handlePatientChange(parseInt(v))}><SelectTrigger><SelectValue placeholder="Selecione..."/></SelectTrigger><SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.full_name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="col-span-2"><Label>Protocolo</Label><Textarea value={formData.patient_protocol || 'Sem protocolo definido.'} readOnly className="bg-stone-50 text-stone-600 focus:ring-0" rows={2}/></div>
                    <div className="col-span-2 grid grid-cols-2 gap-4">
                        <div><Label>Data</Label><Input type="date" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} required/></div>
                        <div><Label>Tipo</Label><Select value={formData.is_new_patient?.toString()} onValueChange={v => setFormData({...formData, is_new_patient: v === 'true'})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">Novo Atendimento</SelectItem><SelectItem value="false">Retorno</SelectItem></SelectContent></Select></div>
                    </div>
                    <div><Label>Hora</Label><Input type="time" value={formData.time || ''} onChange={e => setFormData({...formData, time: e.target.value})}/></div>
                    <div><Label>Status</Label><Select value={formData.status || 'Agendado'} onValueChange={v => setFormData({...formData, status: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Agendado">Agendado</SelectItem><SelectItem value="Confirmado">Confirmado</SelectItem><SelectItem value="Realizado">Realizado</SelectItem><SelectItem value="Cancelado">Cancelado</SelectItem></SelectContent></Select></div>
                    
                    {/* PRÓXIMO RETORNO (PRINCIPAL) */}
                    <div><Label>Próximo Retorno (Principal)</Label><div className="flex gap-2"><Input type="date" value={formData.next_return_date || ''} onChange={e => setFormData({...formData, next_return_date: e.target.value})}/><Button type="button" variant="outline" size="icon" onClick={() => setFormData({...formData, next_return_date: ''})}><X className="w-4 h-4 text-stone-500"/></Button></div></div>
                </div>

                {/* RETORNOS ADICIONAIS - OPÇÃO DE EDIÇÃO/EXCLUSÃO */}
                <div className="p-4 bg-stone-50 rounded">
                    <Label className='block mb-2'>Retornos Adicionais</Label>
                    
                    {/* Formulário de Adição */}
                    <div className="flex gap-2">
                        <Input type="date" value={newReturn.date} onChange={e => setNewReturn({...newReturn, date: e.target.value})} className="flex-1"/>
                        <Input placeholder="Desc" value={newReturn.description} onChange={e => setNewReturn({...newReturn, description: e.target.value})} className="flex-1"/>
                        <Button type="button" onClick={addRet} variant="outline"><Plus className="w-4 h-4"/></Button>
                    </div>
                    
                    {/* Lista de Retornos Adicionais */}
                    {formData.scheduled_returns?.map((ret, i) => (
                        <div key={i} className="bg-white p-2 mt-2 border rounded items-center">
                            {editingReturnIndex === i ? (
                                // Modo Edição
                                <div className='flex gap-2 items-center'>
                                    <Input 
                                        type="date" 
                                        value={editingReturnData.date} 
                                        onChange={e => setEditingReturnData({...editingReturnData, date: e.target.value})} 
                                        className='flex-1 text-xs h-8'
                                    />
                                    <Input 
                                        placeholder="Descrição" 
                                        value={editingReturnData.description} 
                                        onChange={e => setEditingReturnData({...editingReturnData, description: e.target.value})} 
                                        className='flex-1 text-xs h-8'
                                    />
                                    <Button type='button' size='sm' onClick={handleSaveEditReturn} className='h-8 bg-green-600 hover:bg-green-700'>Salvar</Button>
                                    <Button type='button' variant='ghost' size='sm' onClick={handleCancelEditReturn} className='h-8'><X className='w-4 h-4'/></Button>
                                </div>
                            ) : (
                                // Modo Visualização
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar className="w-4 h-4 text-stone-400"/> {formatDateDisplay(ret.date)} - {ret.description}
                                    </div>
                                    <div className='flex gap-1'>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => handleStartEditReturn(i)} title='Editar Retorno' className='text-blue-500 hover:text-blue-700'>
                                            <Edit className='w-3.5 h-3.5'/>
                                        </Button>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => removeRet(i)} title='Remover Retorno' className='text-red-500 hover:text-red-700'>
                                            <Trash2 className="w-3.5 h-3.5"/>
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                
                <div><Label className="mb-2 block">Procedimentos</Label><div className="grid grid-cols-2 gap-2">{procedures.map(proc => <div key={proc.id} onClick={() => toggleProc(proc)} className={`p-3 rounded border cursor-pointer ${formData.procedures_performed?.find(p => p.procedure_id === proc.id) ? 'bg-stone-800 text-white' : 'hover:bg-stone-100'}`}><p className="text-sm">{proc.name}</p></div>)}</div>{formData.procedures_performed?.map(p => p.has_variable_price && <div key={p.procedure_id} className="mt-2 flex items-center gap-2"><Label>{p.procedure_name} (Valor):</Label><Input type="number" value={p.price} onChange={e => updateProcPrice(p.procedure_id, e.target.value)} className="w-32"/></div>)}</div>
                <div><Label className="mb-2 block">Materiais</Label><Select onValueChange={v => addMat(materials.find(m => m.id === parseInt(v)))}><SelectTrigger><SelectValue placeholder="Adicionar..."/></SelectTrigger><SelectContent>{materials.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}</SelectContent></Select>{formData.materials_used?.map(mat => <div key={mat.material_id} className="flex gap-2 mt-2 items-center"><span className="flex-1">{mat.material_name}</span><Input type="number" value={mat.quantity} onChange={e => updateMat(mat.material_id, e.target.value)} className="w-20"/><span className="w-24 text-right">R$ {(mat.cost * mat.quantity).toFixed(2)}</span></div>)}</div>
                
                <div className="bg-stone-50 p-4 rounded-xl space-y-4">
                    <Label className="flex items-center gap-2"><Wallet className="w-4 h-4"/> Pagamentos</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                        <div className="col-span-1 sm:col-span-1"><Label className="text-xs">Método</Label><Select value={currentPayment.method} onValueChange={v => setCurrentPayment(prev => ({...prev, method: v, installments: 1}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{PAYMENT_METHODS.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                        {currentPayment.method.includes('Crédito') && (<div className="col-span-1"><Label className="text-xs">Parcelas</Label><Select value={currentPayment.installments.toString()} onValueChange={v => setCurrentPayment(prev => ({...prev, installments: parseInt(v)}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[1,2,3,4,5,6,7,8,9,10,11,12].map(n=><SelectItem key={n} value={n.toString()}>{n}x</SelectItem>)}</SelectContent></Select></div>)}
                        <div className="col-span-1"><Label className="text-xs">Valor</Label><Input type="number" step="0.01" value={currentPayment.value} onChange={e => setCurrentPayment(prev => ({...prev, value: e.target.value}))} /></div>
                        <div className="col-span-1"><Button type="button" onClick={addPayment} className="w-full bg-stone-800"><Plus className="w-4 h-4"/></Button></div>
                    </div>
                    {!currentPayment.method.includes('Crédito') && (<div className="flex items-center gap-2"><input type="checkbox" id="paid_now" checked={currentPayment.paid_now} onChange={e => setCurrentPayment(prev => ({...prev, paid_now: e.target.checked}))} className="rounded border-stone-300" /><Label htmlFor="paid_now" className="text-xs cursor-pointer">Recebido agora?</Label></div>)}
                    <div className="space-y-2">{formData.payments.map((p, i) => (<div key={i} className="flex justify-between items-center bg-white p-2 rounded border border-stone-200 text-sm"><div><span className="font-medium">{p.method}</span>{p.installments > 1 && <span className="text-xs text-stone-500 ml-1">({p.installments}x)</span>}{p.paid_now && <Badge variant="secondary" className="ml-2 text-[10px] bg-green-100 text-green-700">Pago</Badge>}</div><div className="flex items-center gap-2"><span>R$ {p.value.toFixed(2)}</span><Button type="button" variant="ghost" size="icon" onClick={() => removePayment(i)}><X className="w-3 h-3"/></Button></div></div>))}</div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-200 text-sm"><div><p className="text-xs text-stone-500">Total Serviço</p><p className="font-bold">R$ {(formData.final_value || 0).toFixed(2)}</p></div><div><p className="text-xs text-stone-500">Pago/Lançado</p><p className="text-blue-600 font-bold">R$ {totalPaid.toFixed(2)}</p></div><div><p className="text-xs text-stone-500">Restante</p><p className={`font-bold ${remaining > 0 ? 'text-red-500' : 'text-green-500'}`}>R$ {remaining.toFixed(2)}</p></div></div>
                </div>
                
                <div className="space-y-4 pt-2 border-t border-stone-100">
                    <Label className="text-sm font-semibold text-stone-700">Notas</Label>
                    <div className="flex gap-2 items-center bg-stone-50 p-2 rounded-lg border border-stone-100"><Input type="date" value={newNote.date} onChange={e => setNewNote({...newNote, date: e.target.value})} className="w-36 bg-white" /><Input placeholder="Descreva..." value={newNote.text} onChange={e => setNewNote({...newNote, text: e.target.value})} className="flex-1 bg-white" onKeyDown={(e) => {if(e.key === 'Enter') {e.preventDefault(); addNote()}}} /><Button type="button" onClick={addNote} className="bg-stone-800 w-10 px-0 shrink-0"><Send className="w-4 h-4"/></Button></div>
                    <div className="space-y-2 max-h-48 overflow-auto">{formData.notes.map((note, index) => (<div key={index} className="flex items-center gap-3 p-2 bg-white border border-stone-100 rounded-md"><Badge variant="outline" className="bg-stone-50 text-stone-600">{formatDateDisplay(note.date)}</Badge><p className="text-sm text-stone-700 flex-1 truncate">{note.text}</p><Button type="button" variant="ghost" size="icon" onClick={() => removeNote(index)}><Trash2 className="w-3.5 h-3.5"/></Button></div>))}</div>
                </div>
            </form>
        </div>
        <div className="space-y-4 border-l pl-6 border-stone-100"><h4 className="text-sm font-semibold flex items-center gap-2"><HistoryIcon className="w-4 h-4"/> Histórico Recente</h4>{patientHistory.length > 0 ? (<div className="space-y-4">{patientHistory.map(apt => { let notesList = []; if (Array.isArray(apt.notes)) notesList = apt.notes; else if (typeof apt.notes === 'string') { try { const parsed = JSON.parse(apt.notes); notesList = Array.isArray(parsed) ? parsed : [{ date: apt.date, text: apt.notes }]; } catch { notesList = [{ date: apt.date, text: apt.notes }]; } } return (<div key={apt.id} className="relative pb-4 border-b border-stone-50 last:border-0"><div className="text-xs font-bold text-stone-700 mb-1">{formatDateDisplay(apt.date)}</div><div className="flex gap-1 mb-2">{apt.procedures_performed?.map((p, i) => (<Badge key={i} variant="secondary" className="text-[10px] h-5 px-1">{p.procedure_name}</Badge>))}</div>{notesList.length > 0 ? (<div key={apt.id} className="space-y-1">{notesList.map((n, idx) => (<div key={idx} className="bg-stone-50 p-2 rounded border border-stone-100"><p className="text-[10px] text-stone-400 mb-0.5">{n.date ? formatDateDisplay(n.date) : ''}</p><p className="text-xs text-stone-600">{n.text}</p></div>))}</div>) : <p className="text-xs text-stone-400 italic">Sem notas.</p>}</div>) })}</div>) : <p className="text-xs text-stone-400 italic">Sem histórico anterior.</p>}</div>
    </div>
    <DialogFooter><Button variant="outline" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="appointment-form" disabled={isLoading}>Salvar</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}