import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InventoryProvider } from './context/InventoryContext';
import NavBar from './components/NavBar';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import InventoryList from './pages/InventoryList';
import InventoryForm from './pages/InventoryForm';
import CategoriesPage from './pages/CategoriesPage';

// A wrapper component that protects routes that require authentication.
function PrivateRoute({ children }) {
  const { user } = useAuth();
  // If user is not authenticated, redirect to login page.
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <AuthProvider>
      <InventoryProvider>
        <div className="min-h-screen flex flex-col">
          <NavBar />
          <main className="flex-1 container mx-auto px-4 py-6">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Dashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/inventory"
                element={
                  <PrivateRoute>
                    <InventoryList />
                  </PrivateRoute>
                }
              />
              <Route
                path="/inventory/new"
                element={
                  <PrivateRoute>
                    <InventoryForm />
                  </PrivateRoute>
                }
              />
              <Route
                path="/inventory/:id"
                element={
                  <PrivateRoute>
                    <InventoryForm />
                  </PrivateRoute>
                }
              />
              <Route
                path="/categories"
                element={
                  <PrivateRoute>
                    <CategoriesPage />
                  </PrivateRoute>
                }
              />
            </Routes>
          </main>
        </div>
      </InventoryProvider>
    </AuthProvider>
  );
}