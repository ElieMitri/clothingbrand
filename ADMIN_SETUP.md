# Admin Dashboard Setup Instructions

## Overview
This admin dashboard provides complete control over your e-commerce store with the following features:

### Features Included:
1. **Overview Dashboard**
   - Monthly and total revenue analytics
   - Order statistics
   - Product inventory monitoring
   - Low stock alerts

2. **Product Management**
   - Add new products with all details
   - Edit existing products
   - Delete products
   - Manage product sales/discounts
   - Search and filter products by category
   - Stock management
   - Multi-image support
   - Color variants

3. **Order Management**
   - View all orders
   - Update order status (pending, processing, shipped, delivered)
   - Track order details and totals
   - View customer orders

4. **Sales Management**
   - Add discount percentages to any product
   - Remove sales
   - Automatic price calculation based on discount
   - Track original prices

## Installation Steps

### 1. Add Routes to Your App

In your main App routing file (usually `App.tsx` or similar), add:

```typescript
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminRoute } from './components/AdminRoute';

// Inside your Routes component:
<Route 
  path="/admin" 
  element={
    <AdminRoute>
      <AdminDashboard />
    </AdminRoute>
  } 
/>
```

### 2. Configure Admin Access

Open `AdminRoute.tsx` and update the admin emails list:

```typescript
const adminEmails = [
  'your-admin-email@example.com',
  'another-admin@example.com'
];
```

**Better Option:** Implement a role-based system in Firestore:

1. Add a `users` collection in Firestore
2. Add a `role` field to user documents:
```json
{
  "email": "admin@example.com",
  "role": "admin",
  "created_at": "timestamp"
}
```

3. Update `AdminRoute.tsx` to check the role:
```typescript
const [isAdmin, setIsAdmin] = useState(false);

useEffect(() => {
  const checkAdmin = async () => {
    if (!user) return;
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    setIsAdmin(userDoc.data()?.role === 'admin');
  };
  checkAdmin();
}, [user]);
```

### 3. Add Navigation Link (Optional)

In your header/navbar component, add a link for admins:

```typescript
{user && isAdmin && (
  <Link to="/admin" className="nav-link">
    Admin Dashboard
  </Link>
)}
```

### 4. Firestore Security Rules

Update your Firestore security rules to protect admin operations:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is admin
    function isAdmin() {
      return request.auth != null && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Products - admins can write, everyone can read
    match /products/{productId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    
    // Orders - users can read their own, admins can read/write all
    match /orders/{orderId} {
      allow read: if request.auth != null && 
                     (resource.data.user_id == request.auth.uid || isAdmin());
      allow write: if isAdmin();
    }
    
    // Carts - users can manage their own
    match /carts/{cartId} {
      allow read, write: if request.auth != null && 
                            resource.data.user_id == request.auth.uid;
    }
    
    // Wishlists - users can manage their own
    match /wishlists/{wishlistId} {
      allow read, write: if request.auth != null && 
                            resource.data.user_id == request.auth.uid;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if isAdmin();
    }
  }
}
```

## Usage Guide

### Accessing the Dashboard
1. Log in with an admin account
2. Navigate to `/admin`
3. You'll see three main tabs: Overview, Products, Orders

### Adding a New Product
1. Go to Products tab
2. Click "Add Product" button
3. Fill in all required fields:
   - Name
   - Category & Subcategory
   - Price
   - Stock quantity
   - Description
   - Image URL(s)
   - Colors (comma-separated)
   - Material & Care Instructions
4. Click "Add Product"

### Editing a Product
1. Go to Products tab
2. Find the product you want to edit
3. Click the edit icon (pencil)
4. Modify the fields
5. Click "Update Product"

### Adding/Removing Sales
1. Go to Products tab
2. Find the product
3. In the "Discount Percentage" field at the bottom of each product card
4. Enter the discount percentage (e.g., 50 for 50% off)
5. Press Enter or click the % button
6. The price will automatically update
7. To remove: Set discount to 0

### Managing Orders
1. Go to Orders tab
2. View all orders in the table
3. Change order status using the dropdown
4. Statuses: Pending → Processing → Shipped → Delivered

### Viewing Analytics
1. Go to Overview tab
2. View:
   - Monthly revenue
   - Total revenue
   - Monthly orders
   - Total orders
   - Product inventory
   - Low stock alerts
3. See recent orders at the bottom

## Product Data Structure

When adding products, the system expects:

```typescript
{
  name: string;              // "Premium Cotton T-Shirt"
  price: number;             // 29.99
  original_price?: number;   // 39.99 (if on sale)
  description: string;       // Product description
  image_url: string;         // Main product image URL
  images?: string[];         // Additional image URLs
  category: string;          // "Men", "Women", "Accessories", etc.
  subcategory?: string;      // "T-Shirts", "Pants", etc.
  colors?: string[];         // ["Black", "White", "Navy"]
  stock: number;             // 100
  discount_percentage?: number; // 0-90
  material?: string;         // "100% Cotton"
  care_instructions?: string; // "Machine wash cold..."
  created_at: Timestamp;     // Auto-generated
}
```

## Image URLs

You can use:
1. **Unsplash** (free): `https://images.unsplash.com/photo-...`
2. **Firebase Storage**: Upload to Firebase and use the download URL
3. **CDN**: Any image hosting service
4. **Local server**: If you have image hosting

Example Unsplash URLs for testing:
- `https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800`
- `https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=800`

## Tips & Best Practices

1. **Stock Management**: Keep stock updated to avoid overselling
2. **Low Stock Alerts**: System alerts when stock < 10 items
3. **Discount Strategy**: Use discount_percentage for sales instead of manually changing prices
4. **Image Quality**: Use high-quality images (min 800px width)
5. **Categories**: Keep consistent category naming
6. **Order Status**: Update order status regularly to keep customers informed

## Troubleshooting

### "Access Denied" Error
- Check that your email is in the admin list
- Verify you're logged in
- Check Firestore security rules

### Products Not Showing
- Check Firestore connection
- Verify 'products' collection exists
- Check browser console for errors

### Can't Update Orders
- Verify admin permissions
- Check Firestore security rules
- Ensure order document exists

### Images Not Loading
- Verify image URLs are accessible
- Check CORS settings if using external images
- Try using Unsplash or Firebase Storage

## Next Steps

Consider adding:
1. **Bulk product import** (CSV/Excel upload)
2. **Product categories management**
3. **Customer management**
4. **Inventory alerts** (email notifications)
5. **Sales reports** (PDF/Excel export)
6. **Product reviews management**
7. **Refund processing**
8. **Coupon code system**

## Support

For issues or questions:
1. Check browser console for errors
2. Verify Firebase configuration
3. Check Firestore security rules
4. Review the code comments
