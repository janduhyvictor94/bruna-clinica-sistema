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
  parseISO, addMinutes 
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
  
  // Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  
  // Configuração
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

  // --- CÁLCULOS ---
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
        
        setIsModalOpen(false);
        setEditingAppointment(null);
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
            patient_id: rawData.patient_id, 
            date: rawData.date, 
            time: rawData.time, 
            end_time: rawData.end_time,
            status: rawData.status,
            type: rawData.type, 
            notes: rawData.notes, 
            service_type_custom: rawData.service_type_custom, 
            payment_methods_json: rawData.payment_methods, 
            procedures_json: rawData.procedures_json, 
            materials_json: rawData.materials_json, 
            total_amount: Number(rawData.total_amount)||0, 
            cost_amount: Number(rawData.cost_amount)||0, 
            profit_amount: profit, 
            discount_percent: Number(rawData.discount_percent)||0
        };

        if (id) await supabase.from('appointments').update(payload).eq('id', id);
        else await supabase.from('appointments').insert([payload]);

        if (returns_to_create && returns_to_create.length > 0) {
            const returnsPayload = returns_to_create.map(ret => {
                const returnTime = (ret.time && ret.time.trim() !== '') ? ret.time : (payload.time || '09:00');
                
                // --- CÁLCULO DA HORA FINAL DO RETORNO (Duração de 30 minutos) ---
                let returnEndTime = null;
                try {
                    const startObj = parseISO(`${ret.date}T${returnTime}`);
                    const endObj = addMinutes(startObj, 30); // Define duração de 30min para retorno
                    returnEndTime = format(endObj, 'HH:mm');
                } catch (e) {
                    console.error("Erro ao calcular hora final do retorno", e);
                }

                return {
                    patient_id: payload.patient_id,
                    date: ret.date,
                    time: returnTime,
                    end_time: returnEndTime, 
                    notes: `Retorno Automático: ${ret.note || ''}`,
                    status: 'Agendado',
                    type: 'Recorrente',
                    service_type_custom: 'Retorno',
                    payment_methods_json: [],
                    procedures_json: [],
                    materials_json: [],
                    total_amount: 0,
                    cost_amount: 0,
                    profit_amount: 0,
                    discount_percent: 0
                };
            });
            
            const { error: returnError } = await supabase.from('appointments').insert(returnsPayload);
            if (returnError) throw new Error("Erro ao criar retornos: " + returnError.message);
        }
        
        queryClient.invalidateQueries();
        setIsModalOpen(false);
        toast.success('Salvo!');
    } catch (error) { toast.error(error.message); }
  };

  return (
    <div className="flex flex-col w-full min-h-screen max-w-[1920px] mx-auto p-4 md:p-6 space-y-6">
      <PageHeader 
        title="Agenda" 
        subtitle={isConfigMode ? "Modo de Configuração de Horários" : "Visão Mensal de Agendamentos"} 
        action={
            <div className="flex gap-2">
                <Button 
                    variant={isConfigMode ? "default" : "outline"} 
                    className={isConfigMode ? "bg-purple-600 hover:bg-purple-700 text-white border-purple-600 shadow-sm" : "bg-white shadow-sm"}
                    onClick={() => setIsConfigMode(!isConfigMode)}
                >
                    <Settings className="w-4 h-4 mr-2" />
                    {isConfigMode ? "Sair da Configuração" : "Configurar Slots"}
                </Button>
                <Button onClick={() => { setEditingAppointment(null); setIsModalOpen(true); }} className="bg-stone-800 shadow-sm hover:bg-stone-900"><Plus className="w-4 h-4 mr-2"/> Novo</Button>
            </div>
        } 
      />
      
      <div className="flex flex-col gap-6 w-full">
          
          {/* 1. CALENDÁRIO VISUAL */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col shadow-sm">
              <div className="flex items-center justify-between p-4 border-b border-stone-100 bg-white">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="w-5 h-5"/></Button>
                    <span className="text-xl font-bold text-stone-800 capitalize">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</span>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="w-5 h-5"/></Button>
                </div>
                
                <Badge variant="secondary" className="text-sm px-3 py-1 bg-stone-100 text-stone-700 border border-stone-200">
                    <CalIcon className="w-4 h-4 mr-2 text-stone-500"/>
                    Agendamentos ({monthEvents.length})
                </Badge>
              </div>

              {isConfigMode && (
                  <div className="bg-purple-600 text-white text-xs py-2 text-center font-bold tracking-wider uppercase animate-in slide-in-from-top-1">
                      Modo de Configuração Ativo
                  </div>
              )}

              <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className="p-3 text-center text-xs font-bold text-stone-500 uppercase">{d}</div>)}
              </div>
              
              <div className="p-1">
                <div className="grid grid-cols-7 auto-rows-fr gap-1">
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
                                        min-h-[140px] border border-stone-100 rounded-lg p-2 relative transition-all duration-200
                                        ${!isCurrentMonth ? 'bg-stone-50/40 opacity-50' : 'bg-white'} 
                                        ${isBlocked ? 'bg-stone-100' : 'hover:border-blue-300 hover:shadow-md'}
                                        ${isConfigMode && isCurrentMonth ? 'cursor-alias hover:bg-purple-50 ring-inset hover:ring-2 ring-purple-200' : ''}
                                        ${isToday ? 'ring-2 ring-blue-500 border-transparent' : ''}
                                `}
                                onClick={(e) => { 
                                    if(e.target === e.currentTarget || isConfigMode) {
                                        handleDayClick(dateKey, isBlocked);
                                    }
                                }}>
                                
                                <div className="flex justify-between items-start mb-2">
                                    <div className={`text-sm font-semibold flex justify-center`}>
                                        <span className={`w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white shadow-sm' : isCurrentMonth ? 'text-stone-700' : 'text-stone-300'}`}>
                                            {format(day, 'd')}
                                        </span>
                                    </div>
                                    
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button 
                                                    onClick={(e) => handleToggleBlock(e, day, blockedInfo)}
                                                    className={`p-1.5 rounded-full transition-all ${isBlocked ? 'text-stone-600 bg-stone-200' : 'text-stone-300 hover:text-red-400 hover:bg-red-50'}`}
                                                >
                                                    {isBlocked ? <Lock className="w-3.5 h-3.5"/> : <Unlock className="w-3.5 h-3.5"/>}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent><p>{isBlocked ? "Desbloquear Dia" : "Bloquear Dia"}</p></TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>

                                {!isBlocked && ghostSlots.length > 0 && (
                                    <div className="mb-2 space-y-1 pointer-events-none opacity-70">
                                        {ghostSlots.slice(0, 3).map((slot, idx) => (
                                            <div key={idx} className="text-[10px] text-stone-500 px-1.5 py-0.5 border border-dashed border-stone-200 rounded flex justify-between select-none bg-stone-50/50">
                                                <span className="font-mono font-bold">{slot.time}</span>
                                                <span className="truncate max-w-[50px]">{slot.label}</span>
                                            </div>
                                        ))}
                                        {ghostSlots.length > 3 && <div className="text-[9px] text-stone-400 text-center font-medium">+{ghostSlots.length - 3} livres</div>}
                                    </div>
                                )}

                                <div className="space-y-1 relative z-10">
                                    {isBlocked ? (
                                        <div className="flex flex-col items-center justify-center h-full py-4 opacity-40 select-none">
                                            <Ban className="w-5 h-5 text-stone-500 mb-1"/>
                                            <span className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">Fechado</span>
                                        </div>
                                    ) : (
                                        dayEvents.map(ev => (
                                            <div 
                                                key={ev.id}
                                                className={`text-[10px] px-2 py-1 rounded-md truncate shadow-sm border-l-4 cursor-pointer transition-all hover:-translate-y-0.5 ${getEventStyle(ev)}`}
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

              <div className="p-4 border-t border-stone-100 bg-stone-50 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-2 text-[10px] font-medium text-stone-600">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-100 border-l-2 border-blue-500"></div>Novo</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-purple-100 border-l-2 border-purple-500"></div>Recorrente</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-lime-100 border-l-2 border-lime-500"></div>Confirmado</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-100 border-l-2 border-emerald-600"></div>Pago</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-orange-100 border-l-2 border-orange-500"></div>A Pagar</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-indigo-100 border-l-2 border-indigo-500"></div>Em Andamento</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-cyan-100 border-l-2 border-cyan-500"></div>Realizado</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-stone-100 border-l-2 border-stone-500"></div>Desmarcado</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-100 border-l-2 border-red-500"></div>Faltou/Cancelado</div>
              </div>
          </div>

          {/* 2. CARD DE DISPONIBILIDADE / SLOTS */}
          <Card className="flex flex-col bg-white border-stone-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-stone-100 bg-stone-100 flex justify-between items-center">
                  <h3 className="font-bold text-stone-700 text-sm flex items-center gap-2">
                      <Clock className="w-4 h-4"/> Disponibilidade / Slots
                  </h3>
                  <Badge variant="outline" className="bg-white text-stone-500 border-stone-200">Visão Geral do Mês</Badge>
              </div>
              
              <div className="overflow-y-auto max-h-[500px] p-4 bg-stone-50/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {daysOfMonthList.map((day) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const dayConfig = dayConfigs.find(c => c.date === dateStr);
                          const dayAppts = monthEvents.filter(a => a.date === dateStr);
                          const isToday = isSameDay(day, new Date());
                          
                          const configuredSlots = dayConfig?.slots_json || dayConfig?.agenda_templates?.slots_json || [];

                          return (
                              <div key={dateStr} className={`border rounded-lg p-3 transition-colors shadow-sm ${isToday ? 'border-blue-200 bg-blue-50/30' : 'border-stone-200 bg-white'}`}>
                                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-100">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-stone-800">{format(day, 'dd/MM')}</span>
                                        <span className="text-[10px] font-bold text-stone-400 uppercase bg-stone-100 px-1.5 py-0.5 rounded">{format(day, 'EEEE', {locale: ptBR})}</span>
                                      </div>
                                      {isConfigMode && (
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-300 hover:text-purple-600" onClick={() => handleDayClick(dateStr, false)}>
                                              <Settings className="w-3.5 h-3.5"/>
                                          </Button>
                                      )}
                                  </div>

                                  <div className="space-y-2">
                                      {configuredSlots.length > 0 ? (
                                          configuredSlots.map((slot, idx) => {
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
                                                    className={`flex justify-between items-center border rounded px-2.5 py-2 shadow-sm transition-all text-xs
                                                        ${isOccupied 
                                                            ? 'bg-red-50 border-red-100 text-red-800' 
                                                            : 'bg-stone-50 border-stone-100 text-stone-700 hover:border-blue-300 hover:bg-white'
                                                        }
                                                    `}
                                                  >
                                                      <div className="flex flex-col min-w-0">
                                                          <div className="flex items-center gap-2">
                                                              <span className="font-bold">{slot.time}</span>
                                                              <span className="truncate max-w-[100px] opacity-80">{slot.label}</span>
                                                          </div>
                                                          {isOccupied && (
                                                              <div className="text-[10px] font-medium flex items-center gap-1 mt-1 text-red-600">
                                                                  <AlertCircle className="w-3 h-3"/> 
                                                                  <span className="truncate max-w-[120px]">{occupiedAppt.patients?.full_name}</span>
                                                              </div>
                                                          )}
                                                      </div>

                                                      {isOccupied ? (
                                                          <Button 
                                                            size="icon" 
                                                            variant="ghost" 
                                                            className="h-6 w-6 rounded-full bg-white hover:bg-red-100 text-red-400 hover:text-red-700 border border-red-100 shadow-sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if(window.confirm('Deseja liberar este horário? O agendamento será excluído.')) {
                                                                    handleDeleteAppointment(occupiedAppt.id);
                                                                }
                                                            }}
                                                            title="Excluir Agendamento"
                                                          >
                                                              <Trash2 className="w-3 h-3" />
                                                          </Button>
                                                      ) : (
                                                          <Button 
                                                            size="icon" 
                                                            variant="ghost" 
                                                            className="h-6 w-6 rounded-full bg-white hover:bg-blue-100 text-stone-400 hover:text-blue-600 border border-stone-200 shadow-sm"
                                                            onClick={() => handleQuickSchedule(dateStr, slot.time)}
                                                            title="Agendar neste horário"
                                                          >
                                                              <Plus className="w-3 h-3" />
                                                          </Button>
                                                      )}
                                                  </div>
                                              );
                                          })
                                      ) : (
                                          <div className="text-center py-4 bg-stone-50/50 rounded border border-dashed border-stone-200">
                                              <span className="text-[10px] text-stone-400 italic">Nada configurado</span>
                                          </div>
                                      )}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          </Card>
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