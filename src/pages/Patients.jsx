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
import { Plus, Search, Edit2, Trash2, Phone, Mail, Calendar, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const ORIGINS = ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'Indicação', 'Google', 'Campanha', 'Post', 'Video', 'Outro'];
const GENDERS = ['Feminino', 'Masculino', 'Outro'];

export default function Patients() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPatient, setEditingPatient] = useState(null);
  const [deletePatient, setDeletePatient] = useState(null);
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  useEffect(() => { if (urlParams.get('action') === 'new') setIsOpen(true); }, []);

  const { data: patients = [] } = useQuery({ 
    queryKey: ['patients'], 
    queryFn: async () => { 
      const { data } = await supabase.from('patients').select('*').order('created_at', { ascending: false }); 
      return data || []; 
    } 
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
        const { id, ...rest } = data;
        const payload = { 
            ...rest, 
            birth_date: rest.birth_date || null, 
            next_return_date: rest.next_return_date || null,
            scheduled_returns: Array.isArray(rest.scheduled_returns) ? rest.scheduled_returns : []
        };
        
        if (id) {
            const { error } = await supabase.from('patients').update(payload).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('patients').insert([payload]);
            if (error) throw error;
        }
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['patients'] }); 
      setIsOpen(false); 
      setEditingPatient(null); 
      toast.success('Salvo com sucesso!'); 
    },
    onError: (err) => toast.error('Erro ao salvar: ' + err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => await supabase.from('patients').delete().eq('id', id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['patients'] }); setDeletePatient(null); toast.success('Excluído'); }
  });

  const filteredPatients = patients.filter(p => (p.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (p.phone || '').includes(searchTerm));

  return (
    <div className="space-y-6">
      <PageHeader title="Pacientes" subtitle={`${patients.length} cadastrados`} action={<Button onClick={() => { setEditingPatient(null); setIsOpen(true); }} className="bg-stone-800 hover:bg-stone-900"><Plus className="w-4 h-4 sm:mr-2"/> Novo Paciente</Button>} />
      <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400"/><Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 bg-white"/></div>
      
      <div className="grid gap-3">
        {filteredPatients.map((p) => (
          <Card key={p.id} className="bg-white hover:shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1 sm:gap-3 mb-1 sm:mb-2">
                    <h3 className="font-medium text-stone-800 text-sm sm:text-base truncate">{p.full_name}</h3>
                    <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">{p.gender}</Badge>
                    <Badge className="text-[10px] bg-stone-100 text-stone-600">{p.origin}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-stone-500">
                    {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3"/> {p.phone}</span>}
                    {p.email && <span className="flex items-center gap-1 hidden sm:flex"><Mail className="w-3 h-3"/> {p.email}</span>}
                  </div>
                  {(p.next_return_date || (p.scheduled_returns && p.scheduled_returns.length > 0)) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {p.next_return_date && <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50"><Calendar className="w-3 h-3 mr-1"/> Principal: {format(new Date(p.next_return_date), 'dd/MM')}</Badge>}
                        {Array.isArray(p.scheduled_returns) && p.scheduled_returns.map((r, i) => (
                           <Badge key={i} variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                             <Calendar className="w-3 h-3 mr-1"/> {format(new Date(r.date), 'dd/MM')}
                           </Badge>
                        ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setEditingPatient(p); setIsOpen(true); }}><Edit2 className="w-3.5 h-3.5"/></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 text-rose-600" onClick={() => setDeletePatient(p)}><Trash2 className="w-3.5 h-3.5"/></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PatientModal 
        open={isOpen || !!editingPatient} 
        onClose={() => { setIsOpen(false); setEditingPatient(null); }} 
        patient={editingPatient} 
        onSave={(data) => saveMutation.mutate({ ...data, id: editingPatient?.id })} 
      />

      <AlertDialog open={!!deletePatient} onOpenChange={() => setDeletePatient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir?</AlertDialogTitle>
            <AlertDialogDescription>Irreversível.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deletePatient.id)} className="bg-red-600">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PatientModal({ open, onClose, patient, onSave }) {
  const [formData, setFormData] = useState({ full_name: '', phone: '', email: '', birth_date: '', gender: '', cpf: '', address: '', origin: '', protocol: '', notes: '', next_return_date: '', scheduled_returns: [] });
  const [newReturn, setNewReturn] = useState({ date: '', description: '' });

  useEffect(() => { 
      if (patient) {
        setFormData({ 
            full_name: patient.full_name || '', 
            phone: patient.phone || '', 
            email: patient.email || '', 
            birth_date: patient.birth_date || '', 
            gender: patient.gender || '', 
            cpf: patient.cpf || '', 
            address: patient.address || '', 
            origin: patient.origin || '', 
            protocol: patient.protocol || '', 
            notes: patient.notes || '', 
            next_return_date: patient.next_return_date || '', 
            scheduled_returns: patient.scheduled_returns || [] 
        });
      } else {
        setFormData({ full_name: '', phone: '', email: '', birth_date: '', gender: '', cpf: '', address: '', origin: '', protocol: '', notes: '', next_return_date: '', scheduled_returns: [] }); 
      }
      setNewReturn({ date: '', description: '' });
  }, [patient, open]);
  
  const addRet = () => { if(newReturn.date) setFormData({...formData, scheduled_returns: [...(formData.scheduled_returns || []), newReturn]}); setNewReturn({date:'', description:''}); };
  const removeRet = (i) => setFormData({...formData, scheduled_returns: formData.scheduled_returns.filter((_, idx) => idx !== i)});
  const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
            <DialogTitle>{patient ? 'Editar' : 'Novo'} Paciente</DialogTitle>
            <DialogDescription className="hidden">Formulário de paciente</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome *</Label><Input value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} required/></div>
            <div><Label>Telefone *</Label><Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} required/></div>
            <div><Label>Email</Label><Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}/></div>
            <div><Label>Nascimento</Label><Input type="date" value={formData.birth_date} onChange={e => setFormData({...formData, birth_date: e.target.value})}/></div>
            <div><Label>Gênero</Label><Select value={formData.gender} onValueChange={v => setFormData({...formData, gender: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Origem</Label><Select value={formData.origin} onValueChange={v => setFormData({...formData, origin: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{ORIGINS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
            <div className="col-span-2"><Label>Endereço</Label><Input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})}/></div>
            <div className="col-span-2"><Label>Protocolo</Label><Textarea value={formData.protocol} onChange={e => setFormData({...formData, protocol: e.target.value})}/></div>
            <div className="col-span-2"><Label>Notas</Label><Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}/></div>
            <div><Label>Próximo Retorno</Label><Input type="date" value={formData.next_return_date} onChange={e => setFormData({...formData, next_return_date: e.target.value})}/></div>
          </div>
          <div className="p-4 bg-stone-50 rounded-xl space-y-4"><Label>Retornos Adicionais</Label><div className="flex gap-2"><Input type="date" value={newReturn.date} onChange={e => setNewReturn({...newReturn, date: e.target.value})} className="flex-1"/><Input placeholder="Desc" value={newReturn.description} onChange={e => setNewReturn({...newReturn, description: e.target.value})} className="flex-1"/><Button type="button" onClick={addRet} variant="outline"><Plus className="w-4 h-4"/></Button></div>{formData.scheduled_returns?.map((ret, i) => (<div key={i} className="flex gap-2 items-center p-2 bg-white rounded border"><Calendar className="w-4 h-4 text-stone-400"/><span className="text-sm">{format(new Date(ret.date), 'dd/MM')} - {ret.description}</span><Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => removeRet(i)}><X className="w-4 h-4 text-red-500"/></Button></div>))}</div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}