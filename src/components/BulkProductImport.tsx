import { useState } from "react";
import {
  Upload,
  Download,
  FileText,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { db } from "../lib/firebase";
import { collection, addDoc, Timestamp } from "firebase/firestore";

interface ParsedProduct {
  [key: string]: string | number | string[];
}

export function BulkProductImport() {
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  }>({
    success: 0,
    failed: 0,
    errors: [],
  });

  const downloadTemplate = () => {
    const csvContent = `name,price,description,image_url,category,subcategory,stock,material,care_instructions,colors
Premium Cotton T-Shirt,29.99,Comfortable everyday t-shirt,https://images.unsplash.com/photo-1521572163474-6864f9cf17ab,Men,T-Shirts,50,100% Cotton,Machine wash cold,"Black,White,Navy"
Slim Fit Jeans,79.99,Classic slim fit denim,https://images.unsplash.com/photo-1542272604-787c3835535d,Men,Pants,30,98% Cotton 2% Elastane,Machine wash cold,"Blue,Black"
Floral Summer Dress,89.99,Elegant floral print dress,https://images.unsplash.com/photo-1595777457583-95e059d581b8,Women,Dresses,25,100% Polyester,Hand wash only,"Pink,Blue,White"`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product_import_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const parseCSV = (text: string): ParsedProduct[] => {
    const lines = text.split("\n").filter((line) => line.trim());
    const headers = lines[0].split(",").map((h) => h.trim());
    const products: ParsedProduct[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values: string[] = [];
      let currentValue = "";
      let insideQuotes = false;

      for (const char of lines[i]) {
        if (char === '"') {
          insideQuotes = !insideQuotes;
        } else if (char === "," && !insideQuotes) {
          values.push(currentValue.trim());
          currentValue = "";
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim());

      const product: ParsedProduct = {};
      headers.forEach((header, index) => {
        let value = values[index] || "";

        // Remove quotes
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }

        // Parse specific fields
        if (header === "price" || header === "stock") {
          product[header] = Number(value);
        } else if (header === "colors") {
          product[header] = value
            ? value.split(",").map((c: string) => c.trim())
            : [];
        } else {
          product[header] = value;
        }
      });

      products.push(product);
    }

    return products;
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResults({ success: 0, failed: 0, errors: [] });

    try {
      const text = await file.text();
      const products = parseCSV(text);

      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const product of products) {
        try {
          // Validate required fields
          if (!product.name || !product.price || !product.category) {
            throw new Error(
              `Missing required fields for product: ${
                product.name || "Unknown"
              }`
            );
          }

          // Add product to Firestore
          await addDoc(collection(db, "products"), {
            name: product.name,
            price: Number(product.price),
            original_price: Number(product.price),
            description: product.description || "",
            image_url: product.image_url || "",
            category: product.category,
            subcategory: product.subcategory || null,
            stock: Number(product.stock) || 0,
            discount_percentage: 0,
            material: product.material || null,
            care_instructions: product.care_instructions || null,
            colors: product.colors || [],
            images: [product.image_url || ""],
            created_at: Timestamp.now(),
          });

          successCount++;
        } catch (error) {
          failedCount++;
          const message =
            error instanceof Error ? error.message : "Unknown import error";
          errors.push(`${product.name}: ${message}`);
        }
      }

      setResults({ success: successCount, failed: failedCount, errors });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to parse CSV file";
      setResults({ success: 0, failed: 0, errors: [message] });
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-light mb-2">Bulk Product Import</h2>
        <p className="text-gray-600 text-sm">
          Import multiple products at once using a CSV file
        </p>
      </div>

      {/* Template Download */}
      <div className="mb-6">
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={20} />
          Download CSV Template
        </button>
        <p className="text-xs text-gray-500 mt-2">
          Download the template to see the required format
        </p>
      </div>

      {/* File Upload */}
      <div className="mb-6">
        <label className="block">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-black transition-colors cursor-pointer">
            <Upload className="mx-auto mb-4 text-gray-400" size={48} />
            <p className="text-sm font-medium mb-1">Click to upload CSV file</p>
            <p className="text-xs text-gray-500">or drag and drop</p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={importing}
              className="hidden"
            />
          </div>
        </label>
      </div>

      {/* Import Status */}
      {importing && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
          <span className="text-sm text-blue-800">Importing products...</span>
        </div>
      )}

      {/* Results */}
      {!importing && (results.success > 0 || results.failed > 0) && (
        <div className="space-y-4">
          {/* Success */}
          {results.success > 0 && (
            <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg">
              <CheckCircle
                className="text-green-600 flex-shrink-0 mt-0.5"
                size={20}
              />
              <div>
                <p className="text-sm font-medium text-green-800">
                  Successfully imported {results.success} product
                  {results.success !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          )}

          {/* Failures */}
          {results.failed > 0 && (
            <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg">
              <AlertCircle
                className="text-red-600 flex-shrink-0 mt-0.5"
                size={20}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 mb-2">
                  Failed to import {results.failed} product
                  {results.failed !== 1 ? "s" : ""}
                </p>
                {results.errors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {results.errors.slice(0, 5).map((error, i) => (
                      <p key={i} className="text-xs text-red-700">
                        • {error}
                      </p>
                    ))}
                    {results.errors.length > 5 && (
                      <p className="text-xs text-red-700">
                        ... and {results.errors.length - 5} more errors
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-start gap-3">
          <FileText className="text-gray-400 flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-gray-600 space-y-2">
            <p className="font-medium text-gray-800">
              CSV Format Requirements:
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Required columns: name, price, category</li>
              <li>
                Optional columns: description, image_url, subcategory, stock,
                material, care_instructions, colors
              </li>
              <li>
                Colors should be comma-separated within quotes (e.g.,
                "Black,White,Navy")
              </li>
              <li>
                Price should be a number without currency symbol (e.g., 29.99)
              </li>
              <li>Stock should be a whole number (e.g., 50)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
