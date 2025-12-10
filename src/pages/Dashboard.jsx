import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startOfMonth, endOfMonth, isWithinInterval, addDays, startOfDay, getDate, getMonth, isSameDay } from 'date-fns';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  DollarSign, Calendar, TrendingUp, Bell, UserPlus, UserCheck, 
  Cake, Clock, CheckCircle, ExternalLink, Plus, X, Phone, 
  MessageCircle, StickyNote, History as HistoryIcon, Send, Trash2 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const ORIGINS = ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'Indicação', 'Google', 'Campanha', 'Post', 'Video', 'Outro'];
const GENDERS = ['Feminino', 'Masculino', 'Outro'];

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

  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*').order('date', { ascending: false }); return data || []; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data || []; } });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: async () => { const { data } = await supabase.from('expenses').select('*'); return data || []; } });

  const savePatientMutation = useMutation({
    mutationFn: async (data) => {
        const { id, ...rest } = data;
        const payload = { ...rest }; 
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
    mutationFn: async ({ id, type }) => {
        if (type === 'patient') await supabase.from('patients').update({ next_return_date: null }).eq('id', id);
        else if (type === 'appointment') await supabase.from('appointments').update({ next_return_date: null }).eq('id', id);
    },
    onSuccess: () => { 
        queryClient.invalidateQueries({ queryKey: ['patients'] }); 
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        toast.success('Retorno removido!'); 
    }
  });

  const clearExtraReturnMutation = useMutation({
    mutationFn: async ({ id, index, type }) => {
        if (type === 'patient') {
            const patient = patients.find(p => p.id === id);
            if (!patient) return;
            const newReturns = patient.scheduled_returns.filter((_, i) => i !== index);
            await supabase.from('patients').update({ scheduled_returns: newReturns }).eq('id', id);
        } else if (type === 'appointment') {
            const apt = appointments.find(a => a.id === id);
            if (!apt) return;
            const newReturns = apt.scheduled_returns.filter((_, i) => i !== index);
            await supabase.from('appointments').update({ scheduled_returns: newReturns }).eq('id', id);
        }
    },
    onSuccess: () => { 
        queryClient.invalidateQueries({ queryKey: ['patients'] }); 
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
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

  const getBirthdaysToday = () => {
    const today = new Date();
    return patients.filter(p => {
        if (!p.birth_date) return false;
        const dob = new Date(p.birth_date + 'T12:00:00');
        return getDate(dob) === getDate(today) && getMonth(dob) === getMonth(today);
    });
  };

  const getStatusColorClass = (status) => {
      if (status === 'Confirmado') return 'text-blue-600 font-semibold';
      if (status === 'Realizado') return 'text-green-600 font-bold';
      return 'text-stone-800';
  };

  // --- NOVA LÓGICA DE ALERTAS ---
  // Agora só esconde o aviso se houver um atendimento "Realizado".
  // Se estiver "Agendado", o aviso continua aparecendo (como lembrete de pendência).

  const getMainReturns = () => {
    const today = startOfDay(new Date());
    const limit = addDays(today, 7); 
    const alerts = [];
    
    // 1. Pacientes
    patients.forEach(p => {
        if (p.next_return_date) {
            const date = new Date(p.next_return_date + 'T12:00:00');
            if (date >= today && date <= limit) {
                // VERIFICA SE JÁ FOI REALIZADO
                const isRealized = appointments.some(a => 
                    a.patient_id === p.id && 
                    isSameDay(new Date(a.date + 'T12:00:00'), date) && 
                    a.status === 'Realizado' // <--- MUDANÇA AQUI
                );
                
                if (!isRealized) {
                    alerts.push({ uniqueId: `p_${p.id}`, id: p.id, patientId: p.id, type: 'patient', name: p.full_name, date: p.next_return_date, source: 'Paciente', status: 'Pendente' });
                }
            }
        }
    });

    // 2. Atendimentos
    appointments.forEach(a => {
        if (a.next_return_date) {
            const date = new Date(a.next_return_date + 'T12:00:00');
            if (date >= today && date <= limit && a.status !== 'Cancelado') {
                // VERIFICA SE JÁ FOI REALIZADO
                const isRealized = appointments.some(existing => 
                    existing.patient_id === a.patient_id && 
                    isSameDay(new Date(existing.date + 'T12:00:00'), date) && 
                    existing.status === 'Realizado' // <--- MUDANÇA AQUI
                );

                if (!isRealized) {
                    alerts.push({ uniqueId: `a_${a.id}`, id: a.id, patientId: a.patient_id, type: 'appointment', name: a.patient_name, date: a.next_return_date, source: 'Atendimento', status: 'Pendente' });
                }
            }
        }
    });

    return alerts.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const getExtraReturns = () => {
    const today = startOfDay(new Date());
    const limit = addDays(today, 7);
    const alerts = [];
    
    patients.forEach(p => {
        if (Array.isArray(p.scheduled_returns)) {
            p.scheduled_returns.forEach((r, i) => {
                if (r.date) {
                    const date = new Date(r.date + 'T12:00:00');
                    if (date >= today && date <= limit) {
                        const isRealized = appointments.some(a => a.patient_id === p.id && isSameDay(new Date(a.date + 'T12:00:00'), date) && a.status === 'Realizado');
                        if (!isRealized) {
                            alerts.push({ uniqueId: `pe_${p.id}_${i}`, id: p.id, patientId: p.id, index: i, type: 'patient', name: p.full_name, date: r.date, description: r.description, status: 'Pendente' });
                        }
                    }
                }
            });
        }
    });

    appointments.forEach(a => {
        if (Array.isArray(a.scheduled_returns) && a.status !== 'Cancelado') {
            a.scheduled_returns.forEach((r, i) => {
                if (r.date) {
                    const date = new Date(r.date + 'T12:00:00');
                    if (date >= today && date <= limit) {
                         const isRealized = appointments.some(existing => existing.patient_id === a.patient_id && isSameDay(new Date(existing.date + 'T12:00:00'), date) && existing.status === 'Realizado');
                         if (!isRealized) {
                            alerts.push({ uniqueId: `ae_${a.id}_${i}`, id: a.id, patientId: a.patient_id, index: i, type: 'appointment', name: a.patient_name, date: r.date, description: r.description, status: 'Pendente' });
                         }
                    }
                }
            });
        }
    });
    return alerts.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const birthdays = getBirthdaysToday();
  const mainReturns = getMainReturns();
  const extraReturns = getExtraReturns();
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

  const handleOpenPatient = (patientId) => {
    const patient = patients.find(p => p.id === parseInt(patientId));
    if (patient) {
        setEditingPatient(patient);
        setIsPatientModalOpen(true);
    } else {
        toast.error("Paciente não encontrado.");
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader title="Dashboard" subtitle={`Visão geral da clínica`} action={<div className="flex gap-2"><Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}><SelectTrigger className="w-24 sm:w-32 bg-white text-sm"><SelectValue/></SelectTrigger><SelectContent>{months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}</SelectContent></Select><Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}><SelectTrigger className="w-20 sm:w-24 bg-white text-sm"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select></div>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <StatCard title="Faturamento" value={`R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} icon={DollarSign} />
        <StatCard title="Despesas" value={`R$ ${totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} icon={TrendingUp} />
        <StatCard title="Lucro" value={`R$ ${profit.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} icon={DollarSign} className={profit >= 0 ? '' : 'border-rose-200'} />
        <StatCard title="Atendimentos" value={monthAppointments.length} icon={Calendar} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="bg-white border-stone-200 shadow-sm"><CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2"><CardTitle className="text-xs sm:text-sm font-semibold text-stone-900">Pacientes do Mês</CardTitle></CardHeader><CardContent className="p-4 pt-0 sm:p-6 sm:pt-0"><div className="space-y-3 sm:space-y-4"><div className="flex items-center justify-between p-3 sm:p-4 bg-emerald-50 rounded-xl border border-emerald-200"><div className="flex items-center gap-2 sm:gap-3"><div className="p-1.5 sm:p-2 bg-emerald-600 rounded-lg"><UserPlus className="w-3 h-3 sm:w-4 sm:h-4 text-white" /></div><span className="text-xs sm:text-sm font-medium text-stone-900">Novos</span></div><span className="text-lg sm:text-xl font-semibold text-stone-900">{newPatients}</span></div><div className="flex items-center justify-between p-3 sm:p-4 bg-blue-50 rounded-xl border border-blue-200"><div className="flex items-center gap-2 sm:gap-3"><div className="p-1.5 sm:p-2 bg-blue-600 rounded-lg"><UserCheck className="w-3 h-3 sm:w-4 sm:h-4 text-white" /></div><span className="text-xs sm:text-sm font-medium text-stone-900">Recorrentes</span></div><span className="text-lg sm:text-xl font-semibold text-stone-900">{returningPatients}</span></div></div></CardContent></Card>
        <Card className="bg-white border-stone-200 shadow-sm"><CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2"><CardTitle className="text-xs sm:text-sm font-semibold text-stone-900">Gênero dos Pacientes</CardTitle></CardHeader><CardContent className="p-4 pt-0 sm:p-6 sm:pt-0"><div className="h-32 sm:h-40">{genderChartData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={genderChartData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" strokeWidth={0}>{genderChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-stone-400 text-xs sm:text-sm">Sem dados</div>}</div><div className="flex justify-center gap-3 sm:gap-4 mt-2 flex-wrap">{genderChartData.map((d) => <div key={d.name} className="flex items-center gap-1.5 sm:gap-2"><div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full" style={{ backgroundColor: d.color }} /><span className="text-[10px] sm:text-xs text-stone-500">{d.name}: {d.value}</span></div>)}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <Card className="bg-white border-stone-200 shadow-sm h-[600px] flex flex-col">
            <CardHeader className="pb-2 p-4 flex flex-row items-center justify-between shrink-0"><CardTitle className="text-xs sm:text-sm font-semibold text-stone-900 flex items-center gap-2"><Cake className="w-4 h-4 text-pink-500" /> Aniversariantes (Hoje)</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0 overflow-auto flex-1">
                {birthdays.length > 0 ? (
                    <div className="space-y-2">
                        {birthdays.map(p => (
                            <div key={p.id} onClick={() => handleOpenAlertDetails(p.id)} className="p-2 bg-pink-50 border border-pink-100 rounded-lg flex items-center justify-between cursor-pointer hover:bg-pink-100 transition-colors">
                                <div className="flex items-center gap-2">
                                    <Cake className="w-3 h-3 text-pink-400"/>
                                    <span className="text-xs font-medium text-stone-700 truncate">{p.full_name}</span>
                                </div>
                                <ExternalLink className="w-3 h-3 text-pink-300"/>
                            </div>
                        ))}
                    </div>
                ) : <div className="text-xs text-stone-400 text-center py-4">Nenhum hoje</div>}
            </CardContent>
        </Card>

        {/* Retornos Principais */}
        <Card className="bg-white border-stone-200 shadow-sm h-[600px] flex flex-col">
            <CardHeader className="pb-2 p-4 flex flex-row items-center justify-between shrink-0"><CardTitle className="text-xs sm:text-sm font-semibold text-stone-900 flex items-center gap-2"><Bell className="w-4 h-4 text-amber-500" /> Retornos (7 dias)</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0 overflow-auto flex-1">
                {mainReturns.length > 0 ? (
                    <div className="space-y-2">
                        {mainReturns.map(r => (
                            <div key={r.uniqueId} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg border border-amber-100 group">
                                <div onClick={() => handleOpenAlertDetails(r.patientId)} className="min-w-0 flex-1 cursor-pointer">
                                    <p className={`text-xs truncate ${getStatusColorClass(r.status)}`}>{r.name}</p>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="bg-white text-[10px] border-amber-200 px-1">{format(new Date(r.date + 'T12:00:00'), 'dd/MM')}</Badge>
                                        <span className="text-[10px] text-stone-400">Origem: {r.source}</span>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    {/* Botão de Check */}
                                    <button onClick={() => clearMainReturnMutation.mutate({ id: r.id, type: r.type })} className="p-2 hover:bg-green-100 rounded-full transition-colors" title="Marcar como Realizado (Baixa)">
                                        <CheckCircle className="w-4 h-4 text-emerald-500 hover:text-emerald-700" />
                                    </button>
                                    {/* Botão de Lixeira */}
                                    <button onClick={() => clearMainReturnMutation.mutate({ id: r.id, type: r.type })} className="p-2 hover:bg-red-100 rounded-full transition-colors" title="Apagar Retorno">
                                        <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <div className="text-xs text-stone-400 text-center py-4">Nenhum retorno próximo</div>}
            </CardContent>
        </Card>

        {/* Retornos Adicionais */}
        <Card className="bg-white border-stone-200 shadow-sm h-[600px] flex flex-col">
            <CardHeader className="pb-2 p-4 flex flex-row items-center justify-between shrink-0"><CardTitle className="text-xs sm:text-sm font-semibold text-stone-900 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> Retornos Adicionais (7 dias)</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0 overflow-auto flex-1">
                {extraReturns.length > 0 ? (
                    <div className="space-y-2">
                        {extraReturns.map(r => (
                            <div key={r.uniqueId} className="flex items-start justify-between p-2 bg-blue-50 rounded-lg border border-blue-100 gap-2 group">
                                <div onClick={() => handleOpenAlertDetails(r.patientId)} className="flex-1 cursor-pointer">
                                    <div className="flex justify-between items-center">
                                        <p className={`text-xs truncate max-w-[100px] ${getStatusColorClass(r.status)}`}>{r.name}</p>
                                        <Badge variant="outline" className="bg-white text-[10px] border-blue-200">{format(new Date(r.date + 'T12:00:00'), 'dd/MM')}</Badge>
                                    </div>
                                    <p className="text-[10px] text-blue-700 italic border-t border-blue-100 pt-1 mt-0.5">{r.description || 'Sem descrição'}</p>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <button onClick={() => clearExtraReturnMutation.mutate({ id: r.id, index: r.index, type: r.type })} className="p-1 hover:bg-green-100 rounded-full transition-colors" title="Concluir">
                                        <CheckCircle className="w-4 h-4 text-emerald-500 hover:text-emerald-700" />
                                    </button>
                                    <button onClick={() => clearExtraReturnMutation.mutate({ id: r.id, index: r.index, type: r.type })} className="p-1 hover:bg-red-100 rounded-full transition-colors" title="Apagar Extra">
                                        <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <div className="text-xs text-stone-400 text-center py-4">Nenhum extra próximo</div>}
            </CardContent>
        </Card>

      </div>
      
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
        toast.success("Retorno Adicional agendado!");
        queryClient.invalidateQueries({ queryKey: ['patients'] });
        setNewReturn({ date: '', description: '' });
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
        toast.success("Nota adicionada ao histórico!");
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
  const [formData, setFormData] = useState({ full_name: '', phone: '', whatsapp: '', email: '', birth_date: '', gender: '', cpf: '', address: '', city: '', origin: '', protocol: '', notes: '' });

  useEffect(() => { 
      if (patient) {
        setFormData({ 
            full_name: patient.full_name || '', phone: patient.phone || '', whatsapp: patient.whatsapp || '', 
            email: patient.email || '', birth_date: patient.birth_date || '', gender: patient.gender || '', 
            cpf: patient.cpf || '', address: patient.address || '', city: patient.city || '', 
            origin: patient.origin || '', protocol: patient.protocol || '', notes: patient.notes || ''
        });
      } else {
        setFormData({ full_name: '', phone: '', whatsapp: '', email: '', birth_date: '', gender: '', cpf: '', address: '', city: '', origin: '', protocol: '', notes: '' }); 
      }
  }, [patient, open]);
  
  const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{patient ? 'Editar' : 'Novo'} Paciente</DialogTitle><DialogDescription className="hidden">Formulário</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome *</Label><Input value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} required/></div>
            <div><Label>Telefone *</Label><Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} required/></div>
            <div><Label>Whatsapp</Label><Input value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} placeholder="(00) 00000-0000" /></div>
            <div><Label>Email</Label><Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}/></div>
            <div><Label>Nascimento</Label><Input type="date" value={formData.birth_date} onChange={e => setFormData({...formData, birth_date: e.target.value})}/></div>
            <div><Label>Gênero</Label><Select value={formData.gender} onValueChange={v => setFormData({...formData, gender: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Origem</Label><Select value={formData.origin} onValueChange={v => setFormData({...formData, origin: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{ORIGINS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
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