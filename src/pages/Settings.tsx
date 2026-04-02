import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db, auth } from "../lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from "firebase/auth";
import {
  Lock,
  Bell,
  Trash2,
  Save,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
} from "lucide-react";

interface NotificationSettings {
  orderUpdates: boolean;
  promotions: boolean;
  newsletter: boolean;
}

export function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<NotificationSettings>({
    orderUpdates: true,
    promotions: true,
    newsletter: true,
  });
  const [notificationMessage, setNotificationMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    loadSettings();
  }, [user, navigate]);

  const loadSettings = async () => {
    if (!user) return;

    try {
      const settingsDoc = await getDoc(
        doc(db, "users", user.uid, "settings", "preferences")
      );
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        setNotifications({
          orderUpdates: data.orderUpdates ?? true,
          promotions: data.promotions ?? true,
          newsletter: data.newsletter ?? true,
        });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "Passwords do not match" });
      setTimeout(() => setPasswordMessage(null), 3000);
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage({
        type: "error",
        text: "Password must be at least 6 characters",
      });
      setTimeout(() => setPasswordMessage(null), 3000);
      return;
    }

    if (!user || !user.email) return;

    try {
      setSaving(true);

      // Re-authenticate user
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );
      await reauthenticateWithCredential(auth.currentUser!, credential);

      // Update password
      await updatePassword(auth.currentUser!, newPassword);

      setPasswordMessage({
        type: "success",
        text: "Password updated successfully",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordMessage(null), 3000);
    } catch (error) {
      console.error("Error changing password:", error);
      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : "";
      if (errorCode === "auth/wrong-password") {
        setPasswordMessage({
          type: "error",
          text: "Current password is incorrect",
        });
      } else {
        setPasswordMessage({
          type: "error",
          text: "Failed to update password",
        });
      }
      setTimeout(() => setPasswordMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationSave = async () => {
    if (!user) return;

    try {
      setSaving(true);

      await setDoc(doc(db, "users", user.uid, "settings", "preferences"), {
        ...notifications,
        updatedAt: new Date(),
      });

      setNotificationMessage({
        type: "success",
        text: "Notification preferences saved",
      });
      setTimeout(() => setNotificationMessage(null), 3000);
    } catch (error) {
      console.error("Error saving notifications:", error);
      setNotificationMessage({
        type: "error",
        text: "Failed to save preferences",
      });
      setTimeout(() => setNotificationMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !user.email) return;

    try {
      setDeleting(true);

      // Re-authenticate
      const credential = EmailAuthProvider.credential(
        user.email,
        deletePassword
      );
      await reauthenticateWithCredential(auth.currentUser!, credential);

      // Delete user data from Firestore
      const userDoc = doc(db, "users", user.uid);
      await deleteDoc(userDoc);

      // Delete cart items
      const cartsRef = collection(db, "carts");
      const cartsSnapshot = await getDocs(cartsRef);
      await Promise.all(
        cartsSnapshot.docs
          .filter((d) => d.data().user_id === user.uid)
          .map((d) => deleteDoc(d.ref))
      );

      // Delete Firebase Auth account
      await deleteUser(auth.currentUser!);

      // Sign out and redirect
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Error deleting account:", error);
      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : "";
      if (errorCode === "auth/wrong-password") {
        alert("Incorrect password. Please try again.");
      } else {
        alert("Failed to delete account. Please try again.");
      }
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
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
          <h1 className="text-4xl font-light tracking-wide mb-2">Settings</h1>
          <p className="text-gray-600">
            Manage your account preferences and security
          </p>
        </div>

        <div className="space-y-6">
          {/* Password Change */}
          <div className="bg-white rounded-2xl shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Lock className="text-blue-600" size={20} />
              </div>
              <h2 className="text-2xl font-semibold">Change Password</h2>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2.5 pr-12 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-black transition-colors"
                    placeholder="Enter current password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showCurrentPassword ? (
                      <EyeOff size={20} />
                    ) : (
                      <Eye size={20} />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 pr-12 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-black transition-colors"
                    placeholder="Enter new password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-black transition-colors"
                  placeholder="Confirm new password"
                  required
                />
              </div>

              {passwordMessage && (
                <div
                  className={`flex items-center gap-2 p-4 rounded-xl ${
                    passwordMessage.type === "success"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {passwordMessage.type === "success" ? (
                    <Check size={20} />
                  ) : (
                    <AlertCircle size={20} />
                  )}
                  <span className="text-sm font-medium">
                    {passwordMessage.text}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 font-semibold"
              >
                <Save size={18} />
                {saving ? "Updating..." : "Update Password"}
              </button>
            </form>
          </div>

          {/* Notification Preferences */}
          <div className="bg-white rounded-2xl shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-purple-50 rounded-lg">
                <Bell className="text-purple-600" size={20} />
              </div>
              <h2 className="text-2xl font-semibold">Notifications</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-medium">Order Updates</p>
                  <p className="text-sm text-gray-600">
                    Get notified about your order status
                  </p>
                </div>
                <label className="relative inline-block w-12 h-6">
                  <input
                    type="checkbox"
                    checked={notifications.orderUpdates}
                    onChange={(e) =>
                      setNotifications({
                        ...notifications,
                        orderUpdates: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-full h-full bg-gray-300 rounded-full peer-checked:bg-black transition-colors cursor-pointer"></div>
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-medium">Promotions</p>
                  <p className="text-sm text-gray-600">
                    Receive special offers and discounts
                  </p>
                </div>
                <label className="relative inline-block w-12 h-6">
                  <input
                    type="checkbox"
                    checked={notifications.promotions}
                    onChange={(e) =>
                      setNotifications({
                        ...notifications,
                        promotions: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-full h-full bg-gray-300 rounded-full peer-checked:bg-black transition-colors cursor-pointer"></div>
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-medium">Newsletter</p>
                  <p className="text-sm text-gray-600">
                    Get style tips and new arrivals
                  </p>
                </div>
                <label className="relative inline-block w-12 h-6">
                  <input
                    type="checkbox"
                    checked={notifications.newsletter}
                    onChange={(e) =>
                      setNotifications({
                        ...notifications,
                        newsletter: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-full h-full bg-gray-300 rounded-full peer-checked:bg-black transition-colors cursor-pointer"></div>
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6"></div>
                </label>
              </div>

              {notificationMessage && (
                <div
                  className={`flex items-center gap-2 p-4 rounded-xl ${
                    notificationMessage.type === "success"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {notificationMessage.type === "success" ? (
                    <Check size={20} />
                  ) : (
                    <AlertCircle size={20} />
                  )}
                  <span className="text-sm font-medium">
                    {notificationMessage.text}
                  </span>
                </div>
              )}

              <button
                onClick={handleNotificationSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 font-semibold"
              >
                <Save size={18} />
                {saving ? "Saving..." : "Save Preferences"}
              </button>
            </div>
          </div>

          {/* Delete Account */}
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <Trash2 className="text-red-600" size={20} />
              </div>
              <h2 className="text-2xl font-semibold text-red-900">
                Delete Account
              </h2>
            </div>

            <p className="text-red-700 mb-6">
              Once you delete your account, there is no going back. All your
              data will be permanently deleted.
            </p>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-semibold"
              >
                Delete My Account
              </button>
            ) : (
              <div className="space-y-4 bg-white p-6 rounded-xl border-2 border-red-300">
                <p className="font-semibold text-red-900">
                  Are you absolutely sure? This action cannot be undone.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter your password to confirm
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-red-300 rounded-xl focus:outline-none focus:border-red-500 transition-colors"
                    placeholder="Enter your password"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting || !deletePassword}
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 font-semibold"
                  >
                    {deleting ? "Deleting..." : "Yes, Delete My Account"}
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeletePassword("");
                    }}
                    className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
