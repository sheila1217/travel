import React, { useState, useEffect } from "react";
import { 
  collection, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  getDoc,
  getDocs,
  query,
  where,
  getDocFromServer
} from "firebase/firestore";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User 
} from "firebase/auth";
import { db, auth } from "./firebase";

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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
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
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = () => signOut(auth);

  const [startDate, setStartDate] = useState("2024-06-01");

  useEffect(() => {
    if (!user) return;

    const initialFlights = [
      {
        id: "flight-go",
        day: 1,
        type: "flight",
        title: "IT772",
        fromAirport: "KHH",
        toAirport: "SDJ",
        startTime: "13:25",
        endTime: "18:10",
        note: "座席 6B / 6A 行李託運 20kg",
        paymentStatus: "paid"
      },
      {
        id: "flight-back",
        day: 8,
        type: "flight",
        title: "IT773",
        fromAirport: "SDJ",
        toAirport: "KHH",
        startTime: "19:00",
        endTime: "22:10",
        note: "座席 5F / 5E 行李託運 25kg",
        paymentStatus: "paid"
      }
    ];

    const unsubItinery = onSnapshot(collection(db, "itinerary"), (snapshot) => {
      if (snapshot.empty) {
        initialFlights.forEach(f => setDoc(doc(db, "itinerary", f.id), f));
      }
      setItems(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
    }, (error) => handleFirestoreError(error, OperationType.GET, "itinerary"));

    const unsubShopping = onSnapshot(collection(db, "shopping"), (snapshot) => {
      setShoppingItems(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
    }, (error) => handleFirestoreError(error, OperationType.GET, "shopping"));

    const unsubPreps = onSnapshot(collection(db, "preparations"), (snapshot) => {
      setPreparations(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
    }, (error) => handleFirestoreError(error, OperationType.GET, "preparations"));

    const unsubStrategies = onSnapshot(collection(db, "strategies"), (snapshot) => {
      setStrategies(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
    }, (error) => handleFirestoreError(error, OperationType.GET, "strategies"));

    const unsubSettings = onSnapshot(doc(db, "settings", "global"), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.exchangeRate) setExchangeRate(data.exchangeRate);
        if (data.totalBudgetNTD) setTotalBudgetNTD(data.totalBudgetNTD);
        if (data.startDate) setStartDate(data.startDate);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, "settings/global"));

    return () => {
      unsubItinery();
      unsubShopping();
      unsubPreps();
      unsubStrategies();
      unsubSettings();
    };
  }, [user]);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    if (user) testConnection();
  }, [user]);

  const tabs = ["行程", "花費", "購物", "準備"];
  const [preparations, setPreparations] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [shoppingItems, setShoppingItems] = useState<any[]>([]);
  const [exchangeRate, setExchangeRate] = useState(0.223);
  const [totalBudgetNTD, setTotalBudgetNTD] = useState(80000);
  const [activeTab, setActiveTab] = useState("行程");
  const [weather, setWeather] = useState<any>(null);
  const CASH_RATE = 0.2007;
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [currentDay, setCurrentDay] = useState(1);

  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=38.2682&longitude=140.8694&current_weather=true")
      .then(res => res.json())
      .then(data => {
        if (data && data.current_weather) {
          setWeather(data.current_weather);
        }
      })
      .catch(err => console.error("Weather fetch failed", err));
  }, []);

  useEffect(() => {
    const fetchRate = async () => {
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/JPY');
        const data = await response.json();
        if (data && data.rates && data.rates.TWD) {
          const newRate = data.rates.TWD;
          // Only update if fundamentally different or if we want to keep it fresh
          // Maybe update Firestore if user is admin or if we want auto-sync
          if (user) {
            await setDoc(doc(db, "settings", "global"), { exchangeRate: newRate }, { merge: true });
          }
        }
      } catch (error) {
        console.error("無法取得即時匯率，將使用預設值:", error);
      }
    };
    if (user) fetchRate();
  }, [user]);

  const getEffectiveRate = (method: string) => {
    return (method === "現金" || method === "Cash") ? CASH_RATE : exchangeRate;
  };


  const getDayDate = (day: number) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + (day - 1));
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const getDayOfWeek = (day: number) => {
    const days = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
    const date = new Date(startDate);
    date.setDate(date.getDate() + (day - 1));
    return days[date.getDay()];
  };

  const openMap = (address: string) => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
      "_blank"
    );
  };

  // 修改：將 confirm 代碼註解掉或優化，因為 iFrame 常會擋掉 window.confirm
  const handleDelete = async (id: string | number) => {
    if (!user) return;
    const path = `itinerary/${id}`;
    try {
      await deleteDoc(doc(db, "itinerary", String(id)));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const timeToMinutes = (time: string) => {
    if (!time) return 0;
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };

  const minutesToTime = (min: number) => {
    const h = (Math.floor(min / 60) + 24) % 24;
    const m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const formatDuration = (min: number) => {
    if (min <= 0) return "0分";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0) {
      return `${h}小時${m > 0 ? `${m}分` : ""}`;
    }
    return `${m}分`;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 限制檔案大小約 1MB 以免 localStorage 爆掉 (Base64)
      if (file.size > 1024 * 1024) {
        alert("圖片太大了，請選擇小於 1MB 的照片喔！");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingItem({ ...editingItem, image: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const parsePriceRange = (priceStr: string | number) => {
    if (typeof priceStr === 'number') return priceStr;
    if (!priceStr) return 0;
    // Handle ranges like "2000-2300" by taking the average or the first number
    const numbers = priceStr.toString().match(/\d+/g);
    if (!numbers) return 0;
    if (numbers.length >= 2) {
      return (Number(numbers[0]) + Number(numbers[1])) / 2;
    }
    return Number(numbers[0]) || 0;
  };

  const syncShoppingToCost = async (shopItem: any) => {
    if (!user) return;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const id = `shop-cost-${shopItem.id}`;
    
    try {
      await setDoc(doc(db, "itinerary", id), {
        day: currentDay,
        type: "expense",
        title: `🛍️ ${shopItem.title}`,
        cost: shopItem.actualPrice || shopItem.normalPrice,
        time: timeStr,
        paymentMethod: shopItem.paymentMethod || "現金",
        paymentStatus: "paid",
        category: "購物",
        isShoppingSync: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `itinerary/${id}`);
    }
  };

  const removeShoppingFromCost = async (shopItemId: string) => {
    if (!user) return;
    const id = `shop-cost-${shopItemId}`;
    try {
      await deleteDoc(doc(db, "itinerary", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `itinerary/${id}`);
    }
  };

  const handleSave = async () => {
    if (!editingItem || !user) return;

    try {
      if (editingItem.type === "preparation") {
        const id = editingItem.id || Math.random().toString(36).substring(2, 9) + Date.now();
        await setDoc(doc(db, "preparations", id), { ...editingItem, id });
        setEditingItem(null);
        return;
      }

      if (editingItem.type === "strategy") {
        const id = editingItem.id || Math.random().toString(36).substring(2, 9) + Date.now();
        await setDoc(doc(db, "strategies", id), { ...editingItem, id });
        setEditingItem(null);
        return;
      }

      if (editingItem.type === "shopping") {
        const id = editingItem.id || Math.random().toString(36).substring(2, 9) + Date.now();
        const updatedItem = { ...editingItem, id };
        
        const oldItem = shoppingItems.find(it => it.id === id);
        if (!oldItem) {
          // New shopping item
          await setDoc(doc(db, "shopping", id), updatedItem);
          if (updatedItem.status === "bought") {
            await syncShoppingToCost(updatedItem);
          }
        } else {
          // Update existing
          if (oldItem.status !== "bought" && updatedItem.status === "bought") {
            await syncShoppingToCost(updatedItem);
          } else if (oldItem.status === "bought" && updatedItem.status !== "bought") {
            await removeShoppingFromCost(id);
          }
          await setDoc(doc(db, "shopping", id), updatedItem);
        }
        setEditingItem(null);
        return;
      }

      // Itinerary Save
      let updatedItem = { ...editingItem };

      if (updatedItem.type === "spot") {
        const start = timeToMinutes(updatedItem.arrivalTime || "00:00");
        const end = timeToMinutes(updatedItem.leaveTime || "00:00");
        updatedItem.duration = end - start;
      } else if (updatedItem.type === "hotel" || updatedItem.type === "restaurant" || updatedItem.type === "flight") {
        updatedItem.duration = 0;
      } else if (updatedItem.type === "transport") {
        const start = timeToMinutes(updatedItem.startTime || "00:00");
        const end = timeToMinutes(updatedItem.endTime || "00:00");
        updatedItem.duration = end - start;
      }

      const id = updatedItem.id || Math.random().toString(36).substring(2, 9) + Date.now();
      updatedItem.id = id;
      updatedItem.day = updatedItem.day || currentDay;

      await setDoc(doc(db, "itinerary", String(id)), updatedItem);
      setEditingItem(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "save_operation");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fffafc]">
        <div className="animate-spin text-4xl">✈️</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#fffafc] p-6 text-center">
        <div className="w-24 h-24 bg-pink-100 rounded-full flex items-center justify-center text-4xl mb-6 shadow-lg shadow-pink-100">🗺️</div>
        <h1 className="text-3xl font-black text-slate-900 mb-2">旅程共同編輯</h1>
        <p className="text-gray-500 mb-8 font-bold leading-relaxed">登入後即可與好友同步更新行程與花費！</p>
        <button 
          onClick={login}
          className="w-full max-w-xs bg-slate-900 text-white font-black py-4 rounded-3xl shadow-xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-95 transition-all outline-none"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          使用 Google 帳號登入
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#fffafc] min-h-screen max-w-[430px] mx-auto pb-28 font-sans">
      <header className="px-4 pt-5 pb-4 bg-white sticky top-0 z-50 border-b border-pink-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-[28px] font-black text-slate-900 leading-none">
                {getDayDate(1)} - {getDayDate(8)}
              </h1>
              <p className="text-pink-500 font-black mt-1 text-[14px]">
                仙台、青森自由行
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 min-w-[120px]">
             <div className="flex items-center gap-2 mb-1">
               <span className="text-[10px] font-black text-slate-400 truncate max-w-[80px]">{user.displayName || user.email}</span>
               <button onClick={logout} className="text-[10px] font-black text-pink-500 bg-pink-50 px-2 py-0.5 rounded-full hover:bg-pink-100 transition-colors">登出</button>
             </div>
             {weather && (
               <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-full px-3 py-1 cursor-default hover:bg-blue-100 transition-colors">
                 <span className="text-[10px] font-black text-blue-600">仙台</span>
                 <span className="text-xs">
                   {weather.weathercode <= 3 ? "☀️" : weather.weathercode <= 48 ? "☁️" : weather.weathercode <= 67 ? "🌧️" : "❄️"}
                 </span>
                 <span className="text-[11px] font-black text-slate-700">{Math.round(weather.temperature)}°C</span>
               </div>
             )}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black text-pink-400">當天匯率</span>
              <span className="text-[9px] bg-pink-100 text-pink-500 px-1 rounded font-bold animate-pulse">AUTO</span>
            </div>
            {isEditingRate ? (
              <div className="flex items-center gap-1 bg-pink-50 border border-pink-200 rounded-xl px-2 py-1">
                <span className="text-[10px] font-bold text-gray-500">JPY 1 = TWD</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  className="w-16 bg-white border border-pink-200 rounded-lg px-1 text-[11px] font-bold outline-none"
                  value={exchangeRate}
                  onChange={(e) => {
                    const newRate = parseFloat(e.target.value) || 0;
                    setExchangeRate(newRate);
                    setDoc(doc(db, "settings", "global"), { exchangeRate: newRate }, { merge: true })
                      .catch(err => handleFirestoreError(err, OperationType.WRITE, "settings/global"));
                  }}
                  onBlur={() => setIsEditingRate(false)}
                  autoFocus
                />
              </div>
            ) : (
              <button 
                onClick={() => setIsEditingRate(true)}
                className="bg-pink-50 border border-pink-200 rounded-2xl px-3 py-2 text-[11px] font-bold text-gray-700 shadow-sm"
              >
                JPY 1 = TWD {exchangeRate} ✏️
              </button>
            )}
          </div>
        </div>
      </header>

      {(activeTab === "行程" || activeTab === "花費") && (
        <div className="flex gap-3 px-4 py-3 overflow-x-auto no-scrollbar bg-white sticky top-[76px] z-30 border-b border-pink-50">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => (
            <button
              key={day}
              onClick={() => setCurrentDay(day)}
              className={`w-14 h-16 rounded-2xl shrink-0 flex flex-col items-center justify-center gap-0.5 transition-all ${
                currentDay === day
                  ? "bg-pink-500 text-white shadow-lg shadow-pink-200 scale-105"
                  : "bg-white text-gray-400 border border-pink-100"
              }`}
            >
              <span className="text-[10px] font-bold opacity-80">{getDayDate(day)}</span>
              <span className="text-sm font-black italic">D{day}</span>
              <span className="text-[9px] font-bold">{getDayOfWeek(day)}</span>
            </button>
          ))}
        </div>
      )}

      <main className="px-4 pt-4 pb-32 overflow-y-auto">
        {activeTab === "行程" && (
          <div className="space-y-4">
            {items.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p>這一天還沒有行程，點擊下方的 + 開始新增吧！</p>
              </div>
            )}
            
            {(() => {
              const dayItemsAll = items.filter((item) => item.day === currentDay);
              
              let fixedTop: any[] = [];
              let fixedBottom: any[] = [];
              let sortedItems: any[] = [];

              if (currentDay === 1) {
                fixedTop = dayItemsAll.filter(item => item.type === "flight");
                sortedItems = dayItemsAll.filter(item => item.type !== "flight")
                  .sort((a, b) => timeToMinutes(a.arrivalTime || a.startTime || a.time) - timeToMinutes(b.arrivalTime || b.startTime || b.time));
              } else if (currentDay === 8) {
                fixedBottom = dayItemsAll.filter(item => item.type === "flight");
                sortedItems = dayItemsAll.filter(item => item.type !== "flight")
                  .sort((a, b) => timeToMinutes(a.arrivalTime || a.startTime || a.time) - timeToMinutes(b.arrivalTime || b.startTime || b.time));
              } else {
                sortedItems = dayItemsAll.sort((a, b) => timeToMinutes(a.arrivalTime || a.startTime || a.time) - timeToMinutes(b.arrivalTime || b.startTime || b.time));
              }

              const formatTime12h = (time: string) => {
                if (!time) return "";
                const [h, m] = time.split(":").map(Number);
                const period = h < 12 ? "上午" : "下午";
                const h12 = h % 12 || 12;
                return `${period} ${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
              };

              const renderItem = (item: any) => {
                if (item.type === "flight") {
                  return (
                    <div key={item.id} className="relative group">
                      <div className="bg-gradient-to-br from-pink-400 via-pink-600 to-orange-400 rounded-[35px] p-6 shadow-xl shadow-pink-200 overflow-hidden relative border-2 border-white/20">
                        <div className="absolute -right-6 -bottom-6 opacity-10 text-[140px] rotate-[-15deg]">✈️</div>
                        <div className="flex items-center justify-between relative z-10">
                          <div className="text-center flex-1">
                            <p className="text-[14px] font-black text-white/90 tracking-widest mb-2">{item.fromAirport || "TPE"}</p>
                            <div className="h-px w-full bg-white/30 mb-3"></div>
                            <h3 className="text-[26px] font-black text-white leading-none mb-1">{formatTime12h(item.startTime).replace(": ", ":")}</h3>
                          </div>
                          <div className="flex flex-col items-center gap-2 px-6 flex-1">
                            <div className="text-[12px] font-black text-white px-3 py-1 rounded-full bg-white/20 backdrop-blur-md mb-2">{item.flightNo || "BR118"}</div>
                            <div className="flex items-center gap-2 w-full">
                              <div className="h-[2px] bg-white/40 flex-1 rounded-full"></div>
                              <span className="text-white text-2xl animate-pulse">✈️</span>
                              <div className="h-[2px] bg-white/40 flex-1 rounded-full"></div>
                            </div>
                          </div>
                          <div className="text-center flex-1">
                            <p className="text-[14px] font-black text-white/90 tracking-widest mb-2">{item.toAirport || "SDJ"}</p>
                            <div className="h-px w-full bg-white/30 mb-3"></div>
                            <h3 className="text-[26px] font-black text-white leading-none mb-1">{formatTime12h(item.endTime).replace(": ", ":")}</h3>
                          </div>
                        </div>
                      </div>
                      <div className="absolute -top-3 left-6 bg-white text-pink-600 text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg border border-pink-100 z-10 flex items-center gap-1.5"><span className="animate-bounce">📌</span> 固定航班資訊</div>
                    </div>
                  );
                }
                if (item.type === "spot") {
                  return (
                    <div key={item.id} className="flex gap-3">
                      <div className="w-[64px] flex flex-col items-center shrink-0">
                        <div className="w-9 h-9 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center shadow-sm text-sm">📍</div>
                        <p className="text-pink-500 font-black text-[15px] mt-2 leading-none">{item.arrivalTime}</p>
                        <div className="text-center my-2 text-gray-400 font-semibold leading-4 text-[10px]">
                          <p>停留</p>
                          <p>{formatDuration(item.duration)}</p>
                          <p>↓</p>
                        </div>
                        <p className="text-pink-500 font-black text-[15px] leading-none">{item.leaveTime}</p>
                        <div className="w-[2px] bg-gray-200 flex-1 mt-3 rounded-full"></div>
                      </div>
                      <div className="flex-1 bg-white border border-pink-100 rounded-[28px] p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <span className="bg-pink-100 text-pink-500 px-3 py-1 rounded-2xl text-[10px] font-black inline-block mb-2">景點</span>
                            <h2 className="text-[22px] font-black text-slate-900 leading-tight">{item.title}</h2>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            {item.paymentStatus === "paid" && (
                              <span className="bg-green-100 text-green-600 px-2 py-1 rounded-xl text-[9px] font-black self-start">已付</span>
                            )}
                            <button onClick={() => setEditingItem(item)} className="w-8 h-8 rounded-xl bg-pink-100 text-xs shadow-sm">✏️</button>
                            <button onClick={() => handleDelete(item.id)} className="w-8 h-8 rounded-xl bg-red-100 text-xs shadow-sm">🗑️</button>
                          </div>
                        </div>
                        <div className="bg-pink-50 border border-pink-100 rounded-2xl px-3 py-3 flex items-center justify-between gap-2 mb-3">
                          <p className="font-semibold text-gray-700 text-[13px] break-all">{item.address}</p>
                          <button onClick={() => openMap(item.address)} className="w-8 h-8 rounded-xl bg-white border border-yellow-200 text-sm shrink-0 shadow-sm">🗺️</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3">
                            <p className="text-blue-500 font-black text-[10px] mb-1">Map Code</p>
                            <p className="text-[13px] font-black text-slate-800">{item.mapCode}</p>
                          </div>
                          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-3">
                            <p className="text-purple-500 font-black text-[10px] mb-1">金額 ({item.paymentMethod || "現金"})</p>
                            <p className="text-[13px] font-black text-slate-800">¥{item.cost?.toLocaleString() || 0}</p>
                          </div>
                        </div>
                        <button onClick={() => setSelectedNote(item.note)} className="w-full bg-pink-50 border border-pink-100 rounded-2xl px-3 py-3 flex items-center justify-between gap-3">
                          <div className="text-left min-w-0">
                            <p className="text-pink-500 font-black text-[10px] mb-1">備註 / 停車資訊</p>
                            <p className="font-semibold text-gray-700 text-[13px] truncate">{item.note}</p>
                          </div>
                          <div className="text-pink-500 font-black text-[10px] shrink-0">有備註</div>
                        </button>
                        <div className="flex justify-center pt-2">
                          <button onClick={() => setEditingItem({ type: "transport", transportType: "地鐵/JR", startTime: "10:00", endTime: "11:00", route: "", note: "", cost: 0, segments: [{ from: "", to: "", lineName: "" }], insertAfterId: item.id })} className="text-pink-400 text-[11px] font-black">＋交通</button>
                        </div>
                      </div>
                    </div>
                  );
                }
                if (item.type === "transport") {
                  return (
                    <div key={item.id} className="flex gap-3">
                      <div className="w-[64px] flex flex-col items-center shrink-0">
                        <div className="w-9 h-9 rounded-full bg-yellow-50 border border-yellow-200 flex items-center justify-center shadow-sm text-sm">🚆</div>
                        <p className="text-yellow-600 font-black text-[15px] mt-2 leading-none">{item.startTime}</p>
                        <div className="text-center my-2 text-gray-400 font-semibold leading-4 text-[10px]">
                          <p>{formatDuration(item.duration)}</p>
                          <p>↓</p>
                        </div>
                        <p className="text-yellow-600 font-black text-[15px] leading-none">{item.endTime}</p>
                        <div className="w-[2px] bg-gray-200 flex-1 mt-3 rounded-full"></div>
                      </div>
                      <div className="flex-1 bg-[#fffaf0] border border-yellow-200 rounded-[24px] p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-2 flex-wrap"><span className="bg-yellow-200 text-yellow-800 px-2.5 py-1 rounded-full text-[10px] font-black">交通</span><span className="text-gray-500 font-bold text-[12px]">{item.transportType}</span></div>
                            <div className="space-y-1">
                              {item.segments && item.segments.length > 0 ? (item.segments.map((seg: any, idx: number) => (
                                <div key={idx} className="flex flex-col gap-0.5 bg-white/50 rounded-xl p-2 border border-yellow-100">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${item.transportType === "自駕" ? "text-orange-600 bg-orange-100" : "text-yellow-600 bg-yellow-100"}`}>{seg.lineName || (item.transportType === "自駕" ? "路段" : "線路")}</span>
                                    <span className="text-[13px] font-black text-slate-800 break-words">{seg.from} {seg.from || seg.to ? "→" : ""} {seg.to}</span>
                                  </div>
                                </div>
                              ))) : (<p className="text-[14px] font-black text-slate-800 leading-relaxed">{item.transportType === "自駕" ? "🚗 自駕行程" : (item.route || "尚無路線資訊")}</p>)}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => setEditingItem(item)} className="w-8 h-8 rounded-xl bg-yellow-100 text-xs shadow-sm">✏️</button>
                            <button onClick={() => handleDelete(item.id)} className="w-8 h-8 rounded-xl bg-orange-100 text-xs shadow-sm">🗑️</button>
                          </div>
                        </div>
                        {item.note && (
                          <div className="flex flex-col gap-2 border-t border-yellow-100/50 mt-3 pt-3">
                            <p className="text-gray-500 font-semibold text-[12px] leading-relaxed break-words">
                              <span className="text-yellow-600 font-black">備註：</span>{item.note}
                            </p>
                          </div>
                        )}
                        <p className="text-[18px] font-black text-slate-900 text-right mt-2">¥{item.cost?.toLocaleString() || 0}</p>
                      </div>
                    </div>
                  );
                }
                if (item.type === "restaurant") {
                  return (
                    <div key={item.id} className="flex gap-3">
                      <div className="w-[64px] flex flex-col items-center shrink-0">
                        <div className="w-9 h-9 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center shadow-sm text-sm">🍱</div>
                        <div className="text-center mt-3 leading-5">
                          <p className="text-orange-500 font-black text-[15px]">{item.time}</p>
                        </div>
                        <div className="w-[2px] bg-gray-200 flex-1 mt-3 rounded-full"></div>
                      </div>
                      <div className="flex-1 bg-white border border-orange-100 rounded-[28px] p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <span className="bg-orange-100 text-orange-500 px-3 py-1 rounded-2xl text-[10px] font-black inline-block mb-2">美食攻略</span>
                            <h2 className="text-[22px] font-black text-slate-900 leading-tight">{item.title || "午餐候選"}</h2>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => setEditingItem(item)} className="w-8 h-8 rounded-xl bg-orange-100 text-xs shadow-sm">✏️</button>
                            <button onClick={() => handleDelete(item.id)} className="w-8 h-8 rounded-xl bg-red-100 text-xs shadow-sm">🗑️</button>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {(item.options || []).map((opt: any, idx: number) => (
                            <div key={idx} className="bg-orange-50/50 border border-orange-100 rounded-2xl p-3">
                              <div className="flex justify-between items-start gap-2">
                                <div>
                                  <p className="text-[14px] font-black text-slate-800 mb-1">{opt.name}</p>
                                  <p className="text-[11px] font-bold text-gray-500 leading-tight">{opt.address}</p>
                                  {opt.mapCode && (<p className="text-[10px] font-black text-blue-400 mt-1">MC: {opt.mapCode}</p>)}
                                </div>
                                <button onClick={() => openMap(opt.address)} className="w-8 h-8 rounded-xl bg-white border border-orange-200 text-sm shrink-0 shadow-sm flex items-center justify-center">📍</button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 bg-gray-50 rounded-2xl p-3 flex justify-between items-center">
                          <span className="text-[10px] font-black text-gray-400">預估預算</span>
                          <span className="text-[13px] font-black text-slate-800">¥{item.cost}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                if (item.type === "hotel") {
                  return (
                    <div key={item.id} className="flex gap-3">
                      <div className="w-[64px] flex flex-col items-center shrink-0">
                        <div className="w-9 h-9 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center shadow-sm text-sm">🏨</div>
                        <div className="text-center mt-3 leading-5">
                          <p className="text-purple-500 font-black text-[15px]">{item.time}</p>
                        </div>
                      </div>
                      <div className="flex-1 bg-white border border-purple-100 rounded-[28px] p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <span className="bg-purple-100 text-purple-500 px-3 py-1 rounded-2xl text-[10px] font-black inline-block mb-2">住宿</span>
                            <h2 className="text-[22px] font-black text-slate-900 leading-tight">{item.title}</h2>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <span className={`text-[9px] font-black px-2 py-1 rounded-xl ${item.paymentStatus === "paid" ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                              {item.paymentStatus === "paid" ? "已付款" : "未付款"}
                            </span>
                            <button onClick={() => setEditingItem(item)} className="w-8 h-8 rounded-xl bg-purple-100 text-xs shadow-sm">✏️</button>
                            <button onClick={() => handleDelete(item.id)} className="w-8 h-8 rounded-xl bg-red-100 text-xs shadow-sm">🗑️</button>
                          </div>
                        </div>
                        <div className="bg-purple-50 border border-purple-100 rounded-2xl px-3 py-3 flex items-center justify-between gap-2 mb-3">
                          <p className="font-semibold text-gray-700 text-[13px] break-all">{item.address}</p>
                          <button onClick={() => openMap(item.address)} className="w-8 h-8 rounded-xl bg-white border border-purple-200 text-sm shrink-0 shadow-sm">📍</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3">
                            <p className="text-blue-500 font-black text-[10px] mb-1">Map Code</p>
                            <p className="text-[13px] font-black text-slate-800">{item.mapCode}</p>
                          </div>
                          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-3">
                            <p className="text-purple-500 font-black text-[10px] mb-1">金額 ({item.paymentMethod || "現金"})</p>
                            <p className="text-[13px] font-black text-slate-800">
                              ¥{Math.round(item.isNTD ? (item.cost || 0) / exchangeRate : (item.cost || 0)).toLocaleString()}
                              {item.isNTD && <span className="text-[10px] ml-1 text-slate-400 font-bold">(NT${item.cost})</span>}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 mb-3">
                            <div className="bg-pink-50 border border-pink-100 rounded-2xl p-3 flex justify-between items-center">
                              <div className="flex flex-col">
                                <span className="text-pink-500 font-black text-[10px]">訂房人 / 房型</span>
                                <span className="text-[13px] font-black text-slate-800">{item.bookingPerson} | {item.roomType}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-pink-400 font-black text-[10px]">平台</span>
                                <span className="text-[13px] font-black text-slate-800">{item.bookingPlatform}</span>
                              </div>
                            </div>
                        </div>
                        <button onClick={() => setSelectedNote(item.note)} className="w-full bg-purple-50 border border-purple-100 rounded-2xl px-3 py-3 flex items-center justify-between gap-3">
                          <div className="text-left min-0">
                            <p className="text-purple-500 font-black text-[10px] mb-1">備註 / 停車資訊</p>
                            <p className="font-semibold text-gray-700 text-[13px] truncate">{item.note}</p>
                          </div>
                          <div className="text-purple-500 font-black text-[10px] shrink-0">有備註</div>
                        </button>
                      </div>
                    </div>
                  );
                }
                return null;
              };

              return (
                <div className="space-y-4 pb-20">
                  {fixedTop.map(renderItem)}
                  {sortedItems.map(renderItem)}
                  {fixedBottom.map(renderItem)}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === "花費" && (
          <div className="space-y-6 pb-20 fade-in">
            {/* Persistent Budget Summary Header - Removed sticky here to avoid layout overlap with day selector */}
            <div className="space-y-3 mb-4">
              <div className="bg-white border-2 border-pink-100 rounded-[35px] p-6 shadow-xl shadow-pink-100/50">
                <div className="text-center mb-4">
                  <p className="text-[11px] font-black tracking-widest uppercase">
                    <span className="text-pink-500">¥ {Math.round(totalBudgetNTD / exchangeRate).toLocaleString()}</span>
                    <span className="text-gray-300 mx-2">/</span>
                    <span className="text-gray-400">NT$ {totalBudgetNTD.toLocaleString()}</span>
                  </p>
                  <p className="text-[10px] font-black text-gray-400 mt-0.5">總預算目標 🎯</p>
                </div>

                <div className="flex justify-center items-baseline gap-2 mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[34px] font-black text-slate-900 leading-none">
                      ¥ {(() => {
                        const dayItems = items.filter(it => it.day === currentDay && (it.cost > 0 || it.type === "hotel" || it.type === "expense"));
                        return dayItems.reduce((sum, i) => sum + (i.isNTD ? (Number(i.cost) || 0) / exchangeRate : (Number(i.cost) || 0)), 0).toLocaleString();
                      })()}
                    </span>
                    <span className="text-gray-300 font-bold text-xl">/</span>
                      <span className="text-[20px] font-black text-slate-500">
                        NT$ {(() => {
                          const dayItems = items.filter(it => it.day === currentDay && (it.cost > 0 || it.type === "hotel" || it.type === "expense"));
                          const dayNTDSpent = dayItems.reduce((sum, item) => {
                            const cost = Number(item.cost) || 0;
                            const rate = item.isNTD ? 1 : getEffectiveRate(item.paymentMethod);
                            const ntdBase = item.isNTD ? cost : cost * rate;
                            const isSelfDriveTransport = item.type === "transport" && (item.title?.includes("自駕") || item.transportType === "自駕");
                            const hasFee = item.paymentMethod === "信用卡" || item.paymentMethod === "Card" || isSelfDriveTransport;
                            const fee = hasFee ? ntdBase * 0.015 : 0;
                            return sum + ntdBase + fee;
                          }, 0);
                          return Math.round(dayNTDSpent).toLocaleString();
                        })()}
                      </span>
                  </div>
                </div>

                <div className="bg-slate-100/50 rounded-xl py-1 text-center mb-4">
                  <p className="text-[10px] font-black text-slate-400">D{currentDay} 當日花費概況</p>
                </div>

                {/* Progress Bar - Trip-wide including shopping */}
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-5 border border-gray-50">
                  <div 
                    className="h-full bg-gradient-to-r from-pink-400 to-rose-500 transition-all duration-500"
                    style={{ 
                      width: `${(() => {
                        const tripExpensesJPY = items.reduce((sum, item) => sum + (item.isNTD ? (Number(item.cost) || 0) / exchangeRate : (Number(item.cost) || 0)), 0);
                        const budgetJPY = totalBudgetNTD / exchangeRate;
                        return Math.min(100, (tripExpensesJPY / budgetJPY) * 100);
                      })()}%` 
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-pink-50/50 rounded-2xl p-3 border border-pink-50 flex flex-col items-center">
                    <span className="text-[10px] font-black text-pink-600 uppercase">剩餘日幣</span>
                    <span className="text-[16px] font-black text-pink-600">
                      ¥ {(() => {
                        const tripExpensesJPY = items.reduce((sum, item) => sum + (item.isNTD ? (Number(item.cost) || 0) / exchangeRate : (Number(item.cost) || 0)), 0);
                        return Math.round(totalBudgetNTD / exchangeRate - tripExpensesJPY).toLocaleString();
                      })()}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-50 flex flex-col items-center">
                    <span className="text-[10px] font-black text-slate-600 uppercase">剩餘台幣</span>
                    <span className="text-[16px] font-black text-slate-600">
                      NT$ {(() => {
                        const totalNTDSpent = items.reduce((sum, item) => {
                          const cost = Number(item.cost) || 0;
                          const rate = item.isNTD ? 1 : getEffectiveRate(item.paymentMethod);
                          const ntdBase = item.isNTD ? cost : cost * rate;
                          const isSelfDriveTransport = item.type === "transport" && (item.title?.includes("自駕") || item.transportType === "自駕");
                          const hasFee = item.paymentMethod === "信用卡" || item.paymentMethod === "Card" || isSelfDriveTransport;
                          const fee = hasFee ? ntdBase * 0.015 : 0;
                          return sum + ntdBase + fee;
                        }, 0);
                        return Math.round(totalBudgetNTD - totalNTDSpent).toLocaleString();
                      })()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Expense Summary List - FILTERED BY currentDay */}
            <div className="space-y-4">
              <div className="flex justify-between items-center px-2">
                <h3 className="text-[14px] font-black text-slate-800">D{currentDay} 支付明細 💰</h3>
                <span className="text-[10px] font-bold text-gray-400">匯率: {exchangeRate}</span>
              </div>
              
              {(() => {
                const day = currentDay;
                const dayItems = items.filter(it => it.day === day && (it.cost > 0 || it.type === "hotel" || it.type === "expense"));
                
                if (dayItems.length === 0) {
                  return (
                    <div className="bg-white border-2 border-dashed border-gray-100 rounded-[35px] p-10 text-center">
                      <p className="text-gray-400 text-sm font-bold">今日尚無花費記錄</p>
                    </div>
                  );
                }

                const dayJPYTotal = dayItems.reduce((sum, it) => sum + (Number(it.cost) || 0), 0);
                const dayNTDTotal = dayItems.reduce((sum, it) => {
                  const cost = Number(it.cost) || 0;
                  const ntdBase = cost * exchangeRate;
                  const fee = (it.paymentMethod === "信用卡" || it.paymentMethod === "Card") ? ntdBase * 0.015 : 0;
                  return sum + ntdBase + fee;
                }, 0);

                return (
                  <div key={day} className="bg-white border-2 border-gray-50 rounded-[35px] shadow-sm mb-4">
                    <div className="px-5 pt-4 pb-3 flex justify-between items-center border-b border-gray-50 bg-slate-50/30 rounded-t-[35px]">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-xl bg-pink-500 text-white flex items-center justify-center text-[10px] font-black italic">D{day}</span>
                        <h4 className="text-[13px] font-black text-slate-800">今日花費</h4>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-black text-pink-500 leading-none mb-1">合計 ¥{dayJPYTotal.toLocaleString()}</p>
                        <p className="text-[9px] font-bold text-gray-400">約 NT$ {Math.round(dayNTDTotal).toLocaleString()}</p>
                      </div>
                    </div>
                    
                      <div className="p-4 space-y-3">
                      {dayItems.sort((a,b) => timeToMinutes(a.time || a.arrivalTime || a.startTime || "00:00") - timeToMinutes(b.time || b.arrivalTime || b.startTime || "00:00")).map((it, idx) => {
                        const cost = Number(it.cost) || 0;
                        const rate = it.isNTD ? 1 : getEffectiveRate(it.paymentMethod);
                        const ntdBase = it.isNTD ? cost : cost * rate;
                        const jpyBase = it.isNTD ? cost / exchangeRate : cost; // JPY reference always uses current rate
                        const isSelfDriveTransport = it.type === "transport" && (it.title?.includes("自駕") || it.transportType === "自駕");
                        const hasFee = it.paymentMethod === "信用卡" || it.paymentMethod === "Card" || isSelfDriveTransport;
                        const fee = hasFee ? ntdBase * 0.015 : 0;
                        return (
                          <div key={idx} className="flex gap-4 group items-center">
                            <div className="shrink-0 text-center">
                              <p className="text-[10px] font-black text-slate-400 leading-none">{it.time || it.arrivalTime || it.startTime || "--:--"}</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[14px] font-black text-slate-800 break-words line-clamp-2">{it.title || it.transportType || "未命名項目"}</span>
                                  {hasFee && (
                                    <span className="text-[9px] font-black text-pink-400 bg-pink-50 px-1 rounded">💳</span>
                                  )}
                                  {it.isNTD && <span className="text-[10px] font-black text-blue-400">NTD</span>}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-[14px] font-black text-slate-800 leading-none mb-1">¥{Math.round(jpyBase).toLocaleString()}</p>
                                  <p className="text-[9px] font-bold text-slate-400 leading-none">
                                    NT$ {Math.round(ntdBase).toLocaleString()}
                                    {hasFee && (
                                      <span className="text-rose-500 font-black ml-1">+{Math.round(fee).toLocaleString()}</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => setEditingItem(it)} className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-[10px] transition-all shrink-0">✏️</button>
                              <button onClick={() => handleDelete(it.id)} className="w-8 h-8 rounded-xl bg-red-50 border border-red-100 text-red-400 flex items-center justify-center text-[10px] transition-all shrink-0">🗑️</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === "購物" && (
          <div className="space-y-6 pb-20 fade-in">
            <div className="bg-white border-2 border-pink-100 rounded-[35px] p-6 shadow-xl shadow-pink-100/50">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h3 className="text-xl font-black text-slate-800">購物清單 🛍️</h3>
                  <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">Shopping List</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-pink-400">總預算統計</p>
                  <p className="text-[18px] font-black text-pink-500 leading-none">
                    ¥ {shoppingItems
                      .filter(it => it.includeInBudget)
                      .reduce((sum, it) => sum + (it.status === "bought" ? (Number(it.actualPrice) || 0) : Math.round((parsePriceRange(it.taiwanPrice) || 0) / exchangeRate)), 0)
                      .toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

        <div className="grid grid-cols-1 gap-4">
              {shoppingItems.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-gray-100 rounded-[35px] p-10 text-center">
                  <p className="text-gray-400 text-sm font-bold">目前清單空空如也 🛒</p>
                  <p className="text-gray-300 text-[11px] mt-1">點擊下方按鈕開始加入想買的東西吧！</p>
                </div>
              ) : (
                [...shoppingItems]
                  .sort((a, b) => {
                    if (a.status === "bought" && b.status !== "bought") return 1;
                    if (a.status !== "bought" && b.status === "bought") return -1;
                    return 0;
                  })
                  .map((item) => (
                  <div key={item.id} className={`bg-white border border-pink-50 rounded-[30px] p-4 flex gap-4 relative group shadow-sm transition-all ${item.status === "bought" ? "opacity-50 grayscale bg-slate-50 border-slate-200" : ""}`}>
                    <div className="w-24 h-24 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                      {item.image ? (
                        <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl opacity-20">🎁</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pr-8">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${item.status === "bought" ? "bg-green-500" : "bg-amber-400 animate-pulse"}`}></span>
                        <h4 className="text-[16px] font-black text-slate-800 break-words leading-tight">{item.title}</h4>
                        {!item.includeInBudget && (
                          <span className="text-[9px] font-black bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md">不計入預算</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 mb-2">
                        <div className="flex justify-between items-center text-[11px] font-black">
                          <span className="text-gray-400">日本售價</span>
                          <span className="text-slate-600">¥{item.normalPrice || 0}</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] font-black">
                          <span className="text-pink-400">台灣價 (日幣)</span>
                          <span className="text-pink-500 font-black">¥{Math.round((parsePriceRange(item.taiwanPrice) || 0) / exchangeRate).toLocaleString()}</span>
                        </div>
                        {item.status === "bought" && (
                          <div className="flex justify-between items-center text-[11px] font-black text-green-600 border-t border-green-50 mt-1 pt-1">
                            <span>實付金額</span>
                            <span>¥{Number(item.actualPrice || 0).toLocaleString()} ({item.paymentMethod})</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 border-t border-slate-50 mt-1 pt-1">
                          <span>台灣售價 (當前)</span>
                          <span className="text-right">{item.taiwanPrice || 0}</span>
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-2 mb-2">
                        <p className="text-[10px] text-gray-500 font-bold leading-tight">{item.note || "無備註"}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={async () => {
                            const newStatus = item.status === "bought" ? "to-buy" : "bought";
                            const actualPrice = newStatus === "bought" ? (Number(item.normalPrice) || 0) : 0;
                            const updatedItem = { ...item, status: newStatus, actualPrice };
                            
                            try {
                              await setDoc(doc(db, "shopping", item.id), updatedItem);
                              if (newStatus === "bought") {
                                await syncShoppingToCost(updatedItem);
                              } else {
                                await removeShoppingFromCost(item.id);
                              }
                            } catch (error) {
                              handleFirestoreError(error, OperationType.WRITE, `shopping/${item.id}`);
                            }
                          }}
                          className={`flex-1 py-1.5 rounded-xl text-[10px] font-black transition-all ${
                            item.status === "bought" ? "bg-green-100 text-green-600 shadow-sm" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {item.status === "bought" ? "✓ 已買到" : "尚未購買"}
                        </button>
                      </div>
                    </div>
                    <div className="absolute top-4 right-4 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingItem({ ...item, type: "shopping" })} className="p-2 bg-white rounded-lg border border-pink-100 text-[10px] shadow-sm">✏️</button>
                      <button 
                        onClick={async () => {
                          try {
                            await deleteDoc(doc(db, "shopping", item.id));
                            if (item.status === "bought") {
                              await removeShoppingFromCost(item.id);
                            }
                          } catch (error) {
                            handleFirestoreError(error, OperationType.DELETE, `shopping/${item.id}`);
                          }
                        }}
                        className="p-2 bg-white rounded-lg border border-red-100 text-[10px] shadow-sm text-red-400"
                      >🗑️</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {activeTab === "準備" && (
          <div className="space-y-6 pb-20 fade-in">
            {/* Checklist Section */}
            <div className="bg-white border-2 border-orange-100 rounded-[35px] p-6 shadow-xl shadow-orange-100/50">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                清單檢查 📋 <span className="text-[10px] bg-orange-100 text-orange-500 px-2 py-0.5 rounded-full">Checklist</span>
              </h3>
              
              <div className="mt-4 space-y-4">
                {["準備", "打包"].map(cat => (
                  <div key={cat} className="space-y-2">
                    <p className="text-[11px] font-black text-gray-400 italic flex items-center gap-2">
                      <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                      {cat === "準備" ? "領證與預約" : "行李打包"}
                    </p>
                    {preparations.filter(p => p.category === cat).length === 0 && (
                      <p className="text-[10px] text-gray-300 ml-3">尚無項目</p>
                    )}
                    {preparations.filter(p => p.category === cat).map(p => (
                      <div key={p.id} className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl group">
                        <button 
                          onClick={async () => {
                            try {
                              await updateDoc(doc(db, "preparations", p.id), { done: !p.done });
                            } catch (error) {
                              handleFirestoreError(error, OperationType.UPDATE, `preparations/${p.id}`);
                            }
                          }}
                          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${p.done ? "bg-orange-400 border-orange-400 text-white" : "border-gray-200 bg-white"}`}
                        >
                          {p.done && "✓"}
                        </button>
                        <span className={`text-sm font-bold flex-1 ${p.done ? "text-gray-300 line-through" : "text-slate-700"}`}>
                          {p.title}
                        </span>
                        <button 
                          onClick={async () => {
                            try {
                              await deleteDoc(doc(db, "preparations", p.id));
                            } catch (error) {
                              handleFirestoreError(error, OperationType.DELETE, `preparations/${p.id}`);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-red-300 text-xs p-1"
                        >🗑️</button>
                      </div>
                    ))}
                    <button 
                      onClick={() => setEditingItem({ type: "preparation", category: cat, title: "", done: false })}
                      className="text-[10px] font-black text-orange-400 ml-3 hover:underline"
                    >+ 新增項目</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Travel Strategies Wiki */}
            <div className="space-y-4">
              <div className="flex justify-between items-center px-2">
                <h3 className="text-xl font-black text-slate-800">旅遊攻略 ✨</h3>
                <span className="text-[10px] font-black text-slate-400 animate-pulse">Travel Wiki</span>
              </div>
              
              {strategies.map((s) => (
                <div key={s.id} className="bg-white border border-pink-50 rounded-[35px] overflow-hidden shadow-sm hover:shadow-md transition-shadow relative group">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="text-[17px] font-black text-slate-800 break-words leading-tight">{s.title}</h4>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingItem({ ...s, type: "strategy" })} className="p-2 bg-pink-50 rounded-xl text-[10px]">✏️</button>
                        <button onClick={async () => {
                          try {
                            await deleteDoc(doc(db, "strategies", s.id));
                          } catch (error) {
                            handleFirestoreError(error, OperationType.DELETE, `strategies/${s.id}`);
                          }
                        }} className="p-2 bg-red-50 rounded-xl text-[10px] text-red-400">🗑️</button>
                      </div>
                    </div>
                    
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4">
                      <p className="text-[12px] font-bold text-gray-500 leading-relaxed italic">
                        {s.note || "點擊編輯來添加詳盡的攻略說明..."}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {s.links?.map((link: any, idx: number) => (
                        link.url && (
                          <a 
                            key={idx} 
                            href={link.url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="bg-gradient-to-r from-pink-400 to-orange-300 text-white px-4 py-2 rounded-xl text-[11px] font-black shadow-sm shadow-pink-100 active:scale-95 transition-transform flex items-center gap-1.5"
                          >
                            🔗 {link.label || "開啟網址"}
                          </a>
                        )
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <button
        onClick={() => {
          if (activeTab === "花費") {
            setEditingItem({
              type: "expense",
              title: "",
              time: "12:00",
              cost: 0,
              paymentMethod: "現金",
              paymentStatus: "paid",
            });
          } else if (activeTab === "購物") {
            setEditingItem({
              type: "shopping",
              title: "",
              normalPrice: 0,
              taiwanPrice: 0,
              actualPrice: 0,
              paymentMethod: "現金",
              image: "",
              status: "to-buy",
              includeInBudget: true,
              note: ""
            });
          } else if (activeTab === "準備") {
            setEditingItem({
              type: "strategy",
              title: "",
              note: "",
              links: [{ label: "", url: "" }]
            });
          } else {
            setEditingItem({
              type: "spot",
              title: "",
              arrivalTime: "09:00",
              leaveTime: "10:00",
              address: "",
              mapCode: "",
              cost: 0,
              note: "",
            });
          }
        }}
        className="fixed bottom-24 right-5 w-16 h-16 rounded-full bg-gradient-to-br from-pink-400 via-pink-500 to-orange-300 text-white shadow-2xl text-xs font-black flex flex-col items-center justify-center transition-transform active:scale-95 z-30"
      >
        <span className="text-xl">+</span>
        <span>{activeTab === "花費" ? "登記" : "新增"}</span>
      </button>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-pink-100 shadow-lg max-w-[430px] mx-auto z-40">
        <div className="grid grid-cols-4 h-16">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                activeTab === tab ? "text-pink-500 scale-105" : "text-gray-400"
              }`}
            >
              <div className="text-lg">
                {tab === "行程" ? "🗓️" : tab === "花費" ? "💴" : tab === "購物" ? "🛍️" : "🧳"}
              </div>
              <span className="text-[10px] font-black">{tab}</span>
            </button>
          ))}
        </div>
      </nav>

      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center px-6">
          <div className="bg-white rounded-[40px] w-full max-w-sm shadow-2xl overflow-hidden border-4 border-pink-100 flex flex-col max-h-[85vh]">
            <div className="bg-gradient-to-r from-pink-400 to-orange-300 p-5 shrink-0 relative">
              <h3 className="text-xl font-black text-white text-center">
                {editingItem.type === "expense" ? (editingItem.id ? "✏️ 編輯花費" : "💰 新增花費") : 
                 editingItem.type === "shopping" ? (editingItem.id ? "🛍️ 編輯商品" : "🎁 新增商品") :
                 (editingItem.id ? "✨ 編輯行程 ✨" : "✨ 新增行程 ✨")}
              </h3>
              <button 
                onClick={() => setEditingItem(null)}
                className="absolute right-4 top-5 w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              {editingItem.type === "strategy" ? (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-pink-400 ml-1">攻略標題</label>
                    <input
                      className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-pink-200 transition-colors"
                      placeholder="例如：Outlet 懶人包"
                      value={editingItem.title || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-pink-400 ml-1">攻略心得 / 筆記</label>
                    <textarea
                      className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-pink-200 min-h-[120px]"
                      placeholder="在此寫下詳細的攻略資訊..."
                      value={editingItem.note || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, note: e.target.value })}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-black text-pink-400 ml-1">參考連結</label>
                      <button 
                        onClick={() => setEditingItem({ ...editingItem, links: [...(editingItem.links || []), { label: "", url: "" }] })}
                        className="text-[10px] font-black text-pink-500"
                      >+ 增加連結</button>
                    </div>
                    {editingItem.links?.map((link: any, idx: number) => (
                      <div key={idx} className="bg-pink-50/50 p-3 rounded-2xl space-y-2">
                        <input
                          className="w-full bg-white border border-pink-100 rounded-xl px-3 py-1.5 text-[11px] font-bold text-slate-700 outline-none"
                          placeholder="按鈕名稱 (例：地圖)"
                          value={link.label}
                          onChange={(e) => {
                            const newLinks = [...editingItem.links];
                            newLinks[idx].label = e.target.value;
                            setEditingItem({ ...editingItem, links: newLinks });
                          }}
                        />
                        <div className="flex gap-2">
                          <input
                            className="flex-1 bg-white border border-pink-100 rounded-xl px-3 py-1.5 text-[11px] text-slate-500 outline-none"
                            placeholder="https://..."
                            value={link.url}
                            onChange={(e) => {
                              const newLinks = [...editingItem.links];
                              newLinks[idx].url = e.target.value;
                              setEditingItem({ ...editingItem, links: newLinks });
                            }}
                          />
                          <button 
                            onClick={() => {
                              const newLinks = editingItem.links.filter((_: any, i: number) => i !== idx);
                              setEditingItem({ ...editingItem, links: newLinks });
                            }}
                            className="text-red-300"
                          >✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : editingItem.type === "preparation" ? (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-pink-400 ml-1">項目名稱</label>
                    <input
                      className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-pink-200"
                      placeholder="要做什麼呢？"
                      value={editingItem.title || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-pink-400 ml-1">分類</label>
                    <div className="flex gap-2">
                      {["準備", "打包"].map(cat => (
                        <button
                          key={cat}
                          onClick={() => setEditingItem({ ...editingItem, category: cat })}
                          className={`flex-1 py-3 rounded-2xl text-xs font-black transition-all ${editingItem.category === cat ? "bg-pink-500 text-white" : "bg-slate-50 text-slate-400"}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : editingItem.type === "shopping" ? (
                <div className="space-y-5">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-32 h-32 rounded-3xl bg-pink-50 border-2 border-dashed border-pink-200 flex items-center justify-center relative overflow-hidden group">
                      {editingItem.image ? (
                        <>
                          <img src={editingItem.image} alt="preview" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="text-white text-[10px] font-black">更換照片</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-1 opacity-40">
                          <span className="text-3xl">📸</span>
                          <span className="text-[10px] font-black">點擊上傳</span>
                        </div>
                      )}
                      <input 
                        type="file" 
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        onChange={handleImageUpload}
                      />
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 italic">支援 JPG/PNG，建議 1MB 內</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-pink-400 ml-1">商品名稱</label>
                    <input
                      className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-pink-200 transition-colors"
                      placeholder="想買什麼呢？"
                      value={editingItem.title || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-pink-400 ml-1">日本售價 (JPY)</label>
                      <input
                        type="text"
                        className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-black text-slate-800 outline-none focus:border-pink-200"
                        value={editingItem.normalPrice || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, normalPrice: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-pink-400 ml-1">台灣售價 (NTD)</label>
                      <input
                        type="text"
                        className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-black text-pink-500 outline-none focus:border-pink-200"
                        value={editingItem.taiwanPrice || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, taiwanPrice: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="bg-pink-50 rounded-2xl p-4 flex justify-between items-center">
                    <span className="text-xs font-black text-pink-500 italic">約日幣 (參考)</span>
                    <span className="text-lg font-black text-pink-600">¥ {Math.round((parsePriceRange(editingItem.taiwanPrice) || 0) / exchangeRate).toLocaleString()}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                      <span className="text-[11px] font-black text-slate-600 italic">計入預算</span>
                      <button 
                        onClick={() => setEditingItem({ ...editingItem, includeInBudget: !editingItem.includeInBudget })}
                        className={`w-10 h-5 rounded-full transition-colors relative ${editingItem.includeInBudget ? "bg-pink-500" : "bg-slate-300"}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${editingItem.includeInBudget ? "left-5.5" : "left-0.5"}`}></div>
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                      <select 
                        className="bg-transparent text-[11px] font-black text-slate-600 outline-none w-full"
                        value={editingItem.paymentMethod || "現金"}
                        onChange={(e) => setEditingItem({ ...editingItem, paymentMethod: e.target.value })}
                      >
                        <option value="現金">💵 現金</option>
                        <option value="信用卡">💳 刷卡</option>
                      </select>
                    </div>
                  </div>

                  {editingItem.status === "bought" && (
                    <div className="bg-green-50 rounded-3xl p-4 border border-green-100 space-y-3">
                      <p className="text-[11px] font-black text-green-600 italic">✅ 已購買記錄</p>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-green-500 ml-1">實付金額 (JPY)</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full bg-white border border-green-200 rounded-xl p-2.5 text-sm font-black outline-none"
                          value={editingItem.actualPrice || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, actualPrice: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-pink-400 ml-1">備註 / 數量</label>
                    <textarea
                      className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-pink-200 min-h-[80px]"
                      placeholder="幫誰帶、買幾個..."
                      value={editingItem.note || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, note: e.target.value })}
                    />
                  </div>
                </div>
              ) : editingItem.type !== "expense" ? (
                <div className="flex bg-pink-50 rounded-2xl p-1 mb-6 overflow-x-auto no-scrollbar">
                  {["spot", "hotel", "transport", "restaurant"].map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        const baseItem = { ...editingItem, type };
                        if (type === "transport" && !baseItem.segments) {
                          baseItem.segments = [{ from: "", to: "", lineName: "" }];
                          baseItem.transportType = baseItem.transportType || "地鐵/JR";
                        }
                        if (type === "hotel") {
                          baseItem.time = baseItem.time || "15:00";
                        }
                        if (type === "restaurant") {
                          baseItem.time = baseItem.time || "12:00";
                        }
                        setEditingItem(baseItem);
                      }}
                      className={`flex-1 py-2 px-3 rounded-[14px] font-black text-xs transition-all whitespace-nowrap ${
                        editingItem.type === type
                          ? "bg-white text-pink-500 shadow-sm"
                          : "text-pink-300"
                      }`}
                    >
                      {type === "spot" ? "📍 景點" : type === "hotel" ? "🏨 住宿" : type === "transport" ? "🚆 交通" : "🍱 美食"}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-pink-50/50 rounded-2xl p-3 mb-6 border border-pink-100 flex flex-col items-center gap-1">
                  <p className="text-[11px] font-black text-pink-500">💰 花費登記模式</p>
                  <p className="text-[9px] font-bold text-pink-400">登錄後將即時更新預算狀態</p>
                </div>
              )}

              <div className="space-y-5">
                {editingItem.type === "expense" ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-pink-400 ml-1">名稱</label>
                      <input
                        className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-pink-200 transition-colors"
                        placeholder="例如：伴手禮、下午茶..."
                        value={editingItem.title || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">時間</label>
                        <input
                          type="time"
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          value={editingItem.time || "12:00"}
                          onChange={(e) => setEditingItem({ ...editingItem, time: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">金額 (¥)</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-black text-slate-800 outline-none focus:border-pink-200"
                          value={editingItem.cost || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, cost: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-pink-400 ml-1">支付方式</label>
                      <div className="grid grid-cols-2 gap-2">
                        {["現金", "信用卡"].map((method) => (
                          <button
                            key={method}
                            onClick={() => setEditingItem({ ...editingItem, paymentMethod: method })}
                            className={`py-3 rounded-2xl text-sm font-black transition-all border-2 ${
                              (editingItem.paymentMethod || "現金") === method
                                ? "bg-pink-500 border-pink-500 text-white"
                                : "bg-white border-pink-50 text-slate-400"
                            }`}
                          >
                            {method}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {editingItem.type === "spot" && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-pink-400 ml-1">景點名稱</label>
                      <input
                        className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-pink-200 transition-colors"
                        placeholder="請輸入名稱..."
                        value={editingItem.title || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">抵達時間</label>
                        <input
                          type="time"
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          value={editingItem.arrivalTime || ""}
                          onChange={(e) => {
                            const newArrival = e.target.value;
                            const startMin = timeToMinutes(newArrival);
                            const currentLeave = editingItem.leaveTime || minutesToTime(startMin + 60);
                            setEditingItem({
                              ...editingItem,
                              arrivalTime: newArrival,
                              startTime: newArrival,
                              leaveTime: currentLeave,
                              endTime: currentLeave
                            });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">離開時間</label>
                        <input
                          type="time"
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          value={editingItem.leaveTime || ""}
                          onChange={(e) => {
                            const newLeave = e.target.value;
                            setEditingItem({ ...editingItem, leaveTime: newLeave, endTime: newLeave });
                          }}
                        />
                      </div>
                    </div>
                    <div className="bg-pink-50/50 rounded-2xl px-4 py-2 flex items-center justify-between">
                         <span className="text-[10px] font-black text-pink-400">預計停留</span>
                         <span className="text-xs font-black text-pink-500">
                           {formatDuration(timeToMinutes(editingItem.leaveTime) - timeToMinutes(editingItem.arrivalTime))}
                         </span>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-pink-400 ml-1">詳細地址</label>
                      <input
                        className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                        placeholder="Map 搜尋用..."
                        value={editingItem.address || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, address: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">Map Code</label>
                        <input
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          value={editingItem.mapCode || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, mapCode: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">金額 (JPY)</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          value={editingItem.cost || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, cost: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </>
                )}

                {editingItem.type === "hotel" && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-pink-400 ml-1">住宿名稱</label>
                      <input
                        className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-pink-200 transition-colors"
                        placeholder="請輸入住宿名稱..."
                        value={editingItem.title || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                      />
                    </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-black text-pink-400 ml-1">時間</label>
                          <input
                            type="time"
                            className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                            value={editingItem.time || ""}
                            onChange={(e) => setEditingItem({ ...editingItem, time: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between ml-1">
                            <label className="text-[11px] font-black text-pink-400">金額</label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="w-3" 
                                checked={editingItem.isNTD || false}
                                onChange={(e) => setEditingItem({ ...editingItem, isNTD: e.target.checked })}
                              />
                              <span className="text-[10px] font-black text-pink-400">NTD</span>
                            </label>
                          </div>
                          <input
                            type="number"
                            min="0"
                            className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-black outline-none focus:border-pink-200"
                            value={editingItem.cost || ""}
                            onChange={(e) => setEditingItem({ ...editingItem, cost: parseFloat(e.target.value) || 0 })}
                          />
                          <p className="text-[9px] font-bold text-gray-400 ml-1 mt-0.5">
                            {editingItem.isNTD 
                              ? `約日幣 ¥ ${Math.round((editingItem.cost || 0) / exchangeRate).toLocaleString()}` 
                              : `約台幣 NT$ ${Math.round((editingItem.cost || 0) * exchangeRate).toLocaleString()}`}
                          </p>
                        </div>
                      </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-pink-400 ml-1">詳細地址</label>
                      <input
                        className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                        placeholder="Map 搜尋用..."
                        value={editingItem.address || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, address: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">Map Code</label>
                        <input
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          value={editingItem.mapCode || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, mapCode: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">訂房人</label>
                        <input
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          placeholder="訂房者姓名..."
                          value={editingItem.bookingPerson || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, bookingPerson: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">訂房平台</label>
                        <input
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          placeholder="如: Agoda, Booking..."
                          value={editingItem.bookingPlatform || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, bookingPlatform: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">房型</label>
                        <input
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          placeholder="如: 雙人房..."
                          value={editingItem.roomType || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, roomType: e.target.value })}
                        />
                      </div>
                    </div>
                  </>
                )}

                {editingItem.type === "restaurant" && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-orange-400 ml-1">行程標題</label>
                      <input
                        className="w-full bg-white border-2 border-orange-50 rounded-2xl p-3 text-sm font-bold text-slate-700 outline-none focus:border-orange-200"
                        placeholder="如: 仙台車站午餐、晚餐備選..."
                        value={editingItem.title || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-orange-400 ml-1">時間</label>
                        <input
                          type="time"
                          className="w-full bg-white border-2 border-orange-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-orange-200"
                          value={editingItem.time || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, time: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-orange-400 ml-1">預估金額</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full bg-white border-2 border-orange-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-orange-200"
                          value={editingItem.cost || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, cost: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[11px] font-black text-orange-400 ml-1 block">候選清單 (店名/地址/導航)</label>
                      {(editingItem.options || []).map((opt: any, idx: number) => (
                        <div key={idx} className="bg-orange-50 p-4 rounded-3xl border-2 border-orange-100 space-y-3 relative">
                          {idx > 0 && (
                             <button 
                               onClick={() => {
                                 const newOpts = [...editingItem.options];
                                 newOpts.splice(idx, 1);
                                 setEditingItem({ ...editingItem, options: newOpts });
                               }}
                               className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 text-red-500 rounded-full text-[10px] font-black flex items-center justify-center border border-red-200"
                             >✕</button>
                          )}
                          <input
                            placeholder="餐廳名稱..."
                            className="w-full border-2 border-white rounded-xl p-2 text-[12px] font-bold bg-white/80 outline-none focus:bg-white"
                            value={opt.name || ""}
                            onChange={(e) => {
                              const newOpts = [...editingItem.options];
                              newOpts[idx].name = e.target.value;
                              setEditingItem({ ...editingItem, options: newOpts });
                            }}
                          />
                          <input
                            placeholder="地址 (導航使用)..."
                            className="w-full border-2 border-white rounded-xl p-2 text-[12px] font-bold bg-white/80 outline-none focus:bg-white"
                            value={opt.address || ""}
                            onChange={(e) => {
                              const newOpts = [...editingItem.options];
                              newOpts[idx].address = e.target.value;
                              setEditingItem({ ...editingItem, options: newOpts });
                            }}
                          />
                          <input
                            placeholder="Map Code (選填)..."
                            className="w-full border-2 border-white rounded-xl p-2 text-[12px] font-bold bg-white/80 outline-none focus:bg-white"
                            value={opt.mapCode || ""}
                            onChange={(e) => {
                              const newOpts = [...editingItem.options];
                              newOpts[idx].mapCode = e.target.value;
                              setEditingItem({ ...editingItem, options: newOpts });
                            }}
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const newOpts = [...(editingItem.options || []), { name: "", address: "", mapCode: "" }];
                          setEditingItem({ ...editingItem, options: newOpts });
                        }}
                        className="w-full py-3 bg-orange-50 text-orange-600 border-2 border-orange-100 rounded-2xl text-[11px] font-black hover:bg-orange-100 transition-all"
                      >
                        + 增加餐廳候選
                      </button>
                    </div>
                  </>
                )}

                {editingItem.type === "flight" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">國內機場 (代碼)</label>
                        <input
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          placeholder="如: TPE"
                          value={editingItem.fromAirport || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, fromAirport: e.target.value.toUpperCase() })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">國外機場 (代碼)</label>
                        <input
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          placeholder="如: SDJ"
                          value={editingItem.toAirport || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, toAirport: e.target.value.toUpperCase() })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">起飛時間</label>
                        <input
                          type="time"
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          value={editingItem.startTime || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, startTime: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-pink-400 ml-1">抵達時間</label>
                        <input
                          type="time"
                          className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                          value={editingItem.endTime || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, endTime: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-pink-400 ml-1">航班編號</label>
                      <input
                        className="w-full bg-white border-2 border-pink-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-pink-200"
                        placeholder="如: BR118"
                        value={editingItem.flightNo || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, flightNo: e.target.value.toUpperCase() })}
                      />
                    </div>
                  </>
                )}

                {editingItem.type === "transport" && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-yellow-500 ml-1">交通工具</label>
                        <select
                          className="w-full bg-white border-2 border-yellow-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-yellow-100"
                          value={editingItem.transportType || ""}
                          onChange={(e) => setEditingItem({
                            ...editingItem,
                            transportType: e.target.value,
                            segments: editingItem.segments || (e.target.value !== "自駕" && e.target.value !== "走路" ? [{ from: "", to: "", lineName: "" }] : [])
                          })}
                        >
                          <option value="地鐵/JR">地鐵/JR</option>
                          <option value="巴士">巴士</option>
                          <option value="走路">走路</option>
                          <option value="自駕">自駕</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-yellow-500 ml-1">金額 (JPY)</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full bg-white border-2 border-yellow-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-yellow-100"
                          value={editingItem.cost || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, cost: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-yellow-500 ml-1">出發時間</label>
                        <input
                          type="time"
                          className="w-full bg-white border-2 border-yellow-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-yellow-100"
                          value={editingItem.startTime || ""}
                          onChange={(e) => {
                            const newStart = e.target.value;
                            const currentEnd = editingItem.endTime || minutesToTime(timeToMinutes(newStart) + 30);
                            setEditingItem({ ...editingItem, startTime: newStart, endTime: currentEnd });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-yellow-500 ml-1">到達時間</label>
                        <input
                          type="time"
                          className="w-full bg-white border-2 border-yellow-50 rounded-2xl p-3 text-sm font-bold outline-none focus:border-yellow-100"
                          value={editingItem.endTime || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, endTime: e.target.value })}
                        />
                      </div>
                    </div>

                    {editingItem.transportType !== "走路" && (
                      <div className="space-y-4">
                         <label className="text-[11px] font-black text-yellow-500 ml-1">
                           {editingItem.transportType === "自駕" ? "自駕路段 / 備註" : "路線詳情"}
                         </label>
                         {(editingItem.segments || []).map((seg: any, idx: number) => (
                           <div key={idx} className={`${editingItem.transportType === "自駕" ? "bg-orange-50 border-orange-100" : "bg-yellow-50 border-yellow-100"} p-3 rounded-2xl border-2 space-y-2 relative`}>
                             {idx > 0 && (
                               <button 
                                 onClick={() => {
                                   const newSegs = [...editingItem.segments];
                                   newSegs.splice(idx, 1);
                                   setEditingItem({ ...editingItem, segments: newSegs });
                                 }}
                                 className="absolute -top-2 -right-2 w-5 h-5 bg-red-100 text-red-500 rounded-full text-[9px] font-black flex items-center justify-center border border-red-200"
                               >✕</button>
                             )}
                             <div className="grid grid-cols-2 gap-2">
                               <input
                                 placeholder={editingItem.transportType === "自駕" ? "起點 IC" : "上車站"}
                                 className="w-full border-2 border-white rounded-lg p-1.5 text-[11px] font-bold bg-white/80 outline-none focus:bg-white"
                                 value={seg.from || ""}
                                 onChange={(e) => {
                                   const newSegs = [...editingItem.segments];
                                   newSegs[idx].from = e.target.value;
                                   setEditingItem({ ...editingItem, segments: newSegs });
                                 }}
                               />
                               <input
                                 placeholder={editingItem.transportType === "自駕" ? "終點 IC" : "下車站"}
                                 className="w-full border-2 border-white rounded-lg p-1.5 text-[11px] font-bold bg-white/80 outline-none focus:bg-white"
                                 value={seg.to || ""}
                                 onChange={(e) => {
                                   const newSegs = [...editingItem.segments];
                                   newSegs[idx].to = e.target.value;
                                   setEditingItem({ ...editingItem, segments: newSegs });
                                 }}
                               />
                             </div>
                             <input
                               placeholder={editingItem.transportType === "自駕" ? "路段過路費或備註..." : "線路名稱 (如: JR 仙山線)"}
                               className="w-full border-2 border-white rounded-lg p-1.5 text-[11px] font-bold bg-white/80 outline-none focus:bg-white"
                               value={seg.lineName || ""}
                               onChange={(e) => {
                                 const newSegs = [...editingItem.segments];
                                 newSegs[idx].lineName = e.target.value;
                                 setEditingItem({ ...editingItem, segments: newSegs });
                               }}
                             />
                           </div>
                         ))}
                         <button
                           onClick={() => {
                             const newSegs = [...(editingItem.segments || []), { from: "", to: "", lineName: "" }];
                             setEditingItem({ ...editingItem, segments: newSegs });
                           }}
                           className={`w-full py-2.5 rounded-xl text-[10px] font-black border-2 transition-all ${
                             editingItem.transportType === "自駕" 
                             ? "bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-100" 
                             : "bg-yellow-50 text-yellow-600 border-yellow-100 hover:bg-yellow-100"
                           }`}
                         >
                           {editingItem.transportType === "自駕" ? "+ 增加路段" : "+ 增加轉乘線路"}
                         </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

              </div>
            </div>

            <div className="p-6 bg-gray-50 flex gap-3 shrink-0">
              {editingItem.id && (
                <button
                  onClick={() => {
                    handleDelete(editingItem.id);
                    setEditingItem(null);
                  }}
                  className="w-14 h-14 bg-red-50 border-2 border-red-100 text-red-500 rounded-[20px] flex items-center justify-center transition-all active:scale-95"
                  title="刪除"
                >
                  🗑️
                </button>
              )}
              <button
                onClick={() => setEditingItem(null)}
                className="flex-[0.5] py-4 bg-white border-2 border-gray-100 rounded-[20px] text-gray-400 font-black text-sm transition-all active:scale-95"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-4 bg-gradient-to-r from-pink-400 via-pink-500 to-orange-300 text-white rounded-[20px] shadow-lg shadow-pink-200 font-black text-sm transition-all active:scale-95 hover:brightness-105"
              >
                確認儲存 ✨
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
