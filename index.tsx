
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

const TOTAL_SUPPLY = 444_000_000;
const MINING_REWARD_POOL = TOTAL_SUPPLY * 0.7;
const OWNER_WALLET_ADDRESS = 'UQCyYunUjHsOTwtB5gbZSrKcWEgJxJhlSQHkJkLPgLVEoy-k';


// --- Helper Functions & Constants ---
const sha256 = async (message: string): Promise<string> => {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const formatNumber = (num: number, dec = 2) => {
    if (num === 0) return '0.00';
    if (num < 0.0001 && num > 0) return num.toExponential(2);
    if (num >= 1000) {
      return num.toLocaleString('en-US', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });
    }
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
};

const formatTime = (seconds: number) => {
    if (seconds === Infinity) return 'N/A';
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

const calculateHashRate = (miningRate: number) => {
    const baseHash = miningRate * 500_000_000_000; // 1 QC/s = 500 TH/s
    if (baseHash < 1e9) return `${(baseHash / 1e6).toFixed(2)} MH/s`;
    if (baseHash < 1e12) return `${(baseHash / 1e9).toFixed(2)} GH/s`;
    if (baseHash < 1e15) return `${(baseHash / 1e12).toFixed(2)} TH/s`;
    if (baseHash < 1e18) return `${(baseHash / 1e15).toFixed(2)} PH/s`;
    return `${(baseHash / 1e18).toFixed(2)} EH/s`;
};

type Rarity = 'uncommon' | 'rare' | 'legendary' | 'ultra';

// --- Game Configuration ---
const UPGRADES_CONFIG = {
  core: { name: 'Quantum Processor', baseTonCost: 0.09, baseRate: 0.0005, rarity: 'uncommon' as Rarity },
  cooler: { name: 'Cryo Cooler', baseTonCost: 0.54, baseRate: 0.0025, rarity: 'uncommon' as Rarity },
  dataBus: { name: 'Neutrino Bus', baseTonCost: 2.7, baseRate: 0.0110, rarity: 'rare' as Rarity },
  power: { name: 'Fusion Power Supply', baseTonCost: 10.5, baseRate: 0.0525, rarity: 'rare' as Rarity },
};
type UpgradeID = keyof typeof UPGRADES_CONFIG;
const MAX_UPGRADE_LEVEL = 5;

const STORAGE_UPGRADES_CONFIG = {
    1: { name: 'Base Storage', tonCost: 0, capacityHours: 6, rarity: 'uncommon' as Rarity },
    2: { name: 'Extended Array', tonCost: 2.1, capacityHours: 12, rarity: 'rare' as Rarity },
    3: { name: 'Hyper-Core Bank', tonCost: 10.5, capacityHours: 24, rarity: 'legendary' as Rarity },
};
type StorageLevel = keyof typeof STORAGE_UPGRADES_CONFIG;

const BOOSTS_CONFIG = {
    ton_turbo: { name: 'TON Turbocharge', cost: 0.45, currency: 'TON', multiplier: 3, durationSeconds: 4 * 3600, rarity: 'uncommon' as Rarity },
    ton_overdrive: { name: 'TON Overdrive', cost: 1.05, currency: 'TON', multiplier: 6, durationSeconds: 8 * 3600, rarity: 'rare' as Rarity },
    ton_singularity: { name: 'TON Singularity', cost: 2.1, currency: 'TON', multiplier: 12, durationSeconds: 12 * 3600, rarity: 'legendary' as Rarity },
};
type BoostID = keyof typeof BOOSTS_CONFIG;

const PERMANENT_UPGRADES_CONFIG = {
  autoClaim: { name: 'Auto-Claim Bot', description: 'Automatically claims QC when storage is full.', cost: 21, currency: 'TON', rarity: 'legendary' as Rarity },
  friendBonusAmp: { name: 'Friendship Amplifier', description: 'Doubles the mining bonus from each friend.', cost: 15, currency: 'TON', rarity: 'legendary' as Rarity }
};
type PermanentUpgradeID = keyof typeof PERMANENT_UPGRADES_CONFIG;

const SKINS_CONFIG = {
  'fractal-dimension': { name: 'Fractal Dimension', description: 'Kaleidoscopic wave distortions and layered symmetry fractals.', cost: 7.5, currency: 'TON', rarity: 'ultra' as Rarity },
  'chronocore': { name: 'ChronoCore', description: 'Rusted clockwork space with floating time glyphs and clock sparks.', cost: 7.5, currency: 'TON', rarity: 'ultra' as Rarity },
  'dark-matter-reactor': { name: 'Dark Matter Reactor', description: 'Gravitational vortex with inverted light rays and anti-matter streaks.', cost: 10.5, currency: 'TON', rarity: 'ultra' as Rarity },
  'cyber-vortex': { name: 'Cyber Vortex', description: 'A fast-moving hex grid tunnel with glitch sparks and electric scatter.', cost: 10.5, currency: 'TON', rarity: 'ultra' as Rarity },
};
type SkinID = keyof typeof SKINS_CONFIG;


const HALVING_THRESHOLDS = [
    { threshold: MINING_REWARD_POOL * 0.01, multiplier: 0.5, stage: 2 }, // Much harder
    { threshold: MINING_REWARD_POOL * 0.035, multiplier: 0.2, stage: 3 },
    { threshold: MINING_REWARD_POOL * 0.08, multiplier: 0.1, stage: 4 },
    { threshold: MINING_REWARD_POOL * 0.2, multiplier: 0.05, stage: 5 },
    { threshold: MINING_REWARD_POOL * 0.35, multiplier: 0.01, stage: 6 },
];

const LEAGUES_CONFIG = [
  { name: 'Bronze', minMined: 0 },
  { name: 'Silver', minMined: 10000 },
  { name: 'Gold', minMined: 100000 },
  { name: 'Platinum', minMined: 1000000 },
  { name: 'Diamond', minMined: 10000000 },
  { name: 'Quantum', minMined: 50000000 },
];

const FRIEND_BONUS_PERCENT = 0.05; // 5% bonus per friend

const DAILY_LOGIN_REWARDS = [
    { qc: 500, type: 'QC' },
    { qc: 1000, type: 'QC' },
    { boost: { multiplier: 1.5, durationSeconds: 3600 }, type: 'BOOST' },
    { qc: 2500, type: 'QC' },
    { qc: 5000, type: 'QC' },
    { boost: { multiplier: 2, durationSeconds: 7200 }, type: 'BOOST' },
    { qc: 15000, type: 'QC' },
];

// --- Interfaces ---
interface Mission {
  id: string;
  title: string;
  description: string;
  target: number;
  type: 'taps' | 'claims' | 'upgrades';
  reward: number;
}

interface Transaction {
    id: number;
    type: 'Claim' | 'Purchase' | 'Reward';
    description: string;
    amount: string;
    timestamp: number;
}

interface GameState {
  claimedBalance: number;
  totalMined: number;
  lastClaim: number;
  upgrades: Record<UpgradeID, number>;
  storageLevel: StorageLevel;
  friends: { id: number; name: string }[];
  activeBoost: { id: BoostID | 'daily' | 'mission'; expires: number; multiplier: number } | null;
  totalTaps: number;
  totalClaims: number;
  totalUpgrades: number;
  unlockedAchievements: AchievementID[];
  walletAddress: string | null;
  permanentUpgrades: Record<PermanentUpgradeID, boolean>;
  activeSkin: SkinID | 'default';
  unlockedSkins: SkinID[];
  missions: { daily: Mission[] };
  lastMissionFetch: number;
  dailyLogin: { streak: number, lastLogin: number };
  totalBlocksFound: number;
  totalTonSpent: number;
  totalTimePlayedSeconds: number;
  totalBoostsActivated: number;
  transactions: Transaction[];
  totalMissionsCompleted: number;
}

interface User {
    id: number | string;
    first_name?: string;
    last_name?: string;
    username?: string;
}

const ACHIEVEMENTS_CONFIG = {
    mine1k: { name: 'Novice Miner', description: 'Mine your first 1,000 QC', check: (gs: GameState) => gs.totalMined >= 1000 },
    tap1k: { name: 'Tap Master', description: 'Perform 1,000 taps', check: (gs: GameState) => gs.totalTaps >= 1000 },
    invite1: { name: 'Socialite', description: 'Invite your first friend', check: (gs: GameState) => gs.friends.length >= 1 },
    upgradeMax: { name: 'Tinkerer', description: 'Reach level 5 on any component', check: (gs: GameState) => Object.values(gs.upgrades).some(level => level >= 5) },
    storage2: { name: 'Hoarder', description: 'Upgrade to Extended Array storage', check: (gs: GameState) => gs.storageLevel >= 2 },
    boost1: { name: 'Booster', description: 'Activate your first TON boost', check: (gs: GameState) => !!gs.activeBoost },
};
type AchievementID = keyof typeof ACHIEVEMENTS_CONFIG;


interface TapEffect { id: number; value: string; x: number; y: number; }
interface PurchaseModalInfo { item: { name: string; cost: number; currency: 'QC' | 'TON' | 'USDT' }; onConfirm: () => void; }
interface NotificationInfo { id: number; message: string; type: 'success' | 'error'; }
interface ClaimParticleInfo { id: number; delay: number; angle: number; duration: number; startX: number; startY: number; }
interface ButtonParticleInfo { id: number; x: number; y: number; }
interface SignatureRequestInfo { onConfirm: (address: string) => void; }


declare global { interface Window { Telegram?: any; } }

const initialGameState: GameState = {
    claimedBalance: 0,
    totalMined: 0,
    lastClaim: Date.now(),
    upgrades: { core: 1, cooler: 0, dataBus: 0, power: 0 },
    storageLevel: 1,
    friends: [],
    activeBoost: null,
    totalTaps: 0,
    totalClaims: 0,
    totalUpgrades: 0,
    unlockedAchievements: [],
    walletAddress: null,
    permanentUpgrades: { autoClaim: false, friendBonusAmp: false },
    activeSkin: 'default',
    unlockedSkins: [],
    missions: { daily: [] },
    lastMissionFetch: 0,
    dailyLogin: { streak: 0, lastLogin: 0 },
    totalBlocksFound: 0,
    totalTonSpent: 0,
    totalTimePlayedSeconds: 0,
    totalBoostsActivated: 0,
    transactions: [],
    totalMissionsCompleted: 0,
};

// --- React Components ---
const App: React.FC = () => {
  const [allUsersState, setAllUsersState] = useState<Record<string | number, GameState>>({});
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [activeTab, _setActiveTab] = useState('mine');
  const [shopOverlay, setShopOverlay] = useState<'system' | 'boosts' | 'skins' | null>(null);
  const [tapEffects, setTapEffects] = useState<TapEffect[]>([]);
  const [unclaimedEarnings, setUnclaimedEarnings] = useState(0);
  const [timeToFull, setTimeToFull] = useState(0);
  const [purchaseModalInfo, setPurchaseModalInfo] = useState<PurchaseModalInfo | null>(null);
  const [signatureRequest, setSignatureRequest] = useState<SignatureRequestInfo | null>(null);
  const [notification, setNotification] = useState<NotificationInfo | null>(null);
  const [claimParticles, setClaimParticles] = useState<ClaimParticleInfo[]>([]);
  const [buttonParticles, setButtonParticles] = useState<ButtonParticleInfo | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showDailyLogin, setShowDailyLogin] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);


  const tg = window.Telegram?.WebApp;
  const ai = useMemo(() => process.env.API_KEY ? new GoogleGenAI({apiKey: process.env.API_KEY}) : null, []);

  // User Initialization & Data Loading
  useEffect(() => {
    tg?.ready();
    tg?.expand();
    
    const user = tg?.initDataUnsafe?.user;
    const userId = user?.id || 'guest_user';
    setCurrentUser(user || { id: 'guest_user', username: 'Guest Miner' });

    const savedState = localStorage.getItem('quantumCoreState_v11_multiuser');
    let allData: Record<string | number, GameState> = {};
    if (savedState) {
        allData = JSON.parse(savedState);
    }
    if (!allData[userId]) {
        allData[userId] = JSON.parse(JSON.stringify(initialGameState)); // Deep copy
    }
    setAllUsersState(allData);
    setIsLoading(false);
  }, [tg]);

  const gameState = useMemo(() => {
      if (!currentUser || !allUsersState[currentUser.id]) return null;
      return allUsersState[currentUser.id];
  }, [currentUser, allUsersState]);
  
  const setGameState = useCallback((updater: GameState | ((prevState: GameState) => GameState)) => {
      if (!currentUser) return;
      setAllUsersState(prevAll => {
          const current = prevAll[currentUser.id];
          const newState = typeof updater === 'function' ? updater(current) : updater;
          // Ensure new properties exist on old save files
          const finalState = { ...initialGameState, ...newState };
          return { ...prevAll, [currentUser.id]: finalState };
      });
  }, [currentUser]);

  // Daily Login Logic
  useEffect(() => {
      if (!gameState) return;
      const now = new Date();
      const lastLoginDate = new Date(gameState.dailyLogin.lastLogin);
      const isNewDay = now.toDateString() !== lastLoginDate.toDateString();
      if (isNewDay) {
          const isConsecutive = (now.getTime() - lastLoginDate.getTime()) < 2 * 24 * 60 * 60 * 1000;
          const newStreak = isConsecutive ? (gameState.dailyLogin.streak % 7) : 0;
          setGameState(prev => ({...prev, dailyLogin: { streak: newStreak, lastLogin: prev.dailyLogin.lastLogin }})); // Keep old lastLogin until claim
          setShowDailyLogin(true);
      }
  }, [gameState?.dailyLogin.lastLogin]);

  // Track total time played
  useEffect(() => {
    if (!gameState) return;
    const timer = setInterval(() => {
        setGameState(prev => ({ ...prev, totalTimePlayedSeconds: (prev.totalTimePlayedSeconds || 0) + 1 }));
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState, setGameState]);

  const handleClaimDailyReward = () => {
      if (!gameState) return;
      const streakIndex = gameState.dailyLogin.streak;
      const reward = DAILY_LOGIN_REWARDS[streakIndex];
      const now = Date.now();
      if (reward.type === 'QC') {
          const newTransaction: Transaction = {id: now, type: 'Reward', description: `Daily Login Streak: Day ${streakIndex+1}`, amount: `+${formatNumber(reward.qc, 0)} QC`, timestamp: now};
          setGameState(prev => ({ 
              ...prev, 
              claimedBalance: prev.claimedBalance + reward.qc, 
              dailyLogin: { streak: prev.dailyLogin.streak + 1, lastLogin: now },
              transactions: [newTransaction, ...prev.transactions].slice(0, 50)
          }));
          showNotification(`+${formatNumber(reward.qc, 0)} QC claimed!`);
      } else if (reward.type === 'BOOST' && reward.boost) {
          const { multiplier, durationSeconds } = reward.boost;
          const newTransaction: Transaction = {id: now, type: 'Reward', description: `Daily Login Boost`, amount: `x${multiplier} for ${formatTime(durationSeconds)}`, timestamp: now};
          setGameState(prev => ({ 
              ...prev, 
              activeBoost: { id: 'daily', expires: now + durationSeconds * 1000, multiplier }, 
              dailyLogin: { streak: prev.dailyLogin.streak + 1, lastLogin: now },
              transactions: [newTransaction, ...prev.transactions].slice(0, 50)
          }));
          showNotification(`Daily Boost Activated!`);
      }
      setShowDailyLogin(false);
  }


  const setActiveTab = (tab: string) => {
    if (tab === activeTab) return;
    setIsTransitioning(true);
    setTimeout(() => {
      _setActiveTab(tab);
      setIsTransitioning(false);
    }, 200); // half of animation duration
  };

  const showNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setNotification({ id, message, type });
    tg?.HapticFeedback.notificationOccurred(type);
    setTimeout(() => {
        setNotification(prev => (prev?.id === id ? null : prev));
    }, 3000);
  }, [tg]);
  
  const { miningRate, halvingMultiplier, boostMultiplier, friendsBonus, storageCapacitySeconds } = useMemo(() => {
    if (!gameState) return { miningRate: 0, halvingMultiplier: 1, boostMultiplier: 1, friendsBonus: 1, storageCapacitySeconds: 6 * 3600 };
    
    let baseRate = 0;
    for (const key in gameState.upgrades) {
        const id = key as UpgradeID;
        baseRate += UPGRADES_CONFIG[id].baseRate * gameState.upgrades[id];
    }
    
    let currentHalvingMultiplier = 1;
    for (const halt of HALVING_THRESHOLDS) {
        if (gameState.totalMined >= halt.threshold) currentHalvingMultiplier = halt.multiplier;
    }

    let currentBoostMultiplier = 1;
    if (gameState.activeBoost && gameState.activeBoost.expires > Date.now()) {
        currentBoostMultiplier = gameState.activeBoost.multiplier;
    }

    const baseFriendBonus = gameState.permanentUpgrades.friendBonusAmp ? FRIEND_BONUS_PERCENT * 2 : FRIEND_BONUS_PERCENT;
    const currentFriendsBonus = 1 + (gameState.friends.length * baseFriendBonus);
    const capacitySeconds = (STORAGE_UPGRADES_CONFIG[gameState.storageLevel]?.capacityHours || 6) * 3600;
    
    return { 
        miningRate: baseRate * currentHalvingMultiplier * currentBoostMultiplier * currentFriendsBonus, 
        halvingMultiplier: currentHalvingMultiplier,
        boostMultiplier: currentBoostMultiplier,
        friendsBonus: currentFriendsBonus,
        storageCapacitySeconds: capacitySeconds
    };
  }, [gameState]);

  useEffect(() => {
    if (miningRate > 0) {
        document.documentElement.style.setProperty('--mining-speed-factor', `${1 + Math.log1p(miningRate * 1000)}`);
    } else {
        document.documentElement.style.setProperty('--mining-speed-factor', '1');
    }
  }, [miningRate]);

  const checkAndUnlockAchievements = useCallback((currentState: GameState) => {
    let changed = false;
    const newAchievements = [...currentState.unlockedAchievements];
    for (const key in ACHIEVEMENTS_CONFIG) {
        const id = key as AchievementID;
        if (!newAchievements.includes(id)) {
            if (ACHIEVEMENTS_CONFIG[id].check(currentState)) {
                newAchievements.push(id);
                showNotification(`Unlocked: ${ACHIEVEMENTS_CONFIG[id].name}!`);
                changed = true;
            }
        }
    }
    if (changed) setGameState(prev => ({...prev, unlockedAchievements: newAchievements }));
  }, [showNotification, setGameState]);

  useEffect(() => { if (gameState) checkAndUnlockAchievements(gameState); }, [gameState, checkAndUnlockAchievements]);

  const handleClaim = useCallback((isAuto = false) => {
    if (unclaimedEarnings <= 0 || !gameState) return;

    const now = Date.now();
    const newTotalMined = gameState.totalMined + unclaimedEarnings;
    const newTransaction: Transaction = {
        id: now,
        type: 'Claim',
        description: isAuto ? 'Auto-claimed from full storage' : 'Manually claimed earnings',
        amount: `+${formatNumber(unclaimedEarnings, 4)} QC`,
        timestamp: now,
    };
    
    setGameState(prev => ({
        ...prev,
        claimedBalance: prev.claimedBalance + unclaimedEarnings,
        totalMined: newTotalMined,
        lastClaim: now,
        totalClaims: prev.totalClaims + 1,
        transactions: [newTransaction, ...prev.transactions].slice(0, 50)
    }));
    setUnclaimedEarnings(0);
    if (!isAuto) {
      tg?.HapticFeedback.notificationOccurred('success');
      const claimButtonRect = document.getElementById('claim-button')?.getBoundingClientRect();
      const newParticles = Array.from({ length: 40 }).map((_, i) => ({ 
        id: Math.random() + i, 
        delay: Math.random() * 0.5, 
        angle: Math.random() * 360, 
        duration: 1.2 + Math.random() * 0.8,
        startX: claimButtonRect ? claimButtonRect.left + claimButtonRect.width / 2 : window.innerWidth / 2,
        startY: claimButtonRect ? claimButtonRect.top + claimButtonRect.height / 2 : window.innerHeight * 0.75,
      }));
      setClaimParticles(newParticles);
      setIsClaiming(true);
      setTimeout(() => setClaimParticles([]), 2500);
      setTimeout(() => setIsClaiming(false), 500);
    }
  }, [unclaimedEarnings, gameState, tg, setGameState]);

  useEffect(() => {
    if (!gameState) return;
    const interval = setInterval(() => {
      const secondsSinceClaim = (Date.now() - gameState.lastClaim) / 1000;
      const potentialEarnings = secondsSinceClaim * miningRate;
      const maxEarnings = storageCapacitySeconds * miningRate;
      const cappedEarnings = Math.min(potentialEarnings, maxEarnings);
      setUnclaimedEarnings(cappedEarnings);
      
      const storageIsFull = cappedEarnings >= maxEarnings;
      if (gameState.permanentUpgrades.autoClaim && storageIsFull && miningRate > 0) {
        handleClaim(true);
      } else if (miningRate > 0 && !storageIsFull) {
          setTimeToFull((maxEarnings - cappedEarnings) / miningRate);
      } else {
          setTimeToFull(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [miningRate, gameState, handleClaim, storageCapacitySeconds]);
  
  useEffect(() => { 
    if (currentUser) {
        localStorage.setItem('quantumCoreState_v11_multiuser', JSON.stringify(allUsersState)); 
    }
  }, [allUsersState, currentUser]);

  const handleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!gameState) return;
    const tapAmount = 0.001 * halvingMultiplier * boostMultiplier * friendsBonus;
    const maxEarnings = storageCapacitySeconds * miningRate;
    const newPotentialUnclaimed = unclaimedEarnings + tapAmount;

    if (newPotentialUnclaimed > maxEarnings) {
        tg?.HapticFeedback.impactOccurred('light'); return;
    }
    
    setGameState(prev => ({...prev, totalTaps: prev.totalTaps + 1}));
    setUnclaimedEarnings(newPotentialUnclaimed);

    const core = document.getElementById('quantum-core-interactive');
    if (core) {
        core.style.transform = 'scale(0.97)';
        setTimeout(() => core.style.transform = 'scale(1)', 100);
    }
    
    const tapMessages = ['+SIG', '+VEC', '+NONCE', '+HASH', '+BLK', '+AMP'];
    const randomMessage = tapMessages[Math.floor(Math.random() * tapMessages.length)];
    const newEffect: TapEffect = { id: Date.now() + Math.random(), value: randomMessage, x: e.clientX, y: e.clientY };
    setTapEffects(prev => [...prev, newEffect]);
    setTimeout(() => { setTapEffects(prev => prev.filter(effect => effect.id !== newEffect.id)); }, 1500);

  }, [tg, halvingMultiplier, boostMultiplier, friendsBonus, unclaimedEarnings, miningRate, storageCapacitySeconds, gameState, setGameState]);

  const createButtonParticles = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const id = Date.now();
    setButtonParticles({ id, x, y });
    setTimeout(() => setButtonParticles(prev => prev?.id === id ? null : prev), 1000);
  }

  const handlePurchase = (cost: number, currency: 'QC' | 'TON' | 'USDT', onConfirm: () => void, e?: React.MouseEvent<HTMLButtonElement>) => {
    if (!gameState) return;
    if (currency === 'QC') {
      if (gameState.claimedBalance < cost) { showNotification('Not enough QC!', 'error'); return; }
      onConfirm();
    } else {
      if (!gameState.walletAddress) { showNotification('Please connect your wallet first.', 'error'); setActiveTab('profile'); return; }
      if (e) createButtonParticles(e);
      onConfirm();
    }
  };

  const addTransaction = (type: Transaction['type'], description: string, amount: string) => {
      const now = Date.now();
      const newTransaction: Transaction = { id: now, type, description, amount, timestamp: now };
      setGameState(prev => ({
          ...prev,
          transactions: [newTransaction, ...prev.transactions].slice(0, 50)
      }));
  }

  const handlePurchaseUpgrade = (id: UpgradeID) => {
    if (!gameState) return;
    const level = gameState.upgrades[id];
    if (level >= MAX_UPGRADE_LEVEL) {
        showNotification('Max level reached!', 'error');
        return;
    }
    const cost = UPGRADES_CONFIG[id].baseTonCost * Math.pow(2.5, level);
    handlePurchase(cost, 'TON', () => {
        const itemName = `${UPGRADES_CONFIG[id].name} Lvl ${level + 1}`;
        setGameState(prev => ({ 
            ...prev, 
            upgrades: { ...prev.upgrades, [id]: prev.upgrades[id] + 1 }, 
            totalUpgrades: prev.totalUpgrades + 1,
            totalTonSpent: (prev.totalTonSpent || 0) + cost
        }));
        addTransaction('Purchase', itemName, `-${formatNumber(cost, 2)} TON`);
        showNotification(`Purchased ${itemName}!`);
    });
  }

  const handlePurchaseStorageUpgrade = () => {
    if (!gameState) return;
    const nextLevel = (gameState.storageLevel + 1) as StorageLevel;
    if (!STORAGE_UPGRADES_CONFIG[nextLevel]) return;
    const cost = STORAGE_UPGRADES_CONFIG[nextLevel].tonCost;
    handlePurchase(cost, 'TON', () => {
      const itemName = STORAGE_UPGRADES_CONFIG[nextLevel].name;
      setGameState(prev => ({ 
        ...prev, 
        storageLevel: nextLevel,
        totalTonSpent: (prev.totalTonSpent || 0) + cost
      }));
      addTransaction('Purchase', itemName, `-${formatNumber(cost, 2)} TON`);
      showNotification(`Purchased ${itemName}!`);
    });
  }
  
  const handlePurchaseBoost = (id: BoostID) => {
    if (!gameState) return;
    if (gameState.activeBoost) { showNotification('A boost is already active.', 'error'); return; }
    const cost = BOOSTS_CONFIG[id].cost;
    handlePurchase(cost, 'TON', () => {
      const itemName = BOOSTS_CONFIG[id].name;
      setGameState(prev => ({ 
          ...prev, 
          activeBoost: { id: id, expires: Date.now() + BOOSTS_CONFIG[id].durationSeconds * 1000, multiplier: BOOSTS_CONFIG[id].multiplier },
          totalBoostsActivated: (prev.totalBoostsActivated || 0) + 1,
          totalTonSpent: (prev.totalTonSpent || 0) + cost,
      }));
      addTransaction('Purchase', itemName, `-${formatNumber(cost, 2)} TON`);
      showNotification(`${itemName} activated!`);
    });
  }

  const handlePurchasePermanent = (id: PermanentUpgradeID, e: React.MouseEvent<HTMLButtonElement>) => {
    const item = PERMANENT_UPGRADES_CONFIG[id];
    handlePurchase(item.cost, item.currency as 'TON', () => {
        setGameState(prev => ({
            ...prev, 
            permanentUpgrades: {...prev.permanentUpgrades, [id]: true},
            totalTonSpent: (prev.totalTonSpent || 0) + item.cost
        }));
        addTransaction('Purchase', item.name, `-${formatNumber(item.cost, 2)} TON`);
        showNotification(`Activated ${item.name}!`);
    }, e);
  }

  const handlePurchaseSkin = (id: SkinID, e: React.MouseEvent<HTMLButtonElement>) => {
    const skin = SKINS_CONFIG[id];
    handlePurchase(skin.cost, skin.currency as 'TON', () => {
        setGameState(prev => ({
            ...prev, 
            unlockedSkins: [...prev.unlockedSkins, id], 
            activeSkin: id,
            totalTonSpent: (prev.totalTonSpent || 0) + skin.cost
        }));
        addTransaction('Purchase', skin.name, `-${formatNumber(skin.cost, 2)} TON`);
        showNotification(`Unlocked ${skin.name}!`);
    }, e);
  }

  const handleEquipSkin = (id: SkinID) => {
    setGameState(prev => ({...prev, activeSkin: id}));
    showNotification(`${SKINS_CONFIG[id].name} equipped!`);
  }

  const handleInviteFriend = () => {
    setGameState(prev => ({ ...prev, friends: [...prev.friends, { id: Date.now(), name: `Friend #${prev.friends.length + 1}` }] }));
    showNotification('Referral link copied!');
  };

  const handleWalletConnect = () => {
    if (!gameState) return;
    if (gameState.walletAddress) {
      setGameState(prev => ({ ...prev, walletAddress: null }));
      showNotification('Wallet Disconnected', 'error');
    } else {
      setSignatureRequest({ onConfirm: (address) => {
        setGameState(prev => ({ ...prev, walletAddress: address }));
        showNotification('Wallet Connected!');
        setSignatureRequest(null);
      }});
    }
  };
  
  const handleClaimMissionReward = (mission: Mission) => {
    if (!gameState) return;
    const newDailyMissions = gameState.missions.daily.filter(m => m.id !== mission.id);
    const now = Date.now();
    const newTransaction: Transaction = {
        id: now,
        type: 'Reward',
        description: `Mission: ${mission.title}`,
        amount: `+${formatNumber(mission.reward, 0)} QC`,
        timestamp: now
    };
    setGameState(prev => ({
        ...prev, 
        claimedBalance: prev.claimedBalance + mission.reward, 
        missions: { daily: newDailyMissions },
        transactions: [newTransaction, ...prev.transactions].slice(0, 50),
        totalMissionsCompleted: (prev.totalMissionsCompleted || 0) + 1
    }));
    showNotification(`+${formatNumber(mission.reward, 0)} QC Claimed!`, 'success');
  };

  const renderContent = () => {
    if (!gameState || !currentUser) return <div style={styles.loadingContainer}>INITIALIZING QUANTUM LINK...</div>;

    switch(activeTab) {
      case 'mine': return <MineScreen gameState={gameState} miningRate={miningRate} onCoreTap={handleTap} unclaimedEarnings={unclaimedEarnings} onClaim={() => handleClaim()} timeToFull={timeToFull} storageCapacitySeconds={storageCapacitySeconds} totalMined={gameState.totalMined} claimParticles={claimParticles} activeSkin={gameState.activeSkin} onOverlayOpen={setShopOverlay} />;
      case 'missions': return <MissionsScreen gameState={gameState} setGameState={setGameState} ai={ai} showNotification={showNotification} onClaimReward={handleClaimMissionReward} />;
      case 'friends': return <FriendsScreen friends={gameState.friends} onInvite={handleInviteFriend} bonus={friendsBonus} totalMined={gameState.totalMined} />;
      case 'profile': return <ProfileScreen user={currentUser} gameState={gameState} onWalletConnect={handleWalletConnect} miningRate={miningRate} friendsBonus={friendsBonus} storageCapacitySeconds={storageCapacitySeconds} halvingMultiplier={halvingMultiplier} />;
      case 'global': return <GlobalScreen allUsersState={allUsersState} />;
      default: return null;
    }
  };
  
  if (isLoading) {
    return <div style={styles.loadingContainer}>INITIALIZING QUANTUM LINK...</div>;
  }

  const appClassName = gameState?.activeSkin === 'default' ? '' : `skin-${gameState.activeSkin}`;

  return (
    <div style={{...styles.app, ...(isClaiming ? styles.appClaiming : {})}} className={appClassName}>
      <div style={styles.vignette}/>
      {tapEffects.map(effect => <FloatingNumber key={effect.id} {...effect} />)}
      {buttonParticles && <ButtonParticleBurst key={buttonParticles.id} {...buttonParticles} />}
      <Notification notification={notification} />
      {gameState && <Header balance={gameState.claimedBalance} hashRate={calculateHashRate(miningRate)} />}
      <main style={{...styles.mainContent, ...(isTransitioning ? styles.mainContentFading : {})}}>
        {renderContent()}
      </main>
      <NavBar activeTab={activeTab} setActiveTab={setActiveTab} />
      {gameState && shopOverlay && 
        <HolographicOverlay
          type={shopOverlay}
          onClose={() => setShopOverlay(null)}
          gameState={gameState}
          onBoost={(id) => { setPurchaseModalInfo({ item: {name: BOOSTS_CONFIG[id].name, cost: BOOSTS_CONFIG[id].cost, currency: 'TON' }, onConfirm: () => handlePurchaseBoost(id)})}}
          onPurchasePermanent={handlePurchasePermanent} 
          onPurchaseSkin={handlePurchaseSkin} 
          onEquipSkin={handleEquipSkin}
          onUpgrade={(id) => { const level = gameState.upgrades[id]; if (level >= MAX_UPGRADE_LEVEL) return; const cost = UPGRADES_CONFIG[id].baseTonCost * Math.pow(2.5, level); setPurchaseModalInfo({ item: { name: `${UPGRADES_CONFIG[id].name} Lvl ${level+1}`, cost, currency: 'TON' }, onConfirm: () => handlePurchaseUpgrade(id) }) }}
          onStorageUpgrade={() => { const nextConfig = STORAGE_UPGRADES_CONFIG[(gameState.storageLevel + 1) as StorageLevel]; if (nextConfig) { setPurchaseModalInfo({ item: { name: nextConfig.name, cost: nextConfig.tonCost, currency: 'TON' }, onConfirm: handlePurchaseStorageUpgrade }) } }}
        />
      }
      {purchaseModalInfo && <PurchaseModal item={purchaseModalInfo.item} walletAddress={gameState?.walletAddress ?? null} onConfirm={() => { purchaseModalInfo.onConfirm(); setPurchaseModalInfo(null); }} onCancel={() => setPurchaseModalInfo(null)} onConnectWallet={() => {setActiveTab('profile'); setPurchaseModalInfo(null);}} />}
      {signatureRequest && <SignatureRequestModal onConfirm={signatureRequest.onConfirm} onCancel={() => setSignatureRequest(null)} />}
      {showDailyLogin && gameState && <DailyLoginModal streak={gameState.dailyLogin.streak} rewards={DAILY_LOGIN_REWARDS} onClaim={handleClaimDailyReward} />}
    </div>
  );
};

