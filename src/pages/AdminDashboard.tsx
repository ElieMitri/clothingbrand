import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Plus,
  Edit,
  Trash2,
  Menu,
  Search,
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Package,
  Users,
  X,
  Save,
  Percent,
  Star,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Mail,
  AlertCircle,
  Download,
  RefreshCw,
} from "lucide-react";
import { db, storage } from "../lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  Timestamp,
  getDoc,
  getDocs,
  limit,
  setDoc,
  onSnapshot,
  writeBatch,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useAuth } from "../contexts/AuthContext";
import {
  OrderStatus,
  updateOrderStatusWithInventory,
} from "../lib/orderLogic";
import {
  ProductAudience,
  audienceLabelMap,
  normalizeProductAudience,
} from "../lib/productAudience";
import {
  ProductAuthenticity,
  normalizeProductAuthenticity,
} from "../lib/productAuthenticity";
import {
  getDefaultApparelSizes,
  getDefaultGloveSizes,
  getDefaultOneSizeSizes,
  getDefaultShoeSizeGuide,
  getDefaultShoeSizes,
} from "../lib/productSizing";

type DateField = Timestamp | Date | string | null | undefined;
type CsvValue = string | number | boolean | null | undefined;

interface Product {
  id: string;
  name: string;
  brand?: string;
  product_type?: string;
  sku?: string;
  price: number;
  cost_price: number;
  original_price?: number;
  commission_percentage?: number;
  description: string;
  image_url: string;
  category: string;
  subcategory?: string;
  audience?: ProductAudience;
  authenticity?: ProductAuthenticity;
  images?: string[];
  colors?: string[];
  color_images?: Record<string, string>;
  color_galleries?: Record<string, string[]>;
  sizes?: string[];
  size_stock?: Record<string, number>;
  size_guide?: string;
  stock?: number;
  sold_out?: boolean;
  sold_out_sizes?: string[];
  discount_percentage?: number;
  material?: string;
  care_instructions?: string;
  tags?: string[];
  flavor?: string;
  net_weight?: string;
  is_featured?: boolean;
  is_new_arrival?: boolean;
  source_url?: string;
  created_at: DateField;
}

interface OrderLineItem {
  product_id: string;
  product_name?: string;
  product_image?: string;
  category?: string;
  size?: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  user_id?: string;
  user_email?: string;
  items: OrderLineItem[];
  total: number;
  subtotal?: number;
  shipping?: number;
  tax?: number;
  status: OrderStatus;
  cancel_reason?: string;
  status_note?: string;
  exchange_processed_at?: DateField;
  created_at: DateField;
}

interface Subscriber {
  id: string;
  email: string;
  subscribed_at: DateField;
  sent_emails: number;
}

interface AdminUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phone?: string;
  countryCode?: string;
  address?: string;
  addressDetails?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  provider?: string;
  subscribeNewsletter?: boolean;
  notificationPreferences?: Partial<NotificationPreferences>;
  createdAt?: DateField;
  updatedAt?: DateField;
}

interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  location: string;
  provider: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderDate: Date | null;
  subscribedNewsletter: boolean;
  preferences: NotificationPreferences;
  createdAt?: DateField;
  updatedAt?: DateField;
  address?: string;
  addressDetails?: string;
}

interface NotificationPreferences {
  orderUpdates: boolean;
  promotions: boolean;
  newsletter: boolean;
}

type WebNotificationCategory =
  | "general"
  | "orderUpdates"
  | "promotions"
  | "newsletter";

interface WebNotificationTemplate {
  id: string;
  label: string;
  category: WebNotificationCategory;
  title: string;
  message: string;
}

const isCancelledOrder = (status?: string) => {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "cancelled" || normalized === "canceled";
};

interface SubscriberView extends Subscriber {
  preferences: NotificationPreferences;
}

interface CollectionEntry {
  id: string;
  name: string;
  description: string;
  image_url: string;
  season?: string;
  year?: number;
  product_count?: number;
  is_active?: boolean;
  created_at?: DateField;
}

interface HomeCategoryEntry {
  id: string;
  name: string;
  slug: string;
  image_url: string;
}

interface ShopMenuItemEntry {
  id: string;
  label: string;
  path: string;
  special?: boolean;
}
interface ColorImageLinkRow {
  id: string;
  color: string;
  url: string;
}
interface ColorGalleryRow {
  id: string;
  color: string;
  urls: string;
}
interface LinkImportProduct {
  name: string;
  description?: string;
  brand?: string;
  sku?: string;
  category?: string;
  product_type?: string;
  image_url?: string;
  images?: string[];
  price?: number;
  original_price?: number;
  commission_percentage?: number;
  colors?: string[];
  source_url?: string;
}

interface Analytics {
  totalRevenue: number;
  monthlyRevenue: number;
  totalProfit: number;
  monthlyProfit: number;
  totalOrders: number;
  monthlyOrders: number;
  totalProducts: number;
  lowStockProducts: number;
  profitMargin: number;
  totalSubscribers: number;
}

interface MonthlyRevenue {
  month: string;
  year: number;
  revenue: number;
  profit: number;
  orders: number;
}

interface QuickAddProductPreset {
  id: string;
  label: string;
  category: string;
  subcategory?: string;
  product_type?: string;
}
type UploadImageItem = {
  file: File;
  id: string;
};

type AdminTab =
  | "overview"
  | "products"
  | "orders"
  | "users"
  | "featured"
  | "collections"
  | "subscribers";

