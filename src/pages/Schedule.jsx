import React, { useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, Lock, Unlock, Ban, Info } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppointmentModal } from './Appointments';
import { toast } from 'sonner';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const CREDIT_METHODS = ['Cartão de Crédito PJ', 'Cartão de Crédito PF'];

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const queryClient = useQueryClient();

  // --- QUERY: AGENDAMENTOS ---
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

  // --- QUERY: DIAS BLOQUEADOS ---
  const { data: blockedDays = [] } = useQuery({
    queryKey: ['blocked_days'],
    queryFn: async () => {
      const { data, error } = await supabase.from('blocked_days').select('*');
      if (error) {
          console.warn("Tabela blocked_days pode não existir.", error);
          return [];
      }
      return data;
    },
  });

  // --- MUTAÇÃO: BLOQUEAR/DESBLOQUEAR ---
  const toggleBlockMutation = useMutation({
    mutationFn: async ({ date, isBlocked, id }) => {
        if (isBlocked) {
            const { error } = await supabase.from('blocked_days').delete().eq('id', id);
            if(error) throw error;
        } else {
            const { error } = await supabase.from('blocked_days').insert([{ date: date }]);
            if(error) throw error;
        }
    },
    onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: ['blocked_days'] });
        toast.success(variables.isBlocked ? 'Dia desbloqueado' : 'Dia bloqueado para atendimentos');
    },
    onError: (e) => toast.error('Erro ao alterar bloqueio: ' + e.message)
  });

  const monthEvents = useMemo(() => {
      return appointments
          .filter(a => a.date && isSameMonth(parseISO(a.date), currentDate))
          .sort((a, b) => {
              const dateA = new Date(`${a.date}T${a.time}`);
              const dateB = new Date(`${b.date}T${b.time}`);
              return dateA - dateB;
          });
  }, [appointments, currentDate]);

  const getEventsForDay = (date) => {
      return appointments.filter(a => a.date && isSameDay(parseISO(a.date), date));
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

  const handleToggleBlock = (e, day, blockedInfo) => {
    e.stopPropagation(); 
    const dateStr = format(day, 'yyyy-MM-dd');
    toggleBlockMutation.mutate({ 
        date: dateStr, 
        isBlocked: !!blockedInfo, 
        id: blockedInfo?.id 
    });
  };

  // --- LÓGICA DE CORES ATUALIZADA ---
  const getEventStyle = (appt) => {
      const s = appt.status;
      const t = appt.type;

      // 1. Status Críticos
      if (s === 'Cancelado') return 'bg-red-50 text-red-700 border-l-4 border-red-500 opacity-60';
      
      // 2. Realizados (Cores Distintas)
      if (s === 'Realizado Pago') return 'bg-emerald-100 text-emerald-900 border-l-4 border-emerald-600'; // Verde
      if (s === 'Realizado a Pagar') return 'bg-orange-100 text-orange-800 border-l-4 border-orange-500'; // Laranja
      if (s === 'Realizado') return 'bg-cyan-100 text-cyan-800 border-l-4 border-cyan-500'; // Ciano (Antigo "Em Atendimento")
      
      // 3. Confirmados
      if (s === 'Confirmado') return 'bg-lime-100 text-lime-800 border-l-4 border-lime-500';

      // 4. Agendados
      if (t === 'Novo') return 'bg-blue-100 text-blue-800 border-l-4 border-blue-500'; // Azul
      return 'bg-purple-100 text-purple-800 border-l-4 border-purple-500'; // Roxo
  };

  const handleDeleteAppointment = async (id) => {
    try {
        const idToDelete = Number(id);
        if (isNaN(idToDelete)) throw new Error("ID de agendamento inválido.");
        
        await supabase.from('stock_movements').delete().eq('appointment_id', idToDelete);
        await supabase.from('installments').delete().eq('appointment_id', idToDelete);
        await supabase.from('appointments').delete().eq('id', idToDelete);
        queryClient.invalidateQueries();
        toast.success('Atendimento excluído');
    } catch (error) { toast.error('Erro ao excluir: ' + error.message); }
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
                const discountValue = rawValue * (discPercent / 100);
                totalPaidReal += (rawValue - discountValue);
            }
        });

        const totalMaterials = rawData.materials_json.reduce((acc, curr) => acc + ((Number(curr.cost) || 0) * (Number(curr.quantity) || 1)), 0);
        const profit = totalPaidReal - totalMaterials;
        
        const payload = {
            patient_id: rawData.patient_id, date: rawData.date, time: rawData.time, status: rawData.status,
            type: rawData.type, notes: rawData.notes, service_type_custom: rawData.service_type_custom, 
            payment_methods_json: rawData.payment_methods, 
            procedures_json: rawData.procedures_json, materials_json: rawData.materials_json,
            total_amount: Number(rawData.total_amount)||0, 
            cost_amount: Number(rawData.cost_amount)||0,
            profit_amount: profit,
            discount_percent: Number(rawData.discount_percent)||0
        };

        let appointmentId;
        if (id) {
            const idToUpdate = Number(id);
            if (isNaN(idToUpdate)) throw new Error("ID inválido.");
            const { error } = await supabase.from('appointments').update(payload).eq('id', idToUpdate); 
            if (error) throw error;
            appointmentId = idToUpdate;
        } else {
            const { data: newApp, error } = await supabase.from('appointments').insert([payload]).select().single();
            if (error) throw error;
            appointmentId = newApp.id;
        }
        
        const apptId = Number(appointmentId);

        if (payload.status.includes('Realizado')) {
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
                // Lógica manual
            } else if (rawData.payment_methods?.length > 0) {
                rawData.payment_methods.forEach(pm => {
                    const totalVal = Number(pm.value)||0; 
                    const isCreditCard = CREDIT_METHODS.includes(pm.method);
                    const isScheduled = pm.method === 'Agendamento de Pagamento';
                    const numInstallments = Number(pm.installments)||1;
                    
                    if (isScheduled) {
                        if (!pm.scheduled_date) throw new Error(`Data de vencimento obrigatória.`);
                        installmentsPayload.push({
                            appointment_id: apptId, patient_name: rawData.patient_name_ref,
                            installment_number: 1, total_installments: numInstallments, value: totalVal, 
                            due_date: pm.scheduled_date, is_received: false, received_date: null
                        });
                    }
                    else if (isCreditCard) {
                        const valPerInst = totalVal / numInstallments;
                        const appointmentDateParsed = parseISO(payload.date);
                        const firstInstallmentDate = addMonths(appointmentDateParsed, 1);
                        
                        for (let i = 1; i <= numInstallments; i++) {
                            const dueDate = addMonths(firstInstallmentDate, i - 1); 
                            const formattedDueDate = format(dueDate, 'yyyy-MM-dd');
                            installmentsPayload.push({
                                appointment_id: apptId, patient_name: rawData.patient_name_ref,
                                installment_number: i, total_installments: numInstallments, value: valPerInst,
                                due_date: formattedDueDate, is_received: true, received_date: formattedDueDate,
                            });
                        }
                    } 
                });
            }
            if (installmentsPayload.length) await supabase.from('installments').insert(installmentsPayload);
        } else if (id) {
            await supabase.from('stock_movements').delete().eq('appointment_id', apptId);
            await supabase.from('installments').delete().eq('appointment_id', apptId);
        }

        queryClient.invalidateQueries();
        setIsModalOpen(false);
        toast.success('Salvo!');
    } catch (error) { toast.error('Erro ao salvar: ' + error.message); }
  };


  return (
    <div className="flex flex-col h-[calc(100vh-120px)] w-full max-w-[1600px] mx-auto space-y-4">
      <PageHeader 
        title="Agenda" 
        subtitle="Calendário mensal" 
        action={<Button onClick={() => { setEditingAppointment(null); setIsModalOpen(true); }} className="bg-stone-800"><Plus className="w-4 h-4 mr-2"/> Novo</Button>} 
      />
      
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          
          {/* BARRA LATERAL */}
          <Card className="w-full lg:w-80 flex flex-col bg-white h-full border-stone-200 shadow-sm shrink-0">
              <div className="p-4 border-b border-stone-100 bg-stone-50">
                  <h3 className="font-bold text-stone-700 text-sm flex items-center gap-2">
                      <CalIcon className="w-4 h-4"/> Lista de {format(currentDate, 'MMMM', {locale: ptBR})}
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
                                      {/* Badge Colorido na Lista Lateral */}
                                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border 
                                        ${evt.status === 'Confirmado' ? 'bg-lime-100 text-lime-800 border-lime-200' :
                                          evt.status === 'Cancelado' ? 'bg-red-50 text-red-700 border-red-200' :
                                          evt.status === 'Realizado Pago' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                          evt.status === 'Realizado a Pagar' ? 'bg-orange-100 text-orange-700 border-orange-200' :
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
              
              {/* LEGENDA DE CORES DEFINITIVA */}
              <div className="p-4 border-t border-stone-100 bg-stone-50/50 text-[10px] grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-100 border-l-2 border-blue-500"></div><span className="text-stone-600">Novo (Agendado)</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-purple-100 border-l-2 border-purple-500"></div><span className="text-stone-600">Retorno (Agendado)</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-lime-100 border-l-2 border-lime-500"></div><span className="text-stone-600">Confirmado</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-100 border-l-2 border-emerald-600"></div><span className="text-stone-600">Realizado (Pago)</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-orange-100 border-l-2 border-orange-500"></div><span className="text-stone-600">Realizado (A Pagar)</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-cyan-100 border-l-2 border-cyan-500"></div><span className="text-stone-600">Realizado</span></div>
                  <div className="flex items-center gap-2 col-span-2"><div className="w-3 h-3 rounded bg-red-100 border-l-2 border-red-500"></div><span className="text-stone-600">Cancelado</span></div>
              </div>
          </Card>

          {/* CALENDÁRIO VISUAL */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
              <div className="flex items-center justify-between bg-white p-2 px-4 rounded-xl border border-stone-200 shadow-sm shrink-0">
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="w-5 h-5"/></Button>
                <span className="text-lg font-bold text-stone-800 capitalize">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</span>
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="w-5 h-5"/></Button>
              </div>

              <div className="flex-1 bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col shadow-sm">
                  {/* Cabeçalho dos Dias (FIXO) */}
                  <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50 shrink-0">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className="p-3 text-center text-xs font-bold text-stone-500 uppercase">{d}</div>)}
                  </div>
                  
                  {/* Área de Dias (ROLÁVEL) */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-7 min-h-full auto-rows-fr pb-10">
                        {calendarDays.map((day, i) => {
                            const dateKey = format(day, 'yyyy-MM-dd');
                            const isCurrentMonth = isSameMonth(day, currentDate);
                            const isToday = isSameDay(day, new Date());
                            const dayEvents = getEventsForDay(day);
                            
                            const blockedInfo = blockedDays.find(b => b.date === dateKey);
                            const isBlocked = !!blockedInfo;

                            return (
                                <div key={i} 
                                    className={`
                                            min-h-[120px] border-b border-r border-stone-100 p-1 relative transition-colors 
                                            ${!isCurrentMonth ? 'bg-stone-50/40' : 'bg-white'} 
                                            ${isBlocked ? 'bg-stone-100 bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,0.05)_25%,rgba(0,0,0,0.05)_50%,transparent_50%,transparent_75%,rgba(0,0,0,0.05)_75%,rgba(0,0,0,0.05)_100%)] bg-[length:10px_10px]' : 'hover:bg-stone-50'}
                                    `}
                                    onClick={(e) => { 
                                        if(e.target === e.currentTarget && !isBlocked) {
                                            setEditingAppointment({ date: dateKey });
                                            setIsModalOpen(true);
                                        }
                                    }}>
                                    
                                    {/* Header do Dia */}
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
                                                        className={`
                                                            p-1 rounded transition-all opacity-40 hover:opacity-100
                                                            ${isBlocked ? 'text-stone-600 opacity-100' : 'text-stone-300 hover:text-red-400'}
                                                        `}
                                                    >
                                                        {isBlocked ? <Lock className="w-3 h-3"/> : <Unlock className="w-3 h-3"/>}
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{isBlocked ? "Desbloquear Dia" : "Bloquear Dia"}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>

                                    {/* Conteúdo do Dia */}
                                    <div className="space-y-1">
                                        {isBlocked ? (
                                            <div className="flex flex-col items-center justify-center h-full py-2 opacity-50 select-none">
                                                <Ban className="w-4 h-4 text-stone-400 mb-1"/>
                                                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Fechado</span>
                                            </div>
                                        ) : (
                                            dayEvents.map(ev => (
                                                <div 
                                                    key={ev.id}
                                                    // APLICANDO A NOVA LÓGICA DE CORES AQUI
                                                    className={`text-[10px] px-1.5 py-1 rounded truncate shadow-sm border-l-2 cursor-pointer transition-transform active:scale-95 ${getEventStyle(ev)}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation(); 
                                                        handleOpen(ev);
                                                    }}
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
    </div>
  );
}