// --- Sub-Components ---
const DailyLoginModal = ({ streak, rewards, onClaim }: { streak: number, rewards: typeof DAILY_LOGIN_REWARDS, onClaim: () => void }) => (
    <div style={styles.modalBackdrop}>
        <div style={{...styles.modalContent, ...styles.glassmorphism}}>
            <h3 style={styles.modalTitle}>Daily Login Reward</h3>
            <p style={styles.modalText}>Welcome back! You're on a {streak+1}-day streak.</p>
            <div style={styles.dailyRewardGrid}>
                {rewards.map((reward, index) => {
                    const day = index;
                    const isClaimed = day < streak;
                    const isCurrent = day === streak;
                    return (
                        <div key={day} style={{...styles.dailyRewardItem, ...(isCurrent ? styles.dailyRewardItemCurrent : {}), ...(isClaimed ? styles.dailyRewardItemClaimed : {})}}>
                            <p style={styles.dailyRewardDay}>Day {day + 1}</p>
                            <p style={styles.dailyRewardValue}>{reward.type === 'QC' ? `${formatNumber(reward.qc, 0)} QC` : `Boost`}</p>
                        </div>
                    );
                })}
            </div>
             <button style={{...styles.actionButton, width: '100%', padding: 15}} onClick={onClaim}>Claim Reward</button>
        </div>
    </div>
);


