import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Simple navigation bar. Displays different menu options depending on whether
 * the user is logged in. Uses react-router-dom's NavLink to apply active
 * styling.
 */
export default function NavBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="bg-blue-600 text-white">
      <nav className="container mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center space-x-4">
          <span className="font-semibold text-lg">Inventory App</span>
          {user && (
            <>
              <NavLink
                to="/"
                className={({ isActive }) =>
                  `px-2 py-1 rounded ${isActive ? 'bg-blue-700' : ''}`
                }
              >
                Dashboard
              </NavLink>
              <NavLink
                to="/inventory"
                className={({ isActive }) =>
                  `px-2 py-1 rounded ${isActive ? 'bg-blue-700' : ''}`
                }
              >
                Estoque
              </NavLink>
              <NavLink
                to="/categories"
                className={({ isActive }) =>
                  `px-2 py-1 rounded ${isActive ? 'bg-blue-700' : ''}`
                }
              >
                Categorias
              </NavLink>
            </>
          )}
        </div>
        <div>
          {user ? (
            <div className="flex items-center space-x-4">
              <span className="text-sm">{user.email}</span>
              <button
                onClick={handleLogout}
                className="bg-blue-700 hover:bg-blue-800 text-white px-3 py-1 rounded"
              >
                Sair
              </button>
            </div>
          ) : (
            <NavLink
              to="/login"
              className={({ isActive }) =>
                `px-2 py-1 rounded ${isActive ? 'bg-blue-700' : ''}`
              }
            >
              Login
            </NavLink>
          )}
        </div>
      </nav>
    </header>
  );
}