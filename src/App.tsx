import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

import { Home } from "./pages/Home";
import { Shop } from "./pages/Shop";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Contact } from "./pages/Contact";
import { Terms } from "./pages/Terms";
import { Privacy } from "./pages/Privacy";
import { Collections } from "./pages/Collections";
import { NewArrivals } from "./pages/NewArrivals";
import { Profile } from "./pages/Profile";
import { Settings } from "./pages/Settings";
import { Sale } from "./pages/Sale";
import { MainLayout } from "./layouts/MainLayout";
import { AdminRoute } from "./components/AdminRoute";
import { RouteAnalyticsTracker } from "./components/RouteAnalyticsTracker";
import { CategoryPage } from "./pages/CategoryPage";
import { AdminShopify } from "./pages/AdminShopify";
import { AdminRoot } from "./admin/AdminRoot";
import { DashboardPage } from "./admin/pages/DashboardPage";
import { OrdersPage } from "./admin/pages/OrdersPage";
import { ProductsPage } from "./admin/pages/ProductsPage";
import { CustomersPage } from "./admin/pages/CustomersPage";
import { AnalyticsPage } from "./admin/pages/AnalyticsPage";
import { DiscountsPage } from "./admin/pages/DiscountsPage";
import { SettingsPage as AdminSettingsPage } from "./admin/pages/SettingsPage";
import { CollectionsPage } from "./admin/pages/CollectionsPage";
import { CampaignsPage } from "./admin/pages/CampaignsPage";

function AppRoutes() {
  const location = useLocation();
  return (
    <div key={`${location.pathname}${location.search}`} className="route-transition">
        <Routes>
          {/* Routes WITH Navbar */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/category/:slug" element={<CategoryPage />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/new-arrivals" element={<NewArrivals />} />
            <Route path="/sale" element={<Sale />} />

            <Route path="/cart" element={<Cart />} />
            {/* Protected Routes WITH Navbar */}
            <Route path="/orders" element={<Navigate to="/profile#my-orders" replace />} />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Admin Routes */}
          <Route
            path="/admin/*"
            element={
              <AdminRoute>
                <AdminRoot />
              </AdminRoute>
            }
          >
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="collections" element={<CollectionsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="sales" element={<DiscountsPage />} />
            <Route path="discounts" element={<DiscountsPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
            <Route path="shopify" element={<AdminShopify />} />
          </Route>

          {/* Routes WITHOUT Navbar */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RouteAnalyticsTracker />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