const Notification = ({ notification }: { notification: NotificationInfo | null }) => {
    if (!notification) return null;
    return <div style={{ ...styles.notification, ...(notification.type === 'error' ? styles.notificationError : {}) }}>{notification.message}</div>;
};

const QcIcon = ({size = 24}: {size?: number}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle' }}>
        <defs>
            <linearGradient id="qcIconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent-color)" />
                <stop offset="100%" stopColor="var(--primary-color)" />
            </linearGradient>
            <filter id="qcIconGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="url(#qcIconGradient)" strokeWidth="1.5" filter="url(#qcIconGlow)" />
        <path d="M12 5.5L5.5 9.25V14.75L12 18.5L18.5 14.75V9.25L12 5.5Z" fill="url(#qcIconGradient)" opacity="0.4" />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--text-color)" fontSize="11" fontWeight="bold" dy="0.5" fontFamily='var(--mono-font)'>Q</text>
    </svg>
);


const ClaimParticle = ({ startX, startY, angle, duration, delay }: ClaimParticleInfo) => {
    const dynamicStyle = {
        ['--start-x' as any]: `${startX}px`,
        ['--start-y' as any]: `${startY}px`,
        ['--angle' as any]: `${angle}deg`,
        animationDuration: `${duration}s`,
        animationDelay: `${delay}s`,
    };
    return <div style={{ ...styles.claimParticle, ...dynamicStyle }} />;
};

