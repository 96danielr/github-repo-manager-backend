import Category from '../models/Category.js';

const DEFAULT_CATEGORIES = [
  // Income categories
  { name: 'Consultoría', type: 'income', icon: 'Briefcase', color: '#3fb950' },
  { name: 'Préstamos (cobros)', type: 'income', icon: 'HandCoins', color: '#58a6ff' },
  { name: 'Intereses', type: 'income', icon: 'TrendingUp', color: '#d2a8ff' },
  { name: 'Otros ingresos', type: 'income', icon: 'CircleDollarSign', color: '#79c0ff' },

  // Expense categories
  { name: 'Recibos/Servicios', type: 'expense', icon: 'Receipt', color: '#f85149' },
  { name: 'Casa', type: 'expense', icon: 'Home', color: '#ffa657' },
  { name: 'Empleada', type: 'expense', icon: 'UserCheck', color: '#d2a8ff' },
  { name: 'Salidas a comer', type: 'expense', icon: 'UtensilsCrossed', color: '#ff7b72' },
  { name: 'Compras', type: 'expense', icon: 'ShoppingBag', color: '#79c0ff' },
  { name: 'Lujos', type: 'expense', icon: 'Gem', color: '#d2a8ff' },
  { name: 'Alma', type: 'expense', icon: 'Heart', color: '#f778ba' },
  { name: 'Tarjetas de crédito', type: 'expense', icon: 'CreditCard', color: '#ffa657' },
  { name: 'Préstamos otorgados', type: 'expense', icon: 'Banknote', color: '#e3b341' },
  { name: 'Otros gastos', type: 'expense', icon: 'MoreHorizontal', color: '#8b949e' },
];

export const seedDefaultCategories = async (userId) => {
  const categories = DEFAULT_CATEGORIES.map(cat => ({
    ...cat,
    user: userId,
    isDefault: true,
  }));

  await Category.insertMany(categories);
};
