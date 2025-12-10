import React, { useState } from 'react';
import { supabase } from '../supabaseClient'; // Verifique se o caminho está certo

export default function PatientForm({ onClose, onSave }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    cpf: '',
    birth_date: '',
    gender: 'Feminino',
    city: '',
    address: '',
    origin: 'Indicação',
    notes: ''
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Tenta salvar no Supabase
      const { data, error } = await supabase
        .from('patients') // Nome da tabela nova
        .insert([
          {
            full_name: formData.full_name,
            phone: formData.phone,
            cpf: formData.cpf,
            birth_date: formData.birth_date || null, // Se vazio, manda null
            gender: formData.gender,
            city: formData.city,
            address: formData.address,
            origin: formData.origin,
            notes: formData.notes,
            // Campos automáticos novos
            scheduled_returns: [], 
            next_return_date: null
          }
        ]);

      if (error) throw error;

      alert('Paciente cadastrado com sucesso!');
      if (onSave) onSave(); // Atualiza a lista na tela principal
      if (onClose) onClose(); // Fecha o modal

    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar paciente: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4 text-pink-600">Novo Paciente</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Nome Completo */}
          <div>
            <label className="block text-sm font-medium">Nome Completo *</label>
            <input
              type="text"
              name="full_name"
              required
              className="w-full border p-2 rounded"
              value={formData.full_name}
              onChange={handleChange}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Telefone */}
            <div>
              <label className="block text-sm font-medium">Telefone/WhatsApp</label>
              <input
                type="text"
                name="phone"
                className="w-full border p-2 rounded"
                placeholder="(00) 00000-0000"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            {/* CPF */}
            <div>
              <label className="block text-sm font-medium">CPF</label>
              <input
                type="text"
                name="cpf"
                className="w-full border p-2 rounded"
                value={formData.cpf}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Data de Nascimento (Novo) */}
            <div>
              <label className="block text-sm font-medium">Data de Nascimento</label>
              <input
                type="date"
                name="birth_date"
                className="w-full border p-2 rounded"
                value={formData.birth_date}
                onChange={handleChange}
              />
            </div>

            {/* Gênero */}
            <div>
              <label className="block text-sm font-medium">Gênero</label>
              <select
                name="gender"
                className="w-full border p-2 rounded"
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
            {/* Cidade (Novo) */}
            <div>
              <label className="block text-sm font-medium">Cidade</label>
              <input
                type="text"
                name="city"
                className="w-full border p-2 rounded"
                placeholder="Ex: São Paulo"
                value={formData.city}
                onChange={handleChange}
              />
            </div>

            {/* Endereço */}
            <div>
              <label className="block text-sm font-medium">Endereço</label>
              <input
                type="text"
                name="address"
                className="w-full border p-2 rounded"
                value={formData.address}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Origem e Notas */}
          <div>
            <label className="block text-sm font-medium">Como conheceu?</label>
            <select
              name="origin"
              className="w-full border p-2 rounded"
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

          <div>
            <label className="block text-sm font-medium">Observações</label>
            <textarea
              name="notes"
              rows="3"
              className="w-full border p-2 rounded"
              value={formData.notes}
              onChange={handleChange}
            ></textarea>
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-pink-600 text-white rounded hover:bg-pink-700 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Cadastrar Paciente'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}