const ButtonParticleBurst = ({ x, y }: ButtonParticleInfo) => (
    <div style={{...styles.buttonParticleContainer, top: y, left: x}}>
        {Array.from({length: 15}).map((_,i) => {
            const angle = Math.random() * 360;
            const radius = 40 + Math.random() * 40;
            const tx = Math.cos(angle * Math.PI / 180) * radius;
            const ty = Math.sin(angle * Math.PI / 180) * radius;
            const dynamicStyle: React.CSSProperties = {
                ['--tx' as any]: `${tx}px`,
                ['--ty' as any]: `${ty}px`,
            };
            return <div key={i} style={{...styles.buttonParticle, ...dynamicStyle}}/>
        })}
    </div>
);

const PurchaseModal = ({ item, walletAddress, onConfirm, onCancel, onConnectWallet }: { item: PurchaseModalInfo['item'], walletAddress: string | null, onConfirm: () => void, onCancel: () => void, onConnectWallet: () => void }) => {
    const isTonPurchase = item.currency === 'TON';
    const canPurchase = !isTonPurchase || (isTonPurchase && !!walletAddress);
    return (
        <div style={styles.modalBackdrop}>
            <div style={{...styles.modalContent, ...styles.glassmorphism}}>
                <h3 style={styles.modalTitle}>Confirm Transaction</h3>
                <p style={styles.modalText}>Broadcast transaction to the network:</p>
                <p style={styles.modalItemName}>{item.name}</p>
                <p style={styles.modalText}>COST: <CurrencyIcon currency={item.currency} /> {formatNumber(item.cost, 3)} {item.currency}</p>
                {isTonPurchase && !walletAddress && <p style={styles.modalWalletWarning}>A wallet connection is required. Please connect your wallet in the Profile tab to proceed.</p>}
                {isTonPurchase && walletAddress && (
                    <div style={{textAlign: 'left', marginTop: 15, fontSize: '0.8rem', opacity: 0.7}}>
                        <p style={{margin: '5px 0'}}>FROM: <span style={{fontFamily: 'var(--mono-font)'}}>{walletAddress}</span></p>
                        <p style={{margin: '5px 0'}}>TO: <span style={{fontFamily: 'var(--mono-font)'}}>{OWNER_WALLET_ADDRESS}</span></p>
                    </div>
                )}
                <div style={styles.modalActions}>
                    <button style={{...styles.actionButton, ...styles.cancelButton}} onClick={onCancel}>Abort</button>
                    {canPurchase ? <button style={{...styles.actionButton}} onClick={onConfirm}>Confirm</button> : <button style={{...styles.actionButton, ...styles.actionButtonDisabled}} onClick={onConnectWallet}>Connect Wallet</button>}
                </div>
            </div>
        </div>
    );
}

const SignatureRequestModal = ({ onConfirm, onCancel }: SignatureRequestInfo & { onCancel: () => void }) => {
    const simulatedAddress = `UQ${'x'.repeat(10)}${Date.now().toString().slice(-4)}`;
    return (
         <div style={styles.modalBackdrop}>
            <div style={{...styles.modalContent, ...styles.glassmorphism}}>
                <h3 style={styles.modalTitle}>Wallet Signature Request</h3>
                <p style={styles.modalText}>Sign a message to verify ownership of your wallet address.</p>
                <div style={styles.signatureBox}>
                    <p style={styles.signatureText}>
                        Sign-in to Quantum Core with this wallet.
                        <br/>
                        Address: {simulatedAddress}
                        <br/>
                        Timestamp: {Date.now()}
                    </p>
                </div>
                <p style={{...styles.itemDesc, marginTop: '15px'}}>This is a free, off-chain signature and will not cost any gas fees.</p>
                <div style={styles.modalActions}>
                    <button style={{...styles.actionButton, ...styles.cancelButton}} onClick={onCancel}>Cancel</button>
                    <button style={{...styles.actionButton}} onClick={() => onConfirm(simulatedAddress)}>Sign & Confirm</button>
                </div>
            </div>
        </div>
    );
};

const FloatingNumber = ({ value, x, y }: { value: string; x: number; y: number }) => <div style={{ ...styles.floatingNumber, top: `${y - 40}px`, left: `${x - 25}px` }}>{value}</div>;
const useCountUp = (target: number, duration = 800) => {
    const [count, setCount] = useState(target);
    const countRef = useRef(target);

    useEffect(() => {
        const startValue = countRef.current;
        let animationFrameId: number;
        let startTime: number | null = null;
        
        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const currentValue = startValue + (target - startValue) * progress;
            setCount(currentValue);

            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            } else {
                countRef.current = target;
            }
        };
        animationFrameId = requestAnimationFrame(animate);
        return () => {
            cancelAnimationFrame(animationFrameId);
            countRef.current = target;
        }
    }, [target, duration]);

    return count;
};

const Header = ({ balance, hashRate }: { balance: number, hashRate: string }) => {
    const animatedBalance = useCountUp(balance);
    return (
        <header style={styles.header}>
            <div style={styles.balanceContainer}>
                <div style={{textAlign: 'center'}}>
                    <div style={styles.balanceWrapper}>
                        <QcIcon size={32}/>
                        <h1 style={styles.balance}>{formatNumber(animatedBalance, 2)}</h1>
                    </div>
                    <p style={styles.hashRateDisplay}>
                       ~ {hashRate} ~
                    </p>
                </div>
            </div>
        </header>
    );
};

