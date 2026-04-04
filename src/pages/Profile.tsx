import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db, auth } from "../lib/firebase";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import {
  User,
  Mail,
  Calendar,
  Edit2,
  Save,
  X,
  Package,
  ShoppingBag,
  Check,
  AlertCircle,
} from "lucide-react";

interface UserProfile {
  firstName?: string;
  lastName?: string;
  countryCode?: string;
  phone?: string;
}

export function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<UserProfile>({});
  const [stats, setStats] = useState({ orders: 0, totalSpent: 0 });
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    loadProfile();
    loadStats();
  }, [user, navigate]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data() as UserProfile;
        setProfile(data);
        setEditForm(data);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!user) return;

    try {
      const ordersRef = collection(db, "users", user.uid, "orders");
      const ordersSnapshot = await getDocs(ordersRef);

      const totalSpent = ordersSnapshot.docs.reduce((sum, doc) => {
        return sum + (doc.data().total || 0);
      }, 0);

      setStats({
        orders: ordersSnapshot.size,
        totalSpent: totalSpent,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };


  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);

      const profilePayload: UserProfile = {
        firstName: editForm.firstName || "",
        lastName: editForm.lastName || "",
        countryCode: editForm.countryCode || "",
        phone: editForm.phone || "",
      };

      // Update Firestore user document
      await setDoc(
        doc(db, "users", user.uid),
        {
          ...profilePayload,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      // Update display name in Firebase Auth if both names provided
      if (editForm.firstName && editForm.lastName && auth.currentUser) {
        const displayName = `${editForm.firstName} ${editForm.lastName}`;
        try {
          await updateProfile(auth.currentUser, {
            displayName: displayName,
          });
        } catch (error) {
          console.error("Error updating display name:", error);
          // Continue even if display name update fails
        }
      }

      // Update local state
      setProfile(profilePayload);
      setEditing(false);

      // Show success message
      setMessage({ type: "success", text: "Profile updated successfully!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Error saving profile:", error);
      setMessage({
        type: "error",
        text: "Failed to save profile. Please try again.",
      });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditForm(profile);
    setEditing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-300"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-light tracking-wide mb-2">My Profile</h1>
          <p className="text-gray-600">Manage your account information</p>
        </div>

        {/* Success/Error Message */}
        {message && (
          <div
            className={`mb-6 flex items-center gap-3 p-4 rounded-xl ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border-2 border-green-200"
                : "bg-red-50 text-red-700 border-2 border-red-200"
            }`}
          >
            {message.type === "success" ? (
              <Check size={20} />
            ) : (
              <AlertCircle size={20} />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stats Cards */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 rounded-xl">
                  <Package className="text-blue-600" size={24} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.orders}</p>
                  <p className="text-sm text-gray-600">Total Orders</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-50 rounded-xl">
                  <ShoppingBag className="text-green-600" size={24} />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    ${stats.totalSpent.toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-600">Total Spent</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-50 rounded-xl">
                  <User className="text-purple-600" size={24} />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {user?.metadata?.creationTime
                      ? new Date(user.metadata.creationTime).getFullYear()
                      : "N/A"}
                  </p>
                  <p className="text-sm text-gray-600">Member Since</p>
                </div>
              </div>
            </div>
          </div>

          {/* Profile Information */}
          <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold">Profile Information</h2>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  <Edit2 size={16} />
                  Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    <X size={16} />
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-black rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    <Save size={16} />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* Account Info */}
              <div className="pb-6 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                  Account Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                    <Mail className="text-gray-400" size={20} />
                    <div>
                      <p className="text-xs text-gray-500">Email</p>
                      <p className="font-medium">{user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                    <Calendar className="text-gray-400" size={20} />
                    <div>
                      <p className="text-xs text-gray-500">Member Since</p>
                      <p className="font-medium">
                        {user?.metadata?.creationTime
                          ? new Date(
                              user.metadata.creationTime
                            ).toLocaleDateString()
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Personal Info */}
              <div className="pb-6 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      First Name
                    </label>
                    {editing ? (
                      <input
                        type="text"
                        value={editForm.firstName || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            firstName: e.target.value,
                          })
                        }
                        className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-black transition-colors"
                        placeholder="Enter first name"
                      />
                    ) : (
                      <p className="px-4 py-2.5 bg-gray-50 rounded-xl">
                        {profile.firstName || "Not provided"}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Last Name
                    </label>
                    {editing ? (
                      <input
                        type="text"
                        value={editForm.lastName || ""}
                        onChange={(e) =>
                          setEditForm({ ...editForm, lastName: e.target.value })
                        }
                        className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-black transition-colors"
                        placeholder="Enter last name"
                      />
                    ) : (
                      <p className="px-4 py-2.5 bg-gray-50 rounded-xl">
                        {profile.lastName || "Not provided"}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number
                    </label>
                    {editing ? (
                      <div className="flex gap-2">
                        <select
                          value={editForm.countryCode || "+961"}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              countryCode: e.target.value,
                            })
                          }
                          className="px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-black transition-colors bg-white"
                        >
                          <option value="+961">+961 (LB)</option>
                          <option value="+1">+1 (US/CA)</option>
                          <option value="+44">+44 (UK)</option>
                          <option value="+971">+971 (AE)</option>
                          <option value="+966">+966 (SA)</option>
                          <option value="+33">+33 (FR)</option>
                          <option value="+49">+49 (DE)</option>
                          <option value="+86">+86 (CN)</option>
                          <option value="+91">+91 (IN)</option>
                          <option value="+81">+81 (JP)</option>
                        </select>
                        <input
                          type="tel"
                          value={editForm.phone || ""}
                          onChange={(e) => {
                            // Remove all non-digit characters
                            let value = e.target.value.replace(/\D/g, "");

                            // Format with slashes (e.g., 12/345/678 for 8 digits)
                            if (value.length > 0) {
                              const parts = [];
                              if (value.length <= 2) {
                                parts.push(value);
                              } else if (value.length <= 5) {
                                parts.push(value.slice(0, 2));
                                parts.push(value.slice(2));
                              } else {
                                parts.push(value.slice(0, 2));
                                parts.push(value.slice(2, 5));
                                parts.push(value.slice(5, 8));
                              }
                              value = parts.join("/");
                            }

                            setEditForm({ ...editForm, phone: value });
                          }}
                          className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-black transition-colors"
                          placeholder="12/345/678"
                        />
                      </div>
                    ) : (
                      <p className="px-4 py-2.5 bg-gray-50 rounded-xl">
                        {profile.countryCode && profile.phone
                          ? `${profile.countryCode} ${profile.phone}`
                          : profile.phone || "Not provided"}
                      </p>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
