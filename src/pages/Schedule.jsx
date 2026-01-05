import React, { useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, Lock, Unlock, Ban } from 'lucide-react';
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
          // Se a tabela não existir, não quebra a tela, apenas retorna vazio
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
            // Se já está bloqueado, removemos o bloqueio (Delete)
            const { error } = await supabase.from('blocked_days').delete().eq('id', id);
            if(error) throw error;
        } else {
            // Se não está, criamos o bloqueio (Insert)
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
    e.stopPropagation(); // Evita abrir o modal de agendamento
    const dateStr = format(day, 'yyyy-MM-dd');
    toggleBlockMutation.mutate({ 
        date: dateStr, 
        isBlocked: !!blockedInfo, 
        id: blockedInfo?.id 
    });
  };

  const statusColor = (s) => {
      if(s==='Confirmado') return 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white';
      if(s==='Cancelado') return 'bg-rose-500 hover:bg-rose-600 border-rose-500 text-white';
      if(s==='Realizado') return 'bg-stone-500 hover:bg-stone-600 border-stone-500 text-white';
      return 'bg-blue-500 hover:bg-blue-600 border-blue-500 text-white'; 
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

        if (payload.status === 'Realizado') {
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
                                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${statusColor(evt.status)}`}>
                                          {evt.status}
                                      </span>
                                  </div>
                              </div>
                          </div>
                      )) : <p className="text-center text-xs text-stone-400 py-10">Sem agendamentos.</p>}
                  </div>
              </ScrollArea>
          </Card>

          {/* CALENDÁRIO VISUAL */}
          <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between bg-white p-2 px-4 rounded-xl border border-stone-200 shadow-sm">
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
                          const dateKey = format(day, 'yyyy-MM-dd');
                          const isCurrentMonth = isSameMonth(day, currentDate);
                          const isToday = isSameDay(day, new Date());
                          const dayEvents = getEventsForDay(day);
                          
                          // Verifica se o dia está bloqueado
                          const blockedInfo = blockedDays.find(b => b.date === dateKey);
                          const isBlocked = !!blockedInfo;

                          return (
                              <div key={i} 
                                   className={`
                                        min-h-[100px] border-b border-r border-stone-100 p-1 relative transition-colors 
                                        ${!isCurrentMonth ? 'bg-stone-50/40' : 'bg-white'} 
                                        ${isBlocked ? 'bg-stone-100 bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,0.05)_25%,rgba(0,0,0,0.05)_50%,transparent_50%,transparent_75%,rgba(0,0,0,0.05)_75%,rgba(0,0,0,0.05)_100%)] bg-[length:10px_10px]' : 'hover:bg-stone-50'}
                                   `}
                                   onClick={(e) => { 
                                      // Só abre modal se clicar no fundo E não estiver bloqueado
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
                                      
                                      {/* Botão de Bloqueio (Visível no Hover ou se estiver bloqueado) */}
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
                                                  className={`text-[10px] px-1.5 py-1 rounded truncate shadow-sm border-l-2 cursor-pointer transition-transform active:scale-95 ${statusColor(ev.status)}`}
                                                  onClick={(e) => {
                                                      e.stopPropagation(); 
                                                      handleOpen(ev);
                                                  }}
                                                  title={`${ev.time} - ${ev.patients?.full_name}`}
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