const AITerminal = () => {
    const [logLines, setLogLines] = useState<string[]>([]);
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const messages = [
            "SYS.CORE.TEMP: 40.9885°K",
            "HASH.ATTEMPT: 8xa6.4473*",
            "MERKLE.ROOT.VERIFY: nUz1vwwgkpv",
            "QUANT.FIELD.STABLE",
            "NONCE.ITERATION: 9.83 G/s",
            "TACHYON.PULSE.SYNC",
            "ENTROPY.DECAY: 0.0013%",
            "SIG.VALIDATED: OK",
            "BLOCK.CANDIDATE.FOUND",
            "ZPE.TAP: 11.3 GW",
        ];
        setLogLines(Array.from({length: 4}).map(() => messages[Math.floor(Math.random() * messages.length)]))
        const interval = setInterval(() => {
            setLogLines(prev => [...prev.slice(1), messages[Math.floor(Math.random() * messages.length)]]);
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if(logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [logLines]);

    return (
        <div ref={logRef} style={styles.aiTerminal}>
            <div style={styles.terminalHeader}>AI TERMINAL</div>
            {logLines.map((line, i) => {
                const parts = line.split(':');
                return (
                  <p key={i} style={styles.logLine}>
                    <span style={{color: 'var(--secondary-color)'}}>&gt; {parts[0]}:</span>
                    <span style={{color: 'var(--accent-color)'}}>{parts[1]}</span>
                  </p>
                )
            })}
        </div>
    )
}

const StorageGauge = ({ fillPercentage, timeToFull }: { fillPercentage: number, timeToFull: number }) => (
    <div style={styles.storageGaugeContainer}>
        <div style={styles.storageGaugeLabel}>
            <span>STORAGE</span>
            <span>{formatTime(timeToFull)}</span>
        </div>
        <div style={styles.storageGauge}>
            <div style={{ ...styles.storageGaugeFill, height: `${fillPercentage}%` }} />
            {Array.from({ length: 10 }).map((_, i) => <div key={i} style={{ ...styles.storageGaugeTick, bottom: `${i * 10}%` }} />)}
        </div>
    </div>
);

const AdvancedAIAssistant = () => (
    <div style={styles.aiAssistant}>
        <svg viewBox="0 0 100 100" style={styles.aiAssistantSVG}>
            <defs>
                <radialGradient id="ai-eye-gradient" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="var(--accent-color)" />
                    <stop offset="40%" stopColor="var(--primary-color)" />
                    <stop offset="100%" stopColor="var(--bg-color)" />
                </radialGradient>
                 <filter id="ai-glow">
                    <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                    <feMerge> 
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
            <circle cx="50" cy="50" r="45" fill="url(#ai-eye-gradient)" style={styles.aiAssistantPupil} filter="url(#ai-glow)"/>
            <path d="M10 50 Q 50 30 90 50" stroke="rgba(255,255,255,0.8)" strokeWidth="3" fill="none" style={styles.aiAssistantEyelidTop} />
            <path d="M10 50 Q 50 70 90 50" stroke="rgba(255,255,255,0.8)" strokeWidth="3" fill="none" style={styles.aiAssistantEyelidBottom} />
        </svg>
    </div>
);


const MineScreen = ({ gameState, miningRate, onCoreTap, unclaimedEarnings, onClaim, timeToFull, storageCapacitySeconds, totalMined, claimParticles, activeSkin, onOverlayOpen }: { gameState: GameState; miningRate: number; onCoreTap: (e: React.MouseEvent<HTMLDivElement>) => void; unclaimedEarnings: number; onClaim: () => void; timeToFull: number; storageCapacitySeconds: number; totalMined: number; claimParticles: ClaimParticleInfo[]; activeSkin: SkinID | 'default'; onOverlayOpen: (type: 'system' | 'boosts' | 'skins') => void; }) => {
    const storageFillPercentage = unclaimedEarnings / (storageCapacitySeconds * miningRate || 1) * 100;
    
    const [ripples, setRipples] = useState<{ id: number }[]>([]);

    const handleCoreTap = (e: React.MouseEvent<HTMLDivElement>) => {
        setRipples(prev => [...prev, { id: Date.now() }]);
        onCoreTap(e);
    };

    return (
        <div style={styles.mineScreen}>
            <div style={styles.particleContainer}>{claimParticles.map(p => <ClaimParticle key={p.id} {...p} />)}</div>
            <div style={styles.mineScreenTop}>
                <AdvancedAIAssistant />
                <div style={styles.holographicActionButtons}>
                    <button className="holo-button" onClick={() => onOverlayOpen('system')}>SYSTEM</button>
                    <button className="holo-button" onClick={() => onOverlayOpen('boosts')}>BOOSTS</button>
                    <button className="holo-button" onClick={() => onOverlayOpen('skins')}>SKINS</button>
                </div>
            </div>
            <div style={styles.coreContainer} id="quantum-core" onClick={handleCoreTap}>
                 <div style={styles.coreBackgroundGlow} />
                {ripples.map(r => <div key={r.id} style={styles.ripple} onAnimationEnd={() => setRipples(prev => prev.filter(ripple => ripple.id !== r.id))} />)}
                 <div style={{...styles.lightTrail, animationName: 'trail-1-anim'}}/>
                 <div style={{...styles.lightTrail, animationName: 'trail-2-anim'}}/>
                 <div style={{...styles.lightTrail, animationName: 'trail-3-anim'}}/>
                <div id="quantum-core-interactive" style={styles.core}>
                    <div style={styles.coreRefractionLayer} />
                    <div style={styles.coreGlow} />
                    <div style={styles.coreNucleus}>
                        {Array.from({length: 10}).map((_, i) => <div key={i} style={{...styles.coreParticle, animationDelay: `${i * 0.2}s`}}/>)}
                    </div>
                    <div style={styles.unclaimedDisplay}>
                        <span style={styles.unclaimedValue}>{formatNumber(unclaimedEarnings, 4)}</span>
                        <span style={styles.unclaimedLabel}>Unclaimed QC</span>
                    </div>
                </div>
            </div>
            
            <div style={styles.mineScreenBottom}>
                <AITerminal />
                <button id="claim-button" style={styles.claimButton} onClick={onClaim}>
                    <div style={styles.claimButtonRing}>
                        <div style={styles.claimButtonShine} />
                    </div>
                    <span style={styles.claimButtonText}>CLAIM</span>
                </button>
                <StorageGauge fillPercentage={storageFillPercentage} timeToFull={timeToFull} />
            </div>
        </div>
    );
}

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties, onClick?: (e: React.MouseEvent<HTMLDivElement>) => void }> = ({ children, style, onClick }) => <div style={{ ...styles.card, ...styles.glassmorphism, ...style }} onClick={onClick}>{children}</div>;
const CurrencyIcon = ({ currency }: { currency: 'QC' | 'TON' | 'USDT' }) => {
    switch (currency) {
        case 'QC': return <QcIcon size={18}/>;
        case 'TON': return <span style={{ ...styles.currencyIcon, backgroundColor: '#0098EA' }}>T</span>;
        case 'USDT': return <span style={{ ...styles.currencyIcon, backgroundColor: '#26A17B' }}>$</span>;
        default: return null;
    }
}

const HolographicCard = ({ children, rarity }: { children: React.ReactNode, rarity: Rarity }) => (
    <div style={styles.holographicCard} className={`rarity-${rarity}`}>
        {children}
    </div>
);

const HolographicOverlay = ({type, onClose, gameState, onBoost, onPurchasePermanent, onPurchaseSkin, onEquipSkin, onUpgrade, onStorageUpgrade}: {type: 'system' | 'boosts' | 'skins', onClose: ()=>void, gameState: GameState, onBoost: (id: BoostID) => void; onPurchasePermanent: (id: PermanentUpgradeID, e: React.MouseEvent<HTMLButtonElement>) => void; onPurchaseSkin: (id: SkinID, e: React.MouseEvent<HTMLButtonElement>) => void; onEquipSkin: (id: SkinID) => void; onUpgrade: (id: UpgradeID) => void; onStorageUpgrade: () => void;}) => {
    const [shopTab, setShopTab] = useState<'boosts' | 'permanent' | 'skins' | 'components' | 'storage'>(type === 'system' ? 'components' : type);
    const [now, setNow] = useState(Date.now());
    useEffect(() => { if(gameState.activeBoost) { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); } }, [gameState.activeBoost]);
    
    const activeBoost = useMemo(() => { if (!gameState.activeBoost || now > gameState.activeBoost.expires) return null; 
        const boostConfig = gameState.activeBoost.id !== 'daily' && gameState.activeBoost.id !== 'mission' ? BOOSTS_CONFIG[gameState.activeBoost.id] : null;
        const name = boostConfig ? boostConfig.name : `x${gameState.activeBoost.multiplier} Temporary Boost`;
        return { name, expires: gameState.activeBoost.expires }; 
    }, [gameState.activeBoost, now]);

    const titles = {
        system: "SYSTEM INTERFACE",
        boosts: "BOOSTERS",
        skins: "CORE SKINS",
        components: "CORE COMPONENTS",
        storage: "STORAGE UPGRADES",
        permanent: "PERMANENT UPGRADES"
    }

    const renderContent = () => {
        switch(shopTab) {
            case 'components':
                return (Object.keys(UPGRADES_CONFIG) as UpgradeID[]).map(id => {
                    const level = gameState.upgrades[id];
                    const cost = UPGRADES_CONFIG[id].baseTonCost * Math.pow(2.5, level);
                    const isMaxed = level >= MAX_UPGRADE_LEVEL;
                    return (
                        <HolographicCard key={id} rarity={UPGRADES_CONFIG[id].rarity}>
                            <div style={styles.listItemContent}><p style={styles.itemName}>{UPGRADES_CONFIG[id].name}</p><p style={styles.itemDesc}>+ {formatNumber(UPGRADES_CONFIG[id].baseRate * 3600)} QC/hr per level</p></div>
                             <div style={{textAlign: 'right'}}>
                                {isMaxed ? <p style={styles.ownedTag}>MAX</p> : <button style={styles.actionButton} onClick={() => onUpgrade(id)}><CurrencyIcon currency="TON" /> {formatNumber(cost, 2)}</button>}
                                <div style={{...styles.itemDesc, display: 'flex', flexDirection: 'column', gap: '5px', marginTop: 10 }}>
                                    <span>Level: {level} / {MAX_UPGRADE_LEVEL}</span>
                                    <div style={styles.progressBarBackground}><div style={{...styles.progressBarFill, width: `${(level/MAX_UPGRADE_LEVEL)*100}%`}}></div></div>
                                </div>
                             </div>
                        </HolographicCard>
                    );
                });
            case 'storage':
                const nextStorageConfig = STORAGE_UPGRADES_CONFIG[(gameState.storageLevel + 1) as StorageLevel];
                return nextStorageConfig ? <HolographicCard rarity={nextStorageConfig.rarity}><div style={styles.listItemContent}><p style={styles.itemName}>{nextStorageConfig.name}</p><p style={styles.itemDesc}>Capacity: {nextStorageConfig.capacityHours} Hours</p></div><button style={styles.actionButton} onClick={onStorageUpgrade}><CurrencyIcon currency="TON" /> {formatNumber(nextStorageConfig.tonCost, 2)}</button></HolographicCard> : <HolographicCard rarity="uncommon"><p style={styles.itemName}>Max Storage Level Reached</p></HolographicCard>
            case 'boosts':
                return activeBoost ? <HolographicCard rarity="legendary"><p style={styles.itemName}>{activeBoost.name} ACTIVE!</p><p style={styles.boostTimer}>{formatTime((activeBoost.expires - now) / 1000)}</p></HolographicCard> : (Object.keys(BOOSTS_CONFIG) as BoostID[]).map(id => <HolographicCard key={id} rarity={BOOSTS_CONFIG[id].rarity}><div style={styles.listItemContent}><p style={styles.itemName}>{BOOSTS_CONFIG[id].name}</p><p style={styles.itemDesc}>Duration: {BOOSTS_CONFIG[id].durationSeconds / 3600}hr | x{BOOSTS_CONFIG[id].multiplier} Mining</p></div><button style={styles.actionButton} onClick={() => onBoost(id)} disabled={!!activeBoost}><CurrencyIcon currency="TON" /> {formatNumber(BOOSTS_CONFIG[id].cost, 2)}</button></HolographicCard>)
            case 'permanent':
                return (Object.keys(PERMANENT_UPGRADES_CONFIG) as PermanentUpgradeID[]).map(id => <HolographicCard key={id} rarity={PERMANENT_UPGRADES_CONFIG[id].rarity}><div style={styles.listItemContent}><p style={styles.itemName}>{PERMANENT_UPGRADES_CONFIG[id].name}</p><p style={styles.itemDesc}>{PERMANENT_UPGRADES_CONFIG[id].description}</p></div>{gameState.permanentUpgrades[id] ? <p style={styles.ownedTag}>OWNED</p> : <button style={styles.actionButton} onClick={(e) => onPurchasePermanent(id, e)}><CurrencyIcon currency={PERMANENT_UPGRADES_CONFIG[id].currency as 'TON'} /> {formatNumber(PERMANENT_UPGRADES_CONFIG[id].cost)}</button>}</HolographicCard>);
            case 'skins':
                 return (Object.keys(SKINS_CONFIG) as SkinID[]).map(id => <HolographicCard key={id} rarity={SKINS_CONFIG[id].rarity}><div style={styles.listItemContent}><p style={styles.itemName}>{SKINS_CONFIG[id].name}</p><p style={styles.itemDesc}>{SKINS_CONFIG[id].description}</p></div>{gameState.activeSkin === id ? <p style={styles.ownedTag}>EQUIPPED</p> : gameState.unlockedSkins.includes(id) ? <button style={{ ...styles.actionButton, backgroundColor: 'var(--primary-color)' }} onClick={() => onEquipSkin(id)}>Equip</button> : <button style={styles.actionButton} onClick={(e) => onPurchaseSkin(id, e)}><CurrencyIcon currency={SKINS_CONFIG[id].currency as 'TON'} /> {formatNumber(SKINS_CONFIG[id].cost)}</button>}</HolographicCard>);
        }
    }

    return (
        <div style={styles.modalBackdrop}>
            <div style={styles.holographicOverlay}>
                <button onClick={onClose} style={styles.holoCloseButton}>&times;</button>
                <h2 style={styles.screenTitle}>{titles[shopTab]}</h2>
                {(type === 'system') &&
                    <div style={styles.tabContainer}>
                        <button style={{...styles.tabButton, ...(shopTab === 'components' ? styles.tabButtonActive : {})}} onClick={() => setShopTab('components')}>Components</button>
                        <button style={{...styles.tabButton, ...(shopTab === 'storage' ? styles.tabButtonActive : {})}} onClick={() => setShopTab('storage')}>Storage</button>
                         <button style={{...styles.tabButton, ...(shopTab === 'permanent' ? styles.tabButtonActive : {})}} onClick={() => setShopTab('permanent')}>Permanent</button>
                    </div>
                }
                <div style={styles.list}>
                    {renderContent()}
                </div>
            </div>
        </div>
    )
}

const MissionsScreen = ({ gameState, setGameState, ai, showNotification, onClaimReward }: { gameState: GameState, setGameState: (updater: (gs: GameState) => GameState) => void, ai: GoogleGenAI | null, showNotification: (msg: string, type?: 'success' | 'error') => void, onClaimReward: (mission: Mission) => void }) => {
    const [isLoading, setIsLoading] = useState(false);

    const fetchMissions = useCallback(async () => {
        if (!ai) {
            showNotification("AI Service not available", "error");
            return;
        }
        setIsLoading(true);
        try {
            const prompt = `Create a list of 3 unique, engaging daily missions for a futuristic sci-fi crypto mining game called 'Quantum Core'. The player mines a currency called QC. Mission types must be one of: 'taps' (tapping the core), 'claims' (claiming mined QC), or 'upgrades' (upgrading mining components). Provide a creative mission title, a short compelling description, a numeric target appropriate for a daily goal, and a QC reward between 1000 and 5000. Ensure the response is a valid JSON object matching the schema.`;
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            missions: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        id: { type: Type.STRING },
                                        title: { type: Type.STRING },
                                        description: { type: Type.STRING },
                                        target: { type: Type.NUMBER },
                                        type: { type: Type.STRING, enum: ['taps', 'claims', 'upgrades'] },
                                        reward: { type: Type.NUMBER },
                                    }
                                }
                            }
                        }
                    }
                }
            });

            const jsonResponse = JSON.parse(response.text);
            const missionsWithIds = jsonResponse.missions.map((m: Omit<Mission, 'id'>) => ({ ...m, id: `mission_${Date.now()}_${Math.random()}` }));
            setGameState(prev => ({ ...prev, missions: { ...prev.missions, daily: missionsWithIds }, lastMissionFetch: Date.now() }));

        } catch (error) {
            console.error("Failed to fetch missions:", error);
            showNotification("Could not fetch new missions.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [ai, setGameState, showNotification]);

    useEffect(() => {
        const now = new Date();
        const lastFetch = new Date(gameState.lastMissionFetch);
        if (now.toDateString() !== lastFetch.toDateString()) {
            fetchMissions();
        }
    }, [fetchMissions, gameState.lastMissionFetch]);
    
    const getProgress = (mission: Mission) => {
        let current = 0;
        if(mission.type === 'taps') current = gameState.totalTaps;
        if(mission.type === 'claims') current = gameState.totalClaims;
        if(mission.type === 'upgrades') current = gameState.totalUpgrades;
        return Math.min(current / mission.target, 1);
    }

    return (
        <div style={styles.screen}>
            <h2 style={styles.screenTitle}>MISSION CONTROL</h2>
            <Card style={{flexDirection: 'column', gap: 10, marginBottom: 20}}>
                <p style={styles.itemName}>Complete daily directives for QC rewards.</p>
                <p style={styles.itemDesc}>New missions are generated every 24 hours.</p>
                {isLoading && <p style={styles.itemName}>Generating new missions from the Aether...</p>}
            </Card>
            <div style={styles.list}>
                {gameState.missions.daily.length > 0 ? gameState.missions.daily.map(mission => {
                    const progress = getProgress(mission);
                    const isComplete = progress >= 1;
                    return (
                        <Card key={mission.id} style={{flexDirection: 'column', alignItems: 'flex-start', gap: 10}}>
                             <p style={styles.itemName}>{mission.title}</p>
                             <p style={styles.itemDesc}>{mission.description}</p>
                             <div style={{width: '100%'}}>
                                 <p style={styles.itemDesc}>{mission.type === 'taps' ? gameState.totalTaps : mission.type === 'claims' ? gameState.totalClaims : gameState.totalUpgrades} / {mission.target}</p>
                                 <div style={styles.progressBarBackground}><div style={{...styles.progressBarFill, width: `${progress * 100}%`}}></div></div>
                             </div>
                             {isComplete ? <button style={styles.actionButton} onClick={() => onClaimReward(mission)}>Claim {formatNumber(mission.reward, 0)} QC</button> : <button style={{...styles.actionButton, ...styles.actionButtonDisabled}}>Reward: {formatNumber(mission.reward, 0)} QC</button>}
                        </Card>
                    )
                }) : !isLoading && <p style={styles.itemDesc}>No daily missions available. Check back tomorrow.</p>}
            </div>
        </div>
    );
};

const Leaderboard = () => {
  const mockData = useMemo(() => (
    [
      { rank: 1, name: 'ZeusMiner', score: 98_450_123 },
      { rank: 2, name: 'CryptoKing', score: 85_123_456 },
      { rank: 3, name: 'QuantumLeap', score: 76_543_210 },
      { rank: 4, name: 'SatoshiJr', score: 68_910_111 },
      { rank: 5, name: 'Your Rank', score: 12345, isUser: true },
      { rank: 6, name: 'MegaMiner', score: 50_321_654 },
    ].sort((a, b) => a.rank - b.rank)
  ), []);
  return (
    <div style={styles.list}>
        {mockData.map(player => (
            <Card key={player.rank} style={player.isUser ? styles.leaderboardUser : {}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 15}}>
                  <span style={styles.leaderboardRank}>{player.rank}</span>
                  <p style={styles.itemName}>{player.name}</p>
                </div>
                <div style={{display: 'flex', alignItems: 'center'}}><CurrencyIcon currency="QC" /> <p style={styles.itemName}>{formatNumber(player.score, 0)}</p></div>
            </Card>
        ))}
    </div>
  )
}

