import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Edit,
  Trash2,
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
  Mail,
  AlertCircle,
  Download,
  RefreshCw,
} from "lucide-react";
import { db } from "../lib/firebase";
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
  setDoc,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
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

type DateField = Timestamp | Date | string | null | undefined;
type CsvValue = string | number | boolean | null | undefined;

interface Product {
  id: string;
  name: string;
  price: number;
  cost_price: number;
  original_price?: number;
  description: string;
  image_url: string;
  category: string;
  subcategory?: string;
  audience?: ProductAudience;
  images?: string[];
  colors?: string[];
  color_images?: Record<string, string>;
  color_galleries?: Record<string, string[]>;
  sizes?: string[];
  size_stock?: Record<string, number>;
  size_guide?: string;
  stock?: number;
  discount_percentage?: number;
  material?: string;
  care_instructions?: string;
  is_featured?: boolean;
  is_new_arrival?: boolean;
  created_at: DateField;
}

interface OrderLineItem {
  product_id: string;
  product_name?: string;
  size?: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  user_id: string;
  user_email?: string;
  items: OrderLineItem[];
  total: number;
  subtotal?: number;
  shipping?: number;
  tax?: number;
  status: OrderStatus;
  stock_deducted?: boolean;
  stock_restored?: boolean;
  created_at: DateField;
}

