/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  useMapEvents,
  Circle,
  useMap
} from 'react-leaflet';
import L from 'leaflet';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc,
  increment,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  Globe, 
  MapPin, 
  Wind, 
  AlertTriangle, 
  CheckCircle2, 
  BarChart3, 
  History, 
  Settings, 
  LogOut, 
  User as UserIcon,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  X,
  Loader2,
  Languages,
  Users as UsersIcon,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  Droplets,
  Thermometer,
  Zap,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './firebase';
import { generateClimateContent, ClimateResponse } from './services/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Fix Leaflet marker icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Types
interface SavedContent extends ClimateResponse {
  id: string;
  lat: number;
  lon: number;
  city: string;
  country: string;
  audience: string;
  createdAt: any;
  userId: string;
}

interface UserAction {
  id: string;
  userId: string;
  contentId: string;
  tip: string;
  committedAt: any;
}

// Components
const SidebarItem = ({ icon: Icon, label, active, onClick, collapsed }: { icon: any, label: string, active?: boolean, onClick: () => void, collapsed?: boolean }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 w-full p-3 rounded-2xl transition-all duration-300 group relative",
      active 
        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
        : "text-slate-400 hover:bg-white/5 hover:text-white"
    )}
  >
    <Icon size={22} className={cn("shrink-0 transition-transform duration-300", active && "scale-110")} />
    {!collapsed && (
      <span className="font-semibold tracking-tight whitespace-nowrap overflow-hidden">{label}</span>
    )}
    {collapsed && active && (
      <div className="absolute left-0 w-1 h-6 bg-emerald-500 rounded-r-full" />
    )}
  </button>
);

const RiskBadge = ({ level }: { level: string }) => {
  const colors = {
    Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    High: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    Critical: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border backdrop-blur-md", colors[level as keyof typeof colors] || colors.Low)}>
      {level} Risk
    </span>
  );
};

const WeatherIcon = ({ condition, size = 32 }: { condition: string, size?: number }) => {
  const c = condition.toLowerCase();
  if (c.includes('sun') || c.includes('clear')) return <Sun className="text-yellow-400" size={size} />;
  if (c.includes('rain') || c.includes('drizzle')) return <CloudRain className="text-blue-400" size={size} />;
  if (c.includes('storm') || c.includes('lightning')) return <CloudLightning className="text-purple-400" size={size} />;
  return <Cloud className="text-slate-400" size={size} />;
};

const ForecastCard = ({ forecast }: { forecast: ClimateResponse['forecast'] }) => (
  <div className="grid grid-cols-3 gap-4">
    {forecast.map((day, i) => (
      <div key={i} className="bg-slate-800/40 p-5 rounded-3xl border border-white/5 flex flex-col items-center text-center group hover:bg-slate-800/60 transition-all">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{day.date}</span>
        <div className="mb-3 group-hover:scale-110 transition-transform duration-500">
          <WeatherIcon condition={day.condition} size={24} />
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-black text-white">{day.temp_max}°</span>
          <span className="text-[10px] font-bold text-slate-500">{day.temp_min}°</span>
        </div>
      </div>
    ))}
  </div>
);

const WeatherCard = ({ data }: { data: ClimateResponse['numerical_weather'] }) => (
  <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/30 p-8 rounded-[2.5rem] text-white border border-blue-500/20 shadow-2xl relative overflow-hidden group">
    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-125 transition-transform duration-1000">
      <WeatherIcon condition={data.condition} />
    </div>
    <div className="flex items-center justify-between mb-6 relative z-10">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400 mb-2">Current Weather</p>
        <div className="flex items-baseline gap-1">
          <h4 className="text-6xl font-black tracking-tighter font-display">{data.temp}</h4>
          <span className="text-2xl font-bold text-blue-400">°C</span>
        </div>
        <p className="text-base font-semibold text-slate-300 mt-1">{data.condition} • Feels like {data.feels_like}°C</p>
      </div>
      <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center border border-blue-500/20">
        <WeatherIcon condition={data.condition} />
      </div>
    </div>
    <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/5 relative z-10">
      <div className="text-center">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Humidity</p>
        <p className="text-lg font-bold text-white">{data.humidity}%</p>
      </div>
      <div className="text-center border-x border-white/5">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Wind</p>
        <p className="text-lg font-bold text-white">{data.wind_speed} <span className="text-[10px] opacity-50">km/h</span></p>
      </div>
      <div className="text-center">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">UV Index</p>
        <p className="text-lg font-bold text-white">{data.uv_index}</p>
      </div>
    </div>
  </div>
);

