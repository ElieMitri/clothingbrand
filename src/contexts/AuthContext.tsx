import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth, db } from "../lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { getFirebaseFriendlyError } from "../lib/firebaseError";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
    phone?: string,
    address?: string,
    addressDetails?: string
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (displayName: string, photoURL?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let userDocUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous listener
      if (userDocUnsubscribe) {
        userDocUnsubscribe();
        userDocUnsubscribe = null;
      }

      if (firebaseUser) {
        const userRef = doc(db, "users", firebaseUser.uid);

        // Check if user document exists
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          // Create user document if it doesn't exist
          await setDoc(userRef, {
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // Set up real-time listener for user document
        userDocUnsubscribe = onSnapshot(userRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            const userData = docSnapshot.data();
            // Merge Firestore data with Firebase Auth user
            const updatedUser = {
              ...firebaseUser,
              displayName: userData.displayName || firebaseUser.displayName,
              photoURL: userData.photoURL || firebaseUser.photoURL,
            } as User;

            // Force new object reference to trigger re-renders
            setUser(updatedUser);
          } else {
            setUser({ ...firebaseUser });
          }
        });

        // Set initial user
        setUser({ ...firebaseUser });
      } else {
        setUser(null);
      }

      setLoading(false);
    });

    // Cleanup both listeners
    return () => {
      unsubscribe();
      if (userDocUnsubscribe) {
        userDocUnsubscribe();
      }
    };
  }, []);

  const signUp = async (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
    phone?: string,
    address?: string,
    addressDetails?: string
  ) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );
      const user = userCredential.user;

      // Update profile with display name
      if (firstName && lastName) {
        await updateProfile(user, {
          displayName: `${firstName} ${lastName}`,
        });
      }

      // Create user document in Firestore
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        firstName: firstName || "",
        lastName: lastName || "",
        phone: phone || "",
        address: address || "",
        addressDetails: addressDetails || "",
        displayName: `${firstName} ${lastName}`,
        photoURL: user.photoURL,
        subscribeNewsletter: true,
        notificationPreferences: {
          orderUpdates: true,
          promotions: true,
          newsletter: true,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Force re-render by creating new user object
      setUser({ ...user });
    } catch (error) {
      console.error("Sign up error:", error);
      throw new Error(getFirebaseFriendlyError(error, "Failed to create account"));
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch (error) {
      console.error("Sign in error:", error);
      throw new Error(getFirebaseFriendlyError(error, "Failed to sign in"));
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Sign out error:", error);
      throw new Error(getFirebaseFriendlyError(error, "Failed to sign out"));
    }
  };

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Create user document if it doesn't exist
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          provider: "google",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Force re-render
      setUser({ ...user });
    } catch (error) {
      console.error("Google sign in error:", error);
      throw new Error(
        getFirebaseFriendlyError(error, "Failed to sign in with Google")
      );
    }
  };

  const signInWithFacebook = async () => {
    try {
      const provider = new FacebookAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Create user document if it doesn't exist
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          provider: "facebook",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Force re-render
      setUser({ ...user });
    } catch (error) {
      console.error("Facebook sign in error:", error);
      throw new Error(
        getFirebaseFriendlyError(error, "Failed to sign in with Facebook")
      );
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error("Reset password error:", error);
      throw new Error(
        getFirebaseFriendlyError(error, "Failed to send password reset email")
      );
    }
  };

  const updateUserProfile = async (displayName: string, photoURL?: string) => {
    try {
      if (!user) throw new Error("No user logged in");

      // Update Firebase Auth profile
      await updateProfile(user, {
        displayName,
        ...(photoURL && { photoURL }),
      });

      // Update Firestore document (this will trigger onSnapshot listener)
      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName,
          ...(photoURL && { photoURL }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Force immediate update without waiting for listener
      const updatedUser = {
        ...user,
        displayName,
        ...(photoURL && { photoURL }),
      } as User;

      setUser(updatedUser);
    } catch (error) {
      console.error("Update profile error:", error);
      throw new Error(getFirebaseFriendlyError(error, "Failed to update profile"));
    }
  };

  const value = {
    user,
    loading,
    signUp,
    signIn,
    signOut,
    signInWithGoogle,
    signInWithFacebook,
    resetPassword,
    updateUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