const FriendsScreen = ({ friends, onInvite, bonus, totalMined }: { friends: {id: number, name: string}[], onInvite: () => void, bonus: number, totalMined: number }) => {
    const [friendTab, setFriendTab] = useState<'squad' | 'leaderboard'>('squad');
    const friendBonusAmp = useMemo(() => (bonus - 1) / (friends.length * FRIEND_BONUS_PERCENT) > 1.5, [bonus, friends]);
    
    return (
    <div style={styles.screen}>
        <h2 style={styles.screenTitle}>FRIENDS</h2>
        <Card style={{flexDirection: 'column', gap: 10}}>
             <p style={styles.itemName}>Amplify your mining rate by inviting friends.</p>
             <p style={styles.itemDesc}>You get a permanent {FRIEND_BONUS_PERCENT * 100}% mining bonus for each invite. {friendBonusAmp && <strong>(Amplified!)</strong>}</p>
             <p style={styles.statValue}>Current Bonus: +{((bonus - 1) * 100).toFixed(0)}%</p>
             <button style={styles.actionButton} onClick={onInvite}>Invite a Friend</button>
        </Card>
        <div style={styles.tabContainer}>
          <button style={{...styles.tabButton, ...(friendTab === 'squad' ? styles.tabButtonActive : {})}} onClick={() => setFriendTab('squad')}>Squad ({friends.length})</button>
          <button style={{...styles.tabButton, ...(friendTab === 'leaderboard' ? styles.tabButtonActive : {})}} onClick={() => setFriendTab('leaderboard')}>Leaderboard</button>
        </div>
        {friendTab === 'squad' && <div style={styles.list}>{friends.length > 0 ? friends.map(friend => <Card key={friend.id}><p style={styles.itemName}>{friend.name}</p></Card>) : <p style={styles.itemDesc}>Invite your first friend to start your squad.</p>}</div>}
        {friendTab === 'leaderboard' && <Leaderboard />}
    </div>
)};

const StatRow = ({ label, value, isLast = false }: { label: string; value: React.ReactNode; isLast?: boolean; }) => (
    <div style={{ ...styles.statRow, ...(isLast ? { borderBottom: 'none' } : {}) }}>
        <p style={styles.statRowLabel}>{label}</p>
        <div style={styles.statRowValue}>{value}</div>
    </div>
);

const TransactionHistory = ({ transactions }: { transactions: Transaction[] }) => {
    return (
        <div style={{...styles.list, maxHeight: '400px', overflowY: 'auto', paddingRight: '10px'}}>
            {transactions.length > 0 ? (
                transactions.map(tx => (
                    <Card key={tx.id} style={{flexDirection: 'column', alignItems: 'stretch', gap: 5}}>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}>
                            <p style={styles.itemName}>{tx.type}: {tx.description}</p>
                            <p style={{...styles.itemName, color: tx.amount.startsWith('+') ? 'var(--accent-color)' : 'var(--text-color)'}}>{tx.amount}</p>
                        </div>
                        <p style={{...styles.itemDesc, textAlign: 'right'}}>{new Date(tx.timestamp).toLocaleString()}</p>
                    </Card>
                ))
            ) : (
                <p style={styles.itemDesc}>No transactions logged.</p>
            )}
        </div>
    );
};

const ProfileScreen = ({ user, gameState, onWalletConnect, miningRate, friendsBonus, storageCapacitySeconds, halvingMultiplier }: { user: User, gameState: GameState; onWalletConnect: () => void; miningRate: number; friendsBonus: number; storageCapacitySeconds: number, halvingMultiplier: number; }) => {
    const [profileTab, setProfileTab] = useState<'stats' | 'history'>('stats');
    const unlockedCount = gameState.unlockedAchievements.length;
    const totalAchievements = Object.keys(ACHIEVEMENTS_CONFIG).length;
    const currentLeague = useMemo(() => LEAGUES_CONFIG.slice().reverse().find(l => gameState.totalMined >= l.minMined)?.name || 'Bronze', [gameState.totalMined]);

    const activeBoost = useMemo(() => {
        if (!gameState.activeBoost || gameState.activeBoost.expires < Date.now()) return "None";
        return `x${gameState.activeBoost.multiplier} for ${formatTime((gameState.activeBoost.expires - Date.now()) / 1000)}`;
    }, [gameState.activeBoost]);

    const halvingStage = useMemo(() => {
        const stage = HALVING_THRESHOLDS.slice().reverse().find(h => h.multiplier === halvingMultiplier)?.stage;
        return stage ? `Stage ${stage} (x${halvingMultiplier})` : `Stage 1 (x1.0)`;
    }, [halvingMultiplier]);

    const statsList = [
        { label: "Time Played", value: formatTime(gameState.totalTimePlayedSeconds || 0) },
        { label: "Mining Rate", value: `${formatNumber(miningRate * 3600, 2)} QC/hr` },
        { label: "Storage Capacity", value: `${formatNumber(storageCapacitySeconds * miningRate, 2)} QC` },
        { label: "Total QC Mined", value: formatNumber(gameState.totalMined, 2) },
        { label: "Total Core Taps", value: gameState.totalTaps.toLocaleString() },
        { label: "Missions Completed", value: (gameState.totalMissionsCompleted || 0).toLocaleString() },
        { label: "QC Claims", value: gameState.totalClaims.toLocaleString() },
        { label: "Boosts Activated", value: (gameState.totalBoostsActivated || 0).toLocaleString() },
        { label: "Active Boost", value: activeBoost },
        { label: "Friend Bonus", value: `+${((friendsBonus - 1) * 100).toFixed(0)}%` },
        { label: "Halving Stage", value: halvingStage },
        { label: "TON Spent", value: <><CurrencyIcon currency="TON" /> {formatNumber(gameState.totalTonSpent || 0, 2)}</> },
    ];

    return (
        <div style={styles.screen}>
            <h2 style={styles.screenTitle}>PROFILE</h2>
            <Card style={{ flexDirection: 'column', alignItems: 'center', gap: 15 }}>
                <div style={styles.avatar}></div>
                <h3 style={styles.profileName}>{user.username || `${user.first_name} ${user.last_name}` || 'Quantum Miner'}</h3>
                <div style={styles.profileSummaryStats}>
                    <div>
                        <p style={styles.statLabel}>League</p>
                        <p style={styles.profileSummaryStatValue}>{currentLeague}</p>
                    </div>
                    <div>
                        <p style={styles.statLabel}>Friends</p>
                        <p style={styles.profileSummaryStatValue}>{gameState.friends.length}</p>
                    </div>
                </div>
            </Card>

            <div style={{...styles.tabContainer, marginTop: 30}}>
                <button style={{...styles.tabButton, ...(profileTab === 'stats' ? styles.tabButtonActive : {})}} onClick={() => setProfileTab('stats')}>Statistics</button>
                <button style={{...styles.tabButton, ...(profileTab === 'history' ? styles.tabButtonActive : {})}} onClick={() => setProfileTab('history')}>History</button>
            </div>
            
            {profileTab === 'stats' &&
                <Card style={{ flexDirection: 'column', alignItems: 'stretch', padding: '0px 20px' }}>
                    {statsList.map((stat, index) => (
                        <StatRow 
                            key={stat.label} 
                            label={stat.label} 
                            value={stat.value} 
                            isLast={index === statsList.length - 1} 
                        />
                    ))}
                </Card>
            }
            {profileTab === 'history' && <TransactionHistory transactions={gameState.transactions} />}


            <h3 style={{...styles.screenTitle, fontSize: '1.2rem', marginTop: 30, textAlign: 'left', marginBottom: 15}}>Settings</h3>
            <Card>
                <div style={styles.listItemContent}><p style={styles.itemName}>{gameState.walletAddress ? 'Wallet Connected' : 'Wallet'}</p>{gameState.walletAddress && <p style={{...styles.itemDesc, fontFamily: 'var(--mono-font)'}}>{gameState.walletAddress.substring(0,6)}...{gameState.walletAddress.substring(gameState.walletAddress.length - 4)}</p>}</div>
                <button style={styles.actionButton} onClick={onWalletConnect}>{gameState.walletAddress ? 'Disconnect' : 'Connect'}</button>
            </Card>

            <h3 style={{...styles.screenTitle, fontSize: '1.2rem', marginTop: 30, textAlign: 'left', marginBottom: 15}}>Achievements ({unlockedCount}/{totalAchievements})</h3>
            <div style={styles.achievementsGrid}>
                {(Object.keys(ACHIEVEMENTS_CONFIG) as AchievementID[]).map(id => {
                    const isUnlocked = gameState.unlockedAchievements.includes(id);
                    return (<div key={id} style={{ ...styles.achievementCard, ...(isUnlocked ? styles.achievementCardUnlocked : {}) }}><div style={styles.achievementIcon}>{isUnlocked ? '🏆' : '🔒'}</div><p style={styles.achievementName}>{ACHIEVEMENTS_CONFIG[id].name}</p><p style={styles.achievementDesc}>{ACHIEVEMENTS_CONFIG[id].description}</p></div>)
                })}
            </div>
        </div>
    );
}