const slugifyPathToken = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toDisplayCategoryFromToken = (value: string) => {
  const token = slugifyPathToken(value);
  if (!token) return "";
  if (token === "gym" || token === "gym-crossfit" || token === "crossfit") {
    return "Gym";
  }
  if (
    token === "martial-arts" ||
    token.includes("muay-thai") ||
    token === "muaythai" ||
    token.includes("boxing") ||
    token === "mma" ||
    token.includes("combat") ||
    token === "sports"
  ) {
    return "Martial Arts";
  }
  return token
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const suggestShopMenuPath = (label: string) => {
  const token = slugifyPathToken(label);
  if (!token) return "";
  if (token === "sale") return "/sale";
  if (token === "new-arrivals" || token === "new-arrival") return "/new-arrivals";
  if (token === "collections" || token === "collection") return "/collections";
  if (token === "shop" || token === "shop-all") return "/shop";
  const categoryLabel = toDisplayCategoryFromToken(label) || toDisplayCategoryFromToken(token);
  return categoryLabel
    ? `/shop?category=${encodeURIComponent(categoryLabel)}`
    : "/shop";
};

const normalizeHomepageShopPath = (rawPath: string) => {
  const trimmed = String(rawPath || "").trim();
  if (!trimmed) return "";
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  const categoryPrefixMatch = path.match(/^\/category\/([^/?#]+)/i);
  if (!categoryPrefixMatch) return path;

  const categorySlug = decodeURIComponent(categoryPrefixMatch[1] || "");
  const categoryLabel = toDisplayCategoryFromToken(categorySlug);
  if (!categoryLabel) return "/shop";
  return `/shop?category=${encodeURIComponent(categoryLabel)}`;
};

const normalizeHomeCategorySlug = (value: string) => {
  const token = slugifyPathToken(value);
  if (!token) return "";
  if (
    token === "martial-arts" ||
    token === "sports" ||
    token.includes("muay-thai") ||
    token === "muaythai" ||
    token.includes("boxing") ||
    token.includes("combat") ||
    token === "mma"
  ) {
    return "martial-arts";
  }
  if (token === "crossfit" || token === "gym-crossfit") {
    return "gym";
  }
  return token;
};

const buildAutoSku = (category: string, name: string) =>
  `${slugifyPathToken(category)}-${slugifyPathToken(name)}`
    .replace(/^-+|-+$/g, "")
    .toUpperCase();

const normalizeAdminProductTaxonomy = (
  categoryValue: string,
  subcategoryValue?: string | null,
  productTypeValue?: string | null
) => {
  const category = String(categoryValue || "").trim();
  const subcategory = String(subcategoryValue || "").trim();
  const productType = String(productTypeValue || "").trim();

  // Avoid generic top-level "Sports" tabs in Shop:
  // Sports -> Muay Thai -> Shin Guards
  // becomes:
  // Category: Muay Thai, Subcategory: Shin Guards
  if (slugifyPathToken(category) === "sports" && subcategory) {
    return {
      category: subcategory,
      subcategory: productType || "",
      productType,
    };
  }

  return { category, subcategory, productType };
};

const quickAddProductPresets: QuickAddProductPreset[] = [
  { id: "football", label: "Football", category: "Football" },
  { id: "futsal", label: "Futsal", category: "Futsal" },
  { id: "basketball", label: "Basketball", category: "Basketball" },
  { id: "running", label: "Running", category: "Running" },
  { id: "boxing", label: "Boxing", category: "Boxing" },
  { id: "muay-thai", label: "Muay Thai", category: "Muay Thai" },
  { id: "padel", label: "Padel", category: "Padel" },
  { id: "tennis", label: "Tennis", category: "Tennis" },
  { id: "swimming", label: "Swimming", category: "Swimming" },
  { id: "gym", label: "Gym / Crossfit", category: "Crossfit" },
  {
    id: "accessories",
    label: "Accessories",
    category: "Accessories",
    subcategory: "Accessories",
    product_type: "Accessories",
  },
  {
    id: "bags",
    label: "Bags",
    category: "Accessories",
    subcategory: "Bags",
    product_type: "Bags",
  },
  {
    id: "bands",
    label: "Bands",
    category: "Accessories",
    subcategory: "Bands",
    product_type: "Bands",
  },
  {
    id: "herbal-supplements",
    label: "Herbal Supplements",
    category: "Herbal Supplements",
    subcategory: "Supplements",
    product_type: "Herbal Supplement",
  },
];

export function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [isSideNavOpen, setIsSideNavOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [userPreferencesByEmail, setUserPreferencesByEmail] = useState<
    Record<string, NotificationPreferences>
  >({});
  const [collectionsData, setCollectionsData] = useState<CollectionEntry[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({
    totalRevenue: 0,
    monthlyRevenue: 0,
    totalProfit: 0,
    monthlyProfit: 0,
    totalOrders: 0,
    monthlyOrders: 0,
    totalProducts: 0,
    lowStockProducts: 0,
    profitMargin: 0,
    totalSubscribers: 0,
  });
  const [monthlyRevenueHistory, setMonthlyRevenueHistory] = useState<
    MonthlyRevenue[]
  >([]);

  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [orderSearchTerm, setOrderSearchTerm] = useState("");
  const [orderStatusTab, setOrderStatusTab] = useState<
    "pending" | "processing" | "shipped" | "delivered" | "cancelled"
  >("pending");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [subscriberSearchTerm, setSubscriberSearchTerm] = useState("");
  const [collectionSearchTerm, setCollectionSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [bulkCommissionCategory, setBulkCommissionCategory] = useState("all");
  const [bulkCommissionPercentage, setBulkCommissionPercentage] = useState(0);
  const [applyingBulkCommission, setApplyingBulkCommission] = useState(false);
  const [sourceCommissionUrl, setSourceCommissionUrl] = useState("");
  const [sourceCommissionPercentage, setSourceCommissionPercentage] =
    useState(0);
  const [applyingSourceCommission, setApplyingSourceCommission] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [visibleProductCount, setVisibleProductCount] = useState(24);
  const [openCategoryTreeNodes, setOpenCategoryTreeNodes] = useState<string[]>(
    []
  );
  const [openSubcategoryTreeNodes, setOpenSubcategoryTreeNodes] = useState<
    string[]
  >([]);
  const [categoryTreeQuery, setCategoryTreeQuery] = useState("");
  const [saleSettings, setSaleSettings] = useState({
    sale_title: "SEASONAL SALE",
    sale_headline: "UP TO 70% OFF",
    sale_subtitle: "Limited Time Offer",
    end_at_input: "",
  });
  const [savingSaleSettings, setSavingSaleSettings] = useState(false);
  const defaultHomeCategories: HomeCategoryEntry[] = [];
  const defaultShopMenuItems: ShopMenuItemEntry[] = [];
  const [homepageSettings, setHomepageSettings] = useState({
    hero_image_url: "",
    today_pick_product_id: "",
    home_categories: defaultHomeCategories,
    home_collection_ids: [] as string[],
    shop_menu_items: defaultShopMenuItems,
  });
  const [savingHomepageSettings, setSavingHomepageSettings] = useState(false);

  // Edit/Add Product Modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productEntryMode, setProductEntryMode] = useState<"manual" | "link">(
    "manual"
  );
  const [importUrl, setImportUrl] = useState("");
  const [importingFromLink, setImportingFromLink] = useState(false);
  const [addingImportedProducts, setAddingImportedProducts] = useState(false);
  const [deletingImportedProducts, setDeletingImportedProducts] = useState(false);
  const [importedProducts, setImportedProducts] = useState<LinkImportProduct[]>(
    []
  );
  const [selectedImportedIndices, setSelectedImportedIndices] = useState<
    number[]
  >([]);
  const [importError, setImportError] = useState("");
  const [productForm, setProductForm] = useState({
    name: "",
    brand: "",
    product_type: "",
    sku: "",
    price: 0,
    cost_price: 0,
    original_price: 0,
    commission_percentage: 0,
    description: "",
    image_url: "",
    category: "Men",
    subcategory: "",
    audience: "men" as ProductAudience,
    authenticity: "original" as ProductAuthenticity,
    stock: 0,
    sold_out: false,
    sold_out_sizes: "",
    discount_percentage: 0,
    material: "",
    care_instructions: "",
    tags: "",
    flavor: "",
    net_weight: "",
    colors: "",
    sizes: "",
    images: "",
    color_image_links: "",
    color_gallery_links: "",
    size_guide: "",
    is_featured: false,
    is_new_arrival: false,
  });
  const [colorImageRows, setColorImageRows] = useState<ColorImageLinkRow[]>([]);
  const [colorGalleryRows, setColorGalleryRows] = useState<ColorGalleryRow[]>(
    []
  );
  const [mainImageUpload, setMainImageUpload] = useState<UploadImageItem | null>(
    null
  );
  const [additionalImageUploads, setAdditionalImageUploads] = useState<
    UploadImageItem[]
  >([]);
  const [mainImagePreviewUrl, setMainImagePreviewUrl] = useState("");
  const [additionalImagePreviewUrls, setAdditionalImagePreviewUrls] = useState<
    string[]
  >([]);
  const [savingProductImages, setSavingProductImages] = useState(false);

  // Edit Order Modal
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderForm, setOrderForm] = useState({
    user_email: "",
    total: 0,
    subtotal: 0,
    shipping: 0,
    tax: 0,
    status: "pending",
    items: [] as OrderLineItem[],
  });

  const [editingCollection, setEditingCollection] =
    useState<CollectionEntry | null>(null);
  const [collectionForm, setCollectionForm] = useState({
    name: "",
    description: "",
    image_url: "",
    season: "Spring",
    year: new Date().getFullYear(),
    product_count: 0,
    is_active: true,
  });

  // Email Modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailForm, setEmailForm] = useState({
    subject: "",
    message: "",
  });
  const [showWebNotificationModal, setShowWebNotificationModal] = useState(false);
  const [webNotificationForm, setWebNotificationForm] = useState({
    title: "",
    message: "",
    category: "general" as WebNotificationCategory,
  });
  const [sendingDiscordTest, setSendingDiscordTest] = useState(false);
  const [discordTestMessage, setDiscordTestMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [featuredToAddId, setFeaturedToAddId] = useState("");
  const [newArrivalToAddId, setNewArrivalToAddId] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const getSaleReminderText = () => {
    if (!saleSettings.end_at_input) return "Our sale is live now for a limited time.";
    const endAt = new Date(saleSettings.end_at_input);
    if (Number.isNaN(endAt.getTime())) {
      return "Our sale is live now for a limited time.";
    }
    return `Our sale ends on ${endAt.toLocaleString()}.`;
  };

  const notificationTemplates: WebNotificationTemplate[] = [
    {
      id: "sale-reminder",
      label: "Sale Reminder",
      category: "promotions",
      title: saleSettings.sale_title || "Sale Reminder",
      message: `${saleSettings.sale_subtitle || "Limited-time offer"}. ${getSaleReminderText()}`,
    },
    {
      id: "last-chance-sale",
      label: "Last Chance Sale",
      category: "promotions",
      title: "Last Chance: Sale Ending Soon",
      message:
        "Final hours to shop your favorites at discounted prices. Tap Sale now before it ends.",
    },
    {
      id: "new-drop",
      label: "New Drop",
      category: "promotions",
      title: "New Arrivals Just Dropped",
      message:
        "Fresh pieces are now live. Open the store to shop sizes before they sell out.",
    },
    {
      id: "restock",
      label: "Restock Alert",
      category: "promotions",
      title: "Popular Items Restocked",
      message:
        "Requested styles are back in stock. Shop now while inventory lasts.",
    },
    {
      id: "order-delay",
      label: "Order Delay Update",
      category: "orderUpdates",
      title: "Shipping Timeline Update",
      message:
        "Some orders may take a little longer than expected. Thanks for your patience while your order is being processed.",
    },
  ];

  // Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    danger?: boolean;
  } | null>(null);

  useEffect(() => {
    const section = String(location.pathname.split("/")[2] || "").toLowerCase();
    const tabBySection: Record<string, AdminTab> = {
      overview: "overview",
      dashboard: "overview",
      analytics: "overview",
      products: "products",
      orders: "orders",
      customers: "users",
      users: "users",
      discounts: "featured",
      settings: "featured",
      featured: "featured",
      collections: "collections",
      subscribers: "subscribers",
      campaigns: "subscribers",
      newsletter: "subscribers",
    };
    const nextTab = tabBySection[section];
    if (nextTab && nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, location.pathname]);

  const categories = useMemo(() => {
    const fromProducts = products
      .map((product) => product.category?.trim())
      .filter((category): category is string => Boolean(category));
    const fromHomeSettings = homepageSettings.home_categories
      .map((entry) => entry.name?.trim())
      .filter((name): name is string => Boolean(name));
    return Array.from(new Set([...fromProducts, ...fromHomeSettings])).sort(
      (a, b) => a.localeCompare(b)
    );
  }, [products, homepageSettings.home_categories]);
  const suggestedCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...categories,
          "Men",
          "Women",
          "Kids",
          "Unisex",
          "Apparel",
          "Activewear",
          "Training",
          "Shoes",
          "Socks",
          "Running Shoes",
          "Football Boots",
          "Futsal Shoes",
          "Basketball Shoes",
          "Tennis Shoes",
          "Muay Thai",
          "Boxing",
          "MMA",
          "Martial Arts",
          "Running",
          "Football",
          "Futsal",
          "Padel",
          "Tennis",
          "Basketball",
          "Volleyball",
          "Swimming",
          "Cycling",
          "Crossfit",
          "Gym Wear",
          "Gym Gear",
          "Supplements",
          "Herbal Supplements",
          "Vitamins",
          "Wellness",
          "Recovery",
          "Gym Supplements",
          "Sports Equipment",
          "Accessories",
          "Bags",
          "Hydration",
        ])
      ).sort((a, b) => a.localeCompare(b)),
    [categories]
  );
  const suggestedBrandOptions = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => String(product.brand || "").trim())
            .filter(Boolean)
            .concat([
              "Nike",
              "Adidas",
              "Puma",
              "Under Armour",
              "Reebok",
              "New Balance",
              "Asics",
              "Mizuno",
              "Yonex",
              "Babolat",
              "Head",
              "Wilson",
              "Everlast",
              "Twins Special",
              "Fairtex",
              "Venum",
              "Title Boxing",
              "Bad Boy",
              "Rival",
              "RDX",
              "Leone 1947",
              "Muscle Madness",
              "Optimum Nutrition",
              "Applied Nutrition",
              "Kevin Levrone",
              "Nutrex",
              "Real Pharm",
              "Perfect Sports",
              "BioTechUSA",
              "MyProtein",
              "Dymatize",
              "BSN",
              "Cellucor",
              "Now Sports",
              "Nature's Bounty",
              "Solgar",
              "Himalaya",
            ])
        )
      ).sort((a, b) => a.localeCompare(b)),
    [products]
  );
  const suggestedTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => String(product.product_type || "").trim())
            .filter(Boolean)
            .concat([
              "T-Shirt",
              "Tank Top",
              "Long Sleeve",
              "Hoodie",
              "Sweatshirt",
              "Jacket",
              "Joggers",
              "Leggings",
              "Shorts",
              "Tracksuit",
              "Sports Bra",
              "Compression Top",
              "Compression Shorts",
              "Socks",
              "Cap",
              "Backpack",
              "Gym Bag",
              "Bottle",
              "Shaker",
              "Fitness Gloves",
              "Lifting Belt",
              "Resistance Band",
              "Skipping Rope",
              "MMA Gloves",
              "Boxing Gloves",
              "Shin Guards",
              "Hand Wraps",
              "Mouthguard",
              "Running Shoes",
              "Football Boots",
              "Futsal Shoes",
              "Basketball Shoes",
              "Tennis Shoes",
              "Whey",
              "Creatine",
              "Amino Acid",
              "Pre Workout",
              "Vitamins",
              "Mass Gainer",
              "Protein Powder",
              "Herbal Supplement",
              "Herbal Tea",
              "Ashwagandha",
              "Omega 3",
              "Multivitamin",
              "Electrolytes",
              "Collagen",
              "Joint Support",
              "Fat Burner",
              "Energy Gel",
              "Accessories",
            ])
        )
      ).sort((a, b) => a.localeCompare(b)),
    [products]
  );
  const suggestedSubcategoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => String(product.subcategory || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [products]
  );
  const suggestedSubcategoryByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    products.forEach((product) => {
      const category = String(product.category || "").trim();
      const subcategory = String(product.subcategory || "").trim();
      if (!category || !subcategory) return;
      if (!map.has(category)) map.set(category, []);
      map.get(category)?.push(subcategory);
    });

    const normalized: Record<string, string[]> = {};
    Array.from(map.entries()).forEach(([category, entries]) => {
      normalized[category] = Array.from(new Set(entries)).sort((a, b) =>
        a.localeCompare(b)
      );
    });
    return normalized;
  }, [products]);
  const categoryTree = useMemo(() => {
    const normalize = (value: string | null | undefined) =>
      String(value || "").trim();
    const treeMap = new Map<
      string,
      {
        directTypes: Set<string>;
        subcategories: Map<string, Set<string>>;
      }
    >();

    const ensureCategoryNode = (category: string) => {
      if (!treeMap.has(category)) {
        treeMap.set(category, {
          directTypes: new Set<string>(),
          subcategories: new Map<string, Set<string>>(),
        });
      }
      return treeMap.get(category)!;
    };

    const addTreeEntry = (
      categoryValue: string | null | undefined,
      subcategoryValue?: string | null,
      productTypeValue?: string | null
    ) => {
      const category = normalize(categoryValue);
      if (!category) return;

      const subcategory = normalize(subcategoryValue);
      const productType = normalize(productTypeValue);
      const categoryNode = ensureCategoryNode(category);

      if (subcategory) {
        if (!categoryNode.subcategories.has(subcategory)) {
          categoryNode.subcategories.set(subcategory, new Set<string>());
        }
        if (productType) {
          categoryNode.subcategories.get(subcategory)?.add(productType);
        }
        return;
      }

      if (productType) {
        categoryNode.directTypes.add(productType);
      }
    };

    products.forEach((product) =>
      addTreeEntry(product.category, product.subcategory, product.product_type)
    );
    quickAddProductPresets.forEach((preset) =>
      addTreeEntry(preset.category, preset.subcategory, preset.product_type)
    );
    categories.forEach((category) => addTreeEntry(category));

    return Array.from(treeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, node]) => ({
        category,
        directTypes: Array.from(node.directTypes).sort((a, b) =>
          a.localeCompare(b)
        ),
        subcategories: Array.from(node.subcategories.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, types]) => ({
            name,
            types: Array.from(types).sort((a, b) => a.localeCompare(b)),
          })),
      }));
  }, [categories, products]);
  const filteredCategoryTree = useMemo(() => {
    const query = categoryTreeQuery.trim().toLowerCase();
    if (!query) return categoryTree;

    return categoryTree
      .map((categoryNode) => {
        const categoryMatches = categoryNode.category.toLowerCase().includes(query);

        const matchedSubcategories = categoryNode.subcategories
          .map((subcategoryNode) => {
            const subcategoryMatches = subcategoryNode.name
              .toLowerCase()
              .includes(query);
            const matchedTypes = subcategoryNode.types.filter((productType) =>
              productType.toLowerCase().includes(query)
            );

            if (subcategoryMatches) return subcategoryNode;
            if (matchedTypes.length > 0) {
              return { ...subcategoryNode, types: matchedTypes };
            }
            return null;
          })
          .filter(
            (
              node
            ): node is { name: string; types: string[] } => node !== null
          );

        const matchedDirectTypes = categoryNode.directTypes.filter((productType) =>
          productType.toLowerCase().includes(query)
        );

        if (categoryMatches) return categoryNode;
        if (matchedSubcategories.length > 0 || matchedDirectTypes.length > 0) {
          return {
            ...categoryNode,
            subcategories: matchedSubcategories,
            directTypes: matchedDirectTypes,
          };
        }
        return null;
      })
      .filter(
        (
          node
        ): node is {
          category: string;
          directTypes: string[];
          subcategories: { name: string; types: string[] }[];
        } => node !== null
      );
  }, [categoryTree, categoryTreeQuery]);
  const suggestedTagOptions = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .flatMap((product) => product.tags || [])
            .map((tag) => String(tag || "").trim())
            .filter(Boolean)
            .concat([
              "training",
              "performance",
              "gym",
              "lifestyle",
              "new",
              "sale",
              "combat",
              "supplement",
              "herbal",
              "football",
              "running",
              "basketball",
              "tennis",
              "boxing",
              "mma",
              "apparel",
              "footwear",
              "accessories",
              "recovery",
            ])
        )
      ).sort((a, b) => a.localeCompare(b)),
    [products]
  );
  const toDate = (value: DateField): Date => {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "string") return new Date(value);
    return new Date();
  };
  const toDateTimeLocalInput = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const parseCommaSeparatedValues = (raw: string) =>
    raw
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  const sanitizeStoragePathSegment = (value: string) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const blobToImage = (blob: Blob): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not load image for compression."));
      };
      img.src = objectUrl;
    });
  const canvasToBlob = (
    canvas: HTMLCanvasElement,
    type: string,
    quality?: number
  ): Promise<Blob> =>
    new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          reject(new Error("Could not create compressed image."));
        },
        type,
        quality
      );
    });
  const compressImageFile = async (file: File): Promise<Blob> => {
    if (!file.type.startsWith("image/")) return file;
    if (file.type.includes("svg") || file.type.includes("gif")) return file;

    const sourceImage = await blobToImage(file);
    const maxDimension = 1800;
    const scale = Math.min(
      1,
      maxDimension / Math.max(sourceImage.width, sourceImage.height)
    );
    const width = Math.max(1, Math.round(sourceImage.width * scale));
    const height = Math.max(1, Math.round(sourceImage.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not initialize image compressor.");
    ctx.drawImage(sourceImage, 0, 0, width, height);

    const targetType =
      file.type === "image/png" || file.type === "image/webp"
        ? file.type
        : "image/jpeg";
    const compressed = await canvasToBlob(
      canvas,
      targetType,
      targetType === "image/jpeg" ? 0.82 : undefined
    );
    return compressed.size < file.size ? compressed : file;
  };
  const inferExtension = (mimeType: string, fallbackName: string) => {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "image/gif") return "gif";
    if (mimeType === "image/svg+xml") return "svg";
    const fromName = String(fallbackName || "").split(".").pop();
    return fromName && fromName.length <= 5 ? fromName.toLowerCase() : "jpg";
  };
  const uploadCompressedImageToStorage = async (
    file: File,
    folder: string,
    fileLabel: string
  ) => {
    const compressedBlob = await compressImageFile(file);
    const mimeType = compressedBlob.type || file.type || "image/jpeg";
    const extension = inferExtension(mimeType, file.name);
    const fileSlug = sanitizeStoragePathSegment(fileLabel) || "image";
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const objectPath = `${folder}/${fileSlug}-${uniqueSuffix}.${extension}`;
    const storageRef = ref(storage, objectPath);

    await uploadBytes(storageRef, compressedBlob, {
      contentType: mimeType,
      cacheControl: "public,max-age=31536000",
    });
    return getDownloadURL(storageRef);
  };
  const uploadRemoteImageToStorageWithFallback = async (
    sourceUrl: string,
    folder: string,
    fileLabel: string
  ) => {
    const normalizedUrl = String(sourceUrl || "").trim();
    if (!normalizedUrl) return "";

    try {
      const response = await fetch(normalizedUrl);
      if (!response.ok) {
        throw new Error(`Could not fetch image (${response.status}).`);
      }

      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("Remote file is not an image.");
      }

      const remoteFile = new File([blob], `${fileLabel}.tmp`, { type: blob.type });
      return await uploadCompressedImageToStorage(remoteFile, folder, fileLabel);
    } catch (error) {
      console.warn("Using original image URL because upload failed:", error);
      return normalizedUrl;
    }
  };
  const isFirebaseStorageUrl = (value: string) => {
    const normalized = String(value || "").toLowerCase();
    return (
      normalized.includes("firebasestorage.googleapis.com") ||
      normalized.includes(".appspot.com") ||
      normalized.startsWith("gs://")
    );
  };

  const parseColorImageLinks = (raw: string): Record<string, string> => {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce((acc, line) => {
        const [colorPart, ...urlParts] = line.split(":");
        const color = colorPart?.trim();
        const url = urlParts.join(":").trim();
        if (color && url) {
          acc[color] = url;
        }
        return acc;
      }, {} as Record<string, string>);
  };

  const parseColorGalleryLinks = (raw: string): Record<string, string[]> => {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce((acc, line) => {
        const [colorPart, ...urlsPart] = line.split(":");
        const color = colorPart?.trim();
        const urls = parseCommaSeparatedValues(urlsPart.join(":"));
        if (color && urls.length > 0) {
          acc[color] = urls;
        }
        return acc;
      }, {} as Record<string, string[]>);
  };

  const colorImageLinksToString = (links?: Record<string, string>) => {
    if (!links) return "";
    return Object.entries(links)
      .map(([color, url]) => `${color}: ${url}`)
      .join("\n");
  };

  const colorGalleryLinksToString = (links?: Record<string, string[]>) => {
    if (!links) return "";
    return Object.entries(links)
      .map(([color, urls]) => `${color}: ${urls.join(", ")}`)
      .join("\n");
  };
  const colorImageLinksToRows = (
    links?: Record<string, string>
  ): ColorImageLinkRow[] =>
    links
      ? Object.entries(links).map(([color, url], index) => ({
          id: `color-image-${index}-${Date.now()}`,
          color,
          url,
        }))
      : [];
  const colorGalleryLinksToRows = (
    links?: Record<string, string[]>
  ): ColorGalleryRow[] =>
    links
      ? Object.entries(links).map(([color, urls], index) => ({
          id: `color-gallery-${index}-${Date.now()}`,
          color,
          urls: urls.join(", "),
        }))
      : [];
  const colorImageRowsToMap = (
    rows: ColorImageLinkRow[]
  ): Record<string, string> =>
    rows.reduce((acc, row) => {
      const color = row.color.trim();
      const url = row.url.trim();
      if (!color || !url) return acc;
      acc[color] = url;
      return acc;
    }, {} as Record<string, string>);
  const colorGalleryRowsToMap = (
    rows: ColorGalleryRow[]
  ): Record<string, string[]> =>
    rows.reduce((acc, row) => {
      const color = row.color.trim();
      const urls = parseCommaSeparatedValues(row.urls);
      if (!color || urls.length === 0) return acc;
      acc[color] = urls;
      return acc;
    }, {} as Record<string, string[]>);

  const applySizePreset = (preset: "shoe" | "apparel" | "one-size" | "glove-oz") => {
    const presetSizes =
      preset === "shoe"
        ? getDefaultShoeSizes()
        : preset === "one-size"
        ? getDefaultOneSizeSizes()
        : preset === "glove-oz"
        ? getDefaultGloveSizes()
        : getDefaultApparelSizes();

    setProductForm((prev) => ({
      ...prev,
      sizes: presetSizes.join(", "),
      size_guide: preset === "shoe" ? getDefaultShoeSizeGuide() : prev.size_guide,
    }));
  };

  useEffect(() => {
    if (!mainImageUpload) {
      setMainImagePreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(mainImageUpload.file);
    setMainImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [mainImageUpload]);
  useEffect(() => {
    if (additionalImageUploads.length === 0) {
      setAdditionalImagePreviewUrls([]);
      return;
    }

    const urls = additionalImageUploads.map((item) =>
      URL.createObjectURL(item.file)
    );
    setAdditionalImagePreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [additionalImageUploads]);
  useEffect(() => {
    if (user === undefined) return;
    const adminEmails = ["lbathletes@hotmail.com", "sammourdany@gmail.com"];

    if (!user) {
      navigate("/login");
      return;
    }

    const isAdmin =
      Boolean(user.email) &&
      adminEmails.includes(String(user.email).toLowerCase());
    if (!isAdmin) {
      navigate("/");
      return;
    }

    const unsubscribe = subscribeAll();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, navigate]);

  // Recalculate analytics whenever data changes
  useEffect(() => {
    calculateAnalytics(products, orders, subscribers);
    calculateMonthlyRevenue(orders, products);
  }, [products, orders, subscribers]);

  const subscribeAll = () => {
    setLoading(true);

    const unsubs: (() => void)[] = [];

    // PRODUCTS
    unsubs.push(
      onSnapshot(collection(db, "products"), (snap) => {
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Product[];

        setProducts(data);
      })
    );

    // ORDERS
    unsubs.push(
      onSnapshot(
        query(collection(db, "orders"), orderBy("created_at", "desc")),
        (snap) => {
          const data = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Order[];

          setOrders(data);
        }
      )
    );

    // SUBSCRIBERS
    unsubs.push(
      onSnapshot(collection(db, "newsletter"), (snap) => {
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Subscriber[];

        setSubscribers(data);
      })
    );

    // USER NOTIFICATION PREFERENCES
    unsubs.push(
      onSnapshot(collection(db, "users"), (snap) => {
        const preferencesByEmail: Record<string, NotificationPreferences> = {};
        const usersData = snap.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<AdminUser, "id">),
        })) as AdminUser[];

        snap.docs.forEach((entry) => {
          const data = entry.data() as {
            email?: string;
            subscribeNewsletter?: boolean;
            notificationPreferences?: Partial<NotificationPreferences>;
          };

          const email = (data.email || "").trim().toLowerCase();
          if (!email) return;

          preferencesByEmail[email] = {
            orderUpdates: data.notificationPreferences?.orderUpdates ?? true,
            promotions: data.notificationPreferences?.promotions ?? true,
            newsletter:
              data.notificationPreferences?.newsletter ??
              data.subscribeNewsletter ??
              true,
          };
        });

        setAdminUsers(usersData);
        setUserPreferencesByEmail(preferencesByEmail);
      })
    );

    // COLLECTIONS
    unsubs.push(
      onSnapshot(
        query(collection(db, "collections"), orderBy("year", "desc")),
        (snap) => {
          const data = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as CollectionEntry[];

          setCollectionsData(data);
        }
      )
    );

    // SALE SETTINGS
    unsubs.push(
      onSnapshot(doc(db, "site_settings", "sale"), (snap) => {
        if (!snap.exists()) return;

        const data = snap.data();
        const endDate =
          data.end_at instanceof Timestamp
            ? data.end_at.toDate()
            : data.end_at instanceof Date
            ? data.end_at
            : typeof data.end_at === "string"
            ? new Date(data.end_at)
            : null;

        setSaleSettings({
          sale_title: data.sale_title || "SEASONAL SALE",
          sale_headline: data.sale_headline || "UP TO 70% OFF",
          sale_subtitle: data.sale_subtitle || "Limited Time Offer",
          end_at_input: endDate ? toDateTimeLocalInput(endDate) : "",
        });
      })
    );

    // HOMEPAGE SETTINGS
    unsubs.push(
      onSnapshot(doc(db, "site_settings", "homepage"), (snap) => {
        if (!snap.exists()) {
          setHomepageSettings((prev) => ({
            ...prev,
            hero_image_url: "",
            today_pick_product_id: "",
            home_categories: defaultHomeCategories,
            home_collection_ids: [],
            shop_menu_items: defaultShopMenuItems,
          }));
          return;
        }

        const data = snap.data();
        const configuredCategories = Array.isArray(data.home_categories)
          ? data.home_categories
              .map((entry: unknown, index: number) => {
                if (!entry || typeof entry !== "object") return null;
                const candidate = entry as Partial<HomeCategoryEntry>;
                const name = typeof candidate.name === "string" ? candidate.name : "";
                const slug = typeof candidate.slug === "string" ? candidate.slug : "";
                const imageUrl =
                  typeof candidate.image_url === "string"
                    ? candidate.image_url
                    : "";

                if (!name || !slug || !imageUrl) return null;

                return {
                  id: candidate.id || `custom-${index + 1}`,
                  name,
                  slug,
                  image_url: imageUrl,
                } as HomeCategoryEntry;
              })
              .filter(
                (item: HomeCategoryEntry | null): item is HomeCategoryEntry =>
                  item !== null
              )
          : [];

        const configuredShopMenu = Array.isArray(data.shop_menu_items)
          ? data.shop_menu_items
              .map((entry: unknown, index: number) => {
                if (!entry || typeof entry !== "object") return null;
                const candidate = entry as Partial<ShopMenuItemEntry>;
                const label =
                  typeof candidate.label === "string" ? candidate.label.trim() : "";
                const path =
                  typeof candidate.path === "string" ? candidate.path.trim() : "";
                if (!label || !path) return null;

                return {
                  id: candidate.id || `menu-${index + 1}`,
                  label,
                  path,
                  special: Boolean(candidate.special),
                } as ShopMenuItemEntry;
              })
              .filter(
                (
                  item: ShopMenuItemEntry | null
                ): item is ShopMenuItemEntry => item !== null
              )
          : [];

        setHomepageSettings((prev) => ({
          ...prev,
          hero_image_url:
            typeof data.hero_image_url === "string" ? data.hero_image_url : "",
          today_pick_product_id:
            typeof data.today_pick_product_id === "string"
              ? data.today_pick_product_id
              : "",
          home_categories: configuredCategories,
          home_collection_ids: Array.isArray(data.home_collection_ids)
            ? data.home_collection_ids
            : [],
          shop_menu_items: configuredShopMenu,
        }));
      })
    );

    setLoading(false);

    return () => unsubs.forEach((u) => u());
  };

  const removeAdditionalImage = (index: number) => {
    const imageUrls = parseCommaSeparatedValues(productForm.images);
    imageUrls.splice(index, 1);
    setProductForm({ ...productForm, images: imageUrls.join(", ") });
  };
  const removeQueuedAdditionalImage = (index: number) => {
    setAdditionalImageUploads((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index)
    );
  };
  const onMainImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    if (!selectedFile) return;
    setMainImageUpload({
      file: selectedFile,
      id: `${selectedFile.name}-${selectedFile.lastModified}-${selectedFile.size}`,
    });
  };
  const onAdditionalImagesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    setAdditionalImageUploads((prev) => {
      const knownIds = new Set(prev.map((item) => item.id));
      const nextItems = selectedFiles
        .map((file) => ({
          file,
          id: `${file.name}-${file.lastModified}-${file.size}`,
        }))
        .filter((item) => !knownIds.has(item.id));
      return [...prev, ...nextItems];
    });
  };

  const calculateMonthlyRevenue = (ords: Order[], prods: Product[]) => {
    const revenueOrders = ords.filter((order) => !isCancelledOrder(order.status));
    const monthlyData: { [key: string]: MonthlyRevenue } = {};

    revenueOrders.forEach((order) => {
      const orderDate = toDate(order.created_at);

      const monthKey = `${orderDate.getFullYear()}-${orderDate.getMonth()}`;
      const monthName = orderDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthName,
          year: orderDate.getFullYear(),
          revenue: 0,
          profit: 0,
          orders: 0,
        };
      }

      monthlyData[monthKey].revenue += order.total || 0;

      // Calculate profit
      const profit = order.items.reduce((sum, item) => {
        const product = prods.find((p) => p.id === item.product_id);
        if (product) {
          return sum + getUnitProfitFromProduct(product, item.price) * item.quantity;
        }
        return sum;
      }, 0);
      monthlyData[monthKey].profit += profit;
      monthlyData[monthKey].orders += 1;
    });

    const sortedMonths = Object.values(monthlyData).sort((a, b) => {
      const dateA = new Date(a.month);
      const dateB = new Date(b.month);
      return dateB.getTime() - dateA.getTime();
    });

    setMonthlyRevenueHistory(sortedMonths);
  };

  const calculateAnalytics = (
    prods: Product[],
    ords: Order[],
    subs: Subscriber[]
  ) => {
    const revenueOrders = ords.filter((order) => !isCancelledOrder(order.status));
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalRevenue = revenueOrders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );

    const monthlyOrders = revenueOrders.filter((order) => {
      const orderDate = toDate(order.created_at);
      return orderDate >= firstDayOfMonth;
    });

    const monthlyRevenue = monthlyOrders.reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );

    // Calculate total profit
    const totalProfit = revenueOrders.reduce((sum, order) => {
      const profit = order.items.reduce((itemSum, item) => {
        const product = prods.find((p) => p.id === item.product_id);
        if (product) {
          return (
            itemSum + getUnitProfitFromProduct(product, item.price) * item.quantity
          );
        }
        return itemSum;
      }, 0);
      return sum + profit;
    }, 0);

    // Calculate monthly profit
    const monthlyProfit = monthlyOrders.reduce((sum, order) => {
      const profit = order.items.reduce((itemSum, item) => {
        const product = prods.find((p) => p.id === item.product_id);
        if (product) {
          return (
            itemSum + getUnitProfitFromProduct(product, item.price) * item.quantity
          );
        }
        return itemSum;
      }, 0);
      return sum + profit;
    }, 0);

    const lowStockProducts = 0;
    const profitMargin =
      totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : "0";

    setAnalytics({
      totalRevenue,
      monthlyRevenue,
      totalProfit,
      monthlyProfit,
      totalOrders: revenueOrders.length,
      monthlyOrders: monthlyOrders.length,
      totalProducts: prods.length,
      lowStockProducts,
      profitMargin: Number(profitMargin),
      totalSubscribers: subs.length,
    });
  };

  const openProductModal = (product?: Product) => {
    setProductEntryMode("manual");
    setImportUrl("");
    setImportedProducts([]);
    setImportError("");
    setImportingFromLink(false);
    setAddingImportedProducts(false);
    setSavingProductImages(false);
    setMainImageUpload(null);
    setAdditionalImageUploads([]);

    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: String(product.name || ""),
        brand: product.brand || "",
        product_type: product.product_type || "",
        sku: product.sku || "",
        price: product.price,
        cost_price: product.cost_price || 0,
        original_price: product.original_price || product.price,
        commission_percentage:
          typeof product.commission_percentage === "number"
            ? product.commission_percentage
            : product.cost_price > 0
            ? Number(
                (
                  ((product.price - product.cost_price) / product.cost_price) *
                  100
                ).toFixed(2)
              )
            : 0,
        description: String(product.description || ""),
        image_url: String(product.image_url || ""),
        category: String(product.category || ""),
        subcategory: product.subcategory || "",
        audience: normalizeProductAudience(product.audience, product.category),
        authenticity: normalizeProductAuthenticity(product.authenticity),
        stock: product.stock || 0,
        sold_out: Boolean(product.sold_out),
        sold_out_sizes: Array.isArray(product.sold_out_sizes)
          ? product.sold_out_sizes.join(", ")
          : "",
        discount_percentage: product.discount_percentage || 0,
        material: product.material || "",
        care_instructions: product.care_instructions || "",
        tags: product.tags?.join(", ") || "",
        flavor: product.flavor || "",
        net_weight: product.net_weight || "",
        colors: product.colors?.join(", ") || "",
        sizes: product.sizes?.join(", ") || "",
        images: product.images?.join(", ") || "",
        color_image_links: colorImageLinksToString(product.color_images),
        color_gallery_links: colorGalleryLinksToString(product.color_galleries),
        size_guide: product.size_guide || "",
        is_featured: product.is_featured || false,
        is_new_arrival: product.is_new_arrival || false,
      });
      setColorImageRows(colorImageLinksToRows(product.color_images));
      setColorGalleryRows(colorGalleryLinksToRows(product.color_galleries));
    } else {
      setEditingProduct(null);
      setProductForm({
        name: "",
        brand: "",
        product_type: "",
        sku: "",
        price: 0,
        cost_price: 0,
        original_price: 0,
        commission_percentage: 0,
        description: "",
        image_url: "",
        category: categories[0] || "",
        subcategory: "",
        audience: normalizeProductAudience(undefined, categories[0] || ""),
        authenticity: "original" as ProductAuthenticity,
        stock: 0,
        sold_out: false,
        sold_out_sizes: "",
        discount_percentage: 0,
        material: "",
        care_instructions: "",
        tags: "",
        flavor: "",
        net_weight: "",
        colors: "",
        sizes: "",
        images: "",
        color_image_links: "",
        color_gallery_links: "",
        size_guide: "",
        is_featured: false,
        is_new_arrival: false,
      });
      setColorImageRows([]);
      setColorGalleryRows([]);
    }
    setShowProductModal(true);
  };

  const openProductModalWithPreset = (preset: QuickAddProductPreset) => {
    openProductModal();
    setProductForm((prev) => ({
      ...prev,
      category: preset.category,
      subcategory: preset.subcategory || "",
      product_type: preset.product_type || preset.subcategory || "",
      audience: normalizeProductAudience(undefined, preset.category),
    }));
  };

  const openOrderModal = (order?: Order) => {
    if (order) {
      setEditingOrder(order);
      setOrderForm({
        user_email: order.user_email || "",
        total: order.total || 0,
        subtotal: order.subtotal || 0,
        shipping: order.shipping || 0,
        tax: order.tax || 0,
        status: order.status,
        items: order.items || [],
      });
    }
    setShowOrderModal(true);
  };

  const sanitizeOrderItems = (items: OrderLineItem[]) =>
    items
      .map((item) => ({
        product_id: item.product_id?.trim() || "",
        product_name: item.product_name?.trim() || "",
        size: item.size?.trim() || "",
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 0),
      }))
      .filter(
        (item) =>
          item.product_id &&
          item.product_name &&
          item.quantity > 0 &&
          item.price >= 0
      );

  const buildOrderTotals = (
    items: OrderLineItem[],
    shipping: number,
    tax: number
  ) => {
    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
    return {
      subtotal: Number(subtotal.toFixed(2)),
      shipping: Number(shipping.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      total: Number((subtotal + shipping + tax).toFixed(2)),
    };
  };

  const applyOrderItemsAndTotals = (
    nextItems: OrderLineItem[],
    nextShipping = Number(orderForm.shipping || 0),
    nextTax = Number(orderForm.tax || 0)
  ) => {
    const normalizedItems = nextItems.map((item) => ({
      ...item,
      price: Number(item.price || 0),
      quantity: Math.max(1, Number(item.quantity || 1)),
    }));
    const totals = buildOrderTotals(normalizedItems, nextShipping, nextTax);
    setOrderForm((prev) => ({
      ...prev,
      items: normalizedItems,
      ...totals,
    }));
  };

  const addOrderItem = () => {
    applyOrderItemsAndTotals([
      ...orderForm.items,
      {
        product_id: "",
        product_name: "",
        size: "",
        price: 0,
        quantity: 1,
      },
    ]);
  };

  const updateOrderItem = (
    index: number,
    field: keyof OrderLineItem,
    value: string | number
  ) => {
    const nextItems = orderForm.items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (field === "quantity" || field === "price") {
        return { ...item, [field]: Number(value) };
      }
      return { ...item, [field]: value };
    });
    applyOrderItemsAndTotals(nextItems);
  };

  const removeOrderItemFromOrder = (index: number) => {
    const nextItems = orderForm.items.filter((_, itemIndex) => itemIndex !== index);
    applyOrderItemsAndTotals(nextItems);
  };

  const saveProduct = async () => {
    if (savingProductImages) return;

    try {
      setSavingProductImages(true);
      const resolvedName =
        String(productForm.name || "").trim() ||
        (editingProduct ? String(editingProduct.name || "").trim() : "");
      const resolvedDescription =
        String(productForm.description || "").trim() ||
        (editingProduct ? String(editingProduct.description || "").trim() : "");
      const resolvedCategory =
        String(productForm.category || "").trim() ||
        (editingProduct ? String(editingProduct.category || "").trim() : "");
      const finalName = resolvedName || "Untitled Product";
      const finalDescription = resolvedDescription || "No description provided.";
      const finalCategory = resolvedCategory || categories[0] || "General";

      if (!editingProduct && (!resolvedName || !resolvedDescription || !resolvedCategory)) {
        alert("Please fill in product name, description, and category.");
        return;
      }

      const existingAdditionalImages = parseCommaSeparatedValues(productForm.images);
      const migratedExistingAdditionalImages =
        existingAdditionalImages.length > 0
          ? await Promise.all(
              existingAdditionalImages.map((sourceUrl, index) =>
                isFirebaseStorageUrl(sourceUrl)
                  ? sourceUrl
                  : uploadRemoteImageToStorageWithFallback(
                      sourceUrl,
                      "products/additional",
                      `${resolvedName || "product"}-legacy-gallery-${index + 1}`
                    )
              )
            )
          : [];
      const uploadedAdditionalImages =
        additionalImageUploads.length > 0
          ? await Promise.all(
              additionalImageUploads.map((imageItem, index) =>
                uploadCompressedImageToStorage(
                  imageItem.file,
                  "products/additional",
                  `${resolvedName || "product"}-gallery-${index + 1}`
                )
              )
            )
          : [];
      const additionalImages = [
        ...uploadedAdditionalImages,
        ...migratedExistingAdditionalImages,
      ].filter(Boolean);
      const uploadedMainImageUrl = mainImageUpload
        ? await uploadCompressedImageToStorage(
            mainImageUpload.file,
            "products/main",
            `${resolvedName || "product"}-main`
          )
        : "";
      const migratedExistingMainImageUrl =
        !uploadedMainImageUrl && productForm.image_url.trim()
          ? isFirebaseStorageUrl(productForm.image_url.trim())
            ? productForm.image_url.trim()
            : await uploadRemoteImageToStorageWithFallback(
                productForm.image_url.trim(),
                "products/main",
                `${resolvedName || "product"}-legacy-main`
              )
          : "";
      const colorImagesFromRows = colorImageRowsToMap(colorImageRows);
      const colorGalleriesFromRows = colorGalleryRowsToMap(colorGalleryRows);
      const colorImages =
        Object.keys(colorImagesFromRows).length > 0
          ? colorImagesFromRows
          : parseColorImageLinks(productForm.color_image_links);
      const colorGalleries =
        Object.keys(colorGalleriesFromRows).length > 0
          ? colorGalleriesFromRows
          : parseColorGalleryLinks(productForm.color_gallery_links);
      const manualSizes = parseCommaSeparatedValues(productForm.sizes);
      const selectedSizes = showSizingFields ? manualSizes : [];
      const soldOutSizesRaw = parseCommaSeparatedValues(productForm.sold_out_sizes);
      const soldOutSizesNormalized = soldOutSizesRaw.filter((value, index, all) => {
        const normalized = value.toLowerCase();
        return all.findIndex((candidate) => candidate.toLowerCase() === normalized) === index;
      });

      const resolvedImageUrl =
        uploadedMainImageUrl ||
        migratedExistingMainImageUrl ||
        additionalImages[0] ||
        "/logo-transparent.png";
      const normalizedTaxonomy = normalizeAdminProductTaxonomy(
        finalCategory,
        productForm.subcategory,
        productForm.product_type
      );
      const normalizedCategory = normalizedTaxonomy.category;
      const normalizedSubcategory = normalizedTaxonomy.subcategory;
      const normalizedProductType = normalizedTaxonomy.productType;
      const costPriceValue = Math.max(0, Number(productForm.cost_price || 0));
      const commissionPercentageValue = Math.max(
        0,
        Number(productForm.commission_percentage || 0)
      );
      const retailPriceValue = Math.max(0, Number(productForm.price || 0));
      const originalPriceValue = Math.max(
        retailPriceValue,
        Number(productForm.original_price || productForm.price || 0)
      );

      const productData = {
        name: finalName,
        brand: productForm.brand.trim() || null,
        product_type: normalizedProductType || null,
        sku:
          productForm.sku.trim() ||
          buildAutoSku(normalizedCategory, finalName) ||
          null,
        price: retailPriceValue,
        cost_price: costPriceValue,
        original_price: originalPriceValue,
        commission_percentage: commissionPercentageValue,
        description: finalDescription,
        image_url: resolvedImageUrl,
        category: normalizedCategory,
        subcategory: normalizedSubcategory || null,
        audience: showAudienceField
          ? normalizeProductAudience(productForm.audience, normalizedCategory)
          : "unisex",
        authenticity: normalizeProductAuthenticity(productForm.authenticity),
        stock: 0,
        sold_out: Boolean(productForm.sold_out),
        sold_out_sizes: soldOutSizesNormalized,
        discount_percentage: Number(productForm.discount_percentage),
        material: productForm.material || null,
        care_instructions: productForm.care_instructions || null,
        tags: parseCommaSeparatedValues(productForm.tags),
        flavor: productForm.flavor.trim() || null,
        net_weight: productForm.net_weight.trim() || null,
        colors: productForm.colors
          ? productForm.colors.split(",").map((c) => c.trim())
          : [],
        sizes: selectedSizes,
        size_stock: {},
        images:
          additionalImages.length > 0
            ? additionalImages
            : [resolvedImageUrl],
        color_images: colorImages,
        color_galleries: colorGalleries,
        size_guide: productForm.size_guide || null,
        is_featured: productForm.is_featured,
        is_new_arrival: productForm.is_new_arrival,
      };

      if (editingProduct) {
        const productRef = doc(db, "products", editingProduct.id);
        await updateDoc(productRef, productData);
        alert("Product updated successfully!");
      } else {
        await addDoc(collection(db, "products"), {
          ...productData,
          created_at: Timestamp.now(),
        });
        alert("Product added successfully!");
      }

      setShowProductModal(false);
    } catch (error) {
      console.error("Error saving product:", error);
      alert("Failed to save product");
    } finally {
      setSavingProductImages(false);
    }
  };

  const mapImportedProductToForm = (item: LinkImportProduct) => {
    const category = item.category?.trim() || categories[0] || "Men";
    const productType = item.product_type?.trim() || "";
    const isSupplement =
      /\b(supplement|herbal|protein|whey|creatine|pre[\s-]?workout|bcaa|vitamin|mass|collagen|omega|electrolyte|gainer)\b/.test(
        `${category} ${productType}`.toLowerCase()
      );
    setProductForm((prev) => ({
      ...prev,
      name: item.name || "",
      brand: item.brand || "",
      product_type: productType,
      sku: item.sku || "",
      price: Number(item.price || 0),
      cost_price: 0,
      original_price: Number(item.original_price || item.price || 0),
      commission_percentage: 0,
      description: item.description || "",
      image_url: item.image_url || item.images?.[0] || "",
      category,
      subcategory: "",
      audience: isSupplement
        ? "unisex"
        : normalizeProductAudience(undefined, category),
      stock: 0,
      sold_out: false,
      sold_out_sizes: "",
      discount_percentage: 0,
      colors: Array.isArray(item.colors) ? item.colors.join(", ") : "",
      sizes: "",
      images: Array.isArray(item.images) ? item.images.join(", ") : "",
      authenticity: "original" as ProductAuthenticity,
      is_featured: false,
      is_new_arrival: false,
    }));

    setColorImageRows([]);
    setColorGalleryRows([]);
    setProductEntryMode("manual");
  };

  const toggleImportedProductSelection = (index: number) => {
    setSelectedImportedIndices((prev) =>
      prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index]
    );
  };

  const selectAllImportedProducts = () => {
    setSelectedImportedIndices(importedProducts.map((_, index) => index));
  };

  const clearImportedProductSelection = () => {
    setSelectedImportedIndices([]);
  };

  const importProductsFromUrl = async () => {
    const normalized = importUrl.trim();
    if (!normalized) {
      setImportError("Please add a product or collection URL.");
      return;
    }

    try {
      setImportingFromLink(true);
      setImportError("");
      setImportedProducts([]);
      setSelectedImportedIndices([]);

      const response = await fetch("/api/import-products-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload?.error || "Could not parse products from this URL."
        );
      }

      const parsedProducts = Array.isArray(payload?.products)
        ? (payload.products as LinkImportProduct[])
        : [];

      if (parsedProducts.length === 0) {
        throw new Error(
          "No products were detected. Try a direct product page or a collection page."
        );
      }

      setImportedProducts(parsedProducts);
      setSelectedImportedIndices(parsedProducts.map((_, index) => index));
    } catch (error) {
      console.error("Error importing products from URL:", error);
      setImportError(
        error instanceof Error ? error.message : "Failed to import products."
      );
    } finally {
      setImportingFromLink(false);
    }
  };

  const addImportedProductsToStore = async () => {
    if (importedProducts.length === 0) {
      setImportError("Import products first, then add them.");
      return;
    }
    if (selectedImportedIndices.length === 0) {
      setImportError("Select at least one imported product to add.");
      return;
    }

    try {
      setAddingImportedProducts(true);
      setImportError("");

      const batch = writeBatch(db);
      let validCount = 0;
      const selectedItems = selectedImportedIndices
        .map((index) => importedProducts[index])
        .filter((item): item is LinkImportProduct => Boolean(item));

      for (const item of selectedItems) {
        const name = String(item.name || "").trim();
        if (!name) continue;

        const category = String(item.category || "").trim() || "General";
        const productType = String(item.product_type || "").trim();
        const importedIsSupplement =
          /\b(supplement|herbal|protein|whey|creatine|pre[\s-]?workout|bcaa|vitamin|mass|amino|collagen|omega|electrolyte|gainer)\b/i.test(
            `${category} ${productType} ${item.name || ""} ${
              Array.isArray(item.colors) ? item.colors.join(" ") : ""
            }`
          );
        const imageUrlCandidates =
          Array.isArray(item.images) && item.images.length > 0
            ? item.images
                .map((entry) => String(entry || "").trim())
                .filter(Boolean)
            : String(item.image_url || "").trim()
            ? [String(item.image_url).trim()]
            : [];
        const images =
          imageUrlCandidates.length > 0
            ? await Promise.all(
                imageUrlCandidates.map((sourceUrl, index) =>
                  uploadRemoteImageToStorageWithFallback(
                    sourceUrl,
                    "products/imported",
                    `${name}-import-${index + 1}`
                  )
                )
              )
            : [];
        const imageUrl = images[0] || "";
        const price = Math.max(0, Number(item.price || 0));
        const originalPrice = Math.max(
          price,
          Number(item.original_price || item.price || 0)
        );

        const productRef = doc(collection(db, "products"));
        batch.set(productRef, {
          name,
          brand: String(item.brand || "").trim() || null,
          product_type: productType || null,
          sku: String(item.sku || "").trim() || null,
          price,
          cost_price: 0,
          original_price: originalPrice,
          description: String(item.description || "").trim(),
          image_url: imageUrl,
          category,
          subcategory: null,
          audience: importedIsSupplement
            ? "unisex"
            : normalizeProductAudience(undefined, category),
          authenticity: "original",
          stock: 0,
          sold_out: false,
          sold_out_sizes: [],
          discount_percentage: 0,
          material: null,
          care_instructions: null,
          tags: [],
          flavor: null,
          net_weight: null,
          colors: Array.isArray(item.colors)
            ? item.colors
                .map((color) => String(color || "").trim())
                .filter(Boolean)
            : [],
          sizes: [],
          size_stock: {},
          images,
          color_images: {},
          color_galleries: {},
          size_guide: null,
          is_featured: false,
          is_new_arrival: false,
          created_at: Timestamp.now(),
          source_url: String(item.source_url || "").trim() || null,
        });
        validCount += 1;
      }

      if (validCount === 0) {
        throw new Error("No valid products found in import data.");
      }

      await batch.commit();
      alert(
        `Successfully added ${validCount} imported product${validCount === 1 ? "" : "s"}!`
      );
      setSelectedImportedIndices([]);
      setShowProductModal(false);
    } catch (error) {
      console.error("Error adding imported products:", error);
      setImportError(
        error instanceof Error
          ? error.message
          : "Failed to add imported products."
      );
    } finally {
      setAddingImportedProducts(false);
    }
  };

  const deleteImportedProductsForSource = async () => {
    const normalized = importUrl.trim();
    if (!normalized) {
      setImportError("Paste a source URL first so we know what to delete.");
      return;
    }

    let sourceHost = "";
    try {
      sourceHost = new URL(normalized).hostname.toLowerCase();
    } catch {
      setImportError("Please enter a valid source URL.");
      return;
    }

    const shouldDelete = window.confirm(
      `Delete all products imported from ${sourceHost}? This cannot be undone.`
    );
    if (!shouldDelete) return;

    try {
      setDeletingImportedProducts(true);
      setImportError("");

      const snapshot = await getDocs(collection(db, "products"));
      const matchingIds: string[] = [];

      snapshot.docs.forEach((entry) => {
        const sourceUrl = String(entry.data()?.source_url || "").trim();
        if (!sourceUrl) return;
        try {
          const productSourceHost = new URL(sourceUrl).hostname.toLowerCase();
          if (productSourceHost === sourceHost) {
            matchingIds.push(entry.id);
          }
        } catch {
          // Ignore malformed source_url values.
        }
      });

      if (matchingIds.length === 0) {
        alert(`No imported products found for ${sourceHost}.`);
        return;
      }

      let deletedCount = 0;
      for (let i = 0; i < matchingIds.length; i += 450) {
        const batch = writeBatch(db);
        const chunk = matchingIds.slice(i, i + 450);
        chunk.forEach((id) => batch.delete(doc(db, "products", id)));
        await batch.commit();
        deletedCount += chunk.length;
      }

      alert(
        `Deleted ${deletedCount} imported product${deletedCount === 1 ? "" : "s"} from ${sourceHost}.`
      );
      setImportedProducts([]);
    } catch (error) {
      console.error("Error deleting imported products:", error);
      setImportError(
        error instanceof Error
          ? error.message
          : "Failed to delete imported products."
      );
    } finally {
      setDeletingImportedProducts(false);
    }
  };

  const applyNotificationTemplate = (templateId: string) => {
    const selectedTemplate = notificationTemplates.find(
      (entry) => entry.id === templateId
    );
    if (!selectedTemplate) return;

    setWebNotificationForm({
      title: selectedTemplate.title,
      message: selectedTemplate.message,
      category: selectedTemplate.category,
    });
  };

  const getOrderStatusNotificationCopy = (
    newStatus: OrderStatus
  ): { title: string; message: string } => {
    switch (newStatus) {
      case "pending":
        return {
          title: "Order Update: Pending",
          message:
            "Your order was received and is pending confirmation. We will notify you when the status changes.",
        };
      case "processing":
        return {
          title: "Order Update: Processing",
          message: "Great news. Your order is now being processed.",
        };
      case "shipped":
        return {
          title: "Order Update: Shipped",
          message: "Your order is on the way. Keep an eye out for delivery.",
        };
      case "delivered":
        return {
          title: "Order Update: Delivered",
          message: "Your order has been marked as delivered. Enjoy your items.",
        };
      case "cancelled":
        return {
          title: "Order Update: Cancelled",
          message:
            "Your order has been cancelled. If this seems wrong, contact support.",
        };
      default:
        return {
          title: "Order Update",
          message: "There is a new update on your order.",
        };
    }
  };

  const resolveOrderRecipientUserId = async (
    providedUserId?: string,
    providedEmail?: string
  ) => {
    if (providedUserId) return providedUserId;

    const normalizedEmail = String(providedEmail || "").trim().toLowerCase();
    if (!normalizedEmail) return "";

    const match = await getDocs(
      query(collection(db, "users"), where("email", "==", normalizedEmail), limit(1))
    );

    if (!match.empty) return match.docs[0].id;
    return "";
  };

  const createOrderStatusNotification = async ({
    orderId,
    userId,
    userEmail,
    newStatus,
    itemCount,
  }: {
    orderId: string;
    userId?: string;
    userEmail?: string;
    newStatus: OrderStatus;
    itemCount: number;
  }) => {
    const recipientUserId = await resolveOrderRecipientUserId(userId, userEmail);
    const normalizedEmail = String(userEmail || "").trim().toLowerCase();
    if (!recipientUserId && !normalizedEmail) return;
    const copy = getOrderStatusNotificationCopy(newStatus);

    await addDoc(collection(db, "web_notifications"), {
      title: `${copy.title} • #${orderId.slice(0, 8).toUpperCase()}`,
      message: `${copy.message} (${itemCount} item${itemCount === 1 ? "" : "s"})`,
      category: "orderUpdates",
      created_at: Timestamp.now(),
      created_by: user?.email || "admin",
      recipient_user_id: recipientUserId || null,
      recipient_email: normalizedEmail || null,
      order_id: orderId,
      order_status: newStatus,
    });
  };

  const sendOrderStatusEmail = async ({
    orderId,
    userEmail,
    newStatus,
    itemCount,
  }: {
    orderId: string;
    userEmail?: string;
    newStatus: OrderStatus;
    itemCount: number;
  }) => {
    const normalizedEmail = String(userEmail || "").trim().toLowerCase();
    if (!normalizedEmail) return;

    const copy = getOrderStatusNotificationCopy(newStatus);

    const response = await fetch("/api/send-order-status-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        orderId,
        status: newStatus,
        title: copy.title,
        message: copy.message,
        itemCount,
      }),
    });

    if (!response.ok) {
      const reason = await response.text().catch(() => "");
      throw new Error(reason || `HTTP ${response.status}`);
    }
  };

  const saveOrder = async () => {
    try {
      if (!editingOrder) return;

      const cleanedItems = sanitizeOrderItems(orderForm.items);
      if (cleanedItems.length === 0) {
        alert("Please keep at least one valid order item.");
        return;
      }

      const totals = buildOrderTotals(
        cleanedItems,
        0,
        Number(orderForm.tax || 0)
      );

      const orderData: Record<string, unknown> = {
        user_email: orderForm.user_email,
        total: totals.total,
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        tax: totals.tax,
        status: orderForm.status,
        items: cleanedItems,
        updated_at: Timestamp.now(),
      };

      const nextStatus = orderForm.status as OrderStatus;

      if (nextStatus !== editingOrder.status) {
        await updateOrderStatusWithInventory({
          orderId: editingOrder.id,
          userId: editingOrder.user_id,
          items: cleanedItems,
          newStatus: nextStatus,
          statusNote: "Updated by admin dashboard",
        });
        try {
          await createOrderStatusNotification({
            orderId: editingOrder.id,
            userId: editingOrder.user_id,
            userEmail: editingOrder.user_email || orderForm.user_email,
            newStatus: nextStatus,
            itemCount: cleanedItems.reduce(
              (sum, item) => sum + Number(item.quantity || 0),
              0
            ),
          });
        } catch (notificationError) {
          console.error("Failed to send order status web notification:", notificationError);
        }
        try {
          await sendOrderStatusEmail({
            orderId: editingOrder.id,
            userEmail: editingOrder.user_email || orderForm.user_email,
            newStatus: nextStatus,
            itemCount: cleanedItems.reduce(
              (sum, item) => sum + Number(item.quantity || 0),
              0
            ),
          });
        } catch (emailError) {
          console.error("Failed to send order status email:", emailError);
          alert(
            `Order status updated, but email failed: ${
              emailError instanceof Error
                ? emailError.message
                : "Unknown email error"
            }`
          );
        }
      }

      await updateDoc(doc(db, "orders", editingOrder.id), orderData as never);

      // Update user's order subcollection if exists
      if (editingOrder.user_id) {
        try {
          await setDoc(
            doc(db, "users", editingOrder.user_id, "orders", editingOrder.id),
            orderData,
            { merge: true }
          );
        } catch {
          console.log("User order not found in subcollection, skipping...");
        }
      }

      alert("Order updated successfully!");
      setShowOrderModal(false);
    } catch (error) {
      console.error("Error saving order:", error);
      alert("Failed to save order");
    }
  };

  const sendEmailToSubscribers = async () => {
    if (!emailForm.subject || !emailForm.message) {
      alert("Please fill in subject and message");
      return;
    }

    const recipients = Array.from(
      new Set(
        subscribers
          .map((s) => String(s.email || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );

    if (recipients.length === 0) {
      alert("No subscriber emails found.");
      return;
    }

    try {
      const response = await fetch("/api/send-newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: emailForm.subject,
          message: emailForm.message,
          recipients,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errMessage =
          typeof body?.error === "string" && body.error
            ? body.error
            : "Error sending emails";
        throw new Error(errMessage);
      }

      const sentCount =
        typeof body?.sent_count === "number" ? body.sent_count : recipients.length;
      const failedCount =
        typeof body?.failed_count === "number" ? body.failed_count : 0;

      alert(
        failedCount > 0
          ? `Newsletter sent to ${sentCount} subscribers. ${failedCount} failed.`
          : `Newsletter sent to ${sentCount} subscribers successfully!`
      );
      setShowEmailModal(false);
      setEmailForm({ subject: "", message: "" });
    } catch (err) {
      console.error("Send newsletter error:", err);
      alert(err instanceof Error ? err.message : "Error sending emails");
    }
  };

  const sendDiscordTest = async () => {
    try {
      setSendingDiscordTest(true);
      setDiscordTestMessage(null);

      const response = await fetch("/api/test-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorText =
          typeof body?.error === "string" && body.error
            ? body.error
            : `HTTP ${response.status}`;
        throw new Error(errorText);
      }

      setDiscordTestMessage({
        type: "success",
        text: "Discord test sent successfully.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Discord test failed:", err);
      setDiscordTestMessage({
        type: "error",
        text: `Discord test failed: ${message}`,
      });
    } finally {
      setSendingDiscordTest(false);
    }
  };

  const sendWebNotification = async () => {
    if (!webNotificationForm.title.trim() || !webNotificationForm.message.trim()) {
      alert("Please fill in notification title and message");
      return;
    }

    try {
      await addDoc(collection(db, "web_notifications"), {
        title: webNotificationForm.title.trim(),
        message: webNotificationForm.message.trim(),
        category: webNotificationForm.category,
        created_at: Timestamp.now(),
        created_by: user?.email || "admin",
      });

      alert("Web notification sent successfully.");
      setShowWebNotificationModal(false);
      setWebNotificationForm({
        title: "",
        message: "",
        category: "general",
      });
    } catch (error) {
      console.error("Send web notification error:", error);
      alert("Failed to send web notification");
    }
  };

  const toggleFeatured = async (productId: string, currentValue: boolean) => {
    try {
      const settingsRef = doc(db, "site_settings", "homepage");
      const settingsSnap = await getDoc(settingsRef);

      let featuredIds: string[] = [];
      if (settingsSnap.exists()) {
        featuredIds = settingsSnap.data().featured_product_ids || [];
      }

      if (!currentValue) {
        if (featuredIds.length >= 3) {
          alert("Maximum 3 featured products allowed! Remove one first.");
          return;
        }
        if (!featuredIds.includes(productId)) {
          featuredIds.push(productId);
        }
      } else {
        featuredIds = featuredIds.filter((id) => id !== productId);
      }

      await setDoc(
        settingsRef,
        {
          featured_product_ids: featuredIds,
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );

      await updateDoc(doc(db, "products", productId), {
        is_featured: !currentValue,
      });
    } catch (error) {
      console.error("Error toggling featured:", error);
      alert("Failed to update featured status");
    }
  };

  const toggleNewArrival = async (productId: string, currentValue: boolean) => {
    try {
      const settingsRef = doc(db, "site_settings", "homepage");
      const settingsSnap = await getDoc(settingsRef);

      let newArrivalIds: string[] = [];
      if (settingsSnap.exists()) {
        newArrivalIds = settingsSnap.data().new_arrival_ids || [];
      }

      if (!currentValue) {
        if (newArrivalIds.length >= 3) {
          alert("Maximum 3 new arrivals allowed! Remove one first.");
          return;
        }
        if (!newArrivalIds.includes(productId)) {
          newArrivalIds.push(productId);
        }
      } else {
        newArrivalIds = newArrivalIds.filter((id) => id !== productId);
      }

      await setDoc(
        settingsRef,
        {
          new_arrival_ids: newArrivalIds,
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );

      await updateDoc(doc(db, "products", productId), {
        is_new_arrival: !currentValue,
      });
    } catch (error) {
      console.error("Error toggling new arrival:", error);
      alert("Failed to update new arrival status");
    }
  };

  const addFeaturedProduct = async () => {
    if (!featuredToAddId) return;
    const product = products.find((p) => p.id === featuredToAddId);
    if (!product || product.is_featured) return;
    await toggleFeatured(product.id, false);
    setFeaturedToAddId("");
  };

  const addNewArrivalProduct = async () => {
    if (!newArrivalToAddId) return;
    const product = products.find((p) => p.id === newArrivalToAddId);
    if (!product || product.is_new_arrival) return;
    await toggleNewArrival(product.id, false);
    setNewArrivalToAddId("");
  };

  const deleteProduct = async (productId: string) => {
    setConfirmAction({
      title: "Delete Product",
      message:
        "Are you sure you want to delete this product? This action cannot be undone.",
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "products", productId));
          setSelectedProductIds((prev) => prev.filter((id) => id !== productId));
          alert("Product deleted successfully!");
        } catch (error) {
          console.error("Error deleting product:", error);
          alert("Failed to delete product");
        }
      },
    });
    setShowConfirmModal(true);
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const clearSelectedProducts = () => {
    setSelectedProductIds([]);
  };

  const deleteSelectedProducts = async () => {
    if (selectedProductIds.length === 0) return;

    setConfirmAction({
      title: "Delete Selected Products",
      message: `Delete ${selectedProductIds.length} selected product${
        selectedProductIds.length === 1 ? "" : "s"
      }? This cannot be undone.`,
      danger: true,
      onConfirm: async () => {
        try {
          let batch = writeBatch(db);
          let operations = 0;

          for (const productId of selectedProductIds) {
            batch.delete(doc(db, "products", productId));
            operations += 1;

            if (operations >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              operations = 0;
            }
          }

          if (operations > 0) {
            await batch.commit();
          }

          const deletedCount = selectedProductIds.length;
          setSelectedProductIds([]);
          alert(
            `Deleted ${deletedCount} product${deletedCount === 1 ? "" : "s"} successfully.`
          );
        } catch (error) {
          console.error("Error deleting selected products:", error);
          alert("Failed to delete selected products.");
        }
      },
    });
    setShowConfirmModal(true);
  };

  const deleteOrder = async (orderId: string, userId?: string) => {
    setConfirmAction({
      title: "Delete Order",
      message:
        "Are you sure you want to delete this order? This will affect your revenue calculations.",
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "orders", orderId));

          // Delete from user's subcollection if exists
          if (userId) {
            try {
              await deleteDoc(doc(db, "users", userId, "orders", orderId));
            } catch {
              console.log("User order not found in subcollection, skipping...");
            }
          }

          alert("Order deleted successfully!");
        } catch (error) {
          console.error("Error deleting order:", error);
          alert("Failed to delete order");
        }
      },
    });
    setShowConfirmModal(true);
  };

  const resetAllOrders = async () => {
    setConfirmAction({
      title: "Reset All Orders & Revenue",
      message: `This will DELETE all ${orders.length} orders and reset revenue to $0. This action CANNOT be undone. Are you absolutely sure?`,
      danger: true,
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);

          // Delete all orders
          orders.forEach((order) => {
            batch.delete(doc(db, "orders", order.id));
          });

          await batch.commit();
          alert("All orders deleted and revenue reset successfully!");
        } catch (error) {
          console.error("Error resetting orders:", error);
          alert("Failed to reset orders");
        }
      },
    });
    setShowConfirmModal(true);
  };

  const updateProductSale = async (
    productId: string,
    discountPercentage: number
  ) => {
    try {
      const product = products.find((p) => p.id === productId);
      if (!product) return;

      const originalPrice = product.original_price || product.price;
      const newPrice =
        discountPercentage > 0
          ? originalPrice * (1 - discountPercentage / 100)
          : originalPrice;

      await updateDoc(doc(db, "products", productId), {
        discount_percentage: discountPercentage,
        price: newPrice,
        original_price: originalPrice,
      });
    } catch (error) {
      console.error("Error updating sale:", error);
      alert("Failed to update sale");
    }
  };

  const getCommissionFromProduct = (product: Product) => {
    if (typeof product.commission_percentage === "number") {
      return product.commission_percentage;
    }
    if (!product.cost_price || product.cost_price <= 0) return 0;
    return Number(
      (((product.price - product.cost_price) / product.cost_price) * 100).toFixed(2)
    );
  };

  const getUnitCostFromProduct = (product: Product, salePrice?: number) => {
    const commission = Math.max(0, getCommissionFromProduct(product));
    const effectiveSalePrice = Math.max(
      0,
      Number(typeof salePrice === "number" ? salePrice : product.price || 0)
    );

    if (commission > 0) {
      return Number((effectiveSalePrice * (1 - commission / 100)).toFixed(2));
    }

    return Math.max(0, Number(product.cost_price || 0));
  };

  const getUnitProfitFromProduct = (product: Product, salePrice?: number) => {
    const effectiveSalePrice = Math.max(
      0,
      Number(typeof salePrice === "number" ? salePrice : product.price || 0)
    );
    const effectiveCost = getUnitCostFromProduct(product, effectiveSalePrice);
    return effectiveSalePrice - effectiveCost;
  };
  const isProductSoldOut = (product: Product) => Boolean(product.sold_out);
  const getSoldOutSizes = (product: Product) =>
    Array.isArray(product.sold_out_sizes) ? product.sold_out_sizes : [];

  const updateProductSoldOut = async (productId: string, soldOut: boolean) => {
    try {
      await updateDoc(doc(db, "products", productId), {
        sold_out: soldOut,
      });
    } catch (error) {
      console.error("Error updating sold out status:", error);
      alert("Failed to update sold out status");
    }
  };

  const updateProductSoldOutSizes = async (
    productId: string,
    soldOutSizesRaw: string
  ) => {
    try {
      const soldOutSizes = parseCommaSeparatedValues(soldOutSizesRaw).filter(
        (value, index, all) =>
          all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) ===
          index
      );
      await updateDoc(doc(db, "products", productId), {
        sold_out_sizes: soldOutSizes,
      });
    } catch (error) {
      console.error("Error updating sold out sizes:", error);
      alert("Failed to update sold out sizes");
    }
  };

  const updateProductCommission = async (
    productId: string,
    commissionPercentage: number
  ) => {
    try {
      const product = products.find((p) => p.id === productId);
      if (!product) return;

      const safeCommission = Math.max(0, Number(commissionPercentage || 0));
      const costPrice = Math.max(0, Number(product.cost_price || 0));
      const existingBasePrice = Math.max(
        0,
        Number(product.original_price ?? product.price ?? 0)
      );
      const basePrice =
        costPrice > 0
          ? Number((costPrice * (1 + safeCommission / 100)).toFixed(2))
          : existingBasePrice;
      const activeDiscount = Math.max(0, Number(product.discount_percentage || 0));
      const finalPrice =
        activeDiscount > 0
          ? Number((basePrice * (1 - activeDiscount / 100)).toFixed(2))
          : basePrice;

      await updateDoc(doc(db, "products", productId), {
        commission_percentage: safeCommission,
        original_price: basePrice,
        price: finalPrice,
      });
    } catch (error) {
      console.error("Error updating commission:", error);
      alert("Failed to update commission");
    }
  };

  const applyCommissionToCategory = async () => {
    if (bulkCommissionCategory === "all") {
      alert("Select a target first.");
      return;
    }

    const isSupplementTarget = bulkCommissionCategory === "__supplements__";
    const supplementPattern =
      /\b(supplement|protein|whey|creatine|amino|bcaa|eaa|vitamin|mass|gainer|collagen|omega|pre[\s-]?workout|electrolyte|fat[\s-]?burner|testosterone|glutamin|citrulline|carbs)\b/i;
    const targets = products.filter((product) => {
      if (isSupplementTarget) {
        return supplementPattern.test(
          `${product.category || ""} ${product.subcategory || ""} ${
            product.product_type || ""
          } ${product.name || ""}`
        );
      }
      return String(product.category || "").trim() === bulkCommissionCategory;
    });
    if (targets.length === 0) {
      alert("No products found in this category.");
      return;
    }

    const safeCommission = Math.max(0, Number(bulkCommissionPercentage || 0));
    const shouldProceed = window.confirm(
      `Apply ${safeCommission}% commission to ${targets.length} product${
        targets.length === 1 ? "" : "s"
      } in ${isSupplementTarget ? "All Supplements" : bulkCommissionCategory}?`
    );
    if (!shouldProceed) return;

    try {
      setApplyingBulkCommission(true);
      let batch = writeBatch(db);
      let operations = 0;

      for (const product of targets) {
        const costPrice = Math.max(0, Number(product.cost_price || 0));
        const existingBasePrice = Math.max(
          0,
          Number(product.original_price ?? product.price ?? 0)
        );
        const basePrice =
          costPrice > 0
            ? Number((costPrice * (1 + safeCommission / 100)).toFixed(2))
            : existingBasePrice;
        const activeDiscount = Math.max(0, Number(product.discount_percentage || 0));
        const finalPrice =
          activeDiscount > 0
            ? Number((basePrice * (1 - activeDiscount / 100)).toFixed(2))
            : basePrice;

        batch.update(doc(db, "products", product.id), {
          commission_percentage: safeCommission,
          original_price: basePrice,
          price: finalPrice,
        });
        operations += 1;

        if (operations >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          operations = 0;
        }
      }

      if (operations > 0) {
        await batch.commit();
      }

      alert(`Commission updated for ${targets.length} product${targets.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error("Error applying bulk commission:", error);
      alert("Failed to apply bulk commission.");
    } finally {
      setApplyingBulkCommission(false);
    }
  };

  const applyCommissionBySourceUrl = async () => {
    const normalized = sourceCommissionUrl.trim();
    if (!normalized) {
      alert("Paste a source website link first.");
      return;
    }

    let sourceHost = "";
    try {
      sourceHost = new URL(normalized).hostname.toLowerCase();
    } catch {
      alert("Please enter a valid website URL.");
      return;
    }

    const safeCommission = Math.max(0, Number(sourceCommissionPercentage || 0));
    const targets = products.filter((product) => {
      const sourceUrl = String(product.source_url || "").trim();
      if (!sourceUrl) return false;
      try {
        return new URL(sourceUrl).hostname.toLowerCase() === sourceHost;
      } catch {
        return false;
      }
    });

    if (targets.length === 0) {
      alert(`No imported products found for ${sourceHost}.`);
      return;
    }

    const shouldProceed = window.confirm(
      `Apply ${safeCommission}% commission to ${targets.length} product${
        targets.length === 1 ? "" : "s"
      } from ${sourceHost}?`
    );
    if (!shouldProceed) return;

    try {
      setApplyingSourceCommission(true);
      let batch = writeBatch(db);
      let operations = 0;

      for (const product of targets) {
        const costPrice = Math.max(0, Number(product.cost_price || 0));
        const existingBasePrice = Math.max(
          0,
          Number(product.original_price ?? product.price ?? 0)
        );
        const basePrice =
          costPrice > 0
            ? Number((costPrice * (1 + safeCommission / 100)).toFixed(2))
            : existingBasePrice;
        const activeDiscount = Math.max(0, Number(product.discount_percentage || 0));
        const finalPrice =
          activeDiscount > 0
            ? Number((basePrice * (1 - activeDiscount / 100)).toFixed(2))
            : basePrice;

        batch.update(doc(db, "products", product.id), {
          commission_percentage: safeCommission,
          original_price: basePrice,
          price: finalPrice,
        });
        operations += 1;

        if (operations >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          operations = 0;
        }
      }

      if (operations > 0) {
        await batch.commit();
      }

      alert(
        `Commission updated for ${targets.length} product${
          targets.length === 1 ? "" : "s"
        } from ${sourceHost}.`
      );
    } catch (error) {
      console.error("Error applying source commission:", error);
      alert("Failed to apply commission by source.");
    } finally {
      setApplyingSourceCommission(false);
    }
  };

  const clearActiveSaleDiscounts = async () => {
    const discountedSnapshot = await getDocs(
      query(collection(db, "products"), where("discount_percentage", ">", 0))
    );

    await Promise.all(
      discountedSnapshot.docs.map((entry) => {
        const data = entry.data();
        const originalPrice = Number(data.original_price ?? data.price ?? 0);

        return updateDoc(entry.ref, {
          discount_percentage: 0,
          price: originalPrice,
          original_price: originalPrice,
        });
      })
    );

    return discountedSnapshot.size;
  };

  const endSaleNow = async () => {
    try {
      setSavingSaleSettings(true);
      await setDoc(
        doc(db, "site_settings", "sale"),
        {
          sale_title: saleSettings.sale_title || "SEASONAL SALE",
          sale_headline: saleSettings.sale_headline || "UP TO 70% OFF",
          sale_subtitle: saleSettings.sale_subtitle || "Limited Time Offer",
          show_sale_link: false,
          end_at: null,
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );

      const updatedCount = await clearActiveSaleDiscounts();
      setSaleSettings((prev) => ({
        ...prev,
        end_at_input: "",
      }));

      alert(
        `Sale ended manually and removed from ${updatedCount} discounted product${updatedCount === 1 ? "" : "s"}.`
      );
    } catch (error) {
      console.error("Error ending sale:", error);
      alert("Failed to end sale");
    } finally {
      setSavingSaleSettings(false);
    }
  };

  const showSaleNow = async () => {
    const parsedEndDate = new Date(saleSettings.end_at_input);
    const validEndDate = Number.isNaN(parsedEndDate.getTime())
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      : parsedEndDate;

    try {
      setSavingSaleSettings(true);
      await setDoc(
        doc(db, "site_settings", "sale"),
        {
          sale_title: saleSettings.sale_title || "SEASONAL SALE",
          sale_headline: saleSettings.sale_headline || "UP TO 70% OFF",
          sale_subtitle: saleSettings.sale_subtitle || "Limited Time Offer",
          show_sale_link: true,
          end_at: Timestamp.fromDate(validEndDate),
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );

      setSaleSettings((prev) => ({
        ...prev,
        end_at_input: toDateTimeLocalInput(validEndDate),
      }));

      alert("Sale shown again.");
    } catch (error) {
      console.error("Error showing sale:", error);
      alert("Failed to show sale");
    } finally {
      setSavingSaleSettings(false);
    }
  };

  const saveSaleSettings = async () => {
    if (!saleSettings.end_at_input) {
      alert("Please set a sale end date and time.");
      return;
    }

    const endDate = new Date(saleSettings.end_at_input);
    if (Number.isNaN(endDate.getTime())) {
      alert("Invalid sale end date.");
      return;
    }

    try {
      setSavingSaleSettings(true);
      await setDoc(
        doc(db, "site_settings", "sale"),
        {
          sale_title: saleSettings.sale_title || "SEASONAL SALE",
          sale_headline: saleSettings.sale_headline || "UP TO 70% OFF",
          sale_subtitle: saleSettings.sale_subtitle || "Limited Time Offer",
          show_sale_link: true,
          end_at: Timestamp.fromDate(endDate),
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );
      alert("Sale timer settings saved.");
    } catch (error) {
      console.error("Error saving sale settings:", error);
      alert("Failed to save sale timer settings");
    } finally {
      setSavingSaleSettings(false);
    }
  };

  const updateHomeCategory = (
    index: number,
    field: keyof HomeCategoryEntry,
    value: string
  ) => {
    setHomepageSettings((prev) => {
      const nextCategories = [...prev.home_categories];
      const current = nextCategories[index];
      if (!current) return prev;

      if (field === "name") {
        const shouldAutoFillSlug = !String(current.slug || "").trim();
        nextCategories[index] = {
          ...current,
          name: value,
          slug: shouldAutoFillSlug
            ? normalizeHomeCategorySlug(value)
            : String(current.slug || ""),
        };
      } else if (field === "slug") {
        nextCategories[index] = {
          ...current,
          slug: value,
        };
      } else {
        nextCategories[index] = {
          ...current,
          [field]: value,
        };
      }
      return {
        ...prev,
        home_categories: nextCategories,
      };
    });
  };

  const addHomeCategory = () => {
    setHomepageSettings((prev) => ({
      ...prev,
      home_categories: [
        ...prev.home_categories,
        {
          id: `custom-${Date.now()}`,
          name: "",
          slug: "",
          image_url: "",
        },
      ],
    }));
  };

  const removeHomeCategory = (index: number) => {
    setHomepageSettings((prev) => ({
      ...prev,
      home_categories: prev.home_categories.filter((_, i) => i !== index),
    }));
  };

  const moveHomeCategory = (index: number, direction: "up" | "down") => {
    setHomepageSettings((prev) => {
      const nextCategories = [...prev.home_categories];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= nextCategories.length) return prev;
      [nextCategories[index], nextCategories[targetIndex]] = [
        nextCategories[targetIndex],
        nextCategories[index],
      ];
      return {
        ...prev,
        home_categories: nextCategories,
      };
    });
  };

  const updateShopMenuItem = (
    index: number,
    field: keyof ShopMenuItemEntry,
    value: string | boolean
  ) => {
    setHomepageSettings((prev) => {
      const nextItems = [...prev.shop_menu_items];
      const currentItem = nextItems[index];
      if (!currentItem) return prev;

      if (field === "label" && typeof value === "string") {
        const nextLabel = value;
        const previousSuggestedPath = suggestShopMenuPath(currentItem.label);
        const currentPath = String(currentItem.path || "").trim();
        const shouldAutoUpdatePath =
          !currentPath || currentPath === previousSuggestedPath;

        nextItems[index] = {
          ...currentItem,
          label: nextLabel,
          path: shouldAutoUpdatePath
            ? suggestShopMenuPath(nextLabel)
            : currentItem.path,
        };
      } else {
        nextItems[index] = {
          ...currentItem,
          [field]: value,
        };
      }
      return {
        ...prev,
        shop_menu_items: nextItems,
      };
    });
  };

  const addShopMenuItem = () => {
    setHomepageSettings((prev) => ({
      ...prev,
      shop_menu_items: [
        ...prev.shop_menu_items,
        {
          id: `menu-${Date.now()}`,
          label: "",
          path: "",
          special: false,
        },
      ],
    }));
  };

  const removeShopMenuItem = (index: number) => {
    setHomepageSettings((prev) => ({
      ...prev,
      shop_menu_items: prev.shop_menu_items.filter((_, i) => i !== index),
    }));
  };

  const moveShopMenuItem = (index: number, direction: "up" | "down") => {
    setHomepageSettings((prev) => {
      const nextItems = [...prev.shop_menu_items];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= nextItems.length) return prev;
      [nextItems[index], nextItems[targetIndex]] = [
        nextItems[targetIndex],
        nextItems[index],
      ];
      return {
        ...prev,
        shop_menu_items: nextItems,
      };
    });
  };

  const toggleHomeCollection = (collectionId: string) => {
    setHomepageSettings((prev) => {
      const exists = prev.home_collection_ids.includes(collectionId);
      if (exists) {
        return {
          ...prev,
          home_collection_ids: prev.home_collection_ids.filter(
            (id) => id !== collectionId
          ),
        };
      }
      return {
        ...prev,
        home_collection_ids: [...prev.home_collection_ids, collectionId],
      };
    });
  };

  const moveHomeCollection = (index: number, direction: "up" | "down") => {
    setHomepageSettings((prev) => {
      const nextCollectionIds = [...prev.home_collection_ids];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= nextCollectionIds.length) {
        return prev;
      }
      [nextCollectionIds[index], nextCollectionIds[targetIndex]] = [
        nextCollectionIds[targetIndex],
        nextCollectionIds[index],
      ];
      return {
        ...prev,
        home_collection_ids: nextCollectionIds,
      };
    });
  };

  const saveHomepageSettings = async () => {
    const cleanedCategories = homepageSettings.home_categories
      .map((entry, index) => ({
        id: entry.id || `custom-${index + 1}`,
        name: entry.name.trim(),
        slug: normalizeHomeCategorySlug(entry.slug),
        image_url: entry.image_url.trim(),
      }))
      .filter((entry) => entry.name && entry.slug && entry.image_url);

    const cleanedShopMenuItems = homepageSettings.shop_menu_items
      .map((entry, index) => ({
        id: entry.id || `menu-${index + 1}`,
        label: entry.label.trim(),
        path: normalizeHomepageShopPath(entry.path),
        special: Boolean(entry.special),
      }))
      .filter((entry) => entry.label && entry.path);

    try {
      setSavingHomepageSettings(true);
      await setDoc(
        doc(db, "site_settings", "homepage"),
        {
          hero_image_url: homepageSettings.hero_image_url.trim(),
          today_pick_product_id: homepageSettings.today_pick_product_id || "",
          home_categories: cleanedCategories,
          home_collection_ids: homepageSettings.home_collection_ids,
          shop_menu_items: cleanedShopMenuItems,
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );
      alert("Homepage settings saved.");
    } catch (error) {
      console.error("Error saving homepage settings:", error);
      alert("Failed to save homepage settings");
    } finally {
      setSavingHomepageSettings(false);
    }
  };

  const updateOrderStatus = async (
    orderId: string,
    newStatus: OrderStatus,
    statusNote?: string
  ) => {
    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      await updateOrderStatusWithInventory({
        orderId,
        userId: order.user_id,
        items: order.items,
        newStatus,
        statusNote,
      });
      try {
        await createOrderStatusNotification({
          orderId,
          userId: order.user_id,
          userEmail: order.user_email,
          newStatus,
          itemCount: Array.isArray(order.items)
            ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
            : 0,
        });
      } catch (notificationError) {
        console.error("Failed to send order status web notification:", notificationError);
      }
      try {
        await sendOrderStatusEmail({
          orderId,
          userEmail: order.user_email,
          newStatus,
          itemCount: Array.isArray(order.items)
            ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
            : 0,
        });
      } catch (emailError) {
        console.error("Failed to send order status email:", emailError);
        alert(
          `Order status updated, but email failed: ${
            emailError instanceof Error
              ? emailError.message
              : "Unknown email error"
          }`
        );
      }
    } catch (error) {
      console.error("Error updating order status:", error);
      alert(
        error instanceof Error ? error.message : "Failed to update order status"
      );
    }
  };

  const getAllowedStatusOptions = (_currentStatus: OrderStatus): OrderStatus[] => {
    return ["pending", "processing", "shipped", "delivered", "cancelled"];
  };

  const deleteSubscriber = async (subscriberId: string) => {
    const subscriber = subscribers.find((entry) => entry.id === subscriberId);

    setConfirmAction({
      title: "Remove Subscriber",
      message: "Remove this subscriber from your newsletter list?",
      danger: false,
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, "newsletter", subscriberId));

          if (subscriber?.email) {
            const normalizedEmail = subscriber.email.trim().toLowerCase();
            const usersRef = collection(db, "users");
            const newsletterRef = collection(db, "newsletter");

            const subscriberSnapshot = await getDocs(
              query(newsletterRef, where("email", "==", normalizedEmail))
            );

            // Fallback for legacy records that may have non-normalized casing.
            const fallbackSubscriberSnapshot =
              normalizedEmail !== subscriber.email
                ? await getDocs(
                    query(newsletterRef, where("email", "==", subscriber.email))
                  )
                : null;

            const seenSubscriberIds = new Set<string>();
            const matchedSubscriberDocs = [
              ...subscriberSnapshot.docs,
              ...(fallbackSubscriberSnapshot?.docs ?? []),
            ].filter((subscriberDoc) => {
              if (seenSubscriberIds.has(subscriberDoc.id)) return false;
              seenSubscriberIds.add(subscriberDoc.id);
              return true;
            });

            matchedSubscriberDocs.forEach((subscriberDoc) => {
              batch.delete(subscriberDoc.ref);
            });

            const userSnapshot = await getDocs(
              query(usersRef, where("email", "==", normalizedEmail))
            );

            // Fallback for legacy records that may have non-normalized casing.
            const fallbackSnapshot =
              normalizedEmail !== subscriber.email
                ? await getDocs(
                    query(usersRef, where("email", "==", subscriber.email))
                  )
                : null;

            const seenUserIds = new Set<string>();
            const matchedUserDocs = [
              ...userSnapshot.docs,
              ...(fallbackSnapshot?.docs ?? []),
            ].filter((userDoc) => {
              if (seenUserIds.has(userDoc.id)) return false;
              seenUserIds.add(userDoc.id);
              return true;
            });

            if (matchedUserDocs.length > 0) {
              matchedUserDocs.forEach((userDoc) => {
                batch.update(userDoc.ref, {
                  subscribeNewsletter: false,
                  "notificationPreferences.newsletter": false,
                  updatedAt: Timestamp.now(),
                });
              });
            }
          }

          await batch.commit();
        } catch (error) {
          console.error("Error deleting subscriber:", error);
          alert("Failed to remove subscriber");
        }
      },
    });
    setShowConfirmModal(true);
  };

  const deleteUser = async (userId: string) => {
    const userToDelete = adminUsers.find((entry) => entry.id === userId);
    const normalizedEmail = String(userToDelete?.email || "")
      .trim()
      .toLowerCase();

    if (!userToDelete) {
      alert("User not found.");
      return;
    }

    if (user?.uid && user.uid === userId) {
      alert("You cannot delete your own admin user from this panel.");
      return;
    }

    setConfirmAction({
      title: "Delete User",
      message:
        "This will permanently remove this user profile and related Firestore data (orders, carts, notification states, newsletter records). Continue?",
      danger: true,
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);

          // Delete main user document
          batch.delete(doc(db, "users", userId));

          // Delete user orders in subcollection
          const userOrdersSnapshot = await getDocs(
            collection(db, "users", userId, "orders")
          );
          userOrdersSnapshot.forEach((entry) => batch.delete(entry.ref));

          // Delete user notification states
          const userNotiStatesSnapshot = await getDocs(
            collection(db, "users", userId, "web_notification_states")
          );
          userNotiStatesSnapshot.forEach((entry) => batch.delete(entry.ref));

          // Delete global orders linked to this user id
          const globalOrdersSnapshot = await getDocs(
            query(collection(db, "orders"), where("user_id", "==", userId))
          );
          globalOrdersSnapshot.forEach((entry) => batch.delete(entry.ref));

          // Delete carts linked to this user
          const cartsSnapshot = await getDocs(
            query(collection(db, "carts"), where("user_id", "==", userId))
          );
          cartsSnapshot.forEach((entry) => batch.delete(entry.ref));

          // Delete newsletter docs for matching email
          if (normalizedEmail) {
            const newsletterSnapshot = await getDocs(
              query(collection(db, "newsletter"), where("email", "==", normalizedEmail))
            );
            newsletterSnapshot.forEach((entry) => batch.delete(entry.ref));
          }

          await batch.commit();
          alert(
            "User data deleted from Firestore. Note: Firebase Auth account deletion requires backend admin privileges."
          );
        } catch (error) {
          console.error("Error deleting user:", error);
          alert("Failed to delete user.");
        }
      },
    });
    setShowConfirmModal(true);
  };

  const resetCollectionForm = () => {
    setEditingCollection(null);
    setCollectionForm({
      name: "",
      description: "",
      image_url: "",
      season: "Spring",
      year: new Date().getFullYear(),
      product_count: 0,
      is_active: true,
    });
  };

  const startEditCollection = (entry: CollectionEntry) => {
    setEditingCollection(entry);
    setCollectionForm({
      name: entry.name || "",
      description: entry.description || "",
      image_url: entry.image_url || "",
      season: entry.season || "Spring",
      year: entry.year || new Date().getFullYear(),
      product_count: entry.product_count || 0,
      is_active: entry.is_active !== false,
    });
  };

  const saveCollection = async () => {
    if (!collectionForm.name || !collectionForm.image_url) {
      alert("Collection name and image URL are required.");
      return;
    }

    const payload = {
      name: collectionForm.name,
      description: collectionForm.description,
      image_url: collectionForm.image_url,
      season: collectionForm.season,
      year: Number(collectionForm.year),
      product_count: Number(collectionForm.product_count),
      is_active: collectionForm.is_active,
      updated_at: Timestamp.now(),
    };

    try {
      if (editingCollection) {
        await updateDoc(doc(db, "collections", editingCollection.id), payload);
      } else {
        await addDoc(collection(db, "collections"), {
          ...payload,
          created_at: Timestamp.now(),
        });
      }

      resetCollectionForm();
      alert("Collection saved successfully.");
    } catch (error) {
      console.error("Error saving collection:", error);
      alert("Failed to save collection.");
    }
  };

  const deleteCollection = async (collectionId: string) => {
    setConfirmAction({
      title: "Delete Collection",
      message: "Are you sure you want to delete this collection?",
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "collections", collectionId));
          if (editingCollection?.id === collectionId) resetCollectionForm();
        } catch (error) {
          console.error("Error deleting collection:", error);
          alert("Failed to delete collection.");
        }
      },
    });
    setShowConfirmModal(true);
  };

  const exportData = <T extends object>(data: T[], filename: string) => {
    if (data.length === 0) return;

    const csv = [
      Object.keys(data[0]).join(","),
      ...data.map((row) =>
        Object.values(row as Record<string, CsvValue>)
          .map((value) => String(value ?? ""))
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  const deferredProductSearch = useDeferredValue(searchTerm.trim().toLowerCase());
  const searchableProducts = useMemo(
    () =>
      products.map((product) => {
        const tagsText = Array.isArray(product.tags) ? product.tags.join(" ") : "";
        return {
          product,
          categoryKey: String(product.category || "").trim(),
          searchBlob: [
            product.name,
            product.category,
            product.subcategory,
            product.product_type,
            product.brand,
            product.sku,
            tagsText,
            product.id,
          ]
            .map((value) => String(value || "").toLowerCase())
            .join(" "),
        };
      }),
    [products]
  );
  const filteredProducts = useMemo(() => {
    return searchableProducts
      .filter(({ product, categoryKey, searchBlob }) => {
        const matchesSearch =
          deferredProductSearch.length === 0 ||
          searchBlob.includes(deferredProductSearch);
        const matchesCategory =
          selectedCategory === "all" ||
          categoryKey === selectedCategory ||
          product.category === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .map(({ product }) => product);
  }, [deferredProductSearch, searchableProducts, selectedCategory]);
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleProductCount),
    [filteredProducts, visibleProductCount]
  );
  const visibleProductIds = useMemo(
    () => visibleProducts.map((product) => product.id),
    [visibleProducts]
  );
  const selectedVisibleCount = useMemo(
    () => visibleProductIds.filter((id) => selectedProductIds.includes(id)).length,
    [visibleProductIds, selectedProductIds]
  );
  const allVisibleSelected =
    visibleProductIds.length > 0 && selectedVisibleCount === visibleProductIds.length;
  const hasMoreProducts = visibleProductCount < filteredProducts.length;
  useEffect(() => {
    setVisibleProductCount(24);
  }, [deferredProductSearch, selectedCategory]);
  useEffect(() => {
    const validIds = new Set(products.map((product) => product.id));
    setSelectedProductIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [products]);
  const toggleSelectVisibleProducts = () => {
    if (visibleProductIds.length === 0) return;

    setSelectedProductIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleProductIds.includes(id));
      }
      const next = new Set(prev);
      visibleProductIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };
  useEffect(() => {
    if (!showProductModal) return;

    if (productForm.category) {
      setOpenCategoryTreeNodes((prev) =>
        prev.includes(productForm.category) ? prev : [...prev, productForm.category]
      );
    }

    if (productForm.category && productForm.subcategory) {
      const subcategoryKey = `${productForm.category}::${productForm.subcategory}`;
      setOpenSubcategoryTreeNodes((prev) =>
        prev.includes(subcategoryKey) ? prev : [...prev, subcategoryKey]
      );
    }
  }, [
    productForm.category,
    productForm.subcategory,
    showProductModal,
    setOpenCategoryTreeNodes,
    setOpenSubcategoryTreeNodes,
  ]);

  const searchedOrders = orders.filter((order) => {
    return (
      order.id.toLowerCase().includes(orderSearchTerm.toLowerCase()) ||
      order.user_email?.toLowerCase().includes(orderSearchTerm.toLowerCase())
    );
  });
  const orderStatusTabs: Array<{
    key: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
    label: string;
  }> = [
    { key: "pending", label: "Pending" },
    { key: "processing", label: "Processing" },
    { key: "shipped", label: "Shipped" },
    { key: "delivered", label: "Delivered" },
    { key: "cancelled", label: "Cancelled" },
  ];
  const orderCountsByStatus = orderStatusTabs.reduce(
    (acc, tab) => {
      acc[tab.key] = searchedOrders.filter((order) => order.status === tab.key).length;
      return acc;
    },
    {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    } as Record<
      "pending" | "processing" | "shipped" | "delivered" | "cancelled",
      number
    >
  );
  const filteredOrders = searchedOrders.filter(
    (order) => order.status === orderStatusTab
  );

  const userRows: AdminUserRow[] = adminUsers.map((entry) => {
    const email = String(entry.email || "").trim().toLowerCase();
    const relatedOrders = orders.filter((order) => {
      if (order.user_id && order.user_id === entry.id) return true;
      if (!email) return false;
      return String(order.user_email || "").trim().toLowerCase() === email;
    });
    const lastOrderDate =
      relatedOrders.length > 0
        ? relatedOrders.reduce<Date | null>((latest, order) => {
            const orderDate = toDate(order.created_at);
            if (!latest || orderDate.getTime() > latest.getTime()) return orderDate;
            return latest;
          }, null)
        : null;
    const totalSpent = relatedOrders.reduce((sum, order) => {
      if (isCancelledOrder(order.status)) return sum;
      return sum + Number(order.total || 0);
    }, 0);
    const fullName = String(
      `${entry.firstName || ""} ${entry.lastName || ""}`.trim() ||
        entry.displayName ||
        "Not provided"
    );
    const phone = String(
      `${entry.countryCode || ""} ${entry.phone || ""}`.trim() || "Not provided"
    );
    const locationParts = [entry.city, entry.state, entry.country]
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    const location = locationParts.length > 0 ? locationParts.join(", ") : "-";
    const mappedPrefs = userPreferencesByEmail[email];
    const subscriberMatch = subscribers.some(
      (sub) => String(sub.email || "").trim().toLowerCase() === email
    );

    return {
      id: entry.id,
      email: email || "-",
      fullName,
      phone,
      location,
      provider: String(entry.provider || "email/password"),
      ordersCount: relatedOrders.length,
      totalSpent,
      lastOrderDate,
      subscribedNewsletter: Boolean(
        entry.subscribeNewsletter ?? subscriberMatch ?? false
      ),
      preferences: {
        orderUpdates:
          mappedPrefs?.orderUpdates ??
          entry.notificationPreferences?.orderUpdates ??
          true,
        promotions:
          mappedPrefs?.promotions ??
          entry.notificationPreferences?.promotions ??
          true,
        newsletter:
          mappedPrefs?.newsletter ??
          entry.notificationPreferences?.newsletter ??
          Boolean(entry.subscribeNewsletter ?? subscriberMatch ?? false),
      },
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      address: entry.address,
      addressDetails: entry.addressDetails,
    };
  });

  const filteredUsers = userRows.filter((row) => {
    const term = userSearchTerm.toLowerCase();
    return (
      row.email.toLowerCase().includes(term) ||
      row.fullName.toLowerCase().includes(term) ||
      row.phone.toLowerCase().includes(term) ||
      row.location.toLowerCase().includes(term) ||
      row.id.toLowerCase().includes(term)
    );
  });

  const subscriberRows: SubscriberView[] = subscribers.map((subscriber) => {
    const email = subscriber.email?.toLowerCase?.() || "";
    const mappedPrefs = userPreferencesByEmail[email];

    return {
      ...subscriber,
      preferences: {
        orderUpdates: mappedPrefs?.orderUpdates ?? true,
        promotions: mappedPrefs?.promotions ?? true,
        newsletter: mappedPrefs?.newsletter ?? true,
      },
    };
  });

  const filteredSubscribers = subscriberRows.filter((sub) =>
    sub.email.toLowerCase().includes(subscriberSearchTerm.toLowerCase())
  );

  const renderPreferenceBadge = (enabled: boolean) => (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {enabled ? "Yes" : "No"}
    </span>
  );
  const filteredCollections = collectionsData.filter((entry) => {
    const term = collectionSearchTerm.toLowerCase();
    return (
      entry.name?.toLowerCase().includes(term) ||
      entry.season?.toLowerCase().includes(term) ||
      String(entry.year || "").includes(term)
    );
  });

  const featuredProducts = products.filter((p) => p.is_featured);
  const newArrivals = products.filter((p) => p.is_new_arrival);
  const availableForFeatured = products.filter((p) => !p.is_featured);
  const availableForNewArrivals = products.filter((p) => !p.is_new_arrival);

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center bg-slate-950">
        <div className="text-slate-300">Loading admin dashboard...</div>
      </div>
    );
  }

  const currentMonthData =
    monthlyRevenueHistory[selectedMonthIndex] || monthlyRevenueHistory[0];
  const tabs: Array<{
    id:
      | "overview"
      | "products"
      | "orders"
      | "users"
      | "featured"
      | "collections"
      | "subscribers";
    label: string;
    icon: typeof TrendingUp;
  }> = [
    { id: "overview", label: "Overview", icon: TrendingUp },
    { id: "products", label: "Products", icon: Package },
    { id: "orders", label: "Orders", icon: ShoppingBag },
    { id: "users", label: "Users", icon: Users },
    { id: "featured", label: "Featured & New", icon: Star },
    { id: "collections", label: "Collections", icon: Sparkles },
    { id: "subscribers", label: "Subscribers", icon: Mail },
  ];
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const isManualProductEntry = editingProduct !== null || productEntryMode === "manual";
  const productContextLabel = [
    productForm.category,
    productForm.subcategory,
    productForm.product_type,
  ]
    .join(" ")
    .toLowerCase();
  const isSupplementProduct =
    /\b(supplement|herbal|protein|whey|creatine|pre[\s-]?workout|bcaa|vitamin|mass|collagen|omega|electrolyte|gainer)\b/.test(
      productContextLabel
    );
  const isFootwearProduct = /\b(shoe|sneaker|boot|cleat|runner|running)\b/.test(
    productContextLabel
  );
  const isClothingLikeProduct =
    /\b(cloth|apparel|shirt|t-shirt|tee|jersey|short|pant|jogger|hoodie|sweatshirt|jacket|top|bottom)\b/.test(
      productContextLabel
    );
  const isSockProduct = /\bsock|socks\b/.test(productContextLabel);
  const isAccessoryLikeProduct =
    /\b(accessories|accessory|bag|cap|hat|bottle|belt|shaker)\b/.test(
      productContextLabel
    );
  const isCombatGearProduct =
    /\b(glove|boxing|muay thai|mma|wrap|shin|guard|mouthguard)\b/.test(
      productContextLabel
    );
  const showSizingFields =
    !isSupplementProduct &&
    !isAccessoryLikeProduct &&
    (isFootwearProduct || isClothingLikeProduct || isSockProduct);
  const showSizeGuideField = showSizingFields;
  const showMaterialAndCareFields = !isSupplementProduct;
  const showSupplementFields = isSupplementProduct;
  const showAudienceField = showSizingFields;
  const categoryAwareSubcategoryOptions = Array.from(
    new Set([
      ...(suggestedSubcategoryByCategory[productForm.category] || []),
      ...suggestedSubcategoryOptions,
    ])
  ).sort((a, b) => a.localeCompare(b));
  const autoGeneratedSku = buildAutoSku(productForm.category, productForm.name);
  const commissionPercentage = Math.max(
    0,
    Number(productForm.commission_percentage || 0)
  );
  const manualRetailPrice = Math.max(0, Number(productForm.price || 0));
  const manualOriginalPrice = Math.max(
    manualRetailPrice,
    Number(productForm.original_price || productForm.price || 0)
  );
  const commissionSuggestedPrice = Number(
    (
      Math.max(0, Number(productForm.cost_price || 0)) *
      (1 + commissionPercentage / 100)
    ).toFixed(2)
  );
  const commissionBasedProfit = Number(
    (manualRetailPrice * (commissionPercentage / 100)).toFixed(2)
  );
  const formUnitProfit =
    commissionPercentage > 0
      ? commissionBasedProfit
      : manualRetailPrice - Math.max(0, Number(productForm.cost_price || 0));
  const formProfitMargin =
    manualRetailPrice > 0 ? (formUnitProfit / manualRetailPrice) * 100 : 0;
  const productDetailProfile = isSupplementProduct
    ? "Supplements"
    : isFootwearProduct
    ? "Footwear"
    : isCombatGearProduct
    ? "Combat Gear"
    : isAccessoryLikeProduct
    ? "Accessories"
    : "Apparel / General";

  const handleTabSelect = (tabId: (typeof tabs)[number]["id"]) => {
    setActiveTab(tabId);
    setIsSideNavOpen(false);
  };

  return (
    <div className="min-h-screen pt-10 pb-16 px-3 sm:px-4 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="lg:hidden mb-4">
          <button
            onClick={() => setIsSideNavOpen(true)}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex items-center justify-between"
          >
            <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
              <Menu size={18} />
              Sections
            </span>
            <span className="inline-flex items-center gap-2 text-sm text-gray-600">
              <activeTabMeta.icon size={16} />
              {activeTabMeta.label}
            </span>
          </button>
        </div>

        {isSideNavOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setIsSideNavOpen(false)}
          />
        )}

        <aside
          className={`fixed top-0 left-0 h-full w-72 bg-white border-r border-gray-200 z-50 transform transition-transform duration-300 lg:hidden ${
            isSideNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
            <p className="text-sm font-semibold tracking-wide">Dashboard Menu</p>
            <button
              onClick={() => setIsSideNavOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-2xl font-light tracking-wider leading-tight mb-2">
              ADMIN DASHBOARD
            </h1>
            <p className="text-sm text-gray-600 mb-4">
              Manage your store, products, orders, and subscribers
            </p>
            <button
              onClick={resetAllOrders}
              className="w-full flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg hover:bg-red-700 transition-colors"
            >
              <RefreshCw size={18} />
              Reset Revenue
            </button>
          </div>
          <div className="p-3 space-y-1">
            {tabs.map((tab) => (
              <button
                key={`mobile-${tab.id}`}
                onClick={() => handleTabSelect(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  activeTab === tab.id
                    ? "bg-black text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </div>
        </aside>

        {isDesktopSidebarOpen && (
          <>
            <div
              className="hidden lg:block fixed inset-0 bg-black/30 z-30"
              onClick={() => setIsDesktopSidebarOpen(false)}
            />
            <aside className="hidden lg:block fixed left-3 top-3 w-72 z-40">
            <div className="max-h-[calc(100vh-7rem)] bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-5 border-b border-gray-200">
                <h1 className="text-2xl font-light tracking-wider leading-tight mb-3">
                  ADMIN DASHBOARD
                </h1>
                <p className="text-sm text-gray-600 mb-4">
                  Manage your store, products, orders, and subscribers
                </p>
                <button
                  onClick={resetAllOrders}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg hover:bg-red-700 transition-colors"
                >
                  <RefreshCw size={18} />
                  Reset Revenue
                </button>
              </div>
              <div className="p-2 overflow-y-auto">
                {tabs.map((tab) => (
                  <button
                    key={`desktop-${tab.id}`}
                    onClick={() => handleTabSelect(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      activeTab === tab.id
                        ? "bg-black text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <tab.icon size={18} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            </aside>
          </>
        )}

        <button
          onClick={() => setIsDesktopSidebarOpen((prev) => !prev)}
          className={`hidden lg:inline-flex fixed z-50 items-center justify-center bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-all duration-300 ${
            isDesktopSidebarOpen
              ? "top-3 left-[17.8rem] h-10 w-10"
              : "top-3 left-3 h-10 px-3 gap-2"
          }`}
          aria-label={isDesktopSidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {isDesktopSidebarOpen ? <X size={16} /> : <Menu size={16} />}
          {!isDesktopSidebarOpen ? "Menu" : null}
        </button>

        <div
          className="min-w-0 transition-all duration-300 lg:ml-0"
        >
          <div className="flex-1 min-w-0">
        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Monthly Revenue Navigation */}
            {monthlyRevenueHistory.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <h2 className="text-xl font-light">Monthly Analysis</h2>
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <button
                      onClick={() =>
                        setSelectedMonthIndex((prev) =>
                          Math.min(prev + 1, monthlyRevenueHistory.length - 1)
                        )
                      }
                      disabled={
                        selectedMonthIndex >= monthlyRevenueHistory.length - 1
                      }
                      className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <span className="text-sm font-medium min-w-[120px] sm:min-w-[150px] text-center">
                      {currentMonthData?.month}
                    </span>
                    <button
                      onClick={() =>
                        setSelectedMonthIndex((prev) => Math.max(prev - 1, 0))
                      }
                      disabled={selectedMonthIndex <= 0}
                      className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-green-50 rounded-lg border border-green-100/80">
                    <p className="text-sm text-[#334155] mb-1 font-medium">Revenue</p>
                    <p className="text-2xl font-light text-[#0f172a]">
                      ${currentMonthData?.revenue.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100/80">
                    <p className="text-sm text-[#334155] mb-1 font-medium">Profit</p>
                    <p className="text-2xl font-light text-[#0f172a]">
                      ${currentMonthData?.profit.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-100/80">
                    <p className="text-sm text-[#334155] mb-1 font-medium">Orders</p>
                    <p className="text-2xl font-light text-[#0f172a]">
                      {currentMonthData?.orders}
                    </p>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-100/80">
                    <p className="text-sm text-[#334155] mb-1 font-medium">Profit Margin</p>
                    <p className="text-2xl font-light text-[#0f172a]">
                      {currentMonthData?.revenue > 0
                        ? (
                            (currentMonthData?.profit /
                              currentMonthData?.revenue) *
                            100
                          ).toFixed(1)
                        : "0"}
                      %
                    </p>
                  </div>
                </div>

                {/* All Months Summary */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500 mb-2">
                    History ({monthlyRevenueHistory.length} months)
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                    {monthlyRevenueHistory.map((month, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedMonthIndex(index)}
                        className={`p-2 rounded-lg text-left text-xs transition-colors ${
                          selectedMonthIndex === index
                            ? "bg-black text-white"
                            : "bg-gray-50 hover:bg-gray-100"
                        }`}
                      >
                        <p className="font-medium">{month.month}</p>
                        <p className="opacity-80">
                          ${month.revenue.toFixed(0)}
                        </p>
                        <p className="opacity-80">
                          Profit: ${month.profit.toFixed(0)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Analytics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <DollarSign className="text-green-600" size={24} />
                  </div>
                  <span className="text-sm text-gray-500">This Month</span>
                </div>
                <h3 className="text-3xl font-light mb-1">
                  ${analytics.monthlyRevenue.toFixed(2)}
                </h3>
                <p className="text-sm text-gray-600">Monthly Revenue</p>
                <p className="text-xs text-gray-500 mt-2">
                  Total: ${analytics.totalRevenue.toFixed(2)}
                </p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <TrendingUp className="text-green-600" size={24} />
                  </div>
                  <span className="text-sm text-gray-500">This Month</span>
                </div>
                <h3 className="text-3xl font-light mb-1">
                  ${analytics.monthlyProfit.toFixed(2)}
                </h3>
                <p className="text-sm text-gray-600">Monthly Profit</p>
                <p className="text-xs text-gray-500 mt-2">
                  Total: ${analytics.totalProfit.toFixed(2)}
                </p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <ShoppingBag className="text-blue-600" size={24} />
                  </div>
                  <span className="text-sm text-gray-500">This Month</span>
                </div>
                <h3 className="text-3xl font-light mb-1">
                  {analytics.monthlyOrders}
                </h3>
                <p className="text-sm text-gray-600">Monthly Orders</p>
                <p className="text-xs text-gray-500 mt-2">
                  Total: {analytics.totalOrders}
                </p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <Percent className="text-orange-600" size={24} />
                  </div>
                  <span className="text-sm text-gray-500">Overall</span>
                </div>
                <h3 className="text-3xl font-light mb-1">
                  {analytics.profitMargin}%
                </h3>
                <p className="text-sm text-gray-600">Profit Margin</p>
                <p className="text-xs text-gray-500 mt-2">Of total revenue</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Package className="text-purple-600" size={24} />
                  </div>
                  <span className="text-sm text-gray-500">Inventory</span>
                </div>
                <h3 className="text-3xl font-light mb-1">
                  {analytics.totalProducts}
                </h3>
                <p className="text-sm text-gray-600">Total Products</p>
                <p className="text-xs text-gray-500 mt-2">Inventory tracking disabled</p>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-pink-100 rounded-lg">
                    <Users className="text-pink-600" size={24} />
                  </div>
                  <span className="text-sm text-gray-500">Subscribers</span>
                </div>
                <h3 className="text-3xl font-light mb-1">
                  {analytics.totalSubscribers}
                </h3>
                <p className="text-sm text-gray-600">Email Subscribers</p>
                <p className="text-xs text-gray-500 mt-2">Active newsletter</p>
              </div>
            </div>

            {/* Recent Orders */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <h2 className="text-xl font-light mb-4">Recent Orders</h2>
              <div className="space-y-4">
                {orders.slice(0, 5).map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between py-3 border-b border-gray-100"
                  >
                    <div>
                      <p className="font-medium">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-sm text-gray-500">
                        {order.user_email || order.user_id || "Guest"} •{" "}
                        {order.items.length} items
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        ${(order.total || 0).toFixed(2)}
                      </p>
                          <span
                        className={`text-xs px-2 py-1 rounded-full inline-block ${
                          order.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : order.status === "processing"
                            ? "bg-blue-100 text-blue-800"
                            : order.status === "shipped"
                            ? "bg-purple-100 text-purple-800"
                            : order.status === "cancelled"
                            ? "bg-red-100 text-red-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {order.status.charAt(0).toUpperCase() +
                          order.status.slice(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Products Tab */}
        {activeTab === "products" && (
          <div className="space-y-6">
            {/* Filters & Actions */}
            <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Product Catalog</h2>
                  <p className="text-sm text-gray-500">
                    Showing {Math.min(visibleProducts.length, filteredProducts.length)} of{" "}
                    {filteredProducts.length} matching products
                    {selectedCategory !== "all" ? ` in ${selectedCategory}` : ""}.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                  <button
                    onClick={toggleSelectVisibleProducts}
                    disabled={visibleProductIds.length === 0}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-100 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-60"
                  >
                    {allVisibleSelected ? "Unselect Visible" : "Select Visible"}
                  </button>
                  <button
                    onClick={clearSelectedProducts}
                    disabled={selectedProductIds.length === 0}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-100 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-60"
                  >
                    Clear Selected ({selectedProductIds.length})
                  </button>
                  <button
                    onClick={deleteSelectedProducts}
                    disabled={selectedProductIds.length === 0}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
                  >
                    <Trash2 size={18} />
                    Delete Selected ({selectedProductIds.length})
                  </button>
                  <button
                    onClick={() => exportData(filteredProducts, "products.csv")}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-200 text-black px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    <Download size={20} />
                    Export
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <div className="relative flex-1 w-full">
                  <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={20}
                  />
                  <input
                    type="text"
                    placeholder="Search by name, brand, type, category, SKU, tag, or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedCategory("all");
                    setSelectedProductIds([]);
                  }}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Clear
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Selected in visible list: {selectedVisibleCount}/{visibleProductIds.length}
              </p>
            </div>

            <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
                Quick Add By Sport
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2">
                {quickAddProductPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => openProductModalWithPreset(preset)}
                    className="flex items-center justify-center gap-2 bg-gray-900 text-white px-3 py-2 rounded-lg hover:bg-black transition-colors text-sm"
                  >
                    <Plus size={14} />
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm space-y-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
                  Bulk Commission Target
                </p>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
                  <select
                    value={bulkCommissionCategory}
                    onChange={(e) => setBulkCommissionCategory(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  >
                    <option value="all">Select target...</option>
                    <option value="__supplements__">All Supplements</option>
                    {categories.map((cat) => (
                      <option key={`bulk-${cat}`} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={bulkCommissionPercentage}
                    onChange={(e) =>
                      setBulkCommissionPercentage(Number(e.target.value))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="Commission %"
                  />
                  <button
                    onClick={applyCommissionToCategory}
                    disabled={applyingBulkCommission || bulkCommissionCategory === "all"}
                    className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-60"
                  >
                    {applyingBulkCommission ? "Applying..." : "Apply"}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">
                  Commission By Website Link
                </p>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
                  <input
                    type="url"
                    value={sourceCommissionUrl}
                    onChange={(e) => setSourceCommissionUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="https://example.com/collection"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={sourceCommissionPercentage}
                    onChange={(e) =>
                      setSourceCommissionPercentage(Number(e.target.value))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="Commission %"
                  />
                  <button
                    onClick={applyCommissionBySourceUrl}
                    disabled={applyingSourceCommission || !sourceCommissionUrl.trim()}
                    className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-60"
                  >
                    {applyingSourceCommission ? "Applying..." : "Apply"}
                  </button>
                </div>
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleProducts.map((product) => {
                const displayCost = getUnitCostFromProduct(product);
                const profit = getUnitProfitFromProduct(product);
                const profitMargin =
                  product.price > 0 ? ((profit / product.price) * 100).toFixed(1) : "0.0";

                return (
                  <div
                    key={product.id}
                    className={`bg-white rounded-xl shadow-sm overflow-hidden transition-shadow ${
                      selectedProductIds.includes(product.id)
                        ? "ring-2 ring-black/20"
                        : "hover:shadow-lg"
                    }`}
                  >
                    <div className="aspect-[4/3] bg-gray-100 relative">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                      <label className="absolute top-2 left-2 inline-flex items-center gap-2 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          className="h-4 w-4"
                        />
                        Select
                      </label>
                      <div className="absolute top-2 right-2 flex gap-2">
                        {isProductSoldOut(product) && (
                          <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-semibold">
                            Sold Out
                          </span>
                        )}
                        {product.is_featured && (
                          <span className="bg-yellow-500 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                            <Star size={12} fill="white" />
                            Featured
                          </span>
                        )}
                        {product.is_new_arrival && (
                          <span className="bg-blue-500 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                            <Sparkles size={12} />
                            New
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-medium mb-1 line-clamp-2">
                            {product.name}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {product.category}
                            {product.subcategory && ` • ${product.subcategory}`}
                            {product.product_type &&
                              product.product_type !== product.subcategory &&
                              ` • ${product.product_type}`}
                            {product.brand && ` • ${product.brand}`}
                            {` • ${audienceLabelMap[
                              normalizeProductAudience(
                                product.audience,
                                product.category
                              )
                            ]}`}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openProductModal(product)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => deleteProduct(product.id)}
                            className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Pricing Info */}
                      <div className="bg-gray-50 p-3 rounded-lg mb-3 text-sm">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-gray-600">Retail Price:</span>
                          <span className="font-bold text-lg">
                            ${product.price?.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-gray-600">Cost Price:</span>
                          <span className="text-gray-700">
                            ${displayCost.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-gray-600">Commission:</span>
                          <span className="text-gray-700">
                            {getCommissionFromProduct(product).toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-gray-600">Availability:</span>
                          <span
                            className={`font-medium ${
                              isProductSoldOut(product) ? "text-red-600" : "text-green-700"
                            }`}
                          >
                            {isProductSoldOut(product) ? "Sold Out" : "In Stock"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-t pt-2">
                          <span className="text-gray-600">Profit:</span>
                          <span className="font-semibold text-green-600">
                            ${profit?.toFixed(2)} ({profitMargin}%)
                          </span>
                        </div>
                      </div>

                      {/* Quick Actions */}
                      <div className="border-t pt-3 space-y-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              toggleFeatured(
                                product.id,
                                product.is_featured || false
                              )
                            }
                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                              product.is_featured
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            <Star
                              size={14}
                              className="inline mr-1"
                              fill={
                                product.is_featured ? "currentColor" : "none"
                              }
                            />
                            Featured
                          </button>
                          <button
                            onClick={() =>
                              toggleNewArrival(
                                product.id,
                                product.is_new_arrival || false
                              )
                            }
                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                              product.is_new_arrival
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            <Sparkles size={14} className="inline mr-1" />
                            New
                          </button>
                        </div>
                        <button
                          onClick={() =>
                            updateProductSoldOut(product.id, !isProductSoldOut(product))
                          }
                          className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                            isProductSoldOut(product)
                              ? "bg-red-100 text-red-800 hover:bg-red-200"
                              : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          }`}
                        >
                          {isProductSoldOut(product) ? "Mark In Stock" : "Mark Sold Out"}
                        </button>

                        {/* Sale Controls */}
                        <div>
                          <label className="text-xs text-gray-600 block mb-2">
                            Discount %:
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="0"
                              max="90"
                              defaultValue={product.discount_percentage || 0}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  updateProductSale(
                                    product.id,
                                    Number((e.target as HTMLInputElement).value)
                                  );
                                }
                              }}
                            />
                            <button
                              onClick={(e) => {
                                const input = e.currentTarget
                                  .previousElementSibling as HTMLInputElement;
                                updateProductSale(
                                  product.id,
                                  Number(input.value)
                                );
                              }}
                              className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
                            >
                              <Percent size={16} />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 block mb-2">
                            Commission %:
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              defaultValue={getCommissionFromProduct(product)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  updateProductCommission(
                                    product.id,
                                    Number((e.target as HTMLInputElement).value)
                                  );
                                }
                              }}
                            />
                            <button
                              onClick={(e) => {
                                const input = e.currentTarget
                                  .previousElementSibling as HTMLInputElement;
                                updateProductCommission(
                                  product.id,
                                  Number(input.value)
                                );
                              }}
                              className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
                              title="Apply commission"
                            >
                              <Percent size={16} />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 block mb-2">
                            Sold Out Sizes (comma separated):
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              defaultValue={getSoldOutSizes(product).join(", ")}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              placeholder="M, L, 12oz, 30 Servings"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  updateProductSoldOutSizes(
                                    product.id,
                                    (e.target as HTMLInputElement).value
                                  );
                                }
                              }}
                            />
                            <button
                              onClick={(e) => {
                                const input = e.currentTarget
                                  .previousElementSibling as HTMLInputElement;
                                updateProductSoldOutSizes(product.id, input.value);
                              }}
                              className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
                              title="Apply sold out sizes"
                            >
                              <Save size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {filteredProducts.length === 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <p className="text-gray-900 font-medium">No products match this filter.</p>
                <p className="text-sm text-gray-500 mt-1">
                  Try a broader search term or switch to all categories.
                </p>
              </div>
            )}
            {hasMoreProducts && (
              <div className="flex justify-center">
                <button
                  onClick={() => setVisibleProductCount((prev) => prev + 24)}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                >
                  Load 24 More ({filteredProducts.length - visibleProducts.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === "orders" && (
          <div className="space-y-6">
            {/* Search Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="relative flex-1 w-full">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  type="text"
                  placeholder="Search by order ID or email..."
                  value={orderSearchTerm}
                  onChange={(e) => setOrderSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>
              <button
                onClick={() => exportData(filteredOrders, "orders.csv")}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-200 text-black px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                <Download size={20} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 -mt-3">
              {orderStatusTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setOrderStatusTab(tab.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    orderStatusTab === tab.key
                      ? "bg-black text-white border-gray-700"
                      : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                  }`}
                >
                  {tab.label} ({orderCountsByStatus[tab.key]})
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1020px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Details
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Items
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-6 py-10 text-center text-sm text-gray-500"
                        >
                          No {orderStatusTab} orders found for this search.
                        </td>
                      </tr>
                    )}
                    {filteredOrders.map((order) => (
                      <Fragment key={order.id}>
                        <tr className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedOrderId((prev) =>
                                prev === order.id ? null : order.id
                              )
                            }
                            className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-gray-300 hover:bg-gray-100 transition-colors"
                            aria-label={
                              expandedOrderId === order.id
                                ? "Hide order details"
                                : "Show order details"
                            }
                          >
                            <ChevronDown
                              size={16}
                              className={`transition-transform ${
                                expandedOrderId === order.id ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {order.user_email ||
                            `User ${(order.user_id || "guest").slice(0, 8)}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {toDate(order.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {order.items.length} items
                            </span>
                            <span className="text-xs text-gray-500">
                              {order.items
                                .slice(0, 2)
                                .map((item) => item.product_name || "Product")
                                .join(", ")}
                              {order.items.length > 2 && "..."}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          ${(order.total || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={order.status}
                            onChange={(e) =>
                              updateOrderStatus(order.id, e.target.value as OrderStatus)
                            }
                            className={`px-3 py-1 text-xs font-semibold rounded-full border-0 cursor-pointer ${
                              order.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : order.status === "processing"
                                ? "bg-blue-100 text-blue-800"
                                : order.status === "shipped"
                                ? "bg-purple-100 text-purple-800"
                                : order.status === "cancelled"
                                ? "bg-red-100 text-red-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {getAllowedStatusOptions(order.status).map((status) => (
                              <option key={status} value={status}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex gap-2 flex-wrap">
                            {order.status === "pending" && (
                              <button
                                onClick={() =>
                                  updateOrderStatus(order.id, "cancelled")
                                }
                                className="text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
                              >
                                Cancel
                              </button>
                            )}
                            <button
                              onClick={() => openOrderModal(order)}
                              className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                            >
                              <Edit size={16} />
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                deleteOrder(order.id, order.user_id)
                              }
                              className="text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
                            >
                              <Trash2 size={16} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedOrderId === order.id && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={8} className="px-6 py-5">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                              <div className="lg:col-span-2 space-y-3">
                                <h4 className="text-sm font-semibold text-gray-900">
                                  Order Items
                                </h4>
                                <div className="space-y-3">
                                  {order.items.map((item, index) => (
                                    <div
                                      key={`${order.id}-${item.product_id}-${index}`}
                                      className="bg-white border border-gray-200 rounded-xl p-3 flex gap-3"
                                    >
                                      <div className="h-16 w-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                                        {item.product_image ? (
                                          <img
                                            src={item.product_image}
                                            alt={item.product_name || "Product"}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <div className="h-full w-full flex items-center justify-center text-[10px] text-gray-500">
                                            No image
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                          {item.product_name || "Unnamed product"}
                                        </p>
                                        <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                                          <p>Product ID: {item.product_id || "-"}</p>
                                          <p>Size: {item.size || "-"}</p>
                                          <p>Category: {item.category || "-"}</p>
                                          <p>Qty: {item.quantity}</p>
                                          <p>Unit: ${Number(item.price || 0).toFixed(2)}</p>
                                        </div>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <p className="text-sm font-semibold text-gray-900">
                                          $
                                          {(
                                            Number(item.price || 0) *
                                            Number(item.quantity || 0)
                                          ).toFixed(2)}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="bg-white border border-gray-200 rounded-xl p-4">
                                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                                  Summary
                                </h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Order ID</span>
                                    <span className="font-medium">#{order.id.slice(0, 8).toUpperCase()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Customer</span>
                                    <span className="font-medium text-right">
                                      {order.user_email || order.user_id || "Guest"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Status</span>
                                    <span className="font-medium capitalize">
                                      {order.status}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Date</span>
                                    <span className="font-medium">
                                      {toDate(order.created_at).toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="pt-2 border-t border-gray-200 flex justify-between">
                                    <span className="text-gray-700 font-medium">
                                      Total
                                    </span>
                                    <span className="text-gray-900 font-semibold">
                                      ${Number(order.total || 0).toFixed(2)}
                                    </span>
                                  </div>
                                  {(order.cancel_reason || order.status_note) && (
                                    <div className="pt-2 border-t border-gray-200">
                                      <p className="text-gray-600 mb-1">
                                        Cancellation reason
                                      </p>
                                      <p className="font-medium text-sm">
                                        {order.cancel_reason || order.status_note}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Featured & New Arrivals Tab */}
        {activeTab === "featured" && (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <h2 className="text-xl font-light mb-2">Sale Countdown Control</h2>
              <p className="text-sm text-gray-600 mb-4">
                These values are stored in Firebase at
                <code className="ml-1">site_settings/sale</code> and used by the
                public Sale page.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Banner Title
                  </label>
                  <input
                    type="text"
                    value={saleSettings.sale_title}
                    onChange={(e) =>
                      setSaleSettings((prev) => ({
                        ...prev,
                        sale_title: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="SEASONAL SALE"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Headline
                  </label>
                  <input
                    type="text"
                    value={saleSettings.sale_headline}
                    onChange={(e) =>
                      setSaleSettings((prev) => ({
                        ...prev,
                        sale_headline: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="UP TO 70% OFF"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Subtitle
                  </label>
                  <input
                    type="text"
                    value={saleSettings.sale_subtitle}
                    onChange={(e) =>
                      setSaleSettings((prev) => ({
                        ...prev,
                        sale_subtitle: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="Limited Time Offer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    End Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={saleSettings.end_at_input}
                    onChange={(e) =>
                      setSaleSettings((prev) => ({
                        ...prev,
                        end_at_input: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-sm text-gray-700">
                  Sale links stay available in navigation/homepage. Use the
                  buttons below to manually end or show the sale.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={saveSaleSettings}
                  disabled={savingSaleSettings}
                  className="px-5 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-60 transition-colors"
                >
                  {savingSaleSettings ? "Saving..." : "Save Sale Timer"}
                </button>
                <button
                  onClick={showSaleNow}
                  disabled={savingSaleSettings}
                  className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                >
                  {savingSaleSettings ? "Applying..." : "Apply: Show Sale Again"}
                </button>
                <button
                  onClick={endSaleNow}
                  disabled={savingSaleSettings}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {savingSaleSettings ? "Applying..." : "Apply: End Sale Now"}
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
              <h2 className="text-xl font-light mb-2">Homepage Content Control</h2>
              <p className="text-sm text-gray-600 mb-5">
                Control hero image, today&apos;s pick, category cards, and home
                collections from here.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Hero Image URL (optional override)
                  </label>
                  <input
                    type="url"
                    value={homepageSettings.hero_image_url}
                    onChange={(e) =>
                      setHomepageSettings((prev) => ({
                        ...prev,
                        hero_image_url: e.target.value,
                      }))
                    }
                    placeholder="https://..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Today&apos;s Pick Product
                  </label>
                  <select
                    value={homepageSettings.today_pick_product_id}
                    onChange={(e) =>
                      setHomepageSettings((prev) => ({
                        ...prev,
                        today_pick_product_id: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  >
                    <option value="">Use first featured product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.category})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-5">
                <p className="text-sm font-medium mb-2">Home Categories</p>
                <p className="text-xs text-gray-500 mb-3">
                  Use a category slug (example: `football`, `gym`,
                  `martial-arts`). Home cards now open filtered Shop results.
                </p>

                <div className="space-y-3">
                  {homepageSettings.home_categories.map((entry, index) => (
                    <div
                      key={entry.id || `${entry.slug}-${index}`}
                      className="grid grid-cols-1 md:grid-cols-[1fr,1fr,2fr,auto] gap-2"
                    >
                      <input
                        type="text"
                        value={entry.name}
                        onChange={(e) =>
                          updateHomeCategory(index, "name", e.target.value)
                        }
                        placeholder="Name (e.g. Padel)"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={entry.slug}
                        onChange={(e) =>
                          updateHomeCategory(index, "slug", e.target.value)
                        }
                        onBlur={(e) =>
                          updateHomeCategory(
                            index,
                            "slug",
                            normalizeHomeCategorySlug(e.target.value)
                          )
                        }
                        placeholder="Slug (e.g. football)"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="url"
                        value={entry.image_url}
                        onChange={(e) =>
                          updateHomeCategory(index, "image_url", e.target.value)
                        }
                        placeholder="Image URL"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveHomeCategory(index, "up")}
                          disabled={index === 0}
                          className="px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveHomeCategory(index, "down")}
                          disabled={index === homepageSettings.home_categories.length - 1}
                          className="px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeHomeCategory(index)}
                          className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addHomeCategory}
                  className="mt-3 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Add Category
                </button>
              </div>

              <div className="mb-5">
                <p className="text-sm font-medium mb-2">Shop Menu Items</p>
                <p className="text-xs text-gray-500 mb-3">
                  Manage the SHOP dropdown links. You can add, remove, and reorder
                  exactly how you want. Examples for path: `/new-arrivals`,
                  `/collections`, `/sale`, or `/shop?category=Football`.
                </p>

                <div className="space-y-3">
                  {homepageSettings.shop_menu_items.map((entry, index) => (
                    <div
                      key={entry.id || `menu-${index}`}
                      className="grid grid-cols-1 md:grid-cols-[1fr,1.4fr,auto,auto] gap-2"
                    >
                      <input
                        type="text"
                        value={entry.label}
                        onChange={(e) =>
                          updateShopMenuItem(index, "label", e.target.value)
                        }
                        placeholder="Label (e.g. Padel)"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={entry.path}
                        onChange={(e) =>
                          updateShopMenuItem(index, "path", e.target.value)
                        }
                        placeholder="Path (e.g. /shop?category=Football)"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg">
                        <input
                          type="checkbox"
                          checked={Boolean(entry.special)}
                          onChange={(e) =>
                            updateShopMenuItem(index, "special", e.target.checked)
                          }
                        />
                        <span className="text-xs">Sale style</span>
                      </label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveShopMenuItem(index, "up")}
                          disabled={index === 0}
                          className="px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveShopMenuItem(index, "down")}
                          disabled={
                            index === homepageSettings.shop_menu_items.length - 1
                          }
                          className="px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeShopMenuItem(index)}
                          className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addShopMenuItem}
                  className="mt-3 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Add Shop Menu Item
                </button>
              </div>

              <div className="mb-5">
                <p className="text-sm font-medium mb-2">Collections On Home</p>
                <p className="text-xs text-gray-500 mb-3">
                  Select collections to show on home. If none selected, home uses
                  latest active collections.
                </p>
                {homepageSettings.home_collection_ids.length > 0 ? (
                  <div className="mb-3 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-600 mb-2">
                      Selected Order
                    </p>
                    <div className="space-y-2">
                      {homepageSettings.home_collection_ids.map(
                        (collectionId, index) => {
                          const selectedCollection = collectionsData.find(
                            (entry) => entry.id === collectionId
                          );
                          return (
                            <div
                              key={`${collectionId}-${index}`}
                              className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2"
                            >
                              <span className="text-sm text-gray-800">
                                {selectedCollection
                                  ? `${selectedCollection.name}${
                                      selectedCollection.year
                                        ? ` (${selectedCollection.year})`
                                        : ""
                                    }`
                                  : collectionId}
                              </span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveHomeCollection(index, "up")}
                                  disabled={index === 0}
                                  className="px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                                  title="Move up"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveHomeCollection(index, "down")}
                                  disabled={
                                    index ===
                                    homepageSettings.home_collection_ids.length - 1
                                  }
                                  className="px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                                  title="Move down"
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleHomeCollection(collectionId)}
                                  className="px-2 py-1 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {collectionsData.map((entry) => (
                    <label
                      key={entry.id}
                      className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg"
                    >
                      <input
                        type="checkbox"
                        checked={homepageSettings.home_collection_ids.includes(
                          entry.id
                        )}
                        onChange={() => toggleHomeCollection(entry.id)}
                      />
                      <span className="text-sm">
                        {entry.name}
                        {entry.year ? ` (${entry.year})` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={saveHomepageSettings}
                disabled={savingHomepageSettings}
                className="px-5 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-60 transition-colors"
              >
                {savingHomepageSettings ? "Saving..." : "Save Homepage Content"}
              </button>
            </div>

            {/* Featured Products */}
            <div>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                <h2 className="text-2xl font-light flex items-center gap-2">
                  <Star size={24} className="text-yellow-600" />
                  Featured Products ({featuredProducts.length}/3)
                </h2>
                <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                  <select
                    value={featuredToAddId}
                    onChange={(e) => setFeaturedToAddId(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[260px]"
                  >
                    <option value="">Select product to feature</option>
                    {availableForFeatured.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.category})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={addFeaturedProduct}
                    disabled={!featuredToAddId || featuredProducts.length >= 3}
                    className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-sm font-medium hover:bg-yellow-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>
              {featuredProducts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {featuredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="bg-white rounded-xl shadow-sm overflow-hidden"
                    >
                      <div className="aspect-square bg-gray-100">
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-sm mb-1">
                          {product.name}
                        </h3>
                        <p className="text-xs text-gray-500 mb-2">
                          {product.category}
                        </p>
                        <p className="font-medium mb-2">
                          ${product.price.toFixed(2)}
                        </p>
                        <button
                          onClick={() =>
                            toggleFeatured(
                              product.id,
                              product.is_featured || false
                            )
                          }
                          className="w-full px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded-lg text-xs font-medium hover:bg-yellow-200 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl p-8 text-center text-gray-500">
                  No featured products yet. Click "Featured" on products to add.
                </div>
              )}
            </div>

            {/* New Arrivals */}
            <div>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                <h2 className="text-2xl font-light flex items-center gap-2">
                  <Sparkles size={24} className="text-blue-600" />
                  New Arrivals ({newArrivals.length}/3)
                </h2>
                <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                  <select
                    value={newArrivalToAddId}
                    onChange={(e) => setNewArrivalToAddId(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[260px]"
                  >
                    <option value="">Select product for new arrivals</option>
                    {availableForNewArrivals.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.category})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={addNewArrivalProduct}
                    disabled={!newArrivalToAddId || newArrivals.length >= 3}
                    className="px-4 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>
              {newArrivals.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {newArrivals.map((product) => (
                    <div
                      key={product.id}
                      className="bg-white rounded-xl shadow-sm overflow-hidden"
                    >
                      <div className="aspect-square bg-gray-100">
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-sm mb-1">
                          {product.name}
                        </h3>
                        <p className="text-xs text-gray-500 mb-2">
                          {product.category}
                        </p>
                        <p className="font-medium mb-2">
                          ${product.price.toFixed(2)}
                        </p>
                        <button
                          onClick={() =>
                            toggleNewArrival(
                              product.id,
                              product.is_new_arrival || false
                            )
                          }
                          className="w-full px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl p-8 text-center text-gray-500">
                  No new arrivals yet. Click "New" on products to add.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "collections" && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-light mb-1">
                    Collections Manager
                  </h2>
                  <p className="text-gray-600">
                    Add, update, activate/deactivate, and remove collections.
                  </p>
                </div>
                <button
                  onClick={resetCollectionForm}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  New Collection
                </button>
              </div>

              <div className="relative mb-4">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  type="text"
                  placeholder="Search collections..."
                  value={collectionSearchTerm}
                  onChange={(e) => setCollectionSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Collection name"
                  value={collectionForm.name}
                  onChange={(e) =>
                    setCollectionForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                />
                <input
                  type="url"
                  placeholder="Image URL"
                  value={collectionForm.image_url}
                  onChange={(e) =>
                    setCollectionForm((prev) => ({
                      ...prev,
                      image_url: e.target.value,
                    }))
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                />
                <select
                  value={collectionForm.season}
                  onChange={(e) =>
                    setCollectionForm((prev) => ({
                      ...prev,
                      season: e.target.value,
                    }))
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option>Spring</option>
                  <option>Summer</option>
                  <option>Fall</option>
                  <option>Winter</option>
                </select>
                <input
                  type="number"
                  placeholder="Year"
                  value={collectionForm.year}
                  onChange={(e) =>
                    setCollectionForm((prev) => ({
                      ...prev,
                      year: Number(e.target.value),
                    }))
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                />
                <input
                  type="number"
                  placeholder="Product count"
                  value={collectionForm.product_count}
                  onChange={(e) =>
                    setCollectionForm((prev) => ({
                      ...prev,
                      product_count: Number(e.target.value),
                    }))
                  }
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                />
                <label className="flex items-center gap-3 px-4 py-2 border border-gray-300 rounded-lg">
                  <input
                    type="checkbox"
                    checked={collectionForm.is_active}
                    onChange={(e) =>
                      setCollectionForm((prev) => ({
                        ...prev,
                        is_active: e.target.checked,
                      }))
                    }
                  />
                  <span>Active</span>
                </label>
              </div>

              <textarea
                placeholder="Description"
                value={collectionForm.description}
                onChange={(e) =>
                  setCollectionForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={3}
                className="mt-4 w-full px-4 py-2 border border-gray-300 rounded-lg"
              />

              <div className="mt-4 flex gap-3">
                <button
                  onClick={saveCollection}
                  className="px-5 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800"
                >
                  {editingCollection ? "Update Collection" : "Add Collection"}
                </button>
                {editingCollection && (
                  <button
                    onClick={resetCollectionForm}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCollections.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200"
                >
                  <div className="aspect-[4/3] bg-gray-100">
                    <img
                      src={entry.image_url}
                      alt={entry.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium">{entry.name}</h3>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          entry.is_active === false
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {entry.is_active === false ? "Inactive" : "Active"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {entry.description}
                    </p>
                    <p className="text-xs text-gray-500 mb-4">
                      {entry.season} {entry.year} • {entry.product_count || 0}{" "}
                      pieces
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditCollection(entry)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteCollection(entry.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-light mb-2">Users</h2>
                  <p className="text-gray-600">
                    Full user profiles, contact details, preferences, and order activity
                  </p>
                </div>
                <button
                  onClick={() => exportData(filteredUsers, "users.csv")}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-200 text-black px-4 py-2 rounded-lg hover:bg-gray-300"
                >
                  <Download size={18} />
                  Export
                </button>
              </div>

              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  type="text"
                  placeholder="Search users by name, email, phone, location, or ID..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1220px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Preferences
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Orders
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Account
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredUsers.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50 align-top">
                        <td className="px-6 py-4 text-sm">
                          <p className="font-semibold text-gray-900">{row.fullName}</p>
                          <p className="text-gray-600">{row.email}</p>
                          <p className="text-xs text-gray-500 mt-1">ID: {row.id}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <p>{row.phone}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Provider: {row.provider}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Location: {row.location}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <p>{row.address || "-"}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {row.addressDetails || "-"}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-500">Order updates</span>
                              {renderPreferenceBadge(row.preferences.orderUpdates)}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-500">Promotions</span>
                              {renderPreferenceBadge(row.preferences.promotions)}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-500">Newsletter</span>
                              {renderPreferenceBadge(row.preferences.newsletter)}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-500">Subscribed</span>
                              {renderPreferenceBadge(row.subscribedNewsletter)}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <p>
                            <span className="font-semibold">{row.ordersCount}</span>{" "}
                            orders
                          </p>
                          <p className="mt-1">
                            Spent:{" "}
                            <span className="font-semibold">
                              ${row.totalSpent.toFixed(2)}
                            </span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Last:{" "}
                            {row.lastOrderDate
                              ? row.lastOrderDate.toLocaleDateString()
                              : "-"}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <p>
                            Created:{" "}
                            {row.createdAt
                              ? toDate(row.createdAt).toLocaleDateString()
                              : "-"}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Updated:{" "}
                            {row.updatedAt
                              ? toDate(row.updatedAt).toLocaleDateString()
                              : "-"}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <button
                            onClick={() => deleteUser(row.id)}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-medium"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredUsers.length === 0 && (
                <div className="p-8 text-center text-gray-500">No users found.</div>
              )}
            </div>
          </div>
        )}

        {/* Subscribers Tab */}
        {activeTab === "subscribers" && (
          <div className="space-y-6">
            {/* Header with Actions */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-light mb-2">Newsletter</h2>
                  <p className="text-gray-600">
                    Manage subscribers and send campaigns
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                  <button
                    onClick={() => setShowEmailModal(true)}
                    disabled={subscribers.length === 0}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Mail size={20} />
                    Send Campaign
                  </button>
                </div>
              </div>

              {discordTestMessage && (
                <div
                  className={`mb-4 rounded-lg px-4 py-3 text-sm ${
                    discordTestMessage.type === "success"
                      ? "bg-green-50 text-green-800 border border-green-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  }`}
                >
                  {discordTestMessage.text}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <input
                  type="text"
                  placeholder="Search subscribers by email..."
                  value={subscriberSearchTerm}
                  onChange={(e) => setSubscriberSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>
            </div>

            {/* Subscribers Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subscribed
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order Updates
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Promotions
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Newsletter
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Campaigns Sent
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredSubscribers.map((subscriber) => (
                      <tr key={subscriber.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {subscriber.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {toDate(subscriber.subscribed_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {renderPreferenceBadge(
                            subscriber.preferences.orderUpdates
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {renderPreferenceBadge(subscriber.preferences.promotions)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {renderPreferenceBadge(subscriber.preferences.newsletter)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {subscriber.sent_emails || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => deleteSubscriber(subscriber.id)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            <Trash2 size={16} className="inline" />
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredSubscribers.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  No subscribers found.
                </div>
              )}
            </div>
          </div>
        )}
          </div>
        </div>
      </div>

      {/* Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-light">
                {editingProduct ? "Edit Product" : "Add New Product"}
              </h2>
              <button
                onClick={() => setShowProductModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>

            {!editingProduct && (
              <div className="px-6 pt-5">
                <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setProductEntryMode("manual")}
                    className={`px-4 py-2 text-sm rounded-md transition-colors ${
                      productEntryMode === "manual"
                        ? "bg-black text-white"
                        : "text-gray-700 hover:bg-white"
                    }`}
                  >
                    Add Manually
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductEntryMode("link")}
                    className={`px-4 py-2 text-sm rounded-md transition-colors ${
                      productEntryMode === "link"
                        ? "bg-black text-white"
                        : "text-gray-700 hover:bg-white"
                    }`}
                  >
                    Import From Link
                  </button>
                </div>
              </div>
            )}

            {isManualProductEntry ? (
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) =>
                    setProductForm({ ...productForm, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder="Premium Cotton T-Shirt"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Brand</label>
                  <input
                    type="text"
                    value={productForm.brand}
                    onChange={(e) =>
                      setProductForm({ ...productForm, brand: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="Nike, Everlast..."
                    list="admin-product-brands"
                  />
                  <datalist id="admin-product-brands">
                    {suggestedBrandOptions.map((brand) => (
                      <option key={brand} value={brand} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Product Type
                  </label>
                  <input
                    type="text"
                    value={productForm.product_type}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        product_type: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="Type product type..."
                    list="admin-product-types"
                  />
                  <datalist id="admin-product-types">
                    {suggestedTypeOptions.map((type) => (
                      <option key={type} value={type} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">SKU</label>
                  <input
                    type="text"
                    value={productForm.sku || autoGeneratedSku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black bg-gray-50"
                    placeholder={autoGeneratedSku || "LB-GLV-12OZ-BLK"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Category *
                  </label>
                  <input
                    type="text"
                    value={productForm.category}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        category: e.target.value.trim(),
                        subcategory: "",
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="Type category..."
                    list="admin-product-categories"
                  />
                  <datalist id="admin-product-categories">
                    {suggestedCategoryOptions.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Subcategory
                  </label>
                  <input
                    type="text"
                    value={productForm.subcategory}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        subcategory: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="Type subcategory..."
                    list="admin-product-subcategories"
                  />
                  <datalist id="admin-product-subcategories">
                    {categoryAwareSubcategoryOptions.map((subcategory) => (
                      <option key={subcategory} value={subcategory} />
                    ))}
                  </datalist>
                </div>

                {showAudienceField && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Audience
                    </label>
                    <input
                      type="text"
                      value={productForm.audience}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          audience: e.target.value as ProductAudience,
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                      placeholder="men, women, or unisex"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Authenticity
                  </label>
                  <input
                    type="text"
                    value={productForm.authenticity}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        authenticity: e.target.value as ProductAuthenticity,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="original or copy_a"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-gray-500">
                      Category Tree
                    </p>
                    <p className="text-sm text-gray-700">
                      1) Pick Category, 2) pick Subcategory, 3) pick Type. Use
                      search to jump to what you need.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenCategoryTreeNodes(categoryTree.map((node) => node.category))
                      }
                      className="text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-700 hover:border-black hover:text-black"
                    >
                      Expand All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenCategoryTreeNodes([]);
                        setOpenSubcategoryTreeNodes([]);
                      }}
                      className="text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-700 hover:border-black hover:text-black"
                    >
                      Collapse All
                    </button>
                  </div>
                </div>

                <div className="mb-3 grid grid-cols-1 md:grid-cols-[1.2fr,1fr] gap-2">
                  <input
                    type="text"
                    value={categoryTreeQuery}
                    onChange={(e) => setCategoryTreeQuery(e.target.value)}
                    placeholder="Search category, subcategory, or type..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-black"
                  />
                  <div className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm">
                    <span className="text-gray-500">Selected:</span>{" "}
                    <span className="font-medium text-gray-900">
                      {[productForm.category, productForm.subcategory, productForm.product_type]
                        .map((entry) => String(entry || "").trim())
                        .filter(Boolean)
                        .join(" > ") || "None"}
                    </span>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3">
                  <ul className="space-y-2">
                    {filteredCategoryTree.length === 0 && (
                      <li className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500">
                        No matches found. Try a different search term.
                      </li>
                    )}
                    {filteredCategoryTree.map((categoryNode) => {
                      const isSelectedCategory =
                        productForm.category === categoryNode.category;
                      const isCategoryOpen =
                        isSelectedCategory ||
                        openCategoryTreeNodes.includes(categoryNode.category);
                      const categoryTypeCount =
                        categoryNode.directTypes.length +
                        categoryNode.subcategories.reduce(
                          (sum, subcategoryNode) => sum + subcategoryNode.types.length,
                          0
                        );

                      return (
                        <li key={categoryNode.category}>
                          <div
                            className={`rounded-md border px-2.5 py-2 ${
                              isSelectedCategory
                                ? "border-black bg-gray-50"
                                : "border-gray-200"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenCategoryTreeNodes((prev) =>
                                    prev.includes(categoryNode.category)
                                      ? prev.filter((node) => node !== categoryNode.category)
                                      : [...prev, categoryNode.category]
                                  )
                                }
                                className="p-1 rounded hover:bg-gray-100"
                                aria-label={
                                  isCategoryOpen
                                    ? `Collapse ${categoryNode.category}`
                                    : `Expand ${categoryNode.category}`
                                }
                              >
                                {isCategoryOpen ? (
                                  <ChevronDown size={14} className="text-gray-600" />
                                ) : (
                                  <ChevronRight size={14} className="text-gray-600" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setProductForm((prev) => ({
                                    ...prev,
                                    category: categoryNode.category,
                                    subcategory: "",
                                    product_type: "",
                                  }))
                                }
                                className={`text-sm font-medium ${
                                  isSelectedCategory
                                    ? "text-black"
                                    : "text-gray-800 hover:text-black"
                                }`}
                              >
                                {categoryNode.category}
                              </button>
                              <span className="ml-auto text-[11px] text-gray-500">
                                {categoryNode.subcategories.length} sub • {categoryTypeCount} types
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setProductForm((prev) => ({
                                    ...prev,
                                    category: categoryNode.category,
                                    subcategory: "",
                                    product_type: "",
                                  }))
                                }
                                className="text-xs px-2 py-1 rounded-full border border-gray-300 text-gray-700 hover:border-black hover:text-black"
                                title="Select category and clear lower levels"
                              >
                                Select
                              </button>
                            </div>

                            {isCategoryOpen && (
                              <ul className="mt-2 ml-3 pl-3 border-l border-gray-200 space-y-2">
                                {categoryNode.subcategories.map((subcategoryNode) => {
                                  const subcategoryKey = `${categoryNode.category}::${subcategoryNode.name}`;
                                  const isSelectedSubcategory =
                                    isSelectedCategory &&
                                    productForm.subcategory === subcategoryNode.name;
                                  const isSubcategoryOpen =
                                    isSelectedSubcategory ||
                                    openSubcategoryTreeNodes.includes(subcategoryKey);

                                  return (
                                    <li key={subcategoryKey}>
                                      <div
                                        className={`rounded-md border px-2 py-1.5 ${
                                          isSelectedSubcategory
                                            ? "border-black bg-gray-50"
                                            : "border-gray-200"
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setOpenSubcategoryTreeNodes((prev) =>
                                                prev.includes(subcategoryKey)
                                                  ? prev.filter((node) => node !== subcategoryKey)
                                                  : [...prev, subcategoryKey]
                                              )
                                            }
                                            className="p-1 rounded hover:bg-gray-100"
                                            aria-label={
                                              isSubcategoryOpen
                                                ? `Collapse ${subcategoryNode.name}`
                                                : `Expand ${subcategoryNode.name}`
                                            }
                                          >
                                            {isSubcategoryOpen ? (
                                              <ChevronDown size={13} className="text-gray-600" />
                                            ) : (
                                              <ChevronRight size={13} className="text-gray-600" />
                                            )}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setProductForm((prev) => ({
                                                ...prev,
                                                category: categoryNode.category,
                                                subcategory: subcategoryNode.name,
                                                product_type: "",
                                              }))
                                            }
                                            className={`text-sm ${
                                              isSelectedSubcategory
                                                ? "font-medium text-black"
                                                : "text-gray-700 hover:text-black"
                                            }`}
                                          >
                                            {subcategoryNode.name}
                                          </button>
                                          <span className="ml-auto text-[11px] text-gray-500">
                                            {subcategoryNode.types.length} types
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setProductForm((prev) => ({
                                                ...prev,
                                                category: categoryNode.category,
                                                subcategory: subcategoryNode.name,
                                                product_type: "",
                                              }))
                                            }
                                            className="text-xs px-2 py-1 rounded-full border border-gray-300 text-gray-700 hover:border-black hover:text-black"
                                            title="Select subcategory and clear type"
                                          >
                                            Select
                                          </button>
                                        </div>

                                        {isSubcategoryOpen &&
                                          subcategoryNode.types.length > 0 && (
                                            <ul className="mt-2 ml-3 pl-3 border-l border-gray-200 space-y-1">
                                              {subcategoryNode.types.map((productType) => {
                                                const isSelectedType =
                                                  isSelectedSubcategory &&
                                                  productForm.product_type === productType;
                                                return (
                                                  <li
                                                    key={`${subcategoryKey}-${productType}`}
                                                    className="flex items-center justify-between gap-2"
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        setProductForm((prev) => ({
                                                          ...prev,
                                                          category: categoryNode.category,
                                                          subcategory: subcategoryNode.name,
                                                          product_type: productType,
                                                        }))
                                                      }
                                                      className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                                                        isSelectedType
                                                          ? "bg-black text-white border-black"
                                                          : "bg-white text-gray-700 border-gray-300 hover:border-black hover:text-black"
                                                      }`}
                                                    >
                                                      {productType}
                                                    </button>
                                                  </li>
                                                );
                                              })}
                                            </ul>
                                          )}
                                      </div>
                                    </li>
                                  );
                                })}

                                {categoryNode.directTypes.length > 0 && (
                                  <li className="rounded-md border border-dashed border-gray-200 p-2">
                                    <p className="text-[11px] uppercase tracking-[0.12em] text-gray-500 mb-2">
                                      Types (No Subcategory)
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {categoryNode.directTypes.map((productType) => {
                                        const isSelectedType =
                                          isSelectedCategory &&
                                          !productForm.subcategory &&
                                          productForm.product_type === productType;
                                        return (
                                          <button
                                            type="button"
                                            key={`${categoryNode.category}-${productType}`}
                                            onClick={() =>
                                              setProductForm((prev) => ({
                                                ...prev,
                                                category: categoryNode.category,
                                                subcategory: "",
                                                product_type: productType,
                                              }))
                                            }
                                            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                                              isSelectedType
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-gray-700 border-gray-300 hover:border-black hover:text-black"
                                            }`}
                                          >
                                            {productType}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Tip: after you select a path here, just fill the form fields above
                  and save. New branches are created automatically.
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-gray-500">
                  Category Profile
                </p>
                <p className="text-sm text-gray-800 mt-1">
                  {productDetailProfile} details are currently shown.
                  {!showAudienceField
                    ? " Audience is auto-set to Unisex for this category."
                    : ""}
                  {isSupplementProduct
                    ? " Supplements also use supplement-specific fields."
                    : ""}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Cost Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.cost_price}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        cost_price: Number(e.target.value),
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Commission (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={productForm.commission_percentage}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        commission_percentage: Number(e.target.value),
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Retail Price ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.price}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        price: Number(e.target.value),
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Original Price ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.original_price}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        original_price: Number(e.target.value),
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Commission Suggested Retail (optional)
                  </span>
                  <span className="text-xl font-semibold text-gray-900">
                    ${commissionSuggestedPrice.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Current original price: ${manualOriginalPrice.toFixed(2)}
                </p>
              </div>

              {/* Profit Display */}
              {manualRetailPrice > 0 && productForm.cost_price >= 0 && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700 font-medium">
                      Profit per Unit:
                    </span>
                    <span className="text-lg font-bold text-green-600">
                      ${formUnitProfit.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">
                      Profit Margin:
                    </span>
                    <span className="text-lg font-bold text-green-600">
                      {formProfitMargin.toFixed(1)}
                      %
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Discount (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={productForm.discount_percentage}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        discount_percentage: Number(e.target.value),
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              {/* Featured & New Arrival Toggles */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productForm.is_featured}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        is_featured: e.target.checked,
                      })
                    }
                    className="w-5 h-5 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                  />
                  <div className="flex items-center gap-2">
                    <Star size={16} className="text-yellow-600" />
                    <span className="text-sm font-medium">
                      Featured Product
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productForm.is_new_arrival}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        is_new_arrival: e.target.checked,
                      })
                    }
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-blue-600" />
                    <span className="text-sm font-medium">New Arrival</span>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Description
                </label>
                <textarea
                  value={productForm.description}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      description: e.target.value,
                    })
                  }
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder="Comfortable and stylish..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Main Product Image *
                </label>
                <div className="flex gap-4 items-start flex-col sm:flex-row">
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={onMainImageFileChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Image is compressed, uploaded to Firebase Storage, then
                      saved as a Firebase URL.
                    </p>
                  </div>
                  {(mainImagePreviewUrl || productForm.image_url) && (
                    <div className="w-24 h-24 rounded-lg overflow-hidden border border-gray-300">
                      <img
                        src={mainImagePreviewUrl || productForm.image_url}
                        alt="Main preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Additional Product Images (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onAdditionalImagesChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                />
                <p className="text-xs text-gray-500 mt-1">
                  You can select multiple files. Each image will be compressed and
                  uploaded to Firebase Storage.
                </p>
                {additionalImagePreviewUrls.length > 0 && (
                  <div className="grid grid-cols-5 gap-2 mt-3">
                    {additionalImagePreviewUrls.map((preview, index) => (
                      <div
                        key={`${preview}-${index}`}
                        className="relative aspect-square rounded-lg overflow-hidden border border-gray-300 group"
                      >
                        <img
                          src={preview}
                          alt={`Selected image ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeQueuedAdditionalImage(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {parseCommaSeparatedValues(productForm.images).length > 0 && (
                  <>
                    <p className="text-xs text-gray-500 mt-3">
                      Existing saved images
                    </p>
                  <div className="grid grid-cols-5 gap-2 mt-3">
                    {parseCommaSeparatedValues(productForm.images).map(
                      (preview, index) => (
                        <div
                          key={`${preview}-${index}`}
                          className="relative aspect-square rounded-lg overflow-hidden border border-gray-300 group"
                        >
                          <img
                            src={preview}
                            alt={`Saved preview ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeAdditionalImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )
                    )}
                  </div>
                  </>
                )}
              </div>


              <div>
                <label className="block text-sm font-medium mb-2">Colors</label>
                <input
                  type="text"
                  value={productForm.colors}
                  onChange={(e) =>
                    setProductForm({ ...productForm, colors: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder="Black, White, Navy"
                />
              </div>

              {showSizingFields && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Sizes</label>
                </div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => applySizePreset("shoe")}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    Shoe
                  </button>
                  <button
                    type="button"
                    onClick={() => applySizePreset("apparel")}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    Apparel
                  </button>
                  <button
                    type="button"
                    onClick={() => applySizePreset("one-size")}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    One Size
                  </button>
                  <button
                    type="button"
                    onClick={() => applySizePreset("glove-oz")}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    Glove OZ
                  </button>
                </div>
                <input
                  type="text"
                  value={productForm.sizes}
                  onChange={(e) =>
                    setProductForm({ ...productForm, sizes: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder="XS, S, M, L or 8oz, 10oz, 12oz..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank to auto-fill only for clothes, shoes, or socks.
                </p>
              </div>
              )}

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(productForm.sold_out)}
                    onChange={(e) =>
                      setProductForm({ ...productForm, sold_out: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">Mark Entire Product as Sold Out</span>
                </label>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Sold Out Sizes / Variants
                  </label>
                  <input
                    type="text"
                    value={productForm.sold_out_sizes}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        sold_out_sizes: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="M, L, 42, 43"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use only if the product has real size variants.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Color Image Links (optional)
                </label>
                <div className="space-y-2">
                  {colorImageRows.map((row, index) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-1 md:grid-cols-[1fr,2fr,auto] gap-2"
                    >
                      <input
                        type="text"
                        value={row.color}
                        onChange={(e) =>
                          setColorImageRows((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, color: e.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="Color (e.g. Navy)"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                      />
                      <input
                        type="url"
                        value={row.url}
                        onChange={(e) =>
                          setColorImageRows((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, url: e.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="Image URL"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setColorImageRows((prev) =>
                            prev.filter((_, itemIndex) => itemIndex !== index)
                          )
                        }
                        className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setColorImageRows((prev) => [
                      ...prev,
                      {
                        id: `color-image-${Date.now()}`,
                        color: "",
                        url: "",
                      },
                    ])
                  }
                  className="mt-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Add Color Image
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  One row per color. Much easier than typing `Color: URL` manually.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Color Gallery Images (optional)
                </label>
                <div className="space-y-3">
                  {colorGalleryRows.map((row, index) => (
                    <div
                      key={row.id}
                      className="border border-gray-200 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={row.color}
                          onChange={(e) =>
                            setColorGalleryRows((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, color: e.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="Color (e.g. Navy)"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setColorGalleryRows((prev) =>
                              prev.filter((_, itemIndex) => itemIndex !== index)
                            )
                          }
                          className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        value={row.urls}
                        onChange={(e) =>
                          setColorGalleryRows((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, urls: e.target.value }
                                : item
                            )
                          )
                        }
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                        placeholder="Paste multiple URLs separated by comma or new line"
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setColorGalleryRows((prev) => [
                      ...prev,
                      {
                        id: `color-gallery-${Date.now()}`,
                        color: "",
                        urls: "",
                      },
                    ])
                  }
                  className="mt-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Add Color Gallery
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  Add one section per color, then paste that color&apos;s gallery URLs.
                </p>
              </div>

              {showSizeGuideField && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Size Guide
                </label>
                <textarea
                  value={productForm.size_guide}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      size_guide: e.target.value,
                    })
                  }
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder="Example: S = chest 88-94 cm, M = 95-101 cm..."
                />
              </div>
              )}

              {showMaterialAndCareFields && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Material
                </label>
                <input
                  type="text"
                  value={productForm.material}
                  onChange={(e) =>
                    setProductForm({ ...productForm, material: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder="100% Cotton"
                />
              </div>
              )}

              {showMaterialAndCareFields && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Care Instructions
                </label>
                <textarea
                  value={productForm.care_instructions}
                  onChange={(e) =>
                    setProductForm({
                      ...productForm,
                      care_instructions: e.target.value,
                    })
                  }
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder="Machine wash cold..."
                />
              </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={productForm.tags}
                    onChange={(e) =>
                      setProductForm({ ...productForm, tags: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="training, gym, lifestyle"
                    list="admin-product-tags"
                  />
                  <datalist id="admin-product-tags">
                    {suggestedTagOptions.map((tag) => (
                      <option key={tag} value={tag} />
                    ))}
                  </datalist>
                </div>

                {showSupplementFields && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Flavor (if applicable)
                    </label>
                    <input
                      type="text"
                      value={productForm.flavor}
                      onChange={(e) =>
                        setProductForm({ ...productForm, flavor: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                      placeholder="Chocolate, Vanilla..."
                    />
                  </div>
                )}
              </div>

              {showSupplementFields && (
                <div>
                    <label className="block text-sm font-medium mb-2">
                    Net Weight / Size
                  </label>
                  <input
                    type="text"
                    value={productForm.net_weight}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        net_weight: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="2.2lb / 1kg"
                  />
                </div>
              )}
            </div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                  <p className="text-sm text-gray-700">
                    Paste a product URL or a collection URL. We will try to detect and import every product on that page.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Product/Collection URL
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder="https://example.com/collections/new-arrivals"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    />
                    <button
                      type="button"
                      onClick={importProductsFromUrl}
                      disabled={importingFromLink}
                      className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {importingFromLink ? "Scanning..." : "Scan Link"}
                    </button>
                  </div>
                  <div className="mt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate("/admin/shopify")}
                        className="text-sm px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                      >
                        Open Shopify CSV Converter
                      </button>
                      <button
                        type="button"
                        onClick={deleteImportedProductsForSource}
                        disabled={deletingImportedProducts || importingFromLink}
                        className="text-sm px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {deletingImportedProducts
                          ? "Deleting Imported Products..."
                          : "Delete Imported Products For This Source"}
                      </button>
                    </div>
                  </div>
                </div>

                {importError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {importError}
                  </div>
                )}

                {importedProducts.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-gray-800">
                        Found {importedProducts.length} product
                        {importedProducts.length === 1 ? "" : "s"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllImportedProducts}
                          className="text-sm px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={clearImportedProductSelection}
                          className="text-sm px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const firstSelectedIndex = selectedImportedIndices[0];
                            const selectedItem =
                              typeof firstSelectedIndex === "number"
                                ? importedProducts[firstSelectedIndex]
                                : importedProducts[0];
                            if (!selectedItem) return;
                            mapImportedProductToForm(selectedItem);
                          }}
                          className="text-sm px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Load selected into manual form
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Selected for import: {selectedImportedIndices.length}/
                      {importedProducts.length}
                    </p>

                    <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                      {importedProducts.map((product, index) => (
                        <div
                          key={`${product.name}-${index}`}
                          className={`p-3 flex items-center gap-3 ${
                            selectedImportedIndices.includes(index)
                              ? "bg-gray-50"
                              : "bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedImportedIndices.includes(index)}
                            onChange={() => toggleImportedProductSelection(index)}
                            className="h-4 w-4"
                          />
                          <div className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-white flex items-center justify-center">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package size={18} className="text-gray-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {product.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {product.category || "Uncategorized"}
                              {product.product_type ? ` • ${product.product_type}` : ""}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-gray-900">
                            ${Number(product.price || 0).toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="p-6 border-t border-gray-200 flex flex-col sm:flex-row gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => setShowProductModal(false)}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={
                  isManualProductEntry ? saveProduct : addImportedProductsToStore
                }
                disabled={
                  isManualProductEntry
                    ? savingProductImages
                    : importedProducts.length === 0 ||
                      selectedImportedIndices.length === 0 ||
                      importingFromLink ||
                      addingImportedProducts
                }
                className="flex-1 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                <Save size={20} />
                {isManualProductEntry
                  ? savingProductImages
                    ? "Uploading Images..."
                    : editingProduct
                    ? "Update Product"
                    : "Add Product"
                  : addingImportedProducts
                  ? "Adding Imported Products..."
                  : importedProducts.length > 0
                  ? `Add ${selectedImportedIndices.length} Selected Product${
                      selectedImportedIndices.length === 1 ? "" : "s"
                    }`
                  : "Add Imported Products"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Edit Modal */}
      {showOrderModal && editingOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-stretch justify-end z-50">
          <div className="bg-white w-full max-w-3xl h-full overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-light">
                Edit Order #{editingOrder.id.slice(0, 8).toUpperCase()}
              </h2>
              <button
                onClick={() => setShowOrderModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Customer Email
                </label>
                <input
                  type="email"
                  value={orderForm.user_email}
                  onChange={(e) =>
                    setOrderForm({ ...orderForm, user_email: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder="customer@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <select
                  value={orderForm.status}
                  onChange={(e) =>
                    setOrderForm({ ...orderForm, status: e.target.value as OrderStatus })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                >
                  {getAllowedStatusOptions(orderForm.status as OrderStatus).map((status) => (
                    <option key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Subtotal ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={orderForm.subtotal}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Delivery ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={0}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                  />
                  <p className="text-xs text-gray-500 mt-1">Free delivery applied.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Tax ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={orderForm.tax}
                    onChange={(e) =>
                      applyOrderItemsAndTotals(
                        orderForm.items,
                        0,
                        Number(e.target.value)
                      )
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Total ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={orderForm.total}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                  />
                </div>
              </div>

              {/* Order Items */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">Order Items</h3>
                  <button
                    onClick={addOrderItem}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    + Add Item
                  </button>
                </div>
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {orderForm.items.map((item, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg border">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">
                            Product Name
                          </label>
                          <input
                            type="text"
                            value={item.product_name || ""}
                            onChange={(e) =>
                              updateOrderItem(index, "product_name", e.target.value)
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="Product name"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">
                            Product ID
                          </label>
                          <input
                            type="text"
                            value={item.product_id || ""}
                            onChange={(e) =>
                              updateOrderItem(index, "product_id", e.target.value)
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="Firestore product ID"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">
                            Size
                          </label>
                          <input
                            type="text"
                            value={item.size || ""}
                            onChange={(e) =>
                              updateOrderItem(index, "size", e.target.value)
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="M / 42 / One Size"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">
                              Quantity
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateOrderItem(index, "quantity", Number(e.target.value))
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">
                              Price ($)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.price}
                              onChange={(e) =>
                                updateOrderItem(index, "price", Number(e.target.value))
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-gray-600">
                          Line total: $
                          {(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(
                            2
                          )}
                        </span>
                        <button
                          onClick={() => removeOrderItemFromOrder(index)}
                          className="text-xs text-red-600 hover:text-red-700 font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex flex-col sm:flex-row gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => setShowOrderModal(false)}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveOrder}
                className="flex-1 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                <Save size={20} />
                Update Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Campaign Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-light">Send Email Campaign</h2>
              <button
                onClick={() => setShowEmailModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Campaign Subject
                </label>
                <input
                  type="text"
                  value={emailForm.subject}
                  onChange={(e) =>
                    setEmailForm({ ...emailForm, subject: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder="Exclusive Offer - Summer Sale!"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Message
                </label>
                <textarea
                  value={emailForm.message}
                  onChange={(e) =>
                    setEmailForm({ ...emailForm, message: e.target.value })
                  }
                  rows={8}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder="Dear valued customer,

We're excited to announce..."
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-800">
                  This email will be sent to {subscribers.length} subscribers
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex flex-col sm:flex-row gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => setShowEmailModal(false)}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={sendEmailToSubscribers}
                className="flex-1 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                <Mail size={20} />
                Send Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`p-3 rounded-full ${
                    confirmAction.danger
                      ? "bg-red-100 text-red-600"
                      : "bg-blue-100 text-blue-600"
                  }`}
                >
                  <AlertCircle size={24} />
                </div>
                <h2 className="text-xl font-semibold">{confirmAction.title}</h2>
              </div>
              <p className="text-gray-600 mb-6">{confirmAction.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setConfirmAction(null);
                  }}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    confirmAction.onConfirm();
                    setShowConfirmModal(false);
                    setConfirmAction(null);
                  }}
                  className={`flex-1 px-6 py-3 rounded-lg transition-colors text-white ${
                    confirmAction.danger
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-black hover:bg-gray-800"
                  }`}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
