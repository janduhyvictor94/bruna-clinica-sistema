import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; 

export default function PatientModal({ isOpen, onClose, onSave, patientToEdit = null }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    cpf: '',
    birth_date: '',
    gender: 'Feminino',
    city: '',
    address: '',
    origin: 'Instagram',
    notes: ''
  });

  // Preenche os dados se for edição, ou limpa se for novo
  useEffect(() => {
    if (patientToEdit) {
      setFormData({
        full_name: patientToEdit.full_name || '',
        phone: patientToEdit.phone || '',
        email: patientToEdit.email || '',
        cpf: patientToEdit.cpf || '',
        birth_date: patientToEdit.birth_date || '',
        gender: patientToEdit.gender || 'Feminino',
        city: patientToEdit.city || '',
        address: patientToEdit.address || '',
        origin: patientToEdit.origin || 'Instagram',
        notes: patientToEdit.notes || ''
      });
    } else {
      setFormData({
        full_name: '',
        phone: '',
        email: '',
        cpf: '',
        birth_date: '',
        gender: 'Feminino',
        city: '',
        address: '',
        origin: 'Instagram',
        notes: ''
      });
    }
  }, [patientToEdit, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 1. VALIDAÇÃO: Impede salvar se faltar nome
    if (!formData.full_name.trim()) {
      alert("Por favor, preencha o Nome Completo do paciente.");
      return; 
    }

    setLoading(true);

    try {
      // --- CORREÇÃO: Prepara os dados convertendo vazio para null ---
      const dataToSave = {
        full_name: formData.full_name,
        phone: formData.phone.trim() === '' ? null : formData.phone.trim(),
        email: formData.email.trim() === '' ? null : formData.email.trim(),
        cpf: formData.cpf.trim() === '' ? null : formData.cpf.trim(),
        birth_date: formData.birth_date ? formData.birth_date : null,
        gender: formData.gender,
        city: formData.city,
        address: formData.address,
        origin: formData.origin,
        notes: formData.notes
      };

      let error;

      if (patientToEdit) {
        // --- EDIÇÃO ---
        const { error: updateError } = await supabase
          .from('patients')
          .update(dataToSave)
          .eq('id', patientToEdit.id);
        error = updateError;
      } else {
        // --- NOVO CADASTRO ---
        const { error: insertError } = await supabase
          .from('patients')
          .insert([dataToSave]);
        error = insertError;
      }

      if (error) throw error;

      // 3. SUCESSO
      alert(patientToEdit ? 'Dados atualizados com sucesso!' : 'Paciente cadastrado com sucesso!');
      
      if (onSave) onSave(); // Atualiza a lista na tela de trás
      onClose(); // SÓ AGORA fecha o modal

    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar no sistema: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        
        {/* Cabeçalho */}
        <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-bold text-gray-800">
            {patientToEdit ? 'Editar Paciente' : 'Novo Paciente'}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 font-bold text-xl"
          >
            ✕
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Nome Completo (Obrigatório) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
            <input
              type="text"
              name="full_name"
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
              placeholder="Ex: Maria da Silva"
              value={formData.full_name}
              onChange={handleChange}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Telefone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp</label>
              <input
                type="text"
                name="phone"
                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-pink-500 outline-none"
                placeholder="(00) 00000-0000"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                name="email"
                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-pink-500 outline-none"
                placeholder="email@exemplo.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CPF */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
              <input
                type="text"
                name="cpf"
                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-pink-500 outline-none"
                placeholder="000.000.000-00"
                value={formData.cpf}
                onChange={handleChange}
              />
            </div>

            {/* Data Nascimento */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de Nascimento</label>
              <input
                type="date"
                name="birth_date"
                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-pink-500 outline-none"
                value={formData.birth_date}
                onChange={handleChange}
              />
            </div>

            {/* Gênero */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gênero</label>
              <select
                name="gender"
                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-pink-500 outline-none"
                value={formData.gender}
                onChange={handleChange}
              >
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cidade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input
                type="text"
                name="city"
                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-pink-500 outline-none"
                placeholder="Ex: São Paulo"
                value={formData.city}
                onChange={handleChange}
              />
            </div>

            {/* Endereço */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
              <input
                type="text"
                name="address"
                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-pink-500 outline-none"
                placeholder="Rua, Número, Bairro"
                value={formData.address}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Origem */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Como conheceu?</label>
            <select
              name="origin"
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-pink-500 outline-none"
              value={formData.origin}
              onChange={handleChange}
            >
              <option value="Instagram">Instagram</option>
              <option value="Google">Google</option>
              <option value="Indicação">Indicação</option>
              <option value="Passante">Passante</option>
              <option value="Outro">Outro</option>
            </select>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              name="notes"
              rows="3"
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-pink-500 outline-none"
              placeholder="Histórico, alergias, preferências..."
              value={formData.notes}
              onChange={handleChange}
            ></textarea>
          </div>

          {/* Botões de Ação */}
          <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-pink-600 text-white rounded hover:bg-pink-700 transition-colors disabled:opacity-50 font-medium"
            >
              {loading ? 'Salvando...' : (patientToEdit ? 'Salvar Alterações' : 'Cadastrar')}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}