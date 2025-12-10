import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit2, Trash2, Clock, DollarSign, Package, X, CreditCard, Calendar, Check, Send, ListPlus, Wallet, History as HistoryIcon } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const PAYMENT_METHODS = [
  'Pix PJ', 'Pix PF', 'Dinheiro', 'Débito PF', 'Débito PJ', 
  'Crédito PF', 'Crédito PJ', 'Permuta', 'Troca em Procedimento'
];

const formatDateDisplay = (dateString) => {
  if (!dateString) return '';
  return format(new Date(dateString + 'T12:00:00'), 'dd/MM/yyyy');
};

const formatShortDate = (dateString) => {
  if (!dateString) return '';
  return format(new Date(dateString + 'T12:00:00'), 'dd/MM');
};

export default function Appointments() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [deleteAppointment, setDeleteAppointment] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  useEffect(() => { if (urlParams.get('action') === 'new') setIsOpen(true); }, []);

  const { data: appointments = [] } = useQuery({ queryKey: ['appointments'], queryFn: async () => { const { data } = await supabase.from('appointments').select('*').order('date', { ascending: false }); return data || []; } });
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: async () => { const { data } = await supabase.from('patients').select('*'); return data || []; } });
  const { data: procedures = [] } = useQuery({ queryKey: ['procedures'], queryFn: async () => { const { data } = await supabase.from('procedures').select('*'); return data || []; } });
  const { data: materials = [] } = useQuery({ queryKey: ['materials'], queryFn: async () => { const { data } = await supabase.from('materials').select('*'); return data || []; } });
  const { data: allInstallments = [] } = useQuery({ queryKey: ['installments'], queryFn: async () => { const { data } = await supabase.from('installments').select('*'); return data || []; } });

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
        payment_method: formData.payments?.length > 1 ? 'Misto' : (formData.payments?.[0]?.method || ''),
        installments: 1, 
        installment_value: 0
    };
  };

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
                        paid: true, // Cartão sempre entra como pago/recebido
                        is_received: true,
                        received_date: format(new Date(), 'yyyy-MM-dd'), 
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
                    paid: pay.paid_now,
                    is_received: pay.paid_now,
                    received_date: pay.paid_now ? format(new Date(), 'yyyy-MM-dd') : null,
                    payment_method: pay.method,
                    description: `Pagamento (${pay.method}) - ${patientName}`
                });
            }
        });

        if (installmentsArray.length > 0) {
            await supabase.from('installments').insert(installmentsArray);
        }
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

      if (patient.next_return_date === appointmentDate) {
          updates.next_return_date = null;
          updated = true;
      }

      if (Array.isArray(patient.scheduled_returns)) {
          const originalLen = patient.scheduled_returns.length;
          const filteredReturns = patient.scheduled_returns.filter(r => r.date !== appointmentDate);
          if (filteredReturns.length !== originalLen) {
              updates.scheduled_returns = filteredReturns;
              updated = true;
          }
      }

      if (updated) {
          await supabase.from('patients').update(updates).eq('id', patientId);
          queryClient.invalidateQueries({ queryKey: ['patients'] }); 
      }
  };

  const createMutation = useMutation({
    mutationFn: async (formData) => {
      const payload = preparePayload(formData);
      const { data: appointment, error } = await supabase.from('appointments').insert([payload]).select().single();
      if (error) throw error;

      if (payload.materials_used?.length > 0) {
        for (const mat of payload.materials_used) {
          const { data: materialData } = await supabase.from('materials').select('stock_quantity, cost_per_unit').eq('id', mat.material_id).single();
          if (materialData) {
            const newStock = (materialData.stock_quantity || 0) - mat.quantity;
            await supabase.from('stock_movements').insert([{
              material_id: mat.material_id, material_name: mat.material_name, type: 'saida', quantity: mat.quantity,
              previous_stock: materialData.stock_quantity, new_stock: newStock, cost_per_unit: mat.cost, total_cost: mat.cost * mat.quantity,
              reason: `Atendimento ${payload.patient_name}`, date: new Date()
            }]);
            await supabase.from('materials').update({ stock_quantity: newStock }).eq('id', mat.material_id);
          }
        }
      }

      await generateInstallments(formData, appointment.id, payload.patient_name, payload.date);
      await syncPatientReturns(payload.patient_id, payload.next_return_date, payload.scheduled_returns);
      await checkAndClearReturns(payload.patient_id, payload.date, payload.status);

      return appointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setIsOpen(false);
      toast.success('Atendimento salvo!');
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
        queryClient.invalidateQueries({ queryKey: ['patients'] });
        setEditingAppointment(null); 
        toast.success('Atualizado!'); 
    },
    onError: (err) => toast.error('Erro ao atualizar: ' + err.message)
  });

  const quickStatusMutation = useMutation({
    mutationFn: async ({ id, status, patientId, date }) => {
        await supabase.from('appointments').update({ status }).eq('id', id);
        if (status === 'Realizado') {
            await checkAndClearReturns(patientId, date, status);
        }
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['patients'] }); // Atualiza para sumir o aviso
        toast.success('Status atualizado!');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('appointments').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments'] }); setDeleteAppointment(null); toast.success('Excluído'); }
  });

  const handleOpenNewReturn = (patientId, dateStr) => {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;
    
    setEditingAppointment({
        patient_id: patient.id,
        patient_name: patient.full_name,
        date: dateStr, 
        status: 'Agendado',
        is_new_patient: false, 
        notes: [],
        procedures_performed: [],
        materials_used: [],
        payments: []
    });
    setIsOpen(true);
  };

  const filteredAppointments = appointments.filter(a => { const date = new Date(a.date); return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear; });
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);
  const statusColors = { 'Agendado': 'bg-blue-100 text-blue-700', 'Confirmado': 'bg-emerald-100 text-emerald-700', 'Realizado': 'bg-stone-100 text-stone-700', 'Cancelado': 'bg-rose-100 text-rose-700' };
  const paymentMethodColors = { 
      'Pix PJ': 'bg-green-100 text-green-700', 'Pix PF': 'bg-teal-100 text-teal-700', 
      'Dinheiro': 'bg-amber-100 text-amber-700', 'Débito PF': 'bg-blue-100 text-blue-700', 
      'Débito PJ': 'bg-cyan-100 text-cyan-700', 'Crédito PF': 'bg-purple-100 text-purple-700', 
      'Crédito PJ': 'bg-violet-100 text-violet-700', 'Permuta': 'bg-orange-100 text-orange-700', 
      'Troca em Procedimento': 'bg-pink-100 text-pink-700' 
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Atendimentos" subtitle="Registro de consultas" action={<Button onClick={() => { setEditingAppointment(null); setIsOpen(true); }} className="bg-stone-800 hover:bg-stone-900"><Plus className="w-4 h-4 mr-2"/> Novo Atendimento</Button>} />
      <div className="flex flex-wrap gap-3"><Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}><SelectTrigger className="w-36 bg-white"><SelectValue/></SelectTrigger><SelectContent>{months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}</SelectContent></Select><Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}><SelectTrigger className="w-24 bg-white"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select></div>
      
      <div className="space-y-4">{filteredAppointments.map(apt => {
        // Lógica para esconder retornos se já foi realizado
        const showReturns = apt.status === 'Agendado';

        return (
        <Card key={apt.id} className="bg-white border-stone-100">
            <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                            <h3 className={`font-medium text-lg ${apt.status === 'Realizado' ? 'text-green-600 font-bold' : 'text-stone-800'}`}>
                                {apt.patient_name}
                            </h3>
                            
                            <div className="w-[120px]">
                                <Select 
                                    defaultValue={apt.status} 
                                    onValueChange={(val) => quickStatusMutation.mutate({ id: apt.id, status: val, patientId: apt.patient_id, date: apt.date })}
                                >
                                    <SelectTrigger className={`h-6 text-xs border-0 ${statusColors[apt.status] || 'bg-gray-100'}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Agendado">Agendado</SelectItem>
                                        <SelectItem value="Confirmado">Confirmado</SelectItem>
                                        <SelectItem value="Realizado">Realizado</SelectItem>
                                        <SelectItem value="Cancelado">Cancelado</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {apt.is_new_patient ? <Badge variant="outline" className="text-emerald-600 border-emerald-300">Novo Atendimento</Badge> : <Badge variant="outline" className="text-blue-600 border-blue-300">Retorno</Badge>}
                            {apt.payment_method && <Badge className="bg-gray-100 text-gray-600">{apt.payment_method}</Badge>}
                        </div>

                        {showReturns && (apt.next_return_date || (apt.scheduled_returns && apt.scheduled_returns.length > 0)) && (
                            <div className="flex flex-wrap gap-2 mb-3 mt-1">
                                {apt.next_return_date && (
                                    <Badge 
                                        variant="outline" 
                                        className="text-amber-600 border-amber-200 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors"
                                        onClick={() => handleOpenNewReturn(apt.patient_id, apt.next_return_date)}
                                        title="Criar Atendimento deste Retorno"
                                    >
                                        <Calendar className="w-3 h-3 mr-1"/> Principal: {formatShortDate(apt.next_return_date)}
                                    </Badge>
                                )}
                                {Array.isArray(apt.scheduled_returns) && apt.scheduled_returns.map((r, i) => (
                                    <Badge 
                                        key={i} 
                                        variant="outline" 
                                        className="text-blue-600 border-blue-200 bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors"
                                        onClick={() => handleOpenNewReturn(apt.patient_id, r.date)}
                                        title="Criar Atendimento deste Retorno"
                                    >
                                        <Calendar className="w-3 h-3 mr-1"/> Retorno: {formatShortDate(r.date)}
                                    </Badge>
                                ))}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-4 text-sm text-stone-500 mb-3"><span className="flex items-center gap-1"><Clock className="w-3 h-3"/>{formatDateDisplay(apt.date)} {apt.time && `às ${apt.time}`}</span><span className="flex items-center gap-1"><DollarSign className="w-3 h-3"/>R$ {(apt.final_value || 0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div>{apt.procedures_performed?.map((p,i)=><Badge key={i} variant="outline" className="mr-1 mb-1 text-xs">{p.procedure_name}</Badge>)}
                    </div>
                    <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setEditingAppointment(apt)}><Edit2 className="w-4 h-4"/></Button><Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleteAppointment(apt)}><Trash2 className="w-4 h-4"/></Button></div>
                </div>
            </CardContent>
        </Card>)})}</div>
      
      <AppointmentModal 
        open={isOpen || !!editingAppointment} 
        onClose={() => { setIsOpen(false); setEditingAppointment(null); }} 
        appointment={editingAppointment} 
        patients={patients} 
        procedures={procedures} 
        materials={materials} 
        allAppointments={appointments} 
        allInstallments={allInstallments}
        onSave={(data) => { if(editingAppointment?.id) updateMutation.mutate({ id: editingAppointment.id, data }); else createMutation.mutate(data); }} 
        isLoading={createMutation.isPending || updateMutation.isPending} 
      />
      
      <AlertDialog open={!!deleteAppointment} onOpenChange={() => setDeleteAppointment(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogDescription>Irreversível.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(deleteAppointment.id)} className="bg-red-600">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

export function AppointmentModal({ open, onClose, appointment, patients, procedures, materials, allAppointments, allInstallments, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    patient_id: '', patient_name: '', patient_protocol: '', date: format(new Date(), 'yyyy-MM-dd'), time: '', status: 'Agendado',
    notes: [], next_return_date: '', scheduled_returns: [], 
    is_new_patient: false, 
    procedures_performed: [], materials_used: [],
    total_value: 0, total_material_cost: 0, payment_method: '', discount_percent: 0, discount_value: 0, final_value: 0, installments: 1, installment_value: 0,
    payments: [] 
  });
  
  const [currentPayment, setCurrentPayment] = useState({ method: 'Pix PF', value: '', installments: 1, paid_now: true });
  const [newReturn, setNewReturn] = useState({ date: '', description: '', alert_days: 15 });
  const [newNote, setNewNote] = useState({ date: format(new Date(), 'yyyy-MM-dd'), text: '' });

  const patientHistory = formData.patient_id 
    ? allAppointments
        .filter(a => a.patient_id === parseInt(formData.patient_id) && a.status !== 'Cancelado' && a.id !== appointment?.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 3) 
    : [];

  useEffect(() => { 
      if (appointment) {
          const patient = patients.find(p => p.id === appointment.patient_id);
          let initialNotes = [];
          if (appointment.notes) {
              if (Array.isArray(appointment.notes)) initialNotes = appointment.notes;
              else if (typeof appointment.notes === 'string') {
                  try { const parsed = JSON.parse(appointment.notes); initialNotes = Array.isArray(parsed) ? parsed : [{ date: appointment.date, text: appointment.notes }]; } catch (e) { initialNotes = [{ date: appointment.date, text: appointment.notes }]; }
              }
          }

          let reconstructedPayments = [];
          if (allInstallments && allInstallments.length > 0) {
              const aptInstallments = allInstallments.filter(i => i.appointment_id === appointment.id);
              const groups = {};
              aptInstallments.forEach(inst => {
                  if (!groups[inst.payment_method]) {
                      groups[inst.payment_method] = { method: inst.payment_method, value: 0, installments: 0, paid_now: inst.paid };
                  }
                  groups[inst.payment_method].value += inst.value;
                  groups[inst.payment_method].installments = Math.max(groups[inst.payment_method].installments, inst.total_installments || 1);
              });
              reconstructedPayments = Object.values(groups);
          }

          setFormData({ 
              ...appointment, 
              patient_id: appointment.patient_id?.toString() || '', 
              patient_protocol: patient?.protocol || '', 
              time: appointment.time || '', 
              notes: initialNotes, 
              next_return_date: appointment.next_return_date || '', 
              payment_method: appointment.payment_method || '',
              procedures_performed: appointment.procedures_performed || [],
              materials_used: appointment.materials_used || [],
              scheduled_returns: appointment.scheduled_returns || [],
              total_value: appointment.total_value || 0,
              total_material_cost: appointment.total_material_cost || 0,
              discount_percent: appointment.discount_percent || 0,
              discount_value: appointment.discount_value || 0,
              final_value: appointment.final_value || 0,
              installments: appointment.installments || 1,
              installment_value: appointment.installment_value || 0,
              payments: reconstructedPayments 
          }); 
      } else {
          setFormData({ 
              patient_id: '', patient_name: '', patient_protocol: '', date: format(new Date(), 'yyyy-MM-dd'), time: '', status: 'Agendado', 
              notes: [], next_return_date: '', scheduled_returns: [], is_new_patient: false, procedures_performed: [], materials_used: [], 
              total_value: 0, total_material_cost: 0, discount_percent: 0, discount_value: 0, final_value: 0,
              payments: [] 
          }); 
      }
      setNewNote({ date: format(new Date(), 'yyyy-MM-dd'), text: '' });
  }, [appointment, open, patients, allInstallments]);

  const handlePatientChange = (pid) => { 
    const p = patients.find(pat => pat.id === pid); 
    const hasApps = allAppointments.some(a => a.patient_id === pid); 
    setFormData(prev => ({ ...prev, patient_id: pid, patient_name: p?.full_name, patient_protocol: p?.protocol || '', is_new_patient: !hasApps })); 
  };
  
  const recalc = (procs, mats, discount, installs) => { 
      const totalV = procs.reduce((sum, p) => sum + (p.price || 0), 0); 
      const totalC = mats.reduce((sum, m) => sum + (m.cost * m.quantity), 0); 
      const discV = (totalV * (discount / 100)); 
      const finalV = totalV - discV; 
      setFormData(prev => ({ ...prev, procedures_performed: procs, materials_used: mats, total_value: totalV, total_material_cost: totalC, discount_percent: discount, discount_value: discV, final_value: finalV })); 
  };

  const toggleProc = (proc) => { let newProcs = formData.procedures_performed?.find(p => p.procedure_id === proc.id) ? formData.procedures_performed.filter(p => p.procedure_id !== proc.id) : [...(formData.procedures_performed||[]), { procedure_id: proc.id, procedure_name: proc.name, price: proc.has_variable_price ? 0 : (proc.default_price || 0), has_variable_price: proc.has_variable_price }]; recalc(newProcs, formData.materials_used||[], formData.discount_percent); };
  const addMat = (mat) => { if(formData.materials_used?.find(m => m.material_id === mat.id)) return; const newMats = [...(formData.materials_used||[]), { material_id: mat.id, material_name: mat.name, quantity: 1, cost: mat.cost_per_unit || 0 }]; recalc(formData.procedures_performed||[], newMats, formData.discount_percent); };
  const updateMat = (id, qtd) => { const newMats = formData.materials_used?.map(m => m.material_id === id ? { ...m, quantity: parseFloat(qtd)||0 } : m); recalc(formData.procedures_performed||[], newMats, formData.discount_percent); };
  const updateProcPrice = (id, price) => { const newProcs = formData.procedures_performed?.map(p => p.procedure_id === id ? { ...p, price: parseFloat(price)||0 } : p); recalc(newProcs, formData.materials_used||[], formData.discount_percent); };
  
  const addRet = () => { if(newReturn.date) { setFormData(prev => ({...prev, scheduled_returns: [...(prev.scheduled_returns || []), newReturn]})); setNewReturn({date:'',description:'', alert_days: 15}); }};
  const removeRet = (index) => { setFormData(prev => ({ ...prev, scheduled_returns: prev.scheduled_returns.filter((_, i) => i !== index) })); };
  const addNote = () => { if (!newNote.text.trim()) return; setFormData(prev => ({ ...prev, notes: [...(prev.notes || []), newNote] })); setNewNote({ date: format(new Date(), 'yyyy-MM-dd'), text: '' }); };
  const removeNote = (index) => { setFormData(prev => ({ ...prev, notes: prev.notes.filter((_, i) => i !== index) })); };

  const addPayment = () => {
      const val = parseFloat(currentPayment.value);
      if (!val || val <= 0) return toast.error("Valor inválido");
      setFormData(prev => ({ ...prev, payments: [...prev.payments, { ...currentPayment, value: val }] }));
      setCurrentPayment({ method: 'Pix PF', value: '', installments: 1, paid_now: true });
  };
  const removePayment = (index) => { setFormData(prev => ({ ...prev, payments: prev.payments.filter((_, i) => i !== index) })); };
  const totalPaid = formData.payments.reduce((sum, p) => sum + p.value, 0);
  const remaining = (formData.final_value || 0) - totalPaid;
  const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };

  return (
    <Dialog open={open} onOpenChange={onClose}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{appointment ? 'Editar' : 'Novo'} Atendimento</DialogTitle><DialogDescription className="hidden">Formulário</DialogDescription></DialogHeader>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6" id="appointment-form">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2"><Label>Paciente *</Label><Select value={formData.patient_id?.toString() || ''} onValueChange={v => handlePatientChange(parseInt(v))}><SelectTrigger><SelectValue placeholder="Selecione..."/></SelectTrigger><SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.full_name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="col-span-2"><Label>Protocolo</Label><Textarea value={formData.patient_protocol || 'Sem protocolo definido.'} readOnly className="bg-stone-50 text-stone-600 focus:ring-0" rows={2}/></div>
                    <div className="col-span-2 grid grid-cols-2 gap-4">
                        <div><Label>Data</Label><Input type="date" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} required/></div>
                        <div><Label>Tipo</Label><Select value={formData.is_new_patient?.toString()} onValueChange={v => setFormData({...formData, is_new_patient: v === 'true'})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">Novo Atendimento</SelectItem><SelectItem value="false">Retorno</SelectItem></SelectContent></Select></div>
                    </div>
                    <div><Label>Hora</Label><Input type="time" value={formData.time || ''} onChange={e => setFormData({...formData, time: e.target.value})}/></div>
                    <div><Label>Status</Label><Select value={formData.status || 'Agendado'} onValueChange={v => setFormData({...formData, status: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Agendado">Agendado</SelectItem><SelectItem value="Confirmado">Confirmado</SelectItem><SelectItem value="Realizado">Realizado</SelectItem><SelectItem value="Cancelado">Cancelado</SelectItem></SelectContent></Select></div>
                    <div><Label>Próximo Retorno</Label><div className="flex gap-2"><Input type="date" value={formData.next_return_date || ''} onChange={e => setFormData({...formData, next_return_date: e.target.value})}/><Button type="button" variant="outline" size="icon" onClick={() => setFormData({...formData, next_return_date: ''})}><X className="w-4 h-4 text-stone-500"/></Button></div></div>
                </div>

                <div className="p-4 bg-stone-50 rounded"><Label>Retornos Adicionais</Label><div className="flex gap-2"><Input type="date" value={newReturn.date} onChange={e => setNewReturn({...newReturn, date: e.target.value})} className="flex-1"/><Input placeholder="Desc" value={newReturn.description} onChange={e => setNewReturn({...newReturn, description: e.target.value})} className="flex-1"/><Button type="button" onClick={addRet} variant="outline"><Plus className="w-4 h-4"/></Button></div>{formData.scheduled_returns?.map((ret, i) => (<div key={i} className="flex gap-2 bg-white p-2 mt-2 border rounded items-center justify-between"><div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-stone-400"/> {formatDateDisplay(ret.date)} - {ret.description}</div><Button type="button" variant="ghost" size="sm" onClick={() => removeRet(i)}><X className="w-4 h-4 text-red-500"/></Button></div>))}</div>
                
                <div><Label className="mb-2 block">Procedimentos</Label><div className="grid grid-cols-2 gap-2">{procedures.map(proc => <div key={proc.id} onClick={() => toggleProc(proc)} className={`p-3 rounded border cursor-pointer ${formData.procedures_performed?.find(p => p.procedure_id === proc.id) ? 'bg-stone-800 text-white' : 'hover:bg-stone-100'}`}><p className="text-sm">{proc.name}</p></div>)}</div>{formData.procedures_performed?.map(p => p.has_variable_price && <div key={p.procedure_id} className="mt-2 flex items-center gap-2"><Label>{p.procedure_name} (Valor):</Label><Input type="number" value={p.price} onChange={e => updateProcPrice(p.procedure_id, e.target.value)} className="w-32"/></div>)}</div>
                <div><Label className="mb-2 block">Materiais</Label><Select onValueChange={v => addMat(materials.find(m => m.id === parseInt(v)))}><SelectTrigger><SelectValue placeholder="Adicionar..."/></SelectTrigger><SelectContent>{materials.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}</SelectContent></Select>{formData.materials_used?.map(mat => <div key={mat.material_id} className="flex gap-2 mt-2 items-center"><span className="flex-1">{mat.material_name}</span><Input type="number" value={mat.quantity} onChange={e => updateMat(mat.material_id, e.target.value)} className="w-20"/><span className="w-24 text-right">R$ {(mat.cost * mat.quantity).toFixed(2)}</span></div>)}</div>
                
                <div className="bg-stone-50 p-4 rounded-xl space-y-4">
                    <Label className="flex items-center gap-2"><Wallet className="w-4 h-4"/> Pagamentos</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                        <div className="col-span-1 sm:col-span-1"><Label className="text-xs">Método</Label><Select value={currentPayment.method} onValueChange={v => setCurrentPayment(prev => ({...prev, method: v, installments: 1}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{PAYMENT_METHODS.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                        {currentPayment.method.includes('Crédito') && (<div className="col-span-1"><Label className="text-xs">Parcelas</Label><Select value={currentPayment.installments.toString()} onValueChange={v => setCurrentPayment(prev => ({...prev, installments: parseInt(v)}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[1,2,3,4,5,6,7,8,9,10,11,12].map(n=><SelectItem key={n} value={n.toString()}>{n}x</SelectItem>)}</SelectContent></Select></div>)}
                        <div className="col-span-1"><Label className="text-xs">Valor</Label><Input type="number" step="0.01" value={currentPayment.value} onChange={e => setCurrentPayment(prev => ({...prev, value: e.target.value}))} /></div>
                        <div className="col-span-1"><Button type="button" onClick={addPayment} className="w-full bg-stone-800"><Plus className="w-4 h-4"/></Button></div>
                    </div>
                    {!currentPayment.method.includes('Crédito') && (<div className="flex items-center gap-2"><input type="checkbox" id="paid_now" checked={currentPayment.paid_now} onChange={e => setCurrentPayment(prev => ({...prev, paid_now: e.target.checked}))} className="rounded border-stone-300" /><Label htmlFor="paid_now" className="text-xs cursor-pointer">Recebido agora?</Label></div>)}
                    <div className="space-y-2">{formData.payments.map((p, i) => (<div key={i} className="flex justify-between items-center bg-white p-2 rounded border border-stone-200 text-sm"><div><span className="font-medium">{p.method}</span>{p.installments > 1 && <span className="text-xs text-stone-500 ml-1">({p.installments}x)</span>}{p.paid_now && <Badge variant="secondary" className="ml-2 text-[10px] bg-green-100 text-green-700">Pago</Badge>}</div><div className="flex items-center gap-2"><span>R$ {p.value.toFixed(2)}</span><Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => removePayment(i)}><X className="w-3 h-3"/></Button></div></div>))}</div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-200 text-sm"><div><p className="text-xs text-stone-500">Total Serviço</p><p className="font-bold">R$ {(formData.final_value || 0).toFixed(2)}</p></div><div><p className="text-xs text-stone-500">Pago/Lançado</p><p className="text-blue-600 font-bold">R$ {totalPaid.toFixed(2)}</p></div><div><p className="text-xs text-stone-500">Restante</p><p className={`font-bold ${remaining > 0 ? 'text-red-500' : 'text-green-500'}`}>R$ {remaining.toFixed(2)}</p></div></div>
                </div>
                
                <div className="space-y-4 pt-2 border-t border-stone-100">
                    <Label className="text-sm font-semibold text-stone-700">Notas</Label>
                    <div className="flex gap-2 items-center bg-stone-50 p-2 rounded-lg border border-stone-100"><Input type="date" value={newNote.date} onChange={e => setNewNote({...newNote, date: e.target.value})} className="w-36 bg-white" /><Input placeholder="Descreva..." value={newNote.text} onChange={e => setNewNote({...newNote, text: e.target.value})} className="flex-1 bg-white" onKeyDown={(e) => {if(e.key === 'Enter') {e.preventDefault(); addNote()}}} /><Button type="button" onClick={addNote} className="bg-stone-800 w-10 px-0 shrink-0"><Send className="w-4 h-4"/></Button></div>
                    <div className="space-y-2 max-h-48 overflow-auto">{Array.isArray(formData.notes) && formData.notes.map((note, index) => (<div key={index} className="flex items-center gap-3 p-2 bg-white border border-stone-100 rounded-md"><Badge variant="outline" className="bg-stone-50 text-stone-600">{formatDateDisplay(note.date)}</Badge><p className="text-sm text-stone-700 flex-1 truncate">{note.text}</p><Button type="button" variant="ghost" size="icon" onClick={() => removeNote(index)}><Trash2 className="w-3.5 h-3.5"/></Button></div>))}</div>
                </div>
            </form>
        </div>
        <div className="space-y-4 border-l pl-6 border-stone-100"><h4 className="text-sm font-semibold flex items-center gap-2"><HistoryIcon className="w-4 h-4"/> Histórico Recente</h4>{patientHistory.length > 0 ? (<div className="space-y-4">{patientHistory.map(apt => { let notesList = []; if (Array.isArray(apt.notes)) notesList = apt.notes; else if (typeof apt.notes === 'string') { try { const parsed = JSON.parse(apt.notes); notesList = Array.isArray(parsed) ? parsed : [{ date: apt.date, text: apt.notes }]; } catch { notesList = [{ date: apt.date, text: apt.notes }]; } } return (<div key={apt.id} className="relative pb-4 border-b border-stone-50 last:border-0"><div className="text-xs font-bold text-stone-700 mb-1">{formatDateDisplay(apt.date)}</div><div className="flex gap-1 mb-2">{apt.procedures_performed?.map((p, i) => (<Badge key={i} variant="secondary" className="text-[10px] h-5 px-1">{p.procedure_name}</Badge>))}</div>{notesList.length > 0 ? (<div className="space-y-1">{notesList.map((n, idx) => (<div key={idx} className="bg-stone-50 p-2 rounded border border-stone-100"><p className="text-[10px] text-stone-400 mb-0.5">{n.date ? formatDateDisplay(n.date) : ''}</p><p className="text-xs text-stone-600">{n.text}</p></div>))}</div>) : <p className="text-xs text-stone-400 italic">Sem notas.</p>}</div>) })}</div>) : <p className="text-xs text-stone-400 italic">Sem histórico anterior.</p>}</div>
    </div>
    <DialogFooter><Button variant="outline" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="appointment-form" disabled={isLoading}>Salvar</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}