const LiveNetworkFeed = () => {
    const [feedItems, setFeedItems] = useState<any[]>([]);
    const actions = ['Mined Block', 'Upgraded Core', 'Claimed QC', 'Activated Boost', 'Invited Friend'];
    const users = ['NovaMiner', '0x_Starlight', 'QuantumLeap', 'Cypher', 'VoidWalker'];

    useEffect(() => {
        const interval = setInterval(() => {
            const newItem = {
                id: Date.now() + Math.random(),
                user: users[Math.floor(Math.random() * users.length)],
                action: actions[Math.floor(Math.random() * actions.length)],
                value: `+${Math.floor(Math.random() * 5000)} QC`
            };
            setFeedItems(prev => [newItem, ...prev.slice(0, 5)]);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <Card style={{ flexDirection: 'column', gap: 10 }}>
            <p style={styles.statLabel}>Live Network Activity</p>
            {feedItems.length === 0 && <p style={styles.itemDesc}>Awaiting network data...</p>}
            {feedItems.map((item) => (
                <div key={item.id} style={styles.liveFeedItem}>
                    <p style={styles.itemDesc}>
                        <span style={{ color: 'var(--primary-color)' }}>{item.user}</span> {item.action}
                    </p>
                </div>
            ))}
        </Card>
    );
};

const GlobalScreen = ({ allUsersState }: { allUsersState: Record<string | number, GameState> }) => {
    const { totalQcMined, totalUsers, totalTonSpent, totalNetworkUpgrades, totalBoostsActivated } = useMemo(() => {
        const users = Object.values(allUsersState);
        const totalQc = users.reduce((sum, user) => sum + user.totalMined, 0);
        return {
            totalQcMined: totalQc,
            totalUsers: users.length,
            totalTonSpent: users.reduce((sum, user) => sum + (user.totalTonSpent || 0), 0),
            totalNetworkUpgrades: users.reduce((sum, user) => sum + (user.totalUpgrades || 0), 0),
            totalBoostsActivated: users.reduce((sum, user) => sum + (user.totalBoostsActivated || 0), 0),
        }
    }, [allUsersState]);

    const [liveStats, setLiveStats] = useState({
        simulatedTotalMined: 11_134_850 + totalQcMined,
        dau: 54321 + totalUsers
    });

    useEffect(() => {
        const interval = setInterval(() => {
            setLiveStats(prev => ({
                simulatedTotalMined: prev.simulatedTotalMined + (Math.random() * 25),
                dau: 54321 + totalUsers + Math.floor(Math.sin(Date.now() / 10000) * 100)
            }));
        }, 2000);
        return () => clearInterval(interval);
    }, [totalUsers]);
    
    return (
        <div style={styles.screen}>
            <h2 style={styles.screenTitle}>GLOBAL NETWORK</h2>
            <div style={styles.list}>
                <Card style={{flexDirection: 'column', alignItems: 'center', gap: '10px'}}>
                    <p style={styles.statLabel}>Total QC Mined by All Miners</p>
                    <div style={{display: 'flex', alignItems: 'center'}}>
                        <QcIcon />
                        <p style={{...styles.profileSummaryStatValue, fontSize: '2rem'}}>{formatNumber(liveStats.simulatedTotalMined, 0)}</p>
                    </div>
                </Card>
                <Card style={{flexDirection: 'column', alignItems: 'center', gap: '10px'}}>
                    <p style={styles.statLabel}>Total Supply</p>
                    <p style={styles.statValue}>{formatNumber(TOTAL_SUPPLY, 0)} QC</p>
                </Card>
                 <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                    <Card style={{flexDirection: 'column', alignItems: 'center', gap: '10px'}}>
                        <p style={styles.statLabel}>Daily Active Users</p>
                        <p style={styles.statValue}>{formatNumber(liveStats.dau, 0)}</p>
                    </Card>
                     <Card style={{flexDirection: 'column', alignItems: 'center', gap: '10px'}}>
                        <p style={styles.statLabel}>TON Spent (Network)</p>
                        <p style={styles.statValue}>{formatNumber(totalTonSpent, 0)}</p>
                    </Card>
                     <Card style={{flexDirection: 'column', alignItems: 'center', gap: '10px'}}>
                        <p style={styles.statLabel}>Network Upgrades</p>
                        <p style={styles.statValue}>{formatNumber(totalNetworkUpgrades, 0)}</p>
                    </Card>
                     <Card style={{flexDirection: 'column', alignItems: 'center', gap: '10px'}}>
                        <p style={styles.statLabel}>Boosts Activated</p>
                        <p style={styles.statValue}>{formatNumber(totalBoostsActivated, 0)}</p>
                    </Card>
                </div>
                 <LiveNetworkFeed />
            </div>
        </div>
    );
};

const ICONS = {
    mine: "M12 3.5c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm4.5-8c0-2.5-2-4.5-4.5-4.5S7.5 9.5 7.5 12s2 4.5 4.5 4.5 4.5-2 4.5-4.5z",
    missions: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
    friends: "M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V18h14v-1.5c0-2.3-4.7-3.5-7-3.5zm8 0c-.3 0-.6 0-1 .1 1.1 1 1.8 2.2 1.8 3.4V18h6v-1.5c0-2.3-4.7-3.5-7-3.5z",
    global: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93s3.05-7.44 7-7.93v15.86zm2-15.86c3.95.49 7 3.85 7 7.93s-3.05 7.44-7 7.93V4.07z",
    profile: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
};
const NavButton = ({ id, activeTab, setActiveTab }: { id: string; activeTab: string, setActiveTab: (tab: string) => void }) => (
     <button style={{ ...styles.navButton, ...(activeTab === id ? styles.navButtonActive : {}) }} onClick={() => setActiveTab(id)}>
        <svg fill="currentColor" width="24" height="24" viewBox="0 0 24 24"><path d={ICONS[id as keyof typeof ICONS]}/></svg>
        <span style={styles.navLabel}>{id.charAt(0).toUpperCase() + id.slice(1)}</span>
    </button>
)
const NavBar = ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (tab: string) => void }) => (
  <nav style={styles.navBar}>
    <NavButton id="mine" activeTab={activeTab} setActiveTab={setActiveTab} />
    <NavButton id="missions" activeTab={activeTab} setActiveTab={setActiveTab} />
    <NavButton id="friends" activeTab={activeTab} setActiveTab={setActiveTab} />
    <NavButton id="global" activeTab={activeTab} setActiveTab={setActiveTab} />
    <NavButton id="profile" activeTab={activeTab} setActiveTab={setActiveTab} />
  </nav>
);

// --- Styles ---

const glassmorphismStyle: React.CSSProperties = { background: 'var(--container-bg)', backdropFilter: 'blur(12px)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' };

const styles: { [key: string]: React.CSSProperties } = {
  glassmorphism: glassmorphismStyle,
  app: { display: 'flex', flexDirection: 'column', height: '100vh', background: 'transparent', color: 'var(--text-color)', textAlign: 'center', position: 'relative', transition: 'all 0.5s ease' },
  appClaiming: { ['--claim-glow-opacity' as any]: 1 },
  vignette: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', boxShadow: 'inset 0 0 15vw rgba(16, 5, 36, 0.8)', mixBlendMode: 'overlay' },
  loadingContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: '1.2rem', fontFamily: 'var(--mono-font)', color: 'var(--accent-color)', textShadow: '0 0 10px var(--accent-color)' },
  mainContent: { flex: 1, display: 'flex', flexDirection: 'column', padding: '0 15px', overflowY: 'auto', zIndex: 2, animation: 'fade-in 0.4s ease' },
  mainContentFading: { opacity: 0, transition: 'opacity 0.2s ease' },
  header: { padding: '15px 15px 10px 15px', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0, zIndex: 10, },
  balanceContainer: { display: 'inline-block', padding: '5px 20px', borderRadius: '20px', position: 'relative', ...glassmorphismStyle },
  balanceWrapper: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
  balance: { fontFamily: 'var(--mono-font)', fontSize: '1.8rem', fontWeight: '700', margin: 0, color: 'var(--text-color)', textShadow: '0 0 8px var(--primary-color)' },
  hashRateDisplay: { fontFamily: 'var(--mono-font)', margin: '-2px 0 5px 0', fontSize: '0.8rem', color: 'var(--accent-color)', textShadow: '0 0 5px var(--accent-color)', opacity: 0.8 },
  
  mineScreen: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', gap: '10px', position: 'relative' },
  mineScreenTop: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0 10px', zIndex: 6 },
  mineScreenBottom: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 10px', gap: '10px' },

  coreContainer: { width: '280px', height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', userSelect: 'none', WebkitTapHighlightColor: 'transparent', cursor: 'pointer', zIndex: 5, animation: 'core-bob 8s infinite ease-in-out' },
  coreBackgroundGlow: { position: 'absolute', width: '180%', height: '180%', background: 'radial-gradient(circle, var(--accent-color) 0%, transparent 65%)', filter: 'blur(30px)', opacity: 0.35, animation: 'pulse 5s infinite ease-in-out' },
  core: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', transition: 'transform 0.1s ease', animation: 'core-rotate 30s linear infinite' },
  coreGlow: { width: '150%', height: '150%', borderRadius: '50%', position: 'absolute', background: 'radial-gradient(circle, var(--core-glow-color) 0%, transparent 60%)', opacity: 0.3, animation: 'pulse 4s infinite ease-in-out', transition: 'background 0.5s ease' },
  coreRefractionLayer: { position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(2px)', opacity: 0.5 },
  coreNucleus: { width: '80%', height: '80%', borderRadius: '50%', position: 'relative', overflow: 'hidden', background: 'radial-gradient(circle, #2a1b4f, var(--bg-color) 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 20px #000' },
  coreParticle: { position: 'absolute', width: '4px', height: '4px', background: 'var(--primary-color)', borderRadius: '50%', boxShadow: '0 0 8px var(--primary-color)', animation: 'core-particle-anim 4s infinite ease-in-out' },
  lightTrail: { position: 'absolute', width: '120%', height: '120%', borderRadius: '50%', border: '2px solid transparent', borderTopColor: 'var(--secondary-color)', borderRightColor: 'var(--secondary-color)', opacity: 0.5, mixBlendMode: 'screen', transition: 'border-color 0.5s ease' },
  
  unclaimedDisplay: { zIndex: 10, position: 'absolute', display: 'flex', flexDirection: 'column', pointerEvents: 'none', textShadow: '0 0 5px #000' },
  unclaimedValue: { fontFamily: 'var(--mono-font)', fontSize: '2.2rem', fontWeight: 'bold', color: 'white' },
  unclaimedLabel: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', marginTop: '-5px' },
  
  aiTerminal: { flex: 1, height: '110px', borderRadius: '10px', ...glassmorphismStyle, padding: '5px 10px', textAlign: 'left', fontFamily: 'var(--mono-font)', fontSize: '0.8rem', overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  terminalHeader: { color: 'var(--primary-color)', textAlign: 'center', paddingBottom: '2px', opacity: 0.7, fontSize: '0.7rem' },
  logLine: { margin: 0, whiteSpace: 'nowrap', animation: 'new-log-line 0.5s ease forwards' },
  
  storageGaugeContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', width: '80px', height: '110px' },
  storageGaugeLabel: { width: '100%', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono-font)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)' },
  storageGauge: { width: '12px', flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid var(--border-color)', position: 'relative', display: 'flex', flexDirection: 'column-reverse' },
  storageGaugeFill: { width: '100%', background: 'var(--accent-color)', boxShadow: '0 0 10px var(--accent-color)', borderRadius: '6px', transition: 'height 0.5s ease' },
  storageGaugeTick: { position: 'absolute', left: '15px', width: '5px', height: '1px', background: 'var(--border-color)' },

  claimButton: { width: '100px', height: '100px', border: 'none', borderRadius: '50%', cursor: 'pointer', background: 'transparent', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  claimButtonRing: { position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '3px solid var(--accent-color)', boxShadow: '0 0 10px var(--accent-color), inset 0 0 10px var(--accent-color)', animation: 'pulse-ring 2s infinite ease-in-out' },
  claimButtonShine: { position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: 'conic-gradient(from 0deg, transparent, white, transparent)', animation: 'rotate 4s linear infinite', opacity: 0.2 },
  claimButtonText: { color: 'white', fontSize: '1.2rem', fontWeight: 'bold', textShadow: '0 0 5px #000' },

  navBar: { display: 'flex', justifyContent: 'space-around', padding: '5px 0', ...glassmorphismStyle, borderTop: '1px solid var(--border-color)', flexShrink: 0, zIndex: 100, borderRadius: '15px 15px 0 0', margin: '0 10px' },
  navButton: { background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5px 10px', transition: 'all 0.2s ease', flex: 1, },
  navButtonActive: { color: 'var(--accent-color)', transform: 'translateY(-2px)', textShadow: '0 0 5px var(--accent-color)' },
  navLabel: { fontSize: '0.7rem', marginTop: '4px' },
  screen: { padding: '0 0 20px 0', overflowY: 'auto' },
  screenTitle: { margin: '0 0 20px 0', fontSize: '1.5rem', fontWeight: 'bold', letterSpacing: '2px', textShadow: '0 0 8px var(--primary-color)', textAlign: 'center' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px', },
  card: { padding: '15px', borderRadius: '12px', textAlign: 'left', ...glassmorphismStyle },
  listItemContent: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  itemName: { margin: 0, fontWeight: '600' },
  itemDesc: { margin: '4px 0 0 0', fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)' },
  actionButton: { backgroundColor: 'var(--primary-color)', color: 'var(--bg-color)', border: 'none', borderRadius: '8px', padding: '10px 15px', fontWeight: 'bold', cursor: 'pointer', transition: 'transform 0.1s, background-color 0.2s', whiteSpace: 'nowrap', marginLeft: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px var(--primary-color)' },
  actionButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', boxShadow: 'none', cursor: 'not-allowed', },
  
  statLabel: { margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' },
  statValue: { margin: '5px 0 0 0', fontSize: '1.2rem', fontWeight: '600', color: 'var(--accent-color)', fontFamily: 'var(--mono-font)' },
  floatingNumber: { position: 'fixed', fontFamily: 'var(--mono-font)', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-color)', textShadow: '0 0 8px white', animation: 'float-up-tumble 1.5s ease-out forwards', pointerEvents: 'none', userSelect: 'none', zIndex: 1000, },
  boostTimer: { fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--secondary-color)', margin: 0, fontFamily: 'var(--mono-font)' },
  tabContainer: { display: 'flex', marginBottom: '20px', borderRadius: '10px', ...glassmorphismStyle, overflow: 'hidden', padding: '4px' },
  tabButton: { flex: 1, padding: '10px', background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.6)', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s ease', borderRadius: '8px' },
  tabButtonActive: { color: 'var(--accent-color)', backgroundColor: 'rgba(51, 255, 196, 0.15)' },
  
  modalBackdrop: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)', animation: 'fade-in 0.3s ease' },
  modalContent: { padding: '25px', borderRadius: '15px', width: '85%', maxWidth: '400px', textAlign: 'center', animation: 'fade-in 0.3s ease' },
  modalTitle: { margin: '0 0 15px 0', fontSize: '1.5rem', color: 'var(--primary-color)', textShadow: '0 0 8px var(--primary-color)' },
  modalText: { margin: '5px 0', color: 'rgba(255, 255, 255, 0.8)', },
  modalItemName: { margin: '10px 0', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-color)' },
  modalActions: { display: 'flex', gap: '10px', marginTop: '25px' },
  cancelButton: { backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', boxShadow: 'none' },
  modalWalletWarning: { color: 'var(--accent-color)', fontSize: '0.9rem', margin: '15px 0 0 0' },
  
  avatar: { width: '80px', height: '80px', backgroundColor: 'var(--primary-color)', border: '3px solid var(--secondary-color)', boxShadow: '0 0 15px var(--primary-color)', clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)', },
  profileName: { margin: 0, fontSize: '1.5rem', fontWeight: '600' },
  profileSummaryStats: { display: 'flex', justifyContent: 'space-around', width: '80%', textAlign: 'center', marginTop: '10px' },
  profileSummaryStatValue: { margin: '5px 0 0 0', fontSize: '1.4rem', fontWeight: '700', color: 'var(--accent-color)', fontFamily: 'var(--mono-font)' },
  achievementsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', },
  achievementCard: { backgroundColor: 'var(--container-bg)', borderRadius: '10px', padding: '15px', textAlign: 'center' as 'center', border: '1px solid var(--border-color)', opacity: 0.6, transition: 'all 0.3s ease', },
  achievementCardUnlocked: { opacity: 1, borderColor: 'var(--primary-color)', ...glassmorphismStyle },
  achievementIcon: { fontSize: '2rem', lineHeight: 1 },
  achievementName: { margin: '10px 0 5px 0', fontWeight: '600', },
  achievementDesc: { margin: 0, fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)', minHeight: '2.4em' },
  
  ownedTag: { color: 'var(--accent-color)', fontWeight: 'bold', fontSize: '0.9rem', margin: 0, textShadow: '0 0 5px var(--accent-color)' },
  leaderboardRank: { fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-color)', width: '25px', textAlign: 'center', fontFamily: 'var(--mono-font)' },
  leaderboardUser: { border: '1px solid var(--accent-color)', boxShadow: '0 0 15px var(--accent-color)' },
  ripple: { position: 'absolute', borderRadius: '50%', border: '2px solid var(--primary-color)', animation: 'ripple-effect 0.6s ease-out forwards', pointerEvents: 'none', zIndex: 1 },
  notification: { position: 'fixed', top: '15px', left: '50%', transform: 'translateX(-50%)', padding: '12px 20px', borderRadius: '8px', ...glassmorphismStyle, color: 'var(--text-color)', fontWeight: 'bold', zIndex: 2000, animation: 'slide-down 0.5s ease-out forwards', },
  notificationError: { border: '1px solid var(--secondary-color)', textShadow: '0 0 5px var(--secondary-color)' },
  particleContainer: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 10, pointerEvents: 'none' },
  claimParticle: { position: 'absolute', width: '6px', height: '6px', background: 'var(--accent-color)', borderRadius: '50%', boxShadow: '0 0 10px var(--accent-color), 0 0 20px var(--accent-color)', animationName: 'claim-particle-anim', animationTimingFunction: 'ease-in-out', animationFillMode: 'forwards' },
  buttonParticleContainer: { position: 'fixed', width: 1, height: 1, zIndex: 2000, pointerEvents: 'none' },
  buttonParticle: { position: 'absolute', background: 'var(--accent-color)', width: '5px', height: '5px', borderRadius: '50%', animation: 'button-particle-burst 0.8s ease-out forwards' },
  currencyIcon: { width: '18px', height: '18px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#1c1c1e', fontWeight: 'bold', fontSize: '0.7rem', marginRight: '5px', verticalAlign: 'middle' },
  dailyRewardGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', margin: '20px 0' },
  dailyRewardItem: { border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 5px', opacity: 0.5 },
  dailyRewardItemCurrent: { opacity: 1, borderColor: 'var(--accent-color)', boxShadow: '0 0 10px var(--accent-color)' },
  dailyRewardItemClaimed: { opacity: 1, backgroundColor: 'rgba(51, 255, 196, 0.15)' },
  dailyRewardDay: { margin: '0 0 5px 0', fontSize: '0.7rem' },
  dailyRewardValue: { margin: 0, fontSize: '0.8rem', fontWeight: 'bold' },
  
  statRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(0, 246, 255, 0.1)' },
  statRowLabel: { margin: 0, color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem' },
  statRowValue: { margin: 0, fontWeight: '600', color: 'var(--text-color)', fontFamily: 'var(--mono-font)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px' },
  signatureBox: { padding: '15px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', margin: '15px 0', textAlign: 'left' },
  signatureText: { margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--mono-font)', wordBreak: 'break-all' },
  progressBarBackground: { width: '100%', height: '6px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-color)', },
  progressBarFill: { height: '100%', backgroundColor: 'var(--accent-color)', borderRadius: '3px', boxShadow: '0 0 8px var(--accent-color)', transition: 'width 0.5s ease',},

  aiAssistant: { width: '60px', height: '60px', position: 'relative' },
  aiAssistantSVG: { width: '100%', height: '100%', overflow: 'visible' },
  aiAssistantPupil: { animation: 'ai-pupil-scan 10s infinite linear' },
  aiAssistantEyelidTop: { animation: 'ai-blink-top 5s infinite ease-in-out' },
  aiAssistantEyelidBottom: { animation: 'ai-blink-bottom 5s infinite ease-in-out' },

  holographicActionButtons: { display: 'flex', flexDirection: 'column', gap: '10px' },
  holographicOverlay: { width: '90%', maxWidth: '500px', height: '70vh', ...glassmorphismStyle, borderRadius: '15px', display: 'flex', flexDirection: 'column', padding: '20px', animation: 'holo-fade-in 0.5s ease', overflow: 'hidden' },
  holoCloseButton: { position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'white', fontSize: '2rem', cursor: 'pointer', zIndex: 10 },
  holographicCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderRadius: '12px', border: 'var(--glass-border)', background: 'var(--container-bg)', position: 'relative', overflow: 'hidden', transition: 'all 0.3s ease' },
  liveFeedItem: { animation: 'new-log-line 0.5s ease', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px', marginBottom: '5px' }
};

const keyframes = `
  .holo-button {
    background: rgba(0, 246, 255, 0.1);
    border: 1px solid var(--border-color);
    color: var(--accent-color);
    padding: 8px 12px;
    border-radius: 8px;
    font-family: var(--mono-font);
    font-size: 0.8rem;
    cursor: pointer;
    text-shadow: 0 0 5px var(--accent-color);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    transition: all 0.2s ease;
  }
  .holo-button:hover {
    background: rgba(0, 246, 255, 0.2);
    box-shadow: 0 0 10px var(--accent-color);
  }
  @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes holo-fade-in { from { opacity: 0; transform: scale(0.95) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  @keyframes pulse { 0%, 100% { transform: scale(0.95); opacity: 0.8; } 50% { transform: scale(1.05); opacity: 1; } }
  @keyframes float-up-tumble { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(-80px) rotate(20deg); opacity: 0; } }
  @keyframes ripple-effect { from { width: 80%; height: 80%; opacity: 1; } to { width: 150%; height: 150%; opacity: 0; } }
  @keyframes slide-down { from { top: -60px; opacity: 0; } to { top: 15px; opacity: 1; } }
  @keyframes shine { 0% { left: -100%; } 100% { left: 150%; } }
  @keyframes button-particle-burst { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(0) translate(var(--tx, 0), var(--ty, 0)); opacity: 0; } }
  
  @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes core-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes core-bob { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
  
  @keyframes core-particle-anim {
    0% { transform: translate(0, 0) scale(1); opacity: 1; }
    50% { transform: translate(calc(cos(var(--angle)) * 60px), calc(sin(var(--angle)) * 60px)) scale(0.5); opacity: 0.5; }
    100% { transform: translate(0, 0) scale(1); opacity: 1; }
  }

  @keyframes trail-1-anim { from { transform: rotate(0deg) scale(1.1); } to { transform: rotate(360deg) scale(1.1); } }
  @keyframes trail-2-anim { from { transform: rotate(45deg) scale(1.2) ; } to { transform: rotate(-315deg) scale(1.2); } }
  @keyframes trail-3-anim { from { transform: rotate(-60deg) scale(1.3); } to { transform: rotate(300deg) scale(1.3); } }

  @keyframes pulse-ring {
    0%, 100% { transform: scale(0.98); opacity: 0.8; }
    50% { transform: scale(1.02); opacity: 1; }
  }

  @keyframes claim-particle-anim {
    0% {
        top: var(--start-y);
        left: var(--start-x);
        transform: scale(1);
        opacity: 1;
    }
    100% {
        top: 50%;
        left: 50%;
        transform: scale(0) rotate(var(--angle));
        opacity: 0;
    }
  }

  @keyframes new-log-line {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
  }
  
  @keyframes ai-pupil-scan {
    0%, 100% { transform-origin: 50% 50%; transform: scale(1); }
    10% { transform: translateX(-10px) scale(1.1); }
    30% { transform: translateX(15px) scale(0.9); }
    50% { transform: translateX(-5px) scale(1); }
    70% { transform: translateX(10px) translateY(-10px) scale(1.1); }
    90% { transform: translateX(0px) translateY(0px) scale(1); }
  }
  
  @keyframes ai-blink-top {
    0%, 90%, 100% { transform: scaleY(1); }
    95% { transform: scaleY(0.1); }
  }
  
  @keyframes ai-blink-bottom {
    0%, 90%, 100% { transform: scaleY(1); }
    95% { transform: scaleY(0.1); }
  }

  /* Rarity Animations */
  .rarity-uncommon { box-shadow: 0 0 12px #007bff, inset 0 0 8px #007bff44; border-color: #007bff; }
  
  .rarity-rare::before {
    content: '';
    position: absolute;
    top: 50%; left: 50%;
    width: 0; height: 0;
    border: 1px solid #9d4edd;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    animation: rarity-ripple 2s infinite;
  }
  @keyframes rarity-ripple {
    from { width: 0; height: 0; opacity: 1; }
    to { width: 200%; height: 400%; opacity: 0; }
  }

  .rarity-legendary { overflow: visible !important; }
  .rarity-legendary::before, .rarity-legendary::after {
    content: '';
    position: absolute;
    width: 4px; height: 4px;
    background: #ffd700;
    border-radius: 50%;
    box-shadow: 0 0 8px #ffd700;
    animation: storm 4s infinite linear;
    opacity: 0;
  }
  .rarity-legendary::after { animation-delay: -2s; }
  @keyframes storm {
    0% { transform: translate(0,0) scale(1); opacity: 0; }
    25% { opacity: 1; }
    50% { transform: translate(80px, -40px) scale(0.5); opacity: 1; }
    75% { opacity: 1; }
    100% { transform: translate(-20px, 50px) scale(1); opacity: 0; }
  }

  .rarity-ultra::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 14px;
    background: conic-gradient(#ff1f1f, transparent, #ff1f1f);
    animation: rotate 5s linear infinite;
    z-index: -1;
  }
`;
const styleSheet = document.createElement("style");
styleSheet.type = 'text/css';
styleSheet.innerText = keyframes;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
