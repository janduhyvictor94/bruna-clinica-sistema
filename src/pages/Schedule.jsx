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
import { toast } from 'sonner';
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
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
      if(s==='Confirmado') return 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white';
      if(s==='Cancelado') return 'bg-rose-500 hover:bg-rose-600 border-rose-500 text-white';
      if(s==='Realizado') return 'bg-stone-500 hover:bg-stone-600 border-stone-500 text-white';
      return 'bg-blue-500 hover:bg-blue-600 border-blue-500 text-white'; // Agendado
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
                                  <span className="text-xs font-bold text-stone-600">{format(parseISO(evt.date), 'dd')}</span>
                                  <span className="text-[10px] text-stone-400 uppercase">{format(parseISO(evt.date), 'EEE', {locale: ptBR})}</span>
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
                          const isCurrentMonth = isSameMonth(day, currentDate);
                          const isToday = isSameDay(day, new Date());
                          const dayEvents = getEventsForDay(day);
                          return (
                              <div key={i} 
                                   className={`min-h-[100px] border-b border-r border-stone-100 p-1 relative transition-colors ${!isCurrentMonth ? 'bg-stone-50/40' : 'bg-white'} hover:bg-stone-50 cursor-pointer`} 
                                   onClick={(e) => { 
                                      // Se clicar na célula vazia, abre modal para criar novo nesse dia
                                      if(e.target === e.currentTarget) {
                                          setEditingAppointment({ date: format(day, 'yyyy-MM-dd') });
                                          setIsModalOpen(true);
                                      }
                                   }}>
                                  <div className={`text-xs font-medium mb-1 flex justify-center`}>
                                      <span className={`w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-stone-900 text-white' : isCurrentMonth ? 'text-stone-700' : 'text-stone-300'}`}>
                                          {format(day, 'd')}
                                      </span>
                                  </div>
                                  <div className="space-y-1">
                                      {dayEvents.map(ev => (
                                          <div 
                                              key={ev.id}
                                              className={`text-[10px] px-1.5 py-1 rounded truncate shadow-sm border-l-2 cursor-pointer transition-transform active:scale-95 ${statusColor(ev.status)}`}
                                              onClick={(e) => {
                                                  e.stopPropagation(); // Não deixa clicar na célula, clica só no evento
                                                  handleOpen(ev);
                                              }}
                                              title={`${ev.time} - ${ev.patients?.full_name}`}
                                          >
                                              <span className="font-bold mr-1">{ev.time}</span>
                                              {ev.patients?.full_name || 'Paciente'}
                                          </div>
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
        
        onDelete={async (id) => {
            const { data: appt } = await supabase.from('appointments').select('patient_id').eq('id', id).single();
            await supabase.from('stock_movements').delete().eq('appointment_id', id);
            await supabase.from('installments').delete().eq('appointment_id', id);
            await supabase.from('appointments').delete().eq('id', id);

            if (appt && appt.patient_id) {
               // Atualiza o paciente para limpar data de retorno se necessário
               await supabase.from('patients').update({ next_return_date: null }).eq('id', appt.patient_id);
            }

            queryClient.invalidateQueries({ queryKey: ['appointments'] });
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            setIsModalOpen(false);
            toast.success('Excluído!');
        }}

        onSave={async (data) => {
            const { id, returns_to_create, ...rawData } = data;
            
            // 1. Prepara os dados
            const payload = {
                patient_id: rawData.patient_id, date: rawData.date, time: rawData.time, status: rawData.status,
                type: rawData.type, notes: rawData.notes, payment_methods_json: rawData.payment_methods, 
                procedures_json: rawData.procedures_json, materials_json: rawData.materials_json,
                total_amount: Number(rawData.total_amount)||0, cost_amount: Number(rawData.cost_amount)||0,
                profit_amount: Number(rawData.profit_amount)||0, discount_percent: Number(rawData.discount_percent)||0
            };
            
            let appointmentId = id;
            
            // 2. Salva (Insert ou Update)
            if (id) {
                await supabase.from('appointments').update(payload).eq('id', id);
            } else {
                const { data: newApp } = await supabase.from('appointments').insert([payload]).select().single();
                appointmentId = newApp.id;
            }

            // 3. Atualiza Paciente (Data de Retorno)
            if (payload.patient_id && payload.date) {
                await supabase.from('patients').update({
                    next_return_date: payload.date,
                    is_active: true
                }).eq('id', payload.patient_id);
            }

            // 4. Cria Novos Retornos (Recorrência)
            if (returns_to_create && returns_to_create.length > 0) {
                const returnsPayload = returns_to_create.map(ret => ({
                    patient_id: payload.patient_id,
                    date: ret.date,
                    notes: `Retorno Automático: ${ret.note || ''}`,
                    status: 'Agendado',
                    type: 'Recorrente'
                }));
                await supabase.from('appointments').insert(returnsPayload);
            }

            // 5. Lógica de "Realizado" (Estoque e Financeiro)
            if (payload.status === 'Realizado') {
                // Limpa movimentos antigos para evitar duplicação ao editar
                await supabase.from('stock_movements').delete().eq('appointment_id', appointmentId);
                await supabase.from('installments').delete().eq('appointment_id', appointmentId);

                if (rawData.materials_json?.length > 0) {
                   const { data: dbMaterials } = await supabase.from('materials').select('id, name, stock_quantity, cost_per_unit');
                   const movementsPayload = [];
                   for (const matItem of rawData.materials_json) {
                       const dbMat = dbMaterials?.find(m => m.name === matItem.name);
                       if (dbMat) {
                           const qty = 1; 
                           await supabase.from('materials').update({ stock_quantity: (dbMat.stock_quantity||0) - qty }).eq('id', dbMat.id);
                           movementsPayload.push({
                               material_id: dbMat.id, appointment_id: appointmentId, type: 'saida', quantity: qty,
                               previous_stock: dbMat.stock_quantity, new_stock: (dbMat.stock_quantity||0) - qty,
                               cost_per_unit: dbMat.cost_per_unit, total_cost: Number(matItem.cost)||0, reason: 'Uso em atendimento',
                               date: payload.date, material_name: dbMat.name, patient_name: rawData.patient_name_ref
                           });
                       }
                   }
                   if (movementsPayload.length) await supabase.from('stock_movements').insert(movementsPayload);
                }

                if (rawData.payment_methods?.length > 0) {
                    const installmentsPayload = [];
                    rawData.payment_methods.forEach(pm => {
                        const isCredit = pm.method && pm.method.includes('Crédito');
                        if (isCredit) {
                            const totalVal = Number(pm.value)||0; const num = Number(pm.installments)||1;
                            const valPerInst = totalVal/num;
                            for(let i=1; i<=num; i++) {
                                const due = new Date(payload.date); due.setMonth(due.getMonth() + (i-1));
                                installmentsPayload.push({
                                    appointment_id: appointmentId, patient_name: rawData.patient_name_ref,
                                    installment_number: i, total_installments: num, value: valPerInst,
                                    due_date: due.toISOString(), is_received: false
                                });
                            }
                        }
                    });
                    if (installmentsPayload.length) await supabase.from('installments').insert(installmentsPayload);
                }
            }

            queryClient.invalidateQueries({ queryKey: ['appointments'] });
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['installments'] });
            setIsModalOpen(false);
            toast.success('Salvo!');
        }} 
      />
    </div>
  );
}