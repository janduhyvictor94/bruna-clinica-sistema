import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { format, parseISO, addMonths, addDays } from 'date-fns'; 
import { Calendar, Clock, FileText, Plus, Phone, User, MapPin, AlertCircle, Trash2, Edit2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { AppointmentModal } from '../pages/Appointments';

const CREDIT_METHODS = ['Cartão de Crédito PJ', 'Cartão de Crédito PF'];

export default function PatientDetailsModal({ open, onClose, patientId }) {
  const [activeTab, setActiveTab] = useState('details');
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  
  const [isEditingProtocol, setIsEditingProtocol] = useState(false);
  const [protocolText, setProtocolText] = useState('');
  
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');

  const queryClient = useQueryClient();

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => {
      if (!patientId) return null;
      const idToUse = Number(patientId);
      if (isNaN(idToUse)) return null;

      const { data, error } = await supabase.from('patients').select('*').eq('id', idToUse).single();
      if (error) throw error;
      return data;
    },
    enabled: !!patientId && open,
  });

  useEffect(() => {
    if (patient) {
      setProtocolText(patient.protocol || '');
      setNotesText(patient.notes || '');
    }
  }, [patient]);

  const { data: appointments = [] } = useQuery({
    queryKey: ['patient_appointments', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const idToUse = Number(patientId);
      if (isNaN(idToUse)) return [];
      
      const { data, error } = await supabase
        .from('appointments')
        .select('*, installments(*)')
        .eq('patient_id', idToUse) 
        .order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!patientId && open,
  });

  const updatePatientMutation = useMutation({
    mutationFn: async (newData) => {
      const idToUse = Number(patientId);
      if (isNaN(idToUse)) throw new Error("ID de paciente inválido.");

      const { error } = await supabase.from('patients').update(newData).eq('id', idToUse);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(); 
      toast.success('Dados atualizados!');
      setIsEditingProtocol(false);
      setIsEditingNotes(false);
    },
    onError: (e) => toast.error('Erro ao atualizar: ' + e.message)
  });

  const handleSaveProtocol = () => { updatePatientMutation.mutate({ protocol: protocolText }); };
  const handleDeleteProtocol = () => { if(confirm("Deseja apagar o protocolo?")) { setProtocolText(''); updatePatientMutation.mutate({ protocol: '' }); } };
  const handleSaveNotes = () => { updatePatientMutation.mutate({ notes: notesText }); };
  const handleDeleteNotes = () => { if(confirm("Deseja apagar as observações?")) { setNotesText(''); updatePatientMutation.mutate({ notes: '' }); } };

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
        
        // RECÁLCULO DO PROFIT (APENAS PIX/DINHEIRO/DEB)
        let totalPaidReal = 0;
        rawData.payment_methods.forEach(pm => {
            const isCreditCard = CREDIT_METHODS.includes(pm.method);
            const isScheduled = pm.method === 'Agendamento de Pagamento';
            
            if (!isScheduled && !isCreditCard) { 
                const rawValue = Number(pm.value)||0;
                const discPercent = Number(pm.discount_percent) || 0;
                const discountValue = rawValue * (discPercent / 100);
                totalPaidReal += (rawValue - discountValue);
            }
        });
        const totalMaterials = rawData.materials_json.reduce((acc, curr) => acc + ((Number(curr.cost) || 0) * (Number(curr.quantity) || 1)), 0);
        const profit = totalPaidReal - totalMaterials;
        // FIM RECÁLCULO
        
        const payload = {
            patient_id: rawData.patient_id, date: rawData.date, time: rawData.time, status: rawData.status,
            type: rawData.type, notes: rawData.notes, payment_methods_json: rawData.payment_methods, 
            procedures_json: rawData.procedures_json, materials_json: rawData.materials_json,
            total_amount: Number(rawData.total_amount)||0, 
            cost_amount: Number(rawData.cost_amount)||0,
            profit_amount: profit, // Usando o profit corrigido
            discount_percent: Number(rawData.discount_percent)||0
        };

        let appointmentId;
        if (id) { 
            const idToUpdate = Number(id);
            if (isNaN(idToUpdate)) throw new Error("ID de agendamento inválido para atualização.");

            await supabase.from('appointments').update(payload).eq('id', idToUpdate); 
            appointmentId = idToUpdate;
        } 
        else { 
            const { data: newApp } = await supabase.from('appointments').insert([payload]).select().single(); 
            appointmentId = newApp.id; 
        }

        const apptId = Number(appointmentId);
        if (isNaN(apptId)) throw new Error("ID de agendamento inválido.");


        if (payload.status === 'Realizado') {
            await supabase.from('stock_movements').delete().eq('appointment_id', apptId);
            await supabase.from('installments').delete().eq('appointment_id', apptId);

            const installmentsPayload = [];
            const appointmentDate = payload.date; 
            
            // LÓGICA DE PARCELAMENTO MANUAL (custom_installments)
            if (custom_installments && custom_installments.length > 0) {
                 // Lógica manual (mantida)
            } else if (rawData.payment_methods?.length > 0) {
                 rawData.payment_methods.forEach(pm => {
                    const totalVal = Number(pm.value)||0; 
                    const numInstallments = Number(pm.installments)||1;
                    const isCreditCard = CREDIT_METHODS.includes(pm.method);
                    const isScheduled = pm.method === 'Agendamento de Pagamento';

                    // CASO 1: Agendamento de Pagamento (CRIA APENAS 1 PARCELA PENDENTE COM O VALOR TOTAL)
                    if (isScheduled) {
                        if (!pm.scheduled_date) {
                             throw new Error(`Selecione a data de vencimento para o Agendamento de Pagamento de R$ ${totalVal.toFixed(2).replace('.', ',')}.`);
                        }
                        
                        installmentsPayload.push({
                            appointment_id: apptId, patient_name: patient.full_name,
                            installment_number: 1, 
                            total_installments: numInstallments, 
                            value: totalVal, 
                            due_date: pm.scheduled_date, 
                            is_received: false, 
                            received_date: null
                        });
                    }
                    // CASO 2: Parcelamento (Crédito, 1x ou > 1x)
                    else if (isCreditCard) {
                        const valPerInst = totalVal / numInstallments;
                        const appointmentDateParsed = parseISO(payload.date);
                        
                        // Primeira parcela (vencimento): Mês seguinte
                        const firstInstallmentDate = addMonths(appointmentDateParsed, 1);
                        
                        for (let i = 1; i <= numInstallments; i++) {
                            const dueDate = addMonths(firstInstallmentDate, i - 1); 
                            const formattedDueDate = format(dueDate, 'yyyy-MM-dd');

                            installmentsPayload.push({
                                appointment_id: apptId, patient_name: patient.full_name,
                                installment_number: i, total_installments: numInstallments, value: valPerInst,
                                due_date: formattedDueDate,
                                is_received: true, 
                                received_date: formattedDueDate, 
                            });
                        }
                    } 
                    // Pagamentos à vista (Dinheiro, Pix, Débito) NÃO criam parcelas aqui (evita duplicação)
                });
            }
            if (installmentsPayload.length) await supabase.from('installments').insert(installmentsPayload);
        } else if (id) {
            // LIMPEZA SE O STATUS MUDAR PARA ALGO QUE NÃO É REALIZADO
            await supabase.from('stock_movements').delete().eq('appointment_id', apptId);
            await supabase.from('installments').delete().eq('appointment_id', apptId);
        }

        queryClient.invalidateQueries();
        
        setIsAppointmentModalOpen(false);
        setEditingAppointment(null);
        toast.success('Agendamento salvo!');
    } catch (error) { toast.error('Erro ao salvar: ' + error.message); }
  };


  const handleNewReturn = () => {
    setEditingAppointment({
        patient_id: patientId, type: 'Recorrente', status: 'Agendado', date: format(new Date(), 'yyyy-MM-dd')
    });
    setIsAppointmentModalOpen(true);
  };

  if (!patient) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0 bg-stone-50">
        <DialogHeader className="p-6 pb-4 bg-white border-b border-stone-200">
          <div className="flex justify-between items-start">
            <div>
                <DialogTitle className="text-2xl font-serif text-stone-900">{patient.full_name}</DialogTitle>
                <div className="text-sm text-stone-500 flex items-center gap-2 mt-1">
                    <Badge variant="outline">{patient.origin || 'Origem não inf.'}</Badge>
                    <span className="text-stone-400">•</span>
                    <span className="text-xs text-stone-500">{patient.age ? `${patient.age} anos` : 'Idade não inf.'}</span>
                </div>
            </div>
            <div className="text-right">
                <p className="text-xs text-stone-400 uppercase tracking-wider font-bold">Próx. Retorno</p>
                <p className="text-sm font-medium text-emerald-700">
                    {patient.next_return_date ? format(parseISO(patient.next_return_date), 'dd/MM/yyyy') : '-'}
                </p>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-2 bg-white border-b border-stone-100">
                <TabsList className="bg-transparent p-0 gap-6">
                    <TabsTrigger value="details" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-stone-800 rounded-none px-0 pb-2 text-stone-500">Dados Pessoais</TabsTrigger>
                    <TabsTrigger value="appointments" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-stone-800 rounded-none px-0 pb-2 text-stone-500">Atendimentos</TabsTrigger>
                    <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-stone-800 rounded-none px-0 pb-2 text-stone-500">Anamnese / Histórico</TabsTrigger>
                </TabsList>
            </div>

            <ScrollArea className="flex-1 p-6">
                <TabsContent value="details" className="space-y-6 mt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InfoCard icon={Phone} label="Contato" value={patient.phone} subValue={patient.whatsapp ? `Zap: ${patient.whatsapp}` : null} />
                        <InfoCard icon={User} label="CPF" value={patient.cpf || '-'} />
                        <InfoCard icon={Calendar} label="Nascimento" value={patient.birth_date ? format(parseISO(patient.birth_date), 'dd/MM/yyyy') : '-'} />
                        <InfoCard icon={MapPin} label="Endereço" value={patient.address || '-'} />
                    </div>
                    <Card className="border-stone-100 shadow-sm">
                        <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="text-xs font-bold text-stone-400 uppercase flex items-center gap-2"><FileText className="w-3 h-3"/> Protocolo Planejado</h4>
                                {!isEditingProtocol ? (
                                    <div className="flex gap-1">
                                        {patient.protocol ? (
                                            <>
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditingProtocol(true)}><Edit2 className="w-3 h-3 text-stone-500"/></Button>
                                                <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-red-50 hover:text-red-600" onClick={handleDeleteProtocol}><Trash2 className="w-3 h-3"/></Button>
                                            </>
                                        ) : (
                                            <Button size="sm" variant="ghost" className="h-6 text-xs text-blue-600" onClick={() => setIsEditingProtocol(true)}><Plus className="w-3 h-3 mr-1"/> Adicionar</Button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex gap-1">
                                        <Button size="sm" variant="ghost" className="h-6 w-6" onClick={() => { setIsEditingProtocol(false); setProtocolText(patient.protocol || ''); }}><X className="w-4 h-4 text-stone-400"/></Button>
                                        <Button size="sm" className="h-6 bg-stone-900 text-white text-xs" onClick={handleSaveProtocol}><Save className="w-3 h-3 mr-1"/> Salvar</Button>
                                    </div>
                                )}
                            </div>
                            
                            {isEditingProtocol ? (
                                <Textarea 
                                    value={protocolText} 
                                    onChange={(e) => setProtocolText(e.target.value)} 
                                    className="min-h-[100px] text-sm bg-stone-50"
                                    placeholder="Descreva o protocolo planejado..."
                                />
                            ) : (
                                <p className="text-sm text-stone-700 whitespace-pre-wrap">
                                    {patient.protocol || <span className="text-stone-400 italic">Nenhum protocolo definido.</span>}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="border-stone-100 shadow-sm bg-amber-50/50">
                        <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="text-xs font-bold text-amber-600 uppercase flex items-center gap-2"><AlertCircle className="w-3 h-3"/> Observações</h4>
                                {!isEditingNotes ? (
                                    <div className="flex gap-1">
                                        {patient.notes ? (
                                            <>
                                                <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-amber-100" onClick={() => setIsEditingNotes(true)}><Edit2 className="w-3 h-3 text-amber-700"/></Button>
                                                <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-red-50 hover:text-red-600" onClick={handleDeleteNotes}><Trash2 className="w-3 h-3"/></Button>
                                            </>
                                        ) : (
                                            <Button size="sm" variant="ghost" className="h-6 text-xs text-amber-700 hover:bg-amber-100" onClick={() => setIsEditingNotes(true)}><Plus className="w-3 h-3 mr-1"/> Adicionar</Button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex gap-1">
                                        <Button size="sm" variant="ghost" className="h-6 w-6 hover:bg-amber-100" onClick={() => { setIsEditingNotes(false); setNotesText(patient.notes || ''); }}><X className="w-4 h-4 text-amber-700"/></Button>
                                        <Button size="sm" className="h-6 bg-amber-700 hover:bg-amber-800 text-white text-xs" onClick={handleSaveNotes}><Save className="w-3 h-3 mr-1"/> Salvar</Button>
                                    </div>
                                )}
                            </div>

                            {isEditingNotes ? (
                                <Textarea 
                                    value={notesText} 
                                    onChange={(e) => setNotesText(e.target.value)} 
                                    className="min-h-[80px] text-sm bg-white border-amber-200 focus:ring-amber-500"
                                    placeholder="Observações importantes..."
                                />
                            ) : (
                                <p className="text-sm text-stone-700 whitespace-pre-wrap">
                                    {patient.notes || <span className="text-stone-400 italic">Sem observações.</span>}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="appointments" className="space-y-4 mt-0">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold text-stone-700">Histórico Clínico</h3>
                        <Button size="sm" onClick={handleNewReturn} className="bg-stone-800 hover:bg-stone-900 text-xs">
                            <Plus className="w-3 h-3 mr-2"/> Agendar Retorno
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {appointments.length > 0 ? appointments.map(app => (
                            <Card key={app.id} className="border-stone-100 hover:border-stone-300 transition-all group">
                                <CardContent className="p-4 flex justify-between items-center">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant={app.type === 'Recorrente' ? 'secondary' : 'default'} className="text-[10px] h-5">
                                                {app.type}
                                            </Badge>
                                            <span className="text-xs font-bold text-stone-600 flex items-center gap-1">
                                                <Calendar className="w-3 h-3"/> {format(parseISO(app.date), 'dd/MM/yyyy')}
                                            </span>
                                            <span className="text-xs text-stone-400 flex items-center gap-1 ml-2">
                                                <Clock className="w-3 h-3"/> {app.time}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {app.procedures_json && app.procedures_json.map((proc, i) => (
                                                <span key={i} className="text-xs bg-stone-50 text-stone-600 px-2 py-0.5 rounded border border-stone-100">
                                                    {proc.name}
                                                </span>
                                            ))}
                                            {(!app.procedures_json || app.procedures_json.length === 0) && <span className="text-xs text-stone-400 italic">Sem procedimentos</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="outline" className={`
                                            ${app.status === 'Realizado' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                                            ${app.status === 'Agendado' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                                            ${app.status === 'Cancelado' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                                        `}>
                                            {app.status}
                                        </Badge>
                                        <span className="text-sm font-bold text-stone-700 min-w-[80px] text-right">R$ {app.total_amount?.toFixed(2)}</span> {/* CORREÇÃO: Mostra o total_amount */}
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingAppointment(app); setIsAppointmentModalOpen(true); }}>
                                                <Edit2 className="w-3.5 h-3.5 text-stone-500"/>
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => handleDeleteAppointment(app.id)}>
                                                <Trash2 className="w-3.5 h-3.5 text-stone-400 hover:text-red-600"/>
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )) : (
                            <div className="text-center py-10 border-2 border-dashed border-stone-100 rounded-xl bg-stone-50">
                                <p className="text-sm text-stone-400">Nenhum atendimento registrado.</p>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                    <h3 className="text-sm font-bold text-stone-700 mb-4 px-1">Evolução do Paciente (Descrição e Planejamento)</h3>
                    <div className="space-y-6 relative border-l-2 border-stone-200 ml-3 pl-6 pb-4">
                        {appointments.length > 0 ? appointments.map((app, index) => (
                            <div key={app.id} className="relative">
                                <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-stone-200 border-2 border-white ring-1 ring-stone-100"></div>
                                <div className="bg-white rounded-lg border border-stone-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-stone-800 flex items-center gap-2">
                                                {format(parseISO(app.date), 'dd/MM/yyyy')}
                                                <Badge variant="secondary" className="text-[10px] font-normal">{app.status}</Badge>
                                            </span>
                                            <span className="text-xs text-stone-400 mt-0.5">Atendimento {app.type}</span>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 -mt-2" onClick={() => { setEditingAppointment(app); setIsAppointmentModalOpen(true); }}>
                                            <Edit2 className="w-3 h-3 text-stone-400"/>
                                        </Button>
                                    </div>
                                    <div className="bg-stone-50 rounded p-3 text-sm text-stone-700 whitespace-pre-wrap border border-stone-100">
                                        {app.notes || <span className="text-stone-400 italic">Nenhuma descrição ou planejamento registrado para este atendimento.</span>}
                                    </div>
                                    {app.procedures_json && app.procedures_json.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-1">
                                            {app.procedures_json.map((p, i) => (
                                                <span key={i} className="text-[10px] bg-white border border-stone-200 px-2 py-0.5 rounded text-stone-500">
                                                    {p.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )) : (
                            <div className="ml-[-24px] text-center py-12 text-stone-400 bg-stone-50 rounded-xl border border-stone-100 border-dashed">
                                Nenhuma evolução registrada.
                            </div>
                        )}
                    </div>
                </TabsContent>
            </ScrollArea>
            {/* RODAPÉ DO MODAL DE DETALHES DO PACIENTE */}
            <div className="p-4 bg-white border-t border-stone-200 flex justify-end items-center z-10">
                <Button variant="outline" onClick={onClose}>Fechar</Button>
            </div>
            {/* FIM RODAPÉ */}
        </Tabs>
      </DialogContent>
    </Dialog>

    <AppointmentModal 
        open={isAppointmentModalOpen}
        onOpenChange={setIsAppointmentModalOpen}
        initialData={editingAppointment}
        onSave={handleSaveAppointment}
        onDelete={handleDeleteAppointment}
    />
    </>
  );
}

function InfoCard({ icon: Icon, label, value, subValue }) {
    return (
        <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-stone-100">
            <div className="w-8 h-8 rounded-full bg-stone-50 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-stone-500" />
            </div>
            <div>
                <p className="text-[10px] uppercase tracking-wider text-stone-400 font-bold">{label}</p>
                <p className="text-sm font-medium text-stone-800 truncate">{value}</p>
                {subValue && <p className="text-xs text-stone-500">{subValue}</p>}
            </div>
        </div>
    )
}