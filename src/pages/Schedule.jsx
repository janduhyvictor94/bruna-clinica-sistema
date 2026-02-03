import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, 
  Lock, Unlock, Ban, Settings, Clock, X, AlertCircle, Trash2 
} from 'lucide-react';
import { 
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
  addDays, isSameMonth, isSameDay, addMonths, subMonths, 
  parseISO 
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppointmentModal } from './Appointments';
import { toast } from 'sonner';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CREDIT_METHODS = ['Cartão de Crédito PJ', 'Cartão de Crédito PF'];

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Modais de Agendamento
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  
  // Modais e Estados de Configuração
  const [isConfigMode, setIsConfigMode] = useState(false); 
  const [isDayConfigOpen, setIsDayConfigOpen] = useState(false);
  const [selectedConfigDate, setSelectedConfigDate] = useState(null);

  const queryClient = useQueryClient();

  // --- QUERIES ---
  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, patients(full_name), installments(*)')
        .order('date', { ascending: true })
        .order('time', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: blockedDays = [] } = useQuery({
    queryKey: ['blocked_days'],
    queryFn: async () => {
      const { data } = await supabase.from('blocked_days').select('*');
      return data || [];
    },
  });

  const { data: dayConfigs = [] } = useQuery({
    queryKey: ['day_configurations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('day_configurations').select('*, agenda_templates(name, slots_json)');
      return data || [];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['agenda_templates'],
    queryFn: async () => {
      const { data } = await supabase.from('agenda_templates').select('*');
      return data || [];
    },
  });

  // --- MUTAÇÕES ---
  const toggleBlockMutation = useMutation({
    mutationFn: async ({ date, isBlocked, id }) => {
        if (isBlocked) {
            await supabase.from('blocked_days').delete().eq('id', id);
        } else {
            await supabase.from('blocked_days').insert([{ date: date }]);
        }
    },
    onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: ['blocked_days'] });
        toast.success(variables.isBlocked ? 'Dia desbloqueado' : 'Dia bloqueado');
    },
    onError: (e) => toast.error('Erro: ' + e.message)
  });

  // --- CALCULOS ---
  const monthEvents = useMemo(() => {
      return appointments
          .filter(a => a.date && isSameMonth(parseISO(a.date), currentDate))
          .sort((a, b) => {
              const dateA = new Date(`${a.date}T${a.time}`);
              const dateB = new Date(`${b.date}T${b.time}`);
              return dateA - dateB;
          });
  }, [appointments, currentDate]);

  const daysOfMonthList = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = [];
    let day = start;
    while (day <= end) { days.push(day); day = addDays(day, 1); }
    return days;
  }, [currentDate]);

  const calendarDays = useMemo(() => {
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));
      const days = [];
      let day = start;
      while (day <= end) { days.push(day); day = addDays(day, 1); }
      return days;
  }, [currentDate]);

  const getEventsForDay = (date) => {
      return appointments.filter(a => a.date && isSameDay(parseISO(a.date), date));
  };

  // --- HANDLERS ---
  const handleDayClick = (dateStr, isBlocked) => {
    if (isBlocked && !isConfigMode) return; 
    
    if (isConfigMode) {
        setSelectedConfigDate(dateStr);
        setIsDayConfigOpen(true);
    } else {
        setEditingAppointment({ date: dateStr });
        setIsModalOpen(true);
    }
  };

  const handleQuickSchedule = (dateStr, timeStr) => {
      setEditingAppointment({ date: dateStr, time: timeStr });
      setIsModalOpen(true);
  };

  const handleOpen = (appt) => {
      setEditingAppointment(appt);
      setIsModalOpen(true);
  };

  const handleToggleBlock = (e, day, blockedInfo) => {
    e.stopPropagation(); 
    const dateStr = format(day, 'yyyy-MM-dd');
    toggleBlockMutation.mutate({ date: dateStr, isBlocked: !!blockedInfo, id: blockedInfo?.id });
  };

  const getEventStyle = (appt) => {
      const s = appt.status;
      const t = appt.type;
      if (s === 'Não Compareceu' || s === 'Cancelado') return 'bg-red-50 text-red-700 border-l-4 border-red-500 opacity-60';
      if (s === 'Desmarcado') return 'bg-stone-100 text-stone-700 border-l-4 border-stone-500 opacity-60';
      if (s === 'Realizado Pago') return 'bg-emerald-100 text-emerald-900 border-l-4 border-emerald-600';
      if (s === 'Realizado a Pagar') return 'bg-orange-100 text-orange-800 border-l-4 border-orange-500';
      if (s === 'Realizado (Em Andamento)') return 'bg-indigo-100 text-indigo-800 border-l-4 border-indigo-500';
      if (s === 'Realizado') return 'bg-cyan-100 text-cyan-800 border-l-4 border-cyan-500';
      if (s === 'Confirmado') return 'bg-lime-100 text-lime-800 border-l-4 border-lime-500';
      if (t === 'Novo') return 'bg-blue-100 text-blue-800 border-l-4 border-blue-500';
      return 'bg-purple-100 text-purple-800 border-l-4 border-purple-500';
  };

  const handleDeleteAppointment = async (id) => {
    try {
        await supabase.from('stock_movements').delete().eq('appointment_id', id);
        await supabase.from('installments').delete().eq('appointment_id', id);
        await supabase.from('appointments').delete().eq('id', id);
        queryClient.invalidateQueries();
        toast.success('Atendimento excluído');
    } catch (error) { toast.error(error.message); }
  };

  const handleSaveAppointment = async (data) => {
    try {
        const { id, returns_to_create, custom_installments, ...rawData } = data;
        let totalPaidReal = 0;
        rawData.payment_methods.forEach(pm => {
            const isCreditCard = CREDIT_METHODS.includes(pm.method);
            const isScheduled = pm.method === 'Agendamento de Pagamento';
            if (!isScheduled && !isCreditCard) { 
                const rawValue = Number(pm.value) || 0;
                const discPercent = Number(pm.discount_percent) || 0;
                totalPaidReal += (rawValue - (rawValue * (discPercent / 100)));
            }
        });
        const totalMaterials = rawData.materials_json.reduce((acc, curr) => acc + ((Number(curr.cost) || 0) * (Number(curr.quantity) || 1)), 0);
        const profit = totalPaidReal - totalMaterials;
        
        const payload = {
            patient_id: rawData.patient_id, date: rawData.date, time: rawData.time, status: rawData.status,
            type: rawData.type, notes: rawData.notes, service_type_custom: rawData.service_type_custom, 
            payment_methods_json: rawData.payment_methods, procedures_json: rawData.procedures_json, 
            materials_json: rawData.materials_json, total_amount: Number(rawData.total_amount)||0, 
            cost_amount: Number(rawData.cost_amount)||0, profit_amount: profit, discount_percent: Number(rawData.discount_percent)||0
        };

        if (id) await supabase.from('appointments').update(payload).eq('id', id);
        else await supabase.from('appointments').insert([payload]);
        
        queryClient.invalidateQueries();
        setIsModalOpen(false);
        toast.success('Salvo!');
    } catch (error) { toast.error(error.message); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] w-full max-w-[1600px] mx-auto space-y-4">
      <PageHeader 
        title="Agenda" 
        subtitle={isConfigMode ? "Modo de Configuração de Horários" : "Visão Mensal de Agendamentos"} 
        action={
            <div className="flex gap-2">
                <Button 
                    variant={isConfigMode ? "default" : "outline"} 
                    className={isConfigMode ? "bg-purple-600 hover:bg-purple-700 text-white border-purple-600" : ""}
                    onClick={() => setIsConfigMode(!isConfigMode)}
                >
                    <Settings className="w-4 h-4 mr-2" />
                    {isConfigMode ? "Sair da Configuração" : "Configurar Slots"}
                </Button>
                <Button onClick={() => { setEditingAppointment(null); setIsModalOpen(true); }} className="bg-stone-800"><Plus className="w-4 h-4 mr-2"/> Novo</Button>
            </div>
        } 
      />
      
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          
          <Card className="w-full lg:w-80 flex flex-col bg-white h-full border-stone-200 shadow-sm shrink-0 overflow-hidden">
              <div className="flex flex-col h-1/2 border-b border-stone-200">
                  <div className="p-4 border-b border-stone-100 bg-stone-50">
                      <h3 className="font-bold text-stone-700 text-sm flex items-center gap-2">
                          <CalIcon className="w-4 h-4"/> Agendamentos ({monthEvents.length})
                      </h3>
                  </div>
                  <ScrollArea className="flex-1">
                      <div className="divide-y divide-stone-100">
                          {monthEvents.length > 0 ? monthEvents.map(evt => (
                              <div key={evt.id} className="p-3 hover:bg-stone-50 transition-colors flex items-start gap-3 group cursor-pointer" onClick={() => handleOpen(evt)}>
                                  <div className="flex flex-col items-center min-w-[40px] bg-stone-100 rounded p-1">
                                      <span className="text-xs font-bold text-stone-600">{evt.date ? format(parseISO(evt.date), 'dd') : ''}</span>
                                      <span className="text-[10px] text-stone-400 uppercase">{evt.date ? format(parseISO(evt.date), 'EEE', {locale: ptBR}) : ''}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <p className="text-sm font-bold text-stone-800 line-clamp-1 group-hover:text-blue-600 transition-colors">
                                        {evt.patients?.full_name || 'Paciente s/ nome'}
                                      </p>
                                      <div className="flex items-center gap-2 mt-1">
                                          <Badge variant="outline" className="text-[10px] h-5">{evt.time}</Badge>
                                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border 
                                            ${evt.status === 'Confirmado' ? 'bg-lime-100 text-lime-800 border-lime-200' :
                                              (evt.status === 'Cancelado' || evt.status === 'Não Compareceu') ? 'bg-red-50 text-red-700 border-red-200' :
                                              evt.status === 'Desmarcado' ? 'bg-stone-100 text-stone-700 border-stone-300' :
                                              evt.status === 'Realizado Pago' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                              evt.status === 'Realizado a Pagar' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                              evt.status === 'Realizado (Em Andamento)' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                                              evt.status === 'Realizado' ? 'bg-cyan-100 text-cyan-700 border-cyan-200' :
                                              evt.type === 'Novo' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                              'bg-purple-100 text-purple-700 border-purple-200'
                                            }`}>
                                              {evt.status === 'Agendado' ? evt.type : evt.status}
                                          </span>
                                      </div>
                                  </div>
                              </div>
                          )) : <p className="text-center text-xs text-stone-400 py-10">Sem agendamentos.</p>}
                      </div>
                  </ScrollArea>
              </div>

              <div className="flex flex-col h-1/2 bg-stone-50/50">
                  <div className="p-4 border-b border-stone-100 bg-stone-100">
                      <h3 className="font-bold text-stone-700 text-sm flex items-center gap-2">
                          <Clock className="w-4 h-4"/> Disponibilidade / Slots
                      </h3>
                  </div>
                  <ScrollArea className="flex-1">
                      <div className="divide-y divide-stone-100 pb-4">
                          {daysOfMonthList.map((day) => {
                              const dateStr = format(day, 'yyyy-MM-dd');
                              const dayConfig = dayConfigs.find(c => c.date === dateStr);
                              const dayAppts = monthEvents.filter(a => a.date === dateStr);
                              const isToday = isSameDay(day, new Date());
                              
                              const configuredSlots = dayConfig?.slots_json || dayConfig?.agenda_templates?.slots_json || [];

                              return (
                                  <div key={dateStr} className={`p-3 group ${isToday ? 'bg-blue-50/50' : ''}`}>
                                      <div className="flex items-center justify-between mb-2">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-stone-800">{format(day, 'dd/MM')}</span>
                                            <span className="text-[10px] font-bold text-stone-400 uppercase">{format(day, 'EEEE', {locale: ptBR})}</span>
                                          </div>
                                          {isConfigMode && (
                                              <Button variant="ghost" size="icon" className="h-4 w-4 text-stone-300 hover:text-purple-600" onClick={() => handleDayClick(dateStr, false)}>
                                                  <Settings className="w-3 h-3"/>
                                              </Button>
                                          )}
                                      </div>

                                      <div className="space-y-1.5 pl-2 border-l-2 border-stone-200">
                                          {configuredSlots.length > 0 ? (
                                              configuredSlots.map((slot, idx) => {
                                                  // Verifica se o slot está ocupado
                                                  const occupiedAppt = dayAppts.find(appt => 
                                                    appt.time === slot.time && 
                                                    appt.status !== 'Cancelado' && 
                                                    appt.status !== 'Desmarcado' && 
                                                    appt.status !== 'Não Compareceu'
                                                  );
                                                  const isOccupied = !!occupiedAppt;

                                                  return (
                                                      <div 
                                                        key={idx} 
                                                        className={`flex justify-between items-center border rounded px-2 py-1.5 shadow-sm transition-all
                                                            ${isOccupied 
                                                                ? 'bg-red-50 border-red-200 text-red-800' // Estilo Ocupado
                                                                : 'bg-white border-stone-200 text-stone-700 hover:border-blue-300' // Estilo Livre
                                                            }
                                                        `}
                                                      >
                                                          <div className="flex flex-col min-w-0">
                                                              <div className="flex items-center gap-2">
                                                                  <span className="text-[11px] font-bold">{slot.time}</span>
                                                                  <span className="text-[10px] truncate max-w-[100px] opacity-80">{slot.label}</span>
                                                              </div>
                                                              {isOccupied && (
                                                                  <div className="text-[9px] font-medium flex items-center gap-1 mt-0.5">
                                                                      <AlertCircle className="w-2.5 h-2.5"/> 
                                                                      <span className="truncate max-w-[110px]">{occupiedAppt.patients?.full_name}</span>
                                                                  </div>
                                                              )}
                                                          </div>

                                                          {isOccupied ? (
                                                              <div className="flex items-center gap-1">
                                                                  <Badge variant="outline" className="text-[8px] bg-red-100 border-red-200 text-red-600 h-5 px-1.5 hidden xl:flex">
                                                                      Ocupado
                                                                  </Badge>
                                                                  <Button 
                                                                    size="icon" 
                                                                    variant="ghost" 
                                                                    className="h-6 w-6 rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-700"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if(window.confirm('Deseja liberar este horário? O agendamento será excluído.')) {
                                                                            handleDeleteAppointment(occupiedAppt.id);
                                                                        }
                                                                    }}
                                                                    title="Excluir Agendamento"
                                                                  >
                                                                      <Trash2 className="w-3.5 h-3.5" />
                                                                  </Button>
                                                              </div>
                                                          ) : (
                                                              <Button 
                                                                size="icon" 
                                                                variant="ghost" 
                                                                className="h-6 w-6 rounded-full bg-stone-100 hover:bg-blue-100 text-stone-400 hover:text-blue-600"
                                                                onClick={() => handleQuickSchedule(dateStr, slot.time)}
                                                                title="Agendar neste horário"
                                                              >
                                                                  <Plus className="w-3.5 h-3.5" />
                                                              </Button>
                                                          )}
                                                      </div>
                                                  );
                                              })
                                          ) : (
                                              <span className="text-[10px] text-stone-400 italic block pl-1">
                                                  Nada configurado
                                              </span>
                                          )}
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </ScrollArea>
              </div>
          </Card>

          <div className="flex-1 flex flex-col gap-4 min-w-0">
              <div className="flex items-center justify-between bg-white p-2 px-4 rounded-xl border border-stone-200 shadow-sm shrink-0">
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="w-5 h-5"/></Button>
                <span className="text-lg font-bold text-stone-800 capitalize">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</span>
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="w-5 h-5"/></Button>
              </div>

              <div className="flex-1 bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col shadow-sm relative">
                  {isConfigMode && (
                      <div className="bg-purple-600 text-white text-xs py-1 text-center font-bold tracking-wider uppercase animate-in slide-in-from-top-2">
                          Modo de Configuração Ativo
                      </div>
                  )}

                  <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50 shrink-0">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className="p-3 text-center text-xs font-bold text-stone-500 uppercase">{d}</div>)}
                  </div>
                  
                  <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-7 min-h-full auto-rows-fr pb-10">
                        {calendarDays.map((day, i) => {
                            const dateKey = format(day, 'yyyy-MM-dd');
                            const isCurrentMonth = isSameMonth(day, currentDate);
                            const isToday = isSameDay(day, new Date());
                            const dayEvents = getEventsForDay(day);
                            
                            const blockedInfo = blockedDays.find(b => b.date === dateKey);
                            const isBlocked = !!blockedInfo;
                            
                            const dayConfig = dayConfigs.find(c => c.date === dateKey);
                            const slots = dayConfig?.slots_json || dayConfig?.agenda_templates?.slots_json || [];
                            const ghostSlots = slots.filter(slot => {
                                const isOccupied = dayEvents.some(appt => appt.time === slot.time && appt.status !== 'Cancelado');
                                return !isOccupied;
                            });

                            return (
                                <div key={i} 
                                    className={`
                                            min-h-[120px] border-b border-r border-stone-100 p-1 relative transition-colors 
                                            ${!isCurrentMonth ? 'bg-stone-50/40' : 'bg-white'} 
                                            ${isBlocked ? 'bg-stone-100 bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,0.05)_25%,rgba(0,0,0,0.05)_50%,transparent_50%,transparent_75%,rgba(0,0,0,0.05)_75%,rgba(0,0,0,0.05)_100%)] bg-[length:10px_10px]' : 'hover:bg-stone-50'}
                                            ${isConfigMode && isCurrentMonth ? 'cursor-alias hover:bg-purple-50 ring-inset hover:ring-2 ring-purple-200' : ''}
                                    `}
                                    onClick={(e) => { 
                                        if(e.target === e.currentTarget || isConfigMode) {
                                            handleDayClick(dateKey, isBlocked);
                                        }
                                    }}>
                                    
                                    <div className="flex justify-between items-start mb-1">
                                        <div className={`text-xs font-medium flex justify-center`}>
                                            <span className={`w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-stone-900 text-white' : isCurrentMonth ? 'text-stone-700' : 'text-stone-300'}`}>
                                                {format(day, 'd')}
                                            </span>
                                        </div>
                                        
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button 
                                                        onClick={(e) => handleToggleBlock(e, day, blockedInfo)}
                                                        className={`p-1 rounded transition-all opacity-40 hover:opacity-100 ${isBlocked ? 'text-stone-600 opacity-100' : 'text-stone-300 hover:text-red-400'}`}
                                                    >
                                                        {isBlocked ? <Lock className="w-3 h-3"/> : <Unlock className="w-3 h-3"/>}
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent><p>{isBlocked ? "Desbloquear Dia" : "Bloquear Dia"}</p></TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>

                                    {!isBlocked && ghostSlots.length > 0 && (
                                        <div className="mb-1 space-y-0.5 pointer-events-none opacity-60">
                                            {ghostSlots.slice(0, 3).map((slot, idx) => (
                                                <div key={idx} className="text-[9px] text-stone-400 px-1 border border-dashed border-stone-100 rounded flex justify-between select-none">
                                                    <span>{slot.time}</span>
                                                    <span className="truncate max-w-[50px]">{slot.label}</span>
                                                </div>
                                            ))}
                                            {ghostSlots.length > 3 && <div className="text-[8px] text-stone-300 text-center">+{ghostSlots.length - 3} livres</div>}
                                        </div>
                                    )}

                                    <div className="space-y-1 relative z-10">
                                        {isBlocked ? (
                                            <div className="flex flex-col items-center justify-center h-full py-2 opacity-50 select-none">
                                                <Ban className="w-4 h-4 text-stone-400 mb-1"/>
                                                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Fechado</span>
                                            </div>
                                        ) : (
                                            dayEvents.map(ev => (
                                                <div 
                                                    key={ev.id}
                                                    className={`text-[10px] px-1.5 py-1 rounded truncate shadow-sm border-l-2 cursor-pointer transition-transform active:scale-95 ${getEventStyle(ev)}`}
                                                    onClick={(e) => { e.stopPropagation(); handleOpen(ev); }}
                                                    title={`${ev.time} - ${ev.patients?.full_name} (${ev.status})`}
                                                >
                                                    <span className="font-bold mr-1">{ev.time}</span>
                                                    {ev.patients?.full_name || 'S/ Nome'}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                  </div>
              </div>
          </div>
      </div>
      
      <AppointmentModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        initialData={editingAppointment} 
        onSave={handleSaveAppointment} 
        onDelete={handleDeleteAppointment}
      />

      <DayConfigModal
        open={isDayConfigOpen}
        onOpenChange={setIsDayConfigOpen}
        date={selectedConfigDate}
        dayConfig={dayConfigs.find(c => c.date === selectedConfigDate)}
        templates={templates}
        queryClient={queryClient}
      />
    </div>
  );
}

function DayConfigModal({ open, onOpenChange, date, dayConfig, templates, queryClient }) {
    const [activeTab, setActiveTab] = useState('template');
    const [selectedTemplateId, setSelectedTemplateId] = useState('none'); 
    const [manualSlots, setManualSlots] = useState([]);
    const [newSlotTime, setNewSlotTime] = useState('');
    const [newSlotLabel, setNewSlotLabel] = useState('');
    const [newTemplateName, setNewTemplateName] = useState('');

    useEffect(() => {
        if (open && date) {
            if (dayConfig) {
                if (dayConfig.template_id) {
                    setSelectedTemplateId(dayConfig.template_id.toString());
                    setActiveTab('template');
                    setManualSlots([]); 
                } else {
                    setSelectedTemplateId('none');
                    setManualSlots(dayConfig.slots_json || []);
                    setActiveTab('manual');
                }
            } else {
                setSelectedTemplateId('none');
                setManualSlots([]);
            }
        }
    }, [open, date, dayConfig]);

    const saveConfig = async () => {
        const templateIdToSave = (activeTab === 'template' && selectedTemplateId && selectedTemplateId !== 'none') 
            ? parseInt(selectedTemplateId) 
            : null;

        const payload = {
            date,
            template_id: templateIdToSave,
            slots_json: activeTab === 'manual' ? manualSlots : [],
        };
        const { error } = await supabase.from('day_configurations').upsert(payload, { onConflict: 'date' });
        if (error) toast.error(error.message);
        else {
            queryClient.invalidateQueries({ queryKey: ['day_configurations'] });
            toast.success('Configuração salva!');
            onOpenChange(false);
        }
    };

    const addManualSlot = () => {
        if (!newSlotTime || !newSlotLabel) return;
        const newSlots = [...manualSlots, { time: newSlotTime, label: newSlotLabel }].sort((a,b) => a.time.localeCompare(b.time));
        setManualSlots(newSlots);
        setNewSlotTime('');
        setNewSlotLabel('');
    };

    const removeManualSlot = (idx) => { setManualSlots(manualSlots.filter((_, i) => i !== idx)); };

    const saveAsTemplate = async () => {
        if (!newTemplateName || manualSlots.length === 0) return toast.error("Defina slots e um nome.");
        const { error } = await supabase.from('agenda_templates').insert([{ name: newTemplateName, slots_json: manualSlots }]);
        if (error) toast.error(error.message);
        else {
            queryClient.invalidateQueries({ queryKey: ['agenda_templates'] });
            toast.success('Modelo criado!');
            setNewTemplateName('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Configurar Dia {date && format(parseISO(date), 'dd/MM/yyyy')}</DialogTitle>
                    <DialogDescription>Defina a estrutura de horários para este dia.</DialogDescription>
                </DialogHeader>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="template">Usar Modelo</TabsTrigger><TabsTrigger value="manual">Personalizar</TabsTrigger></TabsList>
                    <TabsContent value="template" className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Selecione um Modelo</Label>
                            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                                <SelectTrigger><SelectValue placeholder="Escolha um padrão..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Nenhum (Dia Livre)</SelectItem>
                                    {templates.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </TabsContent>
                    <TabsContent value="manual" className="space-y-4 py-4">
                        <div className="flex gap-2 items-end">
                            <div className="w-24"><Label>Hora</Label><Input type="time" value={newSlotTime} onChange={e => setNewSlotTime(e.target.value)} /></div>
                            <div className="flex-1"><Label>Etiqueta</Label><Input placeholder="Procedimento..." value={newSlotLabel} onChange={e => setNewSlotLabel(e.target.value)} /></div>
                            <Button size="icon" onClick={addManualSlot} className="bg-stone-800"><Plus className="w-4 h-4"/></Button>
                        </div>
                        <div className="bg-stone-50 rounded border border-stone-100 h-40 overflow-y-auto p-2 space-y-1">
                            {manualSlots.map((slot, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-white p-2 rounded shadow-sm text-sm border border-stone-100"><span><strong>{slot.time}</strong> - {slot.label}</span><X className="w-3 h-3 cursor-pointer text-stone-400 hover:text-red-500" onClick={() => removeManualSlot(idx)}/></div>
                            ))}
                        </div>
                        {manualSlots.length > 0 && (<div className="flex gap-2 items-center pt-2 border-t border-stone-100 bg-purple-50 p-2 rounded"><Input placeholder="Nome para salvar como modelo..." value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} className="text-xs h-8 bg-white"/><Button size="sm" variant="outline" className="h-8 text-xs border-purple-200 text-purple-700 hover:bg-purple-100" onClick={saveAsTemplate}>Salvar como Modelo</Button></div>)}
                    </TabsContent>
                </Tabs>
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={saveConfig} className="bg-purple-600 hover:bg-purple-700 text-white">Salvar Configuração</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}