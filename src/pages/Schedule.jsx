import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());

  // 1. BUSCAR AGENDAMENTOS
  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const { data } = await supabase.from('appointments').select('*');
      return data || [];
    },
  });

  // 2. BUSCAR PACIENTES (Para pegar os retornos)
  const { data: patients = [] } = useQuery({
    queryKey: ['patients'],
    queryFn: async () => {
      const { data } = await supabase.from('patients').select('*');
      return data || [];
    },
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = [];
  let day = calendarStart;
  while (day <= calendarEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  // LÓGICA CENTRAL: Juntar Agendamentos + Retornos
  const getEventsForDay = (date) => {
    const dayEvents = [];

    // A. Adiciona Agendamentos
    appointments.forEach(apt => {
        if (apt.date && isSameDay(new Date(apt.date), date)) {
            dayEvents.push({
                id: `apt_${apt.id}`,
                type: 'appointment',
                title: apt.patient_name?.split(' ')[0], // Primeiro nome
                time: apt.time,
                status: apt.status,
                original: apt
            });
        }
    });

    // B. Adiciona Retornos de Pacientes
    patients.forEach(p => {
        // B1. Retorno Principal
        if (p.next_return_date && isSameDay(new Date(p.next_return_date), date)) {
            dayEvents.push({
                id: `ret_main_${p.id}`,
                type: 'return',
                title: p.full_name?.split(' ')[0],
                desc: 'Retorno',
                original: p
            });
        }
        // B2. Retornos Extras (Array)
        if (Array.isArray(p.scheduled_returns)) {
            p.scheduled_returns.forEach((ret, idx) => {
                if (ret.date && isSameDay(new Date(ret.date), date)) {
                    dayEvents.push({
                        id: `ret_extra_${p.id}_${idx}`,
                        type: 'return',
                        title: p.full_name?.split(' ')[0],
                        desc: ret.description || 'Retorno Extra',
                        original: p
                    });
                }
            });
        }
    });

    return dayEvents;
  };

  const statusColors = {
    'Agendado': 'bg-blue-500',
    'Confirmado': 'bg-emerald-500',
    'Realizado': 'bg-stone-500',
    'Cancelado': 'bg-rose-500',
  };

  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);

  const handleYearChange = (year) => {
    setViewYear(parseInt(year));
    setCurrentDate(new Date(parseInt(year), currentDate.getMonth(), 1));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        subtitle="Visualize agendamentos e retornos"
        action={
          <Link to={createPageUrl('Appointments') + '?action=new'}>
            <Button className="bg-stone-800 hover:bg-stone-900">
              <Plus className="w-4 h-4 mr-2" />
              Novo Agendamento
            </Button>
          </Link>
        }
      />

      {/* Navegação do Calendário */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-stone-100">
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-lg font-light text-stone-800 capitalize">
            {format(currentDate, 'MMMM', { locale: ptBR })}
          </span>
          <Select value={viewYear.toString()} onValueChange={handleYearChange}>
            <SelectTrigger className="w-24 border-0 bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Grid do Calendário (Desktop) */}
      <Card className="bg-white border-stone-100 overflow-hidden hidden md:block">
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b border-stone-100">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
              <div key={d} className="p-3 text-center text-xs font-medium text-stone-500 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((date, i) => {
              const events = getEventsForDay(date);
              const isCurrentMonth = isSameMonth(date, currentDate);
              const isToday = isSameDay(date, new Date());

              return (
                <div
                  key={i}
                  className={`min-h-28 p-2 border-b border-r border-stone-100 ${
                    !isCurrentMonth ? 'bg-stone-50/50' : ''
                  }`}
                >
                  <div className={`text-sm mb-1 ${
                    isToday 
                      ? 'w-7 h-7 flex items-center justify-center bg-stone-800 text-white rounded-full mx-auto'
                      : isCurrentMonth ? 'text-stone-700' : 'text-stone-300'
                  }`}>
                    {format(date, 'd')}
                  </div>
                  
                  <div className="space-y-1">
                    {events.slice(0, 4).map((evt) => (
                      <div
                        key={evt.id}
                        className={`text-[10px] px-1.5 py-0.5 rounded truncate text-white cursor-default
                            ${evt.type === 'appointment' ? (statusColors[evt.status] || 'bg-blue-400') : 'bg-amber-500'}
                        `}
                        title={evt.type === 'appointment' ? `Agendamento: ${evt.title}` : `Retorno: ${evt.title}`}
                      >
                        {/* Se for Agendamento mostra Hora, se for Retorno mostra ícone ou R */}
                        {evt.type === 'appointment' && evt.time && <span className="mr-1 font-bold">{evt.time}</span>}
                        {evt.type === 'return' && <span className="mr-1 font-bold">R:</span>}
                        {evt.title}
                      </div>
                    ))}
                    {events.length > 4 && (
                      <div className="text-[10px] text-stone-400 text-center">
                        +{events.length - 4} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Grid Mobile (Compacto) */}
      <div className="md:hidden space-y-4">
          <Card className="bg-white border-stone-100">
             <CardContent className="p-0">
                <div className="grid grid-cols-7 border-b border-stone-100">
                    {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d,i)=><div key={i} className="p-2 text-center text-xs text-stone-500">{d}</div>)}
                </div>
                <div className="grid grid-cols-7">
                    {days.map((date, i) => {
                        const events = getEventsForDay(date);
                        const isCurrent = isSameMonth(date, currentDate);
                        const isToday = isSameDay(date, new Date());
                        const hasEvents = events.length > 0;
                        return (
                            <div key={i} className={`min-h-14 p-1 border-b border-r border-stone-100 flex flex-col items-center ${!isCurrent?'bg-stone-50/50':''}`}>
                                <div className={`text-xs w-6 h-6 flex items-center justify-center ${isToday?'bg-stone-800 text-white rounded-full':isCurrent?'text-stone-700':'text-stone-300'}`}>{format(date, 'd')}</div>
                                {hasEvents && <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                                    {events.slice(0,3).map(e => <div key={e.id} className={`w-1.5 h-1.5 rounded-full ${e.type==='appointment'? (statusColors[e.status]||'bg-blue-500') : 'bg-amber-500'}`}/>)}
                                </div>}
                            </div>
                        )
                    })}
                </div>
             </CardContent>
          </Card>
          
          {/* Lista de Eventos do Mês (Mobile) */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-stone-600">Eventos do Mês</h3>
            {days.filter(d => isSameMonth(d, currentDate)).map(day => {
                const events = getEventsForDay(day);
                if(events.length === 0) return null;
                return (
                    <div key={day.toString()}>
                        {events.map(evt => (
                            <div key={evt.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-stone-100 mb-2">
                                <div className={`w-1 h-8 rounded-full ${evt.type==='appointment'?(statusColors[evt.status]||'bg-blue-500'):'bg-amber-500'}`}/>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-stone-800">{evt.title}</p>
                                    <p className="text-xs text-stone-500">{format(day, 'dd/MM')} • {evt.type==='appointment' ? `${evt.time} - ${evt.status}` : `Retorno: ${evt.desc}`}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            })}
          </div>
      </div>
      
      {/* Legenda */}
      <div className="flex flex-wrap gap-4 justify-center mt-4">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"/><span className="text-xs text-stone-500">Agendado</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"/><span className="text-xs text-stone-500">Confirmado</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"/><span className="text-xs text-stone-500">Retorno</span></div>
      </div>
    </div>
  );
}