// Error Handling
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        const info = JSON.parse(this.state.error?.message || "{}");
        if (info.error) message = `Firestore Error: ${info.error}`;
      } catch (e) {
        message = this.state.error?.message || message;
      }
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-slate-900 p-6 text-center">
          <div className="bg-slate-800 p-8 rounded-3xl border border-red-500/30 max-w-md">
            <AlertTriangle className="text-red-500 mx-auto mb-4" size={48} />
            <h2 className="text-xl font-bold text-white mb-2">Oops!</h2>
            <p className="text-slate-400 mb-6">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<'map' | 'history' | 'dashboard'>('map');
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [selectedPos, setSelectedPos] = useState<[number, number] | null>(null);
  const [audience, setAudience] = useState('General Public');
  const [language, setLanguage] = useState('English');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentContent, setCurrentContent] = useState<ClimateResponse | null>(null);
  const [history, setHistory] = useState<SavedContent[]>([]);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showGuide, setShowGuide] = useState(true);

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Ensure user profile exists
        const userRef = doc(db, 'user_profiles', u.uid);
        getDoc(userRef).then((snap) => {
          if (!snap.exists()) {
            setDoc(userRef, {
              uid: u.uid,
              displayName: u.displayName,
              email: u.email,
              actionScore: 0,
              role: 'user',
              lastActive: new Date().toISOString()
            }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'user_profiles'));
          }
        }).catch(err => handleFirestoreError(err, OperationType.GET, 'user_profiles'));
      }
    });
    return unsubscribe;
  }, []);

  // Test connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Firebase connection error: Client is offline.");
        }
      }
    };
    testConnection();
  }, []);

  // Geolocation
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation([pos.coords.latitude, pos.coords.longitude]);
          setSelectedPos([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => {
          console.warn("Geolocation failed, using fallback:", err.message);
          // Fallback to a central location (e.g., New Delhi) if permission denied
          const fallback: [number, number] = [28.6139, 77.2090];
          setLocation(fallback);
          setSelectedPos(fallback);
        }
      );
    } else {
      // Fallback for browsers without geolocation
      const fallback: [number, number] = [28.6139, 77.2090];
      setLocation(fallback);
      setSelectedPos(fallback);
    }
  }, []);

  // Data Fetching
  useEffect(() => {
    if (!user) return;

    const qHistory = query(collection(db, 'climate_contents'), orderBy('createdAt', 'desc'));
    const unsubHistory = onSnapshot(qHistory, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedContent)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'climate_contents'));

    const qActions = query(collection(db, 'user_actions'), where('userId', '==', user.uid));
    const unsubActions = onSnapshot(qActions, (snap) => {
      setUserActions(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserAction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'user_actions'));

    return () => {
      unsubHistory();
      unsubActions();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login error:", err);
    }
  };

  const handleLogout = () => auth.signOut();

  const handleGenerate = async (lat: number, lon: number) => {
    if (!user) return;
    setIsGenerating(true);
    setError(null);
    setCurrentContent(null);
    try {
      // Reverse geocode for city/country
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      const geoData = await geoRes.json();
      const city = geoData.address.city || geoData.address.town || geoData.address.village || "Unknown City";
      const country = geoData.address.country || "Unknown Country";

      const content = await generateClimateContent(lat, lon, city, country, audience, language);
      setCurrentContent(content);

      // Save to Firestore
      await addDoc(collection(db, 'climate_contents'), {
        ...content,
        lat,
        lon,
        city,
        country,
        audience,
        language,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("Generation error:", err);
      setError(err.message || "Failed to generate climate report. Please try again.");
      if (err instanceof Error && err.message.includes('permission')) {
        handleFirestoreError(err, OperationType.CREATE, 'climate_contents');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLocate = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setLocation(newPos);
        setSelectedPos(newPos);
      });
    }
  };
  const handleCommit = async (tip: string) => {
    if (!user || !currentContent) return;
    
    // Check if already committed
    const existing = userActions.find(a => a.tip === tip);
    if (existing) return;

    try {
      await addDoc(collection(db, 'user_actions'), {
        userId: user.uid,
        contentId: "temp", // In a real app, link to the saved doc ID
        tip,
        committedAt: new Date().toISOString()
      });

      // Update user score
      const userRef = doc(db, 'user_profiles', user.uid);
      await updateDoc(userRef, {
        actionScore: increment(10)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'user_actions/user_profiles');
    }
  };

  // Map Events
  function MapEvents() {
    useMapEvents({
      click(e) {
        setSelectedPos([e.latlng.lat, e.latlng.lng]);
        handleGenerate(e.latlng.lat, e.latlng.lng);
        setShowGuide(false);
      },
    });
    return null;
  }

  function MapResizer() {
    const map = useMap();
    useEffect(() => {
      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 400); // Match sidebar transition duration
      return () => clearTimeout(timer);
    }, [sidebarOpen, map]);
    return null;
  }

  if (!isAuthReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-emerald-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#020617] p-6 relative overflow-hidden">
        {/* Background Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-slate-900/50 backdrop-blur-2xl p-10 rounded-[2.5rem] border border-white/5 shadow-2xl text-center relative z-10"
        >
          <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/20 rotate-3 hover:rotate-0 transition-transform duration-500">
            <Globe className="text-white" size={48} />
          </div>
          <h1 className="text-4xl font-black text-white mb-3 tracking-tighter font-display">ClimateAware AI</h1>
          <p className="text-slate-400 mb-10 leading-relaxed font-medium">Hyper-local climate intelligence and behavioral change powered by advanced Generative AI.</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-4 bg-white text-slate-900 py-5 rounded-2xl font-black text-lg hover:bg-emerald-400 hover:text-white transition-all duration-300 shadow-xl group"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6 group-hover:scale-110 transition-transform" alt="Google" />
            Sign in with Google
          </button>
          <p className="mt-8 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Secure • Real-time • Localized</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex bg-[#0f172a] text-slate-200 overflow-hidden font-sans selection:bg-emerald-500/30">
      {/* Mobile Sidebar Trigger (Semi-circle) */}
      {!sidebarOpen && (
        <motion.button
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          onClick={() => setSidebarOpen(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-[4000] md:hidden bg-emerald-500 text-white w-10 h-20 rounded-r-full flex items-center justify-center shadow-xl border border-white/10 hover:w-12 transition-all group"
        >
          <ChevronRight size={20} className="group-hover:translate-x-0.5 transition-transform" />
        </motion.button>
      )}

      {/* Mobile Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2500] md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(_, info) => {
          if (info.offset.x < -50) setSidebarOpen(false);
        }}
        animate={{ 
          width: sidebarOpen ? 280 : (window.innerWidth < 768 ? 0 : 80),
          x: (window.innerWidth < 768 && !sidebarOpen) ? -280 : 0
        }}
        className={cn(
          "bg-[#0f172a] border-r border-white/5 flex flex-col p-4 fixed md:relative h-full z-[3000] transition-colors duration-300 overflow-hidden",
          !sidebarOpen && "items-center"
        )}
      >
        <div className={cn("flex items-center gap-3 mb-12 px-2 w-full", !sidebarOpen && "justify-center")}>
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
            <Globe className="text-white" size={22} />
          </div>
          {sidebarOpen && <span className="font-black text-xl text-white tracking-tighter font-display">ClimateAware</span>}
          
          {/* Mobile Close Button */}
          {sidebarOpen && (
            <button 
              onClick={() => setSidebarOpen(false)}
              className="ml-auto md:hidden p-2 text-slate-400 hover:text-white"
            >
              <ChevronLeft size={20} />
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-3 w-full">
          <SidebarItem icon={MapPin} label="The Map" active={view === 'map'} onClick={() => setView('map')} collapsed={!sidebarOpen} />
          <SidebarItem icon={History} label="My Vibes" active={view === 'history'} onClick={() => setView('history')} collapsed={!sidebarOpen} />
          <SidebarItem icon={BarChart3} label="Analytics" active={view === 'dashboard'} onClick={() => setView('dashboard')} collapsed={!sidebarOpen} />
        </nav>

        <div className="mt-auto space-y-3 w-full">
          <div className={cn("p-3 bg-white/5 rounded-2xl mb-4 border border-white/5 transition-all", !sidebarOpen && "p-1 bg-transparent border-none")}>
            <div className={cn("flex items-center gap-3", !sidebarOpen && "justify-center")}>
              <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 border border-white/5">
                <UserIcon size={18} className="text-emerald-400" />
              </div>
              {sidebarOpen && (
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-white truncate leading-none mb-1">{user.displayName}</p>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider truncate">{user.email}</p>
                </div>
              )}
            </div>
          </div>
          <SidebarItem icon={LogOut} label="Ghost Out" onClick={handleLogout} collapsed={!sidebarOpen} />
        </div>

        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-24 w-6 h-6 bg-slate-800 border border-white/10 rounded-full flex items-center justify-center shadow-xl hover:bg-emerald-500 hover:border-emerald-400 transition-all text-white z-50"
        >
          {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[#020617]">
        {/* Header */}
        <header className="h-20 bg-[#0f172a]/80 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-6 md:px-8 shrink-0 z-[2000]">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="md:hidden w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white hover:bg-emerald-500 transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] leading-none mb-1">Navigation</span>
              <h2 className="text-xl font-black text-white uppercase tracking-tighter font-display">
                {view === 'map' && "Explore the World"}
                {view === 'history' && "Climate Journey"}
                {view === 'dashboard' && "The Big Picture"}
              </h2>
            </div>
          </div>

          {view === 'map' && (
            <div className="hidden md:flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Audience</span>
                <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-xl border border-white/5 focus-within:border-emerald-500/50 transition-all">
                  <UsersIcon size={16} className="text-emerald-400" />
                  <select 
                    value={audience} 
                    onChange={(e) => setAudience(e.target.value)}
                    className="bg-transparent text-sm font-bold focus:outline-none text-white cursor-pointer"
                  >
                    <option className="bg-[#1e293b]">General Public</option>
                    <option className="bg-[#1e293b]">Students</option>
                    <option className="bg-[#1e293b]">Farmers</option>
                    <option className="bg-[#1e293b]">Urban Pros</option>
                    <option className="bg-[#1e293b]">Policy Makers</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Language</span>
                <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-xl border border-white/5 focus-within:border-emerald-500/50 transition-all">
                  <Languages size={16} className="text-emerald-400" />
                  <select 
                    value={language} 
                    onChange={(e) => setLanguage(e.target.value)}
                    className="bg-transparent text-sm font-bold focus:outline-none text-white cursor-pointer"
                  >
                    <option className="bg-[#1e293b]">English</option>
                    <option className="bg-[#1e293b]">Hindi</option>
                    <option className="bg-[#1e293b]">Spanish</option>
                    <option className="bg-[#1e293b]">French</option>
                    <option className="bg-[#1e293b]">Arabic</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </header>

        <div className="flex-1 relative overflow-hidden">
          {view === 'map' && (
            <div className="h-full w-full flex flex-col md:flex-row">
              <div className="flex-1 relative min-h-[40vh]">
                {location && (
                  <MapContainer 
                    // @ts-ignore
                    center={location} 
                    // @ts-ignore
                    zoom={13} 
                    className="h-full w-full"
                  >
                    <TileLayer
                      // @ts-ignore
                      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      // @ts-ignore
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    />
                    <MapEvents />
                    <MapResizer />
                    {selectedPos && (
                      <Marker position={selectedPos}>
                        <Popup>
                          Vibing here?
                        </Popup>
                      </Marker>
                    )}
                    {history.map(item => (
                      <Circle 
                        key={item.id}
                        center={[item.lat, item.lon]}
                        // @ts-ignore
                        radius={500}
                        pathOptions={{ 
                          color: item.risk_level === 'Critical' ? '#ef4444' : 
                                 item.risk_level === 'High' ? '#f97316' : 
                                 item.risk_level === 'Medium' ? '#eab308' : '#10b981',
                          fillOpacity: 0.3,
                          weight: 1
                        }}
                      />
                    ))}
                  </MapContainer>
                )}
                
                {/* Floating Controls */}
                <div className="absolute top-4 right-4 z-[500] flex flex-col gap-2">
                  <button 
                    onClick={handleLocate}
                    className="bg-[#1e293b]/90 backdrop-blur-xl p-3 rounded-2xl shadow-2xl border border-white/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all"
                    title="Locate Me"
                  >
                    <MapPin size={20} />
                  </button>
                </div>

                <AnimatePresence>
                  {showGuide && (
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute top-4 left-4 z-[500] flex flex-col gap-2"
                    >
                      <div className="bg-[#1e293b]/90 backdrop-blur-xl p-5 rounded-[2rem] shadow-2xl border border-white/10 max-w-xs relative group">
                        <button 
                          onClick={() => setShowGuide(false)}
                          className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                        >
                          <X size={12} />
                        </button>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Quick Start</p>
                        </div>
                        <p className="text-sm text-slate-200 font-medium leading-relaxed">
                          Tap anywhere on the dark map to get the climate tea ☕️
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* AI Panel */}
              <AnimatePresence>
                {(isGenerating || currentContent || error) && (
                  <motion.div 
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed inset-y-0 right-0 w-full md:w-[500px] bg-[#0f172a]/95 backdrop-blur-3xl border-l border-white/5 overflow-y-auto p-6 md:p-10 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] z-[4000] custom-scrollbar"
                  >
                    <div className="flex items-center justify-between mb-10">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em] leading-none mb-1">Intelligence</span>
                        <h3 className="font-black text-3xl text-white tracking-tighter font-display italic">The Report</h3>
                      </div>
                      <button 
                        onClick={() => {
                          setCurrentContent(null);
                          setError(null);
                        }} 
                        className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all duration-300 group shadow-lg"
                      >
                        <ChevronRight className="group-hover:translate-x-0.5 transition-transform" size={24} />
                      </button>
                    </div>

                    {error ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
                          <AlertCircle className="text-red-500" size={40} />
                        </div>
                        <h4 className="text-xl font-bold text-white mb-2">Generation Failed</h4>
                        <p className="text-slate-400 mb-8 max-w-xs mx-auto">{error}</p>
                        <button 
                          onClick={() => selectedPos && handleGenerate(selectedPos[0], selectedPos[1])}
                          className="px-8 py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                        >
                          Try Again
                        </button>
                      </div>
                    ) : isGenerating ? (
                      <div className="flex flex-col items-center justify-center py-32 text-center">
                        <div className="relative mb-10">
                          <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full animate-pulse" />
                          <Loader2 className="animate-spin text-emerald-500 relative z-10" size={80} strokeWidth={1.5} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Zap className="text-emerald-400 animate-bounce" size={28} />
                          </div>
                        </div>
                        <h4 className="font-black text-3xl text-white mb-3 italic tracking-tight font-display">Consulting the Oracle</h4>
                        <p className="text-slate-400 font-medium max-w-[200px] mx-auto">Synthesizing real-time climate vibes and hyper-local data...</p>
                      </div>
                    ) : currentContent && (
                      <div className="space-y-10">
                        {currentContent.numerical_weather && (
                          <WeatherCard data={currentContent.numerical_weather} />
                        )}

                        {currentContent.forecast && (
                          <section className="space-y-4">
                            <div className="flex items-center gap-3 text-blue-400">
                              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                                <Cloud size={18} />
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-[0.3em]">3-Day Forecast</span>
                            </div>
                            <ForecastCard forecast={currentContent.forecast} />
                          </section>
                        )}

                        <div className="p-8 bg-gradient-to-br from-emerald-500/10 to-emerald-600/20 rounded-[2.5rem] border border-emerald-500/20 relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
                            <Globe size={100} />
                          </div>
                          <div className="flex items-center justify-between mb-6 relative z-10">
                            <RiskBadge level={currentContent.risk_level} />
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">{currentContent.language_used}</span>
                          </div>
                          <h4 className="font-black text-3xl text-white leading-[1.1] mb-2 italic tracking-tight font-display relative z-10">"{currentContent.headline}"</h4>
                        </div>

                        <section className="space-y-4">
                          <div className="flex items-center gap-3 text-emerald-400">
                            <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                              <Wind size={18} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em]">The Weather Vibe</span>
                          </div>
                          <p className="text-lg text-slate-300 leading-relaxed font-medium pl-1">{currentContent.weather_summary}</p>
                        </section>

                        <section className="space-y-6">
                          <div className="flex items-center gap-3 text-red-400">
                            <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
                              <AlertTriangle size={18} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Climate Risks</span>
                          </div>
                          <div className="grid gap-4">
                            {currentContent.climate_risks.map((risk, i) => (
                              <motion.div 
                                key={i}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="flex gap-5 p-5 bg-slate-800/40 rounded-3xl border border-white/5 items-center hover:bg-slate-800/60 transition-colors group"
                              >
                                <span className="w-10 h-10 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center font-black text-sm shrink-0 group-hover:scale-110 transition-transform">{i+1}</span>
                                <p className="text-base font-bold text-slate-200 leading-tight">{risk}</p>
                              </motion.div>
                            ))}
                          </div>
                        </section>

                        <section className="p-8 bg-slate-800/30 rounded-[2.5rem] border border-white/5 relative overflow-hidden">
                          <div className="absolute -bottom-10 -right-10 opacity-5">
                            <Globe size={200} />
                          </div>
                          <p className="text-xl text-white font-bold italic leading-relaxed relative z-10 tracking-tight">
                            {currentContent.awareness_message}
                          </p>
                        </section>

                        <section className="space-y-6">
                          <div className="flex items-center gap-3 text-emerald-400">
                            <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                              <CheckCircle2 size={18} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Take Action</span>
                          </div>
                          <div className="space-y-4">
                            {currentContent.behavioral_tips.map((tip, i) => {
                              const isCommitted = userActions.some(a => a.tip === tip);
                              return (
                                <motion.button 
                                  key={i}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: 0.5 + i * 0.1 }}
                                  onClick={() => handleCommit(tip)}
                                  disabled={isCommitted}
                                  className={cn(
                                    "w-full text-left p-5 rounded-[1.5rem] border-2 transition-all duration-300 text-base flex items-center justify-between group relative overflow-hidden",
                                    isCommitted 
                                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                                      : "bg-slate-800/40 border-transparent hover:border-emerald-500/30 hover:bg-emerald-500/5 text-slate-300 shadow-lg"
                                  )}
                                >
                                  <span className="font-bold relative z-10 pr-4">{tip}</span>
                                  {isCommitted ? (
                                    <CheckCircle2 size={24} className="shrink-0 text-emerald-500 relative z-10" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all shrink-0 relative z-10">
                                      <ChevronRight size={20} />
                                    </div>
                                  )}
                                </motion.button>
                              );
                            })}
                          </div>
                        </section>

                        <div className="pt-10 border-t border-white/5 flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
                          <span>Readability: {currentContent.readability_score}%</span>
                          <span>Updated: {new Date(currentContent.createdAt || Date.now()).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {view === 'history' && (
            <div className="p-10 max-w-6xl mx-auto h-full overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {history.map(item => (
                  <motion.div 
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -5 }}
                    className="bg-[#1e293b] p-8 rounded-[2rem] border border-white/5 shadow-2xl group cursor-pointer"
                    onClick={() => {
                      setCurrentContent(item);
                      setView('map');
                    }}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-emerald-400" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.city}</span>
                      </div>
                      <RiskBadge level={item.risk_level} />
                    </div>
                    <h4 className="font-black text-xl text-white mb-4 italic leading-tight group-hover:text-emerald-400 transition-colors">"{item.headline}"</h4>
                    <p className="text-sm text-slate-400 line-clamp-3 mb-6 font-medium leading-relaxed">{item.awareness_message}</p>
                    <div className="flex items-center justify-between pt-6 border-t border-white/5">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{new Date(item.createdAt).toLocaleDateString()}</span>
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {view === 'dashboard' && (
            <div className="p-6 md:p-10 max-w-6xl mx-auto h-full overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-10">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-br from-indigo-500/20 to-purple-600/30 p-8 rounded-[2.5rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden group"
                >
                  <Globe className="absolute -bottom-4 -right-4 opacity-10 group-hover:scale-110 transition-transform duration-700" size={100} />
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-2">Generations</p>
                  <p className="text-6xl font-black text-white italic tracking-tighter font-display">{history.length}</p>
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-gradient-to-br from-emerald-500/20 to-teal-600/30 p-8 rounded-[2.5rem] border border-emerald-500/20 shadow-2xl relative overflow-hidden group"
                >
                  <CheckCircle2 className="absolute -bottom-4 -right-4 opacity-10 group-hover:scale-110 transition-transform duration-700" size={100} />
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-2">Commitments</p>
                  <p className="text-6xl font-black text-white italic tracking-tighter font-display">{userActions.length}</p>
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-gradient-to-br from-blue-500/20 to-cyan-600/30 p-8 rounded-[2.5rem] border border-blue-500/20 shadow-2xl relative overflow-hidden group"
                >
                  <Wind className="absolute -bottom-4 -right-4 opacity-10 group-hover:scale-110 transition-transform duration-700" size={100} />
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-2">Avg Score</p>
                  <p className="text-6xl font-black text-white italic tracking-tighter font-display">
                    {history.length ? Math.round(history.reduce((a, b) => a + b.readability_score, 0) / history.length) : 0}%
                  </p>
                </motion.div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                <div className="bg-slate-900/50 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
                  <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                      <AlertTriangle size={20} className="text-red-400" />
                    </div>
                    <h4 className="font-black text-white italic text-2xl tracking-tight font-display">Risk Distribution</h4>
                  </div>
                  <div className="space-y-8">
                    {['Low', 'Medium', 'High', 'Critical'].map(level => {
                      const count = history.filter(h => h.risk_level === level).length;
                      const pct = history.length ? (count / history.length) * 100 : 0;
                      return (
                        <div key={level}>
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em] mb-3">
                            <span className={cn(
                              level === 'Critical' ? "text-red-400" : 
                              level === 'High' ? "text-orange-400" : 
                              level === 'Medium' ? "text-yellow-400" : "text-emerald-400"
                            )}>{level}</span>
                            <span className="text-slate-500">{count} reports</span>
                          </div>
                          <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className={cn(
                                "h-full rounded-full relative",
                                level === 'Critical' ? "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]" : 
                                level === 'High' ? "bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]" : 
                                level === 'Medium' ? "bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.4)]" : "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                              )}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent" />
                            </motion.div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-900/50 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
                  <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                      <UsersIcon size={20} className="text-emerald-400" />
                    </div>
                    <h4 className="font-black text-white italic text-2xl tracking-tight font-display">Audience Reach</h4>
                  </div>
                  <div className="space-y-8">
                    {['General Public', 'Students', 'Farmers', 'Urban Professionals', 'Policy Makers'].map(aud => {
                      const count = history.filter(h => h.audience === aud).length;
                      const pct = history.length ? (count / history.length) * 100 : 0;
                      return (
                        <div key={aud}>
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em] mb-3">
                            <span className="text-slate-300">{aud}</span>
                            <span className="text-emerald-400">{count}</span>
                          </div>
                          <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)] rounded-full relative"
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent" />
                            </motion.div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

