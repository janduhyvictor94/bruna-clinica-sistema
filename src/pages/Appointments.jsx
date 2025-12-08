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
import { Plus, Edit2, Trash2, Clock, DollarSign, Package, X, CreditCard, Calendar } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const PAYMENT_METHODS = ['Pix PJ', 'Pix PF', 'Dinheiro', 'Cartão Débito', 'Cartão Crédito', 'Permuta', 'Troca em Procedimento'];

const formatDateDisplay = (dateString) => {
  if (!dateString) return '';
  return format(new Date(dateString + 'T12:00:00'), 'dd/MM/yyyy');
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
        notes: formData.notes || '',
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
        payment_method: formData.payment_method || '',
        installments: parseInt(formData.installments) || 1,
        installment_value: parseFloat(formData.installment_value) || 0
    };
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

      if (payload.payment_method === 'Cartão Crédito' && payload.installments > 1) {
        const installmentsArray = [];
        for (let i = 1; i <= payload.installments; i++) {
            const dueDate = addMonths(new Date(payload.date), i - 1);
            installmentsArray.push({
                appointment_id: appointment.id,
                patient_name: payload.patient_name,
                installment_number: i,
                total_installments: payload.installments,
                value: payload.installment_value,
                due_date: format(dueDate, 'yyyy-MM-dd'),
                paid: true,
                is_received: true,
                received_date: format(dueDate, 'yyyy-MM-dd'),
                payment_method: 'Cartão Crédito',
                description: `Parcela ${i}/${payload.installments} - ${payload.patient_name}`
            });
        }
        await supabase.from('installments').insert(installmentsArray);
      }
      return appointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      setIsOpen(false);
      toast.success('Atendimento salvo!');
    },
    onError: (err) => toast.error('Erro: ' + err.message)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => { const payload = preparePayload(data); const { error } = await supabase.from('appointments').update(payload).eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments'] }); setEditingAppointment(null); toast.success('Atualizado!'); },
    onError: (err) => toast.error('Erro ao atualizar: ' + err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('appointments').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appointments'] }); setDeleteAppointment(null); toast.success('Excluído'); }
  });

  const filteredAppointments = appointments.filter(a => { const date = new Date(a.date); return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear; });
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const years = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i);
  const statusColors = { 'Agendado': 'bg-blue-100 text-blue-700', 'Confirmado': 'bg-emerald-100 text-emerald-700', 'Realizado': 'bg-stone-100 text-stone-700', 'Cancelado': 'bg-rose-100 text-rose-700' };
  const paymentMethodColors = { 'Pix PJ': 'bg-green-100 text-green-700', 'Pix PF': 'bg-teal-100 text-teal-700', 'Dinheiro': 'bg-amber-100 text-amber-700', 'Cartão Débito': 'bg-blue-100 text-blue-700', 'Cartão Crédito': 'bg-purple-100 text-purple-700', 'Permuta': 'bg-orange-100 text-orange-700', 'Troca em Procedimento': 'bg-pink-100 text-pink-700' };

  return (
    <div className="space-y-6">
      <PageHeader title="Atendimentos" subtitle="Registro de consultas" action={<Button onClick={() => setIsOpen(true)} className="bg-stone-800 hover:bg-stone-900"><Plus className="w-4 h-4 mr-2"/> Novo Atendimento</Button>} />
      <div className="flex flex-wrap gap-3"><Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}><SelectTrigger className="w-36 bg-white"><SelectValue/></SelectTrigger><SelectContent>{months.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}</SelectContent></Select><Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}><SelectTrigger className="w-24 bg-white"><SelectValue/></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-4">{filteredAppointments.map(apt => (<Card key={apt.id} className="bg-white border-stone-100"><CardContent className="p-4"><div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4"><div className="flex-1"><div className="flex flex-wrap items-center gap-3 mb-3"><h3 className="font-medium text-stone-800">{apt.patient_name}</h3><Badge className={statusColors[apt.status]}>{apt.status}</Badge>{apt.is_new_patient && <Badge variant="outline" className="text-emerald-600 border-emerald-300">Novo</Badge>}{apt.payment_method && <Badge className={paymentMethodColors[apt.payment_method]}>{apt.payment_method} {apt.installments > 1 && `${apt.installments}x`}</Badge>}</div><div className="flex flex-wrap gap-4 text-sm text-stone-500 mb-3"><span className="flex items-center gap-1"><Clock className="w-3 h-3"/>{formatDateDisplay(apt.date)} {apt.time && `às ${apt.time}`}</span><span className="flex items-center gap-1"><DollarSign className="w-3 h-3"/>R$ {(apt.final_value || 0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div>{apt.procedures_performed?.map((p,i)=><Badge key={i} variant="outline" className="mr-1 mb-1 text-xs">{p.procedure_name}</Badge>)}</div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setEditingAppointment(apt)}><Edit2 className="w-4 h-4"/></Button><Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleteAppointment(apt)}><Trash2 className="w-4 h-4"/></Button></div></div></CardContent></Card>))}</div>
      <AppointmentModal open={isOpen || !!editingAppointment} onClose={() => { setIsOpen(false); setEditingAppointment(null); }} appointment={editingAppointment} patients={patients} procedures={procedures} materials={materials} allAppointments={appointments} onSave={(data) => { if(editingAppointment) updateMutation.mutate({ id: editingAppointment.id, data }); else createMutation.mutate(data); }} isLoading={createMutation.isPending || updateMutation.isPending} />
      <AlertDialog open={!!deleteAppointment} onOpenChange={() => setDeleteAppointment(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir?</AlertDialogTitle><AlertDialogDescription>Irreversível.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(deleteAppointment.id)} className="bg-red-600">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function AppointmentModal({ open, onClose, appointment, patients, procedures, materials, allAppointments, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    patient_id: '', patient_name: '', patient_protocol: '', date: format(new Date(), 'yyyy-MM-dd'), time: '', status: 'Agendado',
    notes: '', next_return_date: '', scheduled_returns: [], is_new_patient: false, procedures_performed: [], materials_used: [],
    total_value: 0, total_material_cost: 0, payment_method: '', discount_percent: 0, discount_value: 0, final_value: 0, installments: 1, installment_value: 0,
  });
  const [newReturn, setNewReturn] = useState({ date: '', description: '', alert_days: 15 });

  useEffect(() => { 
      if (appointment) {
          const patient = patients.find(p => p.id === appointment.patient_id);
          setFormData({ 
              ...appointment, 
              patient_id: appointment.patient_id?.toString() || '', 
              patient_protocol: patient?.protocol || '', // Carrega protocolo ao editar
              time: appointment.time || '', 
              notes: appointment.notes || '', 
              next_return_date: appointment.next_return_date || '', 
              payment_method: appointment.payment_method || '' 
          }); 
      } else {
          setFormData({ patient_id: '', patient_name: '', patient_protocol: '', date: format(new Date(), 'yyyy-MM-dd'), time: '', status: 'Agendado', notes: '', next_return_date: '', scheduled_returns: [], is_new_patient: false, procedures_performed: [], materials_used: [], total_value: 0, total_material_cost: 0, payment_method: '', discount_percent: 0, discount_value: 0, final_value: 0, installments: 1, installment_value: 0 }); 
      }
  }, [appointment, open, patients]);

  const handlePatientChange = (pid) => { 
    const p = patients.find(pat => pat.id === pid); 
    const hasApps = allAppointments.some(a => a.patient_id === pid); 
    setFormData(prev => ({ 
        ...prev, 
        patient_id: pid, 
        patient_name: p?.full_name, 
        patient_protocol: p?.protocol || '', // Puxa o protocolo do cadastro
        is_new_patient: !hasApps 
    })); 
  };
  
  const recalc = (procs, mats, discount, installs) => { const totalV = procs.reduce((sum, p) => sum + (p.price || 0), 0); const totalC = mats.reduce((sum, m) => sum + (m.cost * m.quantity), 0); const discV = (totalV * (discount / 100)); const finalV = totalV - discV; const installV = installs > 0 ? finalV / installs : finalV; setFormData(prev => ({ ...prev, procedures_performed: procs, materials_used: mats, total_value: totalV, total_material_cost: totalC, discount_percent: discount, discount_value: discV, final_value: finalV, installments: installs, installment_value: installV })); };
  const toggleProc = (proc) => { let newProcs = formData.procedures_performed.find(p => p.procedure_id === proc.id) ? formData.procedures_performed.filter(p => p.procedure_id !== proc.id) : [...formData.procedures_performed, { procedure_id: proc.id, procedure_name: proc.name, price: proc.has_variable_price ? 0 : (proc.default_price || 0), has_variable_price: proc.has_variable_price }]; recalc(newProcs, formData.materials_used, formData.discount_percent, formData.installments); };
  const addMat = (mat) => { if(formData.materials_used.find(m => m.material_id === mat.id)) return; const newMats = [...formData.materials_used, { material_id: mat.id, material_name: mat.name, quantity: 1, cost: mat.cost_per_unit || 0 }]; recalc(formData.procedures_performed, newMats, formData.discount_percent, formData.installments); };
  const updateMat = (id, qtd) => { const newMats = formData.materials_used.map(m => m.material_id === id ? { ...m, quantity: parseFloat(qtd)||0 } : m); recalc(formData.procedures_performed, newMats, formData.discount_percent, formData.installments); };
  const updateProcPrice = (id, price) => { const newProcs = formData.procedures_performed.map(p => p.procedure_id === id ? { ...p, price: parseFloat(price)||0 } : p); recalc(newProcs, formData.materials_used, formData.discount_percent, formData.installments); };
  
  const removeRet = (index) => { setFormData(prev => ({ ...prev, scheduled_returns: prev.scheduled_returns.filter((_, i) => i !== index) })); };
  const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };

  return (
    <Dialog open={open} onOpenChange={onClose}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{appointment ? 'Editar' : 'Novo'} Atendimento</DialogTitle><DialogDescription className="hidden">Formulário</DialogDescription></DialogHeader>
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Paciente *</Label><Select value={formData.patient_id?.toString() || ''} onValueChange={v => handlePatientChange(parseInt(v))}><SelectTrigger><SelectValue placeholder="Selecione..."/></SelectTrigger><SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.full_name}</SelectItem>)}</SelectContent></Select></div>
          {/* CAMPO DE PROTOCOLO (Leitura) */}
          <div className="col-span-2">
            <Label>Protocolo (Cadastro do Paciente)</Label>
            <Textarea value={formData.patient_protocol || 'Sem protocolo definido.'} readOnly className="bg-stone-50 text-stone-600 focus:ring-0" rows={2}/>
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-4">
              <div><Label>Data</Label><Input type="date" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} required/></div>
              <div><Label>Tipo</Label><Select value={formData.is_new_patient?.toString()} onValueChange={v => setFormData({...formData, is_new_patient: v === 'true'})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">Novo Paciente</SelectItem><SelectItem value="false">Recorrente</SelectItem></SelectContent></Select></div>
          </div>
          <div><Label>Hora</Label><Input type="time" value={formData.time || ''} onChange={e => setFormData({...formData, time: e.target.value})}/></div>
          <div><Label>Status</Label><Select value={formData.status || 'Agendado'} onValueChange={v => setFormData({...formData, status: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Agendado">Agendado</SelectItem><SelectItem value="Confirmado">Confirmado</SelectItem><SelectItem value="Realizado">Realizado</SelectItem><SelectItem value="Cancelado">Cancelado</SelectItem></SelectContent></Select></div>
          <div><Label>Retorno</Label><Input type="date" value={formData.next_return_date || ''} onChange={e => setFormData({...formData, next_return_date: e.target.value})}/></div>
      </div>

      <div className="p-4 bg-stone-50 rounded"><Label>Retornos Adicionais</Label><div className="flex gap-2"><Input type="date" value={newReturn.date} onChange={e => setNewReturn({...newReturn, date: e.target.value})} className="flex-1"/><Input placeholder="Desc" value={newReturn.description} onChange={e => setNewReturn({...newReturn, description: e.target.value})} className="flex-1"/><Button type="button" onClick={() => { if(newReturn.date) setFormData(prev => ({...prev, scheduled_returns: [...prev.scheduled_returns, newReturn]})); setNewReturn({date:'',description:''}); }}><Plus className="w-4 h-4"/></Button></div>
      {formData.scheduled_returns?.map((ret, i) => (
        <div key={i} className="flex gap-2 bg-white p-2 mt-2 border rounded items-center justify-between">
            <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-stone-400"/> {formatDateDisplay(ret.date)} - {ret.description}</div>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeRet(i)}><X className="w-4 h-4 text-red-500"/></Button>
        </div>
      ))}
      </div>
      
      <div><Label className="mb-2 block">Procedimentos</Label><div className="grid grid-cols-2 gap-2">{procedures.map(proc => <div key={proc.id} onClick={() => toggleProc(proc)} className={`p-3 rounded border cursor-pointer ${formData.procedures_performed.find(p => p.procedure_id === proc.id) ? 'bg-stone-800 text-white' : 'hover:bg-stone-100'}`}><p className="text-sm">{proc.name}</p></div>)}</div>{formData.procedures_performed.map(p => p.has_variable_price && <div key={p.procedure_id} className="mt-2 flex items-center gap-2"><Label>{p.procedure_name} (Valor):</Label><Input type="number" value={p.price} onChange={e => updateProcPrice(p.procedure_id, e.target.value)} className="w-32"/></div>)}</div>
      <div><Label className="mb-2 block">Materiais</Label><Select onValueChange={v => addMat(materials.find(m => m.id === parseInt(v)))}><SelectTrigger><SelectValue placeholder="Adicionar..."/></SelectTrigger><SelectContent>{materials.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}</SelectContent></Select>{formData.materials_used.map(mat => <div key={mat.material_id} className="flex gap-2 mt-2 items-center"><span className="flex-1">{mat.material_name}</span><Input type="number" value={mat.quantity} onChange={e => updateMat(mat.material_id, e.target.value)} className="w-20"/><span className="w-24 text-right">R$ {(mat.cost * mat.quantity).toFixed(2)}</span></div>)}</div>
      <div className="bg-stone-50 p-4 rounded-xl space-y-4"><div className="grid grid-cols-2 gap-4"><div><Label>Pagamento</Label><Select value={formData.payment_method || ''} onValueChange={v => setFormData(prev => { const n = {...prev, payment_method: v}; if(v!=='Cartão Crédito') {n.installments=1; recalc(prev.procedures_performed, prev.materials_used, prev.discount_percent, 1);} return n;})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{PAYMENT_METHODS.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>{formData.payment_method === 'Cartão Crédito' && <div><Label>Parcelas</Label><Select value={formData.installments.toString()} onValueChange={v => recalc(formData.procedures_performed, formData.materials_used, formData.discount_percent, parseInt(v))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[1,2,3,4,5,6,7,8,9,10,11,12].map(n=><SelectItem key={n} value={n.toString()}>{n}x</SelectItem>)}</SelectContent></Select></div>}</div><div className="grid grid-cols-4 gap-4 pt-2"><div><p className="text-xs text-stone-500">Bruto</p><p>R$ {formData.total_value.toFixed(2)}</p></div><div><p className="text-xs text-stone-500">Custo</p><p className="text-amber-600">R$ {formData.total_material_cost.toFixed(2)}</p></div><div><p className="text-xs text-stone-500">Final</p><p className="font-bold">R$ {formData.final_value.toFixed(2)}</p></div><div><p className="text-xs text-stone-500">Lucro</p><p className="text-emerald-600">R$ {(formData.final_value - formData.total_material_cost).toFixed(2)}</p></div></div></div>
      
      {/* CAMPO DE NOTAS RENOMEADO */}
      <div><Label>Procedimentos Realizados (Notas)</Label><Textarea value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} rows={3}/></div>
      
      <DialogFooter><Button variant="outline" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={isLoading}>Salvar</Button></DialogFooter>
    </form></DialogContent></Dialog>
  );
}