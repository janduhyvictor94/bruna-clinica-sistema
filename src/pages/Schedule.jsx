import React, { useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus, Clock, Calendar as CalIcon } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { AppointmentModal } from './Appointments';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { ScrollArea } from "@/components/ui/scroll-area"; // <--- ESTA IMPORTAÇÃO ESTAVA FALTANDO

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const queryClient = useQueryClient();

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, patients(full_name)')
        .order('date', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Mutation para mudar status rápido na agenda
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast.success('Status atualizado!');
    },
    onError: (e) => toast.error('Erro ao atualizar: ' + e.message)
  });

  const monthEvents = useMemo(() => {
      return appointments.filter(a => isSameMonth(parseISO(a.date), currentDate));
  }, [appointments, currentDate]);

  const getEventsForDay = (date) => {
      return appointments.filter(a => isSameDay(parseISO(a.date), date));
  };

  const calendarDays = useMemo(() => {
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));
      const days = [];
      let day = start;
      while (day <= end) { days.push(day); day = addDays(day, 1); }
      return days;
  }, [currentDate]);

  const handleOpen = (appt) => {
      setEditingAppointment(appt);
      setIsModalOpen(true);
  };

  const statusColor = (s) => {
      if(s==='Confirmado') return 'bg-green-600 border-green-600';
      if(s==='Cancelado') return 'bg-red-500 border-red-500';
      if(s==='Realizado') return 'bg-stone-500 border-stone-500';
      return 'bg-blue-500 border-blue-500';
  };

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
      <PageHeader 
        title="Agenda" 
        subtitle="Calendário mensal" 
        action={<Button onClick={() => { setEditingAppointment(null); setIsModalOpen(true); }} className="bg-stone-800"><Plus className="w-4 h-4 mr-2"/> Novo</Button>} 
      />
      
      <div className="flex flex-col lg:flex-row gap-6 h-full">
          
          {/* BARRA LATERAL */}
          <Card className="w-full lg:w-80 flex flex-col bg-white h-full border-stone-200 shadow-sm">
              <div className="p-4 border-b border-stone-100 bg-stone-50">
                  <h3 className="font-bold text-stone-700 text-sm flex items-center gap-2">
                      <CalIcon className="w-4 h-4"/> Lista de {format(currentDate, 'MMMM', {locale: ptBR})}
                  </h3>
              </div>
              <ScrollArea className="flex-1">
                  <div className="divide-y divide-stone-100">
                      {monthEvents.length > 0 ? monthEvents.map(evt => (
                          <div key={evt.id} className="p-3 hover:bg-stone-50 transition-colors flex items-start gap-3 group">
                              <div className="flex flex-col items-center min-w-[40px] bg-stone-100 rounded p-1">
                                  <span className="text-xs font-bold text-stone-600">{format(parseISO(evt.date), 'dd')}</span>
                                  <span className="text-[10px] text-stone-400 uppercase">{format(parseISO(evt.date), 'EEE', {locale: ptBR})}</span>
                              </div>
                              <div className="flex-1 min-w-0" onClick={() => handleOpen(evt)}>
                                  <p className="text-sm font-bold text-stone-800 line-clamp-1 cursor-pointer hover:underline">
                                    {evt.patients?.full_name || 'Paciente s/ nome'}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="outline" className="text-[10px] h-5">{evt.time}</Badge>
                                      {/* Status Clicável na Lista Lateral */}
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <span className={`cursor-pointer text-[10px] px-2 py-0.5 rounded-full text-white ${statusColor(evt.status)}`}>
                                                {evt.status}
                                            </span>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            {['Agendado', 'Confirmado', 'Realizado', 'Cancelado'].map(s => (
                                                <DropdownMenuItem key={s} onClick={() => updateStatusMutation.mutate({id: evt.id, status: s})}>
                                                    {s}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                  </div>
                              </div>
                          </div>
                      )) : <p className="text-center text-xs text-stone-400 py-10">Sem agendamentos.</p>}
                  </div>
              </ScrollArea>
          </Card>

          {/* CALENDÁRIO */}
          <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between bg-white p-2 px-4 rounded-xl border border-stone-200">
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="w-5 h-5"/></Button>
                <span className="text-lg font-bold text-stone-800 capitalize">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</span>
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="w-5 h-5"/></Button>
              </div>

              <div className="flex-1 bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col shadow-sm">
                  <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className="p-3 text-center text-xs font-bold text-stone-500 uppercase">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 flex-1 auto-rows-fr">
                      {calendarDays.map((day, i) => {
                          const isCurrentMonth = isSameMonth(day, currentDate);
                          const isToday = isSameDay(day, new Date());
                          const dayEvents = getEventsForDay(day);
                          return (
                              <div key={i} className={`min-h-[100px] border-b border-r border-stone-100 p-1 relative hover:bg-stone-50 transition-colors ${!isCurrentMonth ? 'bg-stone-50/50' : ''}`} 
                                   onClick={() => { setEditingAppointment(null); setIsModalOpen(true); }}>
                                  <div className={`text-xs font-medium mb-1 flex justify-center`}>
                                      <span className={`w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-stone-900 text-white' : isCurrentMonth ? 'text-stone-700' : 'text-stone-300'}`}>
                                          {format(day, 'd')}
                                      </span>
                                  </div>
                                  <div className="space-y-1">
                                      {dayEvents.map(ev => (
                                          <DropdownMenu key={ev.id}>
                                            <DropdownMenuTrigger asChild>
                                                <div 
                                                    className={`text-[10px] px-1.5 py-1 rounded truncate text-white cursor-pointer hover:opacity-90 shadow-sm border-l-2 ${statusColor(ev.status)}`}
                                                    onClick={(e) => e.stopPropagation()} // Impede abrir modal de criar novo
                                                >
                                                    <span className="font-bold mr-1">{ev.time}</span>
                                                    {ev.patients?.full_name || 'Paciente'}
                                                </div>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start">
                                                <div className="px-2 py-1 text-xs font-bold text-stone-500 border-b mb-1">{ev.patients?.full_name}</div>
                                                <DropdownMenuItem onClick={() => handleOpen(ev)}>📝 Editar / Ver Detalhes</DropdownMenuItem>
                                                {['Agendado', 'Confirmado', 'Realizado', 'Cancelado'].map(s => (
                                                    <DropdownMenuItem key={s} onClick={() => updateStatusMutation.mutate({id: ev.id, status: s})}>
                                                        Mudar para: {s}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                      ))}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          </div>
      </div>

      <AppointmentModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        initialData={editingAppointment}
        onSave={() => {}} 
      />
    </div>
  );
}