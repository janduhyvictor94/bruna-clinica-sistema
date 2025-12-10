import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, addMonths, subMonths, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';

import { AppointmentModal } from './Appointments'; 

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);

  const queryClient = useQueryClient();

  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*').order('date', { ascending: false }); return data || []; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data || []; } });
  const { data: procedures = [] } = useQuery({ queryKey: ['procedures'], queryFn: async () => { const { data } = await supabase.from('procedures').select('*'); return data || []; } });
  const { data: materials = [] } = useQuery({ queryKey: ['materials'], queryFn: async () => { const { data } = await supabase.from('materials').select('*'); return data || []; } });
  const { data: allInstallments = [] } = useQuery({ queryKey: ['installments'], queryFn: async () => { const { data } = await supabase.from('installments').select('*'); return data || []; } });

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
                    paid: pay.paid_now, is_received: pay.paid_now,
                    received_date: pay.paid_now ? format(new Date(), 'yyyy-MM-dd') : null,
                    payment_method: pay.method,
                    description: `Pagamento (${pay.method}) - ${patientName}`
                });
            }
        });
        if (installmentsArray.length > 0) await supabase.from('installments').insert(installmentsArray);
      }
  };

  const syncPatientReturns = async (patientId, nextReturn, scheduledReturns) => {
      const updates = {};
      if (nextReturn) updates.next_return_date = nextReturn;
      if (scheduledReturns && scheduledReturns.length > 0) updates.scheduled_returns = scheduledReturns;
      if (Object.keys(updates).length > 0) {
          await supabase.from('patients').update(updates).eq('id', patientId);
          queryClient.invalidateQueries({ queryKey: ['patients'] });
      }
  };

  const checkAndClearReturns = async (patientId, appointmentDate, status) => {
      if (status !== 'Realizado') return;
      const { data: patient } = await supabase.from('patients').select('*').eq('id', patientId).single();
      if (!patient) return;
      let updated = false;
      const updates = {};
      if (patient.next_return_date === appointmentDate) { updates.next_return_date = null; updated = true; }
      if (Array.isArray(patient.scheduled_returns)) {
          const originalLen = patient.scheduled_returns.length;
          const filteredReturns = patient.scheduled_returns.filter(r => r.date !== appointmentDate);
          if (filteredReturns.length !== originalLen) { updates.scheduled_returns = filteredReturns; updated = true; }
      }
      if (updated) {
          await supabase.from('patients').update(updates).eq('id', patientId);
          queryClient.invalidateQueries({ queryKey: ['patients'] }); 
      }
  };

  const preparePayload = (formData) => {
    if (!formData.patient_id) throw new Error("Selecione um paciente");
    const patient = patients.find(p => p.id === parseInt(formData.patient_id));
    return {
        patient_id: parseInt(formData.patient_id),
        patient_name: patient?.full_name || '',
        patient_gender: patient?.gender,
        patient_origin: patient?.origin,
        date: formData.date,
        time: formData.time || null,
        status: formData.status || 'Agendado',
        notes: formData.notes,
        next_return_date: formData.next_return_date || null,
        scheduled_returns: Array.isArray(formData.scheduled_returns) ? formData.scheduled_returns : [],
        is_new_patient: formData.is_new_patient || false,
        procedures_performed: Array.isArray(formData.procedures_performed) ? formData.procedures_performed : [],
        materials_used: Array.isArray(formData.materials_used) ? formData.materials_used : [],
        total_value: parseFloat(formData.total_value) || 0,
        total_material_cost: parseFloat(formData.total_material_cost) || 0,
        discount_percent: parseFloat(formData.discount_percent) || 0,
        discount_value: parseFloat(formData.discount_value) || 0,
        final_value: parseFloat(formData.final_value) || 0,
        payment_method: formData.payment_method || '',
        installments: parseInt(formData.installments) || 1,
        installment_value: parseFloat(formData.installment_value) || 0
    };
  };

  const createMutation = useMutation({
    mutationFn: async (formData) => {
      const payload = preparePayload(formData);
      const { data: appointment, error } = await supabase.from('appointments').insert([payload]).select().single();
      if (error) throw error;
      await generateInstallments(formData, appointment.id, payload.patient_name, payload.date);
      await syncPatientReturns(payload.patient_id, payload.next_return_date, payload.scheduled_returns);
      await checkAndClearReturns(payload.patient_id, payload.date, payload.status);
      return appointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setIsAppointmentModalOpen(false);
      toast.success('Novo atendimento criado!');
    },
    onError: (err) => toast.error('Erro: ' + err.message)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => { 
        const payload = preparePayload(data); 
        const { error } = await supabase.from('appointments').update(payload).eq('id', id); 
        if (error) throw error; 
        await generateInstallments(data, id, payload.patient_name, payload.date);
        await syncPatientReturns(payload.patient_id, payload.next_return_date, payload.scheduled_returns);
        await checkAndClearReturns(payload.patient_id, payload.date, payload.status);
    },
    onSuccess: () => { 
        queryClient.invalidateQueries({ queryKey: ['appointments'] }); 
        queryClient.invalidateQueries({ queryKey: ['installments'] });
        setIsAppointmentModalOpen(false); 
        setEditingAppointment(null); 
        toast.success('Atualizado!'); 
    },
    onError: (err) => toast.error('Erro ao atualizar: ' + err.message)
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = [];
  let day = calendarStart;
  while (day <= calendarEnd) { days.push(day); day = addDays(day, 1); }

  const handleEventClick = (event) => {
    if (event.type === 'appointment') {
        const appointment = appointments.find(a => a.id === parseInt(event.id.replace('apt_', '')));
        if (appointment) {
            setEditingAppointment(appointment);
            setIsAppointmentModalOpen(true);
        }
    } else if (event.type === 'return') {
        const patient = patients.find(p => p.id === event.patientId);
        if (patient) {
            setEditingAppointment({
                patient_id: patient.id,
                patient_name: patient.full_name,
                date: event.eventDate, 
                is_new_patient: false, 
                status: 'Agendado',
                notes: [], procedures_performed: [], materials_used: [], payments: []
            });
            setIsAppointmentModalOpen(true);
        }
    }
  };

  const getEventsForDay = (date) => {
    const dayEvents = [];
    const checkDate = (d) => d && isSameDay(new Date(d + 'T12:00:00'), date);
    const dateString = format(date, 'yyyy-MM-dd');

    // 1. ADICIONA OS AGENDAMENTOS EXISTENTES
    appointments.forEach(apt => {
        if (checkDate(apt.date)) {
            dayEvents.push({ id: `apt_${apt.id}`, patientId: apt.patient_id, type: 'appointment', title: apt.patient_name?.split(' ')[0], time: apt.time, status: apt.status, eventDate: dateString });
        }
    });

    // 2. FILTRA AGENDAMENTOS DO DIA (PARA EVITAR DUPLICIDADE)
    const appointmentsToday = appointments.filter(a => checkDate(a.date));
    const patientsWithAppointmentToday = new Set(appointmentsToday.map(a => a.patient_id));

    // 3. ADICIONA RETORNOS APENAS SE NÃO HOUVER AGENDAMENTO
    patients.forEach(p => {
        // Se o paciente JÁ TEM um agendamento hoje, NÃO mostra o lembrete de retorno
        if (patientsWithAppointmentToday.has(p.id)) return;

        if (checkDate(p.next_return_date)) {
            dayEvents.push({ id: `pat_ret_${p.id}`, patientId: p.id, type: 'return', title: p.full_name?.split(' ')[0], desc: 'Retorno (P)', eventDate: dateString });
        }
        if (Array.isArray(p.scheduled_returns)) {
            p.scheduled_returns.forEach((ret, i) => {
                if (checkDate(ret.date)) {
                    dayEvents.push({ id: `pat_extra_${p.id}_${i}`, patientId: p.id, type: 'return', title: p.full_name?.split(' ')[0], desc: ret.description || 'Extra', eventDate: dateString });
                }
            });
        }
    });

    return dayEvents;
  };

  const statusColors = { 'Agendado': 'bg-blue-500', 'Confirmado': 'bg-emerald-500', 'Realizado': 'bg-stone-500', 'Cancelado': 'bg-rose-500' };
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);

  return (
    <div className="space-y-6">
      <PageHeader title="Agenda" subtitle="Visualize agendamentos e retornos" action={<Link to={createPageUrl('Appointments') + '?action=new'}><Button className="bg-stone-800 hover:bg-stone-900"><Plus className="w-4 h-4 mr-2"/> Novo Agendamento</Button></Link>} />
      
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-stone-100">
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="w-5 h-5"/></Button>
        <div className="flex items-center gap-2"><span className="text-lg font-light text-stone-800 capitalize">{format(currentDate, 'MMMM', { locale: ptBR })}</span><Select value={viewYear.toString()} onValueChange={y => { setViewYear(parseInt(y)); setCurrentDate(new Date(parseInt(y), currentDate.getMonth(), 1)); }}><SelectTrigger className="w-24 border-0 bg-transparent"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select></div>
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="w-5 h-5"/></Button>
      </div>

      <Card className="bg-white border-stone-100 overflow-hidden hidden md:block"><CardContent className="p-0"><div className="grid grid-cols-7 border-b border-stone-100">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className="p-3 text-center text-xs font-medium text-stone-500 uppercase tracking-wider">{d}</div>)}</div><div className="grid grid-cols-7">{days.map((date, i) => { const events = getEventsForDay(date); const isCurrent = isSameMonth(date, currentDate); const isToday = isSameDay(date, new Date()); return (<div key={i} className={`min-h-28 p-2 border-b border-r border-stone-100 ${!isCurrent ? 'bg-stone-50/50' : ''}`}><div className={`text-sm mb-1 ${isToday ? 'w-7 h-7 flex items-center justify-center bg-stone-800 text-white rounded-full mx-auto' : isCurrent ? 'text-stone-700' : 'text-stone-300'}`}>{format(date, 'd')}</div><div className="space-y-1">{events.slice(0, 4).map(e => (
          <div key={e.id} onClick={() => handleEventClick(e)} className={`text-[10px] px-1.5 py-0.5 rounded truncate text-white cursor-pointer hover:opacity-80 transition-opacity ${e.type==='return'?'bg-amber-500': (e.status === 'Realizado' ? 'bg-green-600 font-bold' : statusColors[e.status])}`}>
              {e.type==='return' && <span className="font-bold mr-1">R:</span>}{e.time && <span className="font-bold mr-1">{e.time}</span>}{e.title}
          </div>
      ))}</div></div>); })}</div></CardContent></Card>
      
      <div className="md:hidden space-y-4"><Card className="bg-white border-stone-100"><CardContent className="p-0"><div className="grid grid-cols-7 border-b border-stone-100">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d,i)=><div key={i} className="p-2 text-center text-xs text-stone-500">{d}</div>)}</div><div className="grid grid-cols-7">{days.map((date, i) => { const hasEvents = getEventsForDay(date).length > 0; const isCurrent = isSameMonth(date, currentDate); const isToday = isSameDay(date, new Date()); return (<div key={i} className={`min-h-14 p-1 border-b border-r border-stone-100 flex flex-col items-center ${!isCurrent?'bg-stone-50/50':''}`}><div className={`text-xs w-6 h-6 flex items-center justify-center ${isToday?'bg-stone-800 text-white rounded-full':isCurrent?'text-stone-700':'text-stone-300'}`}>{format(date, 'd')}</div>{hasEvents && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1"/>}</div>); })}</div></CardContent></Card><div className="space-y-2"><h3 className="text-sm font-medium text-stone-600">Eventos do Dia</h3>{getEventsForDay(new Date()).map(evt => <div key={evt.id} onClick={() => handleEventClick(evt)} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-stone-100 cursor-pointer hover:shadow-sm"><div className={`w-1 h-8 rounded-full ${evt.type==='return'?'bg-amber-500': (evt.status === 'Realizado' ? 'bg-green-600' : statusColors[evt.status])}`}/><div><p className={`text-sm font-medium ${evt.status === 'Realizado' ? 'text-green-700 font-bold' : ''}`}>{evt.title}</p><p className="text-xs text-stone-500">{evt.type==='return'?evt.desc:`${evt.time} - ${evt.status}`}</p></div></div>)}</div></div>

      <AppointmentModal 
        open={isAppointmentModalOpen} 
        onClose={() => { setIsAppointmentModalOpen(false); setEditingAppointment(null); }} 
        appointment={editingAppointment} 
        patients={patients} 
        procedures={procedures} 
        materials={materials} 
        allAppointments={appointments} 
        allInstallments={allInstallments}
        onSave={(data) => { if(editingAppointment?.id) updateMutation.mutate({ id: editingAppointment.id, data }); else createMutation.mutate(data); }} 
        isLoading={createMutation.isPending || updateMutation.isPending} 
      />
    </div>
  );
}