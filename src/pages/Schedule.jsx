import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameDay, addMonths, subMonths, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());

  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*'); return data || []; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data || []; } });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = [];
  let day = calendarStart;
  while (day <= calendarEnd) { days.push(day); day = addDays(day, 1); }

  // --- LÓGICA DE EVENTOS (AGORA LÊ TUDO) ---
  const getEventsForDay = (date) => {
    const dayEvents = [];
    const checkDate = (d) => d && isSameDay(new Date(d + 'T12:00:00'), date);

    // 1. EVENTOS VINDOS DE ATENDIMENTOS (Appointments)
    appointments.forEach(apt => {
        // A. A Consulta em si
        if (checkDate(apt.date)) {
            dayEvents.push({ id: `apt_${apt.id}`, type: 'appointment', title: apt.patient_name?.split(' ')[0], time: apt.time, status: apt.status });
        }
        // B. Retorno Principal definido no Atendimento
        if (checkDate(apt.next_return_date)) {
            dayEvents.push({ id: `apt_ret_${apt.id}`, type: 'return', title: apt.patient_name?.split(' ')[0], desc: 'Retorno' });
        }
        // C. Retornos Adicionais definidos no Atendimento (O QUE FALTAVA)
        if (Array.isArray(apt.scheduled_returns)) {
            apt.scheduled_returns.forEach((ret, i) => {
                if (checkDate(ret.date)) {
                    dayEvents.push({ id: `apt_extra_${apt.id}_${i}`, type: 'return', title: apt.patient_name?.split(' ')[0], desc: ret.description || 'Extra' });
                }
            });
        }
    });

    // 2. EVENTOS VINDOS DO CADASTRO DE PACIENTE (Patients)
    patients.forEach(p => {
        // A. Retorno Principal do Perfil
        if (checkDate(p.next_return_date)) {
            dayEvents.push({ id: `pat_ret_${p.id}`, type: 'return', title: p.full_name?.split(' ')[0], desc: 'Retorno (P)' });
        }
        // B. Retornos Adicionais do Perfil
        if (Array.isArray(p.scheduled_returns)) {
            p.scheduled_returns.forEach((ret, i) => {
                if (checkDate(ret.date)) {
                    dayEvents.push({ id: `pat_extra_${p.id}_${i}`, type: 'return', title: p.full_name?.split(' ')[0], desc: ret.description || 'Extra' });
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
      <Card className="bg-white border-stone-100 overflow-hidden hidden md:block"><CardContent className="p-0"><div className="grid grid-cols-7 border-b border-stone-100">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className="p-3 text-center text-xs font-medium text-stone-500 uppercase tracking-wider">{d}</div>)}</div><div className="grid grid-cols-7">{days.map((date, i) => { const events = getEventsForDay(date); const isCurrent = isSameMonth(date, currentDate); const isToday = isSameDay(date, new Date()); return (<div key={i} className={`min-h-28 p-2 border-b border-r border-stone-100 ${!isCurrent ? 'bg-stone-50/50' : ''}`}><div className={`text-sm mb-1 ${isToday ? 'w-7 h-7 flex items-center justify-center bg-stone-800 text-white rounded-full mx-auto' : isCurrent ? 'text-stone-700' : 'text-stone-300'}`}>{format(date, 'd')}</div><div className="space-y-1">{events.slice(0, 4).map(e => <div key={e.id} className={`text-[10px] px-1.5 py-0.5 rounded truncate text-white ${e.type==='return'?'bg-amber-500':statusColors[e.status]}`}>{e.type==='return' && <span className="font-bold mr-1">R:</span>}{e.time && <span className="font-bold mr-1">{e.time}</span>}{e.title}</div>)}</div></div>); })}</div></CardContent></Card>
      <div className="md:hidden space-y-4"><Card className="bg-white border-stone-100"><CardContent className="p-0"><div className="grid grid-cols-7 border-b border-stone-100">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d,i)=><div key={i} className="p-2 text-center text-xs text-stone-500">{d}</div>)}</div><div className="grid grid-cols-7">{days.map((date, i) => { const hasEvents = getEventsForDay(date).length > 0; const isCurrent = isSameMonth(date, currentDate); const isToday = isSameDay(date, new Date()); return (<div key={i} className={`min-h-14 p-1 border-b border-r border-stone-100 flex flex-col items-center ${!isCurrent?'bg-stone-50/50':''}`}><div className={`text-xs w-6 h-6 flex items-center justify-center ${isToday?'bg-stone-800 text-white rounded-full':isCurrent?'text-stone-700':'text-stone-300'}`}>{format(date, 'd')}</div>{hasEvents && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1"/>}</div>); })}</div></CardContent></Card><div className="space-y-2"><h3 className="text-sm font-medium text-stone-600">Eventos do Dia</h3>{getEventsForDay(new Date()).map(evt => <div key={evt.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-stone-100"><div className={`w-1 h-8 rounded-full ${evt.type==='return'?'bg-amber-500':statusColors[evt.status]}`}/><div><p className="text-sm font-medium">{evt.title}</p><p className="text-xs text-stone-500">{evt.type==='return'?evt.desc:`${evt.time} - ${evt.status}`}</p></div></div>)}</div></div>
    </div>
  );
}