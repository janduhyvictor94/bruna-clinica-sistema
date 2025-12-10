import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startOfMonth, endOfMonth, isWithinInterval, addDays, startOfDay, getDate, getMonth, isSameDay, isBefore, parseISO, subMonths, getYear, endOfDay } from 'date-fns';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  DollarSign, Calendar, TrendingUp, Bell, UserPlus, UserCheck, 
  Cake, Clock, CheckCircle, ExternalLink, Trash2, Phone, MessageCircle, StickyNote, History as HistoryIcon, Send, X, ClipboardList, RotateCcw, AlertTriangle 
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const ORIGINS = ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'Indicação', 'Google', 'Campanha', 'Post', 'Video', 'Outro'];
const GENDERS = ['Feminino', 'Masculino', 'Outro'];

const formatCurrency = (value) => {
  return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatDateDisplay = (dateString) => {
  if (!dateString) return '';
  return format(new Date(dateString + 'T12:00:00'), 'dd/MM');
};

export default function Dashboard() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [selectedAlertPatient, setSelectedAlertPatient] = useState(null);
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);

  const queryClient = useQueryClient();

  // Garante que a sintaxe está correta (corrigindo o erro que encontramos antes)
  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*').order('date', { ascending: false }); return data || []; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data || []; } });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: async () => { const { data } = await supabase.from('expenses').select('*'); return data || []; } });
  const { data: installments = [] } = useQuery({ queryKey: ['installments'], queryFn: async () => { const { data } = await supabase.from('installments').select('*'); return data || []; } });

  const savePatientMutation = useMutation({
    mutationFn: async (data) => {
        const { id, ...rest } = data;
        const payload = {};
        Object.keys(rest).forEach(key => {
            const value = rest[key];
            if (typeof value === 'string' && value.trim() === '') payload[key] = null;
            else payload[key] = value;
        });
        if (id) await supabase.from('patients').update(payload).eq('id', id);
        else await supabase.from('patients').insert([payload]);
    },
    onSuccess: () => { 
        queryClient.invalidateQueries({ queryKey: ['patients'] }); 
        setIsPatientModalOpen(false); 
        setEditingPatient(null); 
        toast.success('Ficha atualizada!'); 
    },
    onError: (err) => toast.error('Erro ao salvar: ' + err.message)
  });

  const clearMainReturnMutation = useMutation({
    mutationFn: async ({ id }) => {
        await supabase.from('patients').update({ next_return_date: null }).eq('id', id);
    },
    onSuccess: () => { 
        queryClient.invalidateQueries({ queryKey: ['patients'] }); 
        toast.success('Retorno removido!'); 
    }
  });

  const clearExtraReturnMutation = useMutation({
    mutationFn: async ({ id, index }) => {
        const patient = patients.find(p => p.id === id);
        if (!patient) return;
        const newReturns = patient.scheduled_returns.filter((_, i) => i !== index);
        await supabase.from('patients').update({ scheduled_returns: newReturns }).eq('id', id);
    },
    onSuccess: () => { 
        queryClient.invalidateQueries({ queryKey: ['patients'] }); 
        toast.success('Retorno extra removido!'); 
    }
  });

  const deleteHistoryNoteMutation = useMutation({
    mutationFn: async ({ appointmentId, noteIndex }) => {
        const { data: apt } = await supabase.from('appointments').select('notes').eq('id', appointmentId).single();
        let currentNotes = apt.notes;
        if (typeof currentNotes === 'string') { try { currentNotes = JSON.parse(currentNotes); } catch(e) { currentNotes = []; } }
        let updatedNotes = [];
        if (Array.isArray(currentNotes)) { updatedNotes = currentNotes.filter((_, i) => i !== noteIndex); }
        await supabase.from('appointments').update({ notes: updatedNotes }).eq('id', appointmentId);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments'] }); toast.success('Nota excluída do histórico.'); }
  });

  // --- CÁLCULOS DE ESTATÍSTICAS E AVISOS ---
  const stats = useMemo(() => {
    const monthStart = startOfMonth(new Date(selectedYear, selectedMonth));
    const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth));
    const today = startOfDay(new Date());
    const sevenDaysFromNow = endOfDay(addDays(new Date(), 7)); 

    // Filtros
    const monthAppointments = appointments.filter(a => { const date = parseISO(a.date); return isWithinInterval(date, { start: monthStart, end: monthEnd }) && a.status === 'Realizado'; });
    const monthExpenses = expenses.filter(e => { const date = parseISO(e.due_date); return isWithinInterval(date, { start: monthStart, end: monthEnd }); });
    
    // Métricas
    const totalRevenue = monthAppointments.reduce((sum, a) => sum + (a.final_value || a.total_value || 0), 0);
    const totalExpenses = monthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const profit = totalRevenue - totalExpenses;
    const newPatients = monthAppointments.filter(a => a.is_new_patient).length;
    const returningPatients = monthAppointments.filter(a => !a.is_new_patient).length;
    
    // Aniversariantes
    const birthdays = patients.filter(p => {
      if (!p.birth_date) return false;
      const dob = parseISO(p.birth_date);
      const today = new Date();
      return getDate(dob) === getDate(today) && getMonth(dob) === getMonth(today);
    });

    // --- AVISO 1: AGENDAMENTOS PENDENTES (STATUS: AGENDADO) ---
    const pendingAppointments = appointments
        .filter(a => {
            const appointmentDate = startOfDay(parseISO(a.date));
            // Foco: Apenas AGENDADO
            return a.status === 'Agendado' && 
                   appointmentDate >= today && 
                   appointmentDate <= sevenDaysFromNow;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    // --- AVISO 2: ATENDIMENTOS CONFIRMADOS (STATUS: CONFIRMADO) ---
    const upcomingAppointments = appointments
        .filter(a => {
            const appointmentDate = startOfDay(parseISO(a.date));
            // Foco: Apenas CONFIRMADO
            return a.status === 'Confirmado' && 
                   appointmentDate >= today && 
                   appointmentDate <= sevenDaysFromNow;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    // --- AVISO 3: RETORNOS PENDENTES (7 DIAS) ---
    // LOGICA CORRIGIDA: MOSTRAR SE AINDA NÃO FOI REALIZADO NEM CONFIRMADO (para aparecer aqui quando for AGENDADO ou PENDENTE)
    const mainReturns = [];
    const extraReturns = [];

    patients.forEach(p => {
        // Função para verificar se o retorno deve ser listado
        const checkReturn = (dateStr, source, description, index) => {
            if (!dateStr) return;
            
            const returnDate = startOfDay(parseISO(dateStr));
            if (returnDate >= today && returnDate <= sevenDaysFromNow) {
                
                // 1. Procura Agendamento Ativo que 'ACOMODA' este retorno (Status Realizado ou Confirmado)
                const hasAccommodation = appointments.some(a => 
                    a.patient_id === p.id && 
                    isSameDay(startOfDay(parseISO(a.date)), returnDate) && 
                    (a.status === 'Realizado' || a.status === 'Confirmado') 
                );
                
                // REGRA FINAL: MOSTRAR SE AINDA NÃO FOI ACOMODADO POR UM STATUS FINALIZADO/PROMOVIDO.
                
                if (!hasAccommodation) {
                    const alertData = {
                        uniqueId: `${source}_${p.id}_${index !== undefined ? index : ''}`, 
                        id: p.id, 
                        patientId: p.id, 
                        name: p.full_name, 
                        date: dateStr, 
                        description: description, 
                        source: source, 
                        status: 'Pendente' 
                    };
                    
                    if (source === 'Principal') {
                        mainReturns.push(alertData);
                    } else {
                        extraReturns.push(alertData);
                    }
                }
            }
        };

        // Verifica Retorno Principal
        checkReturn(p.next_return_date, 'Principal', 'Retorno Principal', undefined);
        
        // Verifica Retornos Adicionais
        if (Array.isArray(p.scheduled_returns)) {
            p.scheduled_returns.forEach((r, i) => {
                checkReturn(r.date, 'Adicional', r.description, i);
            });
        }
    });

    const allReturns = [...mainReturns, ...extraReturns].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // --- PENDÊNCIAS FINANCEIRAS (Cálculo mantido, mas não será exibido na coluna 3) ---
    const pendingInstallments = installments.filter(i => !i.is_received);
    const overdueInstallments = pendingInstallments.filter(i => parseISO(i.due_date) < today);
    const totalPending = pendingInstallments.reduce((sum, i) => sum + i.value, 0);


    return {
      totalRevenue, totalExpenses, profit, newPatients, returningPatients, 
      birthdays, upcomingAppointments, allReturns, totalPending, overdueInstallments,
      monthAppointments, pendingAppointments
    };
  }, [appointments, patients, expenses, installments, selectedMonth, selectedYear]);

  // Desestruturando o objeto stats para uso no JSX e em outras funções
  const {
      totalRevenue, totalExpenses, profit, monthAppointments,
      birthdays, upcomingAppointments, allReturns, totalPending, overdueInstallments, 
      newPatients, returningPatients, pendingAppointments
  } = stats;


  const getStatusColorClass = (status) => {
      if (status === 'Confirmado') return 'text-blue-600 font-semibold';
      if (status === 'Realizado') return 'text-green-600 font-bold';
      return 'text-stone-800';
  };

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);

  const handleOpenAlertDetails = (patientId) => {
    const patient = patients.find(p => p.id === parseInt(patientId));
    if (patient) {
        setSelectedAlertPatient(patient);
        setAlertModalOpen(true);
    } else {
        toast.error("Paciente não encontrado.");
    }
  };

  const getAptStatusColor = (status) => {
      switch(status) {
          case 'Confirmado': return 'bg-blue-100 text-blue-800 border-blue-200';
          case 'Agendado': return 'bg-stone-100 text-stone-800 border-stone-200';
          default: return 'bg-gray-100 text-gray-600';
      }
  };


  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader title="Dashboard" subtitle={`Visão geral da clínica`} action={<div className="flex gap-2"><Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}><SelectTrigger className="w-24 sm:w-32 bg-white text-sm"><SelectValue/></SelectTrigger><SelectContent>{months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}</SelectContent></Select><Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}><SelectTrigger className="w-20 sm:w-24 bg-white text-sm"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select></div>} />

      {/* CARDS DE ESTATÍSTICAS PRINCIPAIS (1ª LINHA) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <StatCard title="Faturamento" value={`R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} icon={DollarSign} />
        <StatCard title="Despesas" value={`R$ ${totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} icon={TrendingUp} />
        <StatCard title="Lucro" value={`R$ ${profit.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} icon={DollarSign} className={profit >= 0 ? '' : 'border-rose-200'} />
        <StatCard title="Atendimentos" value={monthAppointments.length} icon={Calendar} />
      </div>

      {/* SEÇÃO DE AVISOS (2ª LINHA) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        
        {/* COLUNA 1: ANIVERSARIANTES E DADOS DO MÊS */}
        {/* Usando md:col-span-1 e h-[600px] para manter o design anterior em 3 colunas */}
        <Card className="md:col-span-1 border-stone-200 shadow-sm h-[600px] flex flex-col">
            <CardHeader className="pb-2 p-4 flex flex-row items-center justify-between shrink-0">
                <CardTitle className="text-xs sm:text-sm font-semibold text-stone-900 flex items-center gap-2">
                    <Cake className="w-4 h-4 text-pink-500" /> Aniversariantes (Hoje)
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 overflow-auto flex-1">
                <div className="space-y-2 mb-4">
                    {birthdays.length > 0 ? (
                        birthdays.map(p => (
                            <div key={p.id} onClick={() => handleOpenAlertDetails(p.id)} className="p-2 bg-pink-50 border border-pink-100 rounded-lg flex items-center justify-between cursor-pointer hover:bg-pink-100 transition-colors">
                                <div className="flex items-center gap-2">
                                    <Cake className="w-3 h-3 text-pink-400"/>
                                    <span className="text-xs font-medium text-stone-700 truncate">{p.full_name}</span>
                                </div>
                                <ExternalLink className="w-3 h-3 text-pink-300"/>
                            </div>
                        ))
                    ) : <div className="text-xs text-stone-400 text-center py-4">Nenhum hoje</div>}
                </div>
                
                {/* Pacientes do Mês */}
                <CardHeader className="pb-2 p-0"><CardTitle className="text-xs font-semibold text-stone-900">Pacientes do Mês</CardTitle></CardHeader>
                <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between p-2 bg-emerald-50 rounded-xl border border-emerald-200">
                        <span className="text-xs font-medium text-stone-900 flex items-center gap-2"><UserPlus className="w-4 h-4 text-emerald-600"/> Novos</span>
                        <span className="text-lg font-semibold text-stone-900">{newPatients}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-blue-50 rounded-xl border border-blue-200">
                        <span className="text-xs font-medium text-stone-900 flex items-center gap-2"><UserCheck className="w-4 h-4 text-blue-600"/> Recorrentes</span>
                        <span className="text-lg font-semibold text-stone-900">{returningPatients}</span>
                    </div>
                </div>
            </CardContent>
        </Card>


        {/* COLUNA 2: AGENDAMENTOS PENDENTES (STATUS: AGENDADO) */}
        <Card className="md:col-span-1 border-stone-200 shadow-sm h-[600px] flex flex-col">
            <CardHeader className="pb-2 p-4 flex flex-row items-center justify-between shrink-0">
                <CardTitle className="text-xs sm:text-sm font-semibold text-stone-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 mr-2 text-stone-500" /> Agendamentos Pendentes (7 dias)
                </CardTitle>
                <Badge variant="secondary" className="bg-stone-500 text-white text-xs">{pendingAppointments.length}</Badge>
            </CardHeader>
            <CardContent className="p-4 pt-0 overflow-auto flex-1">
                {pendingAppointments.length > 0 ? (
                    <div className="space-y-2">
                        {pendingAppointments.map(apt => (
                            <div key={apt.id} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg border border-stone-100">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs truncate font-medium text-stone-800">{apt.patient_name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <Badge className={`text-[10px] ${getAptStatusColor(apt.status)}`}>{apt.status}</Badge>
                                        <span className="text-[10px] text-stone-500">
                                            {format(new Date(apt.date + 'T12:00:00'), 'dd/MM')} {apt.time}
                                        </span>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-400 hover:text-stone-600">
                                    <ExternalLink className="w-3 h-3"/>
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : <div className="text-xs text-stone-400 text-center py-4">Nenhum agendamento com status AGENDADO.</div>}
            </CardContent>
        </Card>


        {/* COLUNA 3: ATENDIMENTOS CONFIRMADOS (STATUS: CONFIRMADO) */}
        <Card className="md:col-span-1 border-stone-200 shadow-sm h-[600px] flex flex-col">
            <CardHeader className="pb-2 p-4 flex flex-row items-center justify-between shrink-0">
                <CardTitle className="text-xs sm:text-sm font-semibold text-stone-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 mr-2 text-blue-500" /> Atendimentos Confirmados (7 dias)
                </CardTitle>
                <Badge variant="secondary" className="bg-blue-500 text-white text-xs">{upcomingAppointments.length}</Badge>
            </CardHeader>
            <CardContent className="p-4 pt-0 overflow-auto flex-1">
                {upcomingAppointments.length > 0 ? (
                    <div className="space-y-2">
                        {upcomingAppointments.map(apt => (
                            <div key={apt.id} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border border-blue-100">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs truncate font-medium text-stone-800">{apt.patient_name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <Badge className={`text-[10px] ${getAptStatusColor(apt.status)}`}>{apt.status}</Badge>
                                        <span className="text-[10px] text-stone-500">
                                            {format(new Date(apt.date + 'T12:00:00'), 'dd/MM')} {apt.time}
                                        </span>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-400 hover:text-blue-600">
                                    <ExternalLink className="w-3 h-3"/>
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : <div className="text-xs text-stone-400 text-center py-4">Nenhum atendimento CONFIRMADO nos próximos 7 dias.</div>}
            </CardContent>
        </Card>

      </div>
      
      {/* SEÇÃO PENDÊNCIAS FINANCEIRAS (REMOVIDA COMPLETAMENTE) */}
      
      <AlertDetailsModal 
        open={alertModalOpen}
        onClose={() => setAlertModalOpen(false)}
        patient={selectedAlertPatient}
        appointments={appointments}
        queryClient={queryClient}
        onDeleteNote={(appointmentId, noteIndex) => deleteHistoryNoteMutation.mutate({ appointmentId, noteIndex })}
      />

      <PatientModal 
        open={isPatientModalOpen} 
        onClose={() => setIsPatientModalOpen(false)} 
        patient={editingPatient} 
        onSave={(data) => savePatientMutation.mutate({ ...data, id: editingPatient?.id })} 
      />
    </div>
  );
}

function AlertDetailsModal({ open, onClose, patient, appointments, queryClient, onDeleteNote }) {
  const [newReturn, setNewReturn] = useState({ date: '', description: '' });
  const [newNote, setNewNote] = useState({ date: format(new Date(), 'yyyy-MM-dd'), text: '' });

  if (!patient) return null;

  const patientAppointments = appointments.filter(a => a.patient_id === patient.id && a.status !== 'Cancelado');
  
  const flatHistory = [];
  patientAppointments.forEach(apt => {
      let notesList = [];
      if (Array.isArray(apt.notes)) notesList = apt.notes;
      else if (typeof apt.notes === 'string' && apt.notes) {
          try {
              const parsed = JSON.parse(apt.notes);
              notesList = Array.isArray(parsed) ? parsed : [{ date: apt.date, text: apt.notes }];
          } catch (e) {
              notesList = [{ date: apt.date, text: apt.notes }];
          }
      }
      notesList.forEach((note, index) => {
          flatHistory.push({
              date: note.date || apt.date,
              text: note.text,
              appointmentId: apt.id,
              originalIndex: index
          });
      });
  });
  flatHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

  const addReturn = async () => {
    if(!newReturn.date) return toast.error("Selecione uma data");
    const updatedReturns = [...(patient.scheduled_returns || []), newReturn];
    const { error } = await supabase.from('patients').update({ scheduled_returns: updatedReturns }).eq('id', patient.id);
    if(error) toast.error("Erro ao salvar retorno");
    else {
        queryClient.invalidateQueries({ queryKey: ['patients'] });
        setNewReturn({ date: '', description: '' });
        toast.success("Retorno Adicional agendado!");
    }
  };

  const addNote = async () => {
    if(!newNote.text) return toast.error("Escreva uma nota");
    const payload = {
        patient_id: patient.id,
        patient_name: patient.full_name,
        date: newNote.date,
        status: 'Realizado',
        notes: [{ date: newNote.date, text: newNote.text }],
        total_value: 0,
        is_new_patient: false
    };
    const { error } = await supabase.from('appointments').insert([payload]);
    if(error) toast.error("Erro ao salvar nota");
    else {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        setNewNote({ date: format(new Date(), 'yyyy-MM-dd'), text: '' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-stone-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
             <span className="bg-stone-800 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs">
                {patient.full_name.charAt(0)}
             </span>
             {patient.full_name}
          </DialogTitle>
          <DialogDescription>Ficha rápida e histórico</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4">
                <Card className="border-stone-200">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Dados do Paciente</CardTitle></CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div><span className="text-stone-500 block text-xs">Telefone</span><div className="flex items-center gap-2"><Phone className="w-3 h-3"/> {patient.phone}</div></div>
                        {patient.whatsapp && <div><span className="text-stone-500 block text-xs">Whatsapp</span><div className="flex items-center gap-2 text-green-600"><MessageCircle className="w-3 h-3"/> {patient.whatsapp}</div></div>}
                        <div><span className="text-stone-500 block text-xs">Idade/Nasc.</span>{patient.birth_date ? format(new Date(patient.birth_date + 'T12:00:00'), 'dd/MM/yyyy') : '-'}</div>
                        <div><span className="text-stone-500 block text-xs">Protocolo</span>{patient.protocol || 'Nenhum'}</div>
                    </CardContent>
                </Card>

                <Card className="border-stone-200 bg-blue-50/50">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-blue-600"/> Novo Retorno Adicional</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        <Input type="date" value={newReturn.date} onChange={e => setNewReturn({...newReturn, date: e.target.value})} className="bg-white" />
                        <Input placeholder="Motivo (Ex: Botox)" value={newReturn.description} onChange={e => setNewReturn({...newReturn, description: e.target.value})} className="bg-white" />
                        <Button onClick={addReturn} size="sm" className="w-full bg-blue-600 hover:bg-blue-700">Agendar</Button>
                    </CardContent>
                </Card>
            </div>

            <div className="md:col-span-2 space-y-4">
                <Card className="border-stone-200">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><StickyNote className="w-4 h-4 text-stone-600"/> Nova Nota / Procedimento</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex gap-2">
                            <Input type="date" value={newNote.date} onChange={e => setNewNote({...newNote, date: e.target.value})} className="w-36" />
                            <div className="flex-1 flex gap-2">
                                <Textarea 
                                    placeholder="Descreva o procedimento realizado ou observação..." 
                                    value={newNote.text} 
                                    onChange={e => setNewNote({...newNote, text: e.target.value})}
                                    rows={1}
                                    className="resize-none min-h-[40px]"
                                />
                                <Button onClick={addNote} size="icon" className="bg-stone-800 hover:bg-stone-900 shrink-0"><Send className="w-4 h-4"/></Button>
                            </div>
                        </div>
                        <p className="text-[10px] text-stone-400 mt-1">* Isso criará um registro no histórico do paciente.</p>
                    </CardContent>
                </Card>

                <div className="bg-white rounded-xl border border-stone-200 p-4 h-[400px] overflow-y-auto">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 sticky top-0 bg-white pb-2 border-b"><HistoryIcon className="w-4 h-4"/> Histórico de Procedimentos</h3>
                    <div className="space-y-4 mt-2">
                        {flatHistory.length > 0 ? flatHistory.map((item, idx) => (
                            <div key={idx} className="flex gap-4">
                                <div className="flex flex-col items-center w-24 shrink-0 pt-1">
                                    <div className="text-xs font-bold text-stone-700">{format(new Date(item.date + 'T12:00:00'), 'dd/MM/yyyy')}</div>
                                    <div className="h-full w-[1px] bg-stone-200 my-1"></div>
                                </div>
                                <Card className="flex-1 border-stone-100 shadow-sm relative top-0 bg-stone-50">
                                    <CardContent className="p-3 flex justify-between gap-3 group">
                                        <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
                                            {item.text}
                                        </p>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                            onClick={() => onDeleteNote(item.appointmentId, item.originalIndex)}
                                            title="Excluir do Histórico"
                                        >
                                            <Trash2 className="w-4 h-4"/>
                                        </Button>
                                    </CardContent>
                                </Card>
                            </div>
                        )) : <div className="text-center py-10 text-stone-400">Nenhum histórico encontrado.</div>}
                    </div>
                </div>
            </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PatientModal({ open, onClose, patient, onSave }) {
  const [formData, setFormData] = useState({ full_name: '', phone: '', whatsapp: '', email: '', birth_date: '', gender: '', cpf: '', address: '', city: '', origin: '', protocol: '', notes: '', next_return_date: '', scheduled_returns: [] });

  useEffect(() => { 
      if (patient) {
        setFormData({ 
            full_name: patient.full_name || '', 
            phone: patient.phone || '', 
            whatsapp: patient.whatsapp || '', 
            email: patient.email || '', 
            birth_date: patient.birth_date || '', 
            gender: patient.gender || '', 
            cpf: patient.cpf || '', 
            address: patient.address || '', 
            city: patient.city || '', 
            origin: patient.origin || '', 
            protocol: patient.protocol || '', 
            notes: patient.notes || '',
            next_return_date: patient.next_return_date || '', 
            scheduled_returns: patient.scheduled_returns || [] 
        });
      } else {
        setFormData({ full_name: '', phone: '', whatsapp: '', email: '', birth_date: '', gender: '', cpf: '', address: '', city: '', origin: '', protocol: '', notes: '', next_return_date: '', scheduled_returns: [] }); 
      }
  }, [patient, open]);
  
  const handleSubmit = (e) => { 
      e.preventDefault(); 
      if (!formData.full_name || formData.full_name.trim() === "") {
          toast.error("O nome do paciente é obrigatório.");
          return;
      }
      onSave(formData); 
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{patient ? 'Editar' : 'Novo'} Paciente</DialogTitle><DialogDescription className="hidden">Formulário</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome *</Label><Input value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} required/></div>
            <div><Label>Telefone</Label><Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></div>
            <div><Label>Whatsapp</Label><Input value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} placeholder="(00) 00000-0000" /></div>
            <div><Label>Email</Label><Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}/></div>
            <div><Label>Nascimento</Label><Input type="date" value={formData.birth_date} onChange={e => setFormData({...formData, birth_date: e.target.value})}/></div>
            <div><Label>Gênero</Label><Select value={formData.gender} onValueChange={v => setFormData({...formData, gender: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Origem</Label><Select value={formData.origin} onValueChange={v => setFormData({...formData, origin: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{ORIGINS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
            
            {/* CAMPOS DE RETORNO NO MODAL DO PACIENTE */}
            <div className="col-span-2 p-3 bg-stone-50 rounded-lg border border-stone-200">
                <Label className="font-semibold text-sm mb-2 block">Gerenciar Retornos</Label>
                <div>
                    <Label className="text-xs">Próximo Retorno Principal (Cria Agendamento)</Label>
                    <div className="flex gap-2">
                        <Input 
                            type="date" 
                            value={formData.next_return_date || ''} 
                            onChange={e => setFormData({...formData, next_return_date: e.target.value})} 
                        />
                        <Button type="button" variant="outline" size="icon" onClick={() => setFormData({...formData, next_return_date: ''})}><X className="w-4 h-4 text-stone-500"/></Button>
                    </div>
                </div>

                <div className="mt-3">
                    <Label className="text-xs">Retornos Adicionais (Agenda)</Label>
                    {Array.isArray(formData.scheduled_returns) && formData.scheduled_returns.map((ret, i) => (
                        <div key={i} className="flex gap-2 bg-white p-1 mt-1 border rounded items-center justify-between text-xs">
                            <Calendar className="w-3 h-3 text-stone-400"/> {formatDateDisplay(ret.date)} - {ret.description}
                        </div>
                    ))}
                </div>
            </div>

            <div className="col-span-2 grid grid-cols-3 gap-4">
                <div className="col-span-2"><Label>Endereço</Label><Input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})}/></div>
                <div><Label>Cidade</Label><Input value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} placeholder="Ex: São Paulo"/></div>
            </div>
            <div className="col-span-2"><Label>CPF</Label><Input value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})}/></div>
            <div className="col-span-2"><Label>Protocolo</Label><Textarea value={formData.protocol} onChange={e => setFormData({...formData, protocol: e.target.value})}/></div>
            <div className="col-span-2"><Label>Notas (Gerais)</Label><Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}/></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}