interface Subscriber {
  id: string;
  email: string;
  subscribed_at: DateField;
  sent_emails: number;
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

export function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    | "overview"
    | "products"
    | "orders"
    | "featured"
    | "collections"
    | "subscribers"
  >("overview");

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
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
  const [subscriberSearchTerm, setSubscriberSearchTerm] = useState("");
  const [collectionSearchTerm, setCollectionSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [saleSettings, setSaleSettings] = useState({
    sale_title: "SEASONAL SALE",
    sale_subtitle: "Limited Time Offer",
    end_at_input: "",
  });
  const [savingSaleSettings, setSavingSaleSettings] = useState(false);
  const defaultHomeCategories: HomeCategoryEntry[] = [
    {
      id: "1",
      name: "Men",
      slug: "men",
      image_url:
        "https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?q=80&w=1000",
    },
    {
      id: "2",
      name: "Women",
      slug: "women",
      image_url:
        "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=1000",
    },
    {
      id: "3",
      name: "Accessories",
      slug: "accessories",
      image_url:
        "https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?q=80&w=1000",
    },
    {
      id: "4",
      name: "Sale",
      slug: "sale",
      image_url:
        "https://images.unsplash.com/photo-1607083206968-13611e3d76db?q=80&w=1000",
    },
  ];
  const defaultShopMenuItems: ShopMenuItemEntry[] = [
    { id: "menu-1", label: "New Arrivals", path: "/new-arrivals" },
    { id: "menu-2", label: "Men", path: "/category/men" },
    { id: "menu-3", label: "Women", path: "/category/women" },
    { id: "menu-4", label: "Accessories", path: "/category/accessories" },
    { id: "menu-5", label: "Sale", path: "/sale", special: true },
    { id: "menu-6", label: "Collections", path: "/collections" },
  ];
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
  const [productForm, setProductForm] = useState({
    name: "",
    price: 0,
    cost_price: 0,
    original_price: 0,
    description: "",
    image_url: "",
    category: "Men",
    subcategory: "",
    audience: "men" as ProductAudience,
    stock: 0,
    discount_percentage: 0,
    material: "",
    care_instructions: "",
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
  const [sizeStockMap, setSizeStockMap] = useState<Record<string, number>>({});

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

  // Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    danger?: boolean;
  } | null>(null);

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

  const getDefaultSizesByCategory = (category: string) => {
    const normalized = category.trim().toLowerCase();
    if (normalized === "shoes") {
      return [
        "36",
        "37",
        "38",
        "39",
        "40",
        "41",
        "42",
        "43",
        "44",
        "45",
        "46",
        "47",
        "48",
      ];
    }
    if (normalized === "accessories" || normalized === "bags") {
      return ["One Size"];
    }
    return ["XS", "S", "M", "L", "XL", "XXL"];
  };

  const getDefaultShoeSizeGuide = () =>
    "NOX Shoe Size Guide\nEU | US | UK | AR | LENGTH cm\n36 | 5 | 4 | 35 | 23.3\n37 | 5.5 | 4.5 | 36 | 24.0\n38 | 6 | 5 | 37 | 24.7\n39 | 6.5 | 6 | 38 | 25.3\n40 | 7 | 6.5 | 39 | 26.0\n41 | 8 | 7 | 40 | 26.7\n42 | 9 | 8 | 41 | 27.3\n43 | 9.5 | 8.5 | 42 | 28.0\n44 | 10 | 9 | 43 | 28.7\n45 | 11 | 10 | 44 | 29.3\n46 | 12 | 11 | 45 | 30.0\n47 | 13 | 12 | 46 | 30.7\n48 | 14 | 13 | 47 | 31.3";

  const applyShoeDefaults = () => {
    setProductForm((prev) => ({
      ...prev,
      category: "Shoes",
      sizes: "36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48",
      size_guide: getDefaultShoeSizeGuide(),
    }));
  };

  const sizeOptionsForStock = useMemo(() => {
    const explicitSizes = parseCommaSeparatedValues(productForm.sizes);
    if (explicitSizes.length > 0) {
      return explicitSizes;
    }
    return getDefaultSizesByCategory(productForm.category);
  }, [productForm.sizes, productForm.category]);

  useEffect(() => {
    setSizeStockMap((prev) => {
      const next: Record<string, number> = {};
      sizeOptionsForStock.forEach((size) => {
        next[size] = Number(prev[size] || 0);
      });
      return next;
    });
  }, [sizeOptionsForStock]);

  useEffect(() => {
    if (user === undefined) return;

    if (!user) {
      navigate("/login");
      return;
    }

    if (user.email !== "eliegmitri7@gmail.com") {
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
          home_categories:
            configuredCategories.length > 0
              ? configuredCategories
              : defaultHomeCategories,
          home_collection_ids: Array.isArray(data.home_collection_ids)
            ? data.home_collection_ids
            : [],
          shop_menu_items:
            configuredShopMenu.length > 0
              ? configuredShopMenu
              : defaultShopMenuItems,
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

  const calculateMonthlyRevenue = (ords: Order[], prods: Product[]) => {
    const revenueOrders = ords.filter(
      (order) => !["cancelled", "refunded"].includes(order.status)
    );
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
          return sum + (item.price - product.cost_price) * item.quantity;
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
    const revenueOrders = ords.filter(
      (order) => !["cancelled", "refunded"].includes(order.status)
    );
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
          return itemSum + (item.price - product.cost_price) * item.quantity;
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
          return itemSum + (item.price - product.cost_price) * item.quantity;
        }
        return itemSum;
      }, 0);
      return sum + profit;
    }, 0);

    const lowStockProducts = prods.filter((p) => (p.stock || 0) < 10).length;
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
    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: product.name,
        price: product.price,
        cost_price: product.cost_price || 0,
        original_price: product.original_price || product.price,
        description: product.description,
        image_url: product.image_url,
        category: product.category,
        subcategory: product.subcategory || "",
        audience: normalizeProductAudience(product.audience, product.category),
        stock: product.stock || 0,
        discount_percentage: product.discount_percentage || 0,
        material: product.material || "",
        care_instructions: product.care_instructions || "",
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
      setSizeStockMap(product.size_stock || {});
    } else {
      setEditingProduct(null);
      setProductForm({
        name: "",
        price: 0,
        cost_price: 0,
        original_price: 0,
        description: "",
        image_url: "",
        category: categories[0] || "",
        subcategory: "",
        audience: normalizeProductAudience(undefined, categories[0] || ""),
        stock: 0,
        discount_percentage: 0,
        material: "",
        care_instructions: "",
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
      setSizeStockMap({});
    }
    setShowProductModal(true);
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
    try {
      if (!productForm.name || !productForm.image_url || !productForm.category) {
        alert("Please fill in product name, category, and main image.");
        return;
      }

      const additionalImages = parseCommaSeparatedValues(productForm.images);
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
      const selectedSizes =
        parseCommaSeparatedValues(productForm.sizes).length > 0
          ? parseCommaSeparatedValues(productForm.sizes)
          : getDefaultSizesByCategory(productForm.category);
      const cleanedSizeStock = selectedSizes.reduce((acc, size) => {
        acc[size] = Math.max(0, Number(sizeStockMap[size] || 0));
        return acc;
      }, {} as Record<string, number>);
      const totalStockFromSizes = Object.values(cleanedSizeStock).reduce(
        (sum, value) => sum + Number(value || 0),
        0
      );
      const hasPerSizeStock = Object.keys(cleanedSizeStock).length > 0;

      const productData = {
        name: productForm.name,
        price: Number(productForm.price),
        cost_price: Number(productForm.cost_price),
        original_price:
          Number(productForm.original_price) || Number(productForm.price),
        description: productForm.description,
        image_url: productForm.image_url,
        category: productForm.category,
        subcategory: productForm.subcategory || null,
        audience: normalizeProductAudience(
          productForm.audience,
          productForm.category
        ),
        stock: hasPerSizeStock ? totalStockFromSizes : Number(productForm.stock),
        discount_percentage: Number(productForm.discount_percentage),
        material: productForm.material || null,
        care_instructions: productForm.care_instructions || null,
        colors: productForm.colors
          ? productForm.colors.split(",").map((c) => c.trim())
          : [],
        sizes: selectedSizes,
        size_stock: cleanedSizeStock,
        images:
          additionalImages.length > 0
            ? additionalImages
            : [productForm.image_url],
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
        Number(orderForm.shipping || 0),
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
      }

      await updateDoc(doc(db, "orders", editingOrder.id), orderData);

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

    try {
      const response = await fetch("/.netlify/functions/send-newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: emailForm.subject,
          message: emailForm.message,
          recipients: subscribers.map((s) => s.email),
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      alert(`Email sent to ${subscribers.length} subscribers!`);
      setShowEmailModal(false);
      setEmailForm({ subject: "", message: "" });
    } catch (err) {
      console.error("Send newsletter error:", err);
      alert("Error sending emails");
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

  const deleteProduct = async (productId: string) => {
    setConfirmAction({
      title: "Delete Product",
      message:
        "Are you sure you want to delete this product? This action cannot be undone.",
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "products", productId));
          alert("Product deleted successfully!");
        } catch (error) {
          console.error("Error deleting product:", error);
          alert("Failed to delete product");
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
          sale_subtitle: saleSettings.sale_subtitle || "Limited Time Offer",
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
      nextCategories[index] = {
        ...nextCategories[index],
        [field]: value,
      };
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
      nextItems[index] = {
        ...nextItems[index],
        [field]: value,
      };
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
          path: "/category/",
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
        slug: entry.slug.trim().toLowerCase().replace(/^\/+/, ""),
        image_url: entry.image_url.trim(),
      }))
      .filter((entry) => entry.name && entry.slug && entry.image_url);

    if (cleanedCategories.length === 0) {
      alert("Please add at least one category with name, slug, and image URL.");
      return;
    }

    const cleanedShopMenuItems = homepageSettings.shop_menu_items
      .map((entry, index) => ({
        id: entry.id || `menu-${index + 1}`,
        label: entry.label.trim(),
        path: entry.path.trim(),
        special: Boolean(entry.special),
      }))
      .filter((entry) => entry.label && entry.path);

    if (cleanedShopMenuItems.length === 0) {
      alert("Please add at least one shop menu item.");
      return;
    }

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

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      await updateOrderStatusWithInventory({
        orderId,
        userId: order.user_id,
        items: order.items,
        newStatus: newStatus as OrderStatus,
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      alert(
        error instanceof Error ? error.message : "Failed to update order status"
      );
    }
  };

  const deleteSubscriber = async (subscriberId: string) => {
    setConfirmAction({
      title: "Remove Subscriber",
      message: "Remove this subscriber from your newsletter list?",
      danger: false,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "newsletter", subscriberId));
        } catch (error) {
          console.error("Error deleting subscriber:", error);
          alert("Failed to remove subscriber");
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

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredOrders = orders.filter((order) => {
    return (
      order.id.toLowerCase().includes(orderSearchTerm.toLowerCase()) ||
      order.user_email?.toLowerCase().includes(orderSearchTerm.toLowerCase())
    );
  });

  const filteredSubscribers = subscribers.filter((sub) =>
    sub.email.toLowerCase().includes(subscriberSearchTerm.toLowerCase())
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
      | "featured"
      | "collections"
      | "subscribers";
    label: string;
    icon: typeof TrendingUp;
  }> = [
    { id: "overview", label: "Overview", icon: TrendingUp },
    { id: "products", label: "Products", icon: Package },
    { id: "orders", label: "Orders", icon: ShoppingBag },
    { id: "featured", label: "Featured & New", icon: Star },
    { id: "collections", label: "Collections", icon: Sparkles },
    { id: "subscribers", label: "Subscribers", icon: Mail },
  ];

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-light tracking-wider mb-2">
              ADMIN DASHBOARD
            </h1>
            <p className="text-gray-600">
              Manage your store, products, orders, and subscribers
            </p>
          </div>
          <button
            onClick={resetAllOrders}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            <RefreshCw size={20} />
            Reset Revenue
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-200 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-black"
              }`}
            >
              <tab.icon size={20} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Monthly Revenue Navigation */}
            {monthlyRevenueHistory.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-light">Monthly Analysis</h2>
                  <div className="flex items-center gap-2">
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
                    <span className="text-sm font-medium min-w-[150px] text-center">
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
                <p className="text-xs text-red-500 mt-2">
                  {analytics.lowStockProducts} low stock
                </p>
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
                        {order.user_email || order.user_id} •{" "}
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
                            : order.status === "refund_requested"
                            ? "bg-orange-100 text-orange-800"
                            : order.status === "refunded"
                            ? "bg-cyan-100 text-cyan-800"
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
            <div className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={20}
                  />
                  <input
                    type="text"
                    placeholder="Search by name, category, or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => exportData(filteredProducts, "products.csv")}
                  className="flex items-center gap-2 bg-gray-200 text-black px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  <Download size={20} />
                  Export
                </button>
                <button
                  onClick={() => openProductModal()}
                  className="flex items-center gap-2 bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <Plus size={20} />
                  Add Product
                </button>
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product) => {
                const profit = product.price - product.cost_price;
                const profitMargin = (
                  ((product.price - product.cost_price) / product.price) *
                  100
                ).toFixed(1);

                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <div className="aspect-[4/3] bg-gray-100 relative">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 right-2 flex gap-2">
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
                      {(product.stock || 0) < 5 && (
                        <div className="absolute bottom-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                          <AlertCircle size={12} />
                          Low Stock
                        </div>
                      )}
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
                            ${product.cost_price?.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-t pt-2">
                          <span className="text-gray-600">Profit:</span>
                          <span className="font-semibold text-green-600">
                            ${profit?.toFixed(2)} ({profitMargin}%)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm mb-3">
                        <span className="text-gray-600">
                          Stock: {product.stock || 0}
                        </span>
                        {(product.stock || 0) < 10 && (
                          <span className="text-red-600 text-xs font-semibold">
                            Low!
                          </span>
                        )}
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
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === "orders" && (
          <div className="space-y-6">
            {/* Search Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4">
              <div className="relative flex-1">
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
                className="flex items-center gap-2 bg-gray-200 text-black px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                <Download size={20} />
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
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
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {order.user_email ||
                            `User ${order.user_id.slice(0, 8)}`}
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
                              updateOrderStatus(order.id, e.target.value)
                            }
                            className={`px-3 py-1 text-xs font-semibold rounded-full border-0 cursor-pointer ${
                              order.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : order.status === "processing"
                                ? "bg-blue-100 text-blue-800"
                                : order.status === "shipped"
                                ? "bg-purple-100 text-purple-800"
                                : order.status === "delivered"
                                ? "bg-green-100 text-green-800"
                                : order.status === "refund_requested"
                                ? "bg-orange-100 text-orange-800"
                                : order.status === "refunded"
                                ? "bg-cyan-100 text-cyan-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            <option value="pending">Pending</option>
                            <option value="processing">Processing</option>
                            <option value="shipped">Shipped</option>
                            <option value="delivered">Delivered</option>
                            <option value="refund_requested">
                              Refund Requested
                            </option>
                            <option value="refunded">Refunded</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex gap-2 flex-wrap">
                            {(order.status === "pending" ||
                              order.status === "processing") && (
                              <button
                                onClick={() =>
                                  updateOrderStatus(order.id, "cancelled")
                                }
                                className="text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
                              >
                                Cancel
                              </button>
                            )}
                            {order.status === "refund_requested" && (
                              <button
                                onClick={() =>
                                  updateOrderStatus(order.id, "refunded")
                                }
                                className="text-cyan-600 hover:text-cyan-800 font-medium flex items-center gap-1"
                              >
                                Approve Refund
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <button
                  onClick={saveSaleSettings}
                  disabled={savingSaleSettings}
                  className="px-5 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-60 transition-colors"
                >
                  {savingSaleSettings ? "Saving..." : "Save Sale Timer"}
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
                  Slug should match a route like `men`, `women`, `sale`, or
                  `collections`.
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
                        placeholder="Name (e.g. Men)"
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="text"
                        value={entry.slug}
                        onChange={(e) =>
                          updateHomeCategory(index, "slug", e.target.value)
                        }
                        placeholder="Slug (e.g. men)"
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
                  `/collections`, `/sale`, or `/category/padel`.
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
                        placeholder="Path (e.g. /category/padel)"
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-light flex items-center gap-2">
                  <Star size={24} className="text-yellow-600" />
                  Featured Products ({featuredProducts.length}/3)
                </h2>
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-light flex items-center gap-2">
                  <Sparkles size={24} className="text-blue-600" />
                  New Arrivals ({newArrivals.length}/3)
                </h2>
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
                <button
                  onClick={() => setShowEmailModal(true)}
                  disabled={subscribers.length === 0}
                  className="flex items-center gap-2 bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Mail size={20} />
                  Send Campaign
                </button>
              </div>

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
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subscribed
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
                      })
                    }
                    list="admin-product-categories"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    placeholder="Type a category (e.g. Men, Shoes, Running)"
                  />
                  <datalist id="admin-product-categories">
                    {categories.map((cat) => (
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
                    placeholder="T-Shirts"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Audience
                  </label>
                  <select
                    value={productForm.audience}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        audience: e.target.value as ProductAudience,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  >
                    <option value="men">Men</option>
                    <option value="women">Women</option>
                    <option value="unisex">Unisex</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Retail Price ($) *
                  </label>
                  <input
                    type="number"
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
                    Total Stock
                  </label>
                  <input
                    type="number"
                    value={sizeOptionsForStock.reduce(
                      (sum, size) => sum + Number(sizeStockMap[size] || 0),
                      0
                    )}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Auto-calculated from per-size stock below.
                  </p>
                </div>
              </div>

              {/* Profit Display */}
              {productForm.price > 0 && productForm.cost_price >= 0 && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700 font-medium">
                      Profit per Unit:
                    </span>
                    <span className="text-lg font-bold text-green-600">
                      ${(productForm.price - productForm.cost_price).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">
                      Profit Margin:
                    </span>
                    <span className="text-lg font-bold text-green-600">
                      {(
                        ((productForm.price - productForm.cost_price) /
                          productForm.price) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
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

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Original Price (optional)
                  </label>
                  <input
                    type="number"
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
                  Main Product Image URL *
                </label>
                <div className="flex gap-4 items-start">
                  <div className="flex-1">
                    <input
                      type="url"
                      value={productForm.image_url}
                      onChange={(e) =>
                        setProductForm((prev) => ({
                          ...prev,
                          image_url: e.target.value.trim(),
                        }))
                      }
                      placeholder="https://example.com/main-image.jpg"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                    />
                  </div>
                  {productForm.image_url && (
                    <div className="w-24 h-24 rounded-lg overflow-hidden border border-gray-300">
                      <img
                        src={productForm.image_url}
                        alt="Main preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Additional Image URLs (optional)
                </label>
                <textarea
                  value={productForm.images}
                  onChange={(e) =>
                    setProductForm({ ...productForm, images: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder="https://example.com/image-1.jpg, https://example.com/image-2.jpg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separate links with commas.
                </p>

                {parseCommaSeparatedValues(productForm.images).length > 0 && (
                  <div className="grid grid-cols-5 gap-2 mt-3">
                    {parseCommaSeparatedValues(productForm.images).map(
                      (preview, index) => (
                        <div
                          key={`${preview}-${index}`}
                          className="relative aspect-square rounded-lg overflow-hidden border border-gray-300 group"
                        >
                          <img
                            src={preview}
                            alt={`Preview ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => removeAdditionalImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>


              <div>
                <label className="block text-sm font-medium mb-2">
                  Colors (comma-separated)
                </label>
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">
                    Sizes (comma-separated)
                  </label>
                  <button
                    type="button"
                    onClick={applyShoeDefaults}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    Use Shoe Defaults
                  </button>
                </div>
                <input
                  type="text"
                  value={productForm.sizes}
                  onChange={(e) =>
                    setProductForm({ ...productForm, sizes: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  placeholder={
                    productForm.category === "Shoes"
                      ? "36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48"
                      : "XS, S, M, L, XL"
                  }
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank to auto-fill defaults based on category.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Stock Per Size
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {sizeOptionsForStock.map((size) => (
                    <label
                      key={size}
                      className="border border-gray-200 rounded-lg p-2 flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-semibold">{size}</span>
                      <input
                        type="number"
                        min="0"
                        value={Number(sizeStockMap[size] || 0)}
                        onChange={(e) =>
                          setSizeStockMap((prev) => ({
                            ...prev,
                            [size]: Math.max(0, Number(e.target.value || 0)),
                          }))
                        }
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:border-black"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Enter quantity for each size. Checkout will now deduct stock by
                  selected size.
                </p>
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

              <div>
                <label className="block text-sm font-medium mb-2">
                  Size Guide (all products)
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
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => setShowProductModal(false)}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveProduct}
                className="flex-1 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                <Save size={20} />
                {editingProduct ? "Update Product" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Edit Modal */}
      {showOrderModal && editingOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
                    setOrderForm({ ...orderForm, status: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="refund_requested">Refund Requested</option>
                  <option value="refunded">Refunded</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                    Shipping ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={orderForm.shipping}
                    onChange={(e) =>
                      applyOrderItemsAndTotals(
                        orderForm.items,
                        Number(e.target.value),
                        Number(orderForm.tax || 0)
                      )
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black"
                  />
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
                        Number(orderForm.shipping || 0),
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

            <div className="p-6 border-t border-gray-200 flex gap-3 sticky bottom-0 bg-white">
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

            <div className="p-6 border-t border-gray-200 flex gap-3 sticky bottom-0 bg-white">
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
