import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createCategory, deleteCategory, getAllCategories, updateCategory } from '../services/api';

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadCategories = () => {
    setLoading(true);
    getAllCategories()
      .then(res => setCategories(res.data || []))
      .catch(() => setMessage('Failed to load categories.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleCreate = async () => {
    if (!newCategory.trim()) return;
    try {
      const res = await createCategory({ name: newCategory.trim() });
      setCategories(prev => [...prev, res.data]);
      setNewCategory('');
      setMessage('Category added.');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to add category.');
    }
  };

  const handleUpdate = async (id) => {
    if (!editingValue.trim()) return;
    try {
      const res = await updateCategory(id, { name: editingValue.trim() });
      setCategories(prev => prev.map(cat => (cat.id === id ? res.data : cat)));
      setEditingId(null);
      setEditingValue('');
      setMessage('Category updated.');
    } catch (err) {
      setMessage('Failed to update category.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteCategory(id);
      setCategories(prev => prev.filter(cat => cat.id !== id));
      setMessage('Category deleted.');
    } catch (err) {
      setMessage('Failed to delete category.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Manage Categories</h1>
        <p className="text-gray-600 mb-6">Add, update, or remove NGO categories.</p>
        {message && <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md p-3 mb-4">{message}</div>}

        <div className="flex gap-3 mb-6">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New category"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
          />
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Add
          </button>
        </div>

        {loading ? (
          <div className="text-gray-600">Loading categories...</div>
        ) : categories.length === 0 ? (
          <div className="text-gray-500">No categories created yet.</div>
        ) : (
          <div className="space-y-3">
            {categories.map(cat => (
              <div key={cat.id} className="border rounded-lg p-3 flex items-center justify-between">
                {editingId === cat.id ? (
                  <input
                    type="text"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                ) : (
                  <span className="font-semibold text-gray-800">{cat.name}</span>
                )}
                <div className="flex gap-2">
                  {editingId === cat.id ? (
                    <button
                      onClick={() => handleUpdate(cat.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded"
                    >
                      Save
                    </button>
                  ) : (
                    <button
                      onClick={() => { setEditingId(cat.id); setEditingValue(cat.name); }}
                      className="px-3 py-1 bg-yellow-500 text-white rounded"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="px-3 py-1 bg-red-600 text-white rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Link to="/admin" className="text-indigo-600 hover:underline">Back to Admin Dashboard</Link>
      </div>
    </div>